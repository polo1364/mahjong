const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../cultivation-finishers.js');
const C = require('../cultivation-combat.js');
const { game } = require('./game-harness.cjs');
const copy = x => JSON.parse(JSON.stringify(x));
const send = (s, event) => C.apply(s, { id: s.seq + 1, ...event });
function fixture() {
  const s = C.create(123); s.monster.hp = s.monster.maxHp = 100000;
  s.monster.armor = 0; s.monster.shield = 0; s.monster.statuses = []; s.monster.element = 'earth';
  return s;
}
function item(row) {
  const i = { id: row.id, fan: 2 };
  if (['suit', 'mixed'].includes(row.source)) i.suit = 'W';
  if (row.source === 'keys') i.keys = row.id === 'flower' ? ['H1','H5'] : row.id === 'dragons' ? ['DC','DF'] : ['FE'];
  if (row.source === 'streak') { i.streak = 2; i.fan = 5; }
  return i;
}
const finish = (s, items, extra = {}) => send(s, { type: 'finish', pid: 0, from: 1, method: 'discard', fan: items.reduce((n, i) => n + i.fan, 0), items, reason: 'hu', ...extra });

test('taunt multiplies the entire newly gained threat, not only its margin', () => {
  const s=fixture(); s.players[0].aggro=100;s.players[1].aggro=1000;
  s.players[0].activeSeals=F.curses([{id:'big-winds'}]);
  const skills=require('../cultivation-skills.js');
  const skill=skills.all.find(s=>s.effects[0]?.op==='aggro'&&s.effects[0].mode==='top');
  const r=send(s,{type:'meld',pid:0,action:'pong',key:'W7'});
  assert.equal(r.state.players[0].aggro,100+(1000+skill.effects[0].value-100)*1.3);
});

test('catalog fixed hit counts, penetration and independent source element expectations', () => {
  const expected={
    base:[1,0], 'all-chows':[3,0], 'all-pungs':[5,.15],closed:[1,.2], 'self-draw':[1,.15],
    'closed-self-draw':[1,.3],'single-wait':[1,.5],'concealed-3':[3,.2],'concealed-4':[4,.3],'concealed-5':[5,.4],
    'half-flush':[2,0],'pure-flush':[3,.25],'all-honors':[7,0],dragons:[1,0],
    'small-dragons':[3,.2],'big-dragons':[3,.4],'small-winds':[4,.2],'big-winds':[4,.5],
    'seat-wind':[1,.15],'round-wind':[1,.15],'full-beg':[1,0],'half-beg':[1,0],
    'rob-kong':[1,0],rinshan:[1,.4],haitei:[1,0],'last-discard':[1,0],heaven:[1,1],earth:[1,.8],human:[1,.6],
    'heaven-ready':[4,.3],'earth-ready':[2,.2],flower:[1,0],seasons:[4,0],gentlemen:[4,0],dealer:[1,0],streak:[1,0],seven:[1,1],eight:[5,0]
  };
  assert.deepEqual(Object.keys(expected).sort(),F.all.map(r=>r.id).sort());
  for(const [id,value] of Object.entries(expected)) assert.deepEqual([F.get(id).hits,F.get(id).penetration],value,id);
  const s=fixture();
  const cases=[['dragons',{keys:['DC','DF']},['fire','wood']],['flower',{keys:['H1','H5']},['wood','wood']],
    ['half-flush',{suit:'T'},['water','neutral']],['pure-flush',{suit:'B'},['metal','metal','metal']],
    ['all-honors',{},['wood','fire','metal','water','fire','wood','earth']],['seasons',{},['wood','water','fire','water']],
    ['gentlemen',{},['wood','wood','wood','metal']]];
  for(const [id,source,elements] of cases) {
    const skill=F.build([{id,fan:2,...source}],2,'discard',s.players[0],s.monster,true);
    assert.deepEqual(skill.effects[1].effects.map(e=>e.element),elements,id);
    assert.equal(skill.effects[1].effects.reduce((n,e)=>n+e.amount,0),120);
  }
});

test('conditional bonuses use the specified thresholds and rob-kong removes defense first', () => {
  const s=fixture(), p=s.players[0];
  const amount=(id,method='discard',top=false)=>F.build([{id,fan:2}],2,method,p,s.monster,top).effects[1].effects.filter(e=>e.op==='damage').reduce((n,e)=>n+e.amount,0);
  assert.equal(amount('all-chows'),124);
  assert.equal(amount('full-beg'),144);assert.equal(amount('full-beg','discard',true),120);
  assert.equal(amount('dealer','discard',true),132);assert.equal(amount('dealer'),120);
  p.hp=500; assert.equal(amount('half-beg','selfDraw'),132);
  s.monster.hp=35000;assert.equal(amount('haitei','selfDraw'),120);
  s.monster.hp=34999;assert.equal(amount('haitei','selfDraw'),144);assert.equal(amount('last-discard'),138);
  const rob=F.build([{id:'rob-kong',fan:1}],1,'robKong',p,s.monster,false);
  assert.deepEqual(rob.effects[1].effects[0],{op:'removeBuff',kind:'defense',count:1});
  const result=finish(s,[{id:'rob-kong',fan:1}],{from:3,method:'robKong'}).state;
  assert.equal(result.finisher.from,3);assert.deepEqual(result.players[3].pendingSeals,F.curses([{id:'rob-kong'}]));
});

