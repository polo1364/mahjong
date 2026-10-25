const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../cultivation-combat.js'),E=require('../cultivation-equipment.js'),N=require('../cultivation-economy.js'),M=require('../cultivation-monsters.js'),S=require('../cultivation-skills.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const fixture=(hero='yun-zhiwei',seed=123)=>C.create(seed,null,{heroId:hero,equipment:true,monsterSkillVersion:0});
const send=(s,e)=>C.apply(s,{id:s.seq+1,...e});
const basic=s=>send(s,{type:'discard',pid:0,key:'W1'});
const end=s=>send(s,{type:'finish',pid:null,reason:'draw'}).state;
function give(s,id,grade=1,level=0,pid=0,equip=true){const p=s.players[pid],e=p.economy,item={uid:`p${pid}-${++e.serial}`,catId:id,grade,level,locked:false};e.inventory.push(item);if(equip)p.equipment[E.get(id).slot]=item.uid;return item;}
function set(s,id,grade=4,level=0){for(const slot of E.slots)give(s,'set-'+id+'-'+slot,grade,level);}
function species(s,id){const m=M.get(id);Object.assign(s.monster,{speciesId:id,tier:m.tier,name:m.name,element:m.element,hp:m.hp,maxHp:m.hp,shield:m.shield,armor:m.armor,statuses:[],attacks:0,heals:0,shields:0});s.monster.nextAttack={type:'single',damage:m.single,charged:false,ailment:null,cancelled:false,controlUsed:false,sealAilment:false};return s;}
function enemy(s,type='single',damage=100){s=clone(s);s.discardCount=4;s.enemyDue=s.monster.id;Object.assign(s.monster.nextAttack,{type,damage});return send(s,{type:'enemy'});}
function meld(s,id){const sk=S.get(id);return send(s,{type:'meld',pid:0,action:sk.action,...(sk.family==='honor'?{key:sk.combo}:{keys:[...sk.combo].map(n=>sk.family+n)})});}
const tx=(s,type,extra={},id='c1')=>N.transact(s,{commandId:id,pid:0,type,...extra});
function prep(){return C.prepare(end(fixture()));}

test('unique immutable 27 catalog entries × 5 qualities × 11 levels; additive fixed traits and base',()=>{
  assert.equal(E.all.length,27);assert.equal(new Set(E.all.map(i=>i.id)).size,27);assert.equal(E.sets.length,4);
  let checked=0;
  for(const cat of E.all)for(let grade=1;grade<=5;grade++)for(let level=0;level<=10;level++){
    const s=fixture();give(s,cat.id,grade,level);assert.ok(C.validate(s));const b=E.bonuses(s.players[0]),base=(E.base[grade-1]+level*.2)/100;
    assert.equal(b[cat.slot==='weapon'?'damage':cat.slot==='armor'?'taken':'heal'],base+(cat.slot==='accessory'&&cat.ability==='heal'?cat.value:0));
    if(cat.ability)assert.ok(Math.abs(b[cat.ability]-((cat.slot==='accessory'&&(cat.ability==='heal'||cat.ability==='shield'))?base+cat.value:cat.value))<1e-12);
    checked++;
  }
  assert.equal(checked,1485);
  const s=fixture();give(s,'huifeng-halberd',5,10);give(s,'huifeng-seal',5,10);assert.equal(E.factor(s.players[0],'damage',{counter:true}),1+.06+.04+.03);
});

