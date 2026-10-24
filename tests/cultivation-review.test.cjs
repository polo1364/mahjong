const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cultivation-combat.js');
const skills = require('../cultivation-skills.js');

function fixture() {
  const state = C.create(123);
  state.monster.hp = state.monster.maxHp = 100000;
  state.monster.element = 'earth';
  state.monster.armor = 0;
  return state;
}

function send(state, event) {
  return C.apply(state, { id: state.seq + 1, ...event }).state;
}

function enemy(state) {
  state.enemyDue = state.monster.id;
  state.discardCount = 4;
  state.monster.nextAttack = {
    type: 'single', damage: 160, charged: false, ailment: null,
    cancelled: false, controlUsed: false, sealAilment: false
  };
  return send(state, { type: 'enemy' });
}

test('two-action attack reduction survives an earlier one-charge reduction', () => {
  let state = send(fixture(), { type: 'meld', pid: 0, action: 'pong', key: 'T3' });
  state = send(state, { type: 'meld', pid: 1, action: 'exposed', key: 'FW' });
  state = enemy(state);
  assert.ok(state.monster.statuses.some(status => status.kind === 'attack' && status.duration === 1),
    '虎嘯鎮邪 must still weaken the second monster action');
});

test('armor break created after an enemy attack retains its two future actions', () => {
  let state = send(fixture(), { type: 'meld', pid: 0, action: 'concealed', key: 'B2' });
  state = enemy(state);
  assert.equal(state.monster.statuses.find(status => status.kind === 'armor')?.duration, 2,
    '藏鋒蝕骨 applies armor break after this attack, so this attack must not spend its duration');
});

for (const [id, penetration] of [['FW.concealed', '70%'], ['B.concealed.2222', '70%'], ['W.concealed.2222', '60%']]) {
  test(`${id} public numerical reference includes its ${penetration} penetration`, () => {
    assert.ok(skills.details(id).join('；').includes('穿透 ' + penetration));
  });
}

test('public reference identifies five-element hits and attack-skill-only triggers', () => {
  assert.deepEqual(skills.details('formation.eight'), [
    '金屬性，傷害 300', '木屬性，傷害 300', '水屬性，傷害 300', '火屬性，傷害 300', '土屬性，傷害 300'
  ]);
  assert.match(skills.details('W.pong.666').join('；'), /40%.*限 1 次.*僅攻擊技能觸發/);
  assert.match(skills.details('B.added.7777').join('；'), /75%.*僅攻擊技能觸發/);
  assert.match(skills.details('W.pong.111').join('；'), /後續攻擊技能命中可延長 1 次/);
  assert.match(skills.details('B.added.8888').join('；'), /生命≤35% 時生效/);
  assert.match(skills.details('B.concealed.1111').join('；'), /仇恨倍率 50%/);
  assert.match(skills.details('B.added.4444').join('；'), /吸血 50%，虛弱時吸血 120%/);
});
