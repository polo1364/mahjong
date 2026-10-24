const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { installFixture, scenarios } = require('./wide-table.cjs');
const { enterGame } = require('./start-screen-helper.cjs');

const out = path.join(__dirname, '../artifacts');
const url = process.env.MAHJONG_URL || 'http://127.0.0.1:8765';
const viewports = [[1440, 900], [943, 889], [390, 844], [320, 568], [844, 390], [568, 320]];
const flowerViewports = [[320, 568], [390, 844], [600, 600], [620, 620], [640, 900]];

async function installRiverFixture(page, count, topFlowers = null) {
  return page.evaluate(({ spec, count, topFlowers }) => {
    wideTableFixture(spec);
    const discards = S.players.flatMap(player => player.discards);
    const counts = Array.isArray(count) ? count : Array(4).fill(count);
    S.players.forEach((player, pid) => { player.discards = discards.splice(0, counts[pid]); });
    S.wall.push(...discards);
    S.remain = S.wall.length;
    if (topFlowers !== null) {
      const flowers = S.players.flatMap(player => player.flowers);
      S.players.forEach(player => { player.flowers = []; });
      S.players[1].flowers = flowers.splice(0, topFlowers);
      [0, 2, 3].forEach(pid => { S.players[pid].flowers = flowers.splice(0, 1); });
    }
    renderAll();
    MahjongTableLayout.fitNow();
    window.riverStateSnapshot = () => JSON.stringify(S);
    const physical = [...S.wall, ...S.deadWall, ...S.players.flatMap(player =>
      [...player.hand, ...player.flowers, ...player.discards, ...player.melds.flatMap(meld => meld.tiles)])];
    return { physicalCount: physical.length, uniqueIds: new Set(physical.map(tile => tile.id)).size,
      discardIds: S.players.map(player => player.discards.map(tile => tile.id)),
      flowerIds: S.players.map(player => player.flowers.map(tile => tile.id)),
      snapshot: riverStateSnapshot() };
  }, { spec: scenarios[0], count, topFlowers });
}

