const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cultivation-combat.js');
const skills = require('../cultivation-skills.js');

function fixture() {
  const state = C.create(123);
  state.monster.element = 'earth';
  state.monster.hp = state.monster.maxHp = 20000;
  state.monster.armor = 0;
  state.monster.shield = 0;
  return state;
}
function send(state, event) { return C.apply(state, { id: state.seq + 1, ...event }).state; }
function cast(state, id, pid = 0) {
  const skill = skills.get(id);
  const keys = ['W', 'T', 'B'].includes(skill.family) ? [...skill.combo].map(rank => skill.family + rank) : undefined;
  return send(state, { type: 'meld', pid, action: skill.action, key: skill.combo, keys });
}
function enemy(state, type = 'single', damage = 160) {
  state.enemyDue = state.monster.id;
  state.discardCount = 4;
  state.monster.nextAttack = { type, damage, charged: false, ailment: null, cancelled: false, controlUsed: false, sealAilment: false };
  return send(state, { type: 'enemy' });
}

test('伏虎待機 preserves the promised penetration on its guard counter', () => {
  let state = fixture();
  state.monster.armor = 0.8;
  state.monster.element = 'metal';
  state = cast(state, 'FW.concealed');
  state = enemy(state);
  const counter = skills.get('FW.concealed').effects.find(effect => effect.kind === 'guardCounter');
  assert.equal(counter.amount, 343);
  assert.equal(counter.penetration, 0.7);
  assert.equal(state.players[0].damage, Math.round(counter.amount * (1 - 0.8 * (1 - counter.penetration))));
});

test('a previously placed delayed fire mark still deals half damage while its owner is weak', () => {
  let state = cast(fixture(), 'W.concealed.1111');
  state.players[0].hp = 0;
  state.players[0].weak = true;
  state = enemy(state);
  assert.equal(state.players[0].damage, 170);
  assert.equal(state.players[0].hp, 0);
  assert.equal(state.players[0].statuses.some(status => status.kind === 'mark'), false);
});

test('consuming the last shield triggers 太虛劍匣 once without a phantom surviving shield', () => {
  let state = cast(fixture(), 'B.concealed.9999');
  state = cast(state, 'W.added.5555');
  assert.equal(state.players[0].shield, 0);
  assert.equal(state.players[0].hits, 2, 'the conversion and shield-ending strike each occur once');
  assert.equal(state.players[0].statuses.some(status => status.kind === 'shieldEndDamage'), false);
});

test('a frozen counter and another players killing counter cannot delay the next monster', () => {
  let state = cast(fixture(), 'T.concealed.3333', 0);
  state = cast(state, 'W.exposed.7777', 1);
  state.monster.hp = 1;
  state = enemy(state, 'all');
  assert.equal(state.monster.id, 2);
  assert.equal(state.postAttackControl, undefined);
  assert.equal(state.discardCount, 0);
  assert.equal(state.enemyDue, null);
});

test('last surviving player falling to an own-turn ailment ends in defeat after turn effects', () => {
  let state = fixture();
  for (let pid = 1; pid < 4; pid++) {
    state.players[pid].hp = 0;
    state.players[pid].weak = true;
  }
  state.players[0].hp = 10;
  state.players[0].statuses.push({ kind: 'burn', negative: true, duration: 2, value: 35 });
  state = send(state, { type: 'discard', pid: 0, key: 'T1' });
  assert.equal(state.players.every(player => player.weak), true);
  assert.equal(state.ended, true);
  assert.equal(state.result.reason, 'defeat');
});

test('the fixed delayed shield strike retains ownership and cannot consume a next-skill buff', () => {
  let state = cast(fixture(), 'B.concealed.9999', 2);
  state = cast(state, 'W.chow.345', 2);
  for (let index = 0; index < 3; index++) state = send(state, { type: 'discard', pid: 2, key: 'T1' });
  assert.ok(state.players[2].damage > 150);
  assert.ok(state.players[2].statuses.some(status => status.kind === 'nextDamage'));
  assert.deepEqual(state.players.filter(player => player.pid !== 2).map(player => player.damage), [0, 0, 0]);
});

test('丹陽爆 armor break accepts a real ongoing self damage boost, not only next-skill boosts', () => {
  let state = cast(fixture(), 'B.added.8888');
  state = cast(state, 'W.exposed.3333');
  assert.equal(state.players[0].damage, 350);
  assert.equal(state.monster.statuses.find(status => status.kind === 'armor').value, 0.3);
  let noBoost = cast(fixture(), 'W.pong.888');
  noBoost = cast(noBoost, 'W.exposed.3333');
  assert.equal(noBoost.monster.statuses.some(status => status.kind === 'armor'), false, 'an empty cleanse supplies no damage boost');
});

test('碎甲焚身 consumes all remaining shield while its damage remains capped', () => {
  let state = fixture();
  state.players[0].shield = 800;
  state.players[0].shieldTurns = 4;
  state = cast(state, 'W.added.5555');
  assert.equal(state.players[0].shield, 0);
  assert.equal(state.players[0].damage, 360);
  assert.ok(state.players[0].statuses.some(status => status.kind === 'reduceDamage'));
});
