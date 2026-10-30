const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];

function openingGame(seed = 3, withOpening = true) {
  const nodes = new Map(), timers = new Map(), records = [];
  let timerId = 0, active = null, cancelCount = 0;
  const makeNode = () => {
    const classes = new Set();
    return {
      style: {}, dataset: {}, disabled: false, value: '', options: [],
      innerHTML: '', textContent: '',
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle(name, value) {
          if (value ?? !classes.has(name)) classes.add(name);
          else classes.delete(name);
        }
      },
      appendChild() {}, setAttribute() {}, removeAttribute() {}, remove() {},
      focus() {}, addEventListener() {}, querySelectorAll: () => []
    };
  };
  const opening = {
    play(detail) {
      const record = { detail, cancelled: false };
      records.push(record);
      active = record;
      record.promise = new Promise(resolve => { record.resolve = resolve; });
      return record.promise;
    },
    finish(reason = 'skipped') {
      if (!active) return;
      const record = active;
      active = null;
      record.resolve({ status: reason, phase: 'deal' });
    },
    cancel() {
      cancelCount++;
      if (active) active.cancelled = true;
      // Keep the old promise unresolved so a late success can be tested explicitly.
      active = null;
    },
    getState: () => ({ active: active !== null })
  };
  const context = vm.createContext({
    console, structuredClone, Uint32Array,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id), setInterval() {},
    document: {
      hidden: false, visibilityState: 'visible',
      getElementById: id => {
        if (!nodes.has(id)) nodes.set(id, makeNode());
        return nodes.get(id);
      },
      createElement: makeNode, head: makeNode(), body: makeNode(),
      addEventListener() {}, querySelector: () => null, querySelectorAll: () => []
    },
    window: {
      addEventListener() {}, AudioContext: function () {},
      crypto: { getRandomValues(values) { values.fill(7); return values; } },
      ...(withOpening ? { MahjongOpening: opening } : {})
    },
    confirm: () => true
  });
  vm.runInContext(`let seed=${seed}; Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};`, context);
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  run(`
    const originalRenderAll = renderAll;
    renderAll = () => {};
    let recordedLogs = [];
    log = message => recordedLogs.push(message);
    playSound = () => {};
    playVoice = () => {};
    showEffect = () => {};
    clearAutoSave = async () => {};
    function saveData() {
      return {gameState:clone(S),rules:clone(RULES),seatNames:seatNames.slice(),
        randomNames:randomNames?.slice(),customPlayerName,dealerStreak};
    }
    function physicalIds() {
      return [...S.wall,...S.deadWall,...S.players.flatMap(p =>
        [...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])].map(t=>t.id);
    }
    function testTiles(keys) {
      const pool=generateTiles();
      return keys.split(' ').map(key=>pool.splice(pool.findIndex(t=>tileKey(t)===key),1)[0]);
    }
    startNewHand(true);
  `);
  return {
    run, nodes, timers, opening, records,
    get cancelCount() { return cancelCount; },
    async finish(reason = 'skipped') {
      opening.finish(reason);
      await Promise.resolve();
      await Promise.resolve();
    }
  };
}

function stateJSON(game) {
  return game.run('JSON.stringify(S)');
}

function assertConserved(game) {
  assert.equal(game.run('physicalIds().length'), 144);
  assert.equal(game.run('new Set(physicalIds()).size'), 144);
  assert.equal(game.run('S.players.reduce((sum,p)=>sum+p.points,0)'), 400000);
}

test('without the optional opening module, dealing remains synchronous', () => {
  const game = openingGame(3, false);
  assert.equal(game.run('S.phase'), 'play');
  assertConserved(game);
});

test('opening keeps a complete dealt hand locked until the presentation finishes', async () => {
  const game = openingGame();
  assert.equal(game.records.length, 1);
  assert.equal(game.run('S.phase'), 'deal');
  assert.equal(game.opening.getState().active, true);
  assert.equal(game.timers.size, 0, 'no AI or dealer announcement before completion');
  assertConserved(game);
  const before = game.run('JSON.stringify({ids:physicalIds(),points:S.players.map(p=>p.points)})');
  await game.finish();
  assert.equal(game.run('S.phase'), 'play');
  assert.equal(game.opening.getState().active, false);
  assert.equal(game.run('JSON.stringify({ids:physicalIds(),points:S.players.map(p=>p.points)})'), before);
});

