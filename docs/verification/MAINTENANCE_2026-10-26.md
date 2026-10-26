# 維護紀錄 · 2026-10-26

六項加強一次完成：iPhone（WebKit）驗證、存檔備份、數值長程驗證、修仙指引、測試環境、程式整理。

## 1. WebKit（iOS Safari 核心）

- 安裝 Playwright WebKit 18.0（build 2083）後補跑既有瀏覽器測試：
  - `tests/progression-browser.cjs`：WebKit 22 項全數通過（完整流程、雙分頁、渡劫、844×390／942×435、直式提醒）。
  - `tests/expedition-browser.cjs`（EXTRA）：WebKit 三種尺寸 18 項全數通過（奇遇、首領選擇、重新整理保留、新怪物圖片）。
- 存檔備份與修仙指引另以 WebKit 844×390 實測。

## 2. 存檔備份（`save-backup.js`、`save-backup.css`）

- 匯出：一次唯讀交易讀出 `gameSaves` 全部資料，包成 `{format:'qinghe-mahjong-save', version:1, exportedAt, build, entries}` 下載。
- 匯入：檢查格式、版本、鍵值、重複與修為資料（`MahjongCultivationProgression.validate`），顯示內容摘要與「將取代全部存檔」確認；同一筆讀寫交易內 `clear()` 後寫回，失敗即中止、不留半套資料。
- 實測（Chromium 942×435）：打一局後匯出 22 KB、清空資料庫、匯入，6 筆資料與匯出前逐筆相同；非本遊戲檔案被拒絕且存檔不變。

## 3. 數值：戰果指數與長程模擬

- 戰果指數改為 `全隊有效傷害 ÷ 1700 × 100`（`referenceHp`，15 隻小怪平均生命 1713）。原式除以當局首隻怪物生命，打小王的局指數只有小怪局的一半左右，使難度在首領段反而下降。
- 基準重跑（`node tests/expedition-balance.cjs baseline`）：A＝198.53、B＝317.65（原 168.6／269.8）。
- 長程（`node tests/expedition-balance.cjs run calibration 0 10 0 80`，800 局、無來源漂移）：

| 項目 | 結果 |
|---|---|
| 新怪物生命倍率（每 20 局平均） | 1.074／1.052／1.047／1.053 |
| 觸頂 ×1.30／維持 ×1.00 | 0%／29% |
| 平均戰果指數（小怪／菁英／小王局） | 215／213／229 |
| 渡劫通過（含重試） | 築基 100%（10）、金丹 63%（16）、元嬰 67%（15） |
| 80 局結束境界 | 玩家全員元嬰；AI 30 位中 27 位元嬰 |
| 前 32 局最高近期評分 | 76、87、88、90、71、93、80、79、77、76 |

- 尚待處理：體修（岳鎮山）前 32 局最高近期評分 71，未達進階首領 75 分；其他九位皆達標。本次未調整評分權重。

## 4. 修仙指引（`cultivation-guide.js`、`cultivation-guide.css`）

- 七張一次性說明卡：牌桌、結算、整備、功法（修為 ≥20）、奇遇、可渡劫、選小王。按「知道了」記入 `localStorage`（`qinghe_cult_guide_v1`），讀取失敗時只是再顯示一次。
- 有開啟的對話框時卡片放進該對話框（避免被模態背景擋住）；卡片 `pointer-events:none`、只有按鈕可點，實測卡片下方仍可點擊。

## 5. 測試環境

- `tests/optional-playwright.cjs`：`progression-store`、`expedition-store` 兩個 IndexedDB 測試在沒有 Playwright 時標示「略過」並說明原因。
- 全套：有 Playwright 1110 通過；沒有時 1108 通過、2 略過。

## 6. 程式整理（行為不變）

- `cultivation-expedition.js` 由壓縮長行改為一般格式；與原檔差異比對 15,645 次（含 20 段 170 局旅程、事件、扣款、首領選項、驗證）輸出完全一致。
- `cultivation-expedition-ui.js` 拆成選項／事件／首領三個小函式；順帶修正保存失敗重試時「資源不足」選項被重新啟用。
- `cultivation-prep-layout.css`：移除 19 條被同條件、同選擇器、同屬性的後續規則完全覆寫的宣告與 6 條因此變空的規則；固定亂數後比對三種尺寸、五個整備分頁共 4,944 個元素的計算樣式，差異 0。其餘疊加的手機覆寫因牽涉層疊順序，未合併。
