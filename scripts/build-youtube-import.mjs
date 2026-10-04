import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractMemberTags } from "../src/sources.js";

const root = path.resolve(import.meta.dirname, "..");
const input = path.join(root, "dist", "youtube-history-complete.json");
const outputDir = path.join(root, "dist", "youtube-history-sql");
const data = JSON.parse(fs.readFileSync(input, "utf8"));
const sql = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const chunks = [];

for (let offset = 0; offset < data.items.length; offset += 400) {
  const items = data.items.slice(offset, offset + 400);
  const lines = ["PRAGMA foreign_keys = ON;"];
  for (const item of items) {
    const id = `yt-${item.videoId}`;
    const clusterId = `cluster-yt-${item.videoId}`;
    const canonicalUrl = `https://www.youtube.com/watch?v=${item.videoId}`;
    const title = String(item.title || "SEVENTEEN 官方影片").slice(0, 180);
    const summary = "待中文化";
    const memberTags = JSON.stringify(extractMemberTags(title));
    lines.push(`INSERT OR IGNORE INTO news_clusters (id,fingerprint,title_zh_tw,summary_zh_tw,category,primary_item_id) VALUES (${sql(clusterId)},${sql(hash(item.videoId))},${sql(title)},${sql(summary)},'video',${sql(id)});`);
    lines.push(`INSERT OR IGNORE INTO news_items (id,source_id,source_item_id,canonical_url,content_hash,title_original,title_zh_tw,summary_zh_tw,category,member_tags,image_url,published_at,cluster_id,status) VALUES (${sql(id)},'youtube-official',${sql(item.videoId)},${sql(canonicalUrl)},${sql(hash(`${canonicalUrl}|${title}`))},${sql(title)},${sql(title)},${sql(summary)},'video',${sql(memberTags)},${sql(`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`)},${sql(item.publishedAt)},${sql(clusterId)},'approved');`);
  }
  chunks.push({ number: chunks.length + 1, sql: lines.join("\n"), count: items.length });
}

fs.mkdirSync(outputDir, { recursive: true });
for (const chunk of chunks) fs.writeFileSync(path.join(outputDir, `youtube-history-${String(chunk.number).padStart(2,"0")}.sql`), chunk.sql);
console.log(JSON.stringify({ outputDir, chunks: chunks.length, videos: data.items.length, counts: chunks.map((chunk) => chunk.count) }));
