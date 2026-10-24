# 裝備經濟 V3 核心實作與驗證

結果：核心資料、戰鬥被動、個人經濟、交易／保存驗證與 V3 opt-in 已實作；獨立審查初次發現的 3 項缺陷均已修正覆核。未修改 UI／index／美術，這些整合及 CUA 驗收由主工作另行回報。

## 修改檔案與相容性

- `cultivation-equipment.js`：27 款不可變 catalog、四套裝、三部位／五品階／+0..10、能力加總與純查詢、獨立被動額度。
- `cultivation-economy.js`：每人錢包／王印／背包／獨立 loot/shop/forge RNG、擊殺與結算、持久商店、強化／移轉／分解／兌換、commandId 去重與純交易、NPC 整備。
- `cultivation-combat.js`：V3 opt-in、V2 prepare 遷移、局部戰鬥 hooks 與驗證。修改前備份 `cultivation-combat.js.bak.20261023-194543-379`，保留未動。
- `tests/cultivation-equipment.test.cjs`：28 項功能與邊界測試。
- `tests/cultivation-equipment-analysis.cjs`：固定 seed 戰鬥／經濟診斷。
- `tests/cultivation-equipment-legal-boss.cjs`：實際合法麻將 VM、受控初始 BOSS 與裝備診斷。
- `tests/cultivation-equipment-long-economy.cjs`：跨多循環、到首次+10／完整套裝的純經濟快速模型。
- `docs/EQUIPMENT_V3_API.md`：UI 單一交易入口、指令／回傳／狀態結構、載入順序與保存要求。

新旅程以 `create(seed,null,{heroId,equipment:true})` 啟用；V2 只在已結束手局的 `prepare(input,{equipment:true})` 遷移，不補發舊擊殺／結算。V1/V2 原入口維持原版本。套裝 ID 經主工作確認改為 `set-<setId>-<slot>`，解決普通 `zhenyue-armor` 撞名；數值與 setId 不變。

## 功能驗證

- `node --test tests/*.test.cjs`：**828 tests / 828 pass / 0 fail**，最終一輪 35,306.815 ms。輸出 `artifacts/equipment-core-full-test.txt`。
- `node --test tests/cultivation-equipment.test.cjs`：**28 / 28 pass**。包含 27×5×11＝1,485 組 catalog／品階／強化，1,280 次真 forge RNG（每個非保證成功等級皆有成功及失敗）、扣款／晚期退階、交易重試／衝突、各角色 loot、缺件優先、兌換、持久商店、5000 件背包、自然復甦／護命、taunt、四套裝與非連鎖、存讀／下一手／遷移。輸出 `artifacts/equipment-core-target-test.txt`。
- V1/V2 與修改前備份逐事件 deep equality：各 100 固定 seed，共 **200 cases / 18,475 events**；含 effects、完整 state、V2 整備及下一手，全部相同。證據 `artifacts/equipment-v3-v1-v2-equivalence.json`。
- `node --check`：三核心模組及分析腳本均通過。

## 平衡診斷

執行 `node tests/cultivation-equipment-analysis.cjs balance 250`，耗時 **505,368 ms**。五打法 mixed/burst/sustain/counter/stealth，各 200 train＋50 獨立 holdout seeds；輪換 hero／seat，每個樣本與相同 hero／打法／seed 空裝比較。散裝、四套裝各 +0/+6/+10，加空裝合計 **20,000 個受控戰鬥**，產生 150 組彙總。

- 彙總傷害最大增幅 **9.374%**（holdout、counter、散裝+10），低於本診斷的15%目標。
- 同強化等級各 build 的最大平均傷害差 **2.883%**，低於10%目標。
- 散裝及五相使用 grade5，其餘套裝依掉落使用 grade4；比較範圍包含此品階差異，未把它說成所有裝備完全同品階。
- 此處為受控 64 次 discard 及技能事件模型，傷害比是分組平均；不保證每名角色、每個 seed、所有合法手牌與實玩情境都落在目標內，也不是麻將合法組牌頻率證據。
- 完整結果與三核心 source hashes：`artifacts/equipment-v3-balance.json`。引擎在長跑期間未變更，腳本結尾比對 hash 通過。

## 1000 旅程經濟診斷

執行 `node tests/cultivation-equipment-analysis.cjs economy 1000`，耗時 **90,798 ms**。1000 個獨立新旅程，每個跑完整 28 擊殺週期、每手一次受控終式擊殺，共 **28,000 次擊殺／合法核心結算轉換**；此模型刻意排除未擊殺退階，並不代表實際合法麻將的擊殺速度。玩家0只在部位空缺時最多買1件、每整備最多強化3次並保留30金，NPC 使用實際整備 AI。

| 玩家0指標 | 1000旅程結果 |
|---|---:|
| 每週期 gold 收入（含擊殺、尾刀、28手結算） | 2116 |
| 每週期 sand 收入 | 66 |
| 平均 gold 支出 | 1598.420 |
| 平均 sand 支出 | 60.596 |
| 平均剩餘 gold／sand | 637.580／5.404 |
| 平均強化次數 | 28.749 |
| 強化退階總次數 | 177 |
| 平均套裝件數 | 2.483 |
| 首次達+6 | 983／1000；第11..28手，中位第20手 |
| 達+10 | 0／1000，觀測期間未達，不估算首+10時間 |
| 取得完整3件套 | 0／1000 |

