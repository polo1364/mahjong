# 修仙胡牌連招與跨局劫印驗證

日期：2026-10-23。工作區：D:\Download\github\mahjong。

## 交付與操作

- 已接入 35 種普通台型終式、基本起手與七搶一／八仙過海，共 38 筆終式查詢。169 種既有牌組技能保留。
- 設定內可查終式與劫印；結算「查看連招與劫印」按鈕顯示原台型、技能、實際傷害與下一局劫印。玩家資訊的劫印按鈕可查看本局期限。
- 「再戰一場」帶入下一局劫印，局內重開保留本局劫印；首頁的「重新開始修仙旅程」經確認才清除連戰與劫印。
- [完整技能與規則](../CULTIVATION_FINISHERS.md)、[畫面與可搜尋技能預覽](../../artifacts/cultivation-finisher-preview.html)。

## 驗證證據

| 檢查 | 結果 | 證據 |
|---|---|---|
| 全部 `tests/*.test.cjs` | 465 通過、0 失敗、0 跳過 | artifacts/finisher-all-tests.txt |
| 新終式專項 | 48 通過，已包含在上述總數 | artifacts/finisher-unit-tests.txt |
| 合法瀏覽器連戰 | 6 組 × 2 局，全部結束，0 頁面／戰鬥稽核錯誤 | artifacts/cultivation-playthrough-journey-final.json |
| 跨局存讀檔與首頁生命週期 | 30 檢查通過，3 尺寸 | artifacts/cultivation-seal-flow-report.json |
| 修仙 UI | 151 檢查通過，6 尺寸 | artifacts/finisher-ui-tests.txt |
| 首頁 | 6 尺寸、7 情境通過 | artifacts/finisher-regression-start-screen.txt |
| 洗牌 | 24 檢查通過 | artifacts/finisher-regression-opening-browser.txt |
| 語音／設定 | 274 檢查、68 次本地音檔試聽，0 錯誤 | artifacts/finisher-regression-feedback-browser.txt |
| 設定選單 | 59 檢查，4 尺寸 | artifacts/finisher-regression-table-menu.txt |
| 手牌 | 10 尺寸、170 次實際點選出牌、80 情境 | artifacts/finisher-regression-hand-layout.txt |
| 一般結算 | 4 尺寸，無遮牌與橫向捲動 | artifacts/finisher-regression-result-layout.txt |
| 立體牌與棄牌 | 9 尺寸、34 畫面、1368 張牌檢查 | artifacts/finisher-regression-standing-rivers.txt |
| 既有修仙流程 | 通過，含一般／修仙隔離存檔與待處理反應續局 | artifacts/finisher-regression-cultivation-flow.txt |

專項涵蓋所有普通台型、固定段數與穿透、實際來源元素、零台、清一色＋對對胡、兩組三元與兩朵正花、封頂比例與固定順序、平胡禁自摸、門清自摸互斥、暗刻最高階、搶槓來源、七搶一持單花者、增益與固定追加只消耗一次、過量傷害與擊殺、傷害明細總和、去重、劫印同類取強與不同類相乘、減傷上限、治療與護盾、仇恨與挑釁、自然復甦、普通淨化、連續放槍、流局與全員虛弱解除、舊存檔與非法劫印拒絕。

生命週期測試使用真實瀏覽器、IndexedDB 與有效的 144 張牌，注入受控戰鬥結算 fixture 來穩定覆蓋邊界；不將這些 fixture 計入 12 局合法實玩。測試透過真實按鈕完成再戰、首頁、續局、重開、明確重新開始；刷新前後比較完整戰鬥狀態，確認沒有重播或提前到期。

合法實玩用固定種子 24001–24006，桌機 1440×900、直向 390×844、矮橫向 844×390，各兩組連續兩局。自己的合法決策由既有 AI 評估後實際點按牌／按鈕，其他三家沿用正式 AI；只加速演出，不改合法牌、抽牌順序或傷害。每步檢查 144 張唯一性、HP、攻擊時機、最高仇恨目標、技能次數、傷害歸屬與排名。各局完整事件及截圖見報告中的 eventFile。

