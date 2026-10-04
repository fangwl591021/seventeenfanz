# SEVENTEEN CARAT 繁中情報站

LINE OA 專用的繁中情報 Worker。官方來源優先，提供全球情報蒐集、跨語言去重、繁中摘要、人工審核、LINE webhook、LIFF 分享與兩頁圖文選單。

## 正式網址

- 公開前端：`https://seventeenfanz.fangwl591021.workers.dev`
- 正式後端：`joson-care` Worker（保留既有 LINE、LIFF、Gemini secrets 與排程）
- `wrangler.frontend.jsonc` 透過 Cloudflare Service Binding 將公開前端連到正式後端，不複製或暴露 secrets。

## 本機檢查

```powershell
npm.cmd install
npm.cmd test
npx.cmd wrangler deploy --dry-run
```

## 建立正式資源（確認切換時才執行）

1. 建立 D1：`npx.cmd wrangler d1 create seventeen-carat-hub-db`
2. 把回傳的 `database_id` 與 `d1_databases` 區塊加入 `wrangler.jsonc`，binding 必須命名為 `DB`。
3. 套用 migration：`npx.cmd wrangler d1 migrations apply seventeen-carat-hub-db --remote`
4. 設定 secrets：`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`GEMINI_API_KEY`、`ADMIN_ACCESS_KEY`。
5. 將 `PUBLIC_BASE_URL` 改成正式 Worker 網址，將 `LIFF_ID` 改成此服務專用 LIFF ID。
6. 完成測試後部署 Worker，再由管理頁建立及發布兩頁圖文選單。

目前正式後端沿用既有 `joson-care` Worker，以保留原 LINE OA、LIFF 與 Worker secrets；資料層綁定獨立的 `seventeen-carat-hub-db`。對外網址由 `seventeenfanz` Worker 提供，並透過 Service Binding 連回正式後端。

## 官方 YouTube 歷史回填

一般排程用官方 RSS 收錄新影片；重建官方頻道完整歷史資料時依序執行：

```powershell
node scripts/scan-youtube-history.mjs
node scripts/complete-youtube-history.mjs
node scripts/build-youtube-import.mjs
```

再以 Wrangler 將 `dist/youtube-history-sql/*.sql` 套用到指定的 D1。匯入以影片網址及固定 ID 去重，可安全重跑；標記為「待中文化」的歷史項目會由排程使用 Gemini 分批轉為繁體中文。
