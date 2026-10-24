const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./game-harness.cjs');

function setup(seed = 7) {
  const harness = game(seed, { cultivation: true });
  harness.run(`
    function battleFixture() {
      fixture();
      S.cultivation = window.MahjongCultivationCombat.create(7);
      S.cultivation.monster.element = 'earth';
      S.cultivation.monster.hp = S.cultivation.monster.maxHp = 100000;
      Object.assign(S.cultivation.monster.nextAttack, {type:'single', charged:false, damage:160, ailment:null});
      S.cultivationAwaitingSelfDraw = false;
    }
    function due() { S.cultivation.discardCount=4; S.cultivation.enemyDue=S.cultivation.monster.id; }
    function saveData() { return {gameState:clone(S),rules:clone(RULES),seatNames,randomNames,dealerStreak}; }
  `);
  return harness;
}

test('cultivation uses 144 tiles, processes initial flowers once, and normal mode has no combat state', () => {
  const { run } = setup();
  assert.equal(run('gameMode'), 'cultivation');
  assert.equal(run(`S.players.every((p,pid)=>p.flowers.map(tileKey).sort().join()===S.cultivation.players[pid].flowers.slice().sort().join())`), true);
  assert.equal(run(`{const all=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers])];all.length===144&&new Set(all.map(t=>t.id)).size===144}`), true);
  run(`let prior=JSON.stringify(S.cultivation);beginDealtHand(S);`);
  assert.equal(run('JSON.stringify(S.cultivation)===prior'), true);
  run(`startNewSession('normal')`);
  assert.equal(run(`Object.hasOwn(S,'cultivation')`), false);
  assert.equal(run(`gameSaveKey('auto')+'|'+gameSaveKey('manual')`), 'autoSave|manualSave');
});

test('illegal and repeated discards never cast a basic attack', () => {
  const { run } = setup();
  run(`battleFixture();S.players[0].hand=tiles('W1 W2 W4 W6 W8 T1 T2 T4 T6 T8 B1 B3 B5 B7 FE FS DC');let out=S.players[0].hand[0];
    discard(1,out);discard(0,tiles('DB')[0]);`);
  assert.equal(run('S.cultivation.seq'), 0);
  run(`discard(0,out);let seq=S.cultivation.seq;discard(0,out);`);
  assert.equal(run('S.cultivation.seq===seq'), true);
  assert.equal(run(`S.cultivation.log.filter(e=>e.type==='skill'&&e.skillId==='basic').length`), 1);
});

test('fourth discard waits for player reaction and pong skill resolves before monster attack', () => {
  const { run } = setup();
  run(`battleFixture();S.turn=2;
    S.players[2].hand=tiles('W1 W2 W4 W6 W8 T1 T2 T4 T6 T8 B1 B3 B5 B7 FE FS DC');
    S.players[0].hand=tiles('W1 W1 W3 W5 W7 T3 T5 T7 T9 B2 B4 B6 B8 FN DF DB');
    S.cultivation.discardCount=3;discard(2,S.players[2].hand[0]);`);
  assert.equal(run('!!S.waitReact'), true);
  assert.equal(run('S.cultivation.discardCount'), 4);
  assert.equal(run('S.cultivation.players.every(p=>p.hp===1000)'), true);
  run('handlePongClick()');
  assert.equal(run('S.players[0].melds[0].type'), 'pong');
  assert.equal(run('S.cultivation.enemyDue'), null);
  assert.equal(run(`{let events=S.cultivation.log;events.findIndex(e=>e.skillId==='W.pong.111')<events.findIndex(e=>e.type==='enemy')}`), true);
  assert.equal(run(`S.cultivation.log.filter(e=>e.type==='enemy').length`), 1);
  run('stepNext()');
  assert.equal(run(`S.cultivation.log.filter(e=>e.type==='enemy').length`), 1);
});

test('fourth discard Hu resolves finisher and ranking before any due enemy attack; points untouched', () => {
  const { run } = setup();
  run(`battleFixture();due();S.cultivation.players[1].damage=4000;
    S.players[0].hand=tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC');
    S.lastDiscard={from:2,tile:tiles('DC')[0]};S.waitReact=[{pid:0,type:'hu',tile:S.lastDiscard.tile}];S.currentReactions=S.waitReact;
    let points=S.players.map(p=>p.points).join();handleHuClick();`);
  assert.equal(run('S.phase'), 'end');
  assert.equal(run('S.cultivation.result.huPid'), 0);
  assert.equal(run('S.cultivation.result.ranking[0].pid'), 1);
  assert.equal(run(`S.cultivation.log.filter(e=>e.type==='enemy').length`), 0);
  assert.equal(run('S.players.map(p=>p.points).join()===points'), true);
  assert.equal(run(`S.cultivation.log.filter(e=>e.skillId==='finish.combo').length`), 1);
  assert.ok(run('S.cultivation.finisher.parts.length') > 1);
});

