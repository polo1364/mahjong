const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { game } = require('./game-harness.cjs');

function setup() {
  const harness = game(71, { cultivation: true, heroId: 'shen-gufeng' });
  harness.run(`
    let preparationShown = 0, resultShown = 0, saveCalls = 0;
    window.MahjongCultivationJourneyUI.showPreparation = () => { preparationShown++; };
    const actualWriteGameSave = writeGameSave; writeGameSave = async () => { saveCalls++; return true; };
    showHandsAndContinue = () => { resultShown++; };
    function snapshot() { return { gameState: clone(S), rules: clone(RULES), seatNames, randomNames, dealerStreak }; }
    function finishHand() {
      S.cultivation = window.MahjongCultivationCombat.apply(S.cultivation, { id: S.cultivation.seq + 1, type: 'finish', reason: 'draw', monsterId: S.cultivation.monster.id }).state;
      S.phase = 'end';
    }
  `);
  return harness;
}

test('new journey waits for selection; cancellation preserves old state and save', () => {
  const { run, timers } = setup();
  run(`let before = JSON.stringify(S), picked, cancelled, started = 0, cleared = 0;
    clearAutoSave = async () => { cleared++; };
    window.MahjongCultivationJourneyUI.chooseHero = (onChoose, onCancel) => { picked = onChoose; cancelled = onCancel; };
    startNewSession('cultivation', { freshJourney: true, onStarted() { started++; } });`);
  assert.equal(run('JSON.stringify(S) === before'), true);
  assert.equal(run('cleared'), 0);
  assert.equal(run('started'), 0);
  assert.equal(timers.size, 0);
  run('cancelled()');
  assert.equal(run('JSON.stringify(S) === before'), true);
  assert.equal(run('cleared'), 0);
});

test('confirmed hero alone starts fresh journey and resets old seals and progress', () => {
  const { run } = setup();
  run(`S.cultivation.players[1].pendingSeals = window.MahjongCultivationFinishers.curses([{id:'closed'}]);
    let chosen; window.MahjongCultivationJourneyUI.chooseHero = callback => { chosen = callback; };
    let began = 0; startNewSession('cultivation', { freshJourney:true, onStarted(){began++;} }); chosen('luo-xuanyu');`);
  assert.equal(run('S.cultivation.players[0].heroId'), 'luo-xuanyu');
  assert.equal(run('S.cultivation.handNumber'), 1);
  assert.equal(run('S.cultivation.journey.phase'), 'combat');
  assert.equal(run('S.cultivation.players.every(p => !p.pendingSeals.length && !p.activeSeals.length)'), true);
  assert.equal(run('began'), 1);
  assert.equal(run('new Set(S.cultivation.players.map(p=>p.heroId)).size'), 4);
});

test('result advances to persisted V3 preparation without another attack or deal', async () => {
  const { run, timers } = setup();
  run(`finishHand(); let before = clone(S.cultivation); let tileIds = S.players.flatMap(p=>p.hand.map(t=>t.id)).join(); continueCultivationResult();`);
  await run('cultivationPreparationSave');
  assert.equal(run('S.cultivation.journey.phase'), 'preparation');
  assert.equal(run('preparationShown'), 1);
  assert.equal(run('saveCalls'), 1);
  assert.equal(run('S.cultivation.seq === before.seq'), true);
  assert.equal(run('S.players.flatMap(p=>p.hand.map(t=>t.id)).join() === tileIds'), true);
  assert.equal(run('JSON.stringify(S.cultivation.monster) === JSON.stringify(before.monster)'), true);
  assert.equal(run('S.cultivation.version'), 3);
  assert.equal(run('S.cultivation.players.map(p=>p.heroId).join() === before.players.map(p=>p.heroId).join()'), true);
  assert.equal(timers.size, 0);
});

