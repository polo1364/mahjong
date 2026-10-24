const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./game-harness.cjs');

test('render memo preserves waiting tiles and recomputes when hand or meld contents change', () => {
  const { run } = game();
  run(`const p = S.players[0]; p.declaredListen = false;
    p.hand = tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC'); p.melds = [];
    const originalListening = isListening; let calls = 0;
    isListening = (...args) => { calls++; return originalListening(...args); };
    updatePlayerWaits(p);`);
  assert.equal(run('p.waitKeys.join()'), 'DC');
  run('const firstCalls = calls; p.hand.reverse(); updatePlayerWaits(p);');
  assert.equal(run('calls'), run('firstCalls'));
  run("p.waitKeys.push('W9'); updatePlayerWaits(p);");
  assert.equal(run('p.waitKeys.join()'), 'DC', 'caller cannot mutate memoized results');
  run("p.hand[p.hand.findIndex(t => tileKey(t) === 'DC')] = tiles('DF')[0]; updatePlayerWaits(p);");
  assert.equal(run('p.waitKeys.join()'), 'DF');
  assert.ok(run('calls > firstCalls'));
  run("p.hand = p.hand.filter(t => !['W1','W2','W3'].includes(tileKey(t))); p.melds = [{type:'chow',tiles:tiles('W1 W2 W3')}]; updatePlayerWaits(p);");
  assert.equal(run('p.waitKeys.join()'), 'DF');
  run("p.melds[0].tiles = tiles('W1 W2 W4'); updatePlayerWaits(p);");
  assert.equal(run('p.waitKeys.length'), 0, 'an invalid changed meld is not treated as the cached valid one');
});

test('render memo keeps locked waits and all legal discard listening options', () => {
  const { run } = game();
  run(`const p = S.players[0]; p.declaredListen = false; p.melds = [];
    p.hand = tiles('W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE DC DF');
    updatePlayerWaits(p);`);
  assert.equal(run("[...renderedWaits.get(p).listeningDiscards].sort().join()"), 'DC,DF');
  run("p.declaredListen = p.tingLocked = true; p.waitKeys = ['DC']; p.hand.pop(); updatePlayerWaits(p);");
  assert.equal(run('p.waitKeys.join()'), 'DC');
  run('p.declaredListen = p.tingLocked = false; updatePlayerWaits(p);');
  assert.equal(run('p.waitKeys.join()'), 'DC');
});
