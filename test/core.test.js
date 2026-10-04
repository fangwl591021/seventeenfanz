import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canonicalizeUrl, constantTimeEqual, normalizeTitle } from "../src/lib.js";
import { extractMemberTags, parseJapanCall, parseJapanDiscography, parseJapanNews, parseJapanSchedule, parseYouTubeFeed } from "../src/sources.js";
import { buildReply, verifyLineSignature } from "../src/line.js";
import { route } from "../src/index.js";
import { buildRichMenuDefinitions } from "../src/rich-menu.js";
import { homePage, newsPage } from "../src/pages.js";

test("canonical URL removes tracking and fragments", () => {
  assert.equal(canonicalizeUrl("https://EXAMPLE.com/news/?utm_source=x&id=2#top"), "https://example.com/news?id=2");
});

test("constant-time secret comparison distinguishes values", async () => {
  assert.equal(await constantTimeEqual("same-secret", "same-secret"), true);
  assert.equal(await constantTimeEqual("same-secret", "different-secret"), false);
});

test("multilingual title normalizer removes group aliases", () => {
  assert.equal(normalizeTitle("[OFFICIAL] SEVENTEEN 세븐틴！新專輯"), "新專輯");
});

test("YouTube Atom feed parser extracts official video data", () => {
  const items = parseYouTubeFeed(`<feed><entry><yt:videoId>abc123</yt:videoId><title><![CDATA[新影片]]></title><link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/><published>2026-10-04T00:00:00Z</published><media:group><media:description>摘要</media:description><media:thumbnail url="https://i.ytimg.com/x.jpg"/></media:group></entry></feed>`);
  assert.equal(items.length, 1);
  assert.equal(items[0].sourceItemId, "abc123");
  assert.equal(items[0].title, "新影片");
});

test("Japan official news parser extracts article, date and category", () => {
  const items = parseJapanNews(`<div class="news_list"><dl onClick="location.href='/posts/information/abc123'"><dt>2026.10.2 <span class="category category-liveevent">LIVE/EVENT</span></dt><dd>サイン会開催決定！<!----></dd></dl></div>`);
  assert.equal(items.length, 1);
  assert.equal(items[0].category, "concert");
  assert.equal(items[0].publishedAt, "2026-10-02T00:00:00+09:00");
  assert.equal(items[0].url, "https://www.seventeen-17.jp/posts/information/abc123");
});

test("Japan official discography and cheer parsers return real detail URLs", () => {
  const releases = parseJapanDiscography(`<dl onClick="location.href='/posts/discography/album1'"><dt><img src="https://img.example/a.jpg"></dt><dd><div class="dc">2026.08.03 | CD-KR-</div><div class="title">吉BOARD</div></dd></dl>`);
  const support = parseJapanCall(`<dl><dt><img src="https://img.example/c.jpg"></dt><dd><div class="title">LIKE IT</div><a href="/posts/call/song1">應援方法</a></dd></dl>`);
  assert.equal(releases[0].category, "release");
  assert.equal(releases[0].url, "https://www.seventeen-17.jp/posts/discography/album1");
  assert.equal(support[0].category, "support");
  assert.match(support[0].title, /LIKE IT/);
});

test("Japan schedule parser and member tagging support calendar and member pages", () => {
  const schedule = parseJapanSchedule(`<h4 class="title text-center">2026.10</h4><div class="schedule-list-item"><span class="schedule-date">10.30</span><div><a href="/posts/schedule/event1" class="schedule-title-link"><span class="schedule-title-text">雜誌封面 (DINO)</span></a></div><span class="schedule-category-label">MAGAZINE</span></div></div>`);
  assert.equal(schedule.length, 1);
  assert.equal(schedule[0].publishedAt, "2026-10-30T00:00:00+09:00");
  assert.deepEqual(extractMemberTags("DINO 李燦 最新雜誌"), ["DINO"]);
});