for (const row of F.all.filter(r => r.id !== 'base' && !r.special)) test(`finisher ${row.id}: effect, sources, score, seal`, () => {
  const i = item(row), s = fixture();
  const r = finish(s, [i], row.selfOnly ? { from: -1, method: 'selfDraw' } : {});
  assert.equal(r.effects.filter(e => e.type === 'skill').length, 1);
  const segment = r.state.finisher.parts.find(p => p.id === row.id);
  assert.equal(segment.name, row.name); assert.ok(segment.damage > 0);
  assert.equal(r.state.finisher.total, r.state.players[0].damage);
  assert.deepEqual(r.state.players[1].pendingSeals, row.selfOnly ? [] : F.curses([i]));
  assert.equal(r.state.players[1].damage, 0);
});

test('budget, fixed order, five-way hits, capped high-fan and empty hand', () => {
  const s = fixture(), items = [{id:'pure-flush',fan:8,suit:'W'},{id:'all-pungs',fan:4}];
  const skill = F.build(items,12,'discard',s.players[0],s.monster,true);
  assert.deepEqual(skill.effects.map(p=>p.id), ['base','all-pungs','pure-flush']);
  assert.equal(skill.effects.reduce((n,p)=>n+p.budget,0),960);
  const high=F.build([{id:'heaven',fan:24},{id:'all-honors',fan:16}],40,'selfDraw',s.players[0],s.monster,true);
  assert.equal(high.effects.reduce((n,p)=>n+p.budget,0),1500);
  const zero=finish(s,[]); assert.equal(zero.state.finisher.total,240);
  assert.deepEqual(zero.state.players[1].pendingSeals,F.curses([]));
});

test('one next bonus / flat amount / follow-up for the entire overkill combo', () => {
  const s=fixture(); s.monster.hp=1;
  s.players[0].statuses.push({kind:'nextDamage',value:.65,duration:5,charges:1},{kind:'nextFlatDamage',value:100,duration:5,charges:1},{kind:'nextFollowup',amount:90,duration:5,charges:1});
  const r=finish(s,[{id:'all-pungs',fan:4},{id:'closed',fan:1}]);
  assert.equal(r.state.kills.length,1);assert.equal(r.state.monster.id,1);
  assert.equal(r.effects.filter(e=>e.type==='damage'&&e.segmentId==='followup').length,1);
  assert.equal(r.state.players[0].statuses.some(p=>p.kind.startsWith('next')),false);
  assert.equal(r.state.finisher.total,r.state.players[0].damage);
  assert.equal(r.state.kills[0].pid,0);
  assert.deepEqual(send(r.state,{id:r.state.seq,type:'finish',pid:0}).effects,[]);
});

test('seals persist through restart, cannot cleanse, include last finisher, then expire', () => {
  const ended=finish(fixture(),[{id:'all-pungs',fan:4},{id:'closed',fan:1},{id:'concealed-5',fan:8}]).state;
  assert.equal(ended.players[1].pendingSeals.filter(s=>s.kind==='skill').length,1);
  assert.equal(ended.players[1].pendingSeals.find(s=>s.kind==='skill').value,.2);
  let next=C.create(44,copy(ended)); assert.equal(next.handNumber,2); assert.equal(next.players[1].activeSeals.length,2);
  next=send(next,{type:'meld',pid:1,action:'concealed',key:'W8'}).state;
  assert.equal(next.players[1].activeSeals.length,2);
  next=C.create(45,next);assert.equal(next.handNumber,2);assert.equal(next.players[1].activeSeals.length,2);
  const plain=copy(next);plain.players[1].activeSeals=[];
  const event={type:'finish',pid:1,from:2,method:'discard',fan:0,items:[],reason:'hu'};
  const bad=send(next,event).state, good=send(plain,event).state;
  assert.ok(bad.finisher.total<good.finisher.total);
  assert.equal(bad.players[1].activeSeals.length,0);assert.equal(bad.players[1].expiredSeals.length,2);
  const third=C.create(46,bad);assert.equal(third.handNumber,3);assert.equal(third.players[1].activeSeals.length,0);assert.equal(third.players[2].activeSeals.length,1);
});

test('seals cap damage and affect healing, shield, threat, incoming damage, but not natural revival', () => {
  const s=fixture(),p=s.players[0];
  p.activeSeals=F.curses([{id:'concealed-5'},{id:'all-honors'},{id:'pure-flush',suit:'W'},{id:'big-dragons'},{id:'rob-kong'},{id:'big-winds'},{id:'all-pungs'}]);
  assert.equal(F.factor(p,'damage',{finisher:true,element:'fire'}),.65);
  assert.equal(F.factor(p,'aggro'),1.3);assert.equal(F.factor(p,'taken'),1.1);
  p.hp=100;
  const heal=send(s,{type:'meld',pid:0,action:'pong',key:'FE'});assert.equal(heal.state.players[0].hp,284);
  const shield=send(s,{type:'meld',pid:0,action:'pong',key:'DB'});assert.equal(shield.state.players[0].shield,224);
  p.hp=0;p.weak=true;p.weakDiscards=1;
  const revived=send(s,{type:'discard',pid:0,key:'W1'}).state;assert.equal(revived.players[0].hp,300);
});

