# 橫式 PWA 與資料夾整理驗證

日期：2026-10-24。

## 變更

- `index.html` 接入 manifest、圖示、直式提醒與 PWA 模組；既有 `scheduleGame` 在直式期間延後執行，轉回橫式繼續，存檔格式與玩法不變。
- `pwa.js` 使用原生 modal dialog 阻擋背景操作，攔截 Escape／Tab，保留原本首頁、選角與牌局對話框狀態；`pwa.css` 配合既有青玉配色。
- `manifest.webmanifest` 宣告獨立視窗、橫式與 192／512 PNG 圖示，另有 180 PNG Apple touch icon。
- `sw.js` 預存 60 個程式主體檔案，媒體採使用時快取；以 scope 與版本分開命名，只刪除自己的舊快取。新 worker 等待舊分頁關閉，不強制重載牌局。
- `tools/build-pwa.cjs` 依程式內容產生快取版本，`--check` 可驗證清單是否過期。README 已補安裝、部署、離線限制與重建方式。
- 916 個既有備份集中於本機 `.local-backups/20261024-*`，保留原相對路徑與 `moves.csv`；後續修改的文件備份另放 `.local-backups/doc-links-*`。未刪除備份。
- 13 份驗證／實玩文件移至 `docs/verification/`，規則與音效文件移至 `docs/`；更新相對文件連結。正式 JS／CSS 與素材路徑維持原位。
- 本機原本沒有 `.git`；接回既有遠端 `main` 紀錄後保留本機檔案。遠端原本只有兩個舊檔，因此此次提交也包含本機現有的遊戲模組、素材與測試，與遠端的 diff 大於本次 PWA 實作本身。

## 實際驗證

| 項目 | 結果 |
| --- | --- |
| `node --test tests/engine.test.cjs tests/crystal-tiles.test.cjs tests/opening-runtime.test.cjs` | 96 通過，0 失敗 |
| `node tests/pwa-browser.cjs` | 24 組通過，根目錄及 `/mahjong/` 各 12 組 |
| Chromium `Page.getInstallabilityErrors` | 根目錄、子路徑均無可安裝條件錯誤 |
| 八種尺寸 | 1440×900、844×390、568×320、1024×768、390×844、320×568、768×1024、900×1440 |
| 方向與操作 | 直式全畫面提醒、Escape／Tab 不可繞過、遊戲延遲任務暫停與恢復後狀態一致、選角對話框保留 |
| 離線與更新 | 離線 reload 並開啟一般模式；線上修仙選角及開局；更新等待舊分頁關閉，啟用後舊快取移除 |
| `node tests/start-screen.cjs` | 6 種尺寸、7 組情境通過，0 瀏覽器錯誤 |
| `node tools/build-pwa.cjs --check` | 60 檔清單與目前程式一致 |
| 視覺檢查 | 已檢視 390×844 直式提醒、844×390 橫式牌桌截圖 |

本機證據：`artifacts/pwa-browser.json`、`artifacts/pwa-regression.txt`、`artifacts/pwa-start-screen.log` 與 `artifacts/pwa-*.png`，不隨 Git 提交。

## 界線

- 本次為 Chromium 自動化與尺寸模擬，未在實體 Android／iPhone 上安裝、旋轉或離線測試。
- 未下載的圖片、音效與新修仙場景不保證離線可用；Cache Storage 也可能受裝置容量限制。
- 方向設定受瀏覽器支援影響；頁面直式提醒作為實際操作限制。[MDN orientation 說明](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/orientation)。
- Git push 不等於啟用 GitHub Pages；未變更遠端 Pages 設定。
- 其他歷史報告的測試數字保留原日期，不作本輪驗收。既有直式玩法測試與目前橫式要求不同，未宣稱整個舊測試集合全數通過。
