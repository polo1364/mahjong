const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const out = path.join(__dirname, '../artifacts');
const viewports = [[568,320],[740,360],[844,390],[943,889],[1024,768],[1280,800],[1440,1000],[1920,1080]];
const hand17 = 'W1 W2 W4 W5 W7 W8 T1 T3 T5 T7 B1 B3 B5 FE FS FW FN';
const loose13 = 'W1 W2 W4 W6 W8 T1 T3 T5 T7 B1 B3 B5 FE';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [], errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(process.env.MAHJONG_URL || pathToFileURL(path.join(__dirname, '../index.html')).href);
    await require('./start-screen-helper.cjs').enterGame(page);
    await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play');
    await page.evaluate(() => {
      cancelGameTimers();
      window.handFixture = spec => {
        cancelGameTimers(); S = null; startNewHand(true); cancelGameTimers(); hideReactionPanel();
        const pool = generateTiles();
        const take = key => {
          const index = pool.findIndex(t => tileKey(t) === key);
          if (index < 0) throw new Error(`Missing physical tile ${key}`);
          return pool.splice(index, 1)[0];
        };
        const takeHand = text => text ? text.split(' ').map(take) : [];
        S.players.forEach(p => Object.assign(p, {
          hand: [], melds: [], flowers: [], discards: [], draws: 3,
          passedHu: false, passedPong: [], lastDiscardKey: null, discardBan: [],
          declaredListen: false, tingLocked: false, autoMode: false, rinshan: false,
          drawnTile: null, waitKeys: [], tianTing: false, diTing: false
        }));
        const me = S.players[0];
        me.hand = takeHand(spec.hand);
        me.melds = (spec.melds || []).map(m => ({ ...m, tiles: takeHand(m.tiles) }));
        me.flowers = takeHand(spec.flowers);
        const discarded = spec.discard ? take(spec.discard) : null;
        const replacements = (spec.replacements || []).map(take);
        const nextDraw = spec.nextDraw ? take(spec.nextDraw) : null;
        for (let pid = 1; pid < 4; pid++) {
          for (let n = 0; n < 16; n++) S.players[pid].hand.push(pool.splice(pool.findIndex(t => t.suit !== 'H'), 1)[0]);
        }
        if (discarded) S.players[spec.from ?? 2].hand.push(discarded);
        S.deadWall = pool.splice(0, 16 - replacements.length);
        S.deadWall.push(...replacements.reverse());
        S.wall = pool;
        if (nextDraw) S.wall.push(nextDraw);
        S.remain = S.wall.length;
        Object.assign(S, {
          phase: 'play', turn: discarded ? spec.from ?? 2 : 0,
          dealer: 0, round: 1, dealerStreak: 0, drawCount: 12, lastDiscard: null,
          lastPlayed: null, waitReact: null, currentReactions: null,
          winner: null, fromPlayer: null, winTile: null, resultDetail: null, flowerWin: null,
          robKong: false, pendingKong: null, lastAction: 'draw', lastActor: 0,
          anyOpenMeld: me.melds.some(m => !m.concealed), kongCount: countKongs(me)
        });
        if (me.hand.length === 17 - me.melds.length * 3) me.drawnTile = me.hand.at(-1);
        seatNames = ['東', '西', '北', '南'];
        renderAll();
        document.getElementById('yourHandArea').scrollLeft = 0;
        if (discarded) { discard(spec.from ?? 2, discarded); cancelGameTimers(); }
      };
    });
    async function fixture(spec) { await page.evaluate(spec => handFixture(spec), spec); }
    async function measure(name, expected) {
      await page.mouse.move(0, 0);
      // The game lifts a tile on hover; compare rows after that short transition settles.
      await page.waitForTimeout(180);
      const info = await page.locator('#yourHandArea').evaluate(area => {
        const tiles = [...area.querySelectorAll('button.tile')];
        const boxes = tiles.map(el => el.getBoundingClientRect());
        const table = document.getElementById('playersGrid').getBoundingClientRect();
        return {
          count: tiles.length, rows: new Set(boxes.map(r => Math.round(r.top))).size,
          width: area.clientWidth, scrollWidth: area.scrollWidth,
          minimumTileWidth: Math.min(...boxes.map(r => r.width)),
          mode: document.querySelector('.play-column').dataset.squareMode,
          tableWidth: table.width,
          ratioCorrect: boxes.every(r => Math.abs(r.width / r.height - 5 / 7) < .02),
          pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth
        };
      });
      assert.equal(info.count, expected, `${name}: tile count`);
      assert.equal(info.rows, 1, `${name}: one row`);
      // The side player card now reserves part of the table; measure usable hand width.
      const minimumWidth = Math.min(expected === 2 ? 26 : 32, Math.max(10, (info.width - 40) / expected * .85));
      assert.ok(info.minimumTileWidth >= minimumWidth, `${name}: usable tile size within available hand rail`);
      assert.equal(info.ratioCorrect, true, `${name}: 5:7 tile ratio`);
      assert.ok(info.pageWidth <= info.viewportWidth, `${name}: no page overflow`);
      assert.ok(info.scrollWidth <= info.width + 1, `${name}: complete hand fits without horizontal scrolling`);
      for (let index = 0; index < expected; index++) {
        const tile = page.locator('#yourHand button.tile').nth(index);
        const visible = await tile.evaluate(el => {
          const b = el.getBoundingClientRect(), a = document.getElementById('yourHandArea').getBoundingClientRect();
          const table = document.getElementById('playersGrid').getBoundingClientRect();
          return b.left >= a.left - 1 && b.right <= a.right + 1 && b.left >= table.left && b.right <= table.right &&
            b.top >= table.top && b.bottom <= table.bottom && el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
        });
        assert.equal(visible, true, `${name}: tile ${index + 1} is fully inside the table and unobstructed without scrolling`);
      }
      assert.equal(await page.locator('#meldRail0').evaluate(rail => {
        const rack = rail.parentElement.getBoundingClientRect();
        const table = document.getElementById('playersGrid').getBoundingClientRect();
        return rail.scrollWidth <= rail.clientWidth + 1 && [...rail.querySelectorAll('.rail-tile')].every(tile => {
          const box = tile.getBoundingClientRect();
          return box.left >= rack.left - 1 && box.right <= rack.right + 1 && box.left >= table.left && box.right <= table.right &&
            box.top >= table.top && box.bottom <= table.bottom;
        });
      }), true, `${name}: all melds visible without scrolling`);
      return info;
    }
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await fixture({ hand: hand17 });
      const opponentRails = [];
      for (const pid of [1,2,3]) {
        await fixture({ hand: hand17.split(' ').slice(0, 16).join(' ') });
        await page.evaluate(pid => {
          const index = S.wall.findIndex(t => t.suit !== 'H');
          S.players[pid].hand.push(S.wall.splice(index, 1)[0]);
          S.turn = pid; S.players[pid].drawnTile = S.players[pid].hand.at(-1);
          renderAll(); cancelGameTimers();
        }, pid);
        const backs = page.locator(`#handBack${pid} .tile-back`);
        const railInfo = await backs.evaluateAll((els, pid) => {
          const boxes = els.map(el => el.getBoundingClientRect());
          return { count: boxes.length, lines: new Set(boxes.map(r => Math.round(pid === 1 ? r.top : r.left))).size };
        }, pid);
        assert.equal(railInfo.count, 17, `${width}: opponent ${pid} keeps all 17 backs`);
        assert.equal(railInfo.lines, 1, `${width}: opponent ${pid} has only one line`);
        for (const back of await backs.all()) {
          await back.scrollIntoViewIfNeeded();
          assert.equal(await back.evaluate(el => {
            const b = el.getBoundingClientRect(), r = el.parentElement.getBoundingClientRect();
            return b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1 &&
              b.left >= 0 && b.right <= innerWidth;
          }), true, `${width}: opponent ${pid} every back can be viewed`);
        }
        const backRail = page.locator(`#handBack${pid}`);
        await backRail.scrollIntoViewIfNeeded();
        const scrollable = await backRail.evaluate(el => {
          el.scrollLeft = 0; el.scrollTop = 0;
          return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
        });
        assert.equal(scrollable, false, `${width}: opponent ${pid} all 17 backs fit without scrolling`);
        const size = await backs.first().evaluate(el => {
          const r = el.getBoundingClientRect();
          return { width: r.width, height: r.height };
        });
        assert.ok(Math.abs(size.width / size.height - (pid === 1 ? 1 / 1.05 : .64)) < .03,
          `${width}: opponent ${pid} correct standing perspective ratio`);
        railInfo.fitsWithoutScroll = true;
        railInfo.tileSize = size;
        opponentRails.push({ pid, ...railInfo });
      }
      await fixture({ hand: hand17 });
      await page.evaluate(() => [1,2,3].forEach(pid => {
        const el = document.getElementById(`handBack${pid}`); el.scrollLeft = 0; el.scrollTop = 0;
      }));
      const fullHand = await measure(`${width}: 17 tiles`, 17);
      await page.screenshot({ path: path.join(out, `hand-one-row-${width}.png`), fullPage: true });
      // Every concealed tile must be reachable and use the real discard click handler.
      let clicked = 0;
      for (let index = 0; index < 17; index++) {
        await fixture({ hand: hand17 });
        const tile = page.locator('#yourHand button.tile').nth(index);
        const originalIndex = Number((await tile.getAttribute('onclick')).match(/\((\d+)\)/)[1]);
        const tileId = await page.evaluate(index => S.players[0].hand[index].id, originalIndex);
        await tile.click();
        assert.equal(await page.evaluate(id => !S.players[0].hand.some(t => t.id === id), tileId), true, `${width}: actual discard ${index + 1}`);
        await page.evaluate(() => cancelGameTimers());
        clicked++;
      }
      await fixture({ hand: hand17 });
      await page.locator('#yourHandArea').scrollIntoViewIfNeeded();
      const rail = await page.locator('#yourHandArea').boundingBox();
      await page.mouse.move(rail.x + rail.width / 2, rail.y + rail.height / 2);
      await page.mouse.wheel(550, 0);
      await page.waitForTimeout(150);
      const wheelScrolled = await page.locator('#yourHandArea').evaluate(el => el.scrollLeft > 0);
      assert.equal(wheelScrolled, false, `${width}: horizontal wheel cannot move the fitted hand`);
      const scenarios = [];
      await fixture({ hand: hand17, flowers: 'H1 H2 H3 H4 H5 H6' });
      scenarios.push({ name: 'six flowers with 17 concealed tiles', ...await measure(`${width}: flowers`, 17) });
      await fixture({ hand: 'W1 W2 W4 T3 T5 T7 T9 B1 B3 B5 B7 B9 FE FS FW FN', discard: 'W3' });
      await page.locator('#btnChow').click(); await page.locator('.chowOpt:visible').first().click();
      assert.equal(await page.evaluate(() => S.players[0].melds[0]?.type), 'chow');
      scenarios.push({ name: 'after actual chow', ...await measure(`${width}: chow`, 14) });
      await fixture({ hand: 'DC DC ' + loose13 + ' FS', discard: 'DC' });
      await page.locator('#btnPong').click();
      assert.equal(await page.evaluate(() => S.players[0].melds[0]?.type), 'pong');
      scenarios.push({ name: 'after actual pong', ...await measure(`${width}: pong`, 14) });
      await fixture({ hand: 'DC DC DC ' + loose13, discard: 'DC', from: 1, replacements: ['FS'] });
      await page.locator('#btnKong').click();
      assert.equal(await page.evaluate(() => S.players[0].melds[0]?.type), 'kong');
      scenarios.push({ name: 'after actual open kong replacement', ...await measure(`${width}: kong`, 14) });
      await fixture({ hand: 'DC DC DC DC ' + loose13, flowers: 'H1 H2', replacements: ['H7', 'FS'] });
      await page.locator('#btnKong').click();
      assert.equal(await page.evaluate(() => S.players[0].melds[0]?.concealed), true);
      assert.equal(await page.evaluate(() => S.players[0].flowers.length), 3);
      scenarios.push({ name: 'after actual concealed kong and flower replacement', ...await measure(`${width}: concealed kong`, 14) });
      await fixture({
        hand: 'FE FS FW FN B8',
        melds: [{ type: 'chow', tiles: 'W1 W2 W3' }, { type: 'pong', tiles: 'DC DC DC' },
          { type: 'chow', tiles: 'T4 T5 T6' }, { type: 'kong', tiles: 'DF DF DF DF', concealed: true }],
        flowers: 'H1 H2 H3 H5'
      });
      scenarios.push({ name: 'four melds and four flowers', ...await measure(`${width}: four melds`, 5) });
      await fixture({ hand: 'FE FS', melds: ['W1', 'T1', 'B1', 'DC', 'DF'].map(key =>
        ({ type: 'kong', tiles: Array(4).fill(key).join(' '), concealed: true })) });
      scenarios.push({ name: 'five kongs and two concealed tiles', ...await measure(`${width}: five kongs`, 2) });
      await page.evaluate(() => cancelGameTimers());
      results.push({ width, height, fullHand, opponentRails, actualDiscards: clicked, wheelScrolled, scenarios });
      console.log(`PASS ${width}x${height}: one row; 17 actual tile clicks; ${scenarios.length} flower/meld scenarios`);
    }
    // Keep touch emulation isolated from mouse/wheel contexts; use real browser input dispatch.
    const fixtureSource = await page.evaluate(() => handFixture.toString());
    for (const [width, height] of viewports.filter(([width]) => width <= 844)) {
      const touchPage = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
      touchPage.on('pageerror', error => errors.push(error.message));
      await touchPage.goto(page.url());
      await require('./start-screen-helper.cjs').enterGame(touchPage);
      await touchPage.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play');
      await touchPage.evaluate(source => { cancelGameTimers(); window.handFixture = eval(`(${source})`); }, fixtureSource);
      await touchPage.evaluate(hand => handFixture({ hand }), hand17);
      await touchPage.locator('#yourHandArea').scrollIntoViewIfNeeded();
      const rail = await touchPage.locator('#yourHandArea').boundingBox();
      const input = await touchPage.context().newCDPSession(touchPage);
      const lastTile = touchPage.locator('#yourHand button.tile').last();
      const originalIndex = Number((await lastTile.getAttribute('onclick')).match(/\((\d+)\)/)[1]);
      const tileId = await touchPage.evaluate(index => S.players[0].hand[index].id, originalIndex);
      await lastTile.tap();
      // A tap's click can arrive a moment after tap() resolves.
      await touchPage.waitForFunction(id => !S.players[0].hand.some(tile => tile.id === id), tileId, { timeout: 2000 }).catch(() => {});
      assert.equal(await touchPage.evaluate(id => !S.players[0].hand.some(tile => tile.id === id), tileId), true,
        `${width}: rightmost tile responds to a real touch tap without scrolling`);
      // Checked after the tap: a synthetic swipe makes the next synthetic tap unreliable in every version.
      const x = rail.x + rail.width - 20, y = rail.y + rail.height / 2;
      await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await input.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: x - step * (rail.width - 40) / 8, y }]
        });
        await touchPage.waitForTimeout(20);
      }
      await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touchPage.waitForTimeout(180);
      const touchScrolled = await touchPage.locator('#yourHandArea').evaluate(el => el.scrollLeft > 0);
      assert.equal(touchScrolled, false, `${width}: native touch swipe cannot move the fitted hand`);
      results.find(result => result.width === width).touchScrolled = touchScrolled;
      await input.detach();
      await touchPage.close();
      console.log(`PASS ${width}: no horizontal touch scroll; rightmost tile tap`);
    }
    assert.deepEqual(errors, []);
    const report = { passed: true, actualDiscards: results.reduce((n, r) => n + r.actualDiscards, 0), errors, results };
    fs.writeFileSync(path.join(out, 'hand-layout.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: true, viewports: results.length, actualDiscards: report.actualDiscards, scenarios: results.length * 8, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