test('restore preparation and result resumes exact phase without replaying combat', async () => {
  const { run, timers } = setup();
  run(`finishHand(); let result = snapshot(); let beforeResult = JSON.stringify(S.cultivation); restoreGame(result,'cultivation');`);
  assert.equal(run('resultShown'), 1);
  assert.equal(run('JSON.stringify(S.cultivation) === beforeResult'), true);
  run(`continueCultivationResult();`); await run('cultivationPreparationSave');
  run(`let prepared = snapshot(); let beforePreparation = JSON.stringify(S.cultivation); restoreGame(prepared,'cultivation');`);
  assert.equal(run('preparationShown'), 2);
  assert.equal(run('JSON.stringify(S.cultivation) === beforePreparation'), true);
  assert.equal(run('resultShown'), 1);
  assert.equal(timers.size, 0);
});

test('a delayed result save cannot overwrite a more recent preparation phase', async () => {
  const { run } = setup();
  run(`finishHand(); let openStorage, transactions = 0, closed = 0;
    initDB = () => new Promise(resolve => { openStorage = resolve; });
    let delayedSave = actualWriteGameSave(gameSaveKey('auto'));
    continueCultivationResult();`);
  await run('cultivationPreparationSave');
  run(`openStorage({close(){closed++;},transaction(){transactions++;throw new Error('stale save should not write');}});`);
  assert.equal(await run('delayedSave'), false);
  assert.equal(run('transactions'), 0);
  assert.equal(run('closed'), 1);
  assert.equal(run('S.cultivation.journey.phase'), 'preparation');
});

test('return home commits the preparation snapshot and resume restores it exactly', async () => {
  const { run } = setup();
  run(`finishHand(); continueCultivationResult();`); await run('cultivationPreparationSave');
  run(`writeGameSave = actualWriteGameSave; let beforeHome = JSON.stringify(S.cultivation), savedSnapshot, savedKey, homeShown = 0;
    window.MahjongStartScreen = {state:'game', async showHome(){homeShown++;this.state='home';}};
    initDB = async () => ({close(){},transaction(){
      const transaction = {objectStore(){return {put(data,key){savedSnapshot=clone(data);savedKey=key;Promise.resolve().then(()=>transaction.oncomplete());}};}};
      return transaction;
    }});`);
  await run(`document.getElementById('returnHomeBtn').onclick()`);
  assert.equal(run('S'), null);
  assert.equal(run('homeShown'), 1);
  assert.equal(run('savedKey'), 'cultivationAutoSaveV1');
  assert.equal(run('savedSnapshot.gameState.cultivation.journey.phase'), 'preparation');
  run(`restoreGame(savedSnapshot,'cultivation')`);
  assert.equal(run('JSON.stringify(S.cultivation) === beforeHome'), true);
  assert.equal(run('preparationShown'), 2);
});

test('return home refuses a superseded save without erasing the next hand', async () => {
  const { run } = setup();
  run(`finishHand(); continueCultivationResult();`); await run('cultivationPreparationSave');
  run(`writeGameSave = actualWriteGameSave; let openStorage, writes = 0, homeShown = 0;
    window.MahjongStartScreen = {state:'game',async showHome(){homeShown++;}};
    initDB = () => new Promise(resolve => {openStorage=resolve;});
    let leavingHome = document.getElementById('returnHomeBtn').onclick();
    startNewSession('cultivation'); let nextHand=S, nextCombat=JSON.stringify(S.cultivation);
    openStorage({close(){},transaction(){writes++;throw new Error('superseded save');}});`);
  assert.equal(await run('leavingHome'), false);
  assert.equal(run('S===nextHand'), true);
  assert.equal(run('S.cultivation.handNumber'), 2);
  assert.equal(run('JSON.stringify(S.cultivation)===nextCombat'), true);
  assert.equal(run('homeShown'), 0);
  assert.equal(run('writes'), 0);
});

test('return home keeps preparation when storage reports an uncommitted save', async () => {
  const { run } = setup();
  run(`finishHand(); continueCultivationResult();`); await run('cultivationPreparationSave');
  run(`const preparedState=S; let homeShown=0;
    window.MahjongStartScreen = {state:'game',async showHome(){homeShown++;}};
    writeGameSave=async()=>false;`);
  assert.equal(await run(`document.getElementById('returnHomeBtn').onclick()`), false);
  assert.equal(run('S===preparedState'), true);
  assert.equal(run('S.cultivation.journey.phase'), 'preparation');
  assert.equal(run('homeShown'), 0);
});

