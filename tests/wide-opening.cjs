const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enterGame } = require('./start-screen-helper.cjs');
const { pathToFileURL } = require('node:url');

const out = path.join(__dirname, '../artifacts');
const url = process.env.MAHJONG_URL || pathToFileURL(path.join(__dirname, '../index.html')).href;
const viewports = [[320, 568], [390, 844], [844, 390], [943, 889], [1440, 900]];
const results = [], errors = [];

async function instrument(context) {
  await context.addInitScript(() => {
    let seed = 3;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    window.wideOpeningRecords = [];
    let opening;
    Object.defineProperty(window, 'MahjongOpening', {
      configurable: true,
      get: () => opening,
      set: api => {
        opening = {
          ...api,
          play(options) {
            const record = { before: JSON.stringify(S), counts: options.handCounts.slice(), phases: [] };
            wideOpeningRecords.push(record);
            return api.play({
              ...options,
              onPhase: phase => { record.phases.push(phase); options.onPhase?.(phase); }
            }).then(result => {
              record.result = result;
              record.unchanged = record.before === JSON.stringify(S);
              delete record.before;
              return result;
            });
          }
        };
      }
    });
  });
}

async function geometry(page) {
  return page.evaluate(() => {
    const box = el => {
      const rect = el.getBoundingClientRect();
      return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(key => [key, rect[key]]));
    };
    const table = document.getElementById('playersGrid');
    const overlay = table.querySelector('.opening-overlay');
    const inside = (child, parent, tolerance = 1) => child.left >= parent.left - tolerance
      && child.right <= parent.right + tolerance && child.top >= parent.top - tolerance
      && child.bottom <= parent.bottom + tolerance;
    const bounds = box(table);
    const center = box(table.querySelector('.center-info-panel'));
    const root = overlay && box(overlay);
    const walls = [...table.querySelectorAll('.opening-wall .opening-tile')].map(box);
    const hands = ['yourHand', 'handBack1', 'handBack2', 'handBack3'].map(id => box(document.getElementById(id)));
    const targets = [...table.querySelectorAll('.opening-seat')].map((seat, i) => {
      const target = box(seat), hand = hands[i];
      return { seat: i, x: target.left, y: target.top, hand,
        distance: Math.hypot(target.left - (hand.left + hand.width / 2), target.top - (hand.top + hand.height / 2)) };
    });
    const tileWidth = overlay ? parseFloat(getComputedStyle(overlay).getPropertyValue('--opening-tile-width')) : 0;
    const controls = overlay ? ['.opening-skip', '.opening-progress'].map(selector => ({ selector, ...box(overlay.querySelector(selector)) })) : [];
    const targetControlOverlaps = targets.flatMap(target => {
      const along = (Math.max(0, wideOpeningRecords.at(-1).counts[target.seat] - 1) * .34 + .44) * tileWidth;
      const across = .72 * .88 * tileWidth;
      const halfWidth = target.seat < 2 ? along : across, halfHeight = target.seat < 2 ? across : along;
      return controls.filter(control => Math.min(target.x + halfWidth, control.right) > Math.max(target.x - halfWidth, control.left)
        && Math.min(target.y + halfHeight, control.bottom) > Math.max(target.y - halfHeight, control.top))
        .map(control => ({ seat: target.seat, control: control.selector }));
    });
    const stage = overlay && box(overlay.querySelector('.opening-stage'));
    const dice = overlay && box(overlay.querySelector('.opening-dice-layer'));
    const physical = [...S.wall, ...S.deadWall, ...S.players.flatMap(player =>
      [...player.hand, ...player.flowers, ...player.discards, ...player.melds.flatMap(meld => meld.tiles)])];
    return { table: bounds, center, frame: box(document.querySelector('.table-frame')), overlay: root,
      phase: overlay?.dataset.phase, targets, targetControlOverlaps, wallCount: walls.length,
      wallsInside: walls.every(tile => inside(tile, root)),
      overlayInside: !overlay || inside(root, bounds),
      controlsHidden: [...table.children].filter(node => node !== overlay)
        .every(node => getComputedStyle(node).visibility === (overlay ? 'hidden' : 'visible')),
      centerDistance: stage ? Math.hypot(stage.left - (center.left + center.width / 2),
        stage.top - (center.top + center.height / 2)) : null,
      diceDistance: dice ? Math.hypot(dice.left - stage.left, dice.top - stage.top) : null,
      physical: physical.length, unique: new Set(physical.map(tile => tile.id)).size,
      record: wideOpeningRecords.at(-1),
      openingAnimations: document.getAnimations().filter(animation =>
        animation.effect?.target?.className?.includes('opening-')).length };
  });
}

