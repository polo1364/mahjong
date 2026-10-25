const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cultivation-combat.js');
const H = require('../cultivation-heroes.js');
const M = require('../cultivation-monsters.js');
const Skills = require('../cultivation-skills.js');
const clone = x => JSON.parse(JSON.stringify(x));
const send = (s, e) => C.apply(s, {id:s.seq+1,...e}).state;
function fixture(hero='yun-zhiwei', species='whetgold-rat', attacks=0) {
  const s=C.create(123,null,{heroId:hero,monsterSkillVersion:0}), m=M.get(species);
  Object.assign(s.monster,{speciesId:species,tier:m.tier,name:m.name,element:m.element,hp:m.hp,maxHp:m.hp,shield:m.shield,armor:m.armor,attacks,heals:0,shields:0,statuses:[]});
  s.monster.nextAttack={type:'single',charged:false,damage:m.single,ailment:null,cancelled:false,controlUsed:false,sealAilment:false};
  s.players.slice(1).forEach(p=>p.passiveState.counterReady=false);
  return s;
}
function meld(s, id, pid=0) {
  const sk=Skills.get(id);
  const event={type:'meld',pid,action:sk.action};
  if (/^[WTB]$/.test(sk.family)) event.keys=[...sk.combo].map(n=>sk.family+n); else event.key=sk.combo;
  return send(s,event);
}
function enemy(s,{type='single',damage=100,cancelled=false}={}) {
  s=clone(s); s.enemyDue=s.monster.id; s.discardCount=4;
  Object.assign(s.monster.nextAttack,{type,damage,cancelled});
  return C.apply(s,{id:s.seq+1,type:'enemy'});
}
function kill(s) {
  s=clone(s); s.monster.hp=1;s.monster.shield=0;
  return send(s,{type:'discard',pid:0,key:'W1'});
}
function end(s) {return send(s,{type:'finish',pid:null,reason:'draw'});}
const basic=(s)=>send(s,{type:'discard',pid:0,key:'W1'});

test('exact immutable catalogs, independent four-hero assignment and V1 opt-in boundary',()=>{
  assert.equal(H.all.length,10);assert.equal(M.all.length,34);
  assert.deepEqual(M.all.reduce((a,m)=>(a[m.tier]=(a[m.tier]||0)+1,a),{}),{small:15,elite:10,miniboss:8,boss:1});
  for(const h of H.all){const s=C.create(77,null,{heroId:h.id});assert.equal(s.version,2);assert.equal(s.players[0].heroId,h.id);assert.equal(new Set(s.players.map(p=>p.heroId)).size,4);assert.ok(C.validate(s));assert.equal(h.image,`assets/cultivation-journey/heroes/${h.id}.png`);}
  const legacy=C.create(77);assert.equal(legacy.version,1);assert.equal(C.create(1,end(legacy),{heroId:H.all[0].id}).version,1);
  assert.throws(()=>C.create(1,null,{heroId:'bad'}),/hero/);
});

test('hero damage multiplier applies exactly once on basic, multihit and secondary damage',()=>{
  let s=fixture('shen-gufeng');let r=C.apply(s,{id:1,type:'discard',pid:0,key:'W1'});
  assert.equal(r.effects.find(e=>e.type==='damage').amount,Math.round(50*1.04*1.25*.88));
  s=fixture('chi-ling');s.players[0].passiveState.fireMonsterId=s.monster.id;
  const after=meld(s,'B.chow.123');
  assert.equal(after.players[0].damage,Math.round(35*1.05*.88)*2+Math.round(50*1.05*.94));
});

test('Shen sword quota is 3rd own discard, max five per hand',()=>{
  let s=fixture('shen-gufeng');for(let i=0;i<18;i++)s=basic(s);
  assert.equal(s.players[0].passiveState.swordUses,5);assert.equal(s.players[0].passiveState.discards,18);
  const next=C.create(999,end(s));assert.equal(next.players[0].passiveState.swordUses,0);
});

