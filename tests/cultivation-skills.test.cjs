const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const skills = require('../cultivation-skills.js');

const actions = { chow: 21, pong: 34, exposed: 34, concealed: 34, added: 34, flower: 8, formation: 4, finish: 1 };
const honors = ['FE', 'FS', 'FW', 'FN', 'DC', 'DF', 'DB'];

test('the approved catalogue contains all 169 skills and the common Hu finisher', () => {
  assert.equal(skills.all.length, 170);
  assert.equal(new Set(skills.all.map(skill => skill.id)).size, 170);
  assert.equal(new Set(skills.all.map(skill => skill.name)).size, 170);
  for (const [action, count] of Object.entries(actions)) assert.equal(skills.all.filter(skill => skill.action === action).length, count, action);
  for (const family of ['W', 'T', 'B']) assert.equal(skills.all.filter(skill => skill.family === family).length, 43);
  assert.equal(skills.all.filter(skill => skill.family === 'honor').length, 28);
  assert.equal(skills.all.filter(skill => skill.finisher).length, 3);
});

test('every legal numeric chow, pong and three kong variants resolve to separate skills', () => {
  for (const suit of ['W', 'T', 'B']) {
    for (let first = 1; first <= 7; first++) {
      const keys = [first + 2, first, first + 1].map(rank => suit + rank);
      const found = skills.find('chow', keys);
      assert.equal(found.combo, '' + first + (first + 1) + (first + 2));
      assert.equal(found.family, suit);
      assert.equal(found, skills.find('chow', keys.map(key => ({ key }))));
    }
    for (let rank = 1; rank <= 9; rank++) {
      const found = ['pong', 'exposed', 'concealed', 'added'].map(action => {
        const skill = skills.find(action, suit + rank);
        assert.ok(skill, action + suit + rank);
        assert.equal(skill, skills.find(action, Array(action === 'pong' ? 3 : 4).fill(suit + rank)));
        assert.equal(skill, skills.get(skill.id));
        return skill;
      });
      assert.equal(new Set(found.map(skill => skill.name)).size, 4);
      assert.equal(new Set(found.map(skill => JSON.stringify(skill.effects))).size, 4, suit + rank + ' must not simply rename one generic effect');
    }
  }
});

test('all honors have four skills and every unique flower has one reveal skill', () => {
  for (const key of honors) {
    for (const action of ['pong', 'exposed', 'concealed', 'added']) assert.equal(skills.find(action, key).id, key + '.' + action);
    assert.equal(skills.find('chow', [key, key, key]), null);
  }
  for (let number = 1; number <= 8; number++) {
    const key = 'H' + number;
    assert.equal(skills.find('flower', key).id, key + '.flower');
    assert.equal(skills.find('pong', key), null);
    assert.equal(skills.find('concealed', [key, key, key, key]), null);
  }
  assert.equal(skills.find('formation', ['H3', 'H2', 'H4', 'H1']).id, 'formation.seasons');
  assert.equal(skills.find('formation', ['H8', 'H5', 'H6', 'H7']).id, 'formation.gentlemen');
  for (const name of ['seven', 'eight']) assert.equal(skills.find('formation', name).finisher, true);
});

test('lookup rejects invalid or mixed melds without accepting prototype properties', () => {
  const invalid = [null, undefined, '', '__proto__', 'constructor', 'W0', 'W10', 'H9', 'BACK', { key: '__proto__' }];
  for (const value of invalid) {
    assert.equal(skills.find('pong', value), null);
    assert.equal(skills.get(value), null);
    assert.equal(skills.elementFor(value), 'neutral');
  }
  for (const keys of [[], ['W1'], ['W1', 'W2'], ['W1', 'W2', 'W4'], ['W1', 'W1', 'W2'], ['W1', 'T2', 'W3'], ['W1', 'W2', 'W3', 'W4'], ['FE', 'FS', 'FW']]) assert.equal(skills.find('chow', keys), null);
  assert.equal(skills.find('pong', ['W1', 'W1', 'W2']), null);
  assert.equal(skills.find('pong', ['W1', 'W1', 'W1', 'W1']), null);
  assert.equal(skills.find('added', ['W1', 'W1', 'W1']), null);
  assert.equal(skills.find('formation', ['H1', 'H1', 'H3', 'H4']), null);
  assert.equal(skills.find('flower', ['H1', 'H1']), null);
  assert.equal(skills.find('unknown', 'W1'), null);
  assert.equal(skills.elementFor('W'), 'neutral');
});

test('element lookup keeps naming separate and covers all 42 physical tile kinds', () => {
  const names = require('../tile-names.js');
  for (const tile of names.entries) assert.ok(['fire', 'water', 'metal', 'wood', 'earth'].includes(skills.elementFor(tile.key)), tile.key);
  for (let rank = 1; rank <= 9; rank++) {
    assert.equal(skills.elementFor('W' + rank), 'fire');
    assert.equal(skills.elementFor('T' + rank), 'water');
    assert.equal(skills.elementFor('B' + rank), 'metal');
  }
  assert.equal(skills.elementFor('DB'), 'earth');
  assert.equal(skills.elementFor('DF'), 'wood');
});