test('seven holder alone gets a seal, eight and self-draw affect no opponent', () => {
  const seven=finish(fixture(),[],{flowerKind:'seven',fan:8}).state;
  assert.deepEqual(seven.players[1].pendingSeals,F.curses([{id:'seven'}]));assert.equal(seven.finisher.parts.length,1);
  const eight=finish(fixture(),[],{flowerKind:'eight',fan:8,from:-1,method:'selfDraw'}).state;
  assert.ok(eight.players.every(p=>!p.pendingSeals.length)); assert.equal(eight.finisher.parts.length,1);
});

test('draw and full weakness end active curses without manufacturing pending ones', () => {
  let s=fixture();s.players[0].activeSeals=F.curses([{id:'all-pungs'}]);
  const draw=send(s,{type:'finish',reason:'draw'}).state;assert.equal(draw.players[0].activeSeals.length,0);
  s.players.forEach(p=>{p.hp=1;p.aggro=0});s.monster.nextAttack={type:'all',charged:false,damage:80,ailment:null,cancelled:false,controlUsed:false,sealAilment:false};s.enemyDue=1;s.discardCount=4;
  const defeat=send(s,{type:'enemy'}).state;assert.equal(defeat.result.reason,'defeat');assert.ok(defeat.players.every(p=>!p.activeSeals.length&&!p.pendingSeals.length));
});

test('old saves have no seals; malformed seal data and incompatible scoring are rejected', () => {
  const s=fixture();delete s.handNumber;
  s.players.forEach(p=>{delete p.characterId;delete p.activeSeals;delete p.pendingSeals});
  assert.equal(C.validate(s),true);assert.equal(C.create(1,s).players[0].activeSeals.length,0);
  s.players[0].activeSeals=[{sourceId:'closed',name:'閉脈',kind:'skill',value:99}];assert.throws(()=>C.validate(s));
  assert.throws(()=>finish(fixture(),[{id:'all-chows',fan:2}],{from:-1,method:'selfDraw'}));
  assert.throws(()=>finish(fixture(),[{id:'closed-self-draw',fan:3},{id:'self-draw',fan:1}],{from:-1,method:'selfDraw'}));
});

test('scoring emits real source keys, one compatible shape and leaves normal detail format alone', () => {
  const {run}=game(12,{cultivation:true});
  run("fixture(); S.players[1].hand=tiles('W1 W1 W1 W2 W2 W2 W3 W3 W3 W4 W4 W4 W5 W5 W5 W6'); S.fromPlayer=0;");
  const detail=JSON.parse(run("JSON.stringify(calcFanDetails(1,tiles('W6')[0],false))"));
  assert.equal(detail.items.reduce((n,i)=>n+i.fan,0),detail.fan);
  assert.equal(detail.items.find(i=>i.id==='pure-flush').suit,'W');assert.ok(detail.items.some(i=>i.id==='all-pungs'));
  run('delete S.cultivation');assert.equal(run("'items' in calcFanDetails(1,tiles('W6')[0],false)"),false);
});

test('session continuation and settings restart preserve actor names and curses; explicit fresh clears', () => {
  const {run}=game(13,{cultivation:true});
  run("S.cultivation.players[1].activeSeals=window.MahjongCultivationFinishers.curses([{id:'closed'}]);const originalNames=S.names.join();startNewSession('cultivation');");
  assert.equal(run('S.names.join()===originalNames'),true);assert.equal(run('S.cultivation.players[1].activeSeals.length'),1);
  run("startNewSession('cultivation',{freshJourney:true})");assert.equal(run('S.cultivation.players[1].activeSeals.length'),0);
});

test('real scoring retains both dragon and both correct-flower source tiles', () => {
  const {run}=game(19,{cultivation:true});
  run("fixture();S.players[1].hand=tiles('DC DC DC DF DF DF W1 W2 W3 T1 T2 T3 B1 B2 B3 W5');const f=['東','南','西','北'].indexOf(currentSeatWind(1));S.players[1].flowers=tiles('H'+(f+1)+' H'+(f+5));");
  const detail=JSON.parse(run("JSON.stringify(calcFanDetails(1,tiles('W5')[0],false))"));
  const dragons=detail.items.find(i=>i.id==='dragons'),flowers=detail.items.find(i=>i.id==='flower');
  assert.deepEqual(dragons.keys,['DC','DF']);assert.equal(dragons.fan,2);
  assert.equal(flowers.keys.length,2);assert.equal(flowers.fan,2);
  assert.equal(detail.fan,detail.items.reduce((n,i)=>n+i.fan,0));
  F.validateItems(detail.items,detail.fan,'discard');
});