test('concealed kong replacement Hu choice holds due monster; passing resolves it once', () => {
  const { run } = setup();
  run(`battleFixture();due();S.players[0].hand=tiles('W1 W1 W1 W1 W2 W3 W4 T1 T2 T3 B1 B2 B3 FE FE FE DC');
    S.wall=tiles('W7 W8 W9');S.deadWall=tiles('DC');doConcealedKong(0,'W1');`);
  assert.equal(run('canSelfDraw(0)'), true);
  assert.equal(run('S.cultivationAwaitingSelfDraw'), true);
  assert.equal(run(`S.cultivation.log.some(e=>e.type==='enemy')`), false);
  run('handlePassClick()');
  assert.equal(run('S.cultivationAwaitingSelfDraw'), false);
  assert.equal(run('S.players[0].passedHu'), true);
  assert.equal(run(`S.cultivation.log.filter(e=>e.type==='enemy').length`), 1);
  run('handlePassClick()');
  assert.equal(run(`S.cultivation.log.filter(e=>e.type==='enemy').length`), 1);
});

test('winning after concealed kong suppresses due monster instead of forcing a pass', () => {
  const { run } = setup();
  run(`battleFixture();due();S.players[0].hand=tiles('W1 W1 W1 W1 W2 W3 W4 T1 T2 T3 B1 B2 B3 FE FE FE DC');
    S.wall=tiles('W7 W8 W9');S.deadWall=tiles('DC');doConcealedKong(0,'W1');document.getElementById('btnHu').onclick();`);
  assert.equal(run('S.cultivation.result.reason'), 'hu');
  assert.equal(run(`S.cultivation.log.some(e=>e.type==='enemy')`), false);
});

test('robbed added kong never casts added skill', () => {
  const { run } = setup();
  run(`battleFixture();S.players[0].melds=[{type:'pong',tiles:tiles('W1 W1 W1')}];
    S.players[0].hand=tiles('W1 T1 T2 T3 T4 T5 T6 B1 B2 B3 B4 B5 B6 DC');
    S.players[1].hand=tiles('W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC DC');
    offerAddedKong(0,0);`);
  assert.equal(run('!!S.pendingKong'), true);
  assert.equal(run('S.cultivation.seq'), 0);
  run('doWin(1,0,S.lastDiscard.tile,false)');
  assert.equal(run('S.winner'), 1);
  assert.equal(run('S.players[0].melds[0].type'), 'pong');
  assert.equal(run(`S.cultivation.log.some(e=>e.skillId==='W.added.1111')`), false);
});

test('replacement chain applies each public flower once and never increases discard clock', () => {
  const { run } = setup();
  run(`battleFixture();S.wall=tiles('W7 W8 W9 H1');S.deadWall=tiles('T5 H2');drawTile(0);`);
  assert.equal(run(`S.cultivation.players[0].flowers.join()`), 'H1,H2');
  assert.equal(run('S.cultivation.discardCount'), 0);
  assert.equal(run(`S.cultivation.log.filter(e=>e.type==='skill').length`), 2);
});

for (const [kind, flowers, other] of [['七搶一','H1 H2 H3 H4 H5 H6 H7','H8'],['八仙過海','H1 H2 H3 H4 H5 H6 H7 H8','']]) {
  test(`${kind} uses its flower finisher rather than common Hu`, () => {
    const { run } = setup();
    run(`battleFixture();S.players[0].flowers=tiles('${flowers}');S.players[1].flowers=${other ? `tiles('${other}')` : '[]'};
      for(let pid=0;pid<4;pid++)for(const tile of S.players[pid].flowers)cultivationEvent({type:'flower',pid,key:tileKey(tile)});
      resolveFlowerWin();`);
    assert.equal(run('S.cultivation.result.reason'), 'hu');
    assert.equal(run(`S.cultivation.log.some(e=>e.skillId==='formation.${other ? 'seven' : 'eight'}')`), true);
    assert.equal(run(`S.cultivation.log.some(e=>e.skillId==='finish.hu')`), false);
  });
}

test('killing monster on fourth discard resets its debt and aggro', () => {
  const { run } = setup();
  run(`battleFixture();S.players[0].hand=tiles('W1 W2 W4 W6 W8 T1 T2 T4 T6 T8 B1 B3 B5 B7 FE FS DC');
    S.cultivation.discardCount=3;S.cultivation.monster.hp=1;discard(0,S.players[0].hand[0]);`);
  assert.equal(run('S.cultivation.monster.id'), 2);
  assert.equal(run('S.cultivation.discardCount'), 0);
  assert.equal(run('S.cultivation.players.every(p=>p.aggro===0)'), true);
  assert.equal(run('S.cultivation.kills[0].pid'), 0);
  assert.equal(run(`S.cultivation.log.some(e=>e.type==='enemy')`), false);
});

test('draw and defeat finish without Hu damage', () => {
  const { run } = setup();
  run('battleFixture();endDraw()');
  assert.equal(run('S.cultivation.result.reason'), 'draw');
  assert.equal(run('S.cultivation.players.every(p=>p.damage===0)'), true);
  run(`battleFixture();due();Object.assign(S.cultivation.monster.nextAttack,{type:'all',charged:false,damage:1000});settleCultivationEnemy(false)`);
  assert.equal(run('S.phase'), 'end');
  assert.equal(run('S.cultivation.result.reason'), 'defeat');
  assert.equal(run('S.cultivation.result.ranking.length'), 4);
});

