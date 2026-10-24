# 裝備經濟 V3 核准實作契約

使用者已批准實作下述規劃，2026-10-23。本機 Windows PowerShell，無 .git/package.json。改既有檔前逐檔建立 .bak.<yyyyMMdd-HHmmss-fff>；不commit，不碰無關功能。保留一般與V1，V2在下一次整備升V3，不補發過往擊殺。數據/功能可先實作，美術先3樣(weapon/armor/accessory)等待使用者確認，再製作其餘24裝備及4套裝圖。不得以SVG假圖替代；未核准圖片以既有部位空欄圖+明確「專屬圖待確認」呈現。

## 數據與能力
三部位weapon/armor/accessory。grade1..5凡/靈/玄/地/天；各品階base=[2,2.5,3,3.5,4]百分點，每強化+0.2百分點，最高10。武器增加所有傷害，防具降低承傷，飾品增加heal與shield。裝備同類加成相加，與角色/技能/劫印各乘一次；不影響自然復甦、護命保證、摸牌或規則。

15普通款(全部可有5品階)，固定特色不隨品質/強化變強，IDs採以下：
weapon chi-xiao-sword 赤霄劍 basic+2%；xuanfu-staff 玄符杖 主動組牌/花技/終式傷害+2%不含counter/followup；huifeng-halberd 回鋒戟 counter+4%；qingheng-whisk 青蘅拂塵 有效heal5%儲下次basic，stored<=10/generated<=20每局；ningyu-ringblade 凝玉環刃 實際shield吸收5%同上。
armor zhenyue-armor 鎮岳甲 自己有效最高aggro時怪物承傷額外-1%；liuyun-robe 流雲袍 monsterAoE承傷-2%；huichun-robe 回春衣 自己discard後heal5最多5次；xuanyu-robe 玄玉衣 自己discard後shield5最多5次持續2自己discard；yexing-robe 夜行衣 新aggro-3%。
accessory chiyao-pendant 赤曜佩 damage+1%；qingheng-pendant 青蘅墜 heal+2%；ningyu-jade 凝玉璧 shield+2%；yinxi-bell 隱息鈴 newaggro-4%；huifeng-seal 回鋒印 counter+3%。

4套各3件(共12款)，單件只有部位base無普通特色。以下順序武器/防具/飾品，id=set-<setId>-<slot>，避免普通鎮岳甲zhenyue-armor撞名。
zhenyue 鎮岳玄甲：鎮岳重戟/玄甲戰衣/山魄印，來源blackarmor-general 固定grade4；2件shield+2%；3件岳返：有效盾吸收每100，下一basic追加10earth；每次basic最多1，每局3。計量未用餘額可留當局，最多儲至剩餘觸發次數所需。
jiuyou 九幽靈藤：靈藤杖/幽蘅衣/返生墜，nether-vine-queen grade4；2件heal+2%；3件靈息：有效heal每100下次basic追加10wood，每次basic1每局3。
chixiao 赤霄劍意：赤霄古劍/劍紋袍/破霄佩，crimson-sword-demon grade4；2件damage+1%；3件三疊劍意：每3次直接傷害組牌(chow/pong/exposed/concealed/added)第3招末追加15metal，2次/局。
wuxiang 五相歸元：五相神兵/歸元法衣/輪轉璧，five-phase-sovereign grade5；2件heal/shield各+1%；3件五行輪轉：相鄰不同元素的3次攻擊技能(組牌/花技/終式)第3招末追加15neutral，2次/局；每整招僅第1段有效五行傷害決定元素，neutral不推進不重設，相同元素重設為1，觸發後歸0。
3件也有2件效果，按不同部位計件。套裝/裝備追加傷害歸原施術者、吃元素/護甲/虛弱/劫印，但不得連鎖追擊/吸血/反擊/儲傷；整招完才換怪。儲傷不計natural/overflow/裝備自heal，盾只實際吸收不計expire/consume。角色和裝備儲傷各自上限，下一basic各取一次。新被動每局reset存讀保留。回春/玄玉衣在既有discard效果後怪攻前，不增discardCount。降仇不破壞taunt最高保證。