test('new V3 explicit opt-in; V1/V2 untouched; migration only at prepare, no retroactive reward',()=>{
  assert.equal(C.create(1).version,1);const v2=C.create(1,null,{heroId:'yun-zhiwei'});assert.equal(v2.version,2);assert.throws(()=>C.prepare(v2,{equipment:true}),/ended/);
  const ended=end(v2);assert.equal(C.prepare(ended).version,2);const migrated=C.prepare(ended,{equipment:true});assert.equal(migrated.version,3);assert.equal(migrated.economy.migrated,true);assert.equal(migrated.players[0].economy.gold,120);assert.equal(migrated.players[0].economy.handLoot.gold,0);assert.deepEqual(C.prepare(migrated),migrated);
  const oldKilled=clone(v2);oldKilled.monster.hp=1;oldKilled.monster.shield=0;const withHistory=basic(oldKilled).state;assert.equal(withHistory.kills.length,1);const upgrade=C.prepare(end(withHistory),{equipment:true});assert.equal(upgrade.players[0].economy.gold,120);assert.deepEqual(upgrade.players[0].economy.creditedKills,[]);assert.deepEqual(upgrade.players[0].economy.inventory,[]);
  const fresh=fixture();assert.equal(fresh.version,3);assert.equal(fresh.players[0].economy.shop,null);assert.equal(tx(fresh,'material').result.code,'preparation-required');assert.deepEqual(C.create(2,fresh),fresh);
});

test('damage base/trait use one equipment factor and retain hero, element, armor, seal factors',()=>{
  const s=species(fixture('shen-gufeng'),'whetgold-rat');give(s,'chi-xiao-sword',5,10);give(s,'chiyao-pendant',1);
  const r=basic(s);assert.equal(r.effects.find(e=>e.type==='damage').amount,Math.round(55*1.04*1.09*1.25*.88));
  const active=species(fixture('yun-zhiwei'),'whetgold-rat');give(active,'xuanfu-staff',1);active.players[0].statuses=[{kind:'followup',amount:50,duration:2,charges:1}];const baseline=clone(active);baseline.players[0].equipment.weapon=null;
  const a=meld(active,'B.chow.123').effects.filter(e=>e.type==='damage'),b=meld(baseline,'B.chow.123').effects.filter(e=>e.type==='damage');
  assert.equal(a[0].amount,Math.round(37*1.04*.88));assert.equal(a.at(-1).source,'followup');assert.equal(a.at(-1).amount,Math.round(50*1.02*.88));assert.equal(b.length,a.length);
});

test('counter-only traits exclude followup and apply to actual reaction',()=>{
  const s=species(fixture('tie-wujiu'),'whetgold-rat');give(s,'huifeng-halberd',1);give(s,'huifeng-seal',1);s.players[0].aggro=100;
  const r=enemy(s);assert.equal(r.effects.find(e=>e.source==='counter'&&e.pid===0).amount,Math.round(15*1.09*.88));
});

test('armor additive top/AoE traits, separate hero defense, dot ordinary reduction only',()=>{
  let s=species(fixture('yue-zhenshan'),'whetgold-rat');give(s,'zhenyue-armor',5,10);s.players[0].aggro=100;
  assert.equal(s.players[0].maxHp-enemy(s).state.players[0].hp,Math.round(100*.94*.97*.93));
  s.players[1].aggro=101;assert.equal(s.players[0].maxHp-enemy(s,'all').state.players[0].hp,Math.round(100*.94*.94));
  s=species(fixture(),'whetgold-rat');give(s,'liuyun-robe');s.players[0].aggro=100;assert.equal(s.players[0].maxHp-enemy(s,'all').state.players[0].hp,96);assert.equal(s.players[0].maxHp-enemy(s).state.players[0].hp,98);
});

test('equipment and hero heal storage independent caps, no overflow/natural/self-equipment heal storage',()=>{
  let s=fixture('su-lingheng');give(s,'qingheng-whisk');s.players[0].hp=990;s=meld(s,'T.chow.234').state;
  assert.equal(s.players[0].equipmentState.stored,.5);assert.equal(s.players[0].passiveState.stored,1.5);
  s=basic(s).state;assert.equal(s.players[0].equipmentState.stored,0);assert.equal(s.players[0].passiveState.stored,0);
  for(let n=0;n<8;n++){s.players[0].hp=100;s=meld(s,'T.pong.666').state;s=basic(s).state;}
  assert.equal(s.players[0].equipmentState.generated,20);assert.equal(s.players[0].passiveState.generated,60);
  s=fixture('su-lingheng');give(s,'qingheng-whisk');give(s,'huichun-robe');s.players[0].hp=900;s=basic(s).state;assert.equal(s.players[0].equipmentState.generated,0);assert.equal(s.players[0].passiveState.generated,0);
  s=fixture('su-lingheng');give(s,'qingheng-whisk');give(s,'qingheng-pendant',5,10);s.players[0].hp=0;s.players[0].weak=true;s=basic(basic(s).state).state;assert.equal(s.players[0].hp,300);assert.equal(s.players[0].equipmentState.generated,0);
});

