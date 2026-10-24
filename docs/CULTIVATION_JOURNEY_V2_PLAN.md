# 修仙旅程 V2 執行契約

使用者已批准玩法規格與首批 5 張樣圖，2026-10-23「可」授權繼續完成。正式專案；保留一般模式與舊修仙規則。修改現有檔前複製 `.bak.<timestamp>`。不提交 Git。獨立測試、實際瀏覽器與實機證據分開。

## 共用介面與責任

- 戰鬥工作者：`cultivation-heroes.js`、`cultivation-monsters.js`、`cultivation-combat.js` 及新的純戰鬥測試。不得改 index/UI/harness。
- 介面工作者：`index.html`、`start-screen.js`、`cultivation-ui.js/css`、新的 `cultivation-journey-ui.js/css`、`tests/game-harness.cjs` 與新流程測試。不得改戰鬥/資料模組。
- 主工作者：素材、素材 manifest、預覽與驗證報告、整合驗收。
- UMD 資料 API：`MahjongCultivationHeroes` / `MahjongCultivationMonsters`，各有 `all` 陣列、`get(id)`；英雄 `{id,name,role,stats:{damage,defense,healing,shield},passive:{name,description},image}`；怪物 `{id,name,tier,element,hp,single,all,armor,shield,image,...}`。
- 素材固定路徑：`assets/cultivation-journey/heroes/<id>.png`、`monsters/<id>.png`、`npcs/merchant.png`、`npcs/blacksmith.png`、`preparation-courtyard.png`、`slots/weapon.png`、`slots/armor.png`、`slots/accessory.png`。
- `Combat.create(seed, previous=null, options={})`：無 options 沿用 V1。新旅程傳 `{heroId:'shen-gufeng'}` 建立 V2，pid0 使用選定英雄，AI 三人從剩餘不重複抽選。previous.version===2 則延續 V2。
- V2 仍保留玩家既有 `characterId` 身分，另有 `heroId`、`equipment:{weapon:null,armor:null,accessory:null}`、`passiveState`。所有 heroId 互異。
- V2 `state.journey` 保存循環、擊殺計數、抽選袋、待重戰小王等；`state.journey.phase` 為 combat/result/preparation。ended 後先 result，點前往整備才 preparation；下一次 create(previous) 啟動下一局。phase 切換不可重算傷害、劫印或怪物。
- `Combat.journeyPreview(state)` 為唯讀：回傳 `{message,nextMonsterId,nextMonsterName,progress}`，供整備顯示；不得消耗 RNG。若 API 需要調整先與另一位工作者聯絡。
- 所有資料驗證集中 Combat.validate；新欄位只對 version2 必需，version1 仍可繼續並標舊版旅程。不要升級正在打的舊旅程。

## 流程

新旅程：選角 → 麻將戰鬥 → 傷害結算 → 前往整備 → 開始下一局。四人角色整段旅程固定，所有人可使用全部技能。角色不改配牌/摸牌機率/合法操作。

每局傷害重設；擊殺與角色跨局。下一局 HP 全滿，護盾/一般狀態/仇恨/攻擊計數重設，劫印沿用既有期限。重開論道/重新開始修仙旅程清除旅程與劫印，重新選角。續局恢復精確 phase，不重播事件。一般模式不出現此 UI。

整備：英雄圖、四能力、被動與下局劫印；武器/防具/飾品三空欄；雲遊商人標「商品與交易規則待開放」；鑄器師標「強化規則待開放」；征途/下一怪/回滿重戰或退階說明。無假商品價格及無效果按鈕。保持現有手牌整排可見與設定位置。

## 英雄

HP 全1000。damage/100 作用全部傷害一次；防禦106代表承傷*.94、98代表*1.02，乘既有減傷。healing/shield /100。自然復甦30%不受治療倍率。所有轉傷以有效量，保留上限與非連鎖。次數每局重設。

|id|名稱/定位|傷害/防禦/治療/盾|被動|
|---|---|---|---|
|shen-gufeng|沈孤鋒/劍修|104/100/98/98|劍意：第3/6/9…次自己的出牌，該次普攻+10基礎，每局最多5次|
|chi-ling|赤綾/火修|106/98/98/98|燃心：每隻怪首次攻擊技能基礎+5%，整招最多25，多段一次；跨局同怪可再觸發|
|mu-canglan|沐滄瀾/水修|102/98/102/98|回潮：成功吃後回血25，每局最多3次|
|su-lingheng|蘇靈蘅/醫修|96/100/108/96|返生靈息：有效治療15%儲為下一普攻加傷；儲存上限30，每局產生上限60；自然復甦、溢補、被動自身回復不計|
|yue-zhenshan|岳鎮山/體修|98/106/96/100|鎮岳：自己是最高仇恨有效目標時額外減少3%怪物傷害|
|luo-xuanyu|洛玄玉/盾修|96/102/98/104|凝玉：盾實際吸收15%儲為下一普攻；儲存30/每局產生60；過期/主動消耗盾不計|
|tie-wujiu|鐵無咎/反擊|100/104/98/98|回鋒：兩次自己出牌之間首次受怪物攻擊後反擊15基礎，最多5次/局，虛弱不觸發，非連鎖|
|ye-shuying|夜疏影/隱修|102/98/100/100|斂影：新增仇恨*.92，不改舊值，不破壞挑釁取得最高仇恨保證|
|yun-zhiwei|雲知微/術修|100/100/100/100|變訣：吃/碰/明槓/暗槓/加槓種類與上次不同且本次有直接攻擊，整招+10基礎，最多6次；首次不觸發|
|hua-jianlu|花見鹿/花修|100/100/100/100|靈華：每張新公開花回血15+盾15，最多3次；起手花計入，讀檔不重觸發|

