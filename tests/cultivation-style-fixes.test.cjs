const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../cultivation-combat.js'),Skills=require('../cultivation-skills.js');
function fixture(){
  const s=C.create(123);s.monster.hp=s.monster.maxHp=10000;s.monster.armor=.4;s.monster.shield=0;
  s.players[1].aggro=1000;
  s.monster.nextAttack={type:'single',charged:false,damage:160,ailment:null,cancelled:false,controlUsed:false,sealAilment:false};
  return s;
}
test('AI recognizes delayed attack boosts, followups and next-skill threat savings',()=>{
  for(const id of ['W.chow.345','W.pong.333','B.pong.999','T.concealed.4444']){
    const s=fixture(),before=JSON.stringify(s);
    assert.ok(C.estimate(s,0,Skills.get(id))>0,id);
    assert.equal(JSON.stringify(s),before,id);
    assert.equal(C.estimate(s,0,Skills.get(id)),C.estimate(s,0,Skills.get(id)),id);
  }
});
test('AI values next lifesteal only when actual future recovery is possible',()=>{
  const s=fixture(),skill=Skills.get('T.chow.345');
  assert.equal(C.estimate(s,0,skill),0);
  s.players[0].hp=300;
  assert.ok(C.estimate(s,0,skill)>0);
});
test('an identical fresh next-attack buff does not manufacture another benefit',()=>{
  const s=C.apply(fixture(),{id:1,type:'meld',pid:0,action:'chow',keys:['W3','W4','W5']}).state;
  assert.equal(C.estimate(s,0,Skills.get('W.chow.345')),0);
});
test('hybrid heal attacks retain their separate recovery rules after small damage tuning',()=>{
  for(const [action,keys,damage,hp] of [
    ['chow',['W4','W5','W6'],115,595],
    ['chow',['B4','B5','B6'],105,625],
    ['pong',['DC','DC','DC'],198,629]
  ]){
    const s=fixture();s.monster.element='earth';s.monster.armor=0;s.players[0].hp=500;
    const r=C.apply(s,{id:1,type:'meld',pid:0,action,keys});
    assert.equal(r.state.players[0].damage,damage);
    assert.equal(r.state.players[0].hp,hp);
    assert.equal(r.state.players[0].aggro,damage,'recovery adds no extra threat');
  }
});
test('tuned lifesteal is still limited to actual HP lost, not overkill or shields',()=>{
  const s=fixture();s.monster.element='earth';s.monster.armor=0;s.monster.hp=10;s.players[0].hp=500;
  const r=C.apply(s,{id:1,type:'meld',pid:0,action:'pong',key:'DC'});
  assert.equal(r.state.players[0].damage,198);
  assert.equal(r.state.players[0].hp,507);
  assert.equal(r.state.kills.length,1);
  s.monster.shield=500;
  assert.equal(C.apply(s,{id:1,type:'meld',pid:0,action:'pong',key:'DC'}).state.players[0].hp,500);
});
test('style policies preserve shanten priority and cannot inspect other hands or the wall',()=>{
  const {game}=require('./game-harness.cjs');
  const {installStylePolicy}=require('./cultivation-style-policy.cjs');
  for(let rotation=0;rotation<4;rotation++){
    const {run}=game(39101,{cultivation:true});
    run(`const baselineTile=aiChooseDiscard(0);
      const baselineShanten=calcShanten(S.players[0].hand.filter(t=>t!==baselineTile),S.players[0].melds);
      for(let pid=1;pid<4;pid++)Object.defineProperty(S.players[pid],'hand',{get(){throw Error('hidden hand access')}});
      Object.defineProperty(S,'wall',{get(){throw Error('hidden wall access')}});`);
    run(`(${installStylePolicy.toString()})(${rotation})`);
    assert.equal(run(`(()=>{const tile=aiChooseDiscard(0);return calcShanten(S.players[0].hand.filter(t=>t!==tile),S.players[0].melds)===baselineShanten})()`),true);
    assert.ok(run(`Number.isFinite(cultivationSkillValue(0,'pong','B9'))`));
  }
});