test('shield storage uses only actual absorption, excludes expiration/consumption and caps independently',()=>{
  let s=species(fixture('luo-xuanyu'),'whetgold-rat');give(s,'ningyu-ringblade');s.players[0].aggro=100;s.players[0].shield=100;s.players[0].shieldTurns=9;
  s=enemy(s).state;assert.equal(s.players[0].equipmentState.stored,4.9);assert.equal(s.players[0].passiveState.stored,14.7);
  s.players[0].shieldTurns=1;s=basic(s).state;assert.equal(s.players[0].equipmentState.generated,4.9);
  for(let n=0;n<7;n++){s.players[0].shield=200;s.players[0].shieldTurns=9;s=enemy(s).state;s=basic(s).state;}
  assert.equal(s.players[0].equipmentState.generated,20);
});

test('discard armor runs after existing discard lifecycle, quota five, no extra discard and shield lasts two',()=>{
  let s=fixture();give(s,'huichun-robe');s.players[0].hp=500;for(let n=0;n<7;n++)s=basic(s).state;
  assert.equal(s.players[0].hp,525);assert.equal(s.players[0].equipmentState.discardHeals,5);assert.equal(s.players[0].passiveState.discards,7);
  s=fixture();give(s,'xuanyu-robe');s=basic(s).state;assert.equal(s.players[0].shield,5);assert.equal(s.players[0].shieldTurns,2);s=basic(s).state;assert.equal(s.players[0].shieldTurns,2);assert.equal(s.players[0].equipmentState.discardShields,2);
});

test('new threat gear adds with gear traits but multiplies hero/seals once; taunt remains top',()=>{
  let s=species(fixture('ye-shuying'),'whetgold-rat');give(s,'yexing-robe');give(s,'yinxi-bell');s.players[0].aggro=1000;let r=basic(s);assert.equal(r.state.players[0].aggro,1000+r.state.players[0].damage*.92*.93);
  s.players[1].aggro=50000;s=meld(s,'W.pong.777').state;assert.ok(s.players[0].aggro>50000);assert.equal(C.target(s),0);
});

test('zhenyue/jiuyou meter uses effective values and one proc per basic with three-use cap and saves',()=>{
  for(const [id,kind] of [['zhenyue','shield'],['jiuyou','heal']]){
    let s=species(fixture(),'blackarmor-general');set(s,id);const p=s.players[0];E.record(p,kind,1000);assert.equal(p.equipmentState[id+'Meter'],300);
    for(let n=0;n<3;n++){let r=basic(JSON.parse(JSON.stringify(s)));assert.equal(r.effects.filter(e=>e.skillId==='equipment').length,1);assert.equal(r.state.players[0].equipmentState[id+'Uses'],n+1);s=r.state;}
    E.record(s.players[0],kind,500);assert.equal(s.players[0].equipmentState[id+'Meter'],0);assert.equal(basic(s).effects.filter(e=>e.skillId==='equipment').length,0);
  }
});

test('chixiao counts whole direct melds only, appends after followups; max two and no chain',()=>{
  let s=species(fixture(),'blackarmor-general');set(s,'chixiao');s.players[0].statuses=[{kind:'followup',amount:50,duration:10,charges:20}];
  s=meld(s,'T.chow.234').state;assert.equal(s.players[0].equipmentState.chixiaoCount,0);
  for(let n=0;n<7;n++){const r=meld(s,'B.chow.123');const extra=r.effects.filter(e=>e.skillId==='equipment');assert.equal(extra.length,n===2||n===5?1:0);if(extra.length)assert.equal(r.effects.filter(e=>e.type==='damage').at(-1).skillId,'equipment');s=r.state;}
  assert.equal(s.players[0].equipmentState.chixiaoUses,2);
});