test('preparation blocks Home and Next while Home commits, then permits retry on failure', async () => {
  const C = require('../cultivation-combat.js');
  const selectors = new Map();
  const dialog = {
    isConnected: false, scrollTop: 0,
    setAttribute() {}, addEventListener() {}, showModal() {}, close() {},
    remove() { this.isConnected = false; },
    querySelector(selector) {
      if (!selectors.has(selector)) selectors.set(selector, { disabled: false, textContent: '', focus() {} });
      return selectors.get(selector);
    }
  };
  const window = { MahjongCultivationCombat:C, MahjongCultivationHeroes:require('../cultivation-heroes.js'), MahjongCultivationMonsters:require('../cultivation-monsters.js'), MahjongCultivationFinishers:require('../cultivation-finishers.js') };
  const document = { createElement:()=>dialog, body:{append(){dialog.isConnected=true;}}, activeElement:null };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cultivation-journey-ui.js'),'utf8'),{window,document});
  let combat=C.create(7,null,{heroId:'shen-gufeng'});
  combat=C.prepare(C.apply(combat,{type:'finish',reason:'draw',id:1}).state);
  let finishHome, homeCalls=0, starts=0;
  window.MahjongCultivationJourneyUI.showPreparation({cultivation:combat},{onStart(){starts++;},onHome(){homeCalls++;return new Promise(resolve=>{finishHome=resolve;});}});
  const home=selectors.get('#journeyHome'), next=selectors.get('#journeyNext');
  const pending=home.onclick();
  assert.equal(home.disabled,true);
  assert.equal(next.disabled,true);
  next.onclick(); await home.onclick();
  assert.equal(starts,0);
  assert.equal(homeCalls,1);
  finishHome(false); await pending;
  assert.equal(home.disabled,false);
  assert.equal(next.disabled,false);
  assert.match(selectors.get('.journey-footer p').textContent,/封存未完成/);
  next.onclick(); next.onclick();
  assert.equal(starts,1);
});

test('start next carries exact party and seals while resetting per-hand values', async () => {
  const { run } = setup();
  run(`finishHand(); S.cultivation.players[2].pendingSeals = window.MahjongCultivationFinishers.curses([{id:'closed'}]); continueCultivationResult();`); await run('cultivationPreparationSave');
  run(`let party = S.cultivation.players.map(p=>p.heroId).join(), identities = S.cultivation.players.map(p=>p.characterId).join();
    const actualCombat = window.MahjongCultivationCombat; let freshCombat;
    window.MahjongCultivationCombat = {...actualCombat,create(...args){const created=actualCombat.create(...args);freshCombat=clone(created);return created;}};
    startNewSession('cultivation');`);
  assert.equal(run('S.cultivation.handNumber'), 2);
  assert.equal(run('S.cultivation.journey.phase'), 'combat');
  assert.equal(run('S.cultivation.players.map(p=>p.heroId).join() === party'), true);
  assert.equal(run('S.cultivation.players.map(p=>p.characterId).join() === identities'), true);
  assert.equal(run('S.cultivation.players[2].activeSeals.length'), 1);
  // Opening flowers cast once after the reset, so inspect the committed pre-deal combat state.
  assert.equal(run('freshCombat.players.every(p=>p.hp===1000 && p.damage===0 && p.aggro===0)'), true);
  assert.equal(run('S.cultivation.version'), 3);
  assert.equal(run('S.cultivation.players.every(p=>p.economy && p.equipmentState)'), true);
});

test('normal and old journey preserve their original continuation rules', () => {
  const normal = game(4);
  normal.run(`startNewSession('normal')`);
  assert.equal(normal.run('S.cultivation'), undefined);
  assert.equal(normal.run('continueCultivationResult()'), false);
  const legacy = game(4, { cultivation: true });
  legacy.run(`let party = S.cultivation.players.map(p=>p.characterId).join(); startNewSession('cultivation');`);
  assert.equal(legacy.run('S.cultivation.version'), 1);
  assert.equal(legacy.run('S.cultivation.players.map(p=>p.characterId).join()===party'), true);
  assert.equal(legacy.run('continueCultivationResult()'), false);
});