test('all effects are data-only, bounded and explicit about duration', () => {
  const allowed = new Set(['damage', 'heal', 'shield', 'aggro', 'buff', 'debuff', 'dot', 'cleanse', 'control', 'removeBuff', 'consumeDot', 'convert', 'mark']);
  function visit(effect, id) {
    assert.ok(allowed.has(effect.op), id + ' ' + effect.op);
    assert.ok(!('target' in effect), 'support never targets another player');
    if (['buff', 'debuff', 'shield', 'mark'].includes(effect.op)) assert.ok(Number.isInteger(effect.duration) && effect.duration > 0 && effect.duration <= 7, id);
    if (effect.op === 'dot') assert.ok(Number.isInteger(effect.ticks) && effect.ticks > 0);
    if (effect.scale) {
      assert.ok(Number.isFinite(effect.scale.ratio) && effect.scale.ratio >= 0);
      assert.ok(Number.isFinite(effect.scale.cap) && effect.scale.cap > 0);
    }
    if (effect.op === 'convert') assert.ok(effect.cap > 0 && effect.ratio > 0 && effect.ratio <= 1);
    if (effect.charges != null) assert.ok(Number.isInteger(effect.charges) && effect.charges > 0);
    if (effect.onKill) effect.onKill.forEach(child => visit(child, id));
    if (effect.debuff) visit(effect.debuff, id);
    for (const value of Object.values(effect)) if (typeof value === 'number') assert.ok(Number.isFinite(value) && value >= 0, id);
  }
  for (const skill of skills.all) {
    assert.ok(skill.description.length > 5);
    assert.ok(skill.effects.length > 0);
    assert.ok(skill.power > 0);
    skill.effects.forEach(effect => visit(effect, skill.id));
    assert.deepEqual(JSON.parse(JSON.stringify(skill)), skill);
  }
});

test('key approved mechanics are represented by actual independent operations', () => {
  const effects = id => skills.get(id).effects;
  assert.ok(effects('W.exposed.1111').some(effect => effect.op === 'consumeDot' && effect.kind === 'burn'));
  assert.ok(effects('W.added.1111').some(effect => effect.op === 'dot' && effect.refresh));
  assert.ok(effects('W.concealed.4444').some(effect => effect.kind === 'deathGuard'));
  assert.ok(effects('W.added.5555').some(effect => effect.op === 'convert' && effect.source === 'shield'));
  assert.ok(effects('T.added.8888').some(effect => effect.op === 'convert' && effect.source === 'aggro'));
  assert.ok(effects('T.concealed.7777').some(effect => effect.kind === 'nextPenetration' && effect.value === 1));
  assert.ok(effects('B.pong.222').some(effect => effect.op === 'removeBuff' && effect.kind === 'defense'));
  assert.ok(effects('B.added.6666').some(effect => effect.trigger === 'enemySingleOther'));
  assert.ok(effects('DB.added').some(effect => effect.scale && effect.scale.source === 'shield'));
  assert.ok(effects('DB.added').every(effect => effect.op !== 'convert'));
  assert.ok(effects('FE.added').some(effect => effect.kind === 'nextDamage' && effect.scale.source === 'lastHeal'));
  assert.deepEqual(effects('finish.hu'), [{ op: 'damage', amount: 300, fanRatio: 60, cap: 1500 }]);
  assert.equal(new Set(effects('formation.eight').map(effect => effect.element)).size, 5);
});

test('public numerical descriptions expose caps, durations and branch conditions', () => {
  for (const skill of skills.all) {
    const details = skills.details(skill.id);
    assert.equal(details.length, skill.effects.length);
    assert.ok(details.every(text => typeof text === 'string' && text.length > 0 && !text.includes('undefined')), skill.id);
  }
  assert.match(skills.details('FE.added').join('；'), /實際回復×0\.3%，追加上限 80%/);
  assert.match(skills.details('W.added.5555').join('；'), /護盾.*上限 360/);
  assert.match(skills.details('T.chow.789').join('；'), /自身滿血.*自身未滿血/);
  assert.match(skills.details('finish.hu')[0], /300.*60.*1500/);
  assert.deepEqual(skills.details('missing'), []);
});

test('catalogue and nested effects are deeply frozen in CommonJS and browser builds', () => {
  function frozen(value) {
    if (!value || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(frozen);
  }
  frozen(skills);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'cultivation-skills.js'), 'utf8'), context);
  assert.equal(context.window.MahjongCultivationSkills.all.length, 170);
  assert.equal(context.window.MahjongCultivationSkills.find('chow', ['W3', 'W2', 'W1']).name, '星火燎原');
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.MahjongCultivationSkills.all)), JSON.parse(JSON.stringify(skills.all)));
});

test('the delivered reference lists every skill with the same names and current numerical effects', () => {
  const document = fs.readFileSync(path.join(__dirname, '..', 'docs', 'CULTIVATION_SKILLS.md'), 'utf8');
  for (const skill of skills.all) {
    const row = document.split('\n').find(line => line.includes('`' + skill.id + '`'));
    assert.ok(row, skill.id);
    assert.ok(row.includes('**' + skill.name + '**'), skill.id);
    assert.ok(row.includes(skill.description), skill.id);
    assert.ok(row.includes(skills.details(skill).join('<br>')), skill.id);
  }
  assert.equal(document.split('\n').filter(line => /^\|.*\*\*.*`.*`/.test(line)).length, 170);
});
