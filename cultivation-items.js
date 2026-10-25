/* Non-equipment inventory. Its RNG never advances combat, equipment loot or forge RNG. */
(function(root) {
  'use strict';
  const make=(id,name,category,description,recipe=null,gold=10)=>({id,name,category,description,recipe,gold,image:`assets/cultivation-items/${id}.png`});
  const all=[
    make('heal','回春丹','battle','傷害結算後生命不高於 35%，回復 120 基礎生命。',{wood:2}),
    make('barrier','玉障符','battle','受怪物攻擊前護盾不足 50，獲得 100 基礎護盾，最多自身 3 次出牌。',{earth:2}),
    make('cleanse','清心丹','battle','事件結算後移除最早的一項可淨化異常；劫印不受影響。',{wood:1,water:1}),
    make('stealth','匿影香','battle','無強制挑釁時，被單體鎖定前降低目前仇恨 30%，重新判定目標。',{water:2}),
    make('edge','銳芒符','battle','首招直接攻擊技能基礎傷害增加 20%，整招最多增加 50；含胡牌終式。',{metal:1,fire:1}),
    make('guard','護元符','battle','承受未被取消或降級的蓄力攻擊時，該整次攻擊承傷降低 40%。',{metal:1,earth:1}),
    ...[['metal','金魄屑'],['wood','木靈芽'],['water','水靈露'],['fire','火靈燼'],['earth','地脈砂'],['shard','劫晶碎片']].map(([id,name])=>make(id,name,'material',id==='shard'?'小王機率掉落、大 BOSS 必得；進階地區首領額外保底 1 份。合成祈運及保級符。':'怪物掉落的合成材料；不是強化貨幣「靈砂」。')),
    make('weapon-stone','淬鋒石','forge','武器強化抵扣最多 2 份靈砂，不抵金幣。',{metal:2}),
    make('armor-stone','鍛甲石','forge','防具強化抵扣最多 2 份靈砂，不抵金幣。',{earth:2}),
    make('accessory-stone','蘊靈石','forge','飾品強化抵扣最多 2 份靈砂，不抵金幣。',{wood:1,water:1}),
    make('luck','祈運符','forge','衝 +3～+10，成功率增加 5 個百分點，最高 100%；與保級符互斥。',{metal:1,fire:1,shard:1},20),
    make('preserve','鎮器保級符','forge','衝 +8～+10 失敗保留原級；成功失敗皆消耗，與祈運符互斥。',{metal:1,wood:1,water:1,fire:1,earth:1,shard:3},60)
  ];
  for(const item of all){if(item.recipe)Object.freeze(item.recipe);Object.freeze(item);}
  Object.freeze(all);
  const byId=new Map(all.map(x=>[x.id,x])),get=id=>byId.get(id);
  const battle=all.filter(x=>x.category==='battle').map(x=>x.id),elements=['metal','wood','water','fire','earth'];
  const stones=['weapon-stone','armor-stone','accessory-stone'];
  const pools={metal:['edge','guard'],wood:['heal','cleanse'],water:['cleanse','stealth'],fire:['edge','heal'],earth:['barrier','guard']};
  const tiers={small:[1,.1,.1,0,1,0],elite:[2,.2,.25,0,.8,.2],miniboss:[3,.35,.5,.25,.6,.3],boss:[1,1,1,1,.5,.3]};
  const shop=Object.freeze([...battle.map(id=>({id,price:20,limit:1})),...elements.map(id=>({id,price:10,limit:2})),...stones.map(id=>({id,price:20,limit:1}))].map(Object.freeze));
  const enabled=s=>s.version===3&&s.itemRulesVersion===1;
  function init(s){
    if(s.version!==3||s.itemRulesVersion!==undefined)return;
    s.itemRulesVersion=1;
    for(const p of s.players)p.economy.items={counts:{},rng:((s.rng>>>0)^Math.imul(p.pid+1,0x85ebca6b)^0x7314a59d)>>>0||1,
      prepared:[],carried:[],handLoot:[],shopHand:0,bought:{},aiHand:0,settledHand:0,tauntMonster:0,tab:'loot'};
  }
  function random(b){let x=b.rng>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;b.rng=x>>>0;return b.rng/4294967296;}
  function add(b,id,n=1){b.counts[id]=(b.counts[id]||0)+n;}
  function take(b,id,n=1){if(!get(id)||!Number.isSafeInteger(n)||n<1||(b.counts[id]||0)<n)throw Error('insufficient-items');b.counts[id]-=n;}
  function credit(s,p,m,killer){
    if(!enabled(s))return;
    const b=p.economy.items;if(b.handLoot.some(x=>x.monsterId===m.id))return;
    const M=typeof module!=='undefined'&&module.exports?require('./cultivation-monsters.js'):root.MahjongCultivationMonsters;
    const spec=M.get(m.speciesId),rule=tiers[m.tier],awards={};
    const grant=(id,n=1)=>{add(b,id,n);awards[id]=(awards[id]||0)+n;};
    if(m.tier==='boss')elements.forEach(id=>grant(id));else grant(spec.element,rule[0]);
    if(random(b)<rule[1]){const pool=m.tier==='boss'?battle:pools[spec.element];grant(pool[Math.floor(random(b)*pool.length)]);}
    if(random(b)<rule[2]){const roll=random(b);grant(roll<rule[4]?stones[Math.floor(random(b)*3)]:roll<rule[4]+rule[5]?'luck':'preserve');}
    if(random(b)<rule[3])grant('shard');
    if(m.advanced===true&&spec.region&&m.tier==='miniboss')grant('shard');
    b.handLoot.push({monsterId:m.id,speciesId:m.speciesId,killer,awards});
  }
  function prepare(s){
    init(s);if(!enabled(s))return;
    for(const p of s.players){const b=p.economy.items;if(b.shopHand!==s.handNumber){b.shopHand=s.handNumber;b.bought={};b.tab='loot';}}
  }
  function settle(s){
    if(!enabled(s))return;
    for(const p of s.players){const b=p.economy.items;if(b.settledHand===s.handNumber)continue;
      for(const x of b.carried)if(!x.used)add(b,x.id);b.carried=[];b.settledHand=s.handNumber;
      b.prepared=b.prepared.filter(id=>b.counts[id]>0);
    }
  }
  function nextHand(s){
    if(!enabled(s))return;
    for(const p of s.players){const b=p.economy.items;b.handLoot=[];b.carried=[];b.tauntMonster=0;
      b.prepared=b.prepared.filter(id=>b.counts[id]>0);
      for(const id of b.prepared){take(b,id);b.carried.push({id,used:false});}
    }
  }
  function consume(p,id){const entry=p.economy?.items?.carried.find(x=>x.id===id&&!x.used);if(!entry)return false;entry.used=true;return true;}
  function has(p,id){return !!p.economy?.items?.carried.some(x=>x.id===id&&!x.used);}
  function forgeQuote(p,slot,level,c,rates,sands){
    if(c.stone!==undefined&&typeof c.stone!=='boolean')throw Error('invalid-forge-item');
    if(c.charm!==undefined&&!['none','luck','preserve'].includes(c.charm))throw Error('invalid-forge-item');
    const consumed=[],stone=slot+'-stone',charm=c.charm||'none',b=p.economy.items;
    if(c.stone)consumed.push(stone);
    if(charm==='luck'){if(level<2)throw Error('invalid-forge-item');consumed.push(charm);}
    if(charm==='preserve'){if(level<7)throw Error('invalid-forge-item');consumed.push(charm);}
    if(consumed.some(id=>!b||!(b.counts[id]>0)))throw Error('insufficient-items');
    return {consumed,rate:Math.min(1,rates[level]+(charm==='luck'?.05:0)),sand:Math.max(0,sands[level]-(c.stone?2:0)),preserve:charm==='preserve'};
  }
  function command(s,p,c){
    if(!enabled(s))throw Error('items-unavailable');
    const b=p.economy.items,e=p.economy,item=get(c.itemId);
    switch(c.type){
      case 'item-tab':if(!['loot','items','inventory','shop','forge'].includes(c.tab))throw Error('invalid-tab');b.tab=c.tab;return {};
      case 'item-prepare':if(!Array.isArray(c.ids)||c.ids.length>2||new Set(c.ids).size!==c.ids.length||c.ids.some(id=>!battle.includes(id)||!(b.counts[id]>0)))throw Error('invalid-preparation');b.prepared=c.ids.slice();return {};
      case 'item-buy':{const stock=shop.find(x=>x.id===c.itemId);if(!stock)throw Error('unknown-stock');if((b.bought[stock.id]||0)>=stock.limit)throw Error('sold');if(e.gold<stock.price)throw Error('insufficient-funds');e.gold-=stock.price;add(b,stock.id);b.bought[stock.id]=(b.bought[stock.id]||0)+1;return {itemId:stock.id};}
      case 'item-craft':if(!item?.recipe)throw Error('invalid-recipe');if(e.gold<item.gold)throw Error('insufficient-funds');if(Object.entries(item.recipe).some(([id,n])=>(b.counts[id]||0)<n))throw Error('insufficient-items');e.gold-=item.gold;for(const [id,n] of Object.entries(item.recipe))take(b,id,n);add(b,item.id);return {itemId:item.id};
      default:throw Error('unknown-command');
    }
  }
  function ai(s,p){
    if(!enabled(s)||p.pid===0)return;
    const b=p.economy.items;if(b.aiHand===s.handNumber)return;b.aiHand=s.handNumber;
    const styles={'su-lingheng':['heal','barrier'],'luo-xuanyu':['barrier','heal'],'yue-zhenshan':['barrier','guard'],'tie-wujiu':['barrier','heal'],'ye-shuying':['stealth','edge'],'chi-ling':['edge','heal'],'shen-gufeng':['edge','guard'],'hua-jianlu':['heal','cleanse'],'mu-canglan':['heal','barrier']};
    const wanted=[...(styles[p.heroId]||['edge','cleanse'])];
    const M=typeof module!=='undefined'&&module.exports?require('./cultivation-monsters.js'):root.MahjongCultivationMonsters;
    const monster=M.get(s.journey.retrySpeciesId||s.journey.pendingMinibossId||s.monster.speciesId);
    if(['moss-flower','embertail-fox','nether-vine-queen'].includes(monster?.id)&&!wanted.includes('cleanse'))wanted[1]='cleanse';
    let spent=0;
    for(const id of wanted){if(b.counts[id]>0)continue;const item=get(id),craft=Object.entries(item.recipe).every(([k,n])=>(b.counts[k]||0)>=n),cost=craft?item.gold:20;
      if(spent+cost<=20&&p.economy.gold-cost>=30){command(s,p,{type:craft?'item-craft':'item-buy',itemId:id});spent+=cost;}
    }
    b.prepared=[...wanted,...battle].filter((id,i,list)=>list.indexOf(id)===i&&b.counts[id]>0).slice(0,2);
  }
  function aiForge(p,slot,level,sands){const b=p.economy.items;if(!b)return {};
    return {stone:sands[level]>=2&&(b.counts[slot+'-stone']||0)>0,charm:level>=7&&b.counts.preserve>0?'preserve':level>=2&&b.counts.luck>0?'luck':'none'};
  }
  function validate(s){
    const fail=()=>{throw Error('Invalid cultivation items');},num=(n,max=1000000000)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
    if(s.itemRulesVersion===undefined||s.itemRulesVersion===0)return true;
    if(!enabled(s))fail();
    const M=typeof module!=='undefined'&&module.exports?require('./cultivation-monsters.js'):root.MahjongCultivationMonsters;
    const E=typeof module!=='undefined'&&module.exports?require('./cultivation-equipment.js'):root.MahjongCultivationEquipment;
    for(const p of s.players){const b=p.economy.items;
      if(!b||!num(b.rng,4294967295)||b.rng===0||!b.counts||Object.entries(b.counts).some(([id,n])=>!get(id)||!num(n)))fail();
      if(!Array.isArray(b.prepared)||b.prepared.length>2||new Set(b.prepared).size!==b.prepared.length||b.prepared.some(id=>!battle.includes(id)))fail();
      if(!Array.isArray(b.carried)||b.carried.length>2||new Set(b.carried.map(x=>x.id)).size!==b.carried.length||b.carried.some(x=>!battle.includes(x.id)||typeof x.used!=='boolean'))fail();
      if(!num(b.tauntMonster,s.monster.id)||!num(b.shopHand,s.handNumber)||!num(b.aiHand,s.handNumber)||!num(b.settledHand,s.handNumber)||!['loot','items','inventory','shop','forge'].includes(b.tab)||!b.bought||Object.entries(b.bought).some(([id,n])=>!shop.some(x=>x.id===id&&num(n,x.limit))))fail();
      if(!Array.isArray(b.handLoot)||new Set(b.handLoot.map(x=>x.monsterId)).size!==b.handLoot.length||b.handLoot.some(x=>!num(x.monsterId,s.monster.id)||x.monsterId<1||!num(x.killer,3)||typeof x.speciesId!=='string'||!x.awards||Object.entries(x.awards).some(([id,n])=>!get(id)||!num(n))))fail();
      for(const entry of b.handLoot){if(!M.get(entry.speciesId))fail();const r=entry.resources;if(r&&(!num(r.gold)||!num(r.sand)||(r.seal!==null&&!E.sets.some(x=>x.id===r.seal))||(r.gear&&(!E.get(r.gear.catId)||!num(r.gear.grade,5)||r.gear.grade<1||!num(r.gear.level,10)))))fail();}
      if(s.ended&&b.carried.length)fail();
    }return true;
  }
  const api=Object.freeze({all,get,battle:Object.freeze(battle),shop,enabled,init,credit,prepare,settle,nextHand,consume,has,forgeQuote,take,command,ai,aiForge,validate});
  root.MahjongCultivationItems=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
