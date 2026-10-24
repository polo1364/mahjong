const {test}=require('node:test');
const A=require('node:assert/strict');
const C=require('../cultivation-combat.js'),I=require('../cultivation-items.js'),N=require('../cultivation-economy.js'),M=require('../cultivation-monsters.js'),K=require('../cultivation-monster-skills.js'),S=require('../cultivation-skills.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const fresh=(hero='yun-zhiwei',seed=431)=>C.create(seed,null,{heroId:hero,equipment:true});
const send=(s,e)=>C.apply(s,{id:s.seq+1,...e});
const end=s=>send(s,{type:'finish',reason:'draw',pid:null}).state;
const prep=()=>C.prepare(end(fresh()));
const tx=(s,type,args={},id='tx')=>N.transact(s,{commandId:id,pid:0,type,...args});
function carry(s,ids,pid=0){s.players[pid].economy.items.carried=ids.map(id=>({id,used:false}));return s;}
function monster(s,id='frostfang-wolf.bite'){
 const k=K.get(id),m=M.get(k.speciesId);Object.assign(s.monster,{speciesId:m.id,tier:m.tier,name:m.name,element:k.element==='neutral'?m.element:k.element,hp:m.hp,maxHp:m.hp,shield:m.shield,armor:m.armor,statuses:[],attacks:0,heals:0,shields:0});
 if(m.tier==='boss')s.monster.attacks=2*['metal','wood','water','fire','earth'].indexOf(s.monster.element);
 s.monster.nextAttack={skillId:k.id,monsterId:s.monster.id,actionNumber:s.monster.attacks+1,type:k.type,damage:k.damage,charged:k.charged,ailment:null,cancelled:false,controlUsed:false,sealAilment:false,sealed:false};
 s.players[0].aggro=100;return s;
}
function enemy(s){s=clone(s);s.discardCount=4;s.enemyDue=s.monster.id;return send(s,{type:'enemy'});}
function meld(s,id){const k=S.get(id);return send(s,{type:'meld',pid:0,action:k.action,...(k.family==='honor'?{key:k.combo}:{keys:[...k.combo].map(n=>k.family+n)})});}
function gear(s,slot='weapon',level=7){const ids={weapon:'chi-xiao-sword',armor:'zhenyue-armor',accessory:'ningyu-jade'},p=s.players[0];p.economy.gold=1000;p.economy.sand=100;p.economy.inventory.push({uid:'p0-1',catId:ids[slot],grade:1,level,locked:false});p.economy.serial=1;p.economy.rng.forge=0x12345678;return p;}

test('17 unique frozen items, 11 recipes, 14 merchant stock entries, 6 battle / 6 material / 5 forge',()=>{
 A.equal(I.all.length,17);A.equal(new Set(I.all.map(i=>i.id)).size,17);A.equal(I.all.filter(i=>i.recipe).length,11);A.equal(I.shop.length,14);
 for(const [cat,n] of [['battle',6],['material',6],['forge',5]])A.equal(I.all.filter(i=>i.category===cat).length,n);
 for(const x of I.all){A.ok(Object.isFrozen(x));for(const k of Object.keys(x.recipe||{}))A.equal(I.get(k).category,'material');}
});
test('old ongoing V3 has no retroactive drops; preparation migration preserves equipment and currency',()=>{
 let s=fresh();delete s.itemRulesVersion;for(const p of s.players)delete p.economy.items;
 const old=clone(s);A.deepEqual(C.create(8,s),old);s.monster.hp=1;s.monster.shield=0;s=send(s,{type:'discard',pid:0,key:'W1'}).state;A.equal(s.players[0].economy.items,undefined);
 s=end(s);const wallet=clone(s.players[0].economy);s=C.prepare(s);A.equal(s.itemRulesVersion,1);A.deepEqual(s.players[0].economy.items.counts,{});A.equal(s.players[0].economy.gold,wallet.gold);A.deepEqual(s.players[0].economy.inventory,wallet.inventory);A.deepEqual(C.prepare(s),s);
});
test('preparation reserves exactly two different owned items; failed commands pure',()=>{
 let s=prep();s.players[0].economy.items.counts={heal:2,edge:1,barrier:1};
 for(const ids of [['heal','heal'],['heal','edge','barrier'],['guard'],['metal']]){const r=tx(s,'item-prepare',{ids});A.equal(r.result.ok,false);A.deepEqual(r.state,s);}
 s=tx(s,'item-prepare',{ids:['heal','edge']}).state;A.equal(s.players[0].economy.items.counts.heal,2);
 const next=C.create(1,s);A.equal(next.players[0].economy.items.counts.heal,1);A.deepEqual(next.players[0].economy.items.carried,[{id:'heal',used:false},{id:'edge',used:false}]);A.deepEqual(C.create(9,next),next);
});
test('unused items returned once on draw/hu/defeat; used items stay consumed; new drops cannot be carried midhand',()=>{
 for(const reason of ['draw','hu','defeat']){let s=carry(fresh(),['heal','edge']);s.players[0].economy.items.carried[1].used=true;s.players[0].economy.items.counts.guard=4;
 const e={type:'finish',reason,pid:null},r=send(s,e);A.equal(r.state.players[0].economy.items.counts.heal,1);A.equal(r.state.players[0].economy.items.counts.edge,undefined);A.deepEqual(r.state.players[0].economy.items.carried,[]);A.deepEqual(send(r.state,e).state,r.state);A.equal(tx(s,'item-prepare',{ids:['guard']}).result.code,'preparation-required');}
});
test('all 19 monster species give each player fixed materials and no old RNG changes; duplicate grants ignored',()=>{
 for(const spec of M.all){const s=fresh(),before=clone(s.players.map(p=>p.economy.rng)),m={...spec,speciesId:spec.id,id:1};if(spec.tier==='boss')m.element='fire';
 N.creditKill(s,m,2);const after=clone(s);N.creditKill(s,m,2);A.deepEqual(s,after);A.deepEqual(s.players.map(p=>p.economy.rng),after.players.map(p=>p.economy.rng));
 for(const p of s.players){const b=p.economy.items;A.equal(b.handLoot.length,1);if(spec.tier==='boss'){for(const el of ['metal','wood','water','fire','earth'])A.equal(b.counts[el],1);A.equal(b.counts.shard,1);}else A.equal(b.counts[spec.element],{small:1,elite:2,miniboss:3}[spec.tier]);}
 // Existing loot, forge and shop streams match the identical kill without the extension.
 const baseline=fresh();baseline.itemRulesVersion=0;for(const p of baseline.players)delete p.economy.items;N.creditKill(baseline,m,2);
 A.deepEqual(s.players.map(p=>p.economy.rng),baseline.players.map(p=>p.economy.rng));A.deepEqual(s.players.map(p=>p.economy.inventory),baseline.players.map(p=>p.economy.inventory));A.equal(s.rng,baseline.rng);
 }
});
test('all recipes exact deductions, missing resources atomic; command receipts replay once',()=>{
 for(const item of I.all.filter(x=>x.recipe)){let s=prep(),p=s.players[0];p.economy.gold=100;p.economy.items.counts={...item.recipe};const r=tx(s,'item-craft',{itemId:item.id});A.ok(r.result.ok);A.equal(r.state.players[0].economy.gold,100-item.gold);A.equal(r.state.players[0].economy.items.counts[item.id],1);for(const id of Object.keys(item.recipe))A.equal(r.state.players[0].economy.items.counts[id],0);A.deepEqual(tx(r.state,'item-craft',{itemId:item.id}).state,r.state);const bad=tx(r.state,'item-craft',{itemId:item.id},'new');A.equal(bad.result.ok,false);A.deepEqual(bad.state,r.state);}
});
test('shop prices and individual caps persist on reopening; rare items cannot be bought',()=>{
 for(const stock of I.shop){let s=prep();s.players[0].economy.gold=1000;for(let n=0;n<stock.limit;n++)s=tx(s,'item-buy',{itemId:stock.id},'b'+n).state;A.equal(s.players[0].economy.gold,1000-stock.price*stock.limit);A.equal(tx(C.prepare(clone(s)),'item-buy',{itemId:stock.id},'again').result.code,'sold');}
 for(const id of ['luck','preserve','shard'])A.equal(tx(prep(),'item-buy',{itemId:id}).result.ok,false);
});
for(const slot of ['weapon','armor','accessory'])test(slot+' stone + preserve failed forge exact cost, consumes once and no RNG resample',()=>{
 const s=prep(),p=gear(s,slot);p.economy.items.counts={[slot+'-stone']:1,preserve:1};const r=tx(s,'forge',{uid:'p0-1',stone:true,charm:'preserve'});A.ok(r.result.ok);A.equal(r.result.success,false);A.equal(r.result.after,7);A.equal(r.result.sand,3);A.equal(r.state.players[0].economy.gold,925);A.equal(r.state.players[0].economy.items.counts.preserve,0);A.deepEqual(tx(r.state,'forge',{uid:'p0-1',stone:true,charm:'preserve'}).state,r.state);
});
test('luck is +5 percentage points, charged on success/failure; invalid level/combination rejected',()=>{
 for(const level of [2,3,7,8,9]){const s=prep(),p=gear(s,'weapon',level);p.economy.items.counts={luck:1};const r=tx(s,'forge',{uid:'p0-1',charm:'luck'});A.ok(r.result.ok);A.equal(r.result.rate,Math.min(1,N.rates[level]+.05));A.equal(r.state.players[0].economy.items.counts.luck,0);}
 for(const [level,charm] of [[0,'luck'],[1,'luck'],[6,'preserve'],[7,['luck','preserve']]]){const s=prep(),p=gear(s,'weapon',level);p.economy.items.counts={luck:1,preserve:1};const r=tx(s,'forge',{uid:'p0-1',charm});A.equal(r.result.ok,false);A.deepEqual(r.state,s);}
 const s=prep(),p=gear(s,'weapon',0);p.economy.items.counts={'weapon-stone':1};A.equal(tx(s,'forge',{uid:'p0-1',stone:true}).result.sand,0);
});
test('barrier uses real absorption; shield strip itself does not credit conversion',()=>{
 let s=monster(carry(fresh('luo-xuanyu'),['barrier']),'coldpool-spirit.erode'),r=enemy(s);A.equal(r.effects.filter(e=>e.type==='item').length,1);A.equal(r.effects.find(e=>e.type==='shield').amount,104);A.equal(r.effects.find(e=>e.type==='shieldStrip').amount,20);A.equal(r.effects.find(e=>e.type==='hurt'&&e.pid===0).absorbed,84);A.equal(r.state.players[0].passiveState.stored,12.6);
 s=monster(carry(fresh(),['barrier']));s.players[0].shield=50;s.players[0].shieldTurns=2;r=enemy(s);A.equal(r.effects.some(e=>e.type==='item'),false);
});
test('heal after damage including lethal all-target action, once, before defeat check',()=>{
 let s=monster(fresh(),'five-phase-sovereign.thunder');for(const p of s.players){p.hp=50;carry(s,['heal'],p.pid);}const r=enemy(s);A.equal(r.state.ended,false);A.ok(r.state.players.every(p=>p.hp>0&&!p.weak));A.equal(r.effects.filter(e=>e.type==='item'&&e.itemId==='heal').length,4);A.deepEqual(send(r.state,{type:'enemy'}).effects,[]);
 s=monster(carry(fresh('su-lingheng'),['heal']));s.players[0].hp=400;const t=enemy(s);A.equal(t.effects.find(e=>e.type==='heal'&&e.pid===0).amount,130);A.equal(t.state.players[0].passiveState.stored,19.5);
});
test('cleanse removes oldest negative after full attack, preserves seals, runs before healing',()=>{
 let s=monster(carry(fresh(),['cleanse','heal']),'moss-flower.pollen');s.players[0].hp=300;
 s.players[0].activeSeals=require('../cultivation-finishers.js').curses([{id:'big-winds',fan:2}]);
 const seals=clone(s.players[0].activeSeals);A.ok(seals.length>0);const r=enemy(s);A.equal(r.state.players[0].statuses.some(x=>x.kind==='healingDown'),false);A.deepEqual(r.state.players[0].activeSeals,seals);A.equal(r.effects.find(e=>e.type==='heal'&&e.pid===0).amount,120);A.deepEqual(r.effects.filter(e=>e.type==='item').map(e=>e.itemId),['cleanse','heal']);
});
test('stealth retargets live highest aggro; top-aggro skill protects its guarantee through next action',()=>{
 let s=monster(carry(fresh(),['stealth']));s.players[1].aggro=95;let r=enemy(s);A.equal(r.state.players[0].aggro,70);A.deepEqual(r.effects.find(e=>e.type==='enemy').targets,[1]);
 s=monster(carry(fresh(),['stealth']));const sk=S.all.find(k=>k.effects.some(e=>e.op==='aggro'&&e.mode==='top'));s=meld(s,sk.id).state;r=enemy(s);A.equal(r.effects.some(e=>e.type==='item'&&e.itemId==='stealth'),false);
});
test('guard scopes to whole charge, no double counter on multi-hit, canceled attacks consume nothing',()=>{
 let s=monster(carry(fresh(),['guard','barrier']),'stoneback-boar.charge');s.monster.nextAttack.cancelled=true;let r=enemy(s);A.equal(r.effects.some(e=>e.type==='item'),false);
 s=monster(carry(fresh(),['guard']),'stoneback-boar.charge');r=enemy(s);A.equal(r.effects.find(e=>e.type==='hurt').amount,110);
 s=monster(carry(fresh(),['guard']),'frostfang-wolf.bite');r=enemy(s);A.equal(r.effects.some(e=>e.type==='item'),false);
});
test('edge applies only once to one complete skill including finisher; no basic or followup consumption',()=>{
 let s=monster(carry(fresh(),['edge']));let r=send(s,{type:'discard',pid:0,key:'W1'});A.equal(r.effects.some(e=>e.type==='item'),false);
 r=meld(r.state,'W.chow.789');A.equal(r.effects.filter(e=>e.type==='item').length,1);r=meld(r.state,'W.chow.789');A.equal(r.effects.some(e=>e.type==='item'),false);
 s=monster(carry(fresh(),['edge']));s.players[0].statuses.push({kind:'followup',amount:100,duration:3,charges:1});const baseline=clone(s);baseline.players[0].economy.items.carried=[];
 const finish={type:'finish',pid:0,fan:20,items:[{id:'pureSuit',fan:8,suit:'W'},{id:'allPongs',fan:4}],method:'selfDraw'};
 // Generic legacy finisher is still a capped complete skill and supports existing saves.
 delete finish.items;const a=send(s,finish),b=send(baseline,finish);A.equal(a.effects.filter(e=>e.type==='item').length,1);A.ok(a.state.players[0].damage-b.state.players[0].damage<=60);A.equal(a.effects.find(e=>e.source==='followup').amount,b.effects.find(e=>e.source==='followup').amount);A.equal(a.state.finisher.total,a.state.players[0].damage);
});
test('AI spends at most20 on additional supplies, preserves30 and no repeat on prepare/restore',()=>{
 let s=end(fresh());s.players.forEach(p=>{p.economy.gold=120;p.economy.sand=0;p.economy.inventory=[];});s=C.prepare(s);
 for(const p of s.players.slice(1)){A.ok(p.economy.gold>=30);A.ok(p.economy.items.prepared.length<=2);A.ok(Object.values(p.economy.items.bought).reduce((a,b)=>a+b,0)<=1);}
 A.deepEqual(C.prepare(clone(s)),s);
});
test('malformed inventory, RNG, preparation and usage saves rejected',()=>{
 const cases=[b=>b.rng=0,b=>b.counts.heal=-1,b=>b.counts.unknown=1,b=>b.prepared=['heal','heal'],b=>b.carried=[{id:'metal',used:false}],b=>b.bought.preserve=1,b=>b.tauntMonster=999,b=>b.tab='bad'];
 for(const mutate of cases){const s=fresh();mutate(s.players[0].economy.items);A.throws(()=>C.validate(s),/items/);}
});

 test('modern multi-pattern finisher consumes edge once and reports every boosted part',()=>{
 const s=monster(carry(fresh(),['edge']));s.monster.hp=1;s.players[0].statuses.push({kind:'nextFlatDamage',value:100,duration:3,charges:1},{kind:'nextFollowup',amount:90,duration:3,charges:1});
 const baseline=clone(s);baseline.players[0].economy.items.carried=[];
 const event={type:'finish',reason:'hu',pid:0,from:1,method:'discard',fan:12,items:[{id:'pure-flush',fan:8,suit:'W'},{id:'all-pungs',fan:4}]};
 const a=send(s,event),b=send(baseline,event);A.equal(a.effects.filter(e=>e.type==='item').length,1);A.equal(a.state.kills.length,1);A.equal(a.state.monster.id,1);A.equal(a.state.finisher.total,a.state.players[0].damage);A.equal(a.state.finisher.parts.reduce((n,p)=>n+p.damage,0),a.state.finisher.total);A.ok(a.state.players[0].damage>b.state.players[0].damage);A.ok(a.state.players[0].damage-b.state.players[0].damage<=60);
 A.equal(a.effects.filter(e=>e.type==='damage'&&e.segmentId==='followup').length,1);A.equal(a.state.players[0].statuses.some(x=>x.kind.startsWith('next')),false);
 });