test('Chi first direct skill grants 5 percent of whole skill once, capped and reset next encounter/hand',()=>{
  let s=fixture('chi-ling');const before=s.players[0].damage;s=meld(s,'B.chow.123');
  assert.equal(s.players[0].damage-before,Math.round((35+6)*1.05*.88)+Math.round(35*1.05*.88)+Math.round(50*1.05*.94));
  const once=s.players[0].passiveState.fireMonsterId;s=meld(s,'B.chow.123');assert.equal(s.players[0].passiveState.fireMonsterId,once);
  s=kill(s);assert.notEqual(s.monster.id,once);s=meld(s,'W.chow.234');assert.equal(s.players[0].passiveState.fireMonsterId,s.monster.id);
  s=C.create(999,end(s));assert.equal(s.players[0].passiveState.fireMonsterId,null);
  s=fixture('chi-ling');s=send(s,{type:'finish',pid:0,fan:100});assert.equal(s.players[0].passiveState.fireMonsterId,1);
});

test('Mu chow healing has own multiplier and three-use quota',()=>{
  let s=fixture('mu-canglan');s.players[0].hp=100;
  for(let i=0;i<4;i++)s=meld(s,'W.chow.345');
  assert.equal(s.players[0].hp,100+3*26);assert.equal(s.players[0].passiveState.tideUses,3);
  s=meld(s,'W.pong.333');assert.equal(s.players[0].passiveState.tideUses,3);
});

test('Su stores only effective non-natural healing, consumes on basic with caps',()=>{
  let s=fixture('su-lingheng');s.players[0].hp=990;s=meld(s,'T.chow.234');
  assert.equal(s.players[0].passiveState.stored,1.5);assert.equal(s.players[0].hp,s.players[0].maxHp);
  const quota=s.players[0].passiveState.generated;s=meld(s,'T.chow.234');assert.equal(s.players[0].passiveState.generated,quota);
  s=basic(s);assert.equal(s.players[0].passiveState.stored,0);
  for(let i=0;i<4;i++){s.players[0].hp=100;s=meld(s,'T.pong.666');s=basic(s);}
  assert.equal(s.players[0].passiveState.generated,60);
  s=fixture('su-lingheng');s.players[0].hp=0;s.players[0].weak=true;s=basic(basic(s));
  assert.equal(s.players[0].hp,300);assert.equal(s.players[0].passiveState.stored,0);
});

test('Yue defense multiplies existing reduction and extra 3 percent only while top living target',()=>{
  let s=fixture('yue-zhenshan');s.players[0].aggro=100;
  s.players[0].statuses=[{kind:'reduceDamage',value:.25,duration:2}];
  let r=enemy(s);assert.equal(s.players[0].maxHp-r.state.players[0].hp,Math.round(100*.94*.97*.75));
  s.players[1].aggro=101;r=enemy(s,{type:'all'});assert.equal(s.players[0].maxHp-r.state.players[0].hp,Math.round(100*.94*.75));
});

test('Luo stores real shield absorption only, bounded generated quota; expiry/strip do not generate',()=>{
  let s=fixture('luo-xuanyu');s.players[0].shield=100;s.players[0].shieldTurns=9;
  s=enemy(s).state;assert.equal(s.players[0].passiveState.stored,14.7);
  s=basic(s);assert.equal(s.players[0].passiveState.stored,0);
  s.players[0].shield=100;s.players[0].shieldTurns=1;s=basic(s);assert.equal(s.players[0].passiveState.generated,14.7);
  for(let i=0;i<5;i++){s.players[0].shield=200;s.players[0].shieldTurns=9;s=enemy(s).state;s=basic(s);}
  assert.equal(s.players[0].passiveState.generated,60);
});

