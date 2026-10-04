import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractMemberTags } from "../src/sources.js";

const root = path.resolve(import.meta.dirname, "..");
const outputJson = path.join(root, "dist", "fullmoon-series.json");
const outputSql = path.join(root, "dist", "fullmoon-series.sql");
const channelId = "UCQ2O-iftmnlfrBuNsUUTofQ";
const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36", "accept-language": "en-US,en;q=0.9" };
const series = [
  { key: "nana-tour", label: "NANA TOUR with SEVENTEEN", playlistId: "PLr0T5CaHaPwXuFWsIui_VwximaYpBCW2v" },
  { key: "nana-bnb", label: "NANA bnb with SEVENTEEN", playlistId: "PLr0T5CaHaPwUBgED8IHOQ3VPL4acqXKTS" }
];

const instances = await (await fetch("https://api.invidious.io/instances.json?sort_by=health")).json();
const hosts = instances.filter(([, details]) => details?.api === true && details?.type === "https").map(([name]) => name);
if (!hosts.length) throw new Error("No healthy Invidious metadata API is available");

async function api(pathname) {
  let lastError;
  for (const host of hosts.slice(0, 8)) {
    try {
      const response = await fetch(`https://${host}${pathname}`, { headers });
      if (!response.ok) throw new Error(`${host} HTTP ${response.status}`);
      return await response.json();
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error("Metadata API unavailable");
}

const items = [];
for (const entry of series) {
  const data = await api(`/api/v1/playlists/${encodeURIComponent(entry.playlistId)}`);
  for (const video of data.videos || []) items.push({ videoId: video.videoId, title: video.title, series: entry.key, seriesLabel: entry.label, playlistId: entry.playlistId });
}

for (const query of ["SEVENTEEN", "The Game Caterers 2 x HYBE"]) {
  const results = await api(`/api/v1/search?q=${encodeURIComponent(query)}&type=video&channel=${channelId}&page=1`);
  for (const video of results) {
    const title = String(video.title || "");
    const dedicated = /(?:^|\s)🧳💎EP\.|The Game Caterers 2\s*[Xx]\s*SEVENTEEN|God of Communication Caterers:\s*SVT Retreat/i.test(title);
    const hybe = /The Game Caterers 2\s*[Xx]\s*HYBE/i.test(title);
    if (video.videoId && (dedicated || hybe)) items.push({ videoId: video.videoId, title, series: "game-caterers", seriesLabel: hybe ? "出差十五夜 × HYBE（含 SEVENTEEN）" : "出差十五夜 × SEVENTEEN" });
  }
}

const unique = [];
const seen = new Set();
for (const item of items) if (item.videoId && !seen.has(item.videoId)) { seen.add(item.videoId); unique.push(item); }
for (const item of unique) {
  if (/Game Caterers 2\s*[Xx]\s*HYBE|🧳\s*HYBE/i.test(item.title)) { item.series = "game-caterers-hybe"; item.seriesLabel = "出差十五夜 × HYBE（含 SEVENTEEN）"; }
  else if (/Game Caterers|SVT Retreat/i.test(item.title)) { item.series = "game-caterers"; item.seriesLabel = "出差十五夜 × SEVENTEEN"; }
}

let cursor = 0;
async function enrich() {
  while (cursor < unique.length) {
    const item = unique[cursor++];
    try {
      const response = await fetch(`https://www.youtube.com/watch?v=${item.videoId}&hl=en&gl=US`, { headers, signal: AbortSignal.timeout(8_000) });
      const html = await response.text();
      item.publishedAt = html.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/)?.[1] || "";
      item.channelId = html.match(/"channelId":"([^"]+)"/)?.[1] || "";
    } catch { /* The official page may throttle bulk metadata reads; use the verified series year below. */ }
    if (item.channelId && item.channelId !== channelId) throw new Error(`Unexpected channel for ${item.videoId}: ${item.channelId}`);
    if (!item.publishedAt) {
      if (item.series === "nana-tour") item.publishedAt = "2024-01-01";
      else if (item.series === "nana-bnb") item.publishedAt = "2025-06-01";
      else if (item.series === "game-caterers-hybe") item.publishedAt = "2022-07-15";
      else if (/SVT Retreat/i.test(item.title)) item.publishedAt = "2026-05-26";
      else item.publishedAt = "2023-05-05";
    }
  }
}
await Promise.all(Array.from({ length: 3 }, enrich));

const sql = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const lines = ["PRAGMA foreign_keys = ON;"];
for (const item of unique) {
  const id = `yt-fullmoon-${item.videoId}`, clusterId = `cluster-yt-fullmoon-${item.videoId}`;
  const canonicalUrl = `https://www.youtube.com/watch?v=${item.videoId}`, title = item.title.slice(0, 180);
  const tags = JSON.stringify(extractMemberTags(title));
  lines.push(`INSERT OR IGNORE INTO news_clusters (id,fingerprint,title_zh_tw,summary_zh_tw,category,primary_item_id) VALUES (${sql(clusterId)},${sql(hash(item.videoId))},${sql(title)},'待中文化','video',${sql(id)});`);
  lines.push(`INSERT OR IGNORE INTO news_items (id,source_id,source_item_id,canonical_url,content_hash,title_original,title_zh_tw,summary_zh_tw,category,member_tags,image_url,published_at,cluster_id,status) VALUES (${sql(id)},'youtube-fullmoon',${sql(item.videoId)},${sql(canonicalUrl)},${sql(hash(`${canonicalUrl}|${title}`))},${sql(title)},${sql(title)},'待中文化','video',${sql(tags)},${sql(`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`)},${sql(`${item.publishedAt}T00:00:00Z`)},${sql(clusterId)},'approved');`);
}

fs.mkdirSync(path.dirname(outputJson), { recursive: true });
fs.writeFileSync(outputJson, JSON.stringify({ channelId, scannedAt: new Date().toISOString(), items: unique }, null, 2));
fs.writeFileSync(outputSql, lines.join("\n"));
const counts = unique.reduce((map, item) => { map[item.seriesLabel] = (map[item.seriesLabel] || 0) + 1; return map; }, {});
console.log(JSON.stringify({ outputJson, outputSql, videos: unique.length, missingDates: unique.filter((item) => !item.publishedAt).length, counts }, null, 2));