test('wuxiang first effective element per cast; same resets, neutral preserves, trigger resets and caps',()=>{
  let s=species(fixture(),'blackarmor-general');set(s,'wuxiang',5);
  for(const id of ['W.chow.234','W.pong.222'])s=meld(s,id).state;
  assert.equal(s.players[0].equipmentState.wuxiangCount,1);
  s=meld(s,'B.chow.123').state;assert.equal(s.players[0].equipmentState.wuxiangCount,2);
  const before=clone(s.players[0].equipmentState);s=basic(s).state;assert.equal(s.players[0].equipmentState.wuxiangCount,before.wuxiangCount);
  let r=meld(s,'T.exposed.1111');assert.equal(r.effects.filter(e=>e.skillId==='equipment').length,1);assert.equal(r.state.players[0].equipmentState.wuxiangCount,0);assert.equal(r.effects.find(e=>e.skillId==='equipment').element,'neutral');
  s=r.state;for(const id of ['W.chow.234','B.chow.123','T.exposed.1111','W.chow.234','B.chow.123','T.exposed.1111'])s=meld(s,id).state;assert.equal(s.players[0].equipmentState.wuxiangUses,2);
});

test('equipment extra kill attributed once after entire cast; RNG independent of equipment UI and combat',()=>{
  let s=species(fixture(),'blackarmor-general');set(s,'zhenyue');s.players[0].equipmentState.zhenyueMeter=100;s.monster.hp=1;s.monster.shield=0;
  const r=basic(s);assert.equal(r.state.kills.length,1);assert.equal(r.state.kills[0].pid,0);assert.equal(r.effects.filter(e=>e.type==='kill').length,1);assert.equal(r.effects.filter(e=>e.type==='spawn').length,1);
  const damage=r.effects.filter(e=>e.type==='damage');assert.equal(damage.length,2);assert.equal(damage[0].monsterId,damage[1].monsterId);assert.equal(r.state.players[0].economy.gold,230);assert.equal(r.state.players[1].economy.gold,220);
});

test('kill reward each tier for every actor including weak; no credit without kill, no replay on restore',()=>{
  for(const [id,gold,sand,killer] of [['whetgold-rat',20,1,2],['golden-tiger',50,3,5],['blackarmor-general',100,6,10],['five-phase-sovereign',200,12,20]]){
    let s=species(fixture(),id);s.monster.hp=1;s.monster.shield=0;s.players[1].hp=0;s.players[1].weak=true;
    const r=basic(s);assert.equal(r.state.players[0].economy.gold,120+gold+killer);assert.equal(r.state.players[1].economy.gold,120+gold);assert.equal(r.state.players[1].economy.sand,sand);assert.equal(r.state.players[1].economy.creditedKills.length,1);
    assert.deepEqual(C.apply(clone(r.state),{id:r.state.seq,type:'discard',pid:0,key:'W1'}).state,r.state);
    const persisted=clone(r.state);N.creditKill(persisted,s.monster,0);assert.deepEqual(persisted,r.state);
  }
  const s=fixture();assert.equal(basic(s).state.players[0].economy.gold,120);assert.equal(end(s).players[0].economy.gold,150);
});

test('legal end subsidy once per hand, next hand preserves inventory/wallet and resets only quotas/loot',()=>{
  let s=fixture();give(s,'chi-xiao-sword',5,6);s.players[0].equipmentState.generated=20;
  s=end(s);assert.equal(s.players[0].economy.gold,150);const p=C.prepare(s),next=C.create(99,p);assert.equal(next.players[0].economy.gold,150);assert.equal(next.players[0].economy.inventory[0].level,6);assert.equal(next.players[0].equipmentState.generated,0);assert.equal(next.players[0].economy.handLoot.gold,0);assert.deepEqual(end(next).players[0].economy.settledHands,[1,2]);
  const restarted=fixture();assert.equal(restarted.players[0].economy.gold,120);assert.deepEqual(restarted.players[0].economy.inventory,[]);
});