test('Tie counter is once between own discards, at most five, no DoT chains or weak counters',()=>{
  let s=fixture('tie-wujiu','frostfang-wolf');let r=enemy(s);
  assert.equal(r.effects.filter(e=>e.source==='counter').length,1);assert.equal(r.effects.find(e=>e.type==='hurt').hits,2);
  s=enemy(r.state).state;assert.equal(s.players[0].passiveState.counterUses,1);
  for(let i=0;i<7;i++){s=basic(s);s=enemy(s,{damage:1}).state;}
  assert.equal(s.players[0].passiveState.counterUses,5);
  s=fixture('tie-wujiu');s.players[0].hp=1;s=enemy(s).state;assert.equal(s.players[0].passiveState.counterUses,0);
  s=fixture('tie-wujiu');s.players[0].statuses=[{kind:'burn',negative:true,duration:2,value:10}];s=basic(s);assert.equal(s.players[0].passiveState.counterUses,0);
});

test('Ye scales newly generated threat only, including extra threat, and taunt retains top guarantee',()=>{
  let s=fixture('ye-shuying');s.players[0].aggro=1000;let r=basic(s);
  assert.equal(r.players[0].aggro,1000+r.players[0].damage*.92);
  s.players[1].aggro=50000;s=meld(s,'W.pong.777');assert.ok(s.players[0].aggro>50000);assert.equal(C.target(s),0);
  s=fixture('ye-shuying');s=meld(s,'W.chow.789');assert.equal(s.players[0].aggro,(s.players[0].damage+130)*.92);
});

test('Yun remembers all meld types, first and non-direct casts give no bonus, changes max six',()=>{
  let s=fixture();s=meld(s,'W.chow.345');assert.equal(s.players[0].passiveState.changeUses,0);
  s=meld(s,'W.pong.222');assert.equal(s.players[0].passiveState.changeUses,1);
  s=meld(s,'W.pong.222');assert.equal(s.players[0].passiveState.changeUses,1);
  for(const id of ['W.exposed.2222','W.concealed.2222','W.added.2222','W.chow.234','W.pong.222','W.exposed.2222'])s=meld(s,id);
  assert.equal(s.players[0].passiveState.changeUses,6);
});

test('Hua public/initial flowers each count once and max three; JSON restore does not replay',()=>{
  let s=fixture('hua-jianlu');s.players[0].hp=500;
  for(const key of ['H1','H2','H3','H4'])s=send(s,{type:'flower',pid:0,key});
  assert.equal(s.players[0].passiveState.flowerUses,3);
  const saved=JSON.stringify(s),r=C.apply(JSON.parse(saved),{id:s.seq,type:'flower',pid:0,key:'H4'});
  assert.equal(JSON.stringify(r.state),saved);assert.deepEqual(r.effects,[]);
  const s2=send(s,{type:'flower',pid:0,key:'H4'});assert.deepEqual(s2.players[0],s.players[0]);
});

test('full journey is 18 small + 6 elite + 3 unique mini + 1 boss, without ending mahjong',()=>{
  let s=C.create(901,null,{heroId:'yun-zhiwei'});const seen=[];
  for(let i=0;i<28;i++){seen.push({id:s.monster.speciesId,tier:s.monster.tier});s=kill(s);}
  assert.deepEqual(seen.reduce((a,m)=>(a[m.tier]=(a[m.tier]||0)+1,a),{}),{small:18,elite:6,miniboss:3,boss:1});
  assert.equal(new Set(seen.filter(m=>m.tier==='miniboss').map(m=>m.id)).size,3);
  assert.equal(new Set(s.kills.map(k=>k.monsterId)).size,28);assert.ok(s.kills.every(k=>k.pid===0));
  assert.equal(s.journey.cycle,2);assert.equal(s.monster.tier,'small');assert.equal(s.ended,false);
  assert.equal(new Set(seen.filter(m=>m.tier==='small').slice(0,10).map(m=>m.id)).size,10);
  assert.equal(new Set(seen.filter(m=>m.tier==='elite').slice(0,5).map(m=>m.id)).size,5);
});

