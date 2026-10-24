# Equipment V3 API

載入順序：`cultivation-skills.js`、既有英雄/怪物/終式，`cultivation-equipment.js`、`cultivation-economy.js`、`cultivation-combat.js`。UMD globals 為 `MahjongCultivationEquipment` 與 `MahjongCultivationEconomy`，CommonJS 亦可直接 require。

新旅程：`Combat.create(seed, null, {heroId, equipment:true})`。只有 heroId 保持 V2，無 heroId 保持 V1。
V2 結束後：`Combat.prepare(combat,{equipment:true})` 建立 V3（120 金、空背包，不追發過往擊殺或手局補助）。當前 V2 戰鬥不能遷移。V3 使用 `Combat.prepare(combat)`；再次呼叫不抽商店，不重做 AI。
下一手：`Combat.create(seed, preparation)` 保留經濟／裝備／商店／RNG／指令回執，重設 `equipmentState` 與 `handLoot`。讀存檔直接 `Combat.validate(saved)`，不要為讀檔重建旅程。

## 單一交易入口

```js
const command = {commandId:'unique-operation-id', pid:0, type:'buy', stockId};
const {state:next, result} = Economy.transact(current, command);
if (result.ok) {
  // 鎖住所有交易與導航，await save(next)。只有 save 成功後才發布 current=next。
  // save false / throw 時保留原 current，重試使用完全相同的 command。
}
```

無論成功／失敗都不修改輸入。失敗 `{state:原狀態副本,result:{ok:false,code}}`；成功 `{state:新狀態,result:{ok:true,code:'ok',...}}`。指令 ID 每角色永久去重；同 ID、同參數再呼叫回 `{duplicate:true}`，同 ID 異參數 `command-conflict`。準備階段以外只有已完成指令可讀回去重結果，其他 `preparation-required`。不消耗戰鬥或麻將 RNG。

| type | 參數 | 成功 result 附帶欄位 |
|---|---|---|
| equip | uid | item |
| unequip | slot (`weapon/armor/accessory`) | 無 |
| lock | uid, locked:boolean | item |
| dismantle | uid, confirm:true（強化過／套裝必須） | sand |
| buy | stockId | item |
| material | 無（30金→3砂，每次整備上限3包） | sand:3 |
| redeem | setId, slot | item（2王印→指定部位+0） |
| forge | uid | uid,before,after,target,success,roll,rate,gold,sand |
| transfer | sourceUid,targetUid,confirm:true | before:{source,target},after:{source,target} |

常見 code：`equipment-unavailable`、`invalid-command`、`command-conflict`、`preparation-required`、`unknown-item`、`invalid-slot`、`invalid-lock`、`locked`、`equipped`、`confirmation-required`、`unknown-stock`、`sold`、`insufficient-funds`、`material-limit`、`invalid-redemption`、`insufficient-seals`、`maximum-level`、`invalid-transfer`。任何失敗皆不扣錢、不耗 RNG、不記成功回執。

UI 必須在 dismantle 強化／套裝時明確確認、transfer 顯示兩件前後強化值後送 `confirm:true`。`forge` 的升級失敗也是成功執行交易，`result.ok===true && success===false`，必須保存扣款及退階結果。

## 狀態

`combat.version===3`；`combat.economy={journeyId,migrated}`。每個角色：

```js
player.equipment = {weapon:uidOrNull, armor:uidOrNull, accessory:uidOrNull};
player.economy = {
  gold:120, sand:0, seals:{zhenyue:0,jiuyou:0,chixiao:0,wuxiang:0},
  inventory:[{uid:'p0-1',catId:'chi-xiao-sword',grade:1,level:0,locked:false}],
  serial:1, unlockedGrade:1,
  rng:{loot:uint32,shop:uint32,forge:uint32},
  shop:null, // 到整備時為 {hand,grade,stock:[{id,catId,grade,price,sold}],materialBought,aiDone}
  receipts:[], creditedKills:[], settledHands:[],
  handLoot:{gold:0,sand:0,items:[],seals:{}} // items 是本手獲得 uid，可查 inventory
};
player.equipmentState = {
  stored:0,generated:0,extraDamage:0,extraHits:0,discardHeals:0,discardShields:0,
  zhenyueMeter:0,zhenyueUses:0,jiuyouMeter:0,jiuyouUses:0,
  chixiaoCount:0,chixiaoUses:0,wuxiangCount:0,wuxiangElement:null,wuxiangUses:0
};
```

新旅程第一局 `shop:null`，無提前購買。整備為已結束手局的 handNumber；下一局保留舊商店，但進入下一次整備才建立新商店。`handLoot.gold` 含擊殺及合法結算30金，items 不含購買／兌換，王印記在 seals；不因整備換裝改排名。

`extraDamage/extraHits` 為內部防連鎖累計，排名 damage/hits 已包含追加，不要再次加總。追加事件 `skillId:'equipment',segmentId:'equipment'`，裝備儲傷及套裝追加都是整招末獨立傷害段，且 `finisher.parts` 包含裝備段；其 damage 已計入 finisher.total。其來源basic/finisher劫印繼承原招，不能餵入延遲mark的傷害／命中數計量。

## 純查詢

`Equipment.all`：27款 immutable catalog。每件 `{id,name,slot,setId,ability,value,description,image}`。
普通 ID 依契約；套裝 ID 統一 `set-<setId>-<slot>`，如 `set-zhenyue-armor`。此規則避免與普通 `zhenyue-armor` 撞名，setId 仍為 `zhenyue`。
`Equipment.sets`：4套 `{id,name,source,grade,names,description}`。
`Equipment.slots` 三部位、`grades` 凡靈玄地天、`base=[2,2.5,3,3.5,4]` 百分點。
`Equipment.get(catId)` → catalog/null。
`Equipment.equipped(player)` → 穿戴實體 item 陣列。
`Equipment.bonuses(player)` → 加總小數加成與 `sets:{setId:件數}`；damage/taken/heal/shield/basic/active/counter/topTaken/aoeTaken/aggro/healStore/shieldStore/discardHeal/discardShield。
`Equipment.factor(player,kind,context)` → 倍率；damage context `{basic,counter,active}`；taken `{top,aoe}`。其他 kind 為 heal/shield/aggro。
`Economy.prices/rates/goldCosts/sandCosts` immutable 陣列，index 分別為 grade-1 或目標強化等級-1。

`Economy.init/creditKill/settle/prepare/nextHand/selectGear` 僅供 Combat 私有副本 hook 或測試，會修改傳入副本；UI 只用 transact，不得直接呼叫 hook 或更動背包／RNG／回執。AI 在 Combat.prepare 自動處理 pid1..3：最多買1件，再自動換裝、最多強化3次，保留30金；不看手牌。
