const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enterGame } = require('./start-screen-helper.cjs');

const url = process.env.MAHJONG_URL || 'http://127.0.0.1:8765';
const out = path.join(__dirname, '../artifacts');
const sizes = [[1440, 900], [943, 889], [390, 844], [320, 568], [844, 390], [568, 320]];
const results = [], errors = [];

async function ready(page) {
  await page.waitForFunction(() => window.MahjongStartScreen?.state === 'home'
    && !document.getElementById('startGameBtn').disabled);
}

async function inspect(page) {
  return page.evaluate(() => {
    const screen = document.getElementById('startScreen');
    const controls = [...screen.querySelectorAll('button:not(:disabled)')]
      .filter(el => el.getBoundingClientRect().width > 0);
    const bounds = screen.getBoundingClientRect();
    const hiddenFocusTargets = [...document.querySelectorAll('.shell button,#tableMenuBtn')]
      .filter(el => !el.closest('[inert]') && el.getBoundingClientRect().width > 0);
    return {
      state: MahjongStartScreen.state, game: S, timers: gameTimers.size,
      opening: MahjongOpening.getState().active,
      voices: MahjongVoice.getState(),
      horizontalOverflow: screen.scrollWidth > screen.clientWidth + 1,
      controls: controls.map(el => {
        const rect = el.getBoundingClientRect();
        return { id: el.id, width: rect.width, height: rect.height,
          insideX: rect.left >= bounds.left && rect.right <= bounds.right,
          textClipped: el.scrollWidth > el.clientWidth + 1 };
      }), hiddenFocusTargets: hiddenFocusTargets.map(el => el.id)
    };
  });
}

