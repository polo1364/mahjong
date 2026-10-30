const { test } = require('node:test');
const assert = require('node:assert/strict');
const terms = require('../cultivation-terms.js');
require('../tile-names.js');
const skills = require('../cultivation-skills.js');
const finishers = require('../cultivation-finishers.js');
require('../cultivation-monster-skills.js');
require('../cultivation-monsters.js');
const catalog = require('../cultivation-catalog.js');

function text(value) { return { nodeType: 3, nodeValue: value, parentElement: null }; }
function element(tag, attributes = {}, children = []) {
  const node = { nodeType: 1, tagName: tag.toUpperCase(), childNodes: children, parentElement: null,
    hasAttribute: name => Object.hasOwn(attributes, name), getAttribute: name => attributes[name] ?? null,
    setAttribute: (name, value) => { attributes[name] = value; },
    matches(selector) { return selector.split(',').some(part => part[0] === '.' ? (attributes.class || '').split(' ').includes(part.slice(1))
      : part[0] === '#' ? attributes.id === part.slice(1) : part === '[data-cultivation-preserve]' ? Object.hasOwn(attributes, 'data-cultivation-preserve')
      : part === '[contenteditable="true"]' ? attributes.contenteditable === 'true' : this.tagName.toLowerCase() === part); },
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  };
  for (const child of children) child.parentElement = node;
  return node;
}

test('cultivation actions use distinct approved names and longest matching finisher terms', () => {
  assert.equal(terms.format('吃 碰 明槓 暗槓 加槓 胡牌 自摸 搶槓'), '引氣 聚靈 開陣 藏陣 續陣 決勝 天成 截陣');
  assert.equal(terms.format('門清自摸 平胡 對對胡 槓上開花 四季花槓'), '無漏真仙 流雲歸一 五嶽鎮魔 破關綻靈 四時輪轉');
  assert.equal(terms.format('加槓成功且未被搶胡時'), '續陣成功且未被截陣時');
});

test('all catalog descriptions and labels can display without forbidden calls while source records remain intact', () => {
  const before = JSON.stringify({ skills: skills.all, finishers: finishers.all });
  for (const row of catalog.records()) {
    const displayed = terms.format([row.name, row.combo, row.description, row.trigger, row.seal, ...row.details].join(' '));
    assert.doesNotMatch(displayed, /吃|碰|槓|杠|胡|自摸/, row.id);
  }
  assert.equal(JSON.stringify({ skills: skills.all, finishers: finishers.all }), before);
  assert.equal(finishers.get('self-draw').label, '自摸');
});

test('new terminology and legacy query aliases both find the same stable catalog records', () => {
  const rows = catalog.records();
  assert.deepEqual(catalog.filter(rows, { family: 'W', query: '引氣' }).map(row => row.id),
    catalog.filter(rows, { family: 'W', action: 'chow' }).map(row => row.id));
  assert.equal(catalog.filter(rows, { query: '碰碰胡' })[0].id, 'finisher:all-pungs');
  assert.ok(catalog.filter(rows, { query: '五嶽鎮魔' }).some(row => row.id === 'finisher:all-pungs'));
});

test('rendering changes text and accessibility labels without changing controls or IDs, then restores normal mode', () => {
  const label = text('暗槓');
  const button = element('button', { id: 'btnKong', title: '暗槓選擇', 'aria-label': '暗槓', 'data-action': 'concealed' }, [label]);
  const listener = () => 1; button.onclick = listener;
  terms.render(button, true);
  assert.equal(label.nodeValue, '藏陣');
  assert.equal(button.getAttribute('aria-label'), '藏陣');
  assert.equal(button.getAttribute('title'), '藏陣選擇');
  assert.equal(button.getAttribute('data-action'), 'concealed');
  assert.equal(button.getAttribute('id'), 'btnKong');
  assert.equal(button.onclick, listener);
  const meldRail = element('div', { 'aria-label': '對家的副露' });
  terms.render(meldRail, true);
  assert.equal(meldRail.getAttribute('aria-label'), '對家的已施法印');
  terms.render(meldRail, false);
  assert.equal(meldRail.getAttribute('aria-label'), '對家的副露');
  terms.render(button, false);
  assert.equal(label.nodeValue, '暗槓');
  assert.equal(button.getAttribute('title'), '暗槓選擇');
});

