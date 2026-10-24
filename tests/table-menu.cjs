const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { installFixture, scenarios } = require('./wide-table.cjs');
const { enterGame } = require('./start-screen-helper.cjs');
// The settings menu is tabbed; bring the page holding a control forward before using it.
const show = (pg, id) => pg.evaluate(id => {
  const page = document.getElementById(id)?.closest('.tm-page');
  if (page) window.MahjongTableMenu?.selectTab(page.id.slice('tmPage-'.length));
}, id);

const root = path.join(__dirname, '..');
const output = path.join(root, 'artifacts/table-menu.json');
const result = { checks: [], viewports: [], errors: [] };
function check(value, message) { assert.ok(value, message); result.checks.push(message); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.addInitScript(() => localStorage.setItem('qinghe_feedback_v1', JSON.stringify({ sound: false, reduced: true })));
    await page.goto(process.env.MAHJONG_URL || pathToFileURL(path.join(root, 'index.html')).href);
    await enterGame(page);
    await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play');
    await page.evaluate(() => { cancelGameTimers(); });
    const open = () => page.locator('#tableMenuBtn').click();
    const closed = () => page.locator('#tableMenu').evaluate(element => element.hidden);
    const state = () => page.evaluate(() => JSON.stringify(S));
    const initial = await state();

    check(await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      return new Set(ids).size === ids.length;
    }), 'Every DOM ID is unique');
    check(await page.evaluate(() => ['settingsBtn', 'saveGameBtn', 'loadGameBtn', 'newGameBtn', 'soundBtn', 'saveStatus'].every(id => document.getElementById('tableMenu').contains(document.getElementById(id)))), 'All original utility controls are inside the menu');
    check(await page.evaluate(() => document.querySelector('.bottom-area .hand-meld-container').contains(document.getElementById('controls'))), 'Context actions stay above the self rack on the table');
    check(await page.locator('#scoreboard').count() === 1 && await page.locator('#log').count() === 1, 'Hidden score and log nodes remain available for game updates');
    check(await page.locator('.seat-portrait').count() === 4, 'All four seats render portrait hooks');
    check(await page.locator('.player-info-inline .seat-count').count() === 4, 'All four seats show their public hand count');
    check(await closed(), 'Menu starts closed');
    check(await page.evaluate(() => [...document.querySelectorAll('#controls button:disabled')].every(button => getComputedStyle(button).display === 'none')), 'Unavailable table-action buttons remain hidden');

    await open();
    await page.locator('#tmTab-sound').click();
    check(await page.locator('#tmPage-sound').isVisible() && await page.locator('#soundBtn').isVisible(), 'Sound, display and game preferences are reachable from settings entrance');
    check(await page.evaluate(() => document.querySelector('.shell').inert), 'Board is inert while utility dialog is open');
    await page.locator('#tableMenuClose').focus();
    await page.keyboard.press('Shift+Tab');
    check(await page.evaluate(() => document.getElementById('tableMenu').contains(document.activeElement)), 'Shift Tab stays inside utility dialog');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.id === 'tableMenuClose'), 'Tab wraps to the first visible control');
    await page.keyboard.press('Escape');
    check(await closed(), 'Escape closes utility dialog');
    check(await page.evaluate(() => document.activeElement.id === 'tableMenuBtn' && !document.querySelector('.shell').inert), 'Closing restores trigger focus and board interaction');
    check(await state() === initial, 'Opening and closing utility dialog does not change game state');

    await open();
    await page.evaluate(() => { window.menuTimerRan = false; scheduleGame(() => { window.menuTimerRan = true; }, 10); });
    await page.waitForFunction(() => window.menuTimerRan);
    check(true, 'Utility menu preserves existing game-timer behavior');
    await show(page, 'overlay'); await page.locator('#overlay').click({ position: { x: 2, y: 2 } });
    check(await closed(), 'Clicking the backdrop closes utility dialog');

    // An AI claim closes its reaction UI while the utility menu stays open.
    // Use distinct physical tiles so the regression follows a legal claim path.
    await installFixture(page);
    const fixture = await page.evaluate(spec => wideTableFixture(spec), scenarios[0]);
    check(fixture.physicalCount === 144 && fixture.uniqueIds === 144, 'AI-claim regression starts with 144 distinct physical tiles');
    const canClaim = await page.evaluate(() => {
      const pid = 1, from = 0, player = S.players[pid];
      const key = player.hand.map(tileKey).find(key => player.hand.filter(tile => tileKey(tile) === key).length >= 3);
      const index = player.hand.findIndex(tile => tileKey(tile) === key);
      const tile = player.hand[index];
      player.hand[index] = S.players[from].discards.pop();
      S.players[from].discards.push(tile);
      S.lastDiscard = { from, tile };
      S.waitReact = [{ pid, type: 'pong', tile }];
      window.menuClaim = { pid, tile };
      renderAll();
      return canPong(pid, tile);
    });
    check(canClaim, 'AI-claim regression offers a legal pong');
    await open();
    await page.evaluate(() => scheduleGame(() => {
      doPong(menuClaim.pid, menuClaim.tile);
      cancelGameTimers();
    }, 10));
    await page.waitForFunction(() => S.lastAction === 'pong' && S.turn === 1);
    check(!await closed() && await page.locator('#overlay').isVisible(), 'AI pong preserves the open utility menu backdrop');
    check(await page.evaluate(() => {
      const physical = [...S.wall, ...S.deadWall, ...S.players.flatMap(player =>
        [...player.hand, ...player.flowers, ...player.discards, ...player.melds.flatMap(meld => meld.tiles)])];
      return physical.length === 144 && new Set(physical.map(tile => tile.id)).size === 144;
    }), 'AI pong preserves all 144 physical tiles while menu is open');
    await show(page, 'overlay'); await page.locator('#overlay').click({ position: { x: 2, y: 2 } });
    check(await closed() && await page.evaluate(() => !document.querySelector('.shell').inert), 'Backdrop still closes menu and restores board interaction after AI pong');

    await open();
    const soundBefore = await page.locator('#soundBtn').getAttribute('aria-pressed');
    await show(page, 'soundBtn'); await page.locator('#soundBtn').click();
    check(await page.locator('#soundBtn').getAttribute('aria-pressed') !== soundBefore && !await closed(), 'Sound toggles through original handler without closing menu');
    await show(page, 'soundBtn'); await page.locator('#soundBtn').click();
    await page.locator('#tmTab-names').click();
    check(await page.locator('#tileNameReference').isVisible(), 'Crystal tile reference is reachable from settings');
    await page.locator('#tmTab-voice').click();
    check(await page.locator('#voiceCue').isVisible() && await page.locator('#previewVoice').isVisible(), 'Crystal voice previews are reachable on the voice tab');
    await show(page, 'saveGameBtn'); await page.locator('#saveGameBtn').click();
    await page.waitForFunction(() => document.getElementById('saveStatus').textContent.includes('牌局已儲存'));
    check(await closed(), 'Saving closes menu and original IndexedDB save completes');

    await page.evaluate(() => { S.players[0].points += 123; renderAll(); });
    await open();
    await show(page, 'loadGameBtn'); await page.locator('#loadGameBtn').click();
    await page.waitForFunction(() => document.getElementById('log').textContent.includes('遊戲已讀檔'));
    await page.evaluate(() => cancelGameTimers());
    check(await closed(), 'Loading closes utility dialog');
    check(await page.evaluate(points => S.players[0].points === points, JSON.parse(initial).players[0].points), 'Original load restores saved score');

    await open();
    await show(page, 'settingsBtn'); await page.locator('#settingsBtn').click();
    check(await closed() && await page.locator('#settingsPanel').isVisible(), 'Rules dialog replaces utility dialog without stacking');
    check(await page.locator('#baseScorePreset').isVisible(), 'Rules dialog exposes its original scoring controls');
    await page.evaluate(() => { window.rulesTimerRan = false; scheduleGame(() => { window.rulesTimerRan = true; }, 10); });
    await page.waitForTimeout(75);
    check(await page.evaluate(() => !window.rulesTimerRan), 'Original rules dialog still pauses game timers');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.rulesTimerRan);
    check(await page.locator('#settingsPanel').isHidden(), 'Escape closes original rules dialog');
    check(await page.evaluate(() => document.activeElement.id === 'tableMenuBtn'), 'Rules dialog returns focus to permanent settings entrance');
    check(await page.locator('#overlay').isHidden(), 'No stale overlay remains after rules cancel');
    await open();
    await show(page, 'effectStyle'); await page.locator('#effectStyle').selectOption('ink');
    check(await page.evaluate(() => JSON.parse(localStorage.getItem('qinghe_feedback_v1')).style === 'ink'), 'Effect preference persists through its original handler in settings');
    await page.locator('#tableMenuClose').click();

    await open();
    await show(page, 'newGameBtn'); await page.locator('#newGameBtn').click();
    await page.waitForFunction(() => S?.phase === 'play');
    await page.evaluate(() => cancelGameTimers());
    check(await closed(), 'Restart closes menu and original new-hand flow completes');
    check(await page.evaluate(() => S.players.every(player => player.points === RULES.initialPoints)), 'Restart resets all four scores using existing rules');

    await page.evaluate(() => {
      cancelGameTimers();
      const pool = generateTiles();
      const take = key => pool.splice(pool.findIndex(tile => tileKey(tile) === key), 1)[0];
      const me = S.players[0];
      Object.assign(me, { hand: 'W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 FE FE FE FS FW'.split(' ').map(take), melds: [], flowers: [], discards: [], declaredListen: false, tingLocked: false, autoMode: false, discardBan: [], drawnTile: null });
      Object.assign(S, { phase: 'play', turn: 0, waitReact: null, currentReactions: null, lastDiscard: null });
      renderAll();
    });
    await page.waitForFunction(() => !document.getElementById('btnListen').disabled);
    check((await page.locator('#tableMenuBadge').textContent()) === '可操作', 'Settings entrance signals an available context action');
    await show(page, 'btnListen'); await page.locator('#btnListen').click();
    check(await closed() && await page.evaluate(() => S.players[0].declaredListen), 'Table Listen action runs the original game handler without opening settings');

    await page.evaluate(() => {
      cancelGameTimers();
      S.players[0].declaredListen = false;
      const tile = S.players[1].hand[0];
      S.lastDiscard = { from: 1, tile };
      S.waitReact = [{ pid: 0, type: 'pong', tile }];
      showReactionPanel(S.waitReact);
    });
    await page.waitForFunction(() => document.getElementById('tableMenuBadge').textContent === '待回應');
    check(await page.locator('#btnPong').isEnabled() && await page.locator('#btnPass').isEnabled() && await page.locator('#btnPass').isVisible(), 'Pending reaction actions remain visible and enabled on the table');
    await show(page, 'btnPass'); await page.locator('#btnPass').click();
    await page.evaluate(() => cancelGameTimers());
    check(await closed() && await page.evaluate(() => !S.waitReact), 'Table Pass action completes original reaction flow');

    await page.evaluate(() => {
      const tile = generateTiles().find(tile => tileKey(tile) === 'W3');
      S.lastDiscard = { from: 2, tile };
      S.waitReact = [{ pid: 0, type: 'chow', tile, patterns: [[1, 2, 3], [2, 3, 4]] }];
      showReactionPanel(S.waitReact);
    });
    await show(page, 'btnChow'); await page.locator('#btnChow').click();
    check(await closed() && await page.locator('#reactionPanel').isVisible(), 'Chow action opens the original choice dialog without stacking menus');
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.getElementById('reactionPanel').contains(document.activeElement)), 'Choice dialog keeps keyboard navigation inside its controls');
    await show(page, 'cancelChow'); await page.locator('#cancelChow').click();
    check(await page.locator('#overlay').isHidden() && await page.locator('#btnPass').isVisible(), 'Cancelling chow removes the chooser overlay and leaves table reactions reachable');
    await show(page, 'btnPass'); await page.locator('#btnPass').click();
    await page.evaluate(() => cancelGameTimers());

    await open();
    await page.evaluate(() => {
      S.phase = 'end'; S.winner = null;
      showHandsAndContinue();
    });
    check(await closed() && await page.locator('#reactionPanel').isVisible(), 'Game result automatically takes over from an open utility dialog');
    check(await page.locator('#overlay').isVisible(), 'Game result keeps the shared overlay');
    await page.evaluate(() => { hideReactionPanel(); });

    // Landscape only: portrait sizes are covered by the rotate notice.
    for (const [width, height] of [[1440, 900], [1000, 540], [740, 360], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await open();
      const geometry = await page.locator('#tableMenu').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, overflowX: element.scrollWidth - element.clientWidth };
      });
      check(geometry.left >= 0 && geometry.right <= width + 1 && geometry.top >= 0 && geometry.bottom <= height + 1 && geometry.overflowX <= 1, `${width}x${height}: utility dialog fits viewport without horizontal overflow`);
      await page.screenshot({ path: path.join(root, `artifacts/table-menu-${width}x${height}.png`) });
      for (const tab of await page.locator('.tm-tab').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => n.dataset.page))) {
        await page.locator('#tmTab-' + tab).click();
        check(await page.locator('#tableMenu').evaluate(menu => menu.scrollHeight <= menu.clientHeight + 1 && menu.querySelector('.tm-pages').scrollHeight <= menu.querySelector('.tm-pages').clientHeight + 1),
          `${width}x${height}: ${tab} tab fits without scrolling`);
      }
      await page.locator('#tmTab-voice').click();
      check(await page.locator('#previewVoice').isVisible(), `${width}x${height}: crystal voice preview remains reachable`);
      await page.locator('#tableMenuClose').click();
      check(await closed(), `${width}x${height}: close remains reachable`);
      result.viewports.push({ width, height, geometry });
    }
    check(result.errors.length === 0, 'No browser runtime errors');
    result.status = 'PASS';
    console.log(`PASS: ${result.checks.length} table menu checks across ${result.viewports.length} viewports`);
  } catch (error) {
    result.status = 'FAIL'; result.failure = error.stack;
    throw error;
  } finally {
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    await browser.close();
  }
})();
