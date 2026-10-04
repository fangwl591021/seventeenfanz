import { collectAll, SOURCE_REGISTRY } from "./sources.js";
import { handleWebhook } from "./line.js";
import { publishRichMenus } from "./rich-menu.js";
import { adminLoginPage, adminPage, homePage, membersPage, newsPage, sharePage, simplePage } from "./pages.js";
import { constantTimeEqual, json, sha256 } from "./lib.js";

const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

async function getNews(env, url, status = "approved") {
  if (!env.DB) return [];
  const conditions = ["n.status=?"], values = [status];
  const category = url.searchParams.get("category");
  const member = url.searchParams.get("member");
  // 「官方公告」代表可信的官方來源，而不只是被歸到 official 的單一分類。
  // 日本官網的發行、活動、影片等文章仍應出現在這個總覽中。
  if (category === "official") conditions.push("s.trust_tier=1 AND s.kind<>'youtube'");
  else if (category) { conditions.push("n.category=?"); values.push(category); }
  if (member) { conditions.push("n.member_tags LIKE ?"); values.push(`%${member}%`); }
  return (await env.DB.prepare(`WITH ranked AS (
    SELECT n.*,s.name source_name,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(n.cluster_id,n.id) ORDER BY COALESCE(n.published_at,n.fetched_at) DESC,n.id) event_rank
    FROM news_items n LEFT JOIN sources s ON s.id=n.source_id
    WHERE ${conditions.join(" AND ")}
  ) SELECT * FROM ranked WHERE event_rank=1 ORDER BY COALESCE(published_at,fetched_at) DESC LIMIT 60`).bind(...values).all()).results || [];
}

async function sessionValid(request, env) {
  if (!env.ADMIN_ACCESS_KEY) return false;
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)carat_admin=([^;]+)/)?.[1];
  return token === await sha256(env.ADMIN_ACCESS_KEY);
}

async function integrationHealth(env, deep = false) {
  const result = { line: { ok: false }, gemini: { ok: false, model: env.GEMINI_MODEL || null } };
  if (env.LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      const response = await fetch("https://api.line.me/v2/bot/info", { headers: { authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` } });
      if (response.ok) {
        const data = await response.json();
        result.line = { ok: true, displayName: data.displayName || null, basicId: data.basicId || null };
      } else result.line.status = response.status;
    } catch (error) { result.line.error = String(error?.message || error); }
  }
  if (env.GEMINI_API_KEY) {
    try {
      const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`);
      result.gemini.ok = response.ok;
      result.gemini.status = response.status;
      if (response.ok) {
        const data = await response.json();
        result.gemini.supportedGenerationMethods = data.supportedGenerationMethods || [];
      }
      if (deep && response.ok) {
        const generation = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with OK only." }] }], generationConfig: { maxOutputTokens: 10, temperature: 0 } }) });
        result.gemini.generateContentStatus = generation.status;
        const generationText = await generation.text();
        result.gemini.generateContentOk = generation.ok;
        if (!generation.ok) result.gemini.generateContentError = generationText.slice(0,500);
      }
    } catch (error) { result.gemini.error = String(error?.message || error); }
  }
  if (deep && env.LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      const headers = { authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "content-type": "application/json" };
      const endpointResponse = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", { headers });
      result.webhook = { configured: endpointResponse.ok, status: endpointResponse.status };
      if (endpointResponse.ok) {
        const endpointData = await endpointResponse.json();
        result.webhook.endpoint = endpointData.endpoint || null;
        result.webhook.active = endpointData.active === true;
        const testResponse = await fetch("https://api.line.me/v2/bot/channel/webhook/test", { method: "POST", headers, body: "{}" });
        result.webhook.testStatus = testResponse.status;
        if (testResponse.ok) result.webhook.test = await testResponse.json();
      }
      const defaultMenuResponse = await fetch("https://api.line.me/v2/bot/user/all/richmenu", { headers });
      result.richMenu = { configured: defaultMenuResponse.ok, status: defaultMenuResponse.status };
      if (defaultMenuResponse.ok) {
        const defaultMenu = await defaultMenuResponse.json();
        result.richMenu.id = defaultMenu.richMenuId || null;
        const definitionResponse = await fetch(`https://api.line.me/v2/bot/richmenu/${encodeURIComponent(defaultMenu.richMenuId)}`, { headers });
        if (definitionResponse.ok) {
          const definition = await definitionResponse.json();
          const uriActions = (definition.areas || []).filter((area) => area.action?.type === "uri").map((area) => area.action.uri);
          result.richMenu.uriActions = uriActions.length;
          result.richMenu.allInternalUrisUseLiff = uriActions.length > 0 && uriActions.every((uri) => uri.startsWith(`https://liff.line.me/${env.LIFF_ID}/`));
        }
      }
    } catch (error) { result.webhook = { configured: false, error: String(error?.message || error) }; }
  }
  return result;
}