test('completion and repeated skip schedule the AI opening exactly once', async () => {
  const game = openingGame();
  assert.notEqual(game.run('S.dealer'), 0, 'fixture has an AI dealer');
  game.run('let aiStarts=0; stepAI=()=>aiStarts++;');
  await game.finish();
  const scheduled = game.timers.size;
  await game.finish();
  game.records[0].resolve({ status: 'completed', phase: 'deal' });
  await Promise.resolve();
  assert.equal(game.timers.size, scheduled);
  for (const [id, callback] of [...game.timers]) {
    game.timers.delete(id);
    callback();
  }
  assert.equal(game.run('aiStarts'), 1);
});

test('normal completion resumes play but a cancelled result does not', async () => {
  const completed = openingGame();
  await completed.finish('completed');
  assert.equal(completed.run('S.phase'), 'play');
  const cancelled = openingGame();
  await cancelled.finish('cancelled');
  assert.equal(cancelled.run('S.phase'), 'deal');
  assert.equal(cancelled.timers.size, 0);
});

test('presentation does not change the deck, points, or game random stream', async () => {
  const plain = openingGame(37, false);
  const animated = openingGame(37);
  await animated.finish();
  assert.equal(stateJSON(animated), stateJSON(plain));
  assert.equal(animated.run('Math.random()'), plain.run('Math.random()'));
  assert.equal(animated.run("recordedLogs.find(line=>line.startsWith('🎲'))"),
    plain.run("recordedLogs.find(line=>line.startsWith('🎲'))"));
});

test('first opening displays the same two dice that actually selected the dealer', () => {
  const game = openingGame();
  const diceLog = game.run("recordedLogs.find(line=>line.startsWith('🎲'))");
  const match = diceLog.match(/擲骰：(\d) \+ (\d) = (\d)/);
  assert.ok(match);
  assert.deepEqual(Array.from(game.records[0].detail.dice), [Number(match[1]), Number(match[2])]);
  assert.equal(game.run('S.dealer'), (Number(match[3]) - 1) % 4);
});

test('restarting before the AI opening ends preserves the original random stream', async () => {
  const plain = openingGame(3, false);
  const animated = openingGame(3);
  assert.notEqual(plain.run('S.dealer'), 0);
  plain.run('startNewHand(true);');
  animated.run('startNewHand(true);');
  await animated.finish();
  assert.ok(stateJSON(animated) === stateJSON(plain),
    'cancelling an unfinished opening must not change the next dice, names, or wall');
  assert.equal(animated.run('Math.random()'), plain.run('Math.random()'));
});

test('next hand also opens without consuming extra game randomness or resetting scores', async () => {
  const plain = openingGame(37, false);
  const animated = openingGame(37);
  await animated.finish();
  for (const game of [plain, animated]) {
    game.run('cancelGameTimers(); S.phase="end"; S.winner=S.dealer; S.players[0].points+=1000; S.players[1].points-=1000; startNewHand();');
  }
  assert.equal(animated.records.length, 2);
  assert.equal(animated.run('S.phase'), 'deal');
  await animated.finish();
  assert.equal(stateJSON(animated), stateJSON(plain));
  assert.equal(animated.run('Math.random()'), plain.run('Math.random()'));
  assertConserved(animated);
});

