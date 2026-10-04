# 上線與切換檢核

## 來源原則

- Tier 1：PLEDIS、Weverse、SEVENTEEN 日本官網、SEVENTEEN 官方 YouTube，可自動匯入但預設仍進待審核。
- Tier 2：主辦單位、唱片公司、正式售票平台，必須由管理員加入來源白名單。
- Tier 3：媒體與粉絲來源只當線索，不可作為售票、活動期限或健康安全資訊的唯一依據。
- 不蒐集登入後、付費、會員限定或禁止自動存取的內容。

## 發布前

- [ ] 新 D1 已建立並完成 migration
- [ ] `PUBLIC_BASE_URL` 與 LIFF Endpoint 指向新 Worker
- [ ] LINE 與 Gemini secrets 已在新 Worker 設定
- [ ] `/health` 四項設定均為 true
- [ ] 官方 YouTube Feed、PLEDIS、Weverse、日本官網各完成一次來源健康檢查
- [ ] 管理後台可登入、核准、拒絕
- [ ] LINE webhook 簽章與實機回覆成功
- [ ] LIFF 分享與關閉按鈕在 LINE iOS/Android 實機成功
- [ ] 兩張圖文選單 action map 已逐格點擊確認

## 切換順序

1. 先部署新 Worker，不更動舊 webhook。
2. 建立新 LIFF app 並驗證所有頁面。
3. 建立兩張 LINE rich menu，上傳圖片、建立 alias，先綁測試帳號。
4. LINE webhook 改指新 Worker並立即做簽章／回覆測試。
5. rich menu 設為預設；觀察錯誤與回覆至少一輪。
6. 確認新服務接手後，才另行刪除 Joson-Care 的 D1、R2、Worker 與舊選單。
