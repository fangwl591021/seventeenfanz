export const VIDEO_THEMES = {
  music: { title: "歌曲／MV", subtitle: "官方 MV、歌曲影片與作品影像", color: "#c9578e" },
  stage: { title: "舞台表演", subtitle: "舞台、舞蹈與 Performance 影片", color: "#566fa7" },
  going: { title: "GOING SEVENTEEN", subtitle: "GOING SEVENTEEN 官方綜藝", color: "#7358a6" },
  behind: { title: "幕後／短影音", subtitle: "花絮、預告、紀錄與 Shorts", color: "#487e78" }
};

export function classifyVideoTheme(item = {}) {
  const text = `${item.title_zh_tw || ""} ${item.title_original || ""} ${item.summary_zh_tw || ""}`;
  const url = String(item.canonical_url || "");
  if (/GOING\s*SEVENTEEN|GOING_SVT|고잉\s*세븐틴|꼬잉_픽/i.test(text)) return "going";
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
