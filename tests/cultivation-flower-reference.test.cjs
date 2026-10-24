const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../tile-names.js');
const skills = require('../cultivation-skills.js');
require('../cultivation-finishers.js');
const catalog = require('../cultivation-catalog.js');
const { game } = require('./game-harness.cjs');

test('each owned flower resolves its actual skill without mutating state', () => {
  for (let n = 1; n <= 8; n++) {
    const key = 'H' + n, player = { flowers: [key], formations: [] };
    const before = JSON.stringify(player);
    assert.deepEqual(catalog.flowerReference(key, player), { skillId: skills.find('flower', key).id, related: [] });
    assert.equal(JSON.stringify(player), before);
  }
  for (const key of ['H0', 'H9', 'W1', null, 'H2']) assert.equal(catalog.flowerReference(key, { flowers: ['H1'] }), null);
});

test('formation effects require both the trigger record and complete flowers, without duplicates', () => {
  const player = { flowers: ['H1','H2','H3','H4','H5','H6','H7','H8'], formations: [] };
  assert.equal(catalog.flowerReference('H1', player).related.length, 0);
  player.formations = ['seasons','seasons','gentlemen'];
  assert.deepEqual(catalog.flowerReference('H8', player).related.map(r => r.skillId), ['formation.seasons','formation.gentlemen']);
  player.flowers.splice(0, 1);
  assert.deepEqual(catalog.flowerReference('H8', player).related.map(r => r.skillId), ['formation.gentlemen']);
});

test('seven/eight flower finishers are shown only from the recorded finisher', () => {
  const player = { flowers: ['H1','H2','H3','H4','H5','H6','H7','H8'], formations: [] };
  assert.equal(catalog.flowerReference('H1', player).related.length, 0);
  for (const id of ['seven','eight']) {
    const ref = catalog.flowerReference('H1', player, { parts: [{id}, {id}] });
    assert.deepEqual(ref.related.map(r => r.skillId), ['formation.' + id]);
  }
});

test('flower markup keeps stable player and tile identity after sorting', () => {
  const {run} = game(13, {cultivation:true});
  run("S.players[2].flowers=tiles('H8 H1 H5')");
  const html = run('flowerHTML(2)');
  assert.deepEqual([...html.matchAll(/data-flower-key="([^"]+)"/g)].map(m => m[1]), ['H1','H5','H8']);
  assert.equal((html.match(/data-flower-player="2"/g)||[]).length, 3);
});

test('restart button clears cultivation journey/seals only after confirmation; cancellation preserves state', () => {
  const {run} = game(13, {cultivation:true});
  run("S.cultivation.handNumber=5;S.cultivation.players[1].activeSeals=window.MahjongCultivationFinishers.curses([{id:'closed'}]);const beforeRestart=JSON.stringify(S);confirm=()=>false;document.getElementById('newGameBtn').onclick()");
  assert.equal(run('JSON.stringify(S)===beforeRestart'), true);
  run("let restartMessage='';confirm=message=>{restartMessage=message;return true;};document.getElementById('newGameBtn').onclick()");
  assert.match(run('restartMessage'), /所有劫印/);
  assert.equal(run('S.cultivation.handNumber'), 1);
  assert.equal(run('S.cultivation.players.every(p=>!p.activeSeals.length&&!p.pendingSeals.length)'), true);
});

test('restart after cultivation settlement does not carry pending seals; normal restart stays normal', () => {
  const {run} = game(14, {cultivation:true});
  run("S.phase='end';S.cultivation.ended=true;S.cultivation.players[2].pendingSeals=window.MahjongCultivationFinishers.curses([{id:'closed'}]);document.getElementById('newGameBtn').onclick()");
  assert.equal(run('S.cultivation.players.every(p=>!p.activeSeals.length&&!p.pendingSeals.length)'), true);
  const normal = game(15);
  normal.run("document.getElementById('newGameBtn').onclick()");
  assert.equal(normal.run('!!S.cultivation'), false);
});
