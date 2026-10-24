const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '../artifacts');
const url = process.env.MAHJONG_URL || 'http://127.0.0.1:8765';
const viewports = [[320, 568], [390, 844], [844, 390], [943, 889], [1280, 800], [1440, 1000]];
const scenarios = [
  { name: 'dense17', hand: 'W7 W7 W8 W8 W9 T7 T7 T8 T8 T9 B7 B8 B9 FE FS FW FN', melds: [] },
  { name: 'five-kongs', hand: 'FE FS', melds: ['W1', 'T1', 'B1', 'DC', 'DF'].map(key =>
    ({ type: 'kong', concealed: true, tiles: Array(4).fill(key).join(' ') })) }
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [], errors = [];
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play');
    await page.evaluate(() => {
      cancelGameTimers();
      window.insideRackFixture = spec => {
        cancelGameTimers(); S = null; startNewHand(true); cancelGameTimers(); hideReactionPanel();
        const pool = generateTiles();
        const take = key => {
          const index = pool.findIndex(tile => tileKey(tile) === key);
          if (index < 0) throw new Error(`Missing physical tile ${key}`);
          return pool.splice(index, 1)[0];
        };
        const takeHand = text => text ? text.split(' ').map(take) : [];
        const takeOrdinary = () => {
          const index = pool.findIndex(tile => tile.suit !== 'H');
          if (index < 0) throw new Error('No ordinary physical tile remains');
          return pool.splice(index, 1)[0];
        };
        S.players.forEach(player => Object.assign(player, {
          hand: [], melds: [], flowers: [], discards: [], draws: 3,
          passedHu: false, passedPong: [], lastDiscardKey: null, discardBan: [],
          declaredListen: false, tingLocked: false, autoMode: false, rinshan: false,
          drawnTile: null, waitKeys: [], tianTing: false, diTing: false
        }));
        const me = S.players[0];
        me.hand = takeHand(spec.hand);
        me.melds = spec.melds.map(meld => ({ ...meld, tiles: takeHand(meld.tiles) }));
        me.flowers = takeHand('H1 H2 H5 H6');
        me.discards = Array.from({ length: 24 }, takeOrdinary);
        S.players[2].discards = Array.from({ length: 12 }, takeOrdinary);
        S.players[3].discards = Array.from({ length: 12 }, takeOrdinary);
        for (let pid = 1; pid < 4; pid++) S.players[pid].hand = Array.from({ length: 16 }, takeOrdinary);
        S.deadWall = pool.splice(0, 16);
        S.wall = pool;
        S.remain = S.wall.length;
        Object.assign(S, { phase: 'play', turn: 0, dealer: 0, round: 1, dealerStreak: 0, drawCount: 60,
          lastDiscard: null, lastPlayed: null, waitReact: null, currentReactions: null,
          winner: null, fromPlayer: null, winTile: null, resultDetail: null, flowerWin: null,
          robKong: false, pendingKong: null, lastAction: 'draw', lastActor: 0,
          anyOpenMeld: false, kongCount: countKongs(me) });
        me.drawnTile = me.hand.at(-1);
        seatNames = ['東', '西', '北', '南'];
        renderAll();
        const physical = [...S.wall, ...S.deadWall, ...S.players.flatMap(player =>
          [...player.hand, ...player.flowers, ...player.discards, ...player.melds.flatMap(meld => meld.tiles)])];
        return { physicalCount: physical.length, uniqueIds: new Set(physical.map(tile => tile.id)).size,
          handCount: me.hand.length, meldCount: me.melds.flatMap(meld => meld.tiles).length,
          selfDiscards: me.discards.length, sideDiscards: [S.players[2].discards.length, S.players[3].discards.length], flowers: me.flowers.length };
      };
      window.inspectRackTile = element => {
        const rect = element.getBoundingClientRect();
        const box = value => Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, +value[key].toFixed(2)]));
        const table = document.getElementById('playersGrid').getBoundingClientRect();
        const inside = rect.left >= table.left - .1 && rect.right <= table.right + .1 &&
          rect.top >= table.top - .1 && rect.bottom <= table.bottom + .1;
        const landmarks = [document.getElementById('playerInfo0'), ...document.querySelectorAll('#meldArea0 .flower-row .tile')];
        const collisions = landmarks.flatMap(landmark => {
          const other = landmark.getBoundingClientRect();
          if (!other.width || !other.height) return [];
          const overlapX = Math.min(rect.right, other.right) - Math.max(rect.left, other.left);
          const overlapY = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top);
          return overlapX > .1 && overlapY > .1 ? [{ target: landmark.id || landmark.getAttribute('title'), box: box(other), overlapX: +overlapX.toFixed(2), overlapY: +overlapY.toFixed(2) }] : [];
        });
        const discardCollisions = [...document.querySelectorAll('#discardArea0 .tile')].flatMap(discard => {
          const other = discard.getBoundingClientRect();
          if (!other.width || !other.height) return [];
          const overlapX = Math.min(rect.right, other.right) - Math.max(rect.left, other.left);
          const overlapY = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top);
          return overlapX > .1 && overlapY > .1 ? [{ target: discard.getAttribute('title'), box: box(other), overlapX: +overlapX.toFixed(2), overlapY: +overlapY.toFixed(2) }] : [];
        });
        const insetX = Math.min(3, rect.width * .2), insetY = Math.min(3, rect.height * .15);
        const points = [
          ['top-left', rect.left + insetX, rect.top + insetY],
          ['top-right', rect.right - insetX, rect.top + insetY],
          ['center', rect.left + rect.width / 2, rect.top + rect.height / 2]
        ];
        const hits = points.map(([point, x, y]) => {
          const target = document.elementFromPoint(x, y);
          const owner = target?.closest('[id]');
          return { point, x: +x.toFixed(2), y: +y.toFixed(2), clear: !!target && element.contains(target),
            target: target ? `${owner?.id ? '#' + owner.id + ' ' : ''}${target.tagName.toLowerCase()}.${[...target.classList].join('.')}` : 'outside viewport' };
        });
        return { key: element.querySelector('[data-crystal-key]')?.dataset.crystalKey || element.title,
          box: box(rect), table: box(table), inside, collisions, discardCollisions, hits };
      };
    });
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      for (const scenario of scenarios) {
        await page.mouse.move(0, 0);
        const physical = await page.evaluate(spec => insideRackFixture(spec), scenario);
        assert.equal(physical.physicalCount, 144);
        assert.equal(physical.uniqueIds, 144);
        assert.equal(physical.selfDiscards, 24);
        assert.deepEqual(physical.sideDiscards, [12, 12]);
        await page.locator('#playersGrid').scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const metrics = await page.evaluate(() => {
          const hand = [...document.querySelectorAll('#yourHand button.tile')];
          const melds = [...document.querySelectorAll('#meldRail0 .rail-tile')];
          const measure = elements => ({ count: elements.length,
            rows: new Set(elements.map(el => Math.round(el.getBoundingClientRect().top))).size,
            minimumWidth: elements.length ? Math.min(...elements.map(el => el.getBoundingClientRect().width)) : null,
            tiles: elements.map(inspectRackTile) });
          const rails = ['yourHandArea', 'meldRail0'].map(id => {
            const el = document.getElementById(id);
            return { id, width: el.clientWidth, scrollWidth: el.scrollWidth, scrollLeft: el.scrollLeft };
          });
          const table = document.getElementById('playersGrid').getBoundingClientRect();
          const box = rect => Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, +rect[key].toFixed(2)]));
          const sideDiscardAreas = [2, 3].map(pid => ({ pid, rect: document.getElementById(`discardArea${pid}`).getBoundingClientRect() }));
          const ownDiscards = [...document.querySelectorAll('#discardArea0 .tile')].map(tile => {
            const rect = tile.getBoundingClientRect();
            return { key: tile.getAttribute('title'), box: box(rect), visible: rect.width > 0 && rect.height > 0,
              inside: rect.left >= table.left - .1 && rect.right <= table.right + .1 && rect.top >= table.top - .1 && rect.bottom <= table.bottom + .1,
              sideCollisions: sideDiscardAreas.filter(side => side.rect.width && side.rect.height &&
                Math.min(rect.right, side.rect.right) - Math.max(rect.left, side.rect.left) > .1 &&
                Math.min(rect.bottom, side.rect.bottom) - Math.max(rect.top, side.rect.top) > .1).map(side => ({ pid: side.pid, box: box(side.rect) })) };
          });
          return { hand: measure(hand), melds: measure(melds), rails, ownDiscards,
            mode: document.querySelector('.play-column').dataset.squareMode,
            pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
            visibleFlowers: [...document.querySelectorAll('#meldArea0 .flower-row .tile')].filter(el => el.getBoundingClientRect().width > 0).length,
            renderedDiscards: document.querySelectorAll('#discardArea0 .tile').length,
            sideDiscards: [2, 3].map(pid => document.querySelectorAll(`#discardArea${pid} .tile`).length) };
        });
        const failures = [];
        function fail(type, details) { failures.push({ type, ...details }); }
        if (metrics.hand.count !== physical.handCount || metrics.melds.count !== physical.meldCount) fail('missing-tiles', { physical, rendered: { hand: metrics.hand.count, melds: metrics.melds.count } });
        if (metrics.hand.rows !== 1 || (metrics.melds.count && metrics.melds.rows !== 1)) fail('wrapped-row', { hand: metrics.hand.rows, melds: metrics.melds.rows });
        for (const rail of metrics.rails) if (rail.scrollWidth > rail.width + 1 || rail.scrollLeft) fail('horizontal-overflow', rail);
        if (metrics.pageWidth > width) fail('page-overflow', { scrollWidth: metrics.pageWidth, width });
        for (const [index, tile] of metrics.ownDiscards.entries()) {
          if (!tile.visible || !tile.inside) fail('self-discard-outside-table', { index, ...tile });
          if (tile.sideCollisions.length) fail('self-discard-overlaps-side', { index, ...tile });
        }
        for (const [kind, group] of [['hand', metrics.hand], ['meld', metrics.melds]]) for (const [index, tile] of group.tiles.entries()) {
          if (!tile.inside) fail('outside-table', { phase: 'rest', kind, index, ...tile });
          if (tile.collisions.length) fail('name-or-flower-overlap', { phase: 'rest', kind, index, ...tile });
          if (tile.discardCollisions.length) fail('own-discard-overlap', { phase: 'rest', kind, index, ...tile });
        }
        let hoverChecks = 0, capturedFailure = false;
        for (const [kind, selector] of [['hand', '#yourHand button.tile'], ['meld', '#meldRail0 .rail-tile']]) {
          const tiles = page.locator(selector);
          for (let index = 0; index < await tiles.count(); index++) {
            const tile = tiles.nth(index);
            const initial = await tile.boundingBox();
            await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
            await page.waitForTimeout(170);
            const state = await tile.evaluate(el => inspectRackTile(el));
            if (!state.inside) fail('outside-table', { phase: 'hover', kind, index, ...state });
            if (state.collisions.length) fail('name-or-flower-overlap', { phase: 'hover', kind, index, ...state });
            if (state.discardCollisions.length) fail('own-discard-overlap', { phase: 'hover', kind, index, ...state });
            const blocked = state.hits.filter(hit => !hit.clear);
            hoverChecks += state.hits.length;
            if (blocked.length) fail('blocked-hit', { phase: 'hover', kind, index, key: state.key, box: state.box, hits: blocked });
            if (!capturedFailure && (blocked.length || state.collisions.length || state.discardCollisions.length || !state.inside)) {
              await page.screenshot({ path: path.join(out, `inside-rack-collision-${width}x${height}-${scenario.name}-1x.png`), fullPage: true });
              capturedFailure = true;
            }
          }
        }
        await page.mouse.move(0, 0);
        await page.waitForTimeout(170);
        await page.screenshot({ path: path.join(out, `inside-rack-${width}x${height}-${scenario.name}-1x.png`), fullPage: true });
        const result = { width, height, scenario: scenario.name, physical, ...metrics, hoverChecks, failures };
        results.push(result);
        console.log(JSON.stringify({ width, height, scenario: scenario.name, handWidth: metrics.hand.minimumWidth,
          hoverChecks, failureCount: failures.length, firstFailures: failures.slice(0, 3) }));
      }
    }
    const failures = results.flatMap(result => result.failures.map(failure => ({ width: result.width, height: result.height, scenario: result.scenario, ...failure })));
    const report = { passed: !failures.length && !errors.length, viewports: viewports.length, scenarios: results.length,
      hoverChecks: results.reduce((sum, result) => sum + result.hoverChecks, 0), errors, failures, results };
    fs.writeFileSync(path.join(out, 'inside-rack.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, viewports: report.viewports, scenarios: report.scenarios,
      hoverChecks: report.hoverChecks, failures: failures.length, errors }));
    assert.equal(report.passed, true, 'See artifacts/inside-rack.json for exact tile collisions and blockers');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