for(const tier of ['small','elite','miniboss','boss']) test(`${tier} draw/hu/defeat outcome retains or retreats correctly and previews without RNG changes`,()=>{
  for(const reason of ['draw','hu','defeat']){
    const id=M.all.find(m=>m.tier===tier).id;let s=fixture('yun-zhiwei',id);
    s.journey.minibossKills=tier==='boss'?3:1;s.journey.smallKills=2;s.journey.eliteKills=1;
    s=send(s,{type:'finish',pid:null,reason});assert.equal(s.journey.phase,'result');
    const snapshot=JSON.stringify(s),preview=C.journeyPreview(s);assert.equal(JSON.stringify(s),snapshot);
    const prep=C.prepare(s);assert.equal(prep.journey.phase,'preparation');assert.equal(s.journey.phase,'result');assert.equal(prep.rng,s.rng);
    const next=C.create(999,prep);assert.equal(next.monster.speciesId,preview.nextMonsterId);assert.equal(next.journey.phase,'combat');assert.equal(next.monster.hp,next.monster.maxHp);
    assert.deepEqual(next.players.map(p=>p.heroId),s.players.map(p=>p.heroId));assert.ok(next.players.every(p=>p.hp===H.get(p.heroId).hp&&p.maxHp===p.hp&&p.damage===0&&p.shield===0));
    if(['small','elite'].includes(tier))assert.equal(next.monster.speciesId,id);
    if(tier==='miniboss'){assert.equal(next.monster.tier,'small');assert.equal(next.journey.pendingMinibossId,id);assert.equal(next.journey.minibossKills,1);for(let i=0;i<8;i++)s=kill(i===0?next:s);assert.equal(s.monster.speciesId,id);}
    if(tier==='boss'){assert.equal(next.monster.tier,'elite');assert.equal(next.journey.minibossKills,0);}
    assert.equal(next.kills.length,0);
  }
});

for(const species of M.all) test(`catalog spawn and third-action behavior: ${species.id}`,()=>{
  let s=fixture('yun-zhiwei',species.id,1);
  let r=enemy(s,{damage:1,cancelled:true});s=r.state;
  assert.equal(s.monster.attacks,2);
  const a=s.monster.nextAttack,b=species.behavior;
  if(['chargeSingle','chargeAll','sword','sovereign'].includes(b)){assert.equal(a.charged,true);assert.equal(a.type,b==='chargeSingle'?'single':'all');assert.equal(a.damage,Math.round(species[a.type]*1.25));}
  if(['shieldDown','queen'].includes(b))assert.equal(a.type,'all');
  s.monster.hp=species.hp-300;s.players.forEach(p=>{p.shield=100;p.shieldTurns=9;});
  r=enemy(s,{type:a.type,damage:a.damage});s=r.state;
  if(b==='heal60')assert.equal(s.monster.hp,species.hp-240);
  if(b==='heal100')assert.equal(s.monster.hp,species.hp-200);
  if(b==='queen')assert.equal(s.monster.hp,species.hp-180);
  if(b==='shield60')assert.equal(s.monster.shield,species.shield+60);
  const kind=b==='healDown'?'healingDown':b==='shieldDown'?'shieldGainDown':b==='burn'?'burn':null;
  if(kind)assert.ok(s.players.some(p=>p.statuses.some(st=>st.kind===kind)));
  if(b==='shieldStrip')assert.equal(r.effects.find(e=>e.type==='hurt').absorbed,80);
  if(b==='double')assert.equal(r.effects.find(e=>e.type==='hurt').hits,2);
});

test('monster heal/shield quotas are two; cancelled special gives no effect',()=>{
  for(const id of ['binding-vine','forest-vine-demon','nether-vine-queen','sand-construct']){
    let s=fixture('yun-zhiwei',id);for(let i=0;i<10;i++){s.players.forEach(p=>{p.hp=p.maxHp;p.weak=false;});s.monster.hp=200;s=enemy(s,{damage:0}).state;}
    assert.equal(id==='sand-construct'?s.monster.shields:s.monster.heals,2);
    s=fixture('yun-zhiwei',id,2);s.monster.hp=200;s=enemy(s,{cancelled:true}).state;assert.equal(s.monster.heals+s.monster.shields,0);
  }
});