test('shop persistent through JSON/save and prepare, exact prices/two per slot/no grade5, independent actors',()=>{
  const s=prep(),before=JSON.stringify(s);assert.deepEqual(C.prepare(clone(s)),s);assert.equal(JSON.stringify(s),before);
  for(const p of s.players){assert.equal(p.economy.shop.stock.length,6);for(const slot of E.slots){const rows=p.economy.shop.stock.filter(i=>E.get(i.catId).slot===slot);assert.equal(rows.length,2);assert.notEqual(rows[0].catId,rows[1].catId);assert.ok(rows.every(i=>i.price===60&&i.grade===1));}}
  let r=tx(s,'buy',{stockId:s.players[0].economy.shop.stock[0].id});assert.equal(r.result.ok,true);assert.equal(r.state.players[0].economy.gold,90);assert.equal(r.state.rng,s.rng);assert.deepEqual(r.state.players[1],s.players[1]);assert.equal(tx(r.state,'buy',{stockId:s.players[0].economy.shop.stock[0].id},'c2').result.code,'sold');
});

test('all commands pure, receipts exactly once, conflicting ids rejected, failed retry preserves RNG and balances',()=>{
  let s=prep(),before=clone(s),command={commandId:'purchase',pid:0,type:'buy',stockId:s.players[0].economy.shop.stock[0].id};const r=N.transact(s,command);assert.deepEqual(s,before);assert.equal(r.result.ok,true);const repeat=N.transact(r.state,command);assert.equal(repeat.result.duplicate,true);assert.deepEqual(repeat.state,r.state);assert.equal(N.transact(r.state,{...command,type:'material'}).result.code,'command-conflict');
  const low=clone(s);low.players[0].economy.gold=0;const fail=tx(low,'material');assert.equal(fail.result.code,'insufficient-funds');assert.deepEqual(fail.state,low);assert.equal(tx(s,'material').result.ok,true);
  s=tx(s,'material').state;s=tx(s,'material',{},'m2').state;s=tx(s,'material',{},'m3').state;assert.equal(tx(s,'material',{},'m4').result.code,'material-limit');assert.equal(s.players[0].economy.sand,9);
});

test('equip/unequip/lock/dismantle and guarded transfer with explicit before/after values',()=>{
  let s=prep(),a=give(s,'chi-xiao-sword',1,6),b=give(s,'xuanfu-staff',5,2,0,false);s.players[0].economy.sand=20;
  assert.equal(tx(s,'dismantle',{uid:a.uid,confirm:true}).result.code,'equipped');s=tx(s,'lock',{uid:a.uid,locked:true}).state;assert.equal(tx(s,'transfer',{sourceUid:a.uid,targetUid:b.uid,confirm:true},'transfer').result.code,'locked');
  s=tx(s,'lock',{uid:a.uid,locked:false},'unlock').state;assert.equal(tx(s,'transfer',{sourceUid:a.uid,targetUid:b.uid},'transfer').result.code,'confirmation-required');const r=tx(s,'transfer',{sourceUid:a.uid,targetUid:b.uid,confirm:true},'transfer');assert.deepEqual(r.result.before,{source:6,target:2});assert.deepEqual(r.result.after,{source:0,target:6});s=r.state;assert.equal(s.players[0].economy.gold,120);assert.equal(s.players[0].economy.sand,18);assert.equal(s.players[0].economy.inventory[1].grade,5);
  s=tx(s,'unequip',{slot:'weapon'},'u').state;assert.equal(tx(s,'dismantle',{uid:b.uid},'d').result.code,'confirmation-required');s=tx(s,'dismantle',{uid:b.uid,confirm:true},'d').state;assert.equal(s.players[0].economy.sand,23);s=tx(s,'dismantle',{uid:a.uid},'da').state;assert.equal(s.players[0].economy.sand,24);
});