玩家資訊可查被動剩餘次數與轉傷儲存量。所有治療/盾/增益只自己。

## 怪物

3小怪→菁英；2菁英→小王；3小王→BOSS。未滿2菁英回小怪；小王擊殺重設小怪/菁英數、保留小王數；BOSS擊殺全重設、循環+1，小怪重來，難度不成長。完整一輪18小怪6菁英3小王1BOSS。整招完成再換怪，擊殺BOSS不結束麻將。

小怪/菁英分開無放回抽選袋；同次解鎖BOSS的3小王不重複。怪物species id與遭遇唯一id分開。保留唯一擊殺紀錄與擊殺者，不發未定義物品。

任何結束方式（胡、花胡、流局、全弱）未擊殺：小怪/菁英同怪下局滿血；小王退小怪，重設小怪/菁英數，保留已殺小王數並記住未完成小王，重新達標挑戰同一隻；BOSS失敗所有計數歸零，下局直接菁英開始，再累積3小王。退階不是擊殺。重戰清負面/蓄力/盾/出手數，重建原生盾重新抽預告。

每4合法出牌攻擊、最高仇恨與五行保持；普通單體2/3全體1/3，特定招優先。蓄力125%，可打斷。兩段攻擊總量不加，算一次怪物攻擊。表中「每3」是每第3次出手。取消出手亦計BOSS屬性輪轉。

|id|名稱|tier|元素|HP|單/全|特色|
|---|---|---|---|---:|---|---|
|whetgold-rat|礪金鼠|small|metal|1200|145/65|護甲12%|
|bladefeather-crow|刃羽鴉|small|metal|1250|145/65|首次出手+10%|
|binding-vine|纏枝木妖|small|wood|1250|140/65|每3回血60最多2次|
|moss-flower|青苔花妖|small|wood|1200|135/70|每3使命中者治療-5%持續1次自己出牌|
|coldpool-spirit|寒潭水靈|small|water|1250|140/65|每3出手前削目標盾最多20，不扣血|
|frostfang-wolf|霜牙狼|small|water|1300|150/65|單體兩段|
|embertail-fox|赤尾狐|small|fire|1200|150/70|每3附灼傷：自身出牌10傷×2次|
|molten-shell-beetle|熔甲蟲|small|fire|1300|145/65|登場盾80|
|stoneback-boar|岩背豕|small|earth|1400|145/65|甲12%|
|sand-construct|砂魄傀儡|small|earth|1350|140/70|每3加盾60最多2次|
|golden-tiger|金魄白虎|elite|metal|1900|160/80|每3單體蓄力|
|forest-vine-demon|森羅藤妖|elite|wood|2000|150/80|每3回血100最多2次|
|abyss-jiaolong|玄淵蛟龍|elite|water|1900|155/80|每3全體，命中者盾取得-8%持續2自己出牌|
|blazing-lion|焚天獅獸|elite|fire|1850|170/85|每3全體蓄力|
|mountain-colossus|鎮山岩魁|elite|earth|2100|155/75|盾200甲15%|
|blackarmor-general|玄甲鎮岳將|miniboss|earth|2600|180/90|盾200，每3單蓄力|
|nether-vine-queen|九幽藤姬|miniboss|wood|2500|175/90|每3全體後回血120最多2次|
|crimson-sword-demon|赤霄劍魔|miniboss|metal|2600|185/95|普通單體2段，每3全體蓄力|
|five-phase-sovereign|五相劫尊|boss|metal|3000|195/95|每2次出手依金木水火土換屬性，每3全體蓄力；換屬性不清狀態或仇恨|

一般甲：small10%、elite12%、miniboss/boss15%。

## 驗證與交付

純規則逐一驗證10被動、19怪行為、重戰退階、完整循環、唯一擊殺、存讀檔去重、自然復甦/溢補/護盾轉傷/連鎖排除。原有普通/舊修仙回歸不可退化。

200固定種子輪替角色座位，比較爆發/治療防禦/反擊/降仇，再留出種子驗證。平均傷害差距目標約10%，不能傷害生存仇恨全面領先。無裝備BOSS合理可殺。

瀏覽器桌機、手機直向、矮橫向檢查選角/整備/怪預告/空裝備欄/手牌整排。僅使用CUA瀏覽器操控與DOM唯讀evaluate，不用CLI Playwright。測試localhost:8765，不改使用者file或127.0.0.1存檔。

35張點陣圖、不用SVG。英雄/怪長邊>=1536，透明背景安全邊距；場景目標2048x1152。上古神兵：古銅青玉玄鐵五行靈光。不同輪廓、武器角尾翼完整。文字由UI畫，不烘入圖。圖片不足解析度必須明示，不假稱通過。
