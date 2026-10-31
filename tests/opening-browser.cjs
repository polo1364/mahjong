const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const out = path.join(__dirname, '../artifacts');
const url = process.env.MAHJONG_URL || pathToFileURL(path.join(__dirname, '../index.html')).href;
const checks = [];
const errors = [];

async function instrument(context) {
  await context.addInitScript(() => {
    let seed = 3;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    window.openingRecords = [];
    let opening;
    Object.defineProperty(window, 'MahjongOpening', {
      configurable: true,
      get: () => opening,
      set: api => {
        opening = {
          ...api,
          play(options) {
            const record = {
              dice: options.dice.slice(), dealer: options.dealer,
              counts: options.handCounts.slice(), order: options.dealOrder.slice(),
              style: options.style, reduced: options.reduced,
              phases: [], started: performance.now()
            };
            window.openingRecords.push(record);
            return api.play({
              ...options,
              onPhase: phase => {
                record.phases.push(phase);
                options.onPhase?.(phase);
              }
            }).then(result => {
              record.result = result;
              record.durationMs = performance.now() - record.started;
              return result;
            });
          }
        };
      }
    });
    window.openingPhysicalIds = () => {
      const ids = [...S.wall, ...S.deadWall, ...S.players.flatMap(player => [
        ...player.hand, ...player.flowers, ...player.discards, ...player.melds.flatMap(meld => meld.tiles)
      ])].map(tile => tile.id);
      if (S.lastDiscard && !ids.includes(S.lastDiscard.tile.id)) ids.push(S.lastDiscard.tile.id);
      return ids;
    };
    window.openingFingerprint = () => JSON.stringify({
      wall: S.wall.map(tile => tile.id), deadWall: S.deadWall.map(tile => tile.id),
      players: S.players.map(player => ({
        hand: player.hand.map(tile => tile.id), flowers: player.flowers.map(tile => tile.id),
        points: player.points
      })), turn: S.turn, dealer: S.dealer
    });
  });
}

async function newPage(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(url);
  await require('./start-screen-helper.cjs').enterGame(page, { skipOpening: false, waitForPlay: false });
  await page.waitForFunction(() => window.MahjongOpening?.getState().active);
  return page;
}

async function lockSnapshot(page) {
  return page.evaluate(() => {
    const physical = openingPhysicalIds();
    return {
      phase: S.phase, discards: S.players.reduce((sum, player) => sum + player.discards.length, 0),
      lastDiscard: S.lastDiscard, physical: physical.length, unique: new Set(physical).size,
      points: S.players.reduce((sum, player) => sum + player.points, 0),
      timers: gameTimers.size, saveDisabled: document.getElementById('saveGameBtn').disabled,
      handVisible: getComputedStyle(document.querySelector('#yourHand').closest('.hand-meld-container')).visibility,
      gameContentHidden: [...document.querySelector('.mahjong-table').children]
        .filter(node => !node.classList.contains('opening-overlay'))
        .every(node => getComputedStyle(node).visibility === 'hidden'),
      overlayBackground: getComputedStyle(document.querySelector('.opening-overlay')).backgroundImage,
      overlayColor: getComputedStyle(document.querySelector('.opening-overlay')).backgroundColor,
      overlayLayer: getComputedStyle(document.querySelector('.opening-overlay')).zIndex,
      overlays: document.querySelectorAll('.opening-overlay').length
    };
  });
}

function assertLocked(snapshot) {
  assert.equal(snapshot.phase, 'deal');
  assert.equal(snapshot.discards, 0);
  assert.equal(snapshot.lastDiscard, null);
  assert.equal(snapshot.physical, 144);
  assert.equal(snapshot.unique, 144);
  assert.equal(snapshot.points, 400000);
  assert.equal(snapshot.timers, 0);
  assert.equal(snapshot.saveDisabled, true);
  assert.equal(snapshot.handVisible, 'hidden');
  assert.equal(snapshot.gameContentHidden, true);
  assert.equal(snapshot.overlayBackground, 'none');
  assert.equal(snapshot.overlayColor, 'rgba(0, 0, 0, 0)');
  assert.equal(snapshot.overlayLayer, '25');
  assert.equal(snapshot.overlays, 1);
}

