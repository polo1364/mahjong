# 裝備 V3 最終整合獨立審查

範圍：`index.html`、`start-screen.js`、`cultivation-ui.js`、`cultivation-journey-ui.js`、`cultivation-equipment-ui.js`、對應測試及 UI patch。核心三項問題已由 `EQUIPMENT_CORE_V3_REVIEW.md` 覆核關閉。本報告不將 Node／VM 測試視為瀏覽器或手機驗收。

結論：初審的 F1、F2 已修正並由本審查獨立覆核關閉；指定整合程式範圍 PASS，未發現尚待修復的必要缺陷。本文保留初審證據及修正後驗證；此結論不代替主代理的瀏覽器／尺寸驗收。本審查未改動程式。

## 🔴 F1 / P1：延續下一手會刪除已提交的整段旅程快照

- 位置：`index.html` 的 `startNewSession`，無條件呼叫 `clearAutoSave()`。
- 觸發：V3 整備完成一次裝備交易且存檔成功後，點開始下一局。
- 根因：即使存在 cultivation carry，依然先刪除 auto save；新手建立後 `beginDealtHand` 沒有立即提交替代存檔。關閉／重載、發牌途中中斷或下一次寫入失敗時，已保存的整段錢包／裝備／征途不再有 auto save 可恢復。
- VM 重現：建立 V3 → finish(draw) → prepare → 攔截 `clearAutoSave` → `startNewSession('cultivation')`；記錄 `deleted:true`，新狀態仍為同一 V3 旅程下一手。此路徑並非「重開旅程」，不應清空已提交的旅程恢復點。
- 建議：carry 下一手保留原庭院快照，直到新手正常存檔覆寫。僅明確 fresh/new journey 保留原本清除語意；加測下一手首次寫失敗時舊恢復點仍在。

## 🟡 F2 / P2：恢復舊 V2 庭院會繞過正式 V3 遷移

- 位置：`index.html` 的 `restoreGame`，preparation 分支直接 `showCultivationPreparation()`。
- 觸發：載入原 V2、已結束且 `journey.phase==='preparation'` 的有效存檔。
- 根因：正式遷移只放在 `continueCultivationResult`；恢復 preparation 不經過該流程，UI 顯示舊空裝占位，開始下一局仍攜帶 V2。
- VM 重現：V2 create → finish(draw) → `Combat.prepare`（無opt-in）→ 構成有效完整遊戲存檔 → restore；得到 `shownVersion:2/phase:preparation`，Next 得 `version:2`。
- 建議：舊 V2 preparation 也走現有 save-first 候選遷移，保存成功才進 V3 庭院；失敗顯示可重試入口並保留原存檔／原狀態。

## 初審已核對

- 裝備交易先純計算候選，再 await 保存 true 才發布；false／throw 保留同 commandId、同候選及 RNG 結果，pending 封鎖交易與庭院導航。
- `writeGameSave` 對舊 autosave 的 state identity／journey phase 與交易鎖檢查，以及 IndexedDB transaction complete 提交點，未發現新的覆寫漏洞。
- 交易期間新旅程／restore 守衛、一般與修仙獨立 save keys、V1/V2 非 opt-in 核心隔離、品階／費用／退階 API 對應已核對。
- 主代理要求將移轉／分解 native confirm 改為頁內確認面板；這項修改尚待最終版檢查，應保留來源／目標前後數值、成本、確認與取消及保存鎖。
- 核心總報告 fresh-context read-back：四份分析 artifact 三核心 hash 均與目前檔案一致；長期模型1000列守恆、統計、分位數與截尾重算一致；滿套選裝優化與正式優先序等價。總報告已澄清強化退階有模擬，排除的是未擊殺的征途退階。此處只覆核證據，不重跑長模型。

## 修正後覆核

- F1 已關閉：`startNewSession` 改為只有 `!carry` 才清除 autosave。延續旅程保留已提交的庭院；明確新旅程仍保留清除語意。
- F2 已關閉：restore 舊 V2 preparation 先呈現結果／重試入口，再走既有 `continueCultivationResult` 候選遷移；保存 false 留 V2、不開庭院，重試成功才發布 V3。
- 獨立執行 `node --test --test-name-pattern="next hand preserves|restored legacy" tests/cultivation-equipment-flow.test.cjs`：2／2 通過。
- 頁內移轉／分解確認覆核通過：來源／目標現級與結果等級、30金／2砂、分解返砂及不退費均明示；確認期間 inert 主操作、停用 tabs／Home／Next，取消及 Escape 不交易，Tab 保持於兩個確認按鈕；成功確認後才呼叫單一 transactionSession。
- 獨立執行 `node --test --test-name-pattern="HTML" tests/cultivation-equipment-ui.test.cjs`：3／3 通過，涵蓋取消零保存、明確確認一次提交、分解 Escape、確認後 save false 保留原 S／鎖定及 retry 同候選／一次 receipt。這是最小 DOM surface 的真 handler 測試，不聲稱是真實瀏覽器。
- 交易存檔與導航鎖及重試邏輯保持單一路徑，未新增第二套經濟計算。新版 UI patch 與報告中的 F1／F2、HTML 確認描述與程式相符。
- `cultivation-effects.js` 三個門檻為 `>=2`／`<2`，V3 延用物種特效；V1 分支仍保留。核心三檔 hash 仍為初次核心覆核的凍結版本，未受 UI 修正改動。
- 本審查未重跑全套；UI 作者的最終完整測試輸出與主代理 CUA 結果應分開引用。程式審查已可結束，沒有以未執行的瀏覽器／手機測試宣稱通過。