test('BOSS cycles five elements every two counted actions including cancelled, without clearing threat/status',()=>{
  let s=fixture('yun-zhiwei','five-phase-sovereign');s.players[0].aggro=777;s.monster.statuses=[{kind:'armor',value:.1,duration:20}];
  for(let i=1;i<=12;i++){s=enemy(s,{damage:0,cancelled:true}).state;assert.equal(s.monster.element,['metal','wood','water','fire','earth'][Math.floor(i/2)%5]);assert.equal(s.players[0].aggro,777);assert.ok(s.monster.statuses.some(st=>st.kind==='armor'));}
});

test('charged interruption and sealing use V2 base 125 percent, no legacy scaling',()=>{
  let s=fixture('yun-zhiwei','golden-tiger',1);s=enemy(s,{cancelled:true}).state;assert.equal(s.monster.nextAttack.damage,Math.round(M.get('golden-tiger').single*1.25));
  s=meld(s,'T.exposed.3333');assert.equal(s.monster.nextAttack.charged,false);assert.equal(s.monster.nextAttack.damage,M.get('golden-tiger').single);
  s=fixture('yun-zhiwei','golden-tiger',1);s=enemy(s,{cancelled:true}).state;s=meld(s,'T.chow.678');assert.equal(s.monster.nextAttack.cancelled,true);
});

test('V2 validate rejects corrupt identities, counters, equipment, phase, bags and species',()=>{
  const s=fixture();for(const mutate of [x=>x.players[1].heroId=x.players[0].heroId,x=>x.players[0].passiveState.stored=31,x=>x.players[0].passiveState.generated=61,x=>x.players[0].equipment.weapon='sword',x=>x.journey.phase='preparation',x=>x.journey.smallBag=['golden-tiger'],x=>x.journey.smallBag=['moss-flower','moss-flower'],x=>x.journey.pendingMinibossId='golden-tiger',x=>x.monster.speciesId='bad',x=>x.monster.attacks=-1,x=>x.monster.maxHp=999]){const bad=clone(s);mutate(bad);assert.throws(()=>C.validate(bad),/Invalid cultivation/);}
});

test('conditional empty healing does not spend Yun or Chi passive, and estimates preserve exact state',()=>{
  let s=fixture('yun-zhiwei');s=meld(s,'W.pong.333');s=meld(s,'T.chow.234');assert.equal(s.players[0].passiveState.changeUses,0);
  s=fixture('chi-ling');s=meld(s,'T.chow.234');assert.equal(s.players[0].passiveState.fireMonsterId,null);
  s.players[0].hp=500;s=meld(s,'T.chow.234');assert.equal(s.players[0].passiveState.fireMonsterId,s.monster.id);
  for(const hero of ['mu-canglan','yun-zhiwei','chi-ling']){s=fixture(hero);s.players[0].hp=500;const before=JSON.stringify(s);assert.ok(Number.isFinite(C.estimate(s,0,Skills.get('W.chow.456'))));assert.equal(JSON.stringify(s),before);}
});