test('real independent forge RNG: success/failure cost, levels 1..10 and late failure -1; no shattering',()=>{
  let successes=0,failures=0;const outcomes=Array.from({length:10},()=>({success:0,failure:0}));
  for(let old=0;old<10;old++)for(let seed=1;seed<=128;seed++){
    const s=C.prepare(end(fixture('yun-zhiwei',Math.imul(seed,7919)))),i=give(s,'chi-xiao-sword',5,old);s.players[0].economy.gold=10000;s.players[0].economy.sand=1000;
    const r=tx(s,'forge',{uid:i.uid});assert.equal(r.result.ok,true);assert.equal(r.state.players[0].economy.gold,10000-N.goldCosts[old]);assert.equal(r.state.players[0].economy.sand,1000-N.sandCosts[old]);assert.equal(r.state.rng,s.rng);assert.equal(r.state.players[0].economy.rng.loot,s.players[0].economy.rng.loot);assert.notEqual(r.state.players[0].economy.rng.forge,s.players[0].economy.rng.forge);assert.equal(r.state.players[0].economy.inventory.length,1);
    assert.equal(r.result.after,r.result.success?old+1:old>=7?old-1:old);if(r.result.success){successes++;outcomes[old].success++;}else{failures++;outcomes[old].failure++;}
  }
  assert.ok(successes>0);assert.ok(failures>0);
  for(let old=0;old<10;old++){assert.ok(outcomes[old].success>0);if(old>=2)assert.ok(outcomes[old].failure>0);else assert.equal(outcomes[old].failure,0);}
});

test('set drop missing slots first, guaranteed seals, selected redemption no gold, unlock persistent',()=>{
  let s=species(fixture(),'blackarmor-general');
  for(let n=0;n<20;n++){s.monster.id=n+1;N.creditKill(s,s.monster,0);}
  const items=s.players[0].economy.inventory.filter(i=>E.get(i.catId).setId==='zhenyue');assert.ok(items.length>=3);assert.equal(new Set(items.slice(0,3).map(i=>E.get(i.catId).slot)).size,3);assert.ok(items.every(i=>i.grade===4));assert.equal(s.players[0].economy.seals.zhenyue,20);
  // This distribution-only hook fixture has no corresponding combat history; use a validated preparation for redemption.
  s=prep();s.players[0].economy.seals.zhenyue=2;const gold=s.players[0].economy.gold,r=tx(s,'redeem',{setId:'zhenyue',slot:'armor'});assert.equal(r.result.ok,true);assert.equal(r.result.item.catId,'set-zhenyue-armor');assert.equal(r.result.item.level,0);assert.equal(r.state.players[0].economy.gold,gold);assert.equal(r.state.players[0].economy.seals.zhenyue,0);
  s=species(fixture(),'golden-tiger');s.monster.hp=1;s.monster.shield=0;s=basic(s).state;assert.equal(s.players[0].economy.unlockedGrade,2);s=C.prepare(end(s));assert.deepEqual(s.players[0].economy.shop.stock.map(i=>i.grade),[2,1,2,1,2,1]);
});

test('AI one stock purchase at most, forge at most three, reserve30, persistent after restore',()=>{
  let s=end(fixture());for(const p of s.players){p.economy.gold=1000;p.economy.sand=100;}
  s=C.prepare(s);for(const p of s.players.slice(1)){assert.ok(p.economy.gold>=30);assert.equal(p.economy.inventory.length,1);assert.ok(p.economy.inventory[0].level<=3);assert.equal(p.economy.shop.stock.filter(i=>i.sold).length,1);}assert.deepEqual(C.prepare(clone(s)),s);
});