單一週期每個套裝來源僅擊殺1次、僅取得1枚對應王印，故沒有完整3件套是觀測長度的直接限制；這份資料不能推導多週期滿套時間。指定兌換、相同來源後續掉落缺件優先、+8..10成功／失敗／退階另有功能測試。每個樣本均檢查 `期末錢 = 120 + 收入 - 支出` 及 sand 守恆。結果含完整1000列與 source hashes：`artifacts/equipment-v3-economy.json`。

## 跨多循環取得分布（純經濟快速模型）

另執行 `node tests/cultivation-equipment-long-economy.cjs 1000 100`：1000 個獨立旅程，設右截尾上限 **100循環＝2800次受控擊殺**，每個樣本在首次+10與完整套裝皆已觀測後停止。最終 **1000／1000均在上限前達成，截尾0**，耗時 **15,359 ms**。

此模型沿用正式 source 中的 loot/shop/forge RNG、掉落、成本、退階及私有交易 helper；只在獨立 Node module 暴露原私有 helper，沒有改寫正式檔或交易數學。每次固定一擊殺及一次手局補助，循環嚴格為18小怪／6菁英／3種不同小王／1王。只模擬玩家0，不模擬戰鬥、其他三人的狀態或合法麻將頻率；省略每筆 Combat.validate／clone／command receipts 成本。

策略：只在部位空缺時最多買1件，王印滿2就兌換尚缺部位，依正式選裝優先規則選裝，每次最多強化3次且保留30金，依武器／防具／飾品順序處理相同最低等級。首次滿套後用等價的完整套裝評分加速；每28次擊殺與正式 selectGear 深比較一致，並執行 Economy.validate。此政策不買材料、不分解，因此不同於所有可能的玩家操作；與前節單循環診斷的購買政策也不同，兩表不可直接當同一政策的續跑。

| 里程碑（受控擊殺數，每次固定配一次結算） | 觀測／截尾 | 最小 | P10 | 中位數 | P90 | 最大 | 平均 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 首次+6 | 1000／0 | 17 | 18 | 23 | 28 | 36 | 23.072 |
| 首次完整3件套（任一套） | 1000／0 | 37 | 37 | 46 | 65 | 93 | 48.710 |
| 首次+10 | 1000／0 | 69 | 111 | 168 | 293 | 718 | 187.905 |

累計 **187,905 次受控擊殺**，gold收入14,088,736／支出6,834,155，sand收入436,702／支出435,198；**119,615次強化**中成功85,986、失敗33,629，**23,354次退階**，4,589次王印兌換。逐次資源守恆及保留30金檢查全部通過。結果含每旅程完整列與 source hashes：`artifacts/equipment-v3-long-economy.json`。

這是完美受控擊殺條件下的經濟取得分布，**不能換算成真實麻將局數、遊玩時間或一般玩家達成速度**；強化失敗及強化退階已納入，未擊殺導致的征途退階、流局未殺與王戰回退等實玩因素不在此快速模型內。前節單循環未取得+10／滿套，僅是截短觀測，不是取得難度結論。

## 實際合法麻將 BOSS 診斷

執行 `node tests/cultivation-equipment-legal-boss.cjs 80`：**80局全部結束、51局擊殺受控滿血 BOSS**，耗時 **81,366 ms**。空裝與五種 build×三強化等級共16條件各5局；使用真實麻將 AI 流程，每10步檢查144張實體牌數量／唯一性與 Combat.validate，沒有卡死或不變量失敗。

證據 `artifacts/equipment-v3-legal-boss.json` 保存使用的 inline engine 與三核心 hashes。初始 BOSS／裝備為受控 fixture，屬 VM 引擎測試，並非瀏覽器 CUA 或實體手機。

## Self-review／獨立審查

- Self-review 核對戰鬥 version gates、RNG 流、交易原子性、儲傷與計量、商店持久性、AI資源保留、所有保存欄位驗證及 V1/V2 等價性。
- 獨立審查定位：裝備追加餵入 delayed mark 形成連鎖；終式遺漏裝備段；裝備追加未繼承終式劫印。已以獨立 extraDamage/extraHits 計量、snapshot 排除追加、明確 equipment 分段與 basic/finisher 繼承修正。
- 四條 set/storage × damage/hits 連鎖差分、JSON存讀及終式總和／劫印回歸已加入測試。審查者另外覆核追加歸屬、先追加後建立 snapshot、非法 counter、nextHand reset 及 legacy／七搶一／八仙總和；R1/R2/R3 均關閉。獨立紀錄 `docs/EQUIPMENT_CORE_V3_REVIEW.md`。
- 可重現 diff：`artifacts/equipment-core-v3-review.patch`，既有 Combat 相對本次工作最早備份，其餘新增檔相對空檔。沒有 git commit。

## 邊界與剩餘風險

- UI 的保存成功才發布、操作鎖、桌機／手機／橫向實操，以及正式入口 script 載入與 V3 opt-in，皆需 UI 整合工作驗收；核心測試不代替這些驗收。
- 一週期及跨多循環純經濟取得分布均已觀測；真實合法麻將流程的多循環達成時間仍未驗證，不以快速模型推定實玩時間。
- 平衡達標僅指上述固定情境的分組平均，不是所有實玩情境保證。沒有改動核准的數值來美化結果。