test('whole multihit/finisher kill switches once; last finisher persists seals across exact preparation restore',()=>{
  let s=fixture('chi-ling');s.monster.hp=1;
  const r=C.apply(s,{id:1,type:'meld',pid:0,action:'exposed',keys:['T1','T1','T1','T1']});
  assert.equal(r.state.kills.length,1);assert.equal(r.state.monster.id,2);assert.equal(r.effects.filter(e=>e.type==='spawn').length,1);
  assert.ok(r.effects.filter(e=>e.type==='damage').every(e=>e.monsterId===1));
  s=fixture('shen-gufeng');s.monster.hp=1;
  s=send(s,{type:'finish',pid:0,from:1,method:'discard',fan:1,items:[{id:'closed',fan:1}]});
  assert.equal(s.kills.length,1);assert.equal(s.monster.id,1);assert.equal(s.monster.hp,0);assert.ok(s.players[1].pendingSeals.length);
  const prep=C.prepare(JSON.parse(JSON.stringify(s))),next=C.create(88,prep);
  assert.deepEqual(next.players[1].activeSeals,s.players[1].pendingSeals);assert.equal(next.kills.length,1);assert.equal(next.monster.id,2);
  assert.deepEqual(C.create(12,next),next);
});

test('monster penalty exact own-discard lifetimes and burn damage; first-strike is only first counted action',()=>{
  let s=fixture('yun-zhiwei','moss-flower',2);s=enemy(s).state;s.players[0].hp=500;
  s=meld(s,'T.pong.666');assert.equal(s.players[0].hp,643);s=basic(s);assert.ok(!s.players[0].statuses.some(st=>st.kind==='healingDown'));
  s=fixture('yun-zhiwei','abyss-jiaolong',2);s=enemy(s,{type:'all'}).state;s=meld(s,'W.chow.567');assert.equal(s.players[0].shield,138);
  s=basic(s);assert.ok(s.players[0].statuses.some(st=>st.kind==='shieldGainDown'));s=basic(s);assert.ok(!s.players[0].statuses.some(st=>st.kind==='shieldGainDown'));
  s=fixture('yun-zhiwei','embertail-fox',2);s=enemy(s,{damage:0}).state;const hp=s.players[0].hp;s=basic(basic(basic(s)));assert.equal(s.players[0].hp,hp-20);
  let first;for(let seed=1;seed<100&&!first;seed++){let candidate=C.create(seed,null,{heroId:'yun-zhiwei'});if(candidate.monster.speciesId==='bladefeather-crow')first=candidate;}
  assert.ok(first);assert.equal(first.monster.nextAttack.damage,Math.round(M.get('bladefeather-crow')[first.monster.nextAttack.type]*1.1));
  first=enemy(first,{damage:0,cancelled:true}).state;assert.equal(first.monster.nextAttack.damage,M.get('bladefeather-crow')[first.monster.nextAttack.type]);
});

test('V2 taunt scales new stealth threat and still leads through threat seals; legacy semantics remain distinct',()=>{
  let s=fixture('ye-shuying');s.players[0].aggro=1000;s=meld(s,'W.pong.777');assert.equal(s.players[0].aggro,1092);
  s=fixture('ye-shuying');s.players[1].aggro=900000;s.players[0].activeSeals=require('../cultivation-finishers.js').curses([{id:'closed'}]);
  s=meld(s,'W.pong.777');assert.equal(C.target(s),0);assert.ok(s.players[0].aggro>900000);
});

test('V2 cumulative kill history passes the legacy per-hand 1000 limit without losing owner credit',()=>{
  let s=fixture('yun-zhiwei');s.monster.id=s.monster.index=1001;s.monster.hp=1;s.seq=1000;
  s.kills=Array.from({length:1000},(_,i)=>({monsterId:i+1,index:i+1,name:'礪金鼠',element:'metal',speciesId:'whetgold-rat',tier:'small',cycle:1,pid:i%4,seq:i+1}));
  s=basic(s);assert.equal(s.kills.length,1001);assert.equal(s.kills[0].pid,0);assert.equal(s.kills[999].pid,3);assert.equal(s.kills[1000].pid,0);
  assert.ok(C.validate(C.create(2,C.prepare(end(s)))));
});

