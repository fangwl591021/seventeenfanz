import fs from "node:fs";
import path from "node:path";

const channelId = process.env.YOUTUBE_CHANNEL_ID || "UCfkXDY7vwkcJ8ddFGz8KusA";
const maxPages = Number(process.env.YOUTUBE_MAX_PAGES || 120);
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist", "youtube-history-scan.json");
const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36", "accept-language": "en-US,en;q=0.9" };

function findFirst(value, key) {
  if (!value || typeof value !== "object") return null;
  if (!Array.isArray(value) && value[key]) return value[key];
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findFirst(child, key);
    if (found) return found;
  }
  return null;
}

function extractItems(contents = []) {
  return contents.flatMap((entry) => {
    const item = entry?.richItemRenderer?.content?.lockupViewModel;
    if (!item?.contentId || item.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return [];
    const metadata = item.metadata?.lockupMetadataViewModel;
    const rows = metadata?.metadata?.contentMetadataViewModel?.metadataRows || [];
    const parts = rows.flatMap((row) => row.metadataParts || []);
    const thumbnails = item.contentImage?.thumbnailViewModel?.image?.sources || [];
    return [{
      videoId: item.contentId,
      title: metadata?.title?.content || "",
      publishedText: parts.at(-1)?.text?.content || "",
      imageUrl: thumbnails.at(-1)?.url || `https://i.ytimg.com/vi/${item.contentId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${item.contentId}`
    }];
  });
}

function continuationFrom(contents = []) {
  return contents.map((entry) => entry?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token).find(Boolean) || "";
}

const pageUrl = `https://www.youtube.com/channel/${encodeURIComponent(channelId)}/videos?hl=en&gl=US`;
const pageResponse = await fetch(pageUrl, { headers });
if (!pageResponse.ok) throw new Error(`YouTube channel page HTTP ${pageResponse.status}`);
const html = await pageResponse.text();
const marker = "var ytInitialData = ";
const start = html.indexOf(marker) + marker.length;
const end = html.indexOf(";</script>", start);
if (start < marker.length || end < 0) throw new Error("YouTube initial data was not found");
const initialData = JSON.parse(html.slice(start, end));
const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
if (!apiKey || !clientVersion) throw new Error("YouTube browse configuration was not found");

const richGrid = findFirst(initialData, "richGridRenderer");
let contents = richGrid?.contents || [];
let continuation = continuationFrom(contents);
const items = extractItems(contents);
const seen = new Set(items.map((item) => item.videoId));

for (let page = 1; continuation && page <= maxPages; page += 1) {
  const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion, hl: "en", gl: "US" } }, continuation })
  });
  if (!response.ok) throw new Error(`YouTube continuation HTTP ${response.status} on page ${page}`);
  const payload = await response.json();
  const append = findFirst(payload, "appendContinuationItemsAction");
  contents = append?.continuationItems || [];
  for (const item of extractItems(contents)) if (!seen.has(item.videoId)) { seen.add(item.videoId); items.push(item); }
  continuation = continuationFrom(contents);
  console.log(JSON.stringify({ page, videos: items.length, hasMore: Boolean(continuation) }));
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ channelId, scannedAt: new Date().toISOString(), complete: !continuation, items }, null, 2));
console.log(JSON.stringify({ output, videos: items.length, complete: !continuation }));
