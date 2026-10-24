// Regression: real flow/combat modules with deliberately delayed storage.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const {test}=require('node:test');
const output=[];
async function run() {
  const context=vm.createContext({console,structuredClone});
  vm.runInContext(`var window=globalThis;`,context);
  const modules=['cultivation-skills.js','cultivation-finishers.js','cultivation-heroes.js','cultivation-monster-skills.js','cultivation-monsters.js','cultivation-progression.js','cultivation-equipment.js','cultivation-items.js','cultivation-economy.js','cultivation-combat.js'];
  for(const file of modules)vm.runInContext(fs.readFileSync(root+'/'+file,'utf8'),context);
  vm.runInContext(`
    let serial=0,storedRevision=0,storedEnvelope=null,currentState=null,resolveSettlement;
    crypto={randomUUID:()=> 'migration-'+(++serial)};
    const profile=MahjongCultivationProgression.fresh();
    const fake={
      readProfile:async()=>JSON.parse(JSON.stringify(profile)),readTrial:async()=>null,
      readAutoRevision:async()=>storedRevision,
      settle:()=>new Promise(resolve=>{resolveSettlement=resolve;}),
      saveAutoGuarded:async(envelope,expected)=>{
        if(expected!==storedRevision)return false;
        storedEnvelope=structuredClone(envelope);return ++storedRevision;
      }
    };
    MahjongProgressionStore={create:()=>fake};
  `,context);
  vm.runInContext(fs.readFileSync(root+'/cultivation-progression-flow.js','utf8'),context);
  const execute=code=>vm.runInContext(code,context);
  execute(`MahjongProgressionFlow.init({getState:()=>currentState,pack:s=>({gameState:structuredClone(s)}),status(){}});`);
  execute(`
    currentState={phase:'end',cultivation:{ended:true,handNumber:1,progression:{journeyId:'old'}}};
    const lateSave=MahjongProgressionFlow.save({gameState:structuredClone(currentState)});
    currentState={phase:'play',cultivation:{ended:false,handNumber:1,progression:{journeyId:'new'}}};
    const freshSave=MahjongProgressionFlow.save({gameState:structuredClone(currentState)});
  `);
  await Promise.resolve();
  assert.equal(execute('storedEnvelope'),null, 'newer save waits for old settlement');
  execute('resolveSettlement({profile,earned:12});');
  await Promise.all([execute('lateSave'),execute('freshSave')]);
  output.push({case:'delayed settlement save overwrites new journey',storedJourney:execute('storedEnvelope.gameState.cultivation.progression.journeyId'),liveJourney:execute('currentState.cultivation.progression.journeyId')});
  assert.equal(output[0].storedJourney,'new');
  execute(`
    let legacy=MahjongCultivationCombat.create(123,null,{heroId:'shen-gufeng',equipment:true});
    legacy=MahjongCultivationCombat.apply(legacy,{id:1,type:'finish',reason:'draw'}).state;
    currentState={phase:'end',cultivation:legacy};
  `);
  // Legacy settle returns zero immediately in the actual store (no progression).
  execute('fake.settle=async()=>({profile,earned:0});');
  const first=await execute('MahjongProgressionFlow.prepare(JSON.parse(JSON.stringify(currentState)))');
  const second=await execute('MahjongProgressionFlow.prepare(JSON.parse(JSON.stringify(currentState)))');
  output.push({case:'same legacy snapshot migrates to different identities',first:first.cultivation.progression.journeyId,second:second.cultivation.progression.journeyId,economyIdentity:first.cultivation.economy.journeyId});
  assert.equal(output[1].first,output[1].second);
  assert.equal(output[1].first,output[1].economyIdentity);
  context.firstMigrated=first; context.secondMigrated=second;
  const replays=execute(`
    [firstMigrated,secondMigrated].map(value=>{
      const restored=JSON.parse(JSON.stringify(value));
      let replay=MahjongCultivationCombat.create(456,restored.cultivation,{progression:profile});
      replay=MahjongCultivationCombat.apply(replay,{id:replay.seq+1,type:'finish',reason:'draw'}).state;
      return {receipt:replay.progression.journeyId+':'+replay.handNumber,earned:MahjongCultivationProgression.award(replay,0)};
    });
  `);
  output.push({case:'identical subsequent hand gets distinct permanent reward receipts',replays});
  assert.equal(new Set(replays.map(x=>x.receipt)).size,1);
  assert.equal(replays.reduce((n,x)=>n+x.earned,0),24);

}
test('delayed settlement cannot overwrite a later hand; legacy migration retains identity',run);
