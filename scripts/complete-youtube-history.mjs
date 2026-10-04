import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const input = path.join(root, "dist", "youtube-history-scan.json");
const output = path.join(root, "dist", "youtube-history-complete.json");
const source = JSON.parse(fs.readFileSync(input, "utf8"));
const instances = await (await fetch("https://api.invidious.io/instances.json?sort_by=health")).json();
const host = instances.find(([name, details]) => details?.api === true && details?.type === "https")?.[0];
if (!host) throw new Error("No healthy Invidious metadata API is available");
const base = `https://${host}`;
const channelId = source.channelId;
const metadata = new Map();
let continuation = "", page = 0;

do {
  const query = new URLSearchParams({ sort_by: "newest" });
  if (continuation) query.set("continuation", continuation);
  const response = await fetch(`${base}/api/v1/channels/${encodeURIComponent(channelId)}/videos?${query}`);
  if (!response.ok) throw new Error(`Invidious channel API HTTP ${response.status}`);
  const payload = await response.json();
  for (const video of payload.videos || []) {
    if (!video.videoId || !video.published) continue;
    metadata.set(video.videoId, {
      publishedAt: new Date(video.published * 1000).toISOString(),
      title: video.title || ""
    });
  }
  continuation = payload.continuation || "";
  page += 1;
  console.log(JSON.stringify({ page, metadata: metadata.size, hasMore: Boolean(continuation) }));
  if (page >= 120) throw new Error("Invidious pagination exceeded safety limit");
} while (continuation);

const items = source.items.map((item) => {
  const extra = metadata.get(item.videoId);
  return { ...item, title: item.title || extra?.title || "", publishedAt: item.publishedAt || extra?.publishedAt || "" };
});
const missing = items.filter((item) => !item.publishedAt);
const years = Object.fromEntries(Object.entries(items.reduce((map, item) => { const year = item.publishedAt?.slice(0,4) || "unknown"; map[year] = (map[year] || 0) + 1; return map; }, {})).sort((a,b)=>b[0].localeCompare(a[0])));
fs.writeFileSync(output, JSON.stringify({ ...source, completedAt: new Date().toISOString(), metadataApi: base, items }, null, 2));
console.log(JSON.stringify({ output, videos: items.length, metadataVideos: metadata.size, missing: missing.length, years }));
