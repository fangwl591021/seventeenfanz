import { canonicalizeUrl, cleanText, makeId, normalizeTitle, readTextBounded, sha256 } from "./lib.js";

export const SOURCE_REGISTRY = [
  { id: "pledis-notice", name: "PLEDIS 官方公告", url: "https://www.pledis.co.kr/artist/detail/seventeen/notice/", kind: "html", parser: "empty", category: "official", trustTier: 1 },
  { id: "weverse-notice", name: "Weverse 官方公告", url: "https://weverse.io/seventeen/notice/", kind: "html", parser: "empty", category: "official", trustTier: 1 },
  { id: "weverse-media", name: "Weverse 官方影音", url: "https://weverse.io/seventeen/media", kind: "html", parser: "empty", category: "video", trustTier: 1 },
  { id: "svt-japan", name: "SEVENTEEN 日本官網新聞", url: "https://www.seventeen-17.jp/posts/information", kind: "html", parser: "japan-news", category: "official", trustTier: 1, autoApprove: true },
  { id: "svt-japan-schedule", name: "SEVENTEEN 日本官網行程", url: "https://www.seventeen-17.jp/posts/schedule", kind: "html", parser: "japan-schedule", category: "concert", trustTier: 1, autoApprove: true },
  { id: "svt-japan-discography", name: "SEVENTEEN 日本官網作品", url: "https://www.seventeen-17.jp/posts/discography", kind: "html", parser: "japan-discography", category: "release", trustTier: 1, autoApprove: true },
  { id: "svt-japan-cheer", name: "SEVENTEEN 日本官網應援方法", url: "https://www.seventeen-17.jp/posts/call", kind: "html", parser: "japan-call", category: "support", trustTier: 1, autoApprove: true },
  { id: "youtube-official", name: "SEVENTEEN 官方 YouTube", kind: "youtube", category: "video", trustTier: 1, autoApprove: true }
];

const MEMBER_ALIASES = {
  "S.COUPS": /S\.?COUPS|에스쿱스|エスクプス|崔勝哲|勝哲/iu,
  "JEONGHAN": /JEONGHAN|정한|ジョンハン|尹淨漢|淨漢/iu,
  "JOSHUA": /JOSHUA|조슈아|ジョシュア|洪知秀|知秀/iu,
  "JUN": /\bJUN\b|준|ジュン|文俊輝|俊輝/iu,
  "HOSHI": /HOSHI|호시|ホシ|權順榮|順榮/iu,
  "WONWOO": /WONWOO|원우|ウォヌ|全圓佑|圓佑/iu,
  "WOOZI": /WOOZI|우지|ウジ|李知勳|知勳/iu,
  "THE 8": /THE\s*8|디에잇|ディエイト|徐明浩|明浩/iu,
  "MINGYU": /MINGYU|MIN9YU|민규|ミンギュ|金珉奎|珉奎/iu,
  "DK": /\bDK\b|도겸|ドギョム|李碩珉|碩珉/iu,
  "SEUNGKWAN": /SEUNGKWAN|승관|スングァン|夫勝寬|勝寬/iu,
  "VERNON": /VERNON|버논|バーノン|崔瀚率|瀚率/iu,
  "DINO": /DINO|디노|ディノ|李燦|李灿/iu
};

export function extractMemberTags(value) {
  return Object.entries(MEMBER_ALIASES).filter(([, pattern]) => pattern.test(String(value || ""))).map(([name]) => name);
}