test('V3 validates malformed UID/ownership/grade/level/wallet/seals/shop/quota/RNG/receipts',()=>{
  const s=prep();give(s,'chi-xiao-sword');
  const corrupt=[x=>x.players[0].economy.gold=-1,x=>x.players[0].economy.sand=.5,x=>x.players[0].economy.seals.zhenyue=-1,x=>x.players[0].economy.inventory[0].grade=6,x=>x.players[0].economy.inventory[0].level=11,x=>x.players[0].equipment.weapon='p1-1',x=>x.players[0].equipment.armor='p0-1',x=>x.players[0].economy.inventory.push(clone(x.players[0].economy.inventory[0])),x=>x.players[0].equipmentState.stored=11,x=>x.players[0].equipmentState.generated=21,x=>x.players[0].equipmentState.zhenyueUses=4,x=>x.players[0].equipmentState.wuxiangCount=3,x=>x.players[0].economy.rng.forge=0,x=>x.players[0].economy.shop.stock[0].grade=5,x=>x.players[0].economy.shop=null,x=>x.players[0].economy.receipts=[{id:'x',signature:'x',result:{ok:false}}]];
  for(const mutate of corrupt){const x=clone(s);mutate(x);assert.throws(()=>C.validate(x),/Invalid cultivation/);}
});

test('two-piece bonuses persist with three pieces and use distinct slots; discard shield really expires',()=>{
  const expected={zhenyue:{shield:.02},jiuyou:{heal:.02},chixiao:{damage:.01},wuxiang:{heal:.01,shield:.01}};
  for(const id of Object.keys(expected)){
    const s=fixture();give(s,'set-'+id+'-weapon',4);give(s,'set-'+id+'-armor',4);let b=E.bonuses(s.players[0]);assert.equal(b.sets[id],2);
    for(const [kind,n]of Object.entries(expected[id]))assert.ok(Math.abs(b[kind]-(kind==='damage'?.035+n:n))<1e-12);
    give(s,'set-'+id+'-accessory',4);b=E.bonuses(s.players[0]);assert.equal(b.sets[id],3);for(const [kind,n]of Object.entries(expected[id]))assert.ok(Math.abs(b[kind]-(kind==='damage'?.035+n:.035+n))<1e-12);
  }
  let s=fixture();give(s,'xuanyu-robe');for(let n=0;n<5;n++)s=basic(s).state;assert.equal(s.players[0].shieldTurns,2);s=basic(s).state;assert.equal(s.players[0].shieldTurns,1);s=basic(s).state;assert.equal(s.players[0].shield,0);assert.equal(s.players[0].shieldTurns,0);
});

test('natural death guard guarantee remains exactly one, no gear recovery scaling/storage; recovery2set excludes overheal',()=>{
  let s=species(fixture('su-lingheng'),'whetgold-rat');give(s,'qingheng-whisk',5,10);give(s,'qingheng-pendant',5,10);s.players[0].hp=1;s.players[0].aggro=100;s.players[0].statuses=[{kind:'deathGuard',value:1,duration:2,charges:1}];s=enemy(s).state;
  assert.equal(s.players[0].hp,1);assert.equal(s.players[0].passiveState.generated,0);assert.equal(s.players[0].equipmentState.generated,0);
  s=fixture();set(s,'jiuyou');s.players[0].hp=999;s=meld(s,'T.chow.234').state;assert.equal(s.players[0].equipmentState.jiuyouMeter,1);s=meld(s,'T.chow.234').state;assert.equal(s.players[0].equipmentState.jiuyouMeter,1);
});

test('xuanfu applies to active DOT, chixiao ignores pure DOT, and equipment extra cannot produce a followup',()=>{
  let s=species(fixture(),'blackarmor-general');give(s,'xuanfu-staff');s=meld(s,'W.pong.111').state;let r=enemy(s);const dot=r.effects.find(e=>e.source==='dot'&&e.pid===0);assert.equal(dot.amount,Math.round(63*1.04*(1-s.monster.armor)));
  s=species(fixture(),'blackarmor-general');set(s,'chixiao');for(let n=0;n<4;n++)s=meld(s,'W.pong.111').state;assert.equal(s.players[0].equipmentState.chixiaoCount,0);
  s=species(fixture(),'blackarmor-general');set(s,'chixiao');s.players[0].statuses=[{kind:'followup',amount:20,duration:10,charges:10}];for(let n=0;n<3;n++){r=meld(s,'W.chow.234');assert.equal(r.effects.filter(e=>e.source==='followup'&&e.skillId!=='equipment').length,1);s=r.state;}assert.equal(r.effects.filter(e=>e.skillId==='equipment').length,1);
});

