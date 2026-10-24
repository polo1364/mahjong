# 五行晶石牌名與首頁交付紀錄

更新：2026-10-22。此紀錄描述本輪實作；其他文件中較早日期的數字屬歷史結果。

## 使用與預覽

- 開啟 `index.html`，首頁按「開始遊戲」→「一般模式」進桌。「修仙模式」顯示尚未開放，沒有戰鬥或特殊規則。
- 有自動暫存時出現「繼續遊戲」。恢復成功不播開局動畫；資料無效時留在首頁顯示錯誤，保留原暫存。首頁與模式頁之間返回不改存檔。
- 桌內「設定 → 晶石牌名與語音」可看舊新名稱對照，並試聽 42 牌名、16 圈風及 5 莊家，共 63 選項。主聲音和語音開關須開啟、音量大於零。
- [首頁、模式頁、42 牌與語音預覽](../../artifacts/crystal-start-preview.html)；[完整新語音樣本](../../assets/audio/voice-crystal-v1/preview.mp3)。
- [桌機首頁](../../artifacts/start-home-1440x900.png)、[桌機模式頁](../../artifacts/start-modes-1440x900.png)、[手機模式頁](../../artifacts/start-modes-390x844.png)、[設定牌名對照](../../artifacts/crystal-names-reference-1440x1000.png)。

## 程式變更

- `tile-names.js` 為 42 牌的共用名稱來源。`index.html` 的提示、戰況、結算、無障礙標籤與 `feedback-controls.js` 試聽均使用它。舊名、數字／中文數字、條／索與字牌長短名可解析；完整名稱必須在牌動作脈絡中出現，點胡對象名稱先保護再解析括號內牌名。
- `crystal-tiles.js` 只更新 metadata label，原 SVG、裁切座標、PNG 與字牌角標不變；原始向量備援仍使用傳統字形。牌 key、排序、胡牌／計分、144 張實體牌與 `tw16-flowers-v1` 存檔契約不變，沒有新增模式或元素欄位。
- `start-screen.js/css` 控制 home／modes／starting／game。首頁不建立牌局、不啟動 AI、洗牌或報牌；一般模式顯示牌桌並量測後才呼叫原開局入口。防重複啟動，支援返回焦點與 Escape。
- `feedback-voice.js` 把所有 `tile-*` 指向 `voice-crystal-v1`；動作、圈風與莊家仍讀舊 `voice` 目錄。正常補花使用 `play('flower', {tileKey})`，仍是 flower 優先級、去重與佇列；開局不逐花報名，連補只播一個花牌 cue，胡牌可中斷。
- `table-menu.js/css` 保留目前桌上吃碰槓胡操作位置，將牌名對照與試聽收在設定 details。修正關閉 details 時焦點陷阱，以及舊效果說明節點移除後造成偏好無法儲存的例外。
- 手機檢查另修正既有窄矮 board 桌心擠壓下方棄牌問題，使用緊湊桌心與實際可用空間；隱藏空棄牌 grid，避免空的六欄撐出頁面。沒有重製牌圖或更動厚度。

## 語音來源與隔離

- ElevenLabs，Kevin Tu - Natural, Steady and Calm，Eleven v4。5 批產出 9＋9＋9＋7＋8＝42 段，使用每批第 1 個候選。
- 本輪 UI 選定聲線／模型，穩定度 0.18、相似度 1，下載檔名均帶 `sp86_s18_sb100_v4`。生成共用 227 點；沒有建立新聲線、訂閱或購買方案。
- 以實際靜音切段（−55dB、至少 0.2 秒），保留前後緩衝並驗證每批句數，沒有按均等時間硬切。
- 新原始檔、提示詞、切點、hash、處理與 ASR 證據保存在 `art-source/audio/voice-crystal-v1/`，正式音檔在 `assets/audio/voice-crystal-v1/`。新處理工具不讀舊替換批次，舊工具只寫原 `voice` 目錄。
- 音檔可解碼、成功播放與 ASR 是不同證據；ASR 不等於人工口音驗收。原音與逐牌試聽保留供檢查。
- 無詞彙提示的 ASR：18 詞文字吻合、14 詞同音異字、10 詞鼻音歧義（九句赤晶及金菊）。另存的詞彙提示版本有 41 詞吻合、曜陽 1 詞同音異字；提示版受預期詞影響，不能當獨立內容驗收。兩份原始轉錄與逐詞分類見 `asr-transcript.json`、`asr-vocabulary-transcript.json`、`content-validation.json`；人工與內容總驗收旗標仍為 false。

