export const VIDEO_THEMES = {
  music: { title: "歌曲／MV", subtitle: "官方 MV、歌曲影片與作品影像", color: "#c9578e" },
  stage: { title: "舞台表演", subtitle: "舞台、舞蹈與 Performance 影片", color: "#566fa7" },
  going: { title: "GOING SEVENTEEN", subtitle: "GOING SEVENTEEN 官方綜藝", color: "#7358a6" },
  behind: { title: "幕後／紀錄", subtitle: "幕後花絮、錄音紀錄與成員日常", color: "#487e78" },
  fullmoon: { title: "羅 PD × SEVENTEEN", subtitle: "NANA 系列、出差十五夜與羅 PD 合作綜藝", color: "#e0739a" }
};

export function videoFormat(item = {}) {
  const title = `${item.title_original || ""} ${item.title_zh_tw || ""}`.normalize("NFKC");
  if (/\b(?:TEASER|TRAILER|PREVIEW|HIGHLIGHT\s*MEDLEY|SPOT|PRE[-\s]?RELEASE)\b|預告|前導|搶先看|先行公開|예고|티저|트레일러|미리보기|선공개/i.test(title)) return "preview";
  if (/\/shorts\//i.test(String(item.canonical_url || "")) || /#shorts\b|꼬잉_픽|精彩片段|精華剪輯|하이라이트|HIGHLIGHTS?/i.test(title)) return "clip";
  return "main";
}

function contentKey(item) {
  try {
    const url = new URL(item.canonical_url);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be" || host === "youtube.com" || host === "m.youtube.com") {
      const id = host === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || url.pathname.match(/\/(?:shorts|embed)\/([^/]+)/)?.[1];
      if (id) return `youtube:${id}`;
    }
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|si$)/i.test(key)) url.searchParams.delete(key);
    url.hash = "";
    return url.toString();
  } catch { return item.id || ""; }
}

export function selectPublicContent(items = [], format = "main") {
  const seenUrls = new Set(), seenTitles = new Set();
  return items.filter((item) => {
    const isVideo = item.category === "video" || /(?:youtube\.com|youtu\.be)/i.test(String(item.canonical_url || ""));
    if (isVideo && format !== "all" && videoFormat(item) !== format) return false;
    const key = contentKey(item);
    // Only collapse identical titles from the same source. Episode and part numbers remain significant.
    const title = String(item.title_original || item.title_zh_tw || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    const titleKey = `${item.source_id || ""}:${item.category || ""}:${title}`;
    if ((key && seenUrls.has(key)) || (title && seenTitles.has(titleKey))) return false;
    if (key) seenUrls.add(key);
    if (title) seenTitles.add(titleKey);
    return true;
  });
}

export function classifyVideoTheme(item = {}) {
  const text = `${item.title_zh_tw || ""} ${item.title_original || ""}`;
  const url = String(item.canonical_url || "");
  if (item.source_id === "youtube-fullmoon") return "fullmoon";
  if (videoFormat(item) !== "main") return "behind";
  if (/GOING\s*SEVENTEEN|GOING_SVT|고잉\s*세븐틴|꼬잉_픽/i.test(text)) return "going";
  if (/INSIDE\s*SEVENTEEN|BEHIND|SKETCH|RECORDING|MAKING|花絮|幕後/i.test(text)) return "behind";
  if (/DANCE\s*PRACTICE|舞蹈影片|PERFORMANCE|REHEARSAL|STAGE|LIVE\s*CLIP|CHOREOGRAPHY|MOVING\s*VER/i.test(text)) return "stage";
  if (/OFFICIAL\s*(?:M\/V|MV)|MUSIC\s*VIDEO|LYRIC\s*VIDEO|OFFICIAL\s*AUDIO|TRACK\s*VIDEO|SPECIAL\s*VIDEO|VERTICAL\s*VIDEO|\s-\s['\u2018\u2019\u201c\u201d]/i.test(text)) return "music";
  if (/\/shorts\//i.test(url) || /SHORTS?|BEHIND|SKETCH|PREVIEW|TEASER|RECORDING|MAKING|花絮|幕後/i.test(text)) return "behind";
  return "behind";
}

export function videoYear(item = {}) {
  const raw = String(item.published_at || item.fetched_at || "");
  const match = raw.match(/^(19|20)\d{2}/);
  return match ? match[0] : "未標年份";
}

export function groupVideosByYear(items = [], theme = "") {
  const filtered = theme ? items.filter((item) => classifyVideoTheme(item) === theme) : items;
  return filtered.reduce((groups, item) => {
    const year = videoYear(item);
    (groups[year] ||= []).push(item);
    return groups;
  }, {});
}
