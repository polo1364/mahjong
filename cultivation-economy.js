/* V3 economy. All public transitions clone their input; combat hooks mutate only combat's private copy. */
(function(root) { 'use strict';
  const E=typeof module!=='undefined'&&module.exports?require('./cultivation-equipment.js'):root.MahjongCultivationEquipment;
  const Items=typeof module!=='undefined'&&module.exports?require('./cultivation-items.js'):root.MahjongCultivationItems;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const prices=Object.freeze([60,90,120,150]);
  const rates=Object.freeze([1,1,.95,.9,.85,.8,.75,.5,.4,.3]);
  const goldCosts=Object.freeze([20,25,30,35,40,50,60,75,90,110]);
  const sandCosts=Object.freeze([1,1,2,2,3,3,4,5,6,8]);
  const rewards={small:[20,1,.2,2],elite:[50,3,.5,5],miniboss:[100,6,1,10],boss:[200,12,1,20]};
  const weights={small:[70,25,5,0,0],elite:[15,50,30,5,0],miniboss:[0,0,40,55,5],boss:[0,0,0,20,80]};
  const integer=(v,min=0,max=1000000000)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  function random(e,key) { let x=e.rng[key]>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;e.rng[key]=x>>>0;return e.rng[key]/4294967296; }
  function init(state,seed) {
    state.economy={journeyId:'journey-'+(seed>>>0).toString(16)+'-'+state.players[0].heroId,migrated:state.version===2};
    for(const p of state.players) {
      const seedFor=key=>((seed>>>0)^Math.imul(p.pid+1,0x9e3779b9)^key)>>>0||0x6d2b79f5;
      p.economy={gold:120,sand:0,seals:Object.fromEntries(E.sets.map(s=>[s.id,0])),inventory:[],serial:0,unlockedGrade:1,
        rng:{loot:seedFor(0xa341316c),shop:seedFor(0xc8013ea4),forge:seedFor(0xad90777d)},shop:null,receipts:[],creditedKills:[],settledHands:[],handLoot:{gold:0,sand:0,items:[],seals:{}}};
      p.equipmentState=E.passiveState();
    }
  }
  // New gear fills an empty slot right away so a player who never opens the pack still benefits; worn gear is never replaced.
  function addItem(p,catId,grade,level=0) { const e=p.economy;const item={uid:`p${p.pid}-${++e.serial}`,catId,grade,level,locked:false};e.inventory.push(item);const slot=E.get(catId).slot;if(p.equipment&&!p.equipment[slot])p.equipment[slot]=item.uid;return item; }
  function ordinary(e,grade,key='loot',slot=null,exclude=null) {
    slot=slot||E.slots[Math.floor(random(e,key)*3)];const pool=E.all.filter(c=>c.slot===slot&&!c.setId&&c.id!==exclude);
    return {catId:pool[Math.floor(random(e,key)*pool.length)].id,grade};
  }
  function drop(p,m) {
    const e=p.economy,set=E.sets.find(s=>s.source===m.speciesId);
    if(set&&random(e,'loot')<(m.tier==='boss'?.7:.6)) {
      const missing=E.slots.filter(slot=>!e.inventory.some(i=>i.catId==='set-'+set.id+'-'+slot));
      const pool=missing.length?missing:E.slots;return {catId:'set-'+set.id+'-'+pool[Math.floor(random(e,'loot')*pool.length)],grade:set.grade};
    }
    let roll=random(e,'loot')*100,grade=1;for(let i=0;i<5;i++){roll-=weights[m.tier][i];if(roll<0){grade=i+1;break;}}
    return ordinary(e,grade);
  }
  function creditKill(state,monster,killer) {
    const reward=rewards[monster.tier];
    for(const p of state.players) {
      const e=p.economy,key=state.economy.journeyId+':'+monster.id+':'+p.pid;
      if(e.creditedKills.includes(key)) continue;e.creditedKills.push(key);
      const gold=reward[0]+(p.pid===killer?reward[3]:0);e.gold+=gold;e.sand+=reward[1];e.handLoot.gold+=gold;e.handLoot.sand+=reward[1];
      e.unlockedGrade=Math.max(e.unlockedGrade,{small:1,elite:2,miniboss:3,boss:4}[monster.tier]);
      let gear=null;
      if(random(e,'loot')<reward[2]) {const d=drop(p,monster),item=addItem(p,d.catId,d.grade);e.handLoot.items.push(item.uid);gear=clone(item);}
      const set=E.sets.find(s=>s.source===monster.speciesId);
      if(set) {e.seals[set.id]++;e.handLoot.seals[set.id]=(e.handLoot.seals[set.id]||0)+1;}
      Items.credit(state,p,monster,killer);
      if(Items.enabled(state))e.items.handLoot[e.items.handLoot.length-1].resources={gold,sand:reward[1],gear,seal:set?.id||null};
    }
  }
  function settle(state) {
    if(!['hu','winning','flower','draw','defeat','allweak'].includes(state.result?.reason)) return;
    Items.settle(state);
    for(const p of state.players) {const e=p.economy;if(e.settledHands.includes(state.handNumber))continue;e.settledHands.push(state.handNumber);e.gold+=30;e.handLoot.gold+=30;}
  }
  function openShop(p,hand) {
    const e=p.economy;if(e.shop?.hand===hand)return;
    const stock=[];
    for(const slot of E.slots) {
      const a=ordinary(e,e.unlockedGrade,'shop',slot);const b=ordinary(e,Math.max(1,e.unlockedGrade-1),'shop',slot,a.catId);
      for(const item of [a,b])stock.push({...item,id:`${hand}-${slot}-${stock.length}`,price:prices[item.grade-1],sold:false});
    }
    e.shop={hand,grade:e.unlockedGrade,stock,materialBought:0,aiDone:false};
  }
  function cost(e,gold,sand) {if(e.gold<gold||e.sand<sand)throw Error('insufficient-funds');e.gold-=gold;e.sand-=sand;}
  function requireItem(p,uid) {const item=p.economy.inventory.find(i=>i.uid===uid);if(!item)throw Error('unknown-item');return item;}
  function perform(p,c,state) {
    if(c.type.startsWith('item-'))return Items.command(state,p,c);
    const e=p.economy;
    switch(c.type) {
      case 'equip': {const i=requireItem(p,c.uid);p.equipment[E.get(i.catId).slot]=i.uid;return {item:clone(i)};}
      case 'unequip': if(!E.slots.includes(c.slot))throw Error('invalid-slot');p.equipment[c.slot]=null;return {};
      case 'lock': {const i=requireItem(p,c.uid);if(typeof c.locked!=='boolean')throw Error('invalid-lock');i.locked=c.locked;return {item:clone(i)};}
      case 'dismantle': {const i=requireItem(p,c.uid);if(i.locked)throw Error('locked');if(Object.values(p.equipment).includes(i.uid))throw Error('equipped');if((i.level>0||E.get(i.catId).setId)&&c.confirm!==true)throw Error('confirmation-required');e.sand+=i.grade;e.inventory.splice(e.inventory.indexOf(i),1);return {sand:i.grade};}
      case 'buy': {const item=e.shop.stock.find(i=>i.id===c.stockId);if(!item)throw Error('unknown-stock');if(item.sold)throw Error('sold');cost(e,item.price,0);item.sold=true;return {item:clone(addItem(p,item.catId,item.grade))};}
      case 'material': if(e.shop.materialBought>=3)throw Error('material-limit');cost(e,30,0);e.sand+=3;e.shop.materialBought++;return {sand:3};
      case 'redeem': {const set=E.sets.find(s=>s.id===c.setId);if(!set||!E.slots.includes(c.slot))throw Error('invalid-redemption');if(e.seals[set.id]<2)throw Error('insufficient-seals');e.seals[set.id]-=2;return {item:clone(addItem(p,'set-'+set.id+'-'+c.slot,set.grade))};}
      case 'forge': {const i=requireItem(p,c.uid);if(i.level>=10)throw Error('maximum-level');const old=i.level,target=old+1;const q=Items.forgeQuote(p,E.get(i.catId).slot,old,c,rates,sandCosts);cost(e,goldCosts[old],q.sand);for(const id of q.consumed)Items.take(e.items,id);const roll=random(e,'forge'),success=roll<q.rate;i.level=success?target:target>=8&&!q.preserve?old-1:old;return {uid:i.uid,before:old,after:i.level,target,success,roll,rate:q.rate,gold:goldCosts[old],sand:q.sand,...(q.consumed.length?{consumed:q.consumed}:{})};}
      case 'transfer': {const source=requireItem(p,c.sourceUid),target=requireItem(p,c.targetUid);if(source===target||E.get(source.catId).slot!==E.get(target.catId).slot||source.level<=target.level)throw Error('invalid-transfer');if(source.locked)throw Error('locked');if(c.confirm!==true)throw Error('confirmation-required');const before={source:source.level,target:target.level};cost(e,30,2);target.level=source.level;source.level=0;return {before,after:{source:0,target:target.level}};}
      default: throw Error('unknown-command');
    }
  }
  function styleValue(p,cat) {
    const styles={'su-lingheng':['healStore','heal','discardHeal'],'luo-xuanyu':['shieldStore','shield','discardShield'],'yue-zhenshan':['shieldStore','topTaken','shield'],'tie-wujiu':['counter','topTaken'],'ye-shuying':['aggro'],'chi-ling':['active','damage'],'shen-gufeng':['basic','damage'],'hua-jianlu':['healStore','shieldStore'],'mu-canglan':['healStore','heal']};
    return (styles[p.heroId]||['active','damage']).includes(cat.ability)?1:0;
  }
  function compareScore(a,b) {for(let n=0;n<a.length;n++)if(a[n]!==b[n])return a[n]-b[n];return 0;}
  function selectGear(p) {
    const pools=E.slots.map(slot=>{const byKind=new Map();for(const i of p.economy.inventory.filter(i=>E.get(i.catId).slot===slot)){const c=E.get(i.catId),key=c.setId||c.ability,old=byKind.get(key);if(!old||E.base[i.grade-1]+i.level*.2>E.base[old.grade-1]+old.level*.2||E.base[i.grade-1]+i.level*.2===E.base[old.grade-1]+old.level*.2&&i.uid<old.uid)byKind.set(key,i);}return [null,...byKind.values()];});
    let best=null;
    for(const a of pools[0])for(const b of pools[1])for(const c of pools[2]) {
      const items=[a,b,c].filter(Boolean),counts={};let style=0,base=0;
      for(const i of items){const cat=E.get(i.catId);if(cat.setId)counts[cat.setId]=(counts[cat.setId]||0)+1;style+=styleValue(p,cat);base+=E.base[i.grade-1]+i.level*.2;}
      const score=[Object.values(counts).filter(n=>n===3).length,Object.values(counts).filter(n=>n>=2).length,style,base];const tie=items.map(i=>i.catId+':'+i.uid).join('|');
      if(!best||compareScore(score,best.score)>0||compareScore(score,best.score)===0&&tie<best.tie)best={items:[a,b,c],score,tie};
    }
    E.slots.forEach((slot,n)=>p.equipment[slot]=best.items[n]?.uid||null);
    return best;
  }
  function ai(p,state) {
    const e=p.economy;if(e.shop.aiDone)return;e.shop.aiDone=true;
    const before=selectGear(p);let choice=null;
    for(const stock of e.shop.stock.filter(s=>!s.sold&&e.gold-s.price>=30)) {
      const simulated=clone(p);addItem(simulated,stock.catId,stock.grade);const candidate=selectGear(simulated);
      if(compareScore(candidate.score,before.score)>0&&(!choice||compareScore(candidate.score,choice.score)>0))choice={stock,score:candidate.score};
    }
    if(choice)perform(p,{type:'buy',stockId:choice.stock.id});selectGear(p);
    // Keep AI packs small: spare plain +0 gear beyond six pieces is broken down for sand.
    const spare=e.inventory.filter(i=>!Object.values(p.equipment).includes(i.uid)&&!i.locked&&i.level===0&&!E.get(i.catId).setId).sort((a,b)=>a.grade-b.grade);
    for(const i of spare.slice(0,Math.max(0,spare.length-6)))perform(p,{type:'dismantle',uid:i.uid});
    Items.ai(state,p);
    for(let n=0;n<3;n++){const items=E.slots.map(slot=>e.inventory.find(i=>i.uid===p.equipment[slot])).filter(Boolean).sort((a,b)=>a.level-b.level||E.slots.indexOf(E.get(a.catId).slot)-E.slots.indexOf(E.get(b.catId).slot));const i=items[0];if(!i||i.level===10||e.gold-goldCosts[i.level]<30)break;const extra=Items.aiForge(p,E.get(i.catId).slot,i.level,sandCosts),q=Items.forgeQuote(p,E.get(i.catId).slot,i.level,extra,rates,sandCosts);if(e.sand<q.sand)break;perform(p,{type:'forge',uid:i.uid,...extra},state);}
  }
  function prepare(state) {Items.prepare(state);for(const p of state.players){openShop(p,state.handNumber);if(p.pid!==0){ai(p,state);Items.ai(state,p);}}}
  function nextHand(state) {Items.nextHand(state);for(const p of state.players){p.equipmentState=E.passiveState();p.economy.receipts=[];p.economy.handLoot={gold:0,sand:0,items:[],seals:{}};}}
  function validate(state) {
    const fail=s=>{throw Error('Invalid cultivation economy '+s);};
    if(!state.economy||typeof state.economy.journeyId!=='string'||!/^journey-[a-z0-9-]+$/.test(state.economy.journeyId)||typeof state.economy.migrated!=='boolean')fail('header');
    for(const p of state.players) {
      const e=p.economy,ps=p.equipmentState;if(!e||!integer(e.gold)||!integer(e.sand)||!integer(e.serial)||!integer(e.unlockedGrade,1,4)||!e.seals||Object.keys(e.seals).length!==4||E.sets.some(s=>!integer(e.seals[s.id])))fail('wallet');
      if(!e.rng||Object.keys(e.rng).length!==3||['loot','shop','forge'].some(k=>!integer(e.rng[k],1,4294967295)))fail('rng');
      if(!Array.isArray(e.inventory))fail('inventory');const uids=new Set();
      for(const i of e.inventory){if(!i||!new RegExp('^p'+p.pid+'-[1-9][0-9]*$').test(i.uid)||uids.has(i.uid)||Number(i.uid.split('-')[1])>e.serial||!E.get(i.catId)||!integer(i.grade,1,5)||!integer(i.level,0,10)||typeof i.locked!=='boolean')fail('item');uids.add(i.uid);}
      if(!p.equipment||Object.keys(p.equipment).length!==3)fail('slots');
      for(const slot of E.slots){const uid=p.equipment[slot];if(uid!==null&&!e.inventory.some(i=>i.uid===uid&&E.get(i.catId).slot===slot))fail('slot ownership');}
      if(!ps||Object.keys(ps).length!==Object.keys(E.passiveState()).length||!Number.isFinite(ps.stored)||ps.stored<0||ps.stored>10||!Number.isFinite(ps.generated)||ps.generated<ps.stored||ps.generated>20||!integer(ps.extraDamage,0,p.damage)||!integer(ps.extraHits,0,p.hits)||!integer(ps.discardHeals,0,5)||!integer(ps.discardShields,0,5))fail('passive storage');
      for(const set of ['zhenyue','jiuyou'])if(!integer(ps[set+'Uses'],0,3)||!Number.isFinite(ps[set+'Meter'])||ps[set+'Meter']<0||ps[set+'Meter']>(3-ps[set+'Uses'])*100)fail('meter');
      for(const set of ['chixiao','wuxiang'])if(!integer(ps[set+'Uses'],0,2)||!integer(ps[set+'Count'],0,2))fail('sequence');
      if(ps.wuxiangElement!==null&&!['metal','wood','water','fire','earth'].includes(ps.wuxiangElement)||ps.wuxiangCount===0&&ps.wuxiangElement!==null||ps.wuxiangCount>0&&ps.wuxiangElement===null)fail('element');
      if(!Array.isArray(e.receipts)||!Array.isArray(e.creditedKills)||!Array.isArray(e.settledHands)||new Set(e.creditedKills).size!==e.creditedKills.length||new Set(e.settledHands).size!==e.settledHands.length)fail('receipts');
      const commands=new Set();for(const r of e.receipts){if(!r||typeof r.id!=='string'||!r.id.length||r.id.length>100||commands.has(r.id)||typeof r.signature!=='string'||!r.result||r.result.ok!==true)fail('command receipt');commands.add(r.id);}
      for(const key of e.creditedKills)if(typeof key!=='string'||!key.startsWith(state.economy.journeyId+':')||!new RegExp(':[1-9][0-9]*:'+p.pid+'$').test(key))fail('kill receipt');
      for(const hand of e.settledHands)if(!integer(hand,1,state.handNumber))fail('settlement receipt');
      const loot=e.handLoot;if(!loot||!integer(loot.gold)||!integer(loot.sand)||!Array.isArray(loot.items)||loot.items.some(uid=>typeof uid!=='string')||!loot.seals||Object.entries(loot.seals).some(([id,n])=>!E.sets.some(s=>s.id===id)||!integer(n)))fail('hand loot');
      if(state.journey.phase==='preparation'&&(!e.shop||e.shop.hand!==state.handNumber))fail('missing preparation shop');
      if(e.shop!==null){const shop=e.shop;if(!shop||!integer(shop.hand,1,state.handNumber)||!integer(shop.grade,1,e.unlockedGrade)||!integer(shop.materialBought,0,3)||typeof shop.aiDone!=='boolean'||!Array.isArray(shop.stock)||shop.stock.length!==6)fail('shop');const ids=new Set();for(let n=0;n<shop.stock.length;n++){const s=shop.stock[n],slot=E.slots[Math.floor(n/2)],grade=n%2?Math.max(1,shop.grade-1):shop.grade;if(!E.get(s.catId)||E.get(s.catId).setId||E.get(s.catId).slot!==slot||s.grade!==grade||s.price!==prices[s.grade-1]||typeof s.sold!=='boolean'||s.id!==`${shop.hand}-${slot}-${n}`||ids.has(s.id))fail('stock');ids.add(s.id);}for(const slot of E.slots){const stock=shop.stock.filter(s=>E.get(s.catId).slot===slot);if(stock.length!==2||stock[0].catId===stock[1].catId)fail('stock slots');}}
    }
    Items.validate(state);
    return true;
  }
  function signature(c) {return JSON.stringify(Object.keys(c).filter(k=>k!=='commandId').sort().map(k=>[k,c[k]]));}
  function transact(input,command) {
    const C=typeof module!=='undefined'&&module.exports?require('./cultivation-combat.js'):root.MahjongCultivationCombat;
    C.validate(input);const state=clone(input),bad=code=>({state:clone(input),result:{ok:false,code}});
    if(input.version!==3)return bad('equipment-unavailable');
    if(!command||typeof command.commandId!=='string'||!command.commandId.length||command.commandId.length>100||!integer(command.pid,0,3))return bad('invalid-command');
    let sig;try{sig=signature(command);}catch{return bad('invalid-command');}
    const p=state.players[command.pid],prior=p.economy.receipts.find(r=>r.id===command.commandId);
    if(prior)return prior.signature===sig?{state,result:{...clone(prior.result),duplicate:true}}:bad('command-conflict');
    if(state.journey.phase!=='preparation')return bad('preparation-required');
    try {const detail=perform(p,command,state),result={ok:true,code:'ok',...detail};p.economy.receipts.push({id:command.commandId,signature:sig,result});C.validate(state);return {state,result};}
    catch(error){return bad(error.message.startsWith('Invalid cultivation')?'invalid-result':error.message);}
  }
  const api=Object.freeze({prices,rates,goldCosts,sandCosts,transact,validate,init,creditKill,settle,prepare,nextHand,selectGear});
  root.MahjongCultivationEconomy=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