async function settled(page) {
  await page.waitForFunction(() => S.phase !== 'deal' && !MahjongOpening.getState().active);
  return page.evaluate(() => {
    cancelGameTimers();
    return {
      phase: S.phase,
      overlays: document.querySelectorAll('.opening-overlay').length,
      locked: document.querySelector('.mahjong-table').classList.contains('is-opening'),
      gameContentRestored: [...document.querySelector('.mahjong-table').children]
        .every(node => getComputedStyle(node).visibility === 'visible'),
      openingAnimations: document.getAnimations().filter(animation =>
        animation.effect?.target?.className?.includes('opening-')).length,
      record: openingRecords.at(-1)
    };
  });
}

function assertClean(state) {
  assert.equal(state.phase, 'play');
  assert.equal(state.overlays, 0);
  assert.equal(state.locked, false);
  assert.equal(state.gameContentRestored, true);
  assert.equal(state.openingAnimations, 0);
}

async function restart(page) {
  if (await page.locator('#settingsPanel').isVisible()) await page.locator('#settingsCancel').click();
  const previous = await page.evaluate(() => openingRecords.length);
  if (await page.locator('#tableMenu').isHidden()) await page.locator('#tableMenuBtn').click();
  await page.locator('#tmTab-session').click();
  await page.locator('#newGameBtn').click();
  await page.waitForFunction(count => openingRecords.length === count + 1, previous);
}

async function feedbackSettings(page) {
  if (await page.locator('#tableMenu').isHidden()) await page.locator('#tableMenuBtn').click();
  await page.locator('#tmTab-view').click();
}

async function fullSequence(page, label) {
  const fingerprint = await page.evaluate(() => openingFingerprint());
  for (const [phase, delay] of [['shuffle', 300], ['dice', 560], ['wall', 330], ['deal', 550]]) {
    await page.waitForFunction(name => document.querySelector('.opening-overlay')?.dataset.phase === name, phase);
    await page.waitForTimeout(delay);
    assertLocked(await lockSnapshot(page));
    if (phase === 'shuffle') {
      const attempt = await page.evaluate(async () => {
        const before = openingFingerprint();
        onClickYourTile(0);
        return { unchanged: openingFingerprint() === before, save: await saveGame() };
      });
      assert.equal(attempt.unchanged, true);
      assert.equal(attempt.save, false);
    }
    if (phase === 'dice') {
      const dice = await page.evaluate(() => ({
        supplied: openingRecords.at(-1).dice,
        visible: [...document.querySelectorAll('.opening-die')].map(die => ({
          value: Number(die.dataset.value), topPips: die.querySelectorAll('.opening-die-top .opening-pip').length,
          aria: die.getAttribute('aria-label')
        })),
        log: document.getElementById('log').textContent
      }));
      assert.deepEqual(dice.visible.map(die => die.value), dice.supplied);
      assert.deepEqual(dice.visible.map(die => die.topPips), dice.supplied);
      dice.visible.forEach((die, i) => assert.ok(die.aria.includes(`${dice.supplied[i]}點`)));
      assert.ok(dice.log.includes(`擲骰：${dice.supplied[0]} + ${dice.supplied[1]}`));
    }
    if (phase === 'wall') {
      const wall = await page.evaluate(() => ({
        stacks: document.querySelectorAll('.opening-stack').length,
        tiles: document.querySelectorAll('.opening-wall .opening-tile').length,
        sides: [0, 1, 2, 3].map(side => document.querySelectorAll(`.opening-stack[data-side="${side}"]`).length)
      }));
      assert.deepEqual(wall, { stacks: 72, tiles: 144, sides: [18, 18, 18, 18] });
    }
    await page.locator('.mahjong-table').screenshot({ path: path.join(out, `opening-${label}-${phase}.png`) });
    checks.push({ scenario: `${label}-${phase}`, passed: true });
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.opening-seat')].every((seat, i) =>
    Number(seat.dataset.count) === openingRecords.at(-1).counts[i]));
  assert.equal(await page.evaluate(() => openingFingerprint()), fingerprint);
  const state = await settled(page);
  assertClean(state);
  assert.deepEqual(state.record.phases, ['shuffle', 'dice', 'wall', 'deal']);
  assert.equal(state.record.result.status, 'completed');
  assert.ok(state.record.durationMs >= 3500 && state.record.durationMs < 5500);
  checks.push({ scenario: `${label}-complete`, durationMs: state.record.durationMs, passed: true });
}

