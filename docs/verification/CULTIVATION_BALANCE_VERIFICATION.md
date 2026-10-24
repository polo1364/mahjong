# 修仙連戰平衡追測

2026-10-23。普通胡牌起手由 300 調為 240，維持每台 60、基礎預算上限 1500；劫印與七搶一／八仙過海數值保留。本輪未重現新的遊戲邏輯 BUG；修正測試記錄原先漏掉起手花牌事件的問題，並擴充連戰與劫印觀察。

## 實際連戰結果

以隔離 Chromium 操作正式頁面，合法按鈕出牌、吃碰槓胡。第 0 席使用既有 AI 評估自身手牌與公開資訊選擇，再實際點擊；其他三席使用正式 AI。固定發牌／戰鬥亂數，縮短呈現等待並跳過洗牌動畫，不替換牌局或戰鬥規則。音效關閉。每組連打三局，桌機 1440×900、直向 390×844、矮橫向 844×390 平均分配。

| 批次 | 組數／局數 | 胡牌者第一 | 平均終式傷害 | 終式占胡牌者總傷害平均 | 受劫印者第一 |
|---|---:|---:|---:|---:|---:|
| 調整前，35001–35012 | 12／36 | 31／36（86.1%） | 363.1 | 36.4% | 5／18 |
| 調整後，相同種子 | 12／36 | 28／36（77.8%） | 312.2 | 33.0% | 3／18 |
| 調整後，新種子 36001–36006 | 6／18 | 13／18（72.2%） | 288.7 | 28.8% | 2／9 |

共 90 次完整牌局執行，涵蓋 54 個不同的種子／局次組合；調整後實跑 54 局，胡牌者 41 局第一。所有本輪自然對局以胡牌結束，不能把這批稱為實玩過流局或全員虛弱結算。那些結束方式由既有單元測試覆蓋。

兩批相同種子的 36 份終式前狀態與 finish 事件逐份深比較一致，排名差異可直接歸因於終式調整。胡牌前已第一皆為 7／36；依終式翻至第一由 24 降到 21。終式平均傷害降低約 14%，高台與特殊花胡保留價值。

實際稽核共 5,857 個戰鬥事件，包含 830 次組牌技能；每步核對實體牌唯一性、傷害事件歸屬、最高仇恨目標、怪物出手計數、結果畫面排名，以及再戰身分／劫印期限。三批錯誤均為 0。[原始批次摘要](../../artifacts/cultivation-balance-matched.json)。

## 調整依據與劫印觀察

- 比較基本起手 300／270／240／210，在同一批 36 個終式前狀態重算，胡牌者第一分別為 31／29／28／22。選 240 作小幅調整；210 在這批降幅較大。這是同狀態重算比較，只有 300 與 240 另做了完整對局重跑。
- 一般新預算為 `min(1500,240＋60×台數)`。零台 240；4 台 480；12 台 960；21 台起封頂 1500。條件增傷、元素、護甲、虛弱與一次性增益繼續套用，1500 是基礎預算上限，不是最終傷害硬上限。
- 調整後 27 個受劫印角色局次中仍有 5 次第一。此比例受放槍選樣與牌運影響，不是劫印導致勝率下降的因果估計。
- 每個有劫印事件另用相同事件前狀態移除劫印，觀察單次效果。普攻、技能、終式降傷與仇恨增加確實生效；自然實玩也觀察到治療減少 4／9／10、護盾取得減少 17 的事件。部分整局沒有對應治療／護盾／終式觸發，劫印無直接效果符合條件限制。
- 例如 35009 第三局第 2 席同時帶技能與終式劫印，單事件比較的直接少傷合計 162，仍獲第一；35007 第二局普攻劫印少傷合計 33。這些合計不是整局無劫印模擬，未包含生命、仇恨改變造成的後續決策或受擊回饋。
- 樣本尚不足以證明每種劫印長期強弱，暫不改百分比或期限，避免依少數對局將有條件懲罰改成全面懲罰。罕見高台、花胡以固定案例測正確性，未宣稱自然實玩頻率足夠。

分析資料：[調整前](../../artifacts/cultivation-balance-analysis-balance-baseline.json)、[調整後](../../artifacts/cultivation-balance-analysis-balance-tuned.json)、[新種子](../../artifacts/cultivation-balance-analysis-balance-holdout.json)。內含逐局與逐事件劫印差異。

## 回歸與可重現步驟

| 驗證 | 結果 | 證據 |
|---|---|---|
| 全部 `tests/*.test.cjs` | 474 通過、0 失敗、0 跳過，含一般模式引擎／AI／語音及修仙 | [輸出](../../artifacts/balance-all-tests.txt) |
| 新增平衡專項 | 9 個測試，含 160 組元素／台型／戰鬥狀態，每組有劫印與無劫印比較；已含上述總數 | tests/cultivation-balance.test.cjs |
| 修仙介面 | 151 檢查，6 視窗尺寸通過 | [輸出](../../artifacts/balance-ui-tests.txt) |
| 劫印存讀檔生命週期 | 30 檢查，3 視窗尺寸通過 | [輸出](../../artifacts/balance-seal-flow-tests.txt) |
| 合法連戰 | 36＋36＋18 局，0 稽核錯誤 | [調整前](../../artifacts/cultivation-playthrough-balance-baseline.json)、[調整後](../../artifacts/cultivation-playthrough-balance-tuned.json)、[新種子](../../artifacts/cultivation-playthrough-balance-holdout.json) |

固定案例涵蓋零台、清一色＋對對胡、門清自摸、兩組三元＋兩朵正花、搶槓、高台封頂、七搶一與八仙過海，各配五種怪物元素和正常／虛弱／增益／過量擊殺四狀態。核對傷害明細總和、最多一次技能與追擊、擊殺時不換怪、劫印含終式後解除，以及事件去重。

```powershell
# 從專案目錄執行；瀏覽器測試需本機 8765 服務及既有 Playwright runtime。
$env:NODE_PATH='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node --test tests/*.test.cjs
node tests/cultivation-journey.cjs --label=balance-rerun --seed=35001 --games=12 --hands=3
node tests/cultivation-balance-analysis.cjs --label=balance-rerun
node tests/cultivation-ui.cjs
node tests/cultivation-seal-flow.cjs
```

## 畫面與修改範圍

- [桌機連招](../../artifacts/cultivation-finisher-balance-tuned-35001-hand1.png)
- [直向連招](../../artifacts/cultivation-finisher-balance-tuned-35002-hand1.png)
- [矮橫向下一局劫印](../../artifacts/cultivation-next-hand-balance-tuned-35003-hand2.png)

正式程式僅修改 `cultivation-finishers.js` 的普通起手數值、`cultivation-ui.js` 的設定說明。未改一般模式規則、保存結構、劫印數值與花胡終式；既有結束存檔不重算排名，進行中存檔在更新後下一次胡牌採新數值。舊共通終式仍只作相容入口。

測試新增 `tests/cultivation-balance.test.cjs`、`tests/cultivation-balance-analysis.cjs`；更新 `tests/cultivation-journey.cjs` 的三局連戰、起手事件與劫印記錄、`tests/cultivation-finishers.test.cjs` 的新預算斷言。同步 `docs/CULTIVATION_FINISHERS.md`、`tests/finisher-report.cjs` 產生模板及 README。既有檔案修改前均留時間戳備份；前次驗證報告保留歷史數據。

手機結果為 Chromium 視窗模擬，未在實體手機測試。本輪自動實玩使用同一套既有 AI 偏好，尚不代表不同人類策略或長期競技平衡；本次也未重新驗收音訊實際聆聽或洗牌動畫落點。