test("LINE signature verification accepts valid HMAC and rejects changes", async () => {
  const body = '{"events":[]}';
  const secret = "test-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const signature = Buffer.from(signed).toString("base64");
  assert.equal(await verifyLineSignature(body, signature, secret), true);
  assert.equal(await verifyLineSignature(`${body}x`, signature, secret), false);
});

test("out-of-scope LINE question is declined", async () => {
  const reply = await buildReply("請幫我寫股票投資建議", { PUBLIC_BASE_URL: "https://example.com" });
  assert.match(reply, /只提供|專門整理/);
  assert.match(reply, /\/news/);
});

test("health route reports unconfigured production bindings", async () => {
  const response = await route(new Request("https://example.com/health"), { APP_NAME: "test" }, { waitUntil() {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.database, false);
  assert.equal(body.lineConfigured, false);
  assert.equal(body.collectionEnabled, false);
});

test("LIFF share page calls shareTargetPicker only from the button flow", async () => {
  const response = await route(new Request("https://example.com/share"), { LIFF_ID: "123-abc", PUBLIC_BASE_URL: "https://example.com" }, { waitUntil() {} });
  const body = await response.text();
  assert.match(body, /id="share"/);
  assert.match(body, /shareTargetPicker/);
  assert.match(body, /liff\.closeWindow/);
});

test("rich menu action maps stay inside 2500x1686 and do not overlap within a page", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const map = JSON.parse(fs.readFileSync(path.join(root, "design", "rich-menu-actions.json"), "utf8"));
  for (const page of map.pages) {
    for (const area of page.areas) {
      const b = area.bounds;
      assert.ok(b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0);
      assert.ok(b.x + b.width <= map.size.width && b.y + b.height <= map.size.height);
    }
    for (let i = 0; i < page.areas.length; i++) for (let j = i + 1; j < page.areas.length; j++) {
      const a = page.areas[i].bounds, b = page.areas[j].bounds;
      const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      assert.equal(overlap, false, `${page.id}: ${page.areas[i].label} overlaps ${page.areas[j].label}`);
    }
  }
});

test("generated rich menus use native LINE alias switching", () => {
  const root = path.resolve(import.meta.dirname, "..");
  for (const page of ["news", "support"]) {
    const definition = JSON.parse(fs.readFileSync(path.join(root, "dist", "rich-menu", `${page}.json`), "utf8"));
    const switches = definition.areas.filter((area) => area.action.type === "richmenuswitch");
    assert.equal(switches.length, 2);
    for (const area of switches) assert.match(area.action.richMenuAliasId, /^carat-(news|support)$/);
  }
});

test("runtime rich menus preserve all actions and the share route", () => {
  const definitions = buildRichMenuDefinitions("https://example.com/", "123-test");
  assert.equal(definitions.news.areas.length, 8);
  assert.equal(definitions.support.areas.length, 8);
  assert.equal(definitions.news.areas.find((area) => area.action.label === "分享好友").action.uri, "https://liff.line.me/123-test/share");
  assert.equal(definitions.news.areas[1].action.type, "richmenuswitch");
});

test("LIFF state routes directly without a transition page", async () => {
  const response = await route(new Request("https://example.com/?liff.state=%2Fnews%3Fcategory%3Dofficial"), {}, { waitUntil() {} });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.match(await response.text(), /官方公告/);
});

test("media pages render a privacy-enhanced video embed and lazy thumbnails", () => {
  const video = { category: "video", title_zh_tw: "最新影片", canonical_url: "https://www.youtube.com/watch?v=abc123", image_url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg", summary_zh_tw: "摘要" };
  const release = { category: "release", title_zh_tw: "新專輯", canonical_url: "https://example.com/release", image_url: "https://example.com/cover.jpg", summary_zh_tw: "作品資料" };
  const home = homePage({ videos: [video], releases: [release] });
  const videos = newsPage([video], { title: "最新影片", category: "video" });
  assert.match(home, /youtube-nocookie\.com\/embed\/abc123/);
  assert.match(home, /loading="lazy"/);
  assert.match(home, /cover\.jpg/);
  assert.match(videos, /allowfullscreen/);
});