## 獎勵與經濟
每角色獨立economy/inventory/shop/RNG。wallet初120gold，sand0，王印0，emptygear；第1局不提前購買。重開旅程清空，下一手保留。
擊殺small/elite/miniboss/boss：每人gold20/50/100/200、sand1/3/6/12、裝備chance .2/.5/1/1；killer另gold2/5/10/20。虛弱者仍獲得。
小王裝備60%自身套，40%普通；boss70%自身套，30%普通。套裝先隨機本人未持有部位(含背包/穿戴)，全有才重複。小王每人對應王印1，boss劫尊印1，每2枚換指定+0套裝，不收gold。
普通grade權重small=[70,25,5,0,0],elite=[15,50,30,5,0],mini=[0,0,40,55,5],boss=[0,0,0,20,80]。部位各1/3，款式各1/5。kill唯一monsterId+journey+actor歸屬，整招後發一次，不補舊kill。不擊殺/退階無獎勵。
每手合法結束(winning/flower/draw/allweak)每人gold30一次，重開/回首頁不發，無排名bonus。
shop最高grade初1，累積首次kill elite=>2/mini=>3/boss=>4，退階不降；每整備6件每部位2件，最高與前一品階各1(最低1)，同部位款式不同。價格grade1..4 60/90/120/150；每件限1，每角色獨立，進出/讀檔不重抽。材料3sand/30gold，3包/整備。套裝兌換常駐。無paid refresh/grade5直售/消耗品。
inventory無容量上限；每件uid/catId/grade/level/locked；三slots存uid。分解返sand grade1..5=1..5，不返強化費/王印/gold，已穿/鎖定不可分解，level>0或set需UI明確confirm。
強化目標1..10：rate=[1,1,.95,.9,.85,.8,.75,.5,.4,.3],gold=[20,25,30,35,40,50,60,75,90,110],sand=[1,1,2,2,3,3,4,5,6,8]。失敗全扣，目標<=7保留原level；目標8..10退原level1(7=>6,8=>7,9=>8)。不碎、不保底、不保護符。
移轉同slot source.level>target.level，cost30gold+2sand，source=>0 target=>source舊level，不相加、不改grade。需UI confirm兩件前後，locked來源禁止移轉。
AI同規則每整備最多buy1件、forge3次，保留gold>=30，選裝排序有效3/2set能力、風格特色、base，id穩定tie；買後換裝再強化目前最低level裝備，tie weapon/armor/accessory。不查看他人手牌。

## API與相容邊界
新增UMD MahjongCultivationEquipment(資料/能力查詢)與MahjongCultivationEconomy(純狀態轉換)，CommonJS可測。後續UI使用單一Economy.transact(combat,command) => 新combat+顯示結果(具體API請核心工作者定稿到API文件)，UI保存成功才發布S，失敗維持原S並允許同command重試。重複commandId去重；phase只能preparation。獨立loot/shop/forgeRNG不改combat.rng、mahjong亂數，開關UI不耗RNG。
戰鬥version3新增裝備系統；version1保持原樣；version2在prepare時migrate一次且不追發舊獎，當前戰鬥不能升級。新旅程用options.equipment=true明確啟用version3以保留舊create測試/benchmark契約；正式入口新選角傳此flag。V2 prepare後UI存成V3。version2原prepare若須opt-in以避免舊測試改期望，可prepare(input,{equipment:true})由正式入口使用，明確回報選擇。V3延續journey規則與monsterVFX，所有version===2門檻需有意涵檢查而非盲改。
回合獎/掉落在經濟核心同步加入copy狀態，存檔不重演。validate所有uid/slot/grade/level/錢整數非負/王印/shop/新quota/RNG，不能削弱舊驗證。戰鬥模式禁止equip/forge/buy等。rank不因整備換裝回算。

## UI與美術
整備3頁籤：行囊配裝/雲遊商人/鑄器師；保持hero/征途/下一局導航。行囊filter slot/grade/set/level，選品比較現有，equip/unequip/lock/dismantle；金額/材料/王印即時顯示；商人6stock+material+指定set兌換；forge顯示成功率/cost/失敗後level與轉移。操作中鎖導航和所有交易；save false/throw不得發布新狀態/放行開局。牌桌角色詳情顯裝備和新passivecounter；結果列本局個人loot/gold/sand，戰鬥輕量通知不擋牌。
資產路徑assets/cultivation-equipment/items/<catId>.png，sets/<setId>.png；首批3圖chi-xiao-sword,zhenyue-armor,ningyu-jade。使用者已確認三張樣圖並批准繼續餘24+4。品質色凡灰/靈青/玄藍/地紫/天金+文字，不只色彩。圖片contain不裁，至少1024透明PNG，不文字烘焙。

## 驗證
覆蓋27catalog*5grades*11levels；所有效果/非連鎖/整招/自然復甦/taunt；實際RNG成功失敗退階/扣款/轉移/duplicate cmds；掉落歸屬/無kill無drop/結算補助/兌換/商店persistent/讀檔/遷移。既有完整node --test tests/*.test.cjs。對舊V1/V2無裝行為等價。
至少200train+50holdout固定seed每種打法輪換hero/seat，散裝/4sets與+0/+6/+10；同hero同打法maxgear比無裝約<=15%，合理同級build約<=10%是測試目標非偽稱保證。1000旅程經濟模擬收入支出/套裝/首次+6/+10/退階，受控合法牌局boss另記。桌機1440x900、mobile390x844、landscape844x390 CUA實操；browser fixture/引擎模擬/實機分開回報。保存報告，不說未跑的已通過。
