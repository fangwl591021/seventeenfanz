import { makeId, readTextBounded } from "./lib.js";

const size = { width: 2500, height: 1686 };
const pages = {
  news: [
    ["最新情報頁",28,28,1213,220,"news"],["切換應援專區",1259,28,1213,220,"support"],
    ["今日最新情報",28,272,960,1386,"/news"],["官方公告",1012,272,718,499,"/news?category=official"],
    ["最新影片",1754,272,718,499,"message:最新影片"],["13位成員",1012,795,718,499,"/members"],
    ["活動行事曆",1754,795,718,499,"/calendar"],["分享好友",1012,1318,1460,340,"/share"]
  ],
  support: [
    ["切換最新情報",28,28,1213,220,"news"],["應援專區頁",1259,28,1213,220,"support"],
    ["本週應援任務",28,272,960,1386,"/projects"],["演唱會與售票",1012,272,718,519,"/calendar?category=concert"],
    ["新歌與專輯",1754,272,718,519,"/news?category=release"],["投票任務",1012,815,718,519,"/projects?category=vote"],
    ["應援企劃",1754,815,718,519,"/projects?category=support"],["通知與本命設定",1012,1358,1460,300,"/settings"]
  ]
};

export function buildRichMenuDefinitions(baseUrl, liffId = "") {
  const base = baseUrl.replace(/\/$/, "");
  const internalBase = liffId ? `https://liff.line.me/${encodeURIComponent(liffId)}` : base;
  return Object.fromEntries(Object.entries(pages).map(([page, entries]) => [page, {
    size, selected: page === "news", name: `SEVENTEEN CARAT ${page}`,
    chatBarText: page === "news" ? "最新情報" : "應援專區",
    areas: entries.map(([label,x,y,width,height,target]) => ({ bounds: { x,y,width,height }, action: target.startsWith("/")
      ? { type: "uri", label, uri: `${internalBase}${target}` }
      : target.startsWith("message:")
        ? { type: "message", label, text: target.slice(8) }
        : { type: "richmenuswitch", label, richMenuAliasId: `carat-${target}`, data: `richmenu-switch=${target}` }
    }))
  }]));
}

async function lineApi(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const text = await readTextBounded(response, 500_000);
  if (!response.ok) throw new Error(`LINE ${options.method || "GET"} ${response.status}: ${text.slice(0,300)}`);
  return text ? JSON.parse(text) : null;
}

async function setAlias(token, aliasId, richMenuId) {
  const url = `https://api.line.me/v2/bot/richmenu/alias/${aliasId}`;
  const current = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (current.ok) return lineApi(url, token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ richMenuId }) });
  if (current.status !== 404) throw new Error(`LINE alias lookup ${current.status}`);
  return lineApi("https://api.line.me/v2/bot/richmenu/alias", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ richMenuAliasId: aliasId, richMenuId }) });
}

export async function publishRichMenus(env) {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN || env.RICH_MENU_PUBLISH_TOKEN;
  if (!token) throw new Error("Rich menu publish token is not configured");
  const definitions = buildRichMenuDefinitions(env.PUBLIC_BASE_URL, env.LIFF_ID);
  const created = {};
  for (const page of ["news", "support"]) {
    const createdMenu = await lineApi("https://api.line.me/v2/bot/richmenu", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(definitions[page]) });
    const imageResponse = await env.ASSETS.fetch(new Request(`${env.PUBLIC_BASE_URL}/assets/rich-menu/seventeen-rich-menu-${page}.png`));
    if (!imageResponse.ok) throw new Error(`Missing ${page} rich menu image`);
    const image = await imageResponse.arrayBuffer();
    await lineApi(`https://api-data.line.me/v2/bot/richmenu/${createdMenu.richMenuId}/content`, token, { method: "POST", headers: { "content-type": "image/png" }, body: image });
    await setAlias(token, `carat-${page}`, createdMenu.richMenuId);
    created[page] = createdMenu.richMenuId;
  }
  await lineApi(`https://api.line.me/v2/bot/user/all/richmenu/${created.news}`, token, { method: "POST" });
  if (env.DB) await env.DB.prepare("INSERT INTO rich_menu_releases (id,news_menu_id,support_menu_id) VALUES (?,?,?)").bind(makeId(), created.news, created.support).run();
  return created;
}