const attr = (tag, name) => tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1] || "";
const xmlValue = (xml, tag) => cleanText(xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");

export function parseYouTubeFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const entry = match[1];
    const videoId = xmlValue(entry, "yt:videoId");
    const title = xmlValue(entry, "title");
    const linkTag = entry.match(/<link\s[^>]*rel=["']alternate["'][^>]*>/i)?.[0] || "";
    return {
      sourceItemId: videoId,
      url: attr(linkTag, "href") || `https://www.youtube.com/watch?v=${videoId}`,
      title,
      summary: xmlValue(entry, "media:description"),
      publishedAt: xmlValue(entry, "published"),
      imageUrl: entry.match(/<media:thumbnail[^>]+url=["']([^"']+)/i)?.[1] || "",
      category: "video"
    };
  }).filter((item) => item.sourceItemId && item.title);
}

const absoluteJapanUrl = (path) => new URL(path, "https://www.seventeen-17.jp").toString();

function isoDate(value, fallbackYear = new Date().getUTCFullYear()) {
  const parts = String(value || "").match(/(?:(\d{4})[.\/-])?(\d{1,2})[.\/-](\d{1,2})/);
  if (!parts) return null;
  return `${parts[1] || fallbackYear}-${String(parts[2]).padStart(2,"0")}-${String(parts[3]).padStart(2,"0")}T00:00:00+09:00`;
}

const japanCategory = (value) => {
  const category = cleanText(value).toUpperCase();
  if (category.includes("RELEASE") || category.includes("CD-") || category.includes("DVD") || category.includes("DIGITAL") || category === "VOD") return "release";
  if (category.includes("LIVE") || category.includes("EVENT")) return "concert";
  if (category.includes("CARAT") || category.includes("応援")) return "support";
  if (category.includes("TV") || category.includes("WEB")) return "video";
  return "official";
};

export function parseJapanNews(html) {
  return [...html.matchAll(/<dl\s+onClick="location\.href='([^']+)'">([\s\S]*?)<\/dl>/gi)].map((match) => {
    const block = match[2];
    const date = block.match(/<dt>\s*([\d.]+)/i)?.[1] || "";
    const sourceCategory = cleanText(block.match(/<span[^>]*class="category[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "OTHER");
    const title = cleanText(block.match(/<dd>([\s\S]*?)(?:<!---->|<\/dd>)/i)?.[1] || "");
    return { url: absoluteJapanUrl(match[1]), title, summary: `${sourceCategory}｜SEVENTEEN 日本官方網站公告`, category: japanCategory(sourceCategory), publishedAt: isoDate(date), imageUrl: "" };
  }).filter((item) => item.title).slice(0, 30);
}

export function parseJapanDiscography(html) {
  return [...html.matchAll(/<dl\s+onClick="location\.href='([^']+)'">([\s\S]*?)<\/dl>/gi)].map((match) => {
    const block = match[2];
    const meta = cleanText(block.match(/<div class="dc">([\s\S]*?)<\/div>/i)?.[1] || "");
    const date = meta.match(/\d{4}\.\d{1,2}\.\d{1,2}/)?.[0] || "";
    const kind = meta.split("|").slice(1).join("|").trim();
    return { url: absoluteJapanUrl(match[1]), title: cleanText(block.match(/<div class="title">([\s\S]*?)<\/div>/i)?.[1] || ""), summary: `${kind || "作品"}｜日本官方作品資料`, category: "release", publishedAt: isoDate(date), imageUrl: block.match(/<img[^>]+src="([^"]+)/i)?.[1] || "" };
  }).filter((item) => item.title).slice(0, 25);
}

export function parseJapanCall(html) {
  return [...html.matchAll(/<dl>([\s\S]*?)<\/dl>/gi)].map((match) => {
    const block = match[1];
    const path = block.match(/href="(\/posts\/call\/[^"]+)"/i)?.[1];
    const song = cleanText(block.match(/<div class="title">([\s\S]*?)<\/div>/i)?.[1] || "");
    return { url: path ? absoluteJapanUrl(path) : "", title: song ? `應援方法｜${song}` : "", summary: "SEVENTEEN 日本官方應援方法與應援口號", category: "support", publishedAt: null, imageUrl: block.match(/<img[^>]+src="([^"]+)/i)?.[1] || "" };
  }).filter((item) => item.url && item.title).slice(0, 25);
}

export function parseJapanSchedule(html) {
  const year = Number(html.match(/<h4[^>]*class="title[^"]*"[^>]*>\s*(\d{4})\.\d{1,2}/i)?.[1] || new Date().getUTCFullYear());
  return [...html.matchAll(/schedule-list-item[\s\S]*?schedule-date[^>]*>\s*([\d.]+)[\s\S]*?href="(\/posts\/schedule\/[^"]+)"[^>]*class="schedule-title-link"[\s\S]*?schedule-title-text[^>]*>\s*([\s\S]*?)<\/span>[\s\S]*?schedule-category-label[^>]*>\s*([\s\S]*?)<\/span>[\s\S]*?<\/div>\s*<\/div>/gi)].map((match) => ({
    url: absoluteJapanUrl(match[2]), title: cleanText(match[3]), summary: `${cleanText(match[4])}｜SEVENTEEN 日本官方行程`, category: japanCategory(match[4]), publishedAt: isoDate(match[1], year), imageUrl: ""
  })).filter((item) => item.title).slice(0, 30);
}

