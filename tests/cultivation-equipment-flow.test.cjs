const {test}=require('node:test');
const assert=require('node:assert/strict');
const {game}=require('./game-harness.cjs');
function setup() {
  const harness=game(71,{cultivation:true,heroId:'shen-gufeng'});
  harness.run(`let shown=0;window.MahjongCultivationJourneyUI.showPreparation=()=>{shown++;};
    function endHand(){S.cultivation=window.MahjongCultivationCombat.apply(S.cultivation,{type:'finish',reason:'draw',id:S.cultivation.seq+1}).state;S.phase='end';}`);
  return harness;
}
test('actual selected new journey explicitly enables V3 and starts with empty personal economy',()=>{
  const {run}=setup();run(`startNewSession('cultivation',{freshJourney:true});`);
  assert.equal(run('S.cultivation.version'),3);
  assert.equal(run('S.cultivation.players.every(p=>p.economy.gold===120&&p.economy.sand===0&&p.economy.inventory.length===0&&p.economy.shop===null)'),true);
});
test('V2 migration only publishes saved V3 and failed prepare retries the exact candidate',async()=>{
  const {run}=setup();run(`endHand();let original=S,attempts=0,candidates=[];writeGameSave=async(key,next)=>{candidates.push(next);attempts++;return attempts>1;};continueCultivationResult();`);
  await run('cultivationPreparationSave');
  assert.equal(run('S===original'),true);assert.equal(run('S.cultivation.version'),2);assert.equal(run('shown'),0);
  run('continueCultivationResult()');await run('cultivationPreparationSave');
  assert.equal(run('S.cultivation.version'),3);assert.equal(run('candidates[0]===candidates[1]'),true);assert.equal(run('shown'),1);
  assert.equal(run('S.cultivation.players[0].economy.gold'),120);
});
test('preparation persistence locks direct new-session and restore navigation',async()=>{
  const {run}=setup();run(`endHand();let finishSave;writeGameSave=()=>new Promise(resolve=>{finishSave=resolve;});let original=S;continueCultivationResult();`);
  await Promise.resolve();
  assert.equal(run(`startNewSession('cultivation')`),false);assert.equal(run('S===original'),true);
  assert.throws(()=>run('restoreGame({})'),/正在儲存/);
  run('finishSave(true)');await run('cultivationPreparationSave');assert.equal(run('shown'),1);
});
test('candidate saves persist candidate while source remains published and reject stale autosaves',async()=>{
  const {run}=setup();run(`endHand();let candidate={...S,cultivation:window.MahjongCultivationCombat.prepare(S.cultivation,{equipment:true})},persisted,transactions=0;
    initDB=async()=>({close(){},transaction(){transactions++;const tx={objectStore(){return {put(data){persisted=data;Promise.resolve().then(()=>tx.oncomplete());}};}};return tx;}});
    cultivationPreparationLocked=true;`);
  assert.equal(await run(`writeGameSave(gameSaveKey('auto'))`),false);
  assert.equal(await run(`writeGameSave(gameSaveKey('auto'),candidate)`),true);
  assert.equal(run('S.cultivation.version'),2);assert.equal(run('persisted.gameState.cultivation.version'),3);assert.equal(run('transactions'),1);
});
test('next hand preserves the committed preparation autosave until a new hand save can replace it',async()=>{
  const {run}=setup();run(`endHand();writeGameSave=async()=>true;continueCultivationResult();`);await run('cultivationPreparationSave');
  run(`let clearCalls=0;clearAutoSave=async()=>{clearCalls++;};startNewSession('cultivation');`);
  assert.equal(run('S.cultivation.handNumber'),2);assert.equal(run('clearCalls'),0);
  run(`startNewSession('cultivation',{freshJourney:true})`);assert.equal(run('clearCalls'),0);
});
test('restored legacy V2 preparation migrates save-first and retries without opening V2 courtyard',async()=>{
  const {run}=setup();run(`endHand();S.cultivation=window.MahjongCultivationCombat.prepare(S.cultivation);
    let legacy={gameState:clone(S),rules:clone(RULES),seatNames,randomNames,dealerStreak};
    showHandsAndContinue=()=>{};let attempts=0;writeGameSave=async()=>++attempts>1;restoreGame(legacy,'cultivation');`);
  await run('cultivationPreparationSave');assert.equal(run('S.cultivation.version'),2);assert.equal(run('shown'),0);
  run('continueCultivationResult()');await run('cultivationPreparationSave');
  assert.equal(run('S.cultivation.version'),3);assert.equal(run('shown'),1);
});