test('combat save preserves RNG, monster forecast, initial flowers and counters without replay', () => {
  const { run } = setup();
  run(`let saved=saveData();let before=JSON.stringify(S.cultivation);restoreGame(saved,'cultivation');`);
  assert.equal(run('JSON.stringify(S.cultivation)===before'), true);
  assert.equal(run(`gameSaveKey('auto')+'|'+gameSaveKey('manual')`), 'cultivationAutoSaveV1|cultivationManualSaveV1');
  run('let original=S');
  assert.throws(() => run(`restoreGame(saved,'normal')`), /模式不符/);
  assert.equal(run('S===original'), true);
  assert.throws(() => run(`saved.gameState.cultivation.monster.nextAttack.damage=-1;restoreGame(saved,'cultivation')`));
  assert.equal(run('S===original'), true);
});

test('cultivation AI decisions read own hand and public combat only', () => {
  const { run } = setup();
  run(`battleFixture();S.players[0].hand=tiles('DC DC W1 W2 W3 W4 W5 W6 T1 T2 T3 B4 B5 T5 T5 W9');S.lastDiscard={from:2,tile:tiles('DC')[0]};
    for(let pid=1;pid<4;pid++) {
      const p=S.players[pid];p.declaredListen=true;p.melds=[{type:'kong',concealed:true}];
      for(const prop of ['hand','waitKeys','drawnTile'])Object.defineProperty(p,prop,{get(){throw Error('hidden '+prop)}});
      Object.defineProperty(p.melds[0],'tiles',{get(){throw Error('hidden kong')}});
    }
    for(const field of ['wall','deadWall'])S[field]=new Proxy(S[field],{get(target,key){if(key==='length')return target.length;throw Error('hidden wall')}});
    canWinOn=()=>{throw Error('win oracle')};`);
  assert.doesNotThrow(() => run(`chooseAIReaction({pid:0,type:'pong',tile:S.lastDiscard.tile})`));
  run(`S.lastDiscard=null;S.players[0].hand.push(tiles('FN')[0])`);
  assert.doesNotThrow(() => run('aiChooseDiscard(0)'));
});

test('last active player falling to own discard damage ends the mahjong hand', () => {
  const { run } = setup();
  run(`battleFixture();S.players[0].hand=tiles('W1 W2 W4 W6 W8 T1 T2 T4 T6 T8 B1 B3 B5 B7 FE FS DC');
    for(let pid=1;pid<4;pid++){S.cultivation.players[pid].hp=0;S.cultivation.players[pid].weak=true;}
    S.cultivation.players[0].hp=10;S.cultivation.players[0].statuses.push({kind:'burn',negative:true,duration:2,value:35});
    discard(0,S.players[0].hand[0]);`);
  assert.equal(run('S.phase'),'end');
  assert.equal(run('S.waitReact'),null);
  assert.equal(run('S.cultivation.result.reason'),'defeat');
  assert.equal(run('S.players[0].discards.length'),1);
});

test('eight seeded complete games preserve all physical tiles and valid combat state; pending save resumes without replay', () => {
  let checked=0, restored=0, ended=0;
  for (let seed=1; seed<=8; seed++) {
    const { run, timers } = setup(seed);
    run('startNewHand(true)');
    for(let step=0;step<700;step++) {
      checked++;
      const state=JSON.parse(run('JSON.stringify(S)'));
      const physical=[...state.wall,...state.deadWall,...state.players.flatMap(p=>[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])];
      if(state.lastDiscard&&!physical.some(t=>t.id===state.lastDiscard.tile.id))physical.push(state.lastDiscard.tile);
      assert.equal(physical.length,144);assert.equal(new Set(physical.map(t=>t.id)).size,144);
      assert.equal(run('window.MahjongCultivationCombat.validate(S.cultivation)'),true);
      if(state.phase==='end'){ended++;break;}
      if(state.waitReact?.some(r=>r.pid===0)&&state.currentReactions) {
        if(restored<8){run(`{let saved=saveData();let before=JSON.stringify(S.cultivation);restoreGame(saved,'cultivation');if(JSON.stringify(S.cultivation)!==before)throw Error('replayed combat');}`);restored++;}
        run(`if(S.currentReactions.some(r=>r.type==='hu'))handleHuClick();else handlePassClick();`);
      } else if(!state.waitReact&&state.turn===0) {
        run(`{const me=S.players[0];if(me.hand.length===16-me.melds.length*3)stepNext();else if(canSelfDraw(0))doWin(0,-1,me.hand.at(-1),true);else discard(0,aiChooseDiscard(0));}`);
      } else {
        const entry=timers.entries().next().value;
        assert.ok(entry,`stalled seed ${seed} step ${step}`);timers.delete(entry[0]);entry[1]();
      }
      assert.ok(step<699,'cultivation game did not finish');
    }
  }
  assert.equal(ended,8);assert.ok(restored>0);
  console.log(`Cultivation integration: ${ended} games, ${checked} states, ${restored} pending restores`);
});
