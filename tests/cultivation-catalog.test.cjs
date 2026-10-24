const { test } = require('node:test');
const assert = require('node:assert/strict');
const names = require('../tile-names.js');
const skills = require('../cultivation-skills.js');
const finishers = require('../cultivation-finishers.js');
const monsterSkills = require('../cultivation-monster-skills.js');
require('../cultivation-monsters.js');
const catalog = require('../cultivation-catalog.js');
const rows = catalog.records();

test('catalog covers every live skill and finisher without the retired common finisher', () => {
  assert.equal(rows.length, 242);
  assert.equal(new Set(rows.map(r => r.id)).size, 242);
  assert.equal(rows.filter(r => !r.finisher && !r.monster).length, 169);
  assert.equal(rows.filter(r => r.monster).length, 35);
  assert.equal(rows.filter(r => r.finisher).length, 38);
  assert.ok(!rows.some(r => r.id === 'finish.hu'));
  for (const source of skills.all.filter(s => s.id !== 'finish.hu')) {
    const record = rows.find(r => r.id === source.id);
    assert.deepEqual(record.details, skills.details(source));
    assert.equal(record.name, source.name);
    assert.equal(record.description, source.description);
    assert.ok(record.trigger);
    assert.ok(record.roles.length, source.id);
    for (const key of record.keys) assert.ok(names.keys.includes(key), key);
  }
  for (const source of finishers.all) {
    const row = rows.find(r => r.finisher === source.id);
    assert.equal(row.combo, source.label);
    assert.equal(row.description, source.description);
    if (source.curse) assert.ok(row.seal.includes(finishers.describeSeal(source.curse)));
  }
});

test('all monster records are searchable by species and actual skill effects',()=>{
  for(const skill of monsterSkills.all){const row=rows.find(r=>r.id===skill.id);assert.equal(row.description,monsterSkills.describe(skill));assert.ok(catalog.filter(rows,{family:'monster',query:row.combo}).some(r=>r.id===skill.id));}
});

test('every legal numbered combination and each kong variant is findable', () => {
  for (const family of ['W', 'T', 'B']) {
    assert.equal(catalog.filter(rows, { family }).length, 43);
    assert.equal(catalog.filter(rows, { family, action: 'chow' }).length, 7);
    for (const action of ['pong', 'exposed', 'concealed', 'added']) {
      assert.equal(catalog.filter(rows, { family, action }).length, 9);
      for (let rank = 1; rank <= 9; rank++) {
        const combo = String(rank).repeat(action === 'pong' ? 3 : 4);
        const found = catalog.filter(rows, { family, action, query: combo });
        assert.equal(found.length, 1);
        assert.equal(found[0].keys.length, combo.length);
      }
    }
  }
});

test('new and legacy tile names find all matching melds, including honor kongs', () => {
  for (const entry of names.entries) {
    const expected = rows.filter(r => !r.finisher && r.keys.includes(entry.key));
    for (const query of [entry.name, entry.legacyName]) {
      const found = new Set(catalog.filter(rows, { query }).map(r => r.id));
      for (const row of expected) assert.ok(found.has(row.id), query + ':' + row.id);
    }
  }
  assert.equal(catalog.filter(rows, { query: '碰碰胡' })[0].finisher, 'all-pungs');
  assert.equal(catalog.filter(rows, { family: 'W', action: 'chow', query: '１２３' })[0].id, 'W.chow.123');
  assert.equal(catalog.filter(rows, { query: '不存在的招式' }).length, 0);
  assert.equal(catalog.filter(rows, { family: 'W', action: 'finish' }).length, 0);
});

test('flower formations and alternate finishes explain their actual combinations', () => {
  assert.deepEqual(rows.find(r => r.id === 'formation.seasons').keys, ['H1', 'H2', 'H3', 'H4']);
  assert.deepEqual(rows.find(r => r.id === 'formation.gentlemen').keys, ['H5', 'H6', 'H7', 'H8']);
  assert.match(rows.find(r => r.id === 'formation.seven').combo, /任意七種/);
  for (const id of ['seven', 'eight']) {
    assert.match(rows.find(r => r.id === 'formation.' + id).trigger, /取代普通終式/);
    assert.match(rows.find(r => r.finisher === id).details.join(''), /不疊加普通台型/);
  }
  assert.match(rows.find(r => r.finisher === 'seven').seal, /持單花者/);
  assert.match(rows.find(r => r.finisher === 'base').seal, /僅零台/);
});

test('method and seal references preserve scoring exclusivity and self-draw immunity', () => {
  for (const row of finishers.all.filter(r => r.selfOnly)) {
    const record = rows.find(r => r.finisher === row.id);
    assert.equal(record.trigger, '僅自摸成立');
    assert.equal(record.seal, '不施加劫印。');
  }
  assert.equal(rows.find(r => r.finisher === 'all-chows').trigger, '僅點胡成立');
  assert.equal(rows.find(r => r.finisher === 'rob-kong').trigger, '搶槓成立');
  assert.match(rows.find(r => r.finisher === 'closed-self-draw').description, /不重複施放/);
  assert.match(rows.find(r => r.id === 'W.added.1111').trigger, /未被搶胡/);
});

test('purpose filters include mixed healing, defense, counter and aggro effects', () => {
  for (const role of ['attack', 'heal', 'defense', 'counter', 'aggro', 'control', 'support']) assert.ok(catalog.filter(rows, { role }).length > 0);
  assert.ok(rows.find(r => r.id === 'FE.pong').roles.includes('heal'));
  assert.ok(rows.find(r => r.id === 'W.chow.567').roles.includes('counter'));
  assert.ok(rows.find(r => r.id === 'W.chow.567').roles.includes('defense'));
  assert.ok(catalog.filter(rows, { role: 'aggro', query: '降仇' }).length > 0);
  assert.ok(catalog.filter(rows, { role: 'aggro', query: '挑釁' }).length > 0);
  const original = JSON.stringify([skills.all, finishers.all]);
  catalog.records(); catalog.filter(rows, { query: '治療 反擊' });
  assert.equal(JSON.stringify([skills.all, finishers.all]), original);
});
