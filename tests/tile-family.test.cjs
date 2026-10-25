const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const K = require('../cultivation-skills.js');
const C = require('../cultivation-combat.js');
const {game} = require('./game-harness.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const s=C.create(125);Object.assign(s.monster,{hp:20000,maxHp:20000,armor:0,shield:0,element:'earth'});return s;
}
const apply=(s,e)=>C.apply(s,{id:s.seq+1,...e});
const flower=(s,key,pid=0)=>apply(s,{type:'flower',pid,key}).state;
const meld=(s,id)=>{const k=K.get(id);return apply(s,{type:'meld',pid:0,action:k.action,...(k.family==='honor'?{key:k.combo}:{keys:[...k.combo].map(n=>k.family+n)})});};
function enemy(s) {s.enemyDue=s.monster.id;s.discardCount=4;Object.assign(s.monster.nextAttack,{type:'single',damage:100,ailment:null,charged:false,cancelled:false});return apply(s,{type:'enemy'});}

test('every discardable key has its approved base; flowers and invalid keys have no basic',()=>{
  for(const [family,amount] of [['W',55],['T',40],['B',50]])for(let n=1;n<=9;n++) {
    const key=family+n;assert.equal(K.basicDamage(key),amount);
    const s=fixture();s.monster.element=K.elementFor(key);
    assert.equal(apply(s,{type:'discard',pid:0,key}).effects.find(e=>e.source==='basic').amount,amount);
  }
  for(const key of ['FE','FS','FW','FN','DC','DF','DB'])assert.equal(K.basicDamage(key),60);
  for(const key of ['H1','H8','W0','W10','FE1',null,undefined,{}])assert.equal(K.basicDamage(key),null);
  assert.equal(K.basicDamage({key:'T9'}),40);
});
test('all 170 catalogue records preserve mechanics, caps and resource ratios',()=>{
  // Read the authored, unscaled operands; verify every changed leaf against the approved contract.
  const source=fs.readFileSync(require.resolve('../cultivation-skills.js'),'utf8');
  const authored=source.replace('effects: balanceEffects(effects, family, options?.finisher)','effects');assert.notEqual(authored,source);
  const context={};vm.runInNewContext(authored,context);const raw=copy(context.MahjongCultivationSkills.all);
  const recoveryKinds=['hot','shieldBreakHeal','onHitHeal','onHitShield','deathGuard'];
  for(const original of raw) {
    const actual=K.get(original.id),rule=original.finisher?null:K.familyBalance[original.family==='formation'?'flower':original.family];
    function expected(effects) {return effects.map(e=>{
      const result=copy(e);if(!rule)return result;
      const fields=[];
      if(['damage','dot','mark','buff'].includes(e.op))fields.push(['amount',rule.damage]);
      if(e.op==='damage')fields.push(['shieldDamage',rule.damage]);
      if(['heal','shield'].includes(e.op))fields.push(['amount',rule.recovery]);
      if(e.op==='buff') {
        fields.push(['heal',rule.recovery]);
        if(e.kind==='nextFlatDamage'||recoveryKinds.includes(e.kind))fields.push(['value',e.kind==='nextFlatDamage'?rule.damage:rule.recovery]);
      }
      for(const [key,percent]of fields)if(typeof e[key]==='number')result[key]=Math.round(e[key]*percent/100);
      if(e.onKill)result.onKill=expected(e.onKill);return result;
    });}
    assert.deepEqual(copy(actual),{...original,effects:expected(original.effects)},original.id);
  }
});
test('signature amounts include DoT, multihit, recovery, delayed counter and unchanged finisher budgets',()=>{
  assert.deepEqual(K.get('W.chow.123').effects.map(e=>e.amount),[86,35]);
  assert.deepEqual(K.get('B.chow.123').effects.map(e=>e.amount),[37,53]);
  assert.equal(K.get('B.chow.123').effects[0].hits,2);
  assert.equal(K.get('T.chow.234').effects[0].amount,187);
  assert.equal(K.get('T.chow.234').effects[1].scale.cap,105);
  assert.equal(K.get('T.concealed.6666').effects[0].heal,264);
  assert.equal(K.get('W.pong.333').effects[0].amount,161);
  assert.equal(K.get('FW.concealed').effects[1].amount,377);
  assert.equal(K.get('H1.flower').effects[0].amount,115);
  assert.equal(K.get('H2.flower').effects[0].value,52);
  assert.equal(K.get('formation.gentlemen').effects[0].amount,418);
  assert.deepEqual(K.get('formation.seasons').effects.map(e=>e.amount??e.value),[299,265,86]);
  assert.equal(K.get('formation.seven').effects[0].amount,1100);
  assert.equal(K.get('formation.eight').effects.reduce((n,e)=>n+e.amount,0),1500);
});
test('opening attack flowers wait for their owner, survive save, and cannot fire twice',()=>{
  let s=fixture();s=flower(s,'H3',1);s=flower(s,'H8',2);
  assert.equal(s.monster.hp,20000);assert.equal(s.monster.statuses.length,0);
  const saved=copy(s);assert.equal(C.validate(saved),true);
  s=apply(saved,{type:'turn',pid:0}).state;assert.equal(s.monster.hp,20000);
  const r=apply(s,{type:'turn',pid:1});s=r.state;
  assert.equal(s.players[1].damage,50);assert.equal(s.players[2].damage,0);
  assert.equal(s.monster.statuses.find(e=>e.kind==='burn').amount,28);
  assert.deepEqual(apply(s,{type:'turn',pid:1}).effects,[]);
  assert.deepEqual(C.apply(s,{id:s.seq,type:'turn',pid:1}).effects,[]);
  s=apply(s,{type:'turn',pid:2}).state;assert.equal(s.players[2].damage,110);
  assert.equal(s.discardCount,0);assert.equal(s.players[1].weakDiscards,0);
});
test('ordinary flower support remains immediate; burn and counters retain trigger timing',()=>{
  let s=fixture();s.players[0].hp=500;s=flower(s,'H1');assert.equal(s.players[0].hp,615);
  s=flower(s,'H7');s.players[0].aggro=100;
  const reaction=enemy(s);assert.equal(reaction.effects.filter(e=>e.type==='damage').length,1);
  s=flower(fixture(),'H3');s=apply(s,{type:'turn',pid:0}).state;
  assert.equal(enemy(s).effects.find(e=>e.source==='dot').amount,28);
});
test('gentlemen formation queues once and releases after H8, including across a monster kill',()=>{
  let s=fixture();for(const key of ['H5','H6','H7','H8'])s=flower(s,key);
  assert.deepEqual(s.players[0].pendingFlowerSkills,['H8.flower','formation.gentlemen']);
  s.monster.hp=1;const r=apply(s,{type:'turn',pid:0});
  const hits=r.effects.filter(e=>e.type==='damage');assert.equal(hits.length,2);
  assert.notEqual(hits[0].monsterId,hits[1].monsterId);
  assert.deepEqual(flower(r.state,'H8'),apply(r.state,{type:'flower',pid:0,key:'H8'}).state);
  assert.equal(apply(r.state,{type:'turn',pid:0}).effects.length,0);
});
test('old saves keep stored effects; new casts use revised fixed operands without rebalance on load',()=>{
  let s=fixture();s.players[0].statuses=[{kind:'nextFollowup',amount:140,duration:5,charges:1}];
  s.monster.statuses=[{op:'dot',kind:'burn',amount:30,ticks:3,owner:0,element:'fire'}];
  const snapshot=copy(s);assert.equal(C.validate(snapshot),true);assert.deepEqual(snapshot,s);
  const r=meld(snapshot,'W.chow.234');assert.equal(r.effects.find(e=>e.source==='followup').amount,140);
  assert.equal(r.state.monster.statuses.find(e=>e.kind==='burn').amount,30);
  s=meld(fixture(),'W.pong.333').state;assert.equal(s.players[0].statuses[0].amount,161);
  const cast=meld(s,'W.chow.234');assert.equal(cast.effects.find(e=>e.source==='followup').amount,161);
});
test('invalid, duplicate and unowned pending flower records are rejected',()=>{
  for(const pending of [['finish.hu'],['H8.flower'],['H3.flower','H3.flower'],['formation.gentlemen'],null]) {
    const s=flower(fixture(),'H3');s.players[0].pendingFlowerSkills=pending;
    assert.throws(()=>C.validate(s),/pending flower/);
  }
});
test('pending attacks do not tick or heal early, clear on next hand, and old flowers do not replay',()=>{
  let s=flower(fixture(),'H3',1);const r=enemy(s);
  assert.equal(r.effects.some(e=>e.type==='damage'),false);
  s=apply(r.state,{type:'finish',reason:'draw'}).state;
  const next=C.create(22,s);assert.ok(next.players.every(p=>!p.pendingFlowerSkills));
  const old=fixture();old.players[0].flowers=['H8'];
  assert.equal(apply(old,{type:'turn',pid:0}).effects.length,0);
});
test('trial flower victory stops the queued formation, gives no ordinary rewards, and preserves parent',()=>{
  const P=require('../cultivation-progression.js');
  let parent=C.create(4,null,{heroId:'yun-zhiwei',equipment:true,progression:P.fresh(),progressionId:'flower-trial-parent'});
  parent=C.prepare(apply(parent,{type:'finish',reason:'draw'}).state);
  const saved=JSON.stringify(parent),trial={id:'flower-trial',parentJourneyId:'flower-trial-parent',...P.trialSpec(1)};
  let s=C.create(8,parent,{trial,progression:parent.players[0].progression,progressionId:'flower-trial-parent'});
  const gold=s.players.map(p=>p.economy.gold);
  for(const key of ['H5','H6','H7','H8'])s=flower(s,key);
  s.monster.hp=1;s.monster.shield=0;const id=s.monster.id,r=apply(s,{type:'turn',pid:0});
  assert.throws(()=>apply(s,{type:'meld',pid:0,action:'chow',keys:['H8']}),/Unknown cultivation skill/);
  assert.equal(r.state.result.reason,'trial');assert.equal(r.state.monster.id,id);
  assert.equal(r.effects.some(e=>e.skillId==='formation.gentlemen'),false);
  assert.deepEqual(r.state.progression.earned,[0,0,0,0]);assert.deepEqual(r.state.players.map(p=>p.economy.gold),gold);
  assert.equal(JSON.stringify(parent),saved);
});
test('seven and eight flower finishes keep their original finish timing without draining pending attacks',()=>{
  for(const [kind,damage]of [['seven',1100],['eight',1515]]){
    const s=flower(fixture(),'H8');
    const r=apply(s,{type:'finish',pid:0,flowerKind:kind,from:1});
    assert.equal(r.state.result.reason,'hu');assert.equal(r.state.players[0].damage,damage);
    assert.equal(r.effects.some(e=>e.skillId==='H8.flower'),false);
  }
});
test('legal opening releases only the active owner, and restored pending attacks release once',()=>{
  const {run}=game(1,{cultivation:true,heroId:'yun-zhiwei',equipment:true});
  run('startNewHand(true,null,{heroId:"yun-zhiwei",equipment:true});');
  assert.equal(run('S.cultivation.players.every((p,pid)=>pid===0&&S.dealer===0||p.damage===0)'),true);
  assert.equal(run('S.cultivation.players[2].pendingFlowerSkills.includes("H8.flower")'),true);
  run('cancelGameTimers();let savedFlower=gameSaveEnvelope(S);restoreGame(savedFlower,"cultivation");cancelGameTimers();');
  assert.equal(run('S.cultivation.players[2].damage'),0);
  assert.equal(run('S.cultivation.players[2].pendingFlowerSkills.includes("H8.flower")'),true);
  run('S.turn=2;S.waitReact=null;stepNext();cancelGameTimers();let releasedDamage=S.cultivation.players[2].damage;let releasedFlower=gameSaveEnvelope(S);restoreGame(releasedFlower,"cultivation");cancelGameTimers();');
  assert.ok(run('releasedDamage')>0);
  assert.equal(run('S.cultivation.players[2].damage===releasedDamage'),true);
  assert.equal(run('S.cultivation.players[2].pendingFlowerSkills'),undefined);
});