function parseOfficialHtml(html, source) {
  if (source.parser === "japan-news") return parseJapanNews(html);
  if (source.parser === "japan-schedule") return parseJapanSchedule(html);
  if (source.parser === "japan-discography") return parseJapanDiscography(html);
  if (source.parser === "japan-call") return parseJapanCall(html);
  return [];
}

async function fetchWithTimeout(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const response = await fetch(url, { headers: { "user-agent": "SEVENTEEN-CARAT-Hub/0.1 (+public fan news index)" }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await readTextBounded(response);
  } finally { clearTimeout(timeout); }
}

export async function translateWithGemini(item, env) {
  if (!env.GEMINI_API_KEY) return { title: item.title, summary: item.summary || "", category: item.category };
  const prompt = `你是繁體中文 K-pop 情報編輯。只能根據輸入內容整理，不可增添未提供的日期、售票或活動資訊。輸出單一 JSON 物件，欄位為 title_zh_tw、summary_zh_tw、category。category 只能是 official, video, release, concert, vote, support, news。\n輸入：${JSON.stringify({ title: item.title, summary: item.summary, category: item.category })}`;
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 500 } })
  });
  const responseText = await readTextBounded(response, 300_000);
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${responseText.slice(0,300)}`);
  const payload = JSON.parse(responseText);
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = JSON.parse(text || "{}");
  return {
    title: String(parsed.title_zh_tw || item.title).slice(0, 180),
    summary: String(parsed.summary_zh_tw || item.summary || "").slice(0, 800),
    category: ["official","video","release","concert","vote","support","news"].includes(parsed.category) ? parsed.category : item.category
  };
}

export async function collectSource(source, env) {
  const url = source.kind === "youtube"
    ? `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(env.YOUTUBE_CHANNEL_ID || "UCfkXDY7vwkcJ8ddFGz8KusA")}`
    : source.url;
  const body = await fetchWithTimeout(url);
  const raw = source.kind === "youtube" ? parseYouTubeFeed(body) : parseOfficialHtml(body, source);
  return Promise.all(raw.slice(0, 20).map(async (item) => {
    const canonicalUrl = canonicalizeUrl(item.url);
    const contentHash = await sha256(`${canonicalUrl}|${normalizeTitle(item.title)}`);
    const memberTags = extractMemberTags(`${item.title} ${item.summary || ""}`);
    if (env.DB) {
      const existing = await env.DB.prepare("SELECT id,title_zh_tw,summary_zh_tw,category,status FROM news_items WHERE canonical_url=? LIMIT 1").bind(canonicalUrl).first();
      if (existing) return { id: existing.id, sourceId: source.id, sourceItemId: item.sourceItemId || null, canonicalUrl, contentHash, fingerprint: await sha256(normalizeTitle(existing.title_zh_tw || item.title)), titleOriginal: item.title, titleZhTw: existing.title_zh_tw, summaryZhTw: existing.summary_zh_tw, category: existing.category, publishedAt: item.publishedAt || null, imageUrl: item.imageUrl || null, memberTags, status: existing.status, existing: true };
    }
    const translated = await translateWithGemini(item, env);
    const fingerprint = normalizeTitle(translated.title || item.title);
    return {
      id: makeId(), sourceId: source.id, sourceItemId: item.sourceItemId || null,
      canonicalUrl, contentHash,
      fingerprint: await sha256(fingerprint), titleOriginal: item.title,
      titleZhTw: translated.title, summaryZhTw: translated.summary,
      category: translated.category, publishedAt: item.publishedAt || null,
      imageUrl: item.imageUrl || null, memberTags: extractMemberTags(`${item.title} ${translated.title} ${item.summary || ""}`),
      status: source.autoApprove ? "approved" : "pending", existing: false
    };
  }));
}

async function saveItems(db, items) {
  let inserted = 0, duplicates = 0;
  for (const item of items) {
    const clusterId = `cluster-${item.fingerprint.slice(0, 24)}`;
    await db.prepare("INSERT OR IGNORE INTO news_clusters (id,fingerprint,title_zh_tw,summary_zh_tw,category,primary_item_id) VALUES (?,?,?,?,?,?)")
      .bind(clusterId, item.fingerprint, item.titleZhTw, item.summaryZhTw, item.category, item.id).run();
    const result = await db.prepare(`INSERT OR IGNORE INTO news_items
      (id,source_id,source_item_id,canonical_url,content_hash,title_original,title_zh_tw,summary_zh_tw,category,member_tags,image_url,published_at,cluster_id,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(item.id,item.sourceId,item.sourceItemId,item.canonicalUrl,item.contentHash,item.titleOriginal,item.titleZhTw,item.summaryZhTw,item.category,JSON.stringify(item.memberTags || []),item.imageUrl,item.publishedAt,clusterId,item.status || "pending").run();
    if (result.meta?.changes) inserted += 1;
    else {
      duplicates += 1;
      await db.prepare("UPDATE news_items SET member_tags=?,image_url=COALESCE(?,image_url),published_at=COALESCE(?,published_at) WHERE canonical_url=?").bind(JSON.stringify(item.memberTags || []),item.imageUrl,item.publishedAt,item.canonicalUrl).run();
    }
  }
  return { inserted, duplicates };
}

