const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../cultivation-progression.js');
const C=require('../cultivation-combat.js');
const E=require('../cultivation-equipment.js');
const M=require('../cultivation-monsters.js');
const H=require('../cultivation-heroes.js');
const F=require('../cultivation-finishers.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const create=(profile=P.fresh(),heroId='shen-gufeng')=>C.create(123,null,{heroId,equipment:true,monsterSkillVersion:0,progression:profile,progressionId:'journey-test'});
const send=(state,event)=>C.apply(state,{id:state.seq+1,...event}).state;
const draw=state=>send(state,{type:'finish',pid:null,reason:'draw'});

test('profile thresholds, free respec, slots and additive bonuses',()=>{
  const fresh=P.fresh();assert.deepEqual(fresh,{version:1,xp:0,realm:0,allocation:{}});
  assert.throws(()=>P.configure(fresh,{sword:1}),/allocation/);
  const active=P.configure({...fresh,xp:20},{sword:1});
  assert.equal(P.bonuses(active).basic,.04);
  assert.deepEqual(P.configure(active,{quiet:1}).allocation,{quiet:1});
  assert.throws(()=>P.configure(active,{sword:1,quiet:1}),/allocation/);
  const high=P.configure({version:1,xp:400,realm:2,allocation:{}},{sword:3,quiet:1});
  assert.deepEqual(P.bonuses(high),{damage:.02,taken:.02,heal:.02,shield:.02,basic:.08,active:0,counter:0,aggro:.06});
  assert.equal(P.realms[4].xp,2200);
  assert.deepEqual(P.trialSpec(4),{targetRealm:4,targetSpeciesId:'five-phase-sovereign',lifeScale:.95});
  assert.deepEqual([1,2,3,4].map(realm=>P.trialSpec(realm).lifeScale),[1,.85,.85,.95]);
});

test('equipment, realm and skill add in one factor; only snapshot receives benefits',()=>{
  const profile=P.configure({version:1,xp:400,realm:2,allocation:{}},{sword:3});
  const state=create(profile),p=state.players[0];
  assert.equal(E.factor(p,'damage',{basic:true}),1.10);
  assert.equal(E.factor(p,'taken'),.98);
  assert.equal(E.factor(create(P.fresh()).players[0],'damage',{basic:true}),1);
  const changed=P.configure(profile,{spell:3});
  assert.equal(E.factor(p,'damage',{basic:true}),1.10);
  assert.equal(E.factor({...p,progression:changed},'damage',{active:true}),1.10);
});

test('normal hand awards 12 plus at most three distinct action categories; AI XP independent',()=>{
  let s=create();
  s=send(s,{type:'meld',pid:0,action:'chow',keys:['B1','B2','B3']});
  s=send(s,{type:'meld',pid:0,action:'chow',keys:['B1','B2','B3']});
  s=send(s,{type:'meld',pid:0,action:'pong',key:'W7'});
  s=send(s,{type:'flower',pid:0,key:'H1'});
  s=send(s,{type:'flower',pid:0,key:'H2'});
  s=draw(s);
  assert.equal(P.award(s,0),15);
  assert.equal(s.players[0].progression.xp,0);
  assert.equal(P.award(s,1),12);
  assert.equal(s.players[1].progression.xp,12);
  assert.deepEqual(s.progression.actions[0],['chow','pong','flower']);
  assert.equal(P.award(create(),0),0);
  assert.equal(P.award(C.create(1),0),0);
});

test('AI breakthrough needs kills since entering realm and pays own wallet once',()=>{
  const s=draw(create());
  const ai=s.players[1];ai.progression.xp=100;
  const noKill=C.prepare(s);assert.equal(noKill.players[1].progression.realm,0);
  const progressed=P.advanceAI({...ai.progression,killStart:0},[{tier:'elite'}],ai.heroId);
  assert.equal(progressed.profile.realm,1);
  assert.equal(progressed.profile.killStart,1);
  assert.deepEqual(progressed.reward,{realm:1,title:P.realms[1].title,gold:100,sand:5});
  let battle=create(),m=battle.monster,species=M.get('golden-tiger');
  Object.assign(m,{speciesId:species.id,tier:species.tier,name:species.name,element:species.element,hp:1,maxHp:species.hp,shield:0,armor:species.armor});
  battle=send(battle,{type:'discard',pid:0,key:'W1'});
  battle=draw(battle);battle.players[1].progression.xp=100;
  const without=copy(battle);without.players[1].progression.xp=99;
  const yes=C.prepare(battle),no=C.prepare(without);
  assert.equal(yes.players[1].progression.realm,1);
  assert.equal(no.players[1].progression.realm,0);
  assert.equal(yes.players[1].economy.gold-no.players[1].economy.gold,100);
  assert.equal(yes.players[1].economy.sand-no.players[1].economy.sand,5);
  assert.deepEqual(yes.progression.aiBreakthroughs,[{pid:1,...progressed.reward}]);
  assert.equal(C.prepare(yes).players[1].economy.gold,yes.players[1].economy.gold);
});

test('trial kill ends immediately with trial reason, no journey advance, loot, XP or normal inheritance',()=>{
  const parent=C.prepare(draw(create()));
  const wallet=copy(parent.players.map(p=>p.economy));
  const trial={id:'trial-1',parentJourneyId:'journey-test',...P.trialSpec(1)};
  let s=C.create(456,parent,{progression:parent.players[0].progression,progressionId:'journey-test',trial,monsterSkillVersion:0});
  assert.equal(C.validate(s),true);
  assert.equal(s.monster.speciesId,'golden-tiger');
  const kills=s.kills.length,cycle=s.journey.cycle,monsterId=s.monster.id;
  s.monster.hp=1;s.monster.shield=0;
  s=send(s,{type:'discard',pid:0,key:'W1'});
  assert.equal(s.ended,true);assert.equal(s.result.reason,'trial');
  assert.equal(s.monster.id,monsterId);assert.equal(s.kills.length,kills+1);
  assert.equal(s.journey.cycle,cycle);assert.equal(P.award(s,0),0);
  assert.deepEqual(s.players.map(p=>p.economy.gold),wallet.map(e=>e.gold));
  assert.deepEqual(s.players.map(p=>p.economy.sand),wallet.map(e=>e.sand));
  assert.throws(()=>C.create(2,s),/Trial cannot continue/);
  const normal=C.create(789,parent,{progression:parent.players[0].progression,progressionId:'journey-test'});
  assert.equal(normal.trial,undefined);
  const normalEnded=draw(normal);normalEnded.result.reason='trial';
  assert.throws(()=>C.validate(normalEnded),/settlement/);
});

test('trial config and old preparation migration reject invalid data without retroactive XP',()=>{
  const parent=C.prepare(draw(create()));
  const spec=P.trialSpec(1);
  for(const trial of [{...spec,id:'x',parentJourneyId:'other'},{...spec,parentJourneyId:'journey-test'},{...spec,id:'x',parentJourneyId:'journey-test',lifeScale:1.1}])
    assert.throws(()=>C.create(123,parent,{trial}),/trial/i);
  const legacy=C.create(23,null,{heroId:'shen-gufeng',equipment:true});
  const ended=draw(legacy);
  const prepared=C.prepare(ended,{progression:P.fresh(),progressionId:'new-id'});
  assert.equal(prepared.players[0].progression.xp,0);
  assert.equal(prepared.progression.earned[0],0);
});

test('trial Hu kill and draw failure preserve isolated rewards',()=>{
  const parent=C.prepare(draw(create()));
  const trial={id:'trial-hu',parentJourneyId:'journey-test',...P.trialSpec(4)};
  let battle=C.create(44,parent,{trial,progression:parent.players[0].progression,progressionId:'journey-test',monsterSkillVersion:0});
  assert.equal(battle.monster.maxHp,Math.round(M.get('five-phase-sovereign').hp*.95));
  const failed=draw(battle);assert.equal(failed.result.reason,'draw');assert.equal(P.award(failed,0),0);
  assert.deepEqual(failed.players[0].economy.gold,parent.players[0].economy.gold);
  battle.monster.hp=1;battle.monster.shield=0;
  const won=send(battle,{type:'finish',pid:0,fan:0});
  assert.equal(won.result.reason,'trial');assert.equal(C.validate(won),true);
  assert.equal(P.award(won,0),0);
});

test('player breakthrough is a pure sequential transition with visible reward',()=>{
  const old={version:1,xp:100,realm:0,allocation:{sword:1}};
  const result=P.breakthrough(old,1);
  assert.deepEqual(result.profile,{...old,realm:1});
  assert.deepEqual(old,{version:1,xp:100,realm:0,allocation:{sword:1}});
  assert.deepEqual(result.reward,{realm:1,title:P.realms[1].title,gold:100,sand:5});
  assert.throws(()=>P.breakthrough(old,2),/unavailable/);
  const withWait={version:1,xp:2200,realm:3,allocation:{},eligibleHand:7};
  assert.equal(P.breakthrough(withWait,4).profile.eligibleHand,undefined);
});

test('all new threat uses floor 0.75 including a low attack rate buff',()=>{
  const profile=P.configure({version:1,xp:2200,realm:4,allocation:{}},{quiet:3});
  const state=create(profile,'ye-shuying');
  state.players[0].statuses.push({kind:'aggroRate',value:.05,duration:1,charges:1,trigger:'attackSkill',id:'test'});
  const next=send(state,{type:'meld',pid:0,action:'chow',keys:['B1','B2','B3']});
  assert.ok(Math.abs(next.players[0].aggro-next.players[0].damage*.75)<1e-9);
});

test('prepare refreshes only player snapshot from latest permanent profile',()=>{
  const battle=create();
  const latest=P.configure({version:1,xp:400,realm:2,allocation:{}},{sword:3});
  const active=C.create(999,battle,{progression:latest});
  assert.deepEqual(active.players[0].progression,P.fresh());
  const ended=draw(battle);
  const prepared=C.prepare(ended,{progression:latest,progressionId:'journey-test'});
  assert.deepEqual(prepared.players[0].progression,latest);
  assert.deepEqual(ended.players[0].progression,P.fresh());
  assert.equal(E.factor(prepared.players[0],'damage',{basic:true}),1.10);
  assert.equal(E.factor(ended.players[0],'damage',{basic:true}),1);
  assert.equal(C.validate(prepared),true);
});

test('trial starts without the original journey pending seals; normal next hand inherits them',()=>{
  const parent=C.prepare(draw(create()));
  parent.players[0].pendingSeals=F.curses([{id:'small-winds'}]);
  assert.equal(C.validate(parent),true);
  const normal=C.create(88,parent,{progression:parent.players[0].progression,progressionId:'journey-test'});
  assert.equal(normal.players[0].activeSeals.length,1);
  const trial=C.create(88,parent,{progression:parent.players[0].progression,progressionId:'journey-test',
    trial:{id:'trial-no-seal',parentJourneyId:'journey-test',...P.trialSpec(1)}});
  assert.ok(trial.players.every(p=>p.activeSeals.length===0 && p.pendingSeals.length===0));
  assert.equal(parent.players[0].pendingSeals.length,1);
  assert.equal(C.validate(trial),true);
});

test('each preparation processes AI progression at most once',()=>{
  let battle=create(),m=battle.monster,species=M.get('blackarmor-general');
  Object.assign(m,{speciesId:species.id,tier:species.tier,name:species.name,element:species.element,hp:1,maxHp:species.hp,shield:0,armor:species.armor});
  battle=draw(send(battle,{type:'discard',pid:0,key:'W1'}));
  battle.players[1].progression.xp=400;
  const prepared=C.prepare(battle);
  assert.equal(prepared.players[1].progression.realm,1);
  assert.equal(prepared.progression.preparedHand,prepared.handNumber);
  prepared.players[1].progression.killStart=0;
  const repeated=C.prepare(prepared);
  assert.equal(repeated.players[1].progression.realm,1);
  assert.deepEqual(repeated.progression.aiBreakthroughs,prepared.progression.aiBreakthroughs);
  assert.equal(repeated.players[1].economy.gold,prepared.players[1].economy.gold);
  assert.equal(repeated.players[1].economy.sand,prepared.players[1].economy.sand);
});

test('ten AI heroes each have a complete fixed six-skill priority',()=>{
  const ids=P.skills.map(s=>s.id).sort();
  assert.deepEqual(Object.keys(P.aiPriorities).sort(),H.all.map(h=>h.id).sort());
  for (const hero of H.all) {
    const order=P.aiPriorities[hero.id];
    assert.equal(order.length,6);
    assert.deepEqual([...order].sort(),ids);
    const middle={version:1,xp:400,realm:2,allocation:{}};
    assert.deepEqual(P.aiAllocation(hero.id,middle),{[order[0]]:3,[order[1]]:1});
    const highest={version:1,xp:2200,realm:4,allocation:{}};
    assert.deepEqual(P.aiAllocation(hero.id,highest),{[order[0]]:3,[order[1]]:3});
  }
  assert.throws(()=>P.aiAllocation('unknown',{version:1,xp:20,realm:0,allocation:{}}),/Unknown/);
});

test('AI starts waiting at threshold preparation and passes on exactly the tenth further normal hand',()=>{
  let battle=create();battle.players[1].progression.xp=88;
  battle=send(battle,{type:'finish',pid:null,reason:'defeat'});
  assert.equal(battle.players[1].progression.xp,100);
  let prepared=C.prepare(battle);
  assert.equal(prepared.players[1].progression.eligibleHand,1);
  assert.equal(prepared.players[1].progression.realm,0);
  for(let completed=1;completed<=10;completed++) {
    battle=C.create(200+completed,prepared);
    battle=draw(battle);
    prepared=C.prepare(battle);
    assert.equal(prepared.players[1].progression.realm,completed===10?1:0);
    if(completed===9) assert.equal(prepared.players[1].progression.eligibleHand,1);
  }
  assert.equal(prepared.handNumber,11);
  assert.equal(prepared.players[1].progression.eligibleHand,undefined);
  assert.equal(prepared.players[1].progression.killStart,prepared.kills.length);
  assert.deepEqual(prepared.progression.aiBreakthroughs,[{pid:1,realm:1,title:P.realms[1].title,gold:100,sand:5}]);
});

test('AI qualifying victory advances before the guarantee and clears wait for the next realm',()=>{
  const profile={version:1,xp:100,realm:0,allocation:{},killStart:0,eligibleHand:1};
  const result=P.advanceAI(profile,[{tier:'elite'}],'shen-gufeng',2);
  assert.equal(result.profile.realm,1);
  assert.equal(result.profile.killStart,1);
  assert.equal(result.profile.eligibleHand,undefined);
  assert.equal(P.eligible(profile,[],10),false);
  assert.equal(P.eligible(profile,[],11),true);
  assert.equal(P.advanceAI(result.profile,[{tier:'elite'}],'shen-gufeng',2).reward,null);
  const high=P.advanceAI({...profile,xp:2200},[{tier:'elite'}],'shen-gufeng',2);
  assert.equal(high.profile.eligibleHand,2);
});

test('high-XP AI starts the next wait on breakthrough hand and reaches realm 4 on hand 21',()=>{
  let battle=create();
  Object.assign(battle.players[1].progression,{xp:2200,realm:2,eligibleHand:1});
  let prepared=C.prepare(draw(battle));
  assert.equal(prepared.players[1].progression.realm,2);
  for(let hand=2;hand<=21;hand++) {
    battle=C.create(400+hand,prepared);
    prepared=C.prepare(draw(battle));
    if(hand===11) {
      assert.equal(prepared.players[1].progression.realm,3);
      assert.equal(prepared.players[1].progression.eligibleHand,11);
      const repeated=C.prepare(prepared);
      assert.equal(repeated.players[1].progression.realm,3);
      assert.equal(repeated.players[1].progression.eligibleHand,11);
      assert.equal(repeated.players[1].economy.gold,prepared.players[1].economy.gold);
    }
    if(hand===20) assert.equal(prepared.players[1].progression.realm,3);
  }
  assert.equal(prepared.players[1].progression.realm,4);
  assert.equal(prepared.players[1].progression.eligibleHand,undefined);
});

test('repeated preparation and a trial do not advance the ten-hand wait',()=>{
  let battle=create();battle.players[1].progression.xp=100;
  const parent=C.prepare(draw(battle));
  const repeated=C.prepare(parent);
  assert.equal(repeated.players[1].progression.eligibleHand,1);
  assert.equal(repeated.players[1].progression.realm,0);
  const trial=C.create(55,parent,{trial:{id:'waiting-trial',parentJourneyId:'journey-test',...P.trialSpec(1)},
    progression:parent.players[0].progression,progressionId:'journey-test'});
  assert.equal(draw(trial).handNumber,2);
  assert.equal(parent.handNumber,1);
  assert.equal(parent.players[1].progression.eligibleHand,1);
  const normal=C.prepare(draw(C.create(56,parent)));
  assert.equal(normal.handNumber,2);
  assert.equal(normal.players[1].progression.eligibleHand,1);
  assert.equal(normal.players[1].progression.realm,0);
  const newJourney=create();
  assert.equal(newJourney.players[1].progression.eligibleHand,undefined);
  assert.equal(newJourney.players[1].progression.xp,0);
});

test('legacy prepared AI begins waiting safely; malformed future and negative wait markers fail validation',()=>{
  let battle=create();battle.players[1].progression.xp=100;
  const prepared=C.prepare(draw(battle));
  delete prepared.players[1].progression.eligibleHand;
  const migrated=C.prepare(prepared);
  assert.equal(migrated.players[1].progression.eligibleHand,migrated.handNumber);
  assert.equal(migrated.players[1].progression.realm,0);
  assert.throws(()=>P.validate({...P.fresh(),xp:100,eligibleHand:-1}),/eligibleHand/);
  const future=copy(migrated);future.players[1].progression.eligibleHand=future.handNumber+1;
  assert.throws(()=>C.validate(future),/eligible hand/);
});
