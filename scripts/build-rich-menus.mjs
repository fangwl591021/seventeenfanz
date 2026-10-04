import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const actionMap = JSON.parse(fs.readFileSync(path.join(root, "design", "rich-menu-actions.json"), "utf8"));
const base = (process.env.PUBLIC_BASE_URL || "https://REPLACE_WITH_WORKER_URL").replace(/\/$/, "");

for (const page of actionMap.pages) {
  const richMenu = {
    size: actionMap.size,
    selected: page.id === "news",
    name: `SEVENTEEN CARAT ${page.id}`,
    chatBarText: page.id === "news" ? "最新情報" : "應援專區",
    areas: page.areas.map((area) => ({
      bounds: area.bounds,
      action: area.action.startsWith("uri:")
        ? { type: "uri", label: area.label, uri: `${base}${area.action.slice(4)}` }
        : { type: "richmenuswitch", label: area.label, richMenuAliasId: `carat-${area.action.slice(5)}`, data: `richmenu-switch=${area.action.slice(5)}` }
    }))
  };
  fs.mkdirSync(path.join(root, "dist", "rich-menu"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "rich-menu", `${page.id}.json`), JSON.stringify(richMenu, null, 2));
}
console.log("Rich menu definitions generated in dist/rich-menu");