export async function translateHistoricalVideos(env, limit = 30) {
  if (!env.DB || !env.GEMINI_API_KEY) return { processed: 0, remaining: 0, configured: false };
  const rows = (await env.DB.prepare("SELECT id,title_original,published_at FROM news_items WHERE source_id='youtube-official' AND summary_zh_tw='待中文化' ORDER BY published_at DESC LIMIT ?").bind(Math.max(1, Math.min(Number(limit) || 30, 60))).all()).results || [];
  if (!rows.length) return { processed: 0, remaining: 0, configured: true };
  const prompt = `你是 SEVENTEEN 繁體中文影音資料編輯。將輸入陣列逐筆整理成繁體中文，保留歌曲名、節目名、成員名與專有名詞；韓文或英文的類型描述可翻譯。不可添加輸入沒有的事實。輸出 JSON 陣列，每筆只能有 id、title_zh_tw、summary_zh_tw；summary_zh_tw 以一句繁體中文說明這是官方 YouTube 影片，80字內。必須保留每個 id，順序相同。\n輸入：${JSON.stringify(rows)}`;
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 8192 } })
  });
  const responseText = await readTextBounded(response, 500_000);
  if (!response.ok) throw new Error(`Gemini historical translation HTTP ${response.status}: ${responseText.slice(0,300)}`);
  const payload = JSON.parse(responseText);
  const translated = JSON.parse(payload.candidates?.[0]?.content?.parts?.[0]?.text || "[]");
  const byId = new Map((Array.isArray(translated) ? translated : []).map((item) => [String(item.id || ""), item]));
  const statements = rows.map((row) => {
    const item = byId.get(row.id) || {};
    const title = String(item.title_zh_tw || row.title_original).slice(0,180);
    const summary = String(item.summary_zh_tw || `SEVENTEEN 官方 YouTube 影片，發布於 ${String(row.published_at || "").slice(0,4)} 年。`).slice(0,800);
    return env.DB.prepare("UPDATE news_items SET title_zh_tw=?,summary_zh_tw=? WHERE id=? AND summary_zh_tw='待中文化'").bind(title,summary,row.id);
  });
  await env.DB.batch(statements);
  const remaining = await env.DB.prepare("SELECT COUNT(*) count FROM news_items WHERE source_id='youtube-official' AND summary_zh_tw='待中文化'").first();
  return { processed: rows.length, remaining: Number(remaining?.count || 0), configured: true };
}

export async function collectAll(env) {
  const results = [];
  for (const source of SOURCE_REGISTRY) {
    const startedAt = new Date().toISOString();
    try {
      const items = await collectSource(source, env);
      const saved = env.DB ? await saveItems(env.DB, items) : { inserted: 0, duplicates: 0 };
      results.push({ source: source.id, ok: true, fetched: items.length, ...saved, persisted: Boolean(env.DB) });
      if (env.DB) await env.DB.prepare("UPDATE sources SET last_checked_at=?,last_success_at=?,last_error=NULL WHERE id=?").bind(startedAt, new Date().toISOString(), source.id).run();
    } catch (error) {
      results.push({ source: source.id, ok: false, error: String(error?.message || error) });
      if (env.DB) await env.DB.prepare("UPDATE sources SET last_checked_at=?,last_error=? WHERE id=?").bind(startedAt, String(error?.message || error).slice(0,500), source.id).run();
    }
  }
  try { results.push({ source: "youtube-history-translation", ok: true, ...await translateHistoricalVideos(env, 30) }); }
  catch (error) { results.push({ source: "youtube-history-translation", ok: false, error: String(error?.message || error) }); }
  return results;
}
