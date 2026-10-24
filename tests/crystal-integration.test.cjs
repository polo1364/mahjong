const { test } = require('node:test');
const assert = require('node:assert/strict');
const names = require('../tile-names.js');
const { game } = require('./game-harness.cjs');

function logFixture(actor = '青冥', target = '南舟') {
  const harness = game();
  harness.run(`S.names = ${JSON.stringify([actor, target, '白露', '暮雪'])}; document.getElementById('log');`);
  const lines = [];
  harness.nodes.get('log').appendChild = line => lines.push(line);
  return { ...harness, log(text) {
    const count = lines.length;
    harness.logMessage(text);
    assert.equal(lines.length, count + 1, 'one real log entry is appended');
    const line = lines.at(-1);
    const markup = line.innerHTML;
    return { markup, className: line.className,
      keys: [...markup.matchAll(/data-crystal-key="([A-Z0-9]+)"/g)].map(match => match[1]),
      labels: [...markup.matchAll(/class="tile small log-tile [^"]+" role="img" aria-label="([^"]+)"/g)].map(match => match[1]) };
  } };
}

function assertTiles(record, keys, label) {
  assert.deepEqual(record.keys, keys, label);
  assert.deepEqual(record.labels, keys.map(key => names.getName(key)), `${label}: accessible names match visible tile identities`);
}

test('the game presents all 42 crystal names while preserving 144 unique physical tiles', () => {
  const { run } = game();
  for (const { key, name } of names.entries) assert.equal(run(`keyToText(${JSON.stringify(key)})`), name, key);
  assert.equal(run('generateTiles().length'), 144);
  assert.equal(run('new Set(generateTiles().map(tile => tile.id)).size'), 144);
  assert.deepEqual(JSON.parse(run('JSON.stringify(Object.keys(countByKey(generateTiles())).sort())')), [...names.keys].sort());
});

test('real discard and flower logs render all 42 new and legacy names with current accessible labels', () => {
  const { log } = logFixture();
  for (const entry of names.entries) {
    const isFlower = entry.key.startsWith('H');
    for (const name of [entry.name, entry.legacyName]) {
      const record = log(`${isFlower ? '🌸' : '🎴'} 青冥 ${isFlower ? '亮出' : '打出'} ${name}，${isFlower ? '補花' : '下一步'}`);
      assertTiles(record, [entry.key], name);
      assert.equal(record.className, `log-entry log-${isFlower ? 'flower' : 'discard'}`);
      assert.ok(record.markup.includes('<b class="log-actor seat-0">青冥</b>'), 'the actual log pipeline separates the actor');
    }
  }
});

test('real chow and ready logs accept numeric aliases and long honor names in sequence', () => {
  const { log } = logFixture();
  assertTiles(log('🍜 青冥 吃了 1萬 二筒 3索 九條 4赤晶 五靈珠 6飛劍'),
    ['W1', 'T2', 'B3', 'B9', 'W4', 'T5', 'B6'], 'chow aliases');
  assertTiles(log('🔔 青冥 聽牌 東風 南風 西風 北風 紅中 發財 白板'),
    ['FE', 'FS', 'FW', 'FN', 'DC', 'DF', 'DB'], 'ready honor aliases');
});

test('real public action and self-draw logs retain their event categories and tile semantics', () => {
  const { log } = logFixture();
  for (const [message, key, kind] of [
    ['🤲 你摸到 一赤晶', 'W1', 'draw'],
    ['🔥 青冥 碰了 玄玉', 'DB', 'pong'],
    ['💥 青冥 暗槓 神木', 'DF', 'kong'],
    ['💥 青冥 加槓 九飛劍', 'B9', 'kong'],
    ['🎉 青冥 自摸 青龍（平胡，共2台）→ 每家付 4,000', 'FE', 'win']
  ]) {
    const record = log(message);
    assertTiles(record, [key], message);
    assert.equal(record.className, `log-entry log-${kind}`);
  }
});

test('real point-win logs parse the winning tile and preserve both player names', () => {
  for (const tileName of ['青龍', '東', '東風']) {
    const { log } = logFixture('青龍道長', '南舟');
    const record = log(`🎉 青龍道長 點胡 南舟（${tileName}，平胡，共2台）→ 放槍者付 4,000`);
    assertTiles(record, ['FE'], tileName);
    assert.ok(record.markup.includes('<b class="log-actor seat-0">青龍道長</b>'));
    assert.ok(record.markup.includes('點胡 南舟（'));
  }
});

test('point-win target names containing actions and parentheses remain literal through the full log pipeline', () => {
  for (const [target, tileName, key] of [
    ['自摸青龍', '曜陽', 'FS'],
    ['打出南', '赤鳳', 'DC'],
    ['自摸青龍（神）', '曜陽', 'FS'],
    ['青（赤鳳，）', '曜陽', 'FS']
  ]) {
    const { log } = logFixture('青冥', target);
    const record = log(`🎉 青冥 點胡 ${target}（${tileName}，平胡，共2台）→ 放槍者付 4,000`);
    assertTiles(record, [key], target);
    assert.ok(record.markup.includes(`點胡 ${target}（`), `${target} stays an unchanged player name`);
  }
});

test('actors containing tile names remain actor text while the actual discard renders', () => {
  for (const actor of ['青龍', '青龍道長', '南', '南舟', '一赤晶仙', '一萬仙', '自摸青龍']) {
    const { log } = logFixture(actor);
    const record = log(`🎴 ${actor} 打出 二赤晶，輪到你`);
    assertTiles(record, ['W2'], actor);
    assert.ok(record.markup.includes(`<b class="log-actor seat-0">${actor}</b>`), `${actor} receives the actor role`);
  }
});

test('overlapping actor names match the longest full player name before parsing the action', () => {
  const { log } = logFixture('青', '青 道長');
  const record = log('🎴 青 道長 打出 二赤晶，輪到你');
  assertTiles(record, ['W2'], 'the longer player name still permits its discard');
  assert.ok(record.markup.includes('<b class="log-actor seat-1">青 道長</b>'));
  assert.equal(record.markup.includes('<b class="log-actor seat-0">青</b>'), false);
});

test('summary, round and informational logs never interpret player names as tiles', () => {
  const { log } = logFixture('自摸青龍');
  for (const message of [
    '🏁 本場結束：自摸青龍 100,000 分',
    '🏆 本場結束：自摸青龍 100,000 分',
    '本場結束：自摸青龍 100,000 分',
    '🎲 東風東 · 南家做莊',
    '青龍道長加入牌局', '一赤晶仙準備好了', '春芽子獲勝', '萬象歸宗',
    '自摸青龍 已封存牌局', '打出 青龍'
  ]) {
    const record = log(message);
    assertTiles(record, [], message);
    if (message.includes('本場結束')) assert.ok(record.markup.includes('本場結束：自摸青龍 100,000 分'));
  }
});

test('real logs escape player and message markup while intentional tiles retain accessible names', () => {
  const actor = '<img src=x onerror=alert(1)>';
  const { log } = logFixture(actor);
  const record = log(`🎴 ${actor} 打出 青龍，<script>alert(2)</script> & "道友"`);
  assertTiles(record, ['FE'], 'untrusted player and message');
  assert.equal(record.markup.includes('<img'), false);
  assert.equal(record.markup.includes('<script'), false);
  assert.ok(record.markup.includes('<b class="log-actor seat-0">&lt;img'));
  assert.ok(record.markup.includes('&lt;script&gt;'));
  assert.ok(record.markup.includes('&amp;'));
});
