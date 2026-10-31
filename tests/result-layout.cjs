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
    for (const [width, height, scale] of [[568, 320, 3], [844, 390, 3], [943, 889, 1], [1440, 1000, 2]]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await require('./start-screen-helper.cjs').enterGame(page);
    await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play');
      const unchanged = await page.evaluate(async () => {
        cancelGameTimers();
        window.resultNaturalExample = { state: JSON.parse(JSON.stringify(S)), seats: [...seatNames] };
        // A rendering stress fixture, intentionally beyond legal hand sizes. It does not test scoring.
        const hand = 'W9 W1 W2 W4 W5 W7 W8 T1 T3 T5 T7 B1 B3 B5 FE FS FW'.split(' ');
        S.players.forEach((player, i) => {
          player.hand = hand.map(keyToTile);
          player.flowers = Array.from({ length: 8 }, (_, j) => keyToTile(`H${j + 1}`));
          player.melds = [
            { type: 'chow', tiles: ['W3', 'W4', 'W5'].map(keyToTile) },
            { type: 'pong', tiles: ['T9', 'T9', 'T9'].map(keyToTile) },
            { type: 'kong', tiles: ['B8', 'B8', 'B8', 'B8'].map(keyToTile) },
            { type: 'kong', concealed: true, tiles: ['DF', 'DF', 'DF', 'DF'].map(keyToTile) }
          ];
          player.points = 100000 - i * 4000;
        });
        Object.assign(S, { phase: 'end', winner: 0, fromPlayer: -1, winTile: null, flowerWin: null,
          resultDetail: { fan: 5, categories: ['門清', '莊家', '自摸'] } });
        const before = JSON.stringify(S.players);
        showHandsAndContinue();
        await Promise.all(Object.values(MahjongCrystalTiles.sheets).map(async sheet => {
          const image = new Image(); image.src = `assets/tiles-crystal/${sheet.file}`;
          await image.decode();
        }));
        return before === JSON.stringify(S.players);
      });
      assert.equal(unchanged, true, `${width}: revealing results does not mutate hands, melds, flowers or points`);
      assert.equal(await page.locator('.result-player').count(), 4);
      assert.equal(await page.locator('.rs-tiles .tile').count(),156,'oversized stress fixture retains every tile');
      // Four melds (including two kongs) leave five concealed tiles in a legal 16-tile hand.
      await page.evaluate(()=>{ S.players.forEach((p,i)=>{p.hand=p.hand.slice(0,5);p.flowers=p.flowers.slice(i*2,i*2+2);});showHandsAndContinue(); });
      const metrics = await page.evaluate(() => {
        const panel = document.querySelector('.result-panel');
        const players = [...panel.querySelectorAll('.result-player')];
        const measure = elements => {
          const boxes = elements.map(el => el.getBoundingClientRect());
          const rail = elements[0].closest('.rs-tiles').getBoundingClientRect();
          return { count: boxes.length, rows: new Set(boxes.map(box => Math.round(box.top))).size,
            minimumTileWidth: Math.min(...boxes.map(box => box.width)),
            allInsideRail: boxes.every(box => box.left >= rail.left - .1 && box.right <= rail.right + .1 && box.left >= 0 && box.right <= innerWidth),
            noOverlap: boxes.every((box, index) => !index || box.left >= boxes[index - 1].right - .1) };
        };
        return {
          players: players.map(player => ({
            hand: measure([...player.querySelectorAll('.rs-hand > .tile')]),
            flowers: measure([...player.querySelectorAll('.flower-row > .tile')]),
            melds: [...player.querySelectorAll('.rs-meld')].map(meld => measure([...meld.querySelectorAll('.tile')])),
            allMeldTiles: measure([...player.querySelectorAll('.rs-meld .tile')]),
            meldGroupRows: new Set([...player.querySelectorAll('.rs-meld')].map(el => Math.round(el.getBoundingClientRect().top))).size
          })),
          bodyFonts: [...panel.querySelectorAll('.rs-summary,.rs-name,.rs-points')]
            .map(el => parseFloat(getComputedStyle(el).fontSize)),
          rails: [...panel.querySelectorAll('.rs-hand,.rs-meld,.rs-flowers')].map(el => ({
            width: el.clientWidth, scrollWidth: el.scrollWidth, scrollLeft: el.scrollLeft,
            label: el.getAttribute('aria-label') })),
          fontFamily: getComputedStyle(panel).fontFamily,
          eyebrowFont: parseFloat(getComputedStyle(panel.querySelector('.eyebrow')).fontSize),
          titleFont: parseFloat(getComputedStyle(panel.querySelector('h3')).fontSize),
          panelWidth: panel.getBoundingClientRect().width,
          panelScrollWidth: panel.scrollWidth, panelClientWidth: panel.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
          footerPosition: getComputedStyle(panel.querySelector('.result-footer')).position
        };
      });
      for (const player of metrics.players) {
        assert.equal(player.hand.count, 5);
        assert.equal(player.hand.rows, 1);
        assert.equal(player.flowers.count, 2);
        assert.equal(player.flowers.rows, 1);
        assert.equal(player.melds.length, 4);
        assert.ok(player.meldGroupRows <= 4, 'normal mode keeps each meld intact while separate groups may wrap');
        assert.deepEqual(player.melds.map(meld => meld.count), [3, 3, 4, 4]);
        assert.ok(player.melds.every(meld => meld.rows === 1));
        for (const rail of [player.hand, player.flowers, ...player.melds]) {
          assert.ok(rail.minimumTileWidth >= 13, `${width}: tiles use the available row width`);
          assert.equal(rail.allInsideRail, true, `${width}: every tile is visible in its rail on first render`);
          assert.equal(rail.noOverlap, true, `${width}: tiles never overlap`);
        }
      }
      assert.ok(metrics.rails.every(rail => rail.scrollWidth <= rail.width + 1 && rail.scrollLeft === 0), `${width}: no horizontal rail scrolling`);
      assert.ok(metrics.rails.every(rail => rail.label), `${width}: rail descriptions remain accessible`);
      assert.ok(metrics.bodyFonts.every(size => size >= 14), `${width}: readable body text`);
      assert.ok(metrics.eyebrowFont >= 12, `${width}: readable result eyebrow`);
      assert.ok(metrics.titleFont >= 22, `${width}: readable result title`);
      assert.ok(metrics.fontFamily.includes('sans-serif'));
      assert.ok(metrics.panelWidth <= width && metrics.pageWidth <= width, `${width}: no outer horizontal overflow`);
      assert.ok(metrics.panelScrollWidth <= metrics.panelClientWidth + 1, `${width}: no horizontal panel scrolling`);
      assert.equal(metrics.footerPosition, 'static', `${width}: action footer cannot overlay tiles`);
      if (width > 1000) assert.ok(metrics.panelWidth >= 960, 'desktop results use the available width');

      const visibleTiles = metrics.players.reduce((sum, player) => sum + player.hand.count + player.flowers.count + player.allMeldTiles.count, 0);
      assert.equal(visibleTiles, 84);
      await page.screenshot({ path: path.join(out, `result-layout-${width}-${scale}x.png`) });
      await page.locator('.result-panel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
      const footer = await page.evaluate(() => {
        const rows = document.querySelector('.rs-rows'); if (rows) rows.scrollTop = rows.scrollHeight;
        const button = document.getElementById('btnContinueNext').getBoundingClientRect();
        const last = document.querySelector('.result-player:last-of-type .rs-hand .tile:last-child').getBoundingClientRect();
        return { buttonTop: button.top, buttonBottom: button.bottom, lastTileBottom: last.bottom, height: innerHeight,
          clickHandler: typeof document.getElementById('btnContinueNext').onclick };
      });
      assert.ok(footer.lastTileBottom < footer.buttonTop, `${width}: last tiles remain above the next-hand button`);
      assert.ok(footer.buttonTop >= 0 && footer.buttonBottom <= height, `${width}: next-hand button remains accessible`);
      assert.equal(footer.clickHandler, 'function');
      await page.screenshot({ path: path.join(out, `result-layout-end-${width}-${scale}x.png`) });
      let nextHand = null;
      if (width === 943) {
        await page.locator('#btnContinueNext').click();
        await page.waitForFunction(() => S.phase !== 'end' && document.getElementById('reactionPanel').style.display === 'none');
        assert.equal(await page.locator('.result-panel').isVisible(), false);
        nextHand = await page.evaluate(() => { cancelGameTimers(); return { phase: S.phase, resultHidden: document.getElementById('reactionPanel').style.display === 'none' }; });
      }
      const naturalExample = await page.evaluate(() => {
          // Presentation example from the game's actual opening deal, without oversized synthetic hands.
          cancelGameTimers();
          S = window.resultNaturalExample.state;
          seatNames = window.resultNaturalExample.seats;
          Object.assign(S, { phase: 'end', winner: null, fromPlayer: null, winTile: null, resultDetail: null, flowerWin: null });
          const before = JSON.stringify(S.players);
          const hands = S.players.map(player => player.hand.map(tileKey));
          const flowers = S.players.map(player => player.flowers.map(tileKey));
          showHandsAndContinue();
          const shownHands = [...document.querySelectorAll('.rs-hand')].map(rail =>
            [...rail.querySelectorAll('[data-crystal-key]')].map(tile => tile.dataset.crystalKey));
          return { playerDataUnchanged: before === JSON.stringify(S.players), hands, flowers, shownHands,
            meldCounts: S.players.map(player => player.melds.length), dealer: S.dealer };
      });
      assert.equal(naturalExample.playerDataUnchanged, true);
      assert.equal(naturalExample.hands.length, 4);
      naturalExample.hands.forEach((hand, i) => {
        assert.equal(hand.length, i === naturalExample.dealer ? 17 : 16, `natural example player ${i}: original dealt hand size`);
        assert.deepEqual([...hand].sort(), [...naturalExample.shownHands[i]].sort());
        assert.equal(naturalExample.meldCounts[i], 0);
      });
      assert.ok(naturalExample.flowers.flat().length <= 8);
      await page.screenshot({ path: path.join(out, `result-example-${width}-${scale}x.png`) });
      results.push({ width, height, scale, visibleTiles, ...metrics, footer, nextHand, naturalExample });
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'result-layout.json'), JSON.stringify({ passed: true, results, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, viewports: results.map(({ width, scale, visibleTiles, panelWidth, players }) =>
      ({ width, scale, visibleTiles, panelWidth, handTileWidth: players[0].hand.minimumTileWidth })), errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
