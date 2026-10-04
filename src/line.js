import { readTextBounded } from "./lib.js";
import { classifyVideoTheme, selectPublicContent, VIDEO_THEMES } from "./video-library.js";

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function verifyLineSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", key, fromBase64(signature), new TextEncoder().encode(rawBody));
  } catch { return false; }
}

const keywordRoutes = [
  { test: /最新|情報|消息|新聞/, text: "最新 SEVENTEEN 情報", path: "/news" },
  { test: /影片|youtube|mv|going/i, text: "最新官方影片", path: "/videos" },
  { test: /演唱會|售票|行程|活動/, text: "活動與售票行事曆", path: "/calendar" },
  { test: /應援|投票/, text: "CARAT 應援專區", path: "/projects" },
  { test: /市集|商城|收藏品|交易/, text: "CARAT 收藏市集", path: "/market" },
  { test: /分享|好友/, text: "分享給 CARAT 好友", path: "/share" }
];

async function queryGrounding(db, text) {
  if (!db) return [];
  const term = `%${text.slice(0, 30).replace(/[%_]/g, "")}%`;
  const result = await db.prepare(`SELECT title_zh_tw,summary_zh_tw,canonical_url,published_at FROM news_items
    WHERE status='approved' AND (title_zh_tw LIKE ? OR summary_zh_tw LIKE ?) ORDER BY published_at DESC LIMIT 5`).bind(term, term).all();
  if (result.results?.length) return result.results;
  return (await db.prepare("SELECT title_zh_tw,summary_zh_tw,canonical_url,published_at FROM news_items WHERE status='approved' ORDER BY published_at DESC LIMIT 5").all()).results || [];
}

async function aiAnswer(text, rows, env) {
  if (!env.GEMINI_API_KEY || !rows.length) return null;
  const prompt = `你是「SEVENTEEN CARAT 繁中情報站」客服。僅回答 SEVENTEEN、13位成員、官方活動、作品、演唱會、售票、投票與應援相關問題。只能引用提供的已審核資料，不可猜測。若問題超出範圍，禮貌說明本站只提供 SEVENTEEN 情報。回答使用繁體中文，150字內，最後附最相關的一個來源網址。\n問題：${text}\n資料：${JSON.stringify(rows)}`;
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 300 } }) });
  if (!response.ok) return null;
  const body = JSON.parse(await readTextBounded(response, 300_000));
  return body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

export async function buildReply(text, env) {
  const normalized = String(text || "").trim();
  const route = keywordRoutes.find((entry) => entry.test.test(normalized));
  const base = (env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (route) return `${route.text}\n${base}${route.path}`;
  if (!/seventeen|svt|carat|세븐틴|セブンティーン|小十七|次人|崔勝哲|尹淨漢|洪知秀|文俊輝|權順榮|全圓佑|李知勳|徐明浩|金珉奎|李碩珉|夫勝寬|崔瀚率|李燦|成員|專輯|回歸|歌曲|演唱會|應援|投票|售票|weverse|pledis/i.test(normalized)) {
    return `這裡專門整理 SEVENTEEN、成員、作品、活動與 CARAT 應援資訊，其他主題暫不提供喔。\n想找最新情報可以看：${base}/news`;
  }
  const rows = await queryGrounding(env.DB, normalized);
  return await aiAnswer(normalized, rows, env) || `目前已審核資料中還找不到足夠依據，我不會自行猜測。可以先查看最新情報，或稍後再問：\n${base}/news`;
}

const videoKeyword = /^(最新影片|影片|youtube|mv|going)$/i;

const youtubeId = (value) => {
  try {
    const url = new URL(String(value || ""));
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1] || "";
  } catch {}
  return "";
};

const FLEX_FALLBACK_IMAGES = {
  music: "https://i.ytimg.com/vi/1biFgI-pC3U/hqdefault.jpg",
  stage: "https://i.ytimg.com/vi/03QqmKNX5Uw/hqdefault.jpg",
  going: "https://i.ytimg.com/vi/5rNSal9lUPI/hqdefault.jpg",
  behind: "https://i.ytimg.com/vi/g98veDN9sHQ/hqdefault.jpg",
  fullmoon: "https://i.ytimg.com/vi/eov9udX0PO4/hqdefault.jpg"
};

async function queryVideos(db) {
  if (!db) return [];
  const rows = (await db.prepare("SELECT source_id,title_zh_tw,title_original,summary_zh_tw,canonical_url,image_url,published_at,fetched_at FROM news_items WHERE status='approved' AND category='video' ORDER BY COALESCE(published_at,fetched_at) DESC LIMIT 5000").all()).results || [];
  return selectPublicContent(rows);
}

export function buildVideoCarousel(items = [], env = {}) {
  items = selectPublicContent(items);
  const liffBase = env.LIFF_ID ? `https://liff.line.me/${encodeURIComponent(env.LIFF_ID)}` : String(env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const bubbles = Object.entries(VIDEO_THEMES).map(([key, theme]) => {
    const videos = items.filter((item) => classifyVideoTheme(item) === key);
    const lead = videos[0] || {};
    const id = youtubeId(lead.canonical_url);
    const image = lead.image_url || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : FLEX_FALLBACK_IMAGES[key]);
    return {
      type: "bubble",
      size: "kilo",
      hero: { type: "image", url: image, size: "full", aspectRatio: "16:9", aspectMode: "cover", action: { type: "uri", uri: `${liffBase}/videos?theme=${key}` } },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "text", text: theme.title, weight: "bold", size: "xl", color: "#262442", wrap: true },
        { type: "text", text: theme.subtitle, size: "sm", color: "#68657b", wrap: true },
        { type: "text", text: "歷年官方影片完整整理", size: "xs", color: theme.color, weight: "bold", margin: "md" }
      ] },
      footer: { type: "box", layout: "vertical", contents: [{ type: "button", style: "primary", color: theme.color, action: { type: "uri", label: "依年份開啟", uri: `${liffBase}/videos?theme=${key}` } }] }
    };
  });
  return { type: "flex", altText: "SEVENTEEN 最新影片五大主題", contents: { type: "carousel", contents: bubbles } };
}

async function replyMessage(replyToken, message, token) {
  const messages = [typeof message === "string" ? { type: "text", text: message } : message];
  const response = await fetch("https://api.line.me/v2/bot/message/reply", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ replyToken, messages }) });
  if (!response.ok) throw new Error(`LINE reply HTTP ${response.status}`);
}

export async function handleWebhook(request, env, ctx) {
  const raw = await request.text();
  if (!await verifyLineSignature(raw, request.headers.get("x-line-signature"), env.LINE_CHANNEL_SECRET)) return new Response("invalid signature", { status: 401 });
  const payload = JSON.parse(raw);
  for (const event of payload.events || []) {
    if (event.type === "message" && event.message?.type === "text" && event.replyToken) {
      const normalized = String(event.message.text || "").trim();
      const answer = videoKeyword.test(normalized) ? buildVideoCarousel(await queryVideos(env.DB), env) : await buildReply(normalized, env);
      await replyMessage(event.replyToken, answer, env.LINE_CHANNEL_ACCESS_TOKEN);
      if (env.DB && event.source?.userId) ctx.waitUntil(env.DB.prepare("INSERT OR IGNORE INTO subscribers (line_user_id) VALUES (?)").bind(event.source.userId).run());
    }
  }
  return new Response("OK");
}
