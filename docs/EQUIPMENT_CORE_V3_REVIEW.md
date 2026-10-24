# Equipment V3 核心獨立審查

審查基準：`docs/EQUIPMENT_V3_CONTRACT.md`、`docs/EQUIPMENT_V3_API.md`、`artifacts/equipment-core-v3-review.patch` 及工作區對應實作。範圍為資料、戰鬥、經濟、API，相容性與驗證；UI、美術及瀏覽器整合不在本次核心缺陷判定範圍。

結論：初次審查發現 3 項可重現問題；核心實作者修正後，本次覆核已確認 R1、R2、R3 關閉。指定核心範圍的 spec compliance 與 correctness 審查通過，未發現其他可重現的阻擋問題。下列 R1–R3 保留修正前證據；修正後驗證詳見文末。

## 🔴 R1 / P1：裝備追加傷害仍會連鎖提升延遲追斬

- 位置：`cultivation-combat.js` 的 `deal`（初審第863–864行）、`scaleValue` 的 `ownDamageSinceMark/ownHitsSinceMark`（643–649）、`cast` 裝備儲傷合併（1235）。
- 契約：套裝／裝備追加傷害不得連鎖追擊／吸血／反擊／儲傷。
- 根因：`equipmentExtra` 只禁止即時觸發，仍直接累加 `p.damage` 與 `p.hits`。延遲技讀取這兩個累計值，因此把追加再次轉為傷害。一般裝備的 stored 直接合併 basic 的 flat，亦無法從後續標記計量排除。
- 重現：`Combat.create(123,null,{heroId:'yun-zhiwei',equipment:true})`，三件鎮岳 grade5/+0，先施 `B.concealed.8888`，再設 `zhenyueMeter=100`，W1 discard，然後 enemy（攻擊傷害0以隔離變數）。普攻46＋岳返9，延遲追斬135；相同輸入但 meter0，普攻46，延遲追斬131。
- 同一根因另兩個分支：`W.concealed.9999` 依命中計量時，延遲247→284；改戴青蘅拂塵，`stored=10/generated=10`，`B.concealed.8888` 後普攻46→55、延遲131→135。
- 建議：保留排名總傷害，但讓延遲效果的傷害／命中計量排除裝備追加（含 basic 內的裝備儲傷差額）。新增上述三個差分案例，並保留角色原有儲傷行為。

## 🟡 R2 / P2：五相終式追加未計入 finisher 結算

- 位置：`equipmentAfterCast` 設定 `segmentId='equipment'`，以及 finish 分支組合 `finisher.parts/total`（初審第1872–1879行）。
- 根因：named finisher 只收 `finisherPart` 與 followup；equipment 段沒有對應 part，因此總傷害與已施放 damage 不一致。
- 重現：同 seed123、雲知微，三件五相 grade5/+0，`wuxiangCount=2/wuxiangElement='water'`；finish `{pid:0,fan:1,items:[{id:'pure-flush',fan:1,suit:'W'}]}`。damage effects 合計291，`finisher.total=277`，漏掉 equipment14。
- 建議：獨立列 equipment 段，同時更新 finisher validator；legacy／花胡 fallback 要避免先計入再重加。測試 named、legacy、花胡結果均與對應 effects 傷害總和一致。

## 🟡 R3 / P2：終式觸發的裝備追加未吃終式劫印

- 位置：`equipmentAfterCast` 建立新 context（初審第1305–1307行），`deal` 呼叫 `Finishers.factor`。
- 契約：裝備追加吃元素／護甲／虛弱／劫印。
- 根因：新 context 未繼承原招 `finisher`，使 finish 類劫印不適用該段。
- 重現：R2 場景加入 `Finishers.curses([{id:'single-wait',fan:1}])` 的 finish -10% 劫印。主體277→249，但 equipment仍14；應為 `round(15 * 1.04 * .88 * .9)=12`。
- 建議：追加 context 保留來源招的終式分類，並以相同武器／護甲／元素條件驗證劫印只乘一次。

## 已核對與驗證界線

- catalog 27款、同類能力相加、王印兌換與未持有套裝部位優先、每角色獨立 RNG、強化失敗扣款／退階、移轉來源清零、交易副本與 commandId 去重、整備商店持久化、V2 僅 prepare 遷移等路徑，未發現新的具體阻擋缺陷。
- AI 僅讀自身背包／商店／資源，最多買1件、強化3次且保留30金；未見讀取他人手牌。V1/V2 的版本條件保留其既有分支。
- 本次未重跑已回報的 822/822 全套；該數字是主代理提供的既有驗證，非本審查新增執行。新增驗證為上述 Node 差分重現，所有結果均成功產生。
- 初審時 `docs/EQUIPMENT_CORE_V3_REPORT.md` 尚未存在；平衡與1000旅程分析不在上述通過判定內。程式修正後需更新對應 source hash，舊 hash 的分析不得冒充新版本結果。
- 未修改任何核心、測試或資料檔案；只新增本報告。

## 修正後覆核

- R1 已關閉：裝備 stored 改成獨立追加段；`equipmentState.extraDamage/extraHits` 只記裝備追加，排名仍計完整總傷害。context、buff、mark 記錄建立當下的裝備追加基準，兩種延遲 scale 扣除基準後增量，保留角色原有儲傷與一般命中。
- R2 已關閉：named finisher 與 fallback 均將 equipment 獨立列段，fallback 先排除此段以避免重複計入；只有 V3 validator 允許 equipment segment。
- R3 已關閉：追加 context 繼承來源 basic／finisher，終式劫印對追加生效；重現的14傷在 -10%終式劫印下成為12。
- 執行 `node --test --test-name-pattern="equipment set/storage|finisher includes" tests/cultivation-equipment.test.cjs`：2 tests / 2 pass / 0 fail。第一個測試涵蓋 set／storage × damage／hits 四個連鎖分支，含 JSON 存讀；第二個涵蓋追加段總和與終式劫印。
- 額外唯讀 Node assertions 全數通過：追加只歸屬原角色、先有追加再建立 mark 的 snapshot 正確、JSON 存讀、負數與超過角色累計的 extra counter 被拒、下一手 extra counters 和 statuses 歸零、legacy／七搶一／八仙過海 finisher totals 與實際 effects 相符。八仙過海明確觸發 equipment 段且總和1402；legacy與七搶一保持其有效元素行為，未憑空觸發。
- 更新後 patch、API 與程式對新增欄位及獨立追加段的說明一致。修正沿用既有 context／純轉換架構，無新增外部依賴或非必要重構；維護性未見需阻擋的問題。
- 本次仍未重跑全套或長期平衡分析；這些結果由核心實作者另行產出。UI／瀏覽器與完整產品驗收仍不在本報告範圍。
