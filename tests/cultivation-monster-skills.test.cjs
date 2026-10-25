const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../cultivation-combat.js'),M=require('../cultivation-monsters.js'),K=require('../cultivation-monster-skills.js'),S=require('../cultivation-skills.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(skill,hero='yun-zhiwei'){
 const s=C.create(201,null,{heroId:hero}),m=M.get(skill.speciesId);
 Object.assign(s.monster,{speciesId:m.id,tier:m.tier,name:m.name,element:skill.element==='neutral'?'wood':skill.element,hp:m.hp-200,maxHp:m.hp,shield:0,armor:m.armor,attacks:0,heals:0,shields:0,statuses:[]});
 s.players.forEach(p=>{p.heroId='yun-zhiwei';p.aggro=p.pid===0?100:0;});
 s.players[0].heroId=hero;
 // Keep character identity uniqueness while giving the target neutral stats in assertions below.
 const heroes=require('../cultivation-heroes.js').all.filter(h=>h.id!==hero);
 s.players.slice(1).forEach((p,i)=>{p.heroId=heroes[i].id;p.passiveState.counterReady=false;});
 // Swapped heroes keep the neutral 1,000 life these exact-damage assertions are written against.
 s.players.forEach(p=>{p.hp=p.maxHp=1000;});
 if(m.tier==='boss')s.monster.attacks=2*['metal','wood','water','fire','earth'].indexOf(s.monster.element);
 s.monster.nextAttack={type:skill.type,damage:skill.damage,charged:skill.charged,ailment:null,cancelled:false,controlUsed:false,sealAilment:false,skillId:skill.id,monsterId:s.monster.id,actionNumber:s.monster.attacks+1,sealed:false};
 return s;
}
function enemy(s){s=clone(s);s.discardCount=4;s.enemyDue=s.monster.id;return C.apply(s,{id:s.seq+1,type:'enemy',monsterId:s.monster.id});}
function meld(s,id){const sk=S.get(id);return C.apply(s,{id:s.seq+1,type:'meld',pid:0,action:sk.action,...(sk.family==='honor'?{key:sk.combo}:{keys:[...sk.combo].map(n=>sk.family+n)})});}
function withOp(kind,op='control'){return S.all.find(s=>s.effects.some(e=>e.op===op&&e.kind===kind));}
test('65 stable unique skills sharing 35 motion recipes; all 34 species linked',()=>{
 assert.equal(K.all.length,65);assert.equal(new Set(K.all.map(s=>s.id)).size,65);assert.equal(new Set(K.all.map(s=>s.motion)).size,35);
 for(const m of M.all)assert.deepEqual(m.skillIds,K.forSpecies(m.id).map(s=>s.id));
 for(const s of K.all){assert.ok(Object.isFrozen(s));assert.ok(K.describe(s).includes(String(s.damage)));}
});
for(const sk of K.all)test('monster skill '+sk.id+' exact one attack, budget, effects and restore',()=>{
 let s=fixture(sk);s.players[0].shield=sk.strip;s.players[0].shieldTurns=2;
 const r=enemy(s),hurt=r.effects.filter(e=>e.type==='hurt');
 assert.equal(hurt.length,sk.type==='all'?4:1);assert.equal(hurt[0].amount,sk.damage);assert.equal(hurt[0].hits||1,sk.hits);
 assert.equal(r.effects.filter(e=>e.type==='monsterSkill').length,1);
 assert.equal(r.effects.find(e=>e.type==='monsterSkill').skillId,sk.id);
 assert.equal(r.effects.filter(e=>e.type==='enemy').length,1);
 assert.equal(r.state.monster.hp,s.monster.hp+sk.heal);assert.equal(r.state.monster.shield,sk.shield);
 assert.equal(r.state.players[0].shieldAbsorbed,0);
 if(sk.ailment){const a=r.state.players[0].statuses.find(a=>a.kind===sk.ailment.kind);assert.equal(a.value,sk.ailment.value);assert.equal(a.duration,sk.ailment.duration);assert.equal(a.monsterId,s.monster.id);}
 if(sk.riposte)assert.equal(r.state.monster.statuses.find(a=>a.kind==='monsterRiposte').value,30);
 assert.ok(C.validate(clone(r.state)));assert.deepEqual(C.apply(r.state,{id:r.state.seq,type:'enemy'}).state,r.state);
});
test('small, crow, elite, miniboss and rotating BOSS schedules',()=>{
 for(const m of M.all){const list=K.forSpecies(m.id);for(let n=1;n<=16;n++){
 const element=['metal','wood','water','fire','earth'][Math.floor((n-1)/2)%5],got=K.select(m,n,element);
 const expected=m.tier==='boss'?list.find(s=>s.id.endsWith('.'+(n%3===0?'thunder':element))):m.id==='bladefeather-crow'?(n===1?list[0]:null):m.tier==='small'?((n-1)%3===0?list[0]:null):m.tier==='elite'?(n%2?list[((n-1)%4)/2]:null):list[(n-1)%4]||null;
 assert.equal(got,expected,m.id+' '+n);
 }}
});
test('charged interrupt cancels all damage and extras; seal preserves target and caps damage',()=>{
 for(const sk of K.all.filter(s=>s.charged)){
 let s=fixture(sk),interrupt=withOp('interrupt'),seal=withOp('seal');
 s.monster.hp=s.monster.maxHp;let r=meld(s,interrupt.id);r=enemy(r.state);
 assert.equal(r.effects.some(e=>['hurt','enemyHeal','enemyShield','monsterSkill'].includes(e.type)),false,sk.id);
 r=meld(s,seal.id);assert.equal(r.state.monster.nextAttack.damage,Math.min(sk.damage,M.get(sk.speciesId)[sk.type]));
 r=enemy(r.state);assert.equal(r.effects.some(e=>e.type==='monsterSkill'),false);assert.equal(r.effects.filter(e=>e.type==='hurt').length,sk.type==='all'?4:1);
 }
});
test('weak targets excluded and live highest aggro retargets; multi-hit counter only once',()=>{
 let s=fixture(K.get('frostfang-wolf.bite'),'tie-wujiu');s.players[0].passiveState.counterReady=true;
 let r=enemy(s);assert.equal(r.state.players[0].passiveState.counterUses,1);assert.equal(r.effects.filter(e=>e.source==='counter'&&e.pid===0).length,1);
 s.players[2].aggro=999;r=enemy(s);assert.deepEqual(r.effects.find(e=>e.type==='enemy').targets,[2]);
 s.players[2].hp=0;s.players[2].weak=true;r=enemy(s);assert.deepEqual(r.effects.find(e=>e.type==='enemy').targets,[0]);
});
test('seal ailments and immunity block status but not damage; duration expires after own discard',()=>{
 const sk=K.get('moss-flower.pollen');let s=fixture(sk);s.monster.nextAttack.sealAilment=true;
 let r=enemy(s);assert.equal(r.state.players[0].statuses.some(a=>a.monsterSkill),false);assert.ok(r.effects.some(e=>e.type==='hurt'));
 s=fixture(sk);s.players[0].statuses.push({kind:'immuneAilment',duration:2,charges:1});r=enemy(s);assert.equal(r.state.players[0].statuses.some(a=>a.monsterSkill),false);
 r=enemy(fixture(sk));const discarded=C.apply(r.state,{id:r.state.seq+1,type:'discard',pid:0,key:'W1'});assert.equal(discarded.state.players[0].statuses.some(a=>a.monsterSkill),false);assert.ok(discarded.state.players[1].statuses.some(a=>a.monsterSkill));
});
test('healing and shield grants capped at two per encounter',()=>{
 for(const sk of K.all.filter(s=>s.heal||s.shield)){const s=fixture(sk);s.monster.heals=2;s.monster.shields=2;const r=enemy(s);assert.equal(r.effects.some(e=>['enemyHeal','enemyShield'].includes(e.type)),false,sk.id);}
});
test('riposte once after entire direct skill; basic/DoT do not consume; kill prevents; dispel removes',()=>{
 const sk=K.get('crimson-sword-demon.riposte');let s=enemy(fixture(sk,'tie-wujiu')).state;
 let r=C.apply(s,{id:s.seq+1,type:'discard',pid:0,key:'W1'});assert.ok(r.state.monster.statuses.some(a=>a.kind==='monsterRiposte'));s=r.state;
 r=meld(s,'B.chow.123');assert.equal(r.effects.filter(e=>e.type==='monsterSkill'&&e.reaction).length,1);assert.equal(r.effects.filter(e=>e.type==='hurt').length,1);assert.equal(r.effects.some(e=>e.source==='counter'),false);
 assert.equal(r.state.monster.statuses.some(a=>a.kind==='monsterRiposte'),false);
 s.monster.hp=1;r=meld(s,'B.chow.123');assert.equal(r.effects.some(e=>e.reaction),false);
 s=enemy(fixture(sk)).state;const dispel=withOp('defense','removeBuff');r=meld(s,dispel.id);assert.equal(r.effects.some(e=>e.reaction),false);
});
test('old ongoing save stays old; next hand upgrades independently, preserves identities/economy',()=>{
 let s=C.create(3,null,{heroId:'yun-zhiwei',equipment:true,monsterSkillVersion:0});delete s.monsterSkillVersion;
 assert.ok(C.validate(s));assert.deepEqual(C.create(9,clone(s)),s);
 s=C.apply(s,{id:1,type:'finish',reason:'draw'}).state;s=C.prepare(s);const identities=s.players.map(p=>[p.pid,p.heroId,p.economy.gold]);s=C.create(9,s);
 assert.equal(s.monsterSkillVersion,1);assert.deepEqual(s.players.map(p=>[p.pid,p.heroId,p.economy.gold]),identities);assert.ok(C.validate(s));
});
test('monster status cleanses without touching seals; killing source removes penalties even on final hu',()=>{
 let s=enemy(fixture(K.get('moss-flower.pollen'))).state;
 const clean=S.all.find(x=>x.effects.some(e=>e.op==='cleanse'&&!e.onlyDot));
 const r=meld(s,clean.id);assert.equal(r.state.players[0].statuses.some(a=>a.monsterSkill),false);
 s.monster.hp=1;s.monster.shield=0;const end=C.apply(s,{id:s.seq+1,type:'finish',pid:0,fan:1});
 assert.equal(end.state.players.some(p=>p.statuses.some(a=>a.monsterSkill)),false);
});
test('same kind refreshes strongest only and source removal does not carry status into a new monster',()=>{
 let s=fixture(K.get('whetgold-rat.gnaw'));s.players[0].statuses.push({kind:'fragile',value:.12,duration:2,negative:true,monsterSkill:true,monsterId:s.monster.id});
 const r=enemy(s);const rows=r.state.players[0].statuses.filter(a=>a.kind==='fragile');assert.equal(rows.length,1);assert.equal(rows[0].value,.12);assert.equal(rows[0].duration,2);
 s=r.state;s.monster.hp=1;const killed=C.apply(s,{id:s.seq+1,type:'discard',pid:0,key:'W1'});assert.equal(killed.state.players.some(p=>p.statuses.some(a=>a.monsterSkill)),false);
});
test('shield blocks all damage but does not block ailment, guard protects after full absorption',()=>{
 let s=fixture(K.get('embertail-fox.brand'));s.players[0].shield=500;s.players[0].shieldTurns=2;
 let r=enemy(s);assert.equal(r.effects.find(e=>e.type==='hurt').amount,0);assert.ok(r.state.players[0].statuses.some(a=>a.kind==='burn'));
 s.players[0].statuses.push({kind:'statusGuard',duration:2,charges:1});r=enemy(s);assert.equal(r.state.players[0].statuses.some(a=>a.kind==='burn'),false);
});
test('riposte expires at next action, finisher counts once, guard survives and counters never chain',()=>{
 let s=enemy(fixture(K.get('crimson-sword-demon.riposte'),'tie-wujiu')).state;
 let r=enemy(s);assert.equal(r.state.monster.statuses.some(a=>a.kind==='monsterRiposte'),false);
 s.players[0].hp=1;s.players[0].statuses.push({kind:'deathGuard',duration:2,value:1,charges:1,amount:70});
 r=C.apply(s,{id:s.seq+1,type:'finish',pid:0,fan:1});assert.equal(r.effects.filter(e=>e.type==='monsterSkill'&&e.reaction).length,1);assert.equal(r.state.players[0].hp,1);assert.equal(r.effects.some(e=>e.source==='counter'),false);
});
test('fourth discard + meld, interrupted readback, duplicate and wrong-encounter events do not replay',()=>{
 let s=fixture(K.get('stoneback-boar.charge'));
 for(let pid=0;pid<4;pid++)s=C.apply(s,{id:s.seq+1,type:'discard',pid,key:'W1'}).state;
 assert.equal(s.discardCount,4);assert.equal(s.enemyDue,s.monster.id);
 s=meld(s,withOp('interrupt').id).state;assert.equal(s.monster.nextAttack.cancelled,true);
 let r=C.apply(clone(s),{id:s.seq+1,type:'enemy',monsterId:s.monster.id});assert.equal(r.effects.some(e=>e.type==='hurt'),false);
 assert.equal(C.apply(r.state,{id:r.state.seq,type:'enemy'}).effects.length,0);
 assert.equal(C.apply(r.state,{id:r.state.seq+1,type:'enemy',monsterId:r.state.monster.id+1}).effects.length,0);
});
test('all weak decided after whole all-target attack and death guard, and taunt penalty does not break guarantee',()=>{
 let s=fixture(K.get('moss-flower.pollen'));s.players.forEach(p=>p.hp=1);let r=enemy(s);assert.equal(r.state.result.reason,'defeat');
 s.players[0].statuses.push({kind:'deathGuard',duration:2,value:1,charges:1});r=enemy(s);assert.equal(r.state.ended,false);assert.equal(r.state.players[0].hp,1);
 s=enemy(fixture(K.get('golden-tiger.roar'))).state;s.players[1].aggro=999;
 const taunt=S.all.find(x=>x.effects.some(e=>e.op==='aggro'&&e.mode==='top'));r=meld(s,taunt.id);assert.ok(r.state.players[0].aggro>999);
});
test('public preview estimates cleanse and interrupt without mutating RNG or state',()=>{
 const s=enemy(fixture(K.get('moss-flower.pollen'))).state,prior=clone(s);
 const clean={id:'test-cleanse',element:'wood',effects:[{op:'cleanse',count:'all'}]};
 assert.ok(C.estimate(s,0,clean)>0);assert.deepEqual(s,prior);
 const charged=fixture(K.get('stoneback-boar.charge'));assert.ok(C.estimate(charged,0,withOp('interrupt'))>0);
});
