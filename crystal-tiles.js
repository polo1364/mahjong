/* Five-Element Crystal artwork with transparent corner numbers and single-character labels. */
(function (root) {
  'use strict';
  const imageURL = root.MahjongImageURL || (value => value);

  const sheets = Object.freeze({
    wan: Object.freeze({ file: '01-wan-red-crystal-no-label.png', width: 1086, height: 1448 }),
    dots: Object.freeze({ file: '02-dots-spirit-pearls-no-label.png', width: 1086, height: 1448 }),
    bamboo: Object.freeze({ file: '03-bamboo-flying-swords-no-label.png', width: 1086, height: 1448 }),
    honors: Object.freeze({ file: '04-honors-and-back.png', width: 1536, height: 1024 }),
    flowers: Object.freeze({ file: '05-flowers-eight-no-label.png', width: 1536, height: 1024 })
  });

  // Measured source rectangles [x, y, width, height], excluding the studio shadows.
  // The source sheets have unequal margins; a regular grid would clip adjacent tiles.
  const sourceTiles = {
    W1: ['wan', [50, 14, 305, 440], '一萬'],
    W2: ['wan', [401, 14, 292, 440], '二萬'],
    W3: ['wan', [736, 14, 304, 439], '三萬'],
    W4: ['wan', [50, 471, 305, 449], '四萬'],
    W5: ['wan', [401, 471, 293, 449], '五萬'],
    W6: ['wan', [736, 471, 304, 449], '六萬'],
    W7: ['wan', [50, 936, 304, 452], '七萬'],
    W8: ['wan', [401, 936, 293, 452], '八萬'],
    W9: ['wan', [736, 936, 304, 452], '九萬'],
    T1: ['dots', [39, 15, 327, 455], '一筒'],
    T2: ['dots', [396, 15, 305, 455], '二筒'],
    T3: ['dots', [730, 15, 317, 455], '三筒'],
    T4: ['dots', [39, 486, 326, 453], '四筒'],
    T5: ['dots', [394, 486, 308, 453], '五筒'],
    T6: ['dots', [730, 486, 317, 453], '六筒'],
    T7: ['dots', [39, 953, 326, 469], '七筒'],
    T8: ['dots', [395, 953, 307, 469], '八筒'],
    T9: ['dots', [730, 953, 317, 469], '九筒'],
    B1: ['bamboo', [56, 16, 312, 461], '一索'],
    B2: ['bamboo', [393, 16, 313, 461], '二索'],
    B3: ['bamboo', [729, 16, 312, 461], '三索'],
    B4: ['bamboo', [55, 490, 313, 460], '四索'],
    B5: ['bamboo', [393, 490, 313, 460], '五索'],
    B6: ['bamboo', [729, 490, 313, 460], '六索'],
    B7: ['bamboo', [55, 963, 315, 458], '七索'],
    B8: ['bamboo', [393, 963, 313, 458], '八索'],
    B9: ['bamboo', [729, 963, 313, 458], '九索'],
    FE: ['honors', [76, 15, 348, 476], '東風'],
    FS: ['honors', [445, 16, 324, 475], '南風'],
    FW: ['honors', [785, 15, 339, 476], '西風'],
    FN: ['honors', [1144, 15, 344, 476], '北風'],
    DC: ['honors', [75, 499, 350, 467], '紅中'],
    DF: ['honors', [445, 499, 325, 467], '發財'],
    DB: ['honors', [785, 499, 339, 466], '白板'],
    BACK: ['honors', [1143, 499, 346, 466], '五行牌背'],
    H1: ['flowers', [75, 15, 349, 476], '春'],
    H2: ['flowers', [445, 15, 324, 476], '夏'],
    H3: ['flowers', [785, 15, 339, 476], '秋'],
    H4: ['flowers', [1144, 15, 344, 476], '冬'],
    H5: ['flowers', [75, 499, 350, 466], '梅'],
    H6: ['flowers', [445, 499, 325, 467], '蘭'],
    H7: ['flowers', [786, 499, 337, 465], '竹'],
    H8: ['flowers', [1143, 499, 346, 466], '菊']
  };

  const tiles = Object.create(null);
  const markup = Object.create(null);
  const cornerClip = 'polygon(12% 0,90% 0,100% 8%,100% 92%,90% 100%,10% 100%,0 92%,0 8%)';
  // Six honors already have painted corner text; preserve it without covering or doubling it.
  function cornerLabel(key) {
    if (key === 'BACK') return '';
    const suitColor = { W: '#b5222b', T: '#165ca8', B: '#187344' }[key[0]];
    const label = suitColor ? key.slice(1) : key === 'DB' ? '白' :
      key[0] === 'H' ? ['春', '夏', '秋', '冬', '梅', '蘭', '竹', '菊'][Number(key.slice(1)) - 1] : '';
    if (!label) return '';
    const color = suitColor || (key[0] === 'H' ? '#345b43' : '#304a66');
    // The white dragon's blue frame occupies the usual corner; use its blank inner corner.
    const position = key === 'DB' ? 'x="11" y="19" font-size="8"' : 'x="5" y="11.3" font-size="9"';
    return `<text data-crystal-label="${key}" ${position} font-family="Microsoft JhengHei,PingFang TC,sans-serif" font-weight="700" fill="${color}">${label}</text>`;
  }
  for (const [key, [sheetKey, rectangle, legacyLabel]] of Object.entries(sourceTiles)) {
    const sheet = sheets[sheetKey];
    const label = root.MahjongTileNames?.getName(key) || legacyLabel;
    tiles[key] = Object.freeze({ sheet: sheetKey, rect: Object.freeze(rectangle), label });
    const flowerMarker = sheetKey === 'flowers' ? ` data-flower="${key.slice(1)}"` : '';
    // Local SVG viewports crop shared external images without duplicate clip-path IDs.
    // The final 40:56 viewport keeps the existing game's tile geometry unchanged.
    markup[key] = `<svg class="tile-art" viewBox="0 0 40 56"${flowerMarker} data-crystal-key="${key}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="clip-path:${cornerClip}"><svg x="0" y="0" width="40" height="56" viewBox="${rectangle.join(' ')}" preserveAspectRatio="none" overflow="hidden"><image href="${imageURL(`assets/tiles-crystal/${sheet.file}`)}" width="${sheet.width}" height="${sheet.height}" /></svg>${cornerLabel(key)}</svg>`;
  }

  function render(key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(markup, key) ? markup[key] : '';
  }

  root.MahjongCrystalTiles = Object.freeze({
    render,
    sheets,
    tiles: Object.freeze(tiles),
    keys: Object.freeze(Object.keys(tiles))
  });
})(typeof window !== 'undefined' ? window : globalThis);