async function route(request, env, ctx) {
  let url = new URL(request.url), path = url.pathname;
  const liffState = url.searchParams.get("liff.state");
  // Render LIFF deep links in the original request instead of redirecting to a
  // plain Worker URL. This keeps users inside the LIFF webview and avoids the
  // extra browser transition that can expose the destination address bar.
  if (liffState && liffState.startsWith("/") && !liffState.startsWith("//")) {
    url = new URL(liffState, url.origin);
    path = url.pathname;
  }
  if (path === "/health") return json({ ok: true, app: env.APP_NAME || "SEVENTEEN CARAT 繁中情報站", database: Boolean(env.DB), liffConfigured: Boolean(env.LIFF_ID), aiConfigured: Boolean(env.GEMINI_API_KEY), lineConfigured: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_CHANNEL_SECRET), collectionEnabled: env.COLLECTION_ENABLED === "true", time: new Date().toISOString() });
  if (path === "/health/integrations") return json(await integrationHealth(env, url.searchParams.get("deep") === "1"));
  if (path.startsWith("/ops/") && request.method === "POST") {
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (!env.OPS_TRIGGER_KEY || !await constantTimeEqual(supplied, env.OPS_TRIGGER_KEY)) return json({ error: "not_found" }, 404);
    if (path === "/ops/collect-once") {
      ctx.waitUntil(collectAll(env).then((results) => console.log(JSON.stringify({ event: "manual_collect", results }))));
      return json({ accepted: true }, 202);
    }
    if (path === "/ops/publish-rich-menus") {
      try { return json({ published: true, menus: await publishRichMenus(env) }); }
      catch (error) {
        console.error(JSON.stringify({ event: "rich_menu_publish_error", message: String(error?.message || error) }));
        return json({ published: false, error: String(error?.message || error).slice(0,500) }, 500);
      }
    }
    return json({ error: "not_found" }, 404);
  }
  if ((path === "/webhook" || path === "/line-webhook") && request.method === "POST") return handleWebhook(request, env, ctx);
  if (path === "/api/news") return json({ items: await getNews(env, url), databaseConfigured: Boolean(env.DB) });
  if (path === "/api/sources") return json({ sources: SOURCE_REGISTRY });
  if (path === "/cron/collect" && request.method === "POST") {
    if (!env.ADMIN_ACCESS_KEY || request.headers.get("authorization") !== `Bearer ${env.ADMIN_ACCESS_KEY}`) return json({ error: "unauthorized" }, 401);
    return json({ results: await collectAll(env) });
  }
  if (path === "/admin/login" && request.method === "GET") return html(adminLoginPage());
  if (path === "/admin/login" && request.method === "POST") {
    const key = String((await request.formData()).get("key") || "");
    if (!env.ADMIN_ACCESS_KEY || !await constantTimeEqual(key, env.ADMIN_ACCESS_KEY)) return html(adminLoginPage("管理金鑰不正確。"), 401);
    const token = await sha256(env.ADMIN_ACCESS_KEY);
    return new Response(null, { status: 303, headers: { location: "/admin", "set-cookie": `carat_admin=${token}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=28800` } });
  }
  if (path.startsWith("/admin")) {
    if (!await sessionValid(request, env)) return new Response(null, { status: 303, headers: { location: "/admin/login" } });
    const approve = path.match(/^\/admin\/items\/([^/]+)\/(approve|reject)$/);
    if (approve && request.method === "POST" && env.DB) {
      await env.DB.prepare("UPDATE news_items SET status=? WHERE id=?").bind(approve[2] === "approve" ? "approved" : "rejected", approve[1]).run();
      return new Response(null, { status: 303, headers: { location: "/admin" } });
    }
    let stats = {}, items = [], sources = SOURCE_REGISTRY;
    if (env.DB) {
      const counts = (await env.DB.prepare("SELECT status,COUNT(*) count FROM news_items GROUP BY status").all()).results || [];
      stats = Object.fromEntries(counts.map((row) => [row.status, row.count]));
      items = await getNews(env, url, "pending");
      sources = (await env.DB.prepare("SELECT * FROM sources ORDER BY trust_tier,name").all()).results || [];
      stats.sources = sources.length; stats.errors = sources.filter((source) => source.last_error).length;
    }
    return html(adminPage(stats, items, sources));
  }
  if (path === "/" || path === "/index.html") {
    const categoryUrl = (category) => { const filtered = new URL(url); filtered.searchParams.set("category", category); return filtered; };
    const [videos, releases, support, official] = await Promise.all([
      getNews(env, categoryUrl("video")), getNews(env, categoryUrl("release")),
      getNews(env, categoryUrl("support")), getNews(env, categoryUrl("official"))
    ]);
    return html(homePage({ videos, releases, support, official }));
  }
  if (path === "/news") {
    const member = url.searchParams.get("member");
    let items = await getNews(env, url);
    let notice = "";
    if (member && !items.length) {
      const fallbackUrl = new URL(url);
      fallbackUrl.searchParams.delete("member");
      fallbackUrl.searchParams.set("category", "official");
      items = await getNews(env, fallbackUrl);
      notice = `目前近期情報中尚無 ${member} 的個人項目，以下先顯示 SEVENTEEN 團體官方情報。`;
    }
    const category = url.searchParams.get("category");
    const categoryTitle = { official: "官方公告", concert: "演唱會與活動", release: "新歌與作品", support: "官方應援方法", vote: "投票任務", video: "最新影片" }[category];
    return html(newsPage(items, { title: member ? `${member} 相關情報` : (categoryTitle || "最新情報"), notice, category }));
  }
  if (path === "/videos") { url.searchParams.set("category", "video"); return html(newsPage(await getNews(env, url), { title: "最新影片", category: "video" })); }
  if (path === "/members") return html(membersPage());
  if (path === "/calendar") return html(simplePage("活動行事曆", "只整理有明確來源與日期的活動；售票規則請以主辦單位公告為準。", [["演唱會與售票","已審核的場次、售票與入場提醒。","/news?category=concert"],["新歌與專輯","發行日期與官方收聽入口。","/news?category=release"]]));
  if (path === "/projects") return html(simplePage("CARAT 應援專區", "只呈現已有官方來源的應援與作品資訊，不放置尚無內容的空入口。", [["官方應援方法","查看官方歌曲應援口號與教學。","/news?category=support"],["新歌與作品","查看最新作品與官方來源。","/news?category=release"]]));
  if (path === "/settings") return html(simplePage("通知與本命設定", "LINE 綁定後可選擇成員與消息類型；第一版先完成資料與帳號基礎。", [["選擇本命","13 位成員快速入口。","/members"],["最新情報","查看目前已審核內容。","/news"]]));
  if (path === "/share") return html(sharePage(env.LIFF_ID, env.PUBLIC_BASE_URL || url.origin));
  if (env.ASSETS) return env.ASSETS.fetch(request);
  return new Response("Not Found", { status: 404 });
}

export default {
  fetch(request, env, ctx) { return route(request, env, ctx).catch((error) => { console.error(JSON.stringify({ event: "request_error", message: String(error?.message || error), path: new URL(request.url).pathname })); return json({ error: "internal_error" }, 500); }); },
  scheduled(_controller, env, ctx) {
    if (env.COLLECTION_ENABLED !== "true") { console.log(JSON.stringify({ event: "scheduled_collect_skipped", reason: "COLLECTION_ENABLED is not true" })); return; }
    ctx.waitUntil(collectAll(env).then((results) => console.log(JSON.stringify({ event: "scheduled_collect", results }))));
  }
};

export { route };