async function completed(page) {
  await page.waitForFunction(() => !MahjongOpening.getState().active && S.phase === 'play');
  await page.evaluate(() => cancelGameTimers());
  const state = await geometry(page);
  assert.equal(state.overlay, null);
  assert.equal(state.controlsHidden, true);
  assert.equal(state.openingAnimations, 0);
  assert.equal(state.record.unchanged, true, 'presentation preserves the full game state');
  assert.equal(state.physical, 144);
  assert.equal(state.unique, 144);
  return state;
}

async function viewportCheck(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await instrument(context);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${width}x${height}: ${error.message}`));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(url);
    await enterGame(page, { skipOpening: false, waitForPlay: false });
    await page.waitForFunction(() => MahjongOpening.getState().active);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('table-scene')
      && typeof MahjongTableLayout.fitNow === 'function'), true, 'wide table and synchronous fitting are active');
    let first;
    const phases = [];
    for (const phase of ['shuffle', 'dice', 'wall', 'deal']) {
      await page.waitForFunction(phase => document.querySelector('.opening-overlay')?.dataset.phase === phase, phase);
      if (phase === 'wall') await page.waitForTimeout(400);
      const state = await geometry(page);
      first ||= state;
      assert.equal(state.phase, phase);
      assert.deepEqual(state.table, first.table, `${width}x${height}: table stays fixed during ${phase}`);
      assert.deepEqual(state.frame, first.frame, `${width}x${height}: frame stays fixed during ${phase}`);
      assert.equal(state.overlayInside, true);
      assert.equal(state.controlsHidden, true);
      assert.ok(state.centerDistance <= 1, `${width}x${height}: stage uses the live compass center`);
      assert.ok(state.diceDistance <= 1, `${width}x${height}: dice and wall share one center`);
      assert.equal(state.targets.length, 4);
      assert.deepEqual(state.targetControlOverlaps, [], `${width}x${height}: opening controls stay clear of all dealt hands`);
      for (const target of state.targets) assert.ok(target.distance <= 1,
        `${width}x${height}: seat ${target.seat} arrives at its actual hand (${target.distance}px)`);
      if (phase === 'wall' || phase === 'deal') {
        assert.equal(state.wallCount, 144);
        assert.equal(state.wallsInside, true, `${width}x${height}: every wall tile fits the actual table`);
      }
      phases.push(phase);
      if (phase === 'wall') await page.screenshot({ path: path.join(out, `wide-opening-${width}x${height}-wall.png`) });
    }
    const ending = await completed(page);
    assert.equal(ending.record.result.status, 'completed');
    assert.deepEqual(ending.record.phases, phases);
    assert.deepEqual(ending.table, first.table);
    assert.deepEqual(ending.frame, first.frame);
    assert.deepEqual(ending.center, first.center);
    const lifecycle = [];
    if (width === 390) {
      await page.evaluate(() => startNewHand(true));
      await page.locator('.opening-skip').click();
      const skipped = await completed(page);
      assert.equal(skipped.record.result.status, 'skipped');
      assert.equal(skipped.record.result.reason, 'skip');
      lifecycle.push('skip');
      await page.evaluate(() => startNewHand(true));
      await page.setViewportSize({ width: 844, height: 390 });
      const resized = await completed(page);
      assert.equal(resized.record.result.status, 'skipped');
      assert.equal(resized.record.result.reason, 'resize');
      lifecycle.push('resize');
    }
    results.push({ width, height, phases, table: first.table, center: first.center, frame: first.frame,
      targetDistances: first.targets.map(target => target.distance), wallsInside: true,
      unchanged: ending.record.unchanged, lifecycle });
    console.log(`PASS ${width}x${height}: four phases, fixed table, 144 wall tiles, four exact hand targets, unchanged state`);
  } catch (error) {
    await page.screenshot({ path: path.join(out, `wide-opening-${width}x${height}-failure.png`) }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const checks = await Promise.allSettled(viewports.map(([width, height]) => viewportCheck(browser, width, height)));
    for (const check of checks) if (check.status === 'rejected') errors.push(check.reason.stack);
    assert.deepEqual(errors, []);
    assert.equal(results.length, viewports.length);
    fs.writeFileSync(path.join(out, 'wide-opening-report.json'), JSON.stringify({ passed: true, results, errors,
      boundary: 'Isolated Chromium at DPR 1; full opening at five viewport sizes plus real skip button and viewport resize. No physical device validation.' }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  fs.writeFileSync(path.join(out, 'wide-opening-report.json'), JSON.stringify({ passed: false, results, errors: [...errors, error.stack] }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
