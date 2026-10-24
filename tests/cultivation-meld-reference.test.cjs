const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../tile-names.js');
const skills = require('../cultivation-skills.js');
require('../cultivation-finishers.js');
const catalog = require('../cultivation-catalog.js');

test('all 157 legal meld skills resolve exactly, including three distinct kong kinds', () => {
  const rows = skills.all.filter(s => ['chow', 'pong', 'exposed', 'concealed', 'added'].includes(s.action));
  assert.equal(rows.length, 157);
  for (const skill of rows) {
    const meld = { type: ['chow', 'pong'].includes(skill.action) ? skill.action : 'kong',
      concealed: skill.action === 'concealed', added: skill.action === 'added', tiles: catalog.keysFor(skill) };
    const before = JSON.stringify(meld);
    assert.deepEqual(catalog.meldReference(meld), { skillId: skill.id }, skill.id);
    assert.equal(JSON.stringify(meld), before);
  }
});

test('opponent concealed kongs never read hidden tiles or resolve a revealing skill', () => {
  const meld = { type: 'kong', concealed: true, get tiles() { throw Error('Hidden tiles were read'); } };
  assert.deepEqual(catalog.meldReference(meld, true), { secret: true });
  for (const skill of skills.all.filter(s => s.action === 'concealed')) {
    const entry = { type: 'kong', concealed: true, tiles: catalog.keysFor(skill) };
    assert.deepEqual(catalog.meldReference(entry, true), { secret: true });
    assert.deepEqual(catalog.meldReference(entry, false), { skillId: skill.id });
  }
});

test('public kong and added kong remain visible when concealed protection is enabled', () => {
  const meld = { type: 'pong', tiles: ['FE', 'FE', 'FE'] };
  assert.deepEqual(catalog.meldReference(meld, true), { skillId: 'FE.pong' });
  meld.type = 'kong'; meld.tiles.push('FE');
  assert.deepEqual(catalog.meldReference(meld, true), { skillId: 'FE.exposed' });
  meld.added = true;
  assert.deepEqual(catalog.meldReference(meld, true), { skillId: 'FE.added' });
});

test('malformed or non-meld references cannot open unrelated skills', () => {
  for (const meld of [null, {}, { type: 'flower', tiles: ['H1'] }, { type: 'chow', tiles: ['W1','T2','B3'] }, { type: 'pong', tiles: [] }]) {
    assert.equal(catalog.meldReference(meld), null);
  }
});