async function squareContainerChecks(browser) {
  const page = await browser.newPage({ viewport: { width: 844, height: 700 } });
  const results = [];
  try {
    for (const size of [220, 260, 330]) {
      await page.setContent(`<style>
        body{margin:20px;background:#18211d}*{box-sizing:border-box}
        .mahjong-table{position:relative;width:${size}px;height:${size}px;border-radius:20px}
        #handBack1{position:absolute;top:60px;left:35%;width:30%;height:12px}
        #handBack2,#handBack3{position:absolute;top:30%;height:40%;width:12px}
        #handBack2{left:12px}#handBack3{right:12px}
        #yourHand{position:absolute;left:calc(100% + 20px);top:80px;width:240px;height:40px}
        </style><div class="mahjong-table"><div id="handBack1"></div><div id="handBack2"></div>
        <div id="handBack3"></div><div id="yourHand"></div></div>`);
      await page.addStyleTag({ path: path.join(__dirname, '../opening-animation.css') });
      await page.addScriptTag({ path: path.join(__dirname, '../opening-animation.js') });
      // Let the browser deliver its initial resize before starting the cancellable animation.
      await page.waitForTimeout(150);
      await page.evaluate(() => {
        window.squareDone = null; window.squarePhases = [];
        MahjongOpening.play({
          dice: [3, 5], dealer: 0, handCounts: [17, 16, 16, 16],
          onPhase: phase => squarePhases.push(phase)
        }).then(result => { window.squareDone = result; });
      });
      await page.waitForFunction(() => document.querySelector('.opening-overlay')?.dataset.phase === 'dice');
      const diceClear = await page.evaluate(() => {
        const dice = document.querySelector('.opening-dice-result').getBoundingClientRect();
        const skip = document.querySelector('.opening-skip').getBoundingClientRect();
        return dice.bottom <= skip.top;
      });
      assert.equal(diceClear, true);
      await page.waitForFunction(() => document.querySelector('.opening-overlay')?.dataset.phase === 'deal');
      const geometry = await page.evaluate(() => {
        const root = document.querySelector('.opening-overlay').getBoundingClientRect();
        const skip = document.querySelector('.opening-skip').getBoundingClientRect();
        const progress = [...document.querySelectorAll('.opening-progress span')]
          .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0);
        const wall = [...document.querySelectorAll('.opening-wall .opening-tile')].map(node => node.getBoundingClientRect());
        const seats = [...document.querySelectorAll('.opening-seat')].map(node => node.getBoundingClientRect());
        const collision = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left)
          && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
        const halfArrival = parseFloat(getComputedStyle(document.querySelector('.opening-tile')).width) * .72 * .88;
        return {
          size: root.width, narrow: document.querySelector('.opening-overlay').classList.contains('opening-narrow'),
          skipProgressOverlap: progress.some(rect => collision(rect, skip)),
          skipInside: skip.left >= root.left && skip.right <= root.right && skip.top >= root.top && skip.bottom <= root.bottom,
          wallsInside: wall.every(rect => rect.left >= root.left && rect.right <= root.right && rect.top >= root.top && rect.bottom <= root.bottom),
          topHandClearance: Math.min(...wall.map(rect => rect.top)) - seats[1].top - halfArrival,
          bottomHandClearance: seats[0].top - Math.max(...wall.map(rect => rect.bottom)) - halfArrival,
          seats: seats.map(rect => ({ x: rect.left - root.left, y: rect.top - root.top }))
        };
      });
      assert.equal(geometry.narrow, true);
      assert.equal(geometry.skipProgressOverlap, false);
      assert.equal(geometry.skipInside, true);
      assert.equal(geometry.wallsInside, true);
      assert.ok(geometry.topHandClearance > 2);
      assert.ok(geometry.bottomHandClearance > 2);
      assert.equal(geometry.seats[2].x, 18);
      assert.equal(geometry.seats[3].x, size - 18);
      assert.equal(geometry.seats[0].x, size / 2, 'outside self rail uses the inside bottom seat');
      await page.waitForFunction(() => [...document.querySelectorAll('.opening-seat')].reduce((sum, seat) => sum + Number(seat.dataset.count || 0), 0) === 65);
      await page.locator('.mahjong-table').screenshot({ path: path.join(out, `opening-square-${size}.png`) });
      await page.waitForFunction(() => !!window.squareDone);
      assert.deepEqual(await page.evaluate(() => squarePhases), ['shuffle', 'dice', 'wall', 'deal']);
      assert.equal(await page.evaluate(() => squareDone.status), 'completed');
      await page.evaluate(() => { MahjongOpening.play({ dice: [1, 6] }); });
      await page.locator('.opening-skip').click();
      assert.equal(await page.locator('.opening-overlay').count(), 0);
      assert.equal(await page.evaluate(() => MahjongOpening.getState().active), false);
      results.push({ ...geometry, diceClear, completed: true, skipClickable: true });
    }
    const report = {
      passed: true, results,
      boundary: 'Isolated 220/260/330 square containers inside an 844px viewport, vertical opponent rails and an outside self rail. Full page integration is a separate run.'
    };
    fs.writeFileSync(path.join(out, 'opening-square-check.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await page.close(); }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    if (process.argv.includes('--square-only')) {
      await squareContainerChecks(browser);
      return;
    }
    const recording = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: path.join(out, 'opening-recording'), size: { width: 1440, height: 1000 } }
    });
    await instrument(recording);
    const recordedPage = await newPage(recording);
    await fullSequence(recordedPage, 'desktop');
    const video = recordedPage.video();
    await recordedPage.close();
    await video.saveAs(path.join(out, 'opening-sequence-desktop.webm'));
    await video.delete();
    await recording.close();

    const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
    await instrument(context);
    const page = await newPage(context);
    await fullSequence(page, 'mobile');

    await page.evaluate(() => {
      cancelGameTimers();
      S.phase = 'end'; S.winner = null; S.winTile = null; S.fromPlayer = null;
      showHandsAndContinue();
    });
    const beforeNext = await page.evaluate(() => openingRecords.length);
    await page.locator('#btnContinueNext').click();
    assert.equal(await page.evaluate(() => openingRecords.length), beforeNext + 1);
    assertLocked(await lockSnapshot(page));
    await page.locator('.opening-skip').click();
    assertClean(await settled(page));
    checks.push({ scenario: 'next-hand-button-and-skip', passed: true });

    await restart(page);
    assertLocked(await lockSnapshot(page));
    await page.keyboard.press('Escape');
    assertClean(await settled(page));
    checks.push({ scenario: 'restart-and-escape', passed: true });

    await restart(page);
    const oldIndex = await page.evaluate(() => openingRecords.length - 1);
    await restart(page);
    assert.equal(await page.evaluate(i => openingRecords[i].result.status, oldIndex), 'cancelled');
    assertLocked(await lockSnapshot(page));
    await page.locator('.opening-skip').click();
    assertClean(await settled(page));
    checks.push({ scenario: 'cancel-during-restart', passed: true });

    await restart(page);
    await page.setViewportSize({ width: 932, height: 430 });
    const resized = await settled(page);
    assertClean(resized);
    assert.equal(resized.record.result.status, 'skipped');
    assert.equal(resized.record.result.reason, 'resize');
    checks.push({ scenario: 'resize-fast-forward', passed: true });

    await restart(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const background = await settled(page);
    assertClean(background);
    assert.equal(background.record.result.reason, 'background');
    await page.evaluate(() => {
      delete document.hidden; delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    checks.push({ scenario: 'background-visibility-handler-controlled-event', passed: true });

    assert.equal(await page.evaluate(() => saveGame()), true);
    const saved = await page.evaluate(() => openingFingerprint());
    await restart(page);
    const beforeLoad = await page.evaluate(() => openingRecords.length);
    if (await page.locator('#tableMenu').isHidden()) await page.locator('#tableMenuBtn').click();
    await page.locator('#loadGameBtn').click();
    await page.waitForFunction(() => S.phase === 'play' && !MahjongOpening.getState().active);
    await page.evaluate(() => cancelGameTimers());
    assert.equal(await page.evaluate(() => openingFingerprint()), saved);
    assert.equal(await page.evaluate(() => openingRecords.length), beforeLoad);
    assertClean(await settled(page));
    checks.push({ scenario: 'indexeddb-load-cancels-opening-without-replay', passed: true });

    for (const style of ['ink', 'neon']) {
      await feedbackSettings(page);
      await page.locator('#effectStyle').selectOption(style);
      await restart(page);
      assertLocked(await lockSnapshot(page));
      assert.equal(await page.locator('.opening-overlay').isVisible(), true, 'restart from tools returns to the table');
      await page.waitForFunction(() => document.querySelector('.opening-overlay')?.dataset.phase === 'wall');
      assert.equal(await page.locator(`.opening-${style}`).count(), 1);
      await page.waitForTimeout(280);
      await page.locator('.mahjong-table').screenshot({ path: path.join(out, `opening-${style}-wall.png`) });
      await page.locator('.opening-skip').click();
      assertClean(await settled(page));
      checks.push({ scenario: `style-${style}`, passed: true });
    }
    await feedbackSettings(page);
    await page.locator('#effectStyle').selectOption('off');
    await restart(page);
    assert.equal(await page.locator('.opening-reduced').count(), 1);
    const off = await settled(page);
    assertClean(off);
    assert.ok(off.record.durationMs < 1000);
    checks.push({ scenario: 'effects-off-short-fade', durationMs: off.record.durationMs, passed: true });

    await feedbackSettings(page);
    await page.locator('#effectStyle').selectOption('jade');
    await page.locator('#reduceEffects').check();
    await restart(page);
    assert.equal(await page.locator('.opening-reduced').count(), 1);
    const reduced = await settled(page);
    assertClean(reduced);
    assert.ok(reduced.record.durationMs < 1000);
    checks.push({ scenario: 'user-reduced-motion', durationMs: reduced.record.durationMs, passed: true });

    await feedbackSettings(page);
    await page.locator('#reduceEffects').uncheck();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await restart(page);
    assert.equal(await page.locator('.opening-reduced').count(), 1);
    const osReduced = await settled(page);
    assertClean(osReduced);
    assert.ok(osReduced.record.durationMs < 1000);
    checks.push({ scenario: 'os-reduced-motion', durationMs: osReduced.record.durationMs, passed: true });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const [width, height] of [[568, 320], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await restart(page);
      await page.waitForFunction(() => document.querySelector('.opening-overlay')?.dataset.phase === 'deal');
      assertLocked(await lockSnapshot(page));
      const geometry = await page.evaluate(() => {
        const root = document.querySelector('.opening-overlay').getBoundingClientRect();
        const skip = document.querySelector('.opening-skip').getBoundingClientRect();
        const progress = document.querySelector('.opening-progress').getBoundingClientRect();
        const tiles = [...document.querySelectorAll('.opening-wall .opening-tile')].map(tile => tile.getBoundingClientRect());
        return {
          compact: document.querySelector('.opening-overlay').classList.contains('opening-compact'),
          allWallsInside: tiles.every(tile => tile.left >= root.left - 1 && tile.right <= root.right + 1
            && tile.top >= root.top - 1 && tile.bottom <= root.bottom + 1),
          skipProgressOverlap: Math.min(skip.right, progress.right) > Math.max(skip.left, progress.left)
            && Math.min(skip.bottom, progress.bottom) > Math.max(skip.top, progress.top)
        };
      });
      assert.equal(geometry.compact, true);
      assert.equal(geometry.allWallsInside, true);
      assert.equal(geometry.skipProgressOverlap, false);
      await page.locator('.mahjong-table').screenshot({ path: path.join(out, `opening-compact-${width}x${height}.png`) });
      await page.locator('.opening-skip').click();
      assertClean(await settled(page));
      checks.push({ scenario: `compact-${width}x${height}`, ...geometry, passed: true });
    }
    const lifecycle = await page.evaluate(async () => {
      const details = { dice: [3, 5], dealer: 0, handCounts: [17, 16, 16, 16], dealOrder: [0, 3, 1, 2], style: 'jade' };
      const before = JSON.stringify(S);
      const originalRandom = Math.random;
      let randomCalls = 0;
      Math.random = () => { randomCalls++; return originalRandom(); };
      const results = [];
      try {
        let promise = MahjongOpening.play(details);
        MahjongOpening.cancel('module-check');
        results.push(await promise);
        promise = MahjongOpening.play(details);
        MahjongOpening.finish(); MahjongOpening.finish();
        results.push(await promise);
        const replaced = MahjongOpening.play(details);
        const reduced = MahjongOpening.play({ ...details, reduced: true });
        results.push(await replaced, await reduced);
        results.push(await MahjongOpening.play({ ...details, dice: [0, 8] }));
        results.push(await MahjongOpening.play({ ...details, container: {} }));
        results.push(await MahjongOpening.play({ ...details, onPhase: () => MahjongOpening.cancel('phase-cancel') }));
      } finally {
        Math.random = originalRandom;
      }
      return {
        results, randomCalls, engineUnchanged: JSON.stringify(S) === before,
        active: MahjongOpening.getState().active, overlays: document.querySelectorAll('.opening-overlay').length,
        animations: document.getAnimations().filter(animation => animation.effect?.target?.className?.includes('opening-')).length
      };
    });
    assert.deepEqual(lifecycle.results.map(result => result.status),
      ['cancelled', 'skipped', 'cancelled', 'completed', 'skipped', 'skipped', 'cancelled']);
    assert.equal(lifecycle.randomCalls, 0);
    assert.equal(lifecycle.engineUnchanged, true);
    assert.equal(lifecycle.active, false);
    assert.equal(lifecycle.overlays, 0);
    assert.equal(lifecycle.animations, 0);
    checks.push({ scenario: 'module-cancel-replace-invalid-and-reentrant-cleanup', passed: true });
    fs.writeFileSync(path.join(out, 'opening-module-report.json'), JSON.stringify({
      passed: true, lifecycle,
      fullSequences: checks.filter(check => /^(desktop|mobile|compact)/.test(check.scenario)),
      diceCheck: 'Visible upward face pip count and aria match supplied dice in fullSequence assertions.'
    }, null, 2));
    await context.close();
    assert.deepEqual(errors, []);
    const report = {
      passed: true, checks: checks.length, results: checks, errors,
      video: 'opening-sequence-desktop.webm',
      boundary: 'Real local page in Chromium with deterministic game RNG; full desktop/mobile sequences, real IndexedDB save/load and UI buttons. End-hand fixture opens the genuine next-hand button. Background handler uses a controlled visibilitychange event; physical devices and actual OS background suspension were not tested.'
    };
    fs.writeFileSync(path.join(out, 'opening-browser-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch(error => {
  const reportFile = process.argv.includes('--square-only') ? 'opening-square-check.json' : 'opening-browser-report.json';
  fs.writeFileSync(path.join(out, reportFile), JSON.stringify({
    passed: false, checks: checks.length, results: checks, errors: [...errors, error.stack]
  }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
