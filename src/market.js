import { json, makeId, readTextBounded } from "./lib.js";

const CONTACT_PATTERNS = [
  /(?:https?:\/\/|www\.|line\.me|lin\.ee|instagram\.com|facebook\.com|threads\.net|telegram|whatsapp)/i,
  /(?:LINE\s*(?:ID|帳號)|加賴|私訊|私聊|面交|匯款|轉帳|站外|私下交易|聯絡方式)/i,
  /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,})/i,
  /(?:0\d{1,2}[-\s]?\d{6,8}|09\d{2}[-\s]?\d{3}[-\s]?\d{3})/,
  /(?:IG|FB)\s*[:：@]\s*[\w.]+/i
];

export function containsOffPlatformContact(value) {
  const text = String(value || "").normalize("NFKC");
  return CONTACT_PATTERNS.some((pattern) => pattern.test(text));
}

export async function requireLineUser(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: json({ error: "line_login_required" }, 401) };
  let response;
  try {
    response = await fetch("https://api.line.me/v2/profile", { headers: { authorization: `Bearer ${token}` } });
  } catch {
    return { error: json({ error: "line_verification_unavailable" }, 503) };
  }
  if (!response.ok) return { error: json({ error: "invalid_line_access_token" }, 401) };
  const profile = JSON.parse(await readTextBounded(response, 50_000));
  if (!/^U[0-9a-f]{32}$/i.test(String(profile.userId || ""))) return { error: json({ error: "invalid_line_profile" }, 401) };
  return { user: { userId: profile.userId, displayName: String(profile.displayName || "CARAT").slice(0, 80), pictureUrl: String(profile.pictureUrl || "").slice(0, 500) } };
}

export async function uploadMarketImage(request, env) {
  if (!env.MARKET_IMAGES || !env.DB) return json({ error: "image_storage_unavailable" }, 503);
  const auth = await requireLineUser(request);
  if (auth.error) return auth.error;
  const recent = await env.DB.prepare("SELECT COUNT(*) count FROM market_uploads WHERE line_user_id=? AND created_at>=datetime('now','-1 day')").bind(auth.user.userId).first();
  if (Number(recent?.count || 0) >= 20) return json({ error: "daily_upload_limit_reached" }, 429);
  const contentType = String(request.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(contentType)) return json({ error: "unsupported_image_type" }, 415);
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > 5_000_000) return json({ error: "image_too_large" }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 5_000_000) return json({ error: "image_too_large" }, 413);
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[contentType];
  const key = `market/${auth.user.userId}/${makeId()}.${extension}`;
  await env.MARKET_IMAGES.put(key, bytes, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { owner: auth.user.userId } });
  await env.DB.prepare("INSERT INTO market_uploads (object_key,line_user_id,byte_size) VALUES (?,?,?)").bind(key, auth.user.userId, bytes.byteLength).run();
  return json({ key, url: `/market/image/${encodeURIComponent(key)}` }, 201);
}

function cleanField(value, max) {
  return String(value || "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function createMarketListing(request, env) {
  if (!env.DB) return json({ error: "database_unavailable" }, 503);
  const auth = await requireLineUser(request);
  if (auth.error) return auth.error;
  let input;
  try { input = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const title = cleanField(input.title, 80), description = cleanField(input.description, 1200);
  const category = cleanField(input.category, 30), memberTag = cleanField(input.memberTag, 30);
  const condition = cleanField(input.condition, 20), price = Number(input.priceTwd), quantity = Number(input.quantity || 1);
  const imageKeys = Array.isArray(input.imageKeys) ? [...new Set(input.imageKeys.map(String))].slice(0, 4) : [];
  if (title.length < 3 || description.length < 10) return json({ error: "listing_content_too_short" }, 400);
  if (!new Set(["小卡", "專輯", "官方周邊", "應援物", "其他收藏"]).has(category)) return json({ error: "invalid_category" }, 400);
  if (!new Set(["sealed", "excellent", "good", "used"]).has(condition)) return json({ error: "invalid_condition" }, 400);
  if (!Number.isInteger(price) || price < 1 || price > 999999 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return json({ error: "invalid_price_or_quantity" }, 400);
  if (!imageKeys.length || imageKeys.some((key) => !key.startsWith(`market/${auth.user.userId}/`))) return json({ error: "invalid_images" }, 400);
  if (containsOffPlatformContact(`${title}\n${description}`)) return json({ error: "off_platform_contact_not_allowed", message: "請移除電話、LINE ID、社群帳號、外部連結或私下交易文字。" }, 400);
  const seller = await env.DB.prepare("SELECT status FROM market_sellers WHERE line_user_id=?").bind(auth.user.userId).first();
  if (seller?.status === "suspended") return json({ error: "seller_suspended" }, 403);
  await env.DB.prepare(`INSERT INTO market_sellers (line_user_id,display_name,picture_url) VALUES (?,?,?)
    ON CONFLICT(line_user_id) DO UPDATE SET display_name=excluded.display_name,picture_url=excluded.picture_url,updated_at=CURRENT_TIMESTAMP`)
    .bind(auth.user.userId, auth.user.displayName, auth.user.pictureUrl || null).run();
  const id = makeId();
  await env.DB.prepare(`INSERT INTO market_listings
    (id,seller_line_user_id,title,description,category,member_tag,item_condition,price_twd,quantity,image_keys)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, auth.user.userId, title, description, category, memberTag || null, condition, price, quantity, JSON.stringify(imageKeys)).run();
  return json({ id, status: "pending", message: "商品已送出，審核通過後才會公開。" }, 201);
}

export async function getMarketImage(request, env, key) {
  if (!env.MARKET_IMAGES || !key.startsWith("market/")) return new Response("Not Found", { status: 404 });
  const object = await env.MARKET_IMAGES.get(key);
  if (!object) return new Response("Not Found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function queryMarketListings(env, status = "approved", limit = 60) {
  if (!env.DB) return [];
  const result = await env.DB.prepare(`SELECT l.id,l.title,l.description,l.category,l.member_tag,l.item_condition,l.price_twd,l.quantity,l.image_keys,l.status,l.created_at,s.display_name seller_name
    FROM market_listings l JOIN market_sellers s ON s.line_user_id=l.seller_line_user_id
    WHERE l.status=? ORDER BY l.created_at DESC LIMIT ?`).bind(status, limit).all();
  return (result.results || []).map((row) => ({ ...row, image_keys: (() => { try { return JSON.parse(row.image_keys || "[]"); } catch { return []; } })() }));
}
