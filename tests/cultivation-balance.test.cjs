const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cultivation-combat.js');
const F = require('../cultivation-finishers.js');
const copy = value => JSON.parse(JSON.stringify(value));

test('retuned ordinary budget preserves fan value, high cap and flower finishers', () => {
  const s = C.create(123);
  for (const [fan, budget] of [[0,240],[1,300],[4,480],[12,960],[21,1500],[40,1500]]) {
    const items = fan ? [{id:'all-pungs',fan}] : [];
    const skill = F.build(items,fan,'discard',s.players[0],s.monster,false);
    assert.equal(skill.budget,budget);
    assert.equal(skill.effects.reduce((n,p)=>n+p.budget,0),budget);
  }
  const skills = require('../cultivation-skills.js');
  assert.equal(skills.get('formation.seven').effects.find(e=>e.op==='damage').amount,1100);
  assert.equal(skills.get('formation.eight').effects.filter(e=>e.op==='damage').reduce((n,e)=>n+e.amount*(e.hits||1),0),1500);
});

const cases = [
  {name:'zero',items:[]},
  {name:'pure pungs',items:[{id:'all-pungs',fan:4},{id:'pure-flush',fan:8,suit:'W'}]},
  {name:'closed self draw',items:[{id:'closed-self-draw',fan:3}],method:'selfDraw',from:-1},
  {name:'two dragons and flowers',items:[{id:'dragons',fan:2,keys:['DC','DF']},{id:'flower',fan:2,keys:['H1','H5']}]},
  {name:'rob kong',items:[{id:'rob-kong',fan:1}],method:'robKong'},
  {name:'high fan',items:[{id:'heaven',fan:24},{id:'all-honors',fan:16}],method:'selfDraw',from:-1},
  {name:'seven',items:[],flowerKind:'seven'},
  {name:'eight',items:[],flowerKind:'eight',method:'selfDraw',from:-1}
];
for (const example of cases) test(`balance matrix: ${example.name}, five elements and four combat states`, () => {
  for (const element of ['metal','wood','water','fire','earth']) for (const mode of ['normal','weak','boosted','overkill']) {
    const before = C.create(123), p = before.players[0];
    before.monster.element=element;before.monster.hp=before.monster.maxHp=100000;
    before.monster.armor=.4;before.monster.shield=100;before.monster.statuses=[];
    if(mode==='weak'){p.hp=0;p.weak=true;}
    if(mode==='overkill')before.monster.hp=1;
    if(mode==='boosted')p.statuses.push(
      {kind:'nextDamage',value:.65,duration:5,charges:1},
      {kind:'nextFlatDamage',value:100,duration:5,charges:1},
      {kind:'nextFollowup',amount:90,duration:5,charges:1});
    const event={id:1,type:'finish',pid:0,from:1,method:'discard',reason:'hu',fan:example.items.reduce((n,i)=>n+i.fan,0),...example};
    delete event.name;
    const plain=C.apply(before,event);
    const sealed=copy(before);
    sealed.players[0].activeSeals=F.curses([{id:'concealed-5'},{id:'all-honors'},{id:'pure-flush',suit:'W'}]);
    const penalized=C.apply(sealed,event);
    const context=`${element} ${mode}`;
    const hits=plain.effects.filter(e=>e.type==='damage').length;
    assert.ok(penalized.state.finisher.total<=plain.state.finisher.total,context);
    // Per-hit integer rounding may differ by one point in either direction.
    assert.ok(penalized.state.finisher.total>=plain.state.finisher.total*.65-hits,context);
    for (const {state,effects} of [plain,penalized]) {
      assert.equal(C.validate(state),true,context);
      assert.equal(state.finisher.total,state.finisher.parts.reduce((n,p)=>n+p.damage,0),context);
      assert.equal(state.finisher.total,effects.filter(e=>e.type==='damage'&&e.pid===0).reduce((n,e)=>n+e.amount,0),context);
      assert.equal(effects.filter(e=>e.type==='skill').length,1,context);
      assert.equal(state.monster.id,before.monster.id,context);
      assert.ok(state.kills.length<=1,context);
      assert.equal(state.players[0].activeSeals.length,0,context);
      assert.deepEqual(C.apply(state,event).state,state,context);
      if(mode==='boosted')assert.equal(effects.filter(e=>e.type==='damage'&&e.segmentId==='followup').length,1,context);
    }
    assert.equal(penalized.state.players[0].expiredSeals.length,3,context);
    assert.equal(before.players[0].damage,0,context);
  }
});
