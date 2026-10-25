const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cultivation-combat.js');
const Skills = require('../cultivation-skills.js');

function threatened(hp = 200) {
  const state = C.create(123);
  state.monster.hp = state.monster.maxHp = 10000;
  state.monster.element = 'wood';
  state.monster.shield = 0;
  state.monster.statuses = [];
  state.monster.nextAttack = { type: 'single', charged: true, damage: 240, ailment: null, cancelled: false, controlUsed: false, sealAilment: false };
  state.players[0].hp = hp;
  state.players[0].aggro = 1000;
  return state;
}

test('AI values a known lethal charge interruption and guard/counter', () => {
  for (const id of ['B.chow.567', 'B.pong.333']) {
    assert.ok(C.estimate(threatened(), 0, Skills.get(id)) >= 100, id);
  }
});

test('AI values its pending DoT and delayed attack instead of zero', () => {
  for (const id of ['W.pong.111', 'W.concealed.1111']) {
    assert.ok(C.estimate(threatened(1000), 0, Skills.get(id)) > 0, id);
  }
});

test('AI forecast is deterministic, preserves state and only rewards applicable defense', () => {
  const state = threatened(1000), before = JSON.stringify(state);
  const skill = Skills.get('B.pong.333');
  const value = C.estimate(state, 0, skill);
  assert.equal(C.estimate(state, 0, skill), value);
  assert.equal(JSON.stringify(state), before);
  state.monster.nextAttack.cancelled = true;
  assert.ok(C.estimate(state, 0, skill) < value);
});

test('a forecast handles kills and existing DoTs without charging twice', () => {
  let state = threatened(1000);
  state = C.apply(state, { id: 1, type: 'meld', pid: 0, action: 'pong', key: 'W1' }).state;
  assert.ok(Math.abs(C.estimate(state, 0, Skills.get('W.pong.111'))) < 1, 'refresh with identical remaining ticks has no immediate gain');
  state.monster.hp = 1;
  assert.ok(Number.isFinite(C.estimate(state, 0, Skills.get('W.chow.789'))));
});

test('tuned shield and parry counters score once and create damage-matched aggro', () => {
  for (const [action, keys, expected] of [['chow', ['W5', 'W6', 'W7'], 88], ['pong', ['B3', 'B3', 'B3'], 194]]) {
    let state = C.apply(threatened(1000), { id: 1, type: 'meld', pid: 0, action, keys }).state;
    state.enemyDue = state.monster.id; state.discardCount = 4;
    const result = C.apply(state, { id: 2, type: 'enemy', monsterId: state.monster.id });
    assert.deepEqual(result.effects.filter(e => e.type === 'damage').map(e => [e.pid, e.amount]), [[0, expected]]);
    assert.equal(result.state.players[0].aggro - state.players[0].aggro, expected);
    const replay = C.apply(result.state, { id: 2, type: 'enemy', monsterId: state.monster.id });
    assert.equal(replay.state.players[0].damage, expected);
    assert.deepEqual(replay.effects, []);
  }
});
