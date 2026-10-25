const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../cultivation-combat.js'),Skills=require('../cultivation-skills.js'),F=require('../cultivation-finishers.js');
function fixture(){const s=C.create(123);s.monster.hp=s.monster.maxHp=10000;s.monster.element='earth';s.monster.armor=0;s.monster.shield=0;return s;}
function cast(s,id){const skill=Skills.get(id);s.monster.element=skill.element;return C.apply(s,{id:s.seq+1,type:'meld',pid:0,action:skill.action,...(skill.family==='honor'?{key:skill.combo}:{keys:[...skill.combo].map(n=>skill.family+n)})});}
function enemy(s,damage=80){s.enemyDue=s.monster.id;s.discardCount=4;s.monster.nextAttack={type:'single',charged:false,damage,ailment:null,cancelled:false,controlUsed:false,sealAilment:false};return C.apply(s,{id:s.seq+1,type:'enemy',monsterId:s.monster.id});}
test('healing retaliation uses effective recovery, not overflow; original recovery remains',()=>{
  for(const [id,hp,gain,damage] of [['T.chow.234',500,187,105],['T.pong.222',500,254,191],['FE.pong',500,230,173]]){
    const s=fixture();s.players[0].hp=hp;const r=cast(s,id);
    assert.equal(r.state.players[0].hp,hp+gain,id);
    assert.equal(r.state.players[0].damage,damage,id);
    assert.equal(r.state.players[0].aggro,damage,id);
    const full=cast(fixture(),id);assert.equal(full.state.players[0].damage,0,id);
  }
});
test('empty heals preserve next-attack buffs and cannot trigger followups',()=>{
  const s=fixture();s.players[0].statuses.push({kind:'nextDamage',value:.65,duration:5,charges:1},{kind:'nextFollowup',amount:140,duration:5,charges:1});
  const r=cast(s,'T.chow.234');assert.equal(r.state.players[0].damage,0);assert.equal(r.state.players[0].shield,187);
  assert.equal(r.state.players[0].statuses.filter(s=>s.kind.startsWith('next')).length,2);
  assert.equal(r.effects.some(e=>e.type==='damage'),false);
});
test('partial heals, healing seals and damage seals apply once with bounded healing retaliation',()=>{
  const s=fixture();s.players[0].hp=990;
  assert.equal(cast(s,'T.chow.234').state.players[0].damage,6);
  s.players[0].hp=0;s.players[0].weak=true;
  const revived=cast(s,'T.pong.222').state;assert.equal(revived.players[0].hp,340);assert.equal(revived.players[0].damage,200);assert.equal(revived.players[0].weak,false);
  s.players[0].hp=500;s.players[0].weak=false;s.players[0].activeSeals=F.curses([{id:'big-dragons'},{id:'closed'}]);
  const sealed=cast(s,'T.chow.234').state;assert.equal(sealed.players[0].hp,650);assert.equal(sealed.players[0].damage,81);
});
test('defensive retaliation scales actual absorption and is capped at two hits',()=>{
  let s=cast(fixture(),'DB.pong').state;
  assert.equal(s.players[0].shield,280);assert.equal(s.players[0].damage,0);
  let r=enemy(s,20);s=r.state;assert.equal(s.players[0].damage,18);
  r=enemy(s,160);s=r.state;assert.equal(s.players[0].damage,126);
  r=enemy(s,20);assert.equal(r.state.players[0].damage,126);
  assert.equal(r.state.players[0].hp,1000);assert.equal(r.state.players[0].shield,80);
});
test('small defense has its own ratio and cap, with no free damage on expiry or refresh',()=>{
  let s=cast(fixture(),'T.pong.555').state;assert.equal(s.players[0].shield,176);
  s=enemy(s,120).state;assert.equal(s.players[0].damage,84);
  s=enemy(s,40).state;assert.equal(s.players[0].damage,115);
  let unused=cast(fixture(),'DB.pong').state;
  unused=cast(unused,'DB.pong').state;
  assert.equal(unused.players[0].statuses.filter(s=>s.kind==='shieldCounter').length,1);
  for(let i=0;i<3;i++)unused=C.apply(unused,{id:unused.seq+1,type:'discard',pid:0,key:'W1'}).state;
  assert.equal(unused.players[0].damage,165);assert.equal(unused.players[0].shield,0);
});
test('defensive retaliation ignores DoT and cannot consume next-skill buffs or chain followups',()=>{
  let s=cast(fixture(),'DB.pong').state;
  s.players[0].statuses.push({kind:'burn',negative:true,value:35,duration:2},{kind:'nextDamage',value:.65,duration:5,charges:1},{kind:'nextFollowup',amount:140,duration:5,charges:1});
  s=C.apply(s,{id:s.seq+1,type:'discard',pid:0,key:'W1'}).state;
  assert.equal(s.players[0].damage,55);assert.equal(s.players[0].shield,245);
  const r=enemy(s,80);assert.equal(r.state.players[0].damage,127);
  assert.equal(r.effects.filter(e=>e.type==='damage').length,1);
  assert.equal(r.state.players[0].statuses.filter(s=>s.kind.startsWith('next')).length,2);
});
test('defensive retaliation survives save/restore, deduplicates, and credits its owner',()=>{
  const s=JSON.parse(JSON.stringify(cast(fixture(),'DB.pong').state));assert.equal(C.validate(s),true);
  const r=enemy(s,80);assert.equal(r.state.players[0].damage,72);assert.equal(r.state.players[0].aggro,72);
  const replay=C.apply(r.state,{id:r.state.seq,type:'enemy',monsterId:s.monster.id});assert.deepEqual(replay.effects,[]);
  assert.equal(replay.state.players[0].damage,72);
});