## 固定種子傷害比較與下一局表現

每局取完全相同的終式前戰鬥狀態，分別套用舊共通終式與新版連招。這是相同終局狀態的對照，不是重新模擬整場舊版 AI，也不是長期勝率估計。

- 舊終式平均 325.08，新版平均 331.25，約 +1.90%。
- 同一組終局狀態下，舊終式胡牌者首名 10/12，新版 11/12（含 1 局並列首名）；新版仍有 1 局胡牌者不是首名。
- 受劫印者第二局表現如下，全部於第二局結算後解除；其中 3/6 仍是傷害首名。

| 種子 | 玩家 pid | 生效劫印 | 第二局傷害 | 名次 | 虛弱次數 |
|---|---:|---|---:|---:|---:|
| 24001 | 2 | 天時不利、亂神 | 833 | 2 | 1 |
| 24002 | 3 | 氣機失守 | 1470 | 1 | 1 |
| 24003 | 1 | 閉脈、壇威震懾 | 374 | 4 | 0 |
| 24004 | 3 | 閉脈 | 795 | 1 | 0 |
| 24005 | 1 | 三靈禁、花靈凋零 | 972 | 1 | 0 |
| 24006 | 1 | 花靈凋零 | 570 | 2 | 0 |

原始統計：artifacts/finisher-balance-summary.json。保留核准測試數值；沒有根據 12 局樣本任意提高或削弱高台技能。

## 修正與相容性

- 挑釁的「升到最高仇恨以上」會對整段新增仇恨套用劫印，而非僅放大最後的固定差額。
- 終式明細以對話窗呈現，避免擠壓結算手牌。上家資訊避開設定按鈕，上家劫印按鈕收在資訊卡標題列，完整期限可點開查看。
- 舊已結束存檔不重新發招、補發劫印；舊自摸結果仍按原來源顯示自摸。
- 測試入口的舊「開頁直接開局」、舊桌外設定／重開位置與平面牌背比例已更新為現有首頁、集中設定與立體牌架。
- 一般模式仍用原計台名稱、點數收付、語音與存檔鍵。新增台型 items 只在修仙計台結果輸出。

一般模式結算另查出既有窄螢幕多副露時按鈕蓋住最後一家牌面的問題。result.css 局部改為內容不壓縮、過高時垂直捲動；不更動計台、手牌或橫向捲動方式。舊 result-layout 測試更新為 rs-* 選擇器，保留 156 張超量資料的完整呈現檢查，並以四副露、兩槓、五張暗手、全桌八朵花的尺寸案例及自然開局手牌驗證正常版面。

## 修改範圍與回復

正式程式：新增 cultivation-finishers.js；修改 index.html、cultivation-combat.js、cultivation-ui.js、cultivation.css、start-screen.js、result.css。

測試與文件：新增 tests/cultivation-finishers.test.cjs、tests/cultivation-journey.cjs、tests/cultivation-seal-flow.cjs、tests/finisher-report.cjs；更新相關 harness、整合／模擬／UI／洗牌／手牌及結算測試入口，README 與技能文件。artifacts 保存測試輸出與預覽。

主要原正式檔備份為同目錄 `.bak.20261023-004459-919`；後續測試與文件修改前也另存帶時間戳的 `.bak.*`。未建立 Git commit；工作區沒有 Git 中繼資料。未操作使用者瀏覽器的既有存檔，驗證皆用隔離 context。

## 獨立文件回讀

fresh-context 唯讀 agent 已核對 38 筆資料、全部事件檔、數值與證據。依回讀修正劫印生命週期的描述，並補註 11/12 包含一局並列首名；最終新增來源牌測試、劫印焦點／遮擋檢查與回歸數字由主代理再次對照產物。

## 未驗證邊界

實體手機、Safari／Firefox、實際作業系統背景掛起、長期平衡與大樣本真人策略尚未驗證。手機證據為 Chromium 視窗模擬；12 局結果不足以推定所有罕見牌型的出現機率或長期勝率。稀有台型、流局、失敗與存檔錯誤以受控測試覆蓋，不宣稱都在自然實玩中出現。