test('repeated renders and mode changes keep newly supplied labels instead of restoring stale originals', () => {
  const label = text('明槓');
  const button = element('button', { title: '明槓' }, [label]);
  terms.render(button, true); terms.render(button, true);
  label.nodeValue = '加槓'; button.setAttribute('title', '加槓');
  terms.render(button, true);
  assert.equal(label.nodeValue, '續陣');
  terms.render(button, false);
  assert.equal(label.nodeValue, '加槓');
  assert.equal(button.getAttribute('title'), '加槓');
  terms.render(button, true);
  label.nodeValue = '普通模式的新內容';
  terms.render(button, false);
  assert.equal(label.nodeValue, '普通模式的新內容');
});

test('player names and user input stay verbatim, including names containing action words and regex punctuation', () => {
  const name = '小碰胡(一)';
  const actor = text(name), body = text(`點胡 ${name}，搶槓成立`), input = element('input', { placeholder: '碰碰胡' });
  input.value = '我想吃飯，也想碰運氣';
  const userText = text('胡牌心得'), textarea = element('textarea', {}, [userText]);
  const log = element('div', {}, [element('b', { class: 'log-actor' }, [actor]), element('span', { class: 'log-text' }, [body]), input, textarea]);
  terms.render(log, true, { names: [name] });
  assert.equal(actor.nodeValue, name);
  assert.equal(body.nodeValue, `決勝 ${name}，截陣成立`);
  assert.equal(input.value, '我想吃飯，也想碰運氣');
  assert.equal(input.getAttribute('placeholder'), '五嶽鎮魔');
  assert.equal(userText.nodeValue, '胡牌心得');
  const call = text('碰'), callButton = element('button', { 'aria-label': '碰' }, [call]);
  const controls = element('div', { id: 'controls' }, [callButton]);
  terms.render(controls, true, { names: ['碰'] });
  assert.equal(call.nodeValue, '碰', 'table actions retain familiar mahjong labels');
  assert.equal(callButton.getAttribute('aria-label'), '碰');
});

test('table controls retain all call labels through repeated mode changes', () => {
  const labels = ['吃', '碰', '槓', '胡牌', '聽', '過'];
  const controls = element('div', { id: 'controls' }, labels.map(label => element('button', { title: label, 'aria-label': label }, [text(label)])));
  for (const active of [true, true, false, true]) {
    terms.render(controls, active);
    controls.childNodes.forEach((button, i) => {
      assert.equal(button.childNodes[0].nodeValue, labels[i]);
      assert.equal(button.getAttribute('title'), labels[i]);
      assert.equal(button.getAttribute('aria-label'), labels[i]);
    });
  }
});

test('short or unused player names cannot suppress translations of rule terminology', () => {
  assert.equal(terms.format('胡牌終式、可胡牌，自摸或搶槓', ['胡']), '決勝終式、可決勝，天成或截陣');
  assert.equal(terms.format('胡施放秘術；胡的戰鬥資訊；點胡 胡（青龍）', ['胡']), '胡施放秘術；胡的戰鬥資訊；決勝 胡（青龍）');
  const previous = globalThis.MahjongCultivationHeroes;
  globalThis.MahjongCultivationHeroes = { get: () => ({ name: '沈孤鋒' }) };
  try {
    assert.deepEqual(terms.names({ names: ['胡'], players: [{ name: '碰' }], cultivation: { version: 2, players: [{ heroId: 'shen-gufeng' }] } }), ['沈孤鋒']);
  } finally { globalThis.MahjongCultivationHeroes = previous; }
});