async function putSave(page, value) {
  await page.evaluate(async value => {
    const db = await initDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error);
        tx.objectStore(STORE_NAME).put(value, AUTO_SAVE_KEY);
      });
    } finally { db.close(); }
  }, value);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of sizes) {
      const context = await browser.newContext({ viewport: { width, height } });
      await context.addInitScript(() => {
        localStorage.setItem('qinghe_feedback_v1', JSON.stringify({ sound: true, voice: true, ambience: false }));
      });
      const page = await context.newPage();
      page.on('pageerror', err => errors.push(`${width}x${height}: ${err.message}`));
      await page.goto(url);
      await ready(page);
      await page.waitForTimeout(500);
      if (height > width) {
        assert.equal(await page.locator('#landscapeNotice').evaluate(el => el.open), true);
        assert.equal(await page.evaluate(() => S), null, 'portrait must not start a hidden game');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#landscapeNotice').evaluate(el => el.open), true);
        await page.screenshot({ path: path.join(out, `start-portrait-${width}x${height}.png`) });
        results.push({ width, height, portraitBlocked: true, passed: true });
        await context.close();
        continue;
      }
      const home = await inspect(page);
      assert.equal(home.game, null, 'home must not deal a hidden game');
      assert.equal(home.timers, 0);
      assert.equal(home.opening, false);
      assert.equal(home.voices.active, null);
      assert.equal(home.voices.lastPlayed, null);
      assert.deepEqual(home.voices.pending, []);
      assert.equal(home.horizontalOverflow, false);
      assert.deepEqual(home.hiddenFocusTargets, []);
      assert.equal(await page.locator('#continueGameBtn').isVisible(), false);
      assert.equal(await page.locator('#startGameBtn').evaluate(el => el === document.activeElement), true);
      assert.equal(home.controls.every(control => control.insideX && !control.textClipped && control.height >= 44), true);
      await page.screenshot({ path: path.join(out, `start-home-${width}x${height}.png`) });
      await page.locator('#startGameBtn').click();
      const modes = await inspect(page);
      assert.equal(modes.state, 'modes');
      assert.equal(modes.game, null);
      assert.equal(modes.timers, 0);
      assert.equal(modes.voices.active, null);
      assert.equal(modes.voices.lastPlayed, null);
      assert.deepEqual(modes.voices.pending, []);
      assert.equal(modes.horizontalOverflow, false);
      assert.equal(await page.locator('#normalModeBtn').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('#cultivationModeBtn').isDisabled(), false);
      assert.equal(await page.evaluate(() => S), null, 'selecting the modes page does not start a game');
      assert.equal(modes.controls.every(control => control.insideX && !control.textClipped && control.height >= 44), true);
      await page.screenshot({ path: path.join(out, `start-modes-${width}x${height}.png`) });
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => MahjongStartScreen.state), 'home');
      assert.equal(await page.locator('#startGameBtn').evaluate(el => el === document.activeElement), true);
      await page.locator('#startGameBtn').click();
      await page.locator('#startBackBtn').click();
      assert.equal(await page.evaluate(() => MahjongStartScreen.state), 'home');
      await page.evaluate(() => {
        window.startScreenDealCalls = 0;
        const original = startNewHand;
        startNewHand = (...args) => { startScreenDealCalls++; return original(...args); };
      });
      await page.locator('#startGameBtn').click();
      await page.locator('#normalModeBtn').evaluate(el => { el.click(); el.click(); });
      await page.waitForFunction(() => S && S.phase === 'deal');
      assert.equal(await page.evaluate(() => startScreenDealCalls), 1, 'rapid repeated start deals once');
      assert.equal(await page.locator('#startScreen').isVisible(), false);
      const opening = await page.evaluate(() => {
        const tableElement = document.getElementById('playersGrid');
        const table = tableElement.getBoundingClientRect();
        const overlay = document.querySelector('.opening-overlay').getBoundingClientRect();
        return { tableWidth: table.width, tableHeight: table.height,
          sameSize: Math.abs(tableElement.clientWidth - overlay.width) < 1
            && Math.abs(tableElement.clientHeight - overlay.height) < 1 };
      });
      assert.ok(opening.tableWidth > 250 && opening.tableHeight > 200);
      assert.equal(opening.sameSize, true, 'opening measures the revealed table');
      await page.evaluate(() => MahjongOpening.finish('start-screen-test'));
      await page.waitForFunction(() => S && S.phase === 'play');
      await page.evaluate(() => cancelGameTimers());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
        'empty discard grids must not create horizontal page overflow after entering');
      const physical = await page.evaluate(() => {
        const tiles = [...S.wall, ...S.deadWall, ...S.players.flatMap(p =>
          [...p.hand, ...p.melds.flatMap(m => m.tiles), ...p.discards, ...p.flowers])];
        return [tiles.length, new Set(tiles.map(tile => tile.id)).size];
      });
      assert.deepEqual(physical, [144, 144]);
      results.push({ viewport: `${width}x${height}`, home, modes, opening, physical, passed: true });
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', err => errors.push(`save-flow: ${err.message}`));
    await page.goto(url);
    await ready(page);
    await enterGame(page);
    const valid = await page.evaluate(async () => {
      cancelGameTimers();
      S.turn = 0;
      S.waitReact = null;
      // Save at a stable human discard boundary rather than just before a draw.
      if (S.players[0].hand.length === 16) {
        const index = S.wall.findIndex(tile => tile.suit !== 'H');
        const tile = S.wall.splice(index, 1)[0];
        S.players[0].hand.push(tile);
        S.players[0].drawnTile = tile;
        S.remain = S.wall.length;
      }
      await writeGameSave(AUTO_SAVE_KEY);
      return loadAutoSave();
    });
    await page.evaluate(() => { S = null; });
    await page.reload();
    await ready(page);
    assert.equal(await page.locator('#continueGameBtn').isVisible(), true);
    assert.equal(await page.evaluate(() => S), null);
    await page.locator('#startGameBtn').click();
    await page.locator('#startBackBtn').click();
    assert.deepEqual(await page.evaluate(() => loadAutoSave()), valid, 'navigation preserves the original save');
    await page.locator('#continueGameBtn').click();
    const resumed = await page.evaluate(() => ({ state: MahjongStartScreen.state,
      phase: S.phase, opening: MahjongOpening.getState().active,
      hands: S.players.map(p => p.hand.map(t => t.id)), rules: RULES,
      winds: seatNames, names: S.names, gameFields: Object.keys(S).sort() }));
    assert.equal(resumed.state, 'game');
    assert.equal(resumed.opening, false, 'resume does not replay opening');
    assert.equal(resumed.phase, valid.gameState.phase);
    assert.deepEqual(resumed.hands, valid.gameState.players.map(p => p.hand.map(t => t.id)));
    assert.deepEqual(resumed.winds, valid.seatNames);
    assert.deepEqual(resumed.rules, valid.rules);
    assert.deepEqual(resumed.names, valid.gameState.names);
    assert.equal(resumed.gameFields.includes('mode'), false);
    await page.evaluate(() => { cancelGameTimers(); S = null; });
    const invalid = { gameState: { rulesetVersion: 'corrupted-save' }, timestamp: '2026-10-22T00:00:00.000Z' };
    await putSave(page, invalid);
    await page.reload();
    await ready(page);
    await page.locator('#continueGameBtn').click();
    await page.waitForTimeout(500);
    const rejected = await inspect(page);
    assert.equal(rejected.state, 'home');
    assert.equal(rejected.game, null);
    assert.equal(rejected.timers, 0);
    assert.equal(rejected.opening, false);
    assert.match(await page.locator('#startStatus').innerText(), /自動暫存無法恢復/);
    assert.deepEqual(await page.evaluate(() => loadAutoSave()), invalid, 'invalid saves remain available for recovery');
    await page.screenshot({ path: path.join(out, 'start-invalid-save.png') });
    await enterGame(page);
    assert.equal(await page.evaluate(() => MahjongStartScreen.state), 'game', 'new game works after invalid resume');
    await context.close();
    results.push({ saveFlow: 'resume, navigation, invalid save, new game recovery', passed: true });
    assert.deepEqual(errors, []);
    const report = { passed: true, viewports: sizes.length, scenarios: results.length, errors, results };
    fs.writeFileSync(path.join(out, 'start-screen.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: true, viewports: sizes.length, scenarios: results.length, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