## 本輪驗證

| 範圍 | 已驗證結果 | 證據 |
| --- | --- | --- |
| 引擎、AI、聲光、開局、牌名 | 全部 9 個 Node 測試檔分批完成，153 個唯一案例通過、0 失敗；包含 10 個牌名整合案例，其中 9 個走正式戰況 pipeline | `artifacts/crystal-start-node-tests.txt` |
| 首頁與模式 | 6 尺寸＋續局／無效存檔流程，共 7 情境；0 pageerror | `artifacts/start-screen.json` |
| 設定選單 | 59 項／4 尺寸通過 | `artifacts/table-menu.json` |
| 牌名對照與焦點／偏好 | 63 項／4 尺寸通過 | `artifacts/crystal-names-visual-results.json` |
| 語音瀏覽器 | 273 項、4 尺寸、68 次實播通過；所有 63 選項音源正確且 currentTime 前進，0 errors | `artifacts/crystal-voice-browser-results.json` |
| 補花／胡牌同步 | 桌機、手機各 3 風格；24 胡牌＋18 補花情境＋2 生命週期；最大起始差 74.3ms，0 JS／console errors | `artifacts/flower-sync-results.json` |
| 新音檔技術校驗 | 42／42 完整、可解碼、hash 符合；0 clipping，最高峰值 −7.288 dBFS | `art-source/audio/voice-crystal-v1/technical-validation.json` |
| 寬桌 | 15 視窗、33 情境、999 命中點、285 次可信點擊；0 失敗／JS 錯誤 | `artifacts/wide-table.json` |
| 四向棄牌與站立牌 | 9 視窗、34 情境、1,368 張牌；0 失敗／JS 錯誤 | `artifacts/standing-rivers.json` |
| 洗牌落點 | 5 尺寸四階段與跳過／縮放通過 | `artifacts/wide-opening-report.json` |
| 預覽頁 | 桌機、手機直向、矮橫向共 3 尺寸；42 牌、無橫溢出，試聽成功、0 errors | `artifacts/crystal-start-preview.json` |

寬桌的 285 次點擊由測試攔截以驗證命中，另有獨立實際出牌案例，不是 285 次正式出牌。

執行最小回歸：

```powershell
node --test tests/engine.test.cjs tests/ai.test.cjs tests/audio-runtime.test.cjs tests/voice-runtime.test.cjs tests/effects-runtime.test.cjs tests/opening-runtime.test.cjs tests/tile-names.test.cjs tests/crystal-tiles.test.cjs tests/crystal-integration.test.cjs
node tests/start-screen.cjs
node tests/table-menu.cjs
node tests/feedback-browser.cjs --voice --prefix=crystal-voice-
node tests/flower-sync.cjs
node tests/wide-table.cjs
node tests/wide-opening.cjs
node tests/standing-rivers.cjs
```

瀏覽器測試須先啟動 `python -m http.server 8765 --bind 127.0.0.1`，並提供 Playwright／Chromium。所有測試使用隔離 context，未讀取或重設使用者瀏覽器的牌局。

## 驗收邊界

- 手機與矮橫向結果來自 Chromium 視窗模擬，未在實體 iOS／Android 裝置驗收。
- 320px 螢幕同排容納 17 張手牌仍受物理寬度限制；原始高解析牌圖未降採樣，但最小牌面無法呈現桌機大小的全部裝飾細節。
- Node 開局 VM 未提供 IndexedDB，可能輸出 `ReferenceError: indexedDB is not defined` 自動暫存警告；相關斷言通過，真正瀏覽器續局與存檔另驗證。
- 背景停止由受控 visibility／pagehide 事件驗證，未宣稱完成所有手機系統的切背景驗收。語音口音與細微鼻音仍以實際試聽為準。
- 修仙模式未開放。本輪沒有新增戰鬥、五行屬性、技能或修改舊玩法。