async function inspectRivers(page) {
  return page.evaluate(() => {
    const failures = [];
    const fail = (type, details) => failures.push({ type, ...details });
    const close = (a, b, tolerance = .7) => Math.abs(a - b) <= tolerance;
    const box = element => {
      const rect = element.getBoundingClientRect();
      return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, +rect[key].toFixed(3)]));
    };
    const normalizedAngle = angle => ((angle % 360) + 360) % 360;
    const effectiveAngle = (face, area) => {
      let angle = 0;
      for (let element = face; element && element !== area; element = element.parentElement) {
        const transform = getComputedStyle(element).transform;
        if (transform === 'none') continue;
        const matrix = new DOMMatrixReadOnly(transform);
        angle += Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
      }
      return normalizedAngle(angle);
    };
    const expectedAngles = [0, 180, 90, 270];
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > .1 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .1;
    const center = box(document.querySelector('.center-info-panel'));
    const rivers = [];
    for (let pid = 0; pid < 4; pid++) {
      const area = document.getElementById(`discardArea${pid}`);
      const tiles = [...area.querySelectorAll('.tile')];
      const expected = S.players[pid].discards.map(tile => keyToText(tileKey(tile)));
      const titles = tiles.map(tile => tile.title);
      if (JSON.stringify(titles) !== JSON.stringify(expected)) fail('discard-data-order-changed', { pid, expected, titles });
      const boxes = tiles.map(box);
      const angles = tiles.map(tile => effectiveAngle(tile.querySelector('.tile-art') || tile, area));
      for (let index = 0; index < tiles.length; index++) {
        const rect = boxes[index];
        const expectedRatio = pid < 2 ? 5 / 7 : 7 / 5;
        // A nonoverlapping one-pixel fallback is not a usable visible tile.
        if (Math.min(rect.width, rect.height) < 6) fail('discard-degenerate-size', { pid, index, minimumShortSide: 6, box: rect });
        if (!close(rect.width / rect.height, expectedRatio, .025)) fail('discard-face-aspect', { pid, index, expectedRatio, box: rect });
        if (!close(angles[index], expectedAngles[pid], .1)) fail('discard-face-direction', { pid, index, expectedAngle: expectedAngles[pid], actual: angles[index] });
        if (overlap(rect, center)) fail('discard-center-collision', { pid, index, box: rect, center });
        if (index % 6 !== 0) {
          const prior = boxes[index - 1];
          const sameLine = pid < 2 ? close(rect.top, prior.top) : close(rect.left, prior.left);
          const alongSeat = pid === 0 ? rect.left > prior.right : pid === 1 ? rect.right < prior.left :
            pid === 2 ? rect.top > prior.bottom : rect.bottom < prior.top;
          if (!sameLine || !alongSeat) fail('discard-seat-reading-order', { pid, index, prior, box: rect, sameLine, alongSeat });
        } else if (index) {
          const priorRow = boxes[index - 6];
          const aligned = pid < 2 ? close(rect.left, priorRow.left) : close(rect.top, priorRow.top);
          const towardCenter = pid === 0 ? rect.bottom < priorRow.top : pid === 1 ? rect.top > priorRow.bottom :
            pid === 2 ? rect.left > priorRow.right : rect.right < priorRow.left;
          if (!aligned || !towardCenter) fail('discard-next-row-toward-center', { pid, index, priorRow, box: rect, aligned, towardCenter });
        }
      }
      const lanes = new Set(boxes.map(rect => Math.round((pid < 2 ? rect.top : rect.left) * 10))).size;
      if (lanes !== Math.ceil(tiles.length / 6)) fail('discard-six-per-line', { pid, tiles: tiles.length, lanes });
      rivers.push({ pid, count: tiles.length, expected, titles, angles, boxes, lanes, area: box(area) });
    }
    const topBacks = [...document.querySelectorAll('#handBack1 .tile-back')].map((tile, index) => {
      const body = getComputedStyle(tile), back = getComputedStyle(tile, '::before'), cap = getComputedStyle(tile, '::after');
      const result = { index, box: box(tile), bodyBackground: body.backgroundImage, bodyShadow: body.boxShadow,
        back: { content: back.content, image: back.backgroundImage, transform: back.transform, width: back.width, height: back.height },
        cap: { content: cap.content, backgroundImage: cap.backgroundImage, backgroundColor: cap.backgroundColor,
          width: cap.width, height: cap.height, display: cap.display, opacity: cap.opacity, visibility: cap.visibility } };
      const opaqueCap = cap.backgroundImage !== 'none' || !['rgba(0, 0, 0, 0)', 'transparent'].includes(cap.backgroundColor);
      if (body.boxShadow === 'none' || cap.content === 'none' || cap.display === 'none' || Number(cap.opacity) === 0 ||
          cap.visibility === 'hidden' || parseFloat(cap.width) < 1 || parseFloat(cap.height) < 1 || !opaqueCap) {
        fail('top-standing-depth-or-cap-missing', result);
      }
      if (tile.querySelector('.tile-art') || back.backgroundImage === 'none' || back.content === 'none') fail('top-concealed-back-face-missing', result);
      if (overlap(result.box, center)) fail('top-hand-center-collision', { index, box: result.box, center });
      return result;
    });
    const centerElement = document.querySelector('.center-area');
    for (const tile of document.querySelectorAll('#playersGrid .tile, #playersGrid .tile-back')) {
      if (centerElement.contains(tile) || tile.closest('.discard-area, #handBack1')) continue;
      const rect = box(tile);
      if (overlap(rect, center)) fail('external-tile-center-collision', {
        container: tile.closest('[id]')?.id, title: tile.title, box: rect, center });
    }
    return { rivers, topBacks, center, failures, snapshot: riverStateSnapshot() };
  });
}

