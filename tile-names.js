/* Presentation names only. Tile keys, rules and stored tile data stay unchanged. */
(function (root) {
  'use strict';

  const numerals = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const entries = [];
  const byKey = Object.create(null);
  const byName = Object.create(null);
  const referenceRows = [];

  function add(key, name, legacyName, aliases) {
    const entry = Object.freeze({ key, name, legacyName });
    entries.push(entry);
    byKey[key] = entry;
    for (const alias of [name, legacyName, ...aliases]) byName[alias] = key;
  }

  for (const [suit, oldSuit, newSuit] of [['W', '萬', '赤晶'], ['T', '筒', '靈珠'], ['B', '條', '飛劍']]) {
    numerals.forEach((numeral, index) => {
      const rank = index + 1;
      const aliases = [String(rank) + oldSuit, String(rank) + newSuit];
      if (suit === 'B') aliases.push(numeral + '索', String(rank) + '索');
      add(suit + rank, numeral + newSuit, numeral + oldSuit, aliases);
    });
    referenceRows.push(['一' + oldSuit + '～九' + oldSuit, '一' + newSuit + '～九' + newSuit]);
  }

  for (const [key, legacyName, name, alias] of [
    ['FE', '東', '青龍', '東風'], ['FS', '南', '曜陽', '南風'],
    ['FW', '西', '白虎', '西風'], ['FN', '北', '玄武', '北風'],
    ['DC', '中', '赤鳳', '紅中'], ['DF', '發', '神木', '發財'], ['DB', '白', '玄玉', '白板'],
    ['H1', '春', '春芽'], ['H2', '夏', '夏蓮'], ['H3', '秋', '秋楓'], ['H4', '冬', '冬雪'],
    ['H5', '梅', '靈梅'], ['H6', '蘭', '幽蘭'], ['H7', '竹', '翠竹'], ['H8', '菊', '金菊']
  ]) {
    add(key, name, legacyName, alias ? [alias] : []);
    referenceRows.push([legacyName, name]);
  }

  function getName(key) {
    if (key === 'BACK') return '五行牌背';
    return typeof key === 'string' && byKey[key] ? byKey[key].name : '';
  }

  function getLegacyName(key) {
    if (key === 'BACK') return '五行牌背';
    return typeof key === 'string' && byKey[key] ? byKey[key].legacyName : '';
  }

  // Parse a complete token only. The caller decides whether its log context is a tile.
  function parseName(name) {
    return typeof name === 'string' ? byName[name] || null : null;
  }

  function renderReference(container) {
    if (!container || !container.ownerDocument || typeof container.replaceChildren !== 'function') return null;
    const doc = container.ownerDocument;
    const table = doc.createElement('table');
    table.className = 'tile-name-reference';
    const caption = doc.createElement('caption');
    caption.textContent = '五行晶石牌名對照';
    table.appendChild(caption);
    const head = doc.createElement('thead');
    const heading = doc.createElement('tr');
    for (const label of ['原牌名', '晶石牌名']) {
      const cell = doc.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      heading.appendChild(cell);
    }
    head.appendChild(heading);
    table.appendChild(head);
    const body = doc.createElement('tbody');
    for (const [legacyName, name] of referenceRows) {
      const row = doc.createElement('tr');
      for (const label of [legacyName, name]) {
        const cell = doc.createElement('td');
        cell.textContent = label;
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
    table.appendChild(body);
    container.replaceChildren(table);
    return table;
  }

  const api = Object.freeze({
    getName,
    getLegacyName,
    parseName,
    renderReference,
    entries: Object.freeze(entries),
    keys: Object.freeze(entries.map(entry => entry.key))
  });
  root.MahjongTileNames = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
