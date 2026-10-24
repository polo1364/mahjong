const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '../artifacts');
const url = process.env.MAHJONG_URL || 'http://127.0.0.1:8765';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [], errors = [];
  try {
    for (const [width, height, scale] of [[943, 889, 1], [844, 390, 1], [320, 568, 3], [390, 844, 3], [1440, 1000, 2]]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play');
      const loaded = await page.evaluate(async () => {
        cancelGameTimers();
        return Promise.all(Object.values(MahjongCrystalTiles.sheets).map(async sheet => {
          const image = new Image(); image.src = `assets/tiles-crystal/${sheet.file}`;
          await image.decode();
          return { file: sheet.file, width: image.naturalWidth, height: image.naturalHeight,
            correct: image.naturalWidth === sheet.width && image.naturalHeight === sheet.height };
        }));
      });
      assert.equal(loaded.length, 5);
      assert.ok(loaded.every(sheet => sheet.correct));
      const metrics = await page.evaluate(() => {
        const tiles = [...document.querySelectorAll('#yourHand .tile-art')];
        const ratios = tiles.map(svg => {
          const key = svg.dataset.crystalKey, rect = svg.getBoundingClientRect();
          if (!key || !svg.querySelector('image')) throw new Error('Hand contains an old or missing face');
          const source = MahjongCrystalTiles.tiles[key].rect;
          return Math.min(source[2] / (rect.width * devicePixelRatio), source[3] / (rect.height * devicePixelRatio));
        });
        const mode = document.querySelector('.play-column').dataset.squareMode;
        const hand = document.getElementById('yourHandArea').getBoundingClientRect();
        const controls = document.querySelector('.bottom-area .controls-inline').getBoundingClientRect();
        const message = document.querySelector('.bottom-area .turn-message').getBoundingClientRect();
        const button = document.querySelector('#yourHand button.tile').getBoundingClientRect();
        const art = document.querySelector('#yourHand .tile-art').getBoundingClientRect();
        const handArea = document.getElementById('yourHandArea');
        const table = document.getElementById('playersGrid').getBoundingClientRect();
        return { handCount: tiles.length, minimumSourcePixelRatio: Math.min(...ratios),
          pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, dpr: devicePixelRatio,
          mode, handTileWidth: button.width, artworkWidth: art.width,
          tableWidth: table.width,
          entireHandVisible: handArea.scrollWidth <= handArea.clientWidth + 1 &&
            tiles.every(svg => { const box = svg.getBoundingClientRect(); return box.left >= hand.left && box.right <= hand.right && box.left >= 0 && box.right <= innerWidth; }),
          handInsideTable: tiles.every(svg => { const box = svg.getBoundingClientRect(); return box.left >= table.left && box.right <= table.right && box.top >= table.top && box.bottom <= table.bottom; }),
          controlsClear: hand.right <= controls.left || hand.left >= controls.right || hand.bottom <= controls.top || controls.bottom <= hand.top,
          turnMessageClear: mode !== 'below' || hand.bottom <= message.top,
          opponentHandsClear: [2, 3].every(pid =>
            [...document.querySelectorAll(`#handBack${pid} .tile-back`)].every(tile =>
              tile.getBoundingClientRect().bottom <= hand.top + 1)) };
      });
      assert.ok(metrics.handCount > 0);
      assert.ok(metrics.handTileWidth >= (metrics.tableWidth < 440 ? 13 : 32), `${width}: use available table width for hand`);
      assert.ok(metrics.entireHandVisible, `${width}: every hand tile is visible at once`);
      assert.ok(metrics.handInsideTable, `${width}: hand remains inside all four table edges`);
      assert.equal(metrics.artworkWidth, metrics.handTileWidth, `${width}: no redundant border shrinking the artwork`);
      assert.ok(metrics.controlsClear && metrics.turnMessageClear, `${width}: larger hand must not cover its controls or status`);
      assert.ok(metrics.opponentHandsClear, `${width}: larger hand must not overlap opponent racks`);
      assert.ok(metrics.minimumSourcePixelRatio >= 1, `${width}: source must cover device pixels without upscaling`);
      assert.ok(metrics.pageWidth <= width, `${width}: no horizontal page overflow`);
      await page.screenshot({ path: path.join(out, `crystal-game-${width}-${scale}x.png`), fullPage: true });
      await page.locator('#yourHandArea').screenshot({ path: path.join(out, `crystal-hand-${width}-${scale}x.png`) });
      const effect = await page.evaluate(() => {
        showEffect('pong', undefined, effectContext(0, ['W9', 'T9', 'B9'].map(keyToTile)));
        const faces = [...document.querySelectorAll('.mahjong-fx .fx-tile .tile-art')];
        const keys = faces.map(face => face.dataset.crystalKey);
        const pixels = faces.map(face => {
          const source = MahjongCrystalTiles.tiles[face.dataset.crystalKey].rect;
          const box = face.getBoundingClientRect();
          return Math.min(source[2] / (box.width * devicePixelRatio), source[3] / (box.height * devicePixelRatio));
        });
        return { keys, minimumSourcePixelRatio: Math.min(...pixels) };
      });
      assert.deepEqual(effect.keys, ['W9', 'T9', 'B9']);
      assert.ok(effect.minimumSourcePixelRatio >= 1, `${width}: effect source covers device pixels`);
      if (width === 1440) await page.screenshot({ path: path.join(out, 'crystal-effect-1440-2x.png'), fullPage: true });
      await page.evaluate(() => {
        showEffect('concealedKong', undefined, effectContext(0, [1, 2, 3, 4], true));
      });
      assert.equal(await page.locator('.mahjong-fx .fx-tile.is-back').count(), 4);
      assert.ok((await page.locator('.mahjong-fx .fx-tile.is-back').first().evaluate(el =>
        getComputedStyle(el, '::before').backgroundImage)).includes('04-honors-and-back.png'));
      results.push({ width, height, ...metrics, effect, loaded });
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'crystal-browser.json'), JSON.stringify({ passed: true, results, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, viewports: results.map(({ width, dpr, minimumSourcePixelRatio }) =>
      ({ width, dpr, minimumSourcePixelRatio })), effects: 'three faces and four concealed backs', errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