async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [], errors = [];
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await enterGame(page);
    await installFixture(page);
    const cases = viewports.flatMap(([width, height]) => [6, 7, 12, [8, 24, 8, 8]].map(count => ({ width, height, count, topFlowers: null })))
      .concat(flowerViewports.flatMap(([width, height]) => [5, 7].map(topFlowers => ({ width, height, count: 12, topFlowers }))));
    for (const { width, height, count, topFlowers } of cases) {
      await page.setViewportSize({ width, height });
      await page.mouse.move(0, 0);
        const physical = await installRiverFixture(page, count, topFlowers);
        assert.equal(physical.physicalCount, 144);
        assert.equal(physical.uniqueIds, 144);
        await page.waitForTimeout(240);
        const wide = await page.evaluate(() => inspectWideTable());
        const metrics = await inspectRivers(page);
        const stateUnchanged = metrics.snapshot === physical.snapshot;
        const failures = [...wide.failures, ...metrics.failures];
        let compactLastTile = null;
        if (count === 12 && topFlowers === null && await page.evaluate(() => document.documentElement.classList.contains('table-center-compact'))) {
          compactLastTile = await page.evaluate(() => {
            S.lastPlayed = { from: 0, tile: S.players[0].discards.at(-1) };
            renderAll(); MahjongTableLayout.fitNow();
            const panel = document.querySelector('.center-info-panel').getBoundingClientRect();
            const tile = document.querySelector('#lastPlay .tile').getBoundingClientRect();
            return { inside: tile.left >= panel.left && tile.right <= panel.right && tile.top >= panel.top && tile.bottom <= panel.bottom,
              roundFont: parseFloat(getComputedStyle(document.getElementById('centerRoundInfo')).fontSize),
              tileWidth: tile.width, tileHeight: tile.height };
          });
          const populated = await inspectRivers(page);
          failures.push(...populated.failures.map(failure => ({ phase: 'latest-public-tile', ...failure })));
          if (!compactLastTile.inside || compactLastTile.roundFont < 10) failures.push({ type: 'compact-center-clipping', ...compactLastTile });
        }
        if (!stateUnchanged) failures.push({ type: 'presentation-mutated-game-state' });
        delete physical.snapshot; delete metrics.snapshot;
        if (count === 12 || Array.isArray(count)) await page.screenshot({
          path: path.join(out, `standing-rivers-${width}x${height}${topFlowers ? `-flowers${topFlowers}` : Array.isArray(count) ? '-top24' : ''}.png`), fullPage: true });
        const result = { width, height, count, topFlowers, physical, stateUnchanged, table: wide.table,
          minimumObservedGap: wide.minimumObservedGap, groups: wide.groups, compactLastTile, ...metrics, failures };
        results.push(result);
        console.log(JSON.stringify({ width, height, count, topFlowers, failureCount: failures.length, firstFailures: failures.slice(0, 2) }));
    }
    const failures = results.flatMap(result => result.failures.map(failure => ({ width: result.width, height: result.height, count: result.count, topFlowers: result.topFlowers, ...failure })));
    const countTiles = group => group.reduce((sum, result) => sum + result.rivers.reduce((total, river) => total + river.count, 0), 0);
    const baseResults = results.filter(result => result.topFlowers === null), flowerResults = results.filter(result => result.topFlowers !== null);
    const report = { passed: !failures.length && !errors.length, viewports: new Set(results.map(result => `${result.width}x${result.height}`)).size, scenes: results.length,
      baseRivers: { viewports: viewports.length, scenes: baseResults.length, tileChecks: countTiles(baseResults), failures: baseResults.flatMap(result => result.failures).length },
      flowerStress: { viewports: flowerViewports.length, scenes: flowerResults.length, tileChecks: countTiles(flowerResults), failures: flowerResults.flatMap(result => result.failures).length },
      tileChecks: results.reduce((sum, result) => sum + result.rivers.reduce((total, river) => total + river.count, 0), 0), errors, failures, results };
    fs.writeFileSync(path.join(out, 'standing-rivers.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, viewports: report.viewports, scenes: report.scenes,
      tileChecks: report.tileChecks, failures: failures.length, errors }));
    assert.equal(report.passed, true, 'See artifacts/standing-rivers.json for ordering, rotation, depth, and layout evidence');
  } finally { await browser.close(); }
}

module.exports = { installRiverFixture, inspectRivers };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
