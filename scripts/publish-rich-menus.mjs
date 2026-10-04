import fs from "node:fs";
import path from "node:path";

if (!process.argv.includes("--confirm")) throw new Error("安全鎖：只有完成實機驗證後，才可加上 --confirm 發布正式選單。");
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) throw new Error("缺少 LINE_CHANNEL_ACCESS_TOKEN 環境變數。");
const root = path.resolve(import.meta.dirname, "..");
const apiBase = "https://api.line.me/v2/bot";
const dataBase = "https://api-data.line.me/v2/bot";

async function line(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function setAlias(aliasId, richMenuId) {
  const url = `${apiBase}/richmenu/alias/${aliasId}`;
  const current = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (current.ok) return line(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ richMenuId }) });
  if (current.status !== 404) throw new Error(`讀取 alias 失敗：${current.status}`);
  return line(`${apiBase}/richmenu/alias`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ richMenuAliasId: aliasId, richMenuId }) });
}

const created = {};
for (const page of ["news", "support"]) {
  const definition = fs.readFileSync(path.join(root, "dist", "rich-menu", `${page}.json`), "utf8");
  const { richMenuId } = await line(`${apiBase}/richmenu`, { method: "POST", headers: { "content-type": "application/json" }, body: definition });
  const image = fs.readFileSync(path.join(root, "public", "assets", "rich-menu", `seventeen-rich-menu-${page}.png`));
  await line(`${dataBase}/richmenu/${richMenuId}/content`, { method: "POST", headers: { "content-type": "image/png" }, body: image });
  await setAlias(`carat-${page}`, richMenuId);
  created[page] = richMenuId;
}
await line(`${apiBase}/user/all/richmenu/${created.news}`, { method: "POST" });
console.log(JSON.stringify({ published: true, default: created.news, menus: created }, null, 2));