test('fixed loot distribution boundaries, distinct RNG per actor, no wallet capacity or gear inventory cap',()=>{
  const s=species(fixture(),'whetgold-rat');let drops=0;
  for(let id=1;id<=1000;id++){s.monster.id=id;N.creditKill(s,s.monster,0);}
  for(const p of s.players){assert.ok(p.economy.inventory.every(i=>i.grade<=3&&!E.get(i.catId).setId));assert.ok(p.economy.inventory.length>140&&p.economy.inventory.length<260);drops+=p.economy.inventory.length;assert.equal(p.economy.sand,1000);}
  assert.notEqual(JSON.stringify(s.players[0].economy.inventory.map(i=>i.catId)),JSON.stringify(s.players[1].economy.inventory.map(i=>i.catId)));assert.ok(drops>600);
  const large=fixture();for(let n=0;n<5000;n++)give(large,'chi-xiao-sword',1,0,0,false);assert.ok(C.validate(large));assert.equal(large.players[0].economy.inventory.length,5000);
});

test('equipment set/storage damage and hits cannot feed later ownDamageSinceMark/ownHitsSinceMark chains',()=>{
  for(const mark of ['B.concealed.8888','W.concealed.9999'])for(const build of ['zhenyue','storage']){
    let base=species(fixture(),'blackarmor-general');if(build==='zhenyue')set(base,'zhenyue');else give(base,'qingheng-whisk',4);
    base=meld(base,mark).state;const charged=clone(base);
    if(build==='zhenyue')charged.players[0].equipmentState.zhenyueMeter=100;else {charged.players[0].equipmentState.stored=10;charged.players[0].equipmentState.generated=10;}
    const a=basic(base),b=basic(charged);assert.ok(b.state.players[0].damage>a.state.players[0].damage);assert.ok(b.state.players[0].equipmentState.extraDamage>0);assert.equal(b.state.players[0].equipmentState.extraHits,1);
    const markDamage=r=>r.effects.filter(e=>e.source==='counter'&&e.pid===0).reduce((n,e)=>n+e.amount,0);
    assert.equal(markDamage(enemy(a.state)),markDamage(enemy(JSON.parse(JSON.stringify(b.state)))));
  }
});

test('finisher includes equipment segment in total and equipment inherits finisher-specific curse',()=>{
  const F=require('../cultivation-finishers.js');
  let s=species(fixture(),'whetgold-rat');set(s,'wuxiang',5);s.players[0].equipmentState.wuxiangCount=2;s.players[0].equipmentState.wuxiangElement='water';
  const event={type:'finish',pid:0,items:[{id:'pure-flush',fan:1,suit:'W'}],fan:1};
  const plain=send(s,event);s.players[0].activeSeals=F.curses([{id:'single-wait',fan:1}]);const cursed=send(s,event);
  for(const r of [plain,cursed]){const actual=r.effects.filter(e=>e.type==='damage'&&e.pid===0).reduce((n,e)=>n+e.amount,0);assert.equal(r.state.finisher.total,actual);assert.ok(r.state.finisher.parts.some(p=>p.id==='equipment'));assert.equal(C.validate(JSON.parse(JSON.stringify(r.state))),true);}
  assert.equal(plain.effects.find(e=>e.skillId==='equipment').amount,14);assert.equal(cursed.effects.find(e=>e.skillId==='equipment').amount,12);
});

module.exports={fixture,give,set,species,send,basic,enemy,meld,end,prep,tx};