test('Chi pure DoT gets one whole-skill budget spread over original ticks, survives saves and never expands on refresh',()=>{
  let s=fixture('chi-ling');s=meld(s,'W.pong.111');
  let dot=s.monster.statuses.find(st=>st.op==='dot');assert.equal(dot.passiveBonus,8.25);assert.equal(dot.passiveBonusTicks,3);assert.equal(s.players[0].passiveState.fireMonsterId,s.monster.id);
  const saved=JSON.stringify(s);s=JSON.parse(saved);s=meld(s,'W.pong.111');dot=s.monster.statuses.find(st=>st.op==='dot');assert.equal(dot.passiveBonus,8.25);
  const initial=s.players[0].damage;
  for(let i=0;i<3;i++)s=enemy(s,{damage:0}).state;
  assert.equal(s.players[0].damage-initial,3*Math.round((55+2.75)*1.05*1.25*.88));
  assert.ok(!s.monster.statuses.some(st=>st.op==='dot'));
  s=meld(s,'W.pong.111');assert.equal(s.monster.statuses.find(st=>st.op==='dot').passiveBonus,undefined);
});

test('Chi mixed direct plus DoT shares one capped first-skill bonus; extended tick has no new budget',()=>{
  let s=fixture('chi-ling');s=meld(s,'W.chow.123');
  assert.equal(s.players[0].damage,Math.round((75+(75+30*3)*.05)*1.05*1.25*.88));
  assert.equal(s.monster.statuses.find(st=>st.op==='dot').passiveBonus,undefined);
  s=fixture('chi-ling');s=meld(s,'W.pong.111');s=meld(s,'W.chow.234');
  const dot=s.monster.statuses.find(st=>st.op==='dot');assert.equal(dot.ticks,4);assert.equal(dot.passiveBonusTicks,3);
  for(let i=0;i<3;i++)s=enemy(s,{damage:0}).state;
  assert.equal(s.monster.statuses.find(st=>st.op==='dot').passiveBonus,0);
  const before=s.players[0].damage;s=enemy(s,{damage:0}).state;
  // Existing armor debuff is expired by the fourth tick; no second passive budget.
  assert.equal(s.players[0].damage-before,Math.round(55*1.05*1.25*.88));
});

test('Chi consuming own DoT carries only remaining bonus; corrupt persisted bonus is rejected',()=>{
  let s=fixture('chi-ling');s=meld(s,'W.pong.111');
  let bad=clone(s);bad.monster.statuses[0].passiveBonus=26;assert.throws(()=>C.validate(bad),/passive DoT/);
  bad=clone(s);bad.monster.statuses[0].passiveBonusTicks=-1;assert.throws(()=>C.validate(bad),/passive DoT/);
  s=enemy(s,{damage:0}).state;const remaining=s.monster.statuses.find(st=>st.op==='dot').passiveBonus;assert.equal(remaining,5.5);
  const before=s.players[0].damage;s=meld(s,'W.exposed.1111');
  assert.equal(s.players[0].damage-before,Math.round(170*1.05*1.25*.88)+Math.round((55*3+5.5)*1.05*1.25*.88));
  assert.equal(s.monster.statuses.filter(st=>st.op==='dot').length,0);
});

test('Chi delayed attack and effective shield conversion are attack skills, with one saved bonus and no empty conversion spend',()=>{
  let s=fixture('chi-ling');s=meld(s,'W.concealed.1111');
  assert.equal(s.players[0].statuses.find(st=>st.kind==='mark').passiveBonus,17);
  s=enemy(JSON.parse(JSON.stringify(s)),{damage:0}).state;
  assert.equal(s.players[0].damage,Math.round(357*1.05*1.25*.88));assert.equal(s.players[0].statuses.filter(st=>st.kind==='mark').length,0);
  s=fixture('chi-ling');s=meld(s,'W.added.5555');assert.equal(s.players[0].passiveState.fireMonsterId,null);
  s.players[0].shield=100;s.players[0].shieldTurns=3;s=meld(s,'W.added.5555');
  assert.equal(s.players[0].damage,Math.round(105*1.05*1.25*.88));assert.equal(s.players[0].passiveState.fireMonsterId,s.monster.id);
});
