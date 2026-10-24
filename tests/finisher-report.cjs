// Produce the reviewable catalog and evidence summary from checked-in skill data and browser results.
const fs=require('node:fs');
const F=require('../cultivation-finishers.js');
const read=name=>JSON.parse(fs.readFileSync('artifacts/'+name,'utf8'));
const games=read('cultivation-playthrough-journey-final.json').games;
const sealRows=games.filter(g=>g.hand===2).flatMap(g=>g.expired.flatMap((seals,pid)=>seals.length?[{seed:g.seed,pid,seals:seals.map(s=>s.name).join('、'),damage:g.damage[pid],rank:g.ranking.find(r=>r.pid===pid).rank,weak:g.weak[pid]}]:[]));
const mean=key=>games.reduce((n,g)=>n+g.comparison[key],0)/games.length;
const catalog=F.all.map(r=>`| ${r.label} | ${r.name} | ${r.description} | ${r.curse?F.describeSeal(r.curse):'無'} | ${r.id} |`).join('\n');
fs.writeFileSync('docs/CULTIVATION_FINISHERS.md',`# 修仙胡牌連招與跨局劫印

2026-10-23。正式資料：cultivation-finishers.js；35 種普通台型技能、基本起手式與兩種花胡專用終式，共 38 筆查詢項目。原 169 種牌組技能繼續使用。

## 規則

- 沿用既有合法台型與互斥判定，穩定 ID 與來源牌資料供戰鬥使用，不解析顯示文字。
- 普通終式預算 min(1500,240＋60×台數)。起手分配 240，各台型分配 60×實際台數；封頂時全套等比例縮減，整數餘額按下表固定順序補足。多段平均分配，餘數從前段補起。
- 起手先施放，台型依下表順序。條件增傷以終式開始時的生命／仇恨快照判斷，合計不超過預算 20%；海底與河底要求怪物生命嚴格低於 35%。元素、護甲、虛弱、既有增益再依戰鬥公式計算。
- 整套是一次攻擊技能；下一招增傷、固定追加、吸血與追擊沿用一次施放的結算。中途不換怪，排行榜保留過量傷害；實際吸血依失去生命計算。
- 七搶一與八仙過海只使用各自專用終式，不疊加普通連招、不重播已亮花技能。七搶一劫印給持單花者。
- 點胡與搶槓：結算後登記放槍者待生效劫印。自摸不對其他玩家施加劫印。只有零台時產生基本起手的 5% 普攻劫印。
- 不同種類並存，同種（元素類按元素區分）只取最強。適用的傷害倍率相乘，總減傷最多 35%；治療／護盾減少最多 30%、承傷增加最多 25%、新增仇恨增加最多 35%。不限制摸、吃、碰、槓、胡；普通淨化無效。
- 再戰重設牌局、生命、傷害、怪物，保留四人身分與名字，待生效劫印轉為生效。劫印包含下一局終式，終式與排名結算完成後解除；本局產生的新劫印另存待下一局生效。流局與全員虛弱也解除；自然復甦 30% 與護命保底不受治療劫印削減。
- 局內重開、門規套用重開、返回首頁、刷新、手動／自動續局不提前消除劫印。首頁「重新開始修仙旅程」經確認後清除連戰與劫印。
- 修仙存檔沿用獨立 V1 鍵，新增 handNumber、characterId、activeSeals、pendingSeals、expiredSeals、finisher；缺少新欄位視為無劫印。舊已結束存檔只顯示既有結果，不重算或補發。一般模式格式及語音不變。

## 完整對照

| 原台型 | 修仙技能 | 效果 | 放槍者下一局劫印 | 穩定 ID |
|---|---|---|---|---|
${catalog}

元素來源：赤晶＝火、靈珠＝水、飛劍＝金；青龍／曜陽／白虎／玄武＝木／火／金／水，赤鳳／神木／玄玉＝火／木／土。花牌沿用既有技能元素：春芽木、夏蓮水、秋楓火、冬雪水、靈梅木、幽蘭木、翠竹木、金菊金。門風與圈風保留座位稱呼；僅技能元素由來源字牌取得。

結算按「原台型 → 技能 → 本招傷害」列出，追擊獨立列示，總和等於終式傷害。玩家劫印按鈕可開啟完整說明，設定內可查所有終式。數值仍為測試起點。
`);
const stats={games:games.length,oldMean:mean('legacyFinisher'),newMean:mean('newFinisher'),newHuWins:games.filter(g=>g.huWon).length,oldHuWins:games.filter(g=>g.comparison.legacyRank.find(r=>r.pid===g.hu).rank===1).length,sealRows};
fs.writeFileSync('artifacts/finisher-balance-summary.json',JSON.stringify(stats,null,2));
const cards=F.all.map(r=>`<article><small>${r.label} · ${r.id}</small><h3>${r.name}</h3><p>${r.description}</p><p>${r.curse?F.describeSeal(r.curse)+'；下一局結束解除':'不施加劫印'}</p></article>`).join('');
fs.writeFileSync('artifacts/cultivation-finisher-preview.html',`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>胡牌連招與跨局劫印</title><style>body{margin:0;background:#071b20;color:#e5eee6;font:16px/1.6 'Microsoft JhengHei',sans-serif}main{max-width:1200px;margin:auto;padding:24px}h1,h2,h3{color:#edcf91}a{color:#b8eed6}input{box-sizing:border-box;width:100%;padding:14px;font:inherit;color:inherit;background:#12342e;border:1px solid #af9964;border-radius:8px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:20px 0}article{padding:18px;border:1px solid #8b7a52;border-radius:12px;background:#102b29}h3{margin:6px 0}small{color:#a8c9be}figure{margin:0}img{width:100%;height:auto}p{margin:8px 0}</style><main><h1>修仙胡牌連招與跨局劫印</h1><p>相容台型組成一次終式；放槍劫印於下一局生效，自摸不加害其他道友。</p><p>已完成 6 組連續兩局，共 12 局合法瀏覽器實玩。手機圖片為 Chromium 尺寸模擬，非實機。</p><h2>連戰實際畫面</h2><section><figure><a href="cultivation-finisher-24001.png"><img src="cultivation-finisher-24001.png" alt="桌機連招明細"></a><figcaption>桌機：原台型與分段傷害</figcaption></figure><figure><a href="cultivation-finisher-24002.png"><img src="cultivation-finisher-24002.png" alt="手機直向零台劫印"></a><figcaption>直向：零台終式與下一局劫印</figcaption></figure><figure><a href="cultivation-next-hand-24003.png"><img src="cultivation-next-hand-24003.png" alt="橫向第二局劫印"></a><figcaption>矮橫向：第二局生效劫印</figcaption></figure></section><h2>38 式完整查詢</h2><input id="query" type="search" aria-label="搜尋台型、技能或劫印" placeholder="搜尋：平胡、鎮魔、治療、劫印…"><section id="catalog">${cards}</section><p><a href="../docs/verification/CULTIVATION_FINISHERS_VERIFICATION.md">驗證報告</a> · <a href="../docs/CULTIVATION_FINISHERS.md">完整規則</a></p></main><script>document.getElementById('query').addEventListener('input',e=>document.querySelectorAll('#catalog article').forEach(a=>a.hidden=!a.textContent.includes(e.target.value.trim())));</script></html>`);
console.log(JSON.stringify(stats));
