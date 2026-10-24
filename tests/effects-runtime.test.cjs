const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../feedback-effects.js'), 'utf8');

function effectsPlayer() {
  const documentEvents = new Map(), windowEvents = new Map(), timers = new Map();
  const visible = new Set();
  let sequence = 0;
  const makeNode = () => ({
    dataset: {}, style: { setProperty() {} },
    setAttribute() {}, append() {}, insertAdjacentHTML() {},
    remove() { visible.delete(this); }
  });
  const document = {
    hidden: false, body: { append: node => visible.add(node) },
    createElement: makeNode, querySelector: () => null,
    addEventListener: (name, callback) => documentEvents.set(name, callback)
  };
  const window = {
    innerWidth: 390, innerHeight: 844,
    setTimeout: callback => { timers.set(++sequence, callback); return sequence; },
    clearTimeout: id => timers.delete(id),
    addEventListener: (name, callback) => windowEvents.set(name, callback)
  };
  vm.runInNewContext(source, { window, document });
  return { api: window.MahjongEffects, document, documentEvents, windowEvents, visible, timers };
}

test('hidden ordinary and special events create no animation and do not replay on return', () => {
  const { api, document, visible, timers } = effectsPlayer();
  const detail = { fan: 8, categories: ['八仙過海'] };
  document.hidden = true;
  api.show('flower');
  assert.equal(visible.size, 0);
  api.showWin('selfDraw', detail);
  assert.equal(visible.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(api.getState().active, null);
  document.hidden = false;
  api.showWin('selfDraw', detail);
  assert.equal(visible.size, 0, 'a result settled while hidden must stay consumed');
  api.showWin('win', { fan: 8, categories: ['大三元'] });
  assert.equal(api.getState().special, '大三元', 'new foreground results still play');
  assert.equal(visible.size, 1);
});

test('switching to background clears active animation and its timer in every style', () => {
  for (const style of ['jade', 'ink', 'neon']) {
    for (const reduced of [false, true]) {
      const { api, document, documentEvents, visible, timers } = effectsPlayer();
      api.setStyle(style);
      api.setReduced(reduced);
      const detail = { fan: 8, categories: ['大三元'] };
      api.showWin('win', detail);
      assert.equal(visible.size, 1);
      assert.equal(timers.size, 1);
      document.hidden = true;
      documentEvents.get('visibilitychange')?.();
      assert.equal(visible.size, 0, `${style}, reduced ${reduced}: no stale effect`);
      assert.equal(timers.size, 0);
      assert.equal(api.getState().active, null);
      document.hidden = false;
      documentEvents.get('visibilitychange')?.();
      api.showWin('win', detail);
      assert.equal(visible.size, 0);
    }
  }
});

test('pagehide clears active effects even without a visibilitychange event', () => {
  const { api, windowEvents, visible, timers } = effectsPlayer();
  api.show('flower');
  windowEvents.get('pagehide')?.();
  assert.equal(visible.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(api.getState().active, null);
});

test('foreground visibility notifications preserve a valid active celebration', () => {
  const { api, documentEvents, visible, timers } = effectsPlayer();
  api.showWin('selfDraw', { fan: 8, categories: ['清一色'] });
  documentEvents.get('visibilitychange')?.();
  assert.equal(visible.size, 1);
  assert.equal(timers.size, 1);
  assert.equal(api.getState().special, '清一色');
});
