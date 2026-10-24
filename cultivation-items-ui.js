(function(root){
  'use strict';
  const imageURL = root.MahjongImageURL || (value => value);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const I=()=>root.MahjongCultivationItems;
  const categories={battle:'戰鬥丹符',material:'五行材料',forge:'強化道具'};
  function art(item){return item.image?`<img src="${esc(imageURL(item.image))}" alt="" width="96" height="96">`:`<span class="item-art-pending" aria-label="圖片待樣稿確認">${esc(item.name.slice(0,2))}</span>`;}
  function recipe(item){return item.recipe?`${Object.entries(item.recipe).map(([id,n])=>`${I().get(id).name} ×${n}`).join('、')}＋${item.gold} 金幣`:'';}
  function sources(item){
    const M=root.MahjongCultivationMonsters;
    if(item.category==='battle'){
      const elements={heal:['wood','fire'],barrier:['earth'],cleanse:['wood','water'],stealth:['water'],edge:['metal','fire'],guard:['metal','earth']}[item.id];
      return `怪物：${M.all.filter(m=>elements.includes(m.element)||m.tier==='boss').map(m=>m.name).join('、')}。小怪 10%、菁英 20%、小王 35%、大 BOSS 必得一件；抽中後在該屬性道具池內等機率選擇。另可向商人購買或合成。`;
    }
    if(item.category==='material')return item.id==='shard'?'小王擊殺後 25% 掉一份；五相劫尊必得一份。商人不販售。':`${M.all.filter(m=>m.element===item.id&&m.tier!=='boss').map(m=>m.name).join('、')}：小怪 1 份、菁英 2 份、小王 3 份；五相劫尊固定給五行各 1 份。商人每次整備限購 2 份。`;
    if(item.id==='preserve')return '小王先以 50% 抽強化道具，其中 10% 為保級符；大 BOSS 必得強化道具，其中 20% 為保級符。亦可合成，不直接販售。';
    if(item.id==='luck')return '菁英／小王／大 BOSS 抽中強化道具後，祈運符占 20%／30%／30%。亦可合成，不直接販售。';
    return '所有怪物可能掉落。小怪／菁英／小王／大 BOSS 的強化道具掉率為 10%／25%／50%／100%；抽中後三種強化石合計占 100%／80%／60%／50%，三種石頭等機率。亦可購買或合成。';
  }
  function card(item,p,actions=''){return `<article class="supply-card">${art(item)}<div><small>${categories[item.category]}</small><h3>${esc(item.name)} <span>×${p.economy.items.counts[item.id]||0}</span></h3><p>${esc(item.description)}</p>${item.recipe?`<small class="supply-recipe">合成：${esc(recipe(item))}</small>`:''}${actions}</div></article>`;}
  function character(p){
    const E=root.MahjongCultivationEquipment,H=root.MahjongCultivationHeroes.get(p.heroId),base=H.stats;
    const values={damage:base.damage*E.factor(p,'damage'),defense:200-(200-base.defense)*E.factor(p,'taken'),healing:base.healing*E.factor(p,'heal'),shield:base.shield*E.factor(p,'shield')};
    return `<p class="journey-muted">含裝備常駐加成；條件效果另依招式結算。</p><dl class="journey-stats">${[['damage','傷害'],['defense','防禦'],['healing','治療'],['shield','護盾']].map(([key,name])=>`<div><dt>${name}</dt><dd>${Number(values[key].toFixed(1))}<small>%</small></dd></div>`).join('')}</dl><div class="supply-worn">${E.slots.map(slot=>{const item=p.economy.inventory.find(i=>i.uid===p.equipment[slot]),cat=item&&E.get(item.catId);return `<div><img src="${imageURL(cat?cat.image:'assets/cultivation-journey/slots/'+slot+'.png')}" alt="" width="48" height="48"><span>${{weapon:'武器',armor:'防具',accessory:'飾品'}[slot]}</span><small>${cat?esc(cat.name)+' +'+item.level:'尚未裝備'}</small></div>`;}).join('')}</div>`;
  }
  function carried(p){const rows=p.economy?.items?.carried||[];return rows.length?`<section class="supply-carried"><h3>本局攜帶道具</h3>${rows.map(x=>{const item=I().get(x.id);return `<p><strong>${esc(item.name)} · ${x.used?'已使用':'待觸發'}</strong><br>${esc(item.description)}</p>`;}).join('')}</section>`:'';}
  function prepared(p){const b=p.economy.items;return `<div class="supply-prepared"><div><b>下局準備</b><small>最多兩件不同道具 · 未觸發會退回</small></div>${[0,1].map(i=>{const item=I().get(b.prepared[i]);return `<div class="supply-slot">${item?`${art(item)}<span>${esc(item.name)}</span><button type="button" data-action="item-prepare" data-item="${item.id}">移除</button>`:'<span>未準備</span>'}</div>`;}).join('')}</div>`;}
  function inventory(p,filter='all'){
    const b=p.economy.items;
    return `<div class="supply-toolbar"><h2>道具行囊</h2><label>分類 <select id="supplyCategory">${[['all','全部'],...Object.entries(categories)].map(([id,name])=>`<option value="${id}"${id===filter?' selected':''}>${name}</option>`).join('')}</select></label></div><p class="journey-muted">戰鬥自動使用，鑄器師使用強化道具。材料、配方與持有數量可在此對照。</p><div class="supply-grid">${I().all.filter(x=>filter==='all'||x.category===filter).map(item=>{
      const owned=b.counts[item.id]||0,ready=b.prepared.includes(item.id),canCraft=item.recipe&&p.economy.gold>=item.gold&&Object.entries(item.recipe).every(([id,n])=>(b.counts[id]||0)>=n);
      const source=sources(item);
      return card(item,p,`<details><summary>取得來源</summary><p>${source}</p></details><div class="equip-actions">${item.category==='battle'?`<button type="button" data-action="item-prepare" data-item="${item.id}"${!ready&&(!owned||b.prepared.length===2)?' disabled':''}>${ready?'取消準備':'準備下局'}</button>`:''}${item.recipe?`<button type="button" data-action="item-craft" data-item="${item.id}"${canCraft?'':' disabled'}>合成 1 件</button>`:''}</div>`);
    }).join('')}</div>`;
  }
  function loot(s,pid=0){
    const p=s.players[pid],b=p.economy.items,H=root.MahjongCultivationHeroes,M=root.MahjongCultivationMonsters;
    const rank=s.result?.ranking?.find(x=>x.pid===pid),hu=s.result?.huPid;
    return `<div class="supply-toolbar"><h2>本局收穫</h2><label>查看道友 <select id="supplyLootPlayer">${s.players.map(x=>`<option value="${x.pid}"${x.pid===pid?' selected':''}>${esc(H.get(x.heroId).name)}${x.pid===0?' · 你':''}</option>`).join('')}</select></label></div><div class="supply-summary"><div><small>本局傷害</small><b>${p.damage.toLocaleString()}</b></div><div><small>胡牌者</small><b>${hu===null||hu===undefined?'無':esc(H.get(s.players[hu].heroId).name)}</b></div><div><small>本局擊殺</small><b>${b.handLoot.length}</b></div><div><small>排名</small><b>${rank?.rank||'—'}</b></div></div><p>金幣 +${p.economy.handLoot.gold} · 靈砂 +${p.economy.handLoot.sand} · 裝備 ${p.economy.handLoot.items.length} 件</p><p class="journey-muted">獎勵已自動入帳，無須再次領取。新道具掉落從啟用後的下一局開始。</p><div class="supply-rewards">${b.handLoot.length?b.handLoot.map(k=>`<article><img src="${esc(imageURL(M.get(k.speciesId)?.image||''))}" alt="" width="90" height="90"><div><h3>${esc(M.get(k.speciesId)?.name||k.speciesId)}</h3><small>擊殺者：${esc(H.get(s.players[k.killer].heroId).name)}</small>${k.resources?`<p>金幣 +${k.resources.gold} · 靈砂 +${k.resources.sand}${k.resources.gear?' · '+esc(root.MahjongCultivationEquipment.get(k.resources.gear.catId).name)+'（'+root.MahjongCultivationEquipment.grades[k.resources.gear.grade-1]+'品）':''}${k.resources.seal?' · '+esc(root.MahjongCultivationEquipment.sets.find(x=>x.id===k.resources.seal)?.name)+'王印 ×1':''}</p>`:''}<p>${Object.entries(k.awards).map(([id,n])=>`${esc(I().get(id).name)} ×${n}`).join(' · ')}</p></div></article>`).join(''):'<p class="equip-empty">本局沒有新道具掉落。擊敗妖獸後，獎勵會列在這裡。</p>'}</div>`;
  }
  function shop(p){return `<h2 class="supply-shop-title">丹符與鑄器補給</h2><p>每局整備固定限購，返回與讀檔不刷新。</p><div class="supply-grid">${I().shop.map(stock=>{const bought=p.economy.items.bought[stock.id]||0;return card(I().get(stock.id),p,`<p>${stock.price} 金幣 · 已購 ${bought}/${stock.limit}</p><button type="button" data-action="item-buy" data-item="${stock.id}"${bought>=stock.limit||p.economy.gold<stock.price?' disabled':''}>${bought>=stock.limit?'已售罄':'購買 1 件'}</button>`);}).join('')}</div>`;}
  function forge(p,item,options){
    if(!item||item.level>=10)return '';
    const E=root.MahjongCultivationEquipment,N=root.MahjongCultivationEconomy,b=p.economy.items,slot=E.get(item.catId).slot;
    const stone=I().get(slot+'-stone'),q=I().forgeQuote(p,slot,item.level,options,N.rates,N.sandCosts),after=item.level>=7&&!q.preserve?item.level-1:item.level;
    return `<section class="supply-forge"><h3>強化輔助</h3><label><input id="supplyForgeStone" type="checkbox"${options.stone?' checked':''}${b.counts[stone.id]>0?'':' disabled'}> ${stone.name} ×${b.counts[stone.id]||0} · 抵扣最多 2 靈砂</label><label>輔助符 <select id="supplyForgeCharm"><option value="none">不使用</option><option value="luck"${options.charm==='luck'?' selected':''}${item.level>=2&&b.counts.luck>0?'':' disabled'}>祈運符 ×${b.counts.luck||0} · 成功率 +5 百分點</option><option value="preserve"${options.charm==='preserve'?' selected':''}${item.level>=7&&b.counts.preserve>0?'':' disabled'}>鎮器保級符 ×${b.counts.preserve||0} · 失敗保級</option></select></label><p class="supply-forge-quote">+${item.level} → +${item.level+1} · 成功率 <b>${Math.round(q.rate*100)}%</b><br>${N.goldCosts[item.level]} 金幣＋${q.sand} 靈砂 · 失敗後 +${after}<br>消耗：${q.consumed.length?q.consumed.map(id=>I().get(id).name+' ×1').join('、'):'無輔助道具'}</p><small>成功失敗皆消耗；操作後清除選擇。</small></section>`;
  }
  root.MahjongCultivationItemsUI=Object.freeze({art,character,carried,prepared,inventory,loot,shop,forge});
})(typeof window!=='undefined'?window:globalThis);
