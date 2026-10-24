const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const names = require('../tile-names.js');
const root = path.join(__dirname, '..');
const numerals = '一二三四五六七八九';
const fixed = {
  FE: ['東', '青龍'], FS: ['南', '曜陽'], FW: ['西', '白虎'], FN: ['北', '玄武'],
  DC: ['中', '赤鳳'], DF: ['發', '神木'], DB: ['白', '玄玉'],
  H1: ['春', '春芽'], H2: ['夏', '夏蓮'], H3: ['秋', '秋楓'], H4: ['冬', '冬雪'],
  H5: ['梅', '靈梅'], H6: ['蘭', '幽蘭'], H7: ['竹', '翠竹'], H8: ['菊', '金菊']
};

test('all 42 tile keys have the approved names without changing tile identifiers', () => {
  assert.equal(names.entries.length, 42);
  assert.equal(new Set(names.keys).size, 42);
  assert.equal(new Set(names.entries.map(entry => entry.name)).size, 42);
  for (const [suit, legacySuit, newSuit] of [['W', '萬', '赤晶'], ['T', '筒', '靈珠'], ['B', '條', '飛劍']]) {
    for (let rank = 1; rank <= 9; rank++) {
      assert.equal(names.getName(suit + rank), numerals[rank - 1] + newSuit);
      assert.equal(names.getLegacyName(suit + rank), numerals[rank - 1] + legacySuit);
    }
  }
  for (const [key, [legacyName, name]] of Object.entries(fixed)) {
    assert.equal(names.getName(key), name);
    assert.equal(names.getLegacyName(key), legacyName);
  }
  assert.deepEqual(names.keys, names.entries.map(entry => entry.key));
});

test('complete current and legacy names parse including Chinese and Arabic ranks', () => {
  for (const entry of names.entries) {
    assert.equal(names.parseName(entry.name), entry.key);
    assert.equal(names.parseName(entry.legacyName), entry.key);
  }
  for (const [suit, legacySuit, newSuit] of [['W', '萬', '赤晶'], ['T', '筒', '靈珠'], ['B', '條', '飛劍']]) {
    for (let rank = 1; rank <= 9; rank++) {
      assert.equal(names.parseName(rank + legacySuit), suit + rank);
      assert.equal(names.parseName(rank + newSuit), suit + rank);
      if (suit === 'B') {
        assert.equal(names.parseName(rank + '索'), suit + rank);
        assert.equal(names.parseName(numerals[rank - 1] + '索'), suit + rank);
      }
    }
  }
  for (const [name, key] of Object.entries({ 東風: 'FE', 南風: 'FS', 西風: 'FW', 北風: 'FN', 紅中: 'DC', 發財: 'DF', 白板: 'DB' })) {
    assert.equal(names.parseName(name), key);
  }
});

test('the parser never extracts tiles from names, prose or partial tokens', () => {
  for (const value of [null, undefined, {}, [], 1, '', '__proto__', 'constructor', '青龍道長', '白虎門', '春芽子', '一赤晶仙人', '打出 一赤晶', '東家做莊', '東風東', '一萬二萬', '一赤晶 二靈珠', '一飛', ' 一赤晶 ', '10萬', '0靈珠', '<b>青龍</b>']) {
    assert.equal(names.parseName(value), null, String(value));
  }
  for (const key of [null, undefined, {}, [], 1, '', '__proto__', 'constructor', 'W0', 'W10', 'H9', '<svg>']) {
    assert.equal(names.getName(key), '');
    assert.equal(names.getLegacyName(key), '');
  }
});

test('the back is presentation-only and exposed name data is immutable', () => {
  assert.equal(names.getName('BACK'), '五行牌背');
  assert.equal(names.getLegacyName('BACK'), '五行牌背');
  assert.equal(names.keys.includes('BACK'), false);
  assert.equal(names.parseName('五行牌背'), null);
  assert.ok(Object.isFrozen(names));
  assert.ok(Object.isFrozen(names.entries));
  assert.ok(Object.isFrozen(names.keys));
  assert.ok(names.entries.every(Object.isFrozen));
});

test('the browser global updates crystal metadata but preserves every crop and SVG exactly', () => {
  const source = fs.readFileSync(path.join(root, 'crystal-tiles.js'), 'utf8');
  const original = { window: {} };
  vm.runInNewContext(source, original);
  const current = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'tile-names.js'), 'utf8'), current);
  vm.runInNewContext(source, current);
  const art = current.window.MahjongCrystalTiles;
  for (const key of [...names.keys, 'BACK']) {
    assert.equal(art.tiles[key].label, names.getName(key));
    assert.equal(art.render(key), original.window.MahjongCrystalTiles.render(key));
    assert.equal(JSON.stringify(art.tiles[key].rect), JSON.stringify(original.window.MahjongCrystalTiles.tiles[key].rect));
  }
});

test('the reference table uses safe DOM text and repeated rendering does not duplicate it', () => {
  const doc = { createElement(tagName) {
    return {
      tagName, ownerDocument: doc, children: [], textContent: '',
      appendChild(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
      set innerHTML(_) { throw new Error('Reference markup must use textContent.'); }
    };
  } };
  const host = doc.createElement('div');
  const table = names.renderReference(host);
  assert.equal(host.children[0], table);
  assert.equal(table.tagName, 'table');
  assert.equal(table.children[0].textContent, '五行晶石牌名對照');
  assert.deepEqual(table.children[1].children[0].children.map(cell => cell.textContent), ['原牌名', '晶石牌名']);
  const rows = table.children[2].children;
  assert.equal(rows.length, 18);
  assert.deepEqual(rows[0].children.map(cell => cell.textContent), ['一萬～九萬', '一赤晶～九赤晶']);
  assert.deepEqual(rows[17].children.map(cell => cell.textContent), ['菊', '金菊']);
  names.renderReference(host);
  assert.equal(host.children.length, 1);
  assert.equal(names.renderReference(null), null);
  assert.equal(names.renderReference({}), null);
});