test('cancel does not finish the hand, and a late completion cannot resume it', async () => {
  const game = openingGame();
  const old = game.records[0];
  game.run('cancelGameTimers();');
  const before = stateJSON(game);
  old.resolve({ status: 'completed', phase: 'deal' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(game.opening.getState().active, false);
  assert.equal(stateJSON(game), before);
  assert.equal(game.run('S.phase'), 'deal');
  assert.equal(game.timers.size, 0);
});

test('restarting invalidates the old opening even if it resolves after the new one starts', async () => {
  const game = openingGame();
  const old = game.records[0];
  game.run('startNewHand(true);');
  assert.equal(game.records.length, 2);
  const next = stateJSON(game);
  old.resolve({ status: 'completed', phase: 'deal' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(stateJSON(game), next);
  assert.equal(game.run('S.phase'), 'deal');
  assert.equal(game.timers.size, 0);
  assert.equal(game.opening.getState().active, true);
  await game.finish();
  assert.equal(game.run('S.phase'), 'play');
  assertConserved(game);
});

test('invalid restore leaves the current opening and state intact', async () => {
  const game = openingGame();
  const before = stateJSON(game), cancels = game.cancelCount;
  assert.throws(() => game.run('restoreGame({gameState:{players:[]}});'));
  assert.equal(stateJSON(game), before);
  assert.equal(game.cancelCount, cancels);
  assert.equal(game.opening.getState().active, true);
  await game.finish();
  assert.equal(game.run('S.phase'), 'play');
});

test('valid restore cancels opening and ignores its stale completion', async () => {
  const game = openingGame();
  await game.finish();
  game.run('cancelGameTimers(); const saved=saveData(); startNewHand(true);');
  const old = game.records.at(-1);
  game.run('restoreGame(saved);');
  const restored = stateJSON(game), scheduled = game.timers.size;
  old.resolve({ status: 'completed', phase: 'deal' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(game.opening.getState().active, false);
  assert.equal(stateJSON(game), restored);
  assert.equal(game.timers.size, scheduled);
  assert.equal(game.run('S.phase'), 'play');
  assertConserved(game);
});

test('manual and automatic saves cannot open storage during the deal phase', async () => {
  const game = openingGame();
  game.run('let storageOpens=0; initDB=async()=>{storageOpens++;throw new Error("Opening must not write storage");};');
  assert.equal(await game.run('writeGameSave(MANUAL_SAVE_KEY)'), false);
  assert.equal(await game.run('saveGame()'), false);
  await game.run('autoSaveGame()');
  assert.equal(game.run('storageOpens'), 0);
  assert.equal(game.run('S.phase'), 'deal');
});

test('stepNext cannot draw for a human or schedule AI during opening', () => {
  for (const turn of [0, 1]) {
    const game = openingGame();
    game.run(`S.turn=${turn};`);
    const before = stateJSON(game);
    game.run('stepNext();');
    assert.equal(stateJSON(game), before, `turn ${turn}`);
    assert.equal(game.timers.size, 0, `turn ${turn}`);
  }
});

test('stepAI and direct discard cannot alter a hand during opening', () => {
  const game = openingGame();
  const before = stateJSON(game);
  game.run('stepAI(); discard(S.turn,S.players[S.turn].hand[0]);');
  assert.equal(stateJSON(game), before);
  assert.equal(game.timers.size, 0);
});

test('human tile, win, ready, and kong handlers cannot act during opening', () => {
  const game = openingGame();
  game.run(`
    S.turn=0;
    S.players[0].hand=testTiles('W1 W1 W1 W1 W2 W3 W4 T1 T2 T3 B1 B2 B3 FE FE FE DC');
    S.players[0].drawnTile=S.players[0].hand.at(-1);
  `);
  const before = stateJSON(game);
  game.run(`
    onClickYourTile(0);
    document.getElementById('btnHu').onclick();
    document.getElementById('btnListen').onclick();
    document.getElementById('btnKong').onclick();
  `);
  assert.equal(stateJSON(game), before);
  assert.equal(game.timers.size, 0);
});

test('rendering exposes no enabled game or save buttons during opening', () => {
  const game = openingGame();
  game.run(`
    S.turn=0;
    S.players[0].hand=testTiles('W1 W1 W1 W1 W2 W3 W4 T1 T2 T3 B1 B2 B3 FE FE FE DC');
    originalRenderAll();
  `);
  for (const id of ['btnHu', 'btnChow', 'btnPong', 'btnKong', 'btnPass', 'btnListen', 'saveGameBtn']) {
    assert.equal(game.nodes.get(id).disabled, true, `${id} must be disabled`);
  }
  const hand = game.nodes.get('yourHand').innerHTML;
  const buttons = hand.match(/<button\b[^>]*>/g) || [];
  assert.equal(buttons.length, 17);
  assert.ok(buttons.every(button => /\bdisabled\b/.test(button)));
});

test('opening flower win settles once only after completion and preserves 144 tiles and scores', async () => {
  const game = openingGame();
  game.run(`
    const pool=generateTiles();
    const flowers=pool.splice(pool.findIndex(t=>t.suit===SUIT_H),8);
    for(let pid=0;pid<4;pid++) {
      S.players[pid].hand=pool.splice(0,pid===S.dealer?17:16);
      S.players[pid].flowers=pid===S.dealer?flowers:[];
      S.players[pid].drawnTile=pid===S.dealer?S.players[pid].hand.at(-1):null;
    }
    S.deadWall=pool.splice(0,16);S.wall=pool;
  `);
  assert.equal(game.run('S.phase'), 'deal');
  assertConserved(game);
  await game.finish();
  assert.equal(game.run('S.phase'), 'end');
  assert.equal(game.run('S.flowerWin.kind'), '八仙過海');
  const settled = stateJSON(game);
  await game.finish();
  assert.equal(stateJSON(game), settled);
  assertConserved(game);
});
