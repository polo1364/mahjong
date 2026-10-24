# 裝備 V3 UI / 存檔整合報告

## 實作範圍

- `index.html` 載入裝備資料、經濟與 UI 模組；正式新選角明確傳 `equipment:true`。
- V2 結算進整備採 `prepare(combat,{equipment:true})`，保存 V3 候選狀態成功後才發布 `S`。失敗保留原 V2 和同一候選快照，按「前往整備」重試。
- `writeGameSave(key,candidate)` 可保存尚未發布的候選狀態；維持原 `S` identity / phase 檢查。交易保存中拒絕舊 `S` 的一般 auto/manual save，避免舊快照在新交易之後覆寫。
- 三頁籤「行囊配裝 / 雲遊商人 / 鑄器師」保留英雄、征途、同行道友、返回首頁和下一局入口。
- 行囊提供部位 / 品階 / 套裝 / 強化篩選、同部位比較、換裝後套裝件數與效果（折疊展開完整套裝全景，contain 不裁切）、穿戴 / 卸下 / 鎖定 / 分解。強化過及套裝分解須明確確認，已穿及鎖定裝備不可分解。
- 商人呈現固定六件庫存、售罄、30金換3靈砂且每整備限3包、四套指定部位王印兌換。
- 鑄器師顯示正式 API 機率 / 金幣 / 靈砂 / 失敗後等級，另有完整機率表；強化失敗照常保存扣款與退階。移轉先顯示來源 / 目標前後等級及費用確認。
- 所有交易僅用 `Economy.transact`。保存 true 才發布；false / throw 保留原狀態，同 commandId、同候選、同 RNG 結果重試。保存與失敗待重試期間封鎖所有交易和導航；Home 保存期間封鎖交易。
- V3 延續英雄名 / 立繪 / 妖獸圖片 / 角色資訊入口 / 結算與整備路由；角色詳情新增裝備、套裝和被動計量；結算呈現每人本局金幣 / 靈砂 / 王印 / 道具，戰鬥提供不攔牌面的輕量獲得通知。
- 移轉及分解採庭院面板內 HTML 確認，提供完整來源 / 目標 / 前後等級 / 費用、確認與取消、Escape 取消；確認期間鎖交易及導航。取消不建立交易、不存檔；確認後 save false 直接保留原候選重試，不要求重複確認。
- 修復 F1：帶 carry 開下一局不清除已 commit 的庭院 autoSave，待下一局正常保存覆寫；freshJourney 仍清除。
- 修復 F2：恢復舊 V2 preparation 時導向現有 save-first 遷移，成功才開 V3 庭院，失敗可從結算重試。
- 保留 V1 與不 opt-in 的核心 V2 建立行為。未修改 combat / economy / catalog 核心。

## 修改與新增

既有檔案在本次首次修改前已各自建立 `.bak.20261023-200519-122`（實際時間以檔名為準）：

- `index.html`
- `start-screen.js`
- `cultivation-ui.js`
- `cultivation-journey-ui.js`
- `tests/game-harness.cjs`
- `tests/cultivation-journey-flow.test.cjs`

新增：

- `cultivation-equipment-ui.js`
- `cultivation-equipment-ui.css`
- `tests/cultivation-equipment-ui.test.cjs`
- `tests/cultivation-equipment-flow.test.cjs`
- `tests/cultivation-equipment-preview.html`
- `tests/equipment-ui-v3-regression.txt`
- `artifacts/equipment-ui-v3-review.patch`

## 驗證

`node --test tests/cultivation-equipment-flow.test.cjs tests/cultivation-equipment-ui.test.cjs tests/cultivation-journey-flow.test.cjs`

結果：25 tests / 25 pass / 0 fail。

涵蓋：save-first、待存封鎖、false / throw 同交易重試、強化真實失敗退階及全額扣款、無效交易不存檔、來源改變拒絕發布、HTML 確認取消零交易 / 確認後失敗同候選重試、新選角 V3、V2 遷移失敗重試、候選保存 / 舊 autosave 阻擋、F1 下一局保存保留 / F2 舊 V2 整備恢復遷移、原 journey 導航與讀回流程。

`node --test tests/*.test.cjs`

結果：842 tests / 842 pass / 0 fail / 0 skipped，35.74 秒。輸出：`tests/equipment-ui-v3-regression.txt`。

`node --check cultivation-equipment-ui.js`、`cultivation-journey-ui.js`、`cultivation-ui.js`、`start-screen.js` 均通過。

## CUA 驗收 fixture 與界線

開啟 `/tests/cultivation-equipment-preview.html`，按「建立資源充足庭院」。fixture 使用正式 Combat / Economy / JourneyUI / EquipmentUI，僅測試起始物品與資源由 fixture 種入，保存至獨立 sessionStorage key `mahjong-equipment-v3-fixture`，不碰正式 IndexedDB。

- 5000金、500靈砂、王印各8、14件裝備、完整鎮岳 / 五相套；赤霄劍+7、同部位玄符杖+1。
- 固定 forge seed `0x12345678`，第一筆 +8 強化實際抽樣失敗、退到+6。
- 庭院內測試按鈕可讓下一交易保存回傳 false；700ms 保存延遲可觀察操作與導航鎖定。
- 返回首頁後「讀取已保存庭院」和「重新載入本頁驗證」可檢查商店、資源、裝備及指令回執不重抽；「顯示個人掉落／裝備說明」展示資訊 markup。

桌機 1440×900、手機 390×844、橫向 844×390 的實際 CUA 驗收由主代理執行後補充；本報告的 Node 通過不代表瀏覽器或實機已驗收。設備圖檔與特效 V3 門檻由主代理整合驗證。未進行 commit。
