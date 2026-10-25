const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {game}=require('./game-harness.cjs');
test('cultivation north wraps east with dealer rotation; normal mode still ends',()=>{
  const {run}=game(121,{cultivation:true,heroId:'shen-gufeng',equipment:true});
  run(`S.cultivation=window.MahjongCultivationCombat.apply(S.cultivation,{id:S.cultivation.seq+1,type:'finish',reason:'draw'}).state;S.cultivation=window.MahjongCultivationCombat.prepare(S.cultivation);S.round=4;S.dealer=2;S.initialDealer=0;S.winner=1;S.phase='end';let finals=0;showFinalScore=()=>{finals++};startNewSession('cultivation');`);
  assert.equal(run('S.round'),1);assert.equal(run('S.dealer'),0);assert.equal(run('finals'),0);assert.equal(run('S.cultivation.handNumber'),2);
  run(`gameMode='normal';S.round=4;S.dealer=2;S.initialDealer=0;S.winner=1;startNewHand(false);`);
  assert.equal(run('finals'),1);
});
test('event commit is serialized before trial captures parent wallet',async()=>{
  const context=vm.createContext({console,structuredClone});
  vm.runInContext(`window=globalThis;crypto={randomUUID:()=> 'trial'};
    let state={phase:'end',cultivation:{journey:{phase:'preparation'},progression:{journeyId:'j'},players:[{progression:{realm:0,xp:100},economy:{gold:100}}]}};
    let release,parent=null;const hold=new Promise(resolve=>release=resolve);
    MahjongCultivationProgression={trialSpec:realm=>({targetRealm:realm})};
    MahjongProgressionStore={create:()=>({readProfile:async()=>({realm:0,xp:100}),readTrial:async()=>null,
      chooseEvent:async envelope=>{await hold;const saved=structuredClone(envelope);saved.gameState.cultivation.players[0].economy.gold=85;return {envelope:saved,revision:1};},
      beginTrial:async envelope=>{parent=structuredClone(envelope);return {parentEnvelope:envelope,id:'trial',targetRealm:1};}
    })};`,context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../cultivation-progression-flow.js'),'utf8'),context);
  vm.runInContext(`MahjongProgressionFlow.init({getState:()=>state,pack:s=>({gameState:structuredClone(s)}),publish:s=>state=s,launchTrial(){}});
    const options=MahjongProgressionFlow.preparationOptions();const event=options.onEvent('1');const trial=options.onTrial();`,context);
  await Promise.resolve();assert.equal(vm.runInContext('parent',context),null);
  vm.runInContext('release()',context);await Promise.all([vm.runInContext('event',context),vm.runInContext('trial',context)]);
  assert.equal(vm.runInContext('parent.gameState.cultivation.players[0].economy.gold',context),85);
});
