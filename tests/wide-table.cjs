const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enterGame } = require('./start-screen-helper.cjs');

const out = path.join(__dirname, '../artifacts');
const url = process.env.MAHJONG_URL || 'http://127.0.0.1:8765';
const viewports = [
  // The game is landscape-only: height >= width shows the rotate notice, so only landscape sizes are laid out.
  [1440, 900], [1920, 1080], [943, 889], [844, 390], [740, 360], [568, 320],
  [1440, 530], [1000, 540], [720, 540], [800, 600], [960, 600], [667, 375]
];
const scenarios = [
  { name: 'dense17', hand: 'W7 W7 W8 W8 W9 T7 T7 T8 T8 T9 B7 B8 B9 FE FS FW FN', melds: [], opponentMelds: false },
  { name: 'five-kongs', hand: 'FE FS', melds: ['W1', 'T1', 'B1', 'DC', 'DF'].map(key =>
    ({ type: 'kong', concealed: true, tiles: Array(4).fill(key).join(' ') })), opponentMelds: true }
];
const sideKongs = { name: 'side-five-kongs', owner: 2, hand: 'FE FS',
  melds: ['W1', 'T1', 'B1', 'DC', 'DF'].map(key =>
    ({ type: 'kong', concealed: true, tiles: Array(4).fill(key).join(' ') })), opponentMelds: false };

async function installFixture(page) {
  await page.evaluate(() => {
    cancelGameTimers();
    window.wideTableFixture = spec => {
      cancelGameTimers(); S = null; startNewHand(true); cancelGameTimers(); hideReactionPanel();
      window.MahjongOpening?.cancel('wide-table-test');
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
        hand: [], melds: [], flowers: [], discards: [], draws: 3, points: 100000,
        passedHu: false, passedPong: [], lastDiscardKey: null, discardBan: [],
        declaredListen: false, tingLocked: false, autoMode: false, rinshan: false,
        drawnTile: null, waitKeys: [], tianTing: false, diTing: false
      }));
      const owner = spec.owner ?? 0;
      const me = S.players[0], active = S.players[owner];
      active.hand = takeHand(spec.hand);
      active.melds = spec.melds.map(meld => ({ ...meld, tiles: takeHand(meld.tiles) }));
      ['H1 H2 H5 H6', 'H3 H4', 'H7', 'H8'].forEach((text, pid) => { S.players[pid].flowers = takeHand(text); });
      if (spec.opponentMelds) ['W2', 'T2', 'B2'].forEach((key, index) => {
        S.players[index + 1].melds = [{ type: 'pong', concealed: false, tiles: takeHand(Array(3).fill(key).join(' ')) }];
      });
      me.discards = Array.from({ length: 24 }, takeOrdinary);
      S.players[2].discards = Array.from({ length: 12 }, takeOrdinary);
      S.players[3].discards = Array.from({ length: 12 }, takeOrdinary);
      for (let pid = 0; pid < 4; pid++) {
        if (pid === owner) continue;
        S.players[pid].hand = Array.from({ length: 16 - S.players[pid].melds.length * 3 }, takeOrdinary);
      }
      S.deadWall = pool.splice(0, 16);
      S.wall = pool;
      S.remain = S.wall.length;
      Object.assign(S, { phase: 'play', turn: owner, dealer: 0, round: 1, dealerStreak: 0, drawCount: 60,
        lastDiscard: null, lastPlayed: null, waitReact: null, currentReactions: null,
        winner: null, fromPlayer: null, winTile: null, resultDetail: null, flowerWin: null,
        robKong: false, pendingKong: null, lastAction: 'draw', lastActor: owner,
        anyOpenMeld: spec.opponentMelds, kongCount: countKongs(active) });
      active.drawnTile = active.hand.at(-1);
      seatNames = ['東', '西', '北', '南'];
      renderAll();
      const physical = [...S.wall, ...S.deadWall, ...S.players.flatMap(player =>
        [...player.hand, ...player.flowers, ...player.discards, ...player.melds.flatMap(meld => meld.tiles)])];
      return { physicalCount: physical.length, uniqueIds: new Set(physical.map(tile => tile.id)).size,
        players: S.players.map((player, pid) => ({ pid, name: playerName(pid), points: player.points.toLocaleString(),
          hand: player.hand.length, melds: player.melds.flatMap(meld => meld.tiles).length,
          flowers: player.flowers.length, discards: player.discards.length })) };
    };

    window.inspectWideTable = () => {
      const failures = [];
      const fail = (type, details) => failures.push({ type, ...details });
      const epsilon = .1;
      const minimumGap = .5;
      const rectKeys = ['left', 'top', 'right', 'bottom', 'width', 'height'];
      const box = rect => Object.fromEntries(rectKeys.map(key => [key, +rect[key].toFixed(2)]));
      const rectOf = element => element.getBoundingClientRect();
      const inside = (a, b) => a.left >= b.left - epsilon && a.top >= b.top - epsilon &&
        a.right <= b.right + epsilon && a.bottom <= b.bottom + epsilon;
      const visible = element => {
        if (!element || !rectOf(element).width || !rectOf(element).height) return false;
        for (let parent = element; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        }
        return true;
      };
      const identity = element => element.id ? `#${element.id}` : element.className;
      const clippedBy = element => {
        const rect = rectOf(element), clipped = [];
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), parentRect = rectOf(parent);
          const clipX = /hidden|clip|auto|scroll/.test(style.overflowX);
          const clipY = /hidden|clip|auto|scroll/.test(style.overflowY);
          if ((clipX && (rect.left < parentRect.left - epsilon || rect.right > parentRect.right + epsilon)) ||
              (clipY && (rect.top < parentRect.top - epsilon || rect.bottom > parentRect.bottom + epsilon))) {
            clipped.push({ target: identity(parent), box: box(parentRect), overflowX: style.overflowX, overflowY: style.overflowY });
          }
        }
        return clipped;
      };
      const tableElement = document.getElementById('playersGrid');
      const table = rectOf(tableElement);
      const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      if (!document.documentElement.classList.contains('table-scene') && !document.body.classList.contains('table-scene')) fail('missing-scene-class', {});
      if (!inside(table, viewport)) fail('table-outside-viewport', { table: box(table), viewport });
      if (document.documentElement.scrollWidth > innerWidth + 1) fail('page-horizontal-scroll', { scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth });
      const allTiles = [], groups = [], infos = [];
      const selectorsFor = pid => [
        [pid === 0 ? 'hand' : 'back', pid === 0 ? '#yourHand button.tile' : `#handBack${pid} .tile-back`, S.players[pid].hand.length],
        ['meld', `#meldRail${pid} .rail-tile`, S.players[pid].melds.flatMap(meld => meld.tiles).length],
        ['flower', `#meldArea${pid} .flower-row .tile`, S.players[pid].flowers.length],
        ['discard', `#discardArea${pid} .tile`, S.players[pid].discards.length]
      ];
      for (let pid = 0; pid < 4; pid++) {
        for (const [kind, selector, expected] of selectorsFor(pid)) {
          const elements = [...document.querySelectorAll(selector)];
          if (elements.length !== expected) fail('physical-tile-count', { pid, kind, expected, actual: elements.length, selector });
          const tiles = elements.map((element, index) => ({ element, pid, kind, index, rect: rectOf(element), key: element.title || kind }));
          allTiles.push(...tiles);
          const axis = pid > 1 && ['back', 'meld'].includes(kind) ? 'left' : 'top';
          const lanes = new Set(tiles.map(tile => Math.round(tile.rect[axis]))).size;
          if (kind !== 'discard' && tiles.length && lanes !== 1) fail('wrapped-tiles', { pid, kind, axis, lanes, boxes: tiles.map(tile => box(tile.rect)) });
          groups.push({ pid, kind, count: tiles.length, lanes, minimumWidth: tiles.length ? +Math.min(...tiles.map(tile => tile.rect.width)).toFixed(2) : null });
          for (const tile of tiles) {
            const details = { pid, kind, index: tile.index, key: tile.key, box: box(tile.rect) };
            if (!visible(tile.element)) fail('hidden-physical-tile', details);
            if (!inside(tile.rect, table)) fail('tile-outside-table', { ...details, table: box(table) });
            if (!inside(tile.rect, viewport)) fail('tile-outside-viewport', { ...details, viewport });
            const clipped = clippedBy(tile.element);
            if (clipped.length) fail('clipped-physical-tile', { ...details, clipped });
            if (getComputedStyle(tile.element).boxShadow === 'none') fail('missing-tile-depth', details);
          }
        }
        const info = document.getElementById(`playerInfo${pid}`), infoRect = rectOf(info), player = S.players[pid];
        infos.push({ pid, element: info, rect: infoRect });
        if (!visible(info) || !inside(infoRect, table)) fail('info-outside-table', { pid, box: box(infoRect), table: box(table) });
        const expectedFields = [['.seat-name', playerName(pid)], ['.seat-points', player.points.toLocaleString()], ['.seat-count', `${player.hand.length}張`], ['.seat-avatar', currentSeatWind(pid)]];
        for (const [selector, text] of expectedFields) {
          const field = info.querySelector(selector);
          const rendered = field?.textContent.replace(/\s/g, '') || '';
          if (!field || !visible(field) || !rendered.includes(text.replace(/\s/g, ''))) {
            fail('missing-info-text', { pid, selector, expected: text, rendered });
            continue;
          }
          const fieldRect = rectOf(field);
          if (!inside(fieldRect, infoRect)) fail('info-field-outside-card', { pid, selector, box: box(fieldRect), card: box(infoRect) });
          const clipped = clippedBy(field);
          if (clipped.length || field.scrollWidth > field.clientWidth + 1 || field.scrollHeight > field.clientHeight + 1) {
            fail('clipped-info-text', { pid, selector, text: rendered, box: box(fieldRect), clientWidth: field.clientWidth,
              scrollWidth: field.scrollWidth, clientHeight: field.clientHeight, scrollHeight: field.scrollHeight, clipped });
          }
          // Text ranges reveal ellipsis/overflow even when the element itself fits its card.
          const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent.trim()) continue;
            const range = document.createRange(); range.selectNodeContents(node);
            const textRect = range.getBoundingClientRect();
            const subtitle = node.parentElement.closest('.seat-sub');
            if (subtitle && getComputedStyle(subtitle).display === 'none' && !textRect.width && !textRect.height) continue;
            if (!inside(textRect, infoRect)) fail('text-outside-info', { pid, selector, text: node.textContent.trim(), box: box(textRect), card: box(infoRect) });
          }
        }
        for (const id of [pid === 0 ? 'yourHandArea' : `handBack${pid}`, `meldRail${pid}`, `discardArea${pid}`, `meldArea${pid}`]) {
          const rail = document.getElementById(id);
          if (visible(rail) && (rail.scrollWidth > rail.clientWidth + 1 || rail.scrollHeight > rail.clientHeight + 1 || rail.scrollLeft || rail.scrollTop)) {
            fail('tile-container-scroll-or-overflow', { id, box: box(rectOf(rail)), clientWidth: rail.clientWidth,
              scrollWidth: rail.scrollWidth, clientHeight: rail.clientHeight, scrollHeight: rail.scrollHeight,
              scrollLeft: rail.scrollLeft, scrollTop: rail.scrollTop });
          }
        }
      }
      const describe = item => ({ pid: item.pid, kind: item.kind || 'info', index: item.index, key: item.key, box: box(item.rect) });
      for (const tile of allTiles) for (const info of infos) {
        const overlapX = Math.min(tile.rect.right, info.rect.right) - Math.max(tile.rect.left, info.rect.left);
        const overlapY = Math.min(tile.rect.bottom, info.rect.bottom) - Math.max(tile.rect.top, info.rect.top);
        if (overlapX > epsilon && overlapY > epsilon) fail('tile-info-collision', { a: describe(tile), b: describe(info), overlapX: +overlapX.toFixed(2), overlapY: +overlapY.toFixed(2) });
      }
      for (const info of infos) {
        const badge = info.element.querySelector('.seat-turn');
        if (!visible(badge)) continue;
        const badgeRect = rectOf(badge);
        for (const tile of allTiles.filter(tile => tile.kind === 'hand' || tile.kind === 'back')) {
          const overlapX = Math.min(tile.rect.right, badgeRect.right) - Math.max(tile.rect.left, badgeRect.left);
          const overlapY = Math.min(tile.rect.bottom, badgeRect.bottom) - Math.max(tile.rect.top, badgeRect.top);
          if (overlapX > epsilon && overlapY > epsilon) fail('badge-hand-collision', { a: describe(tile),
            b: { pid: info.pid, kind: 'turn-badge', box: box(badgeRect) }, overlapX: +overlapX.toFixed(2), overlapY: +overlapY.toFixed(2) });
        }
      }
      let minimumObservedGap = Infinity;
      for (let a = 0; a < allTiles.length; a++) for (let b = a + 1; b < allTiles.length; b++) {
        const first = allTiles[a], second = allTiles[b];
        const gapX = Math.max(first.rect.left - second.rect.right, second.rect.left - first.rect.right);
        const gapY = Math.max(first.rect.top - second.rect.bottom, second.rect.top - first.rect.bottom);
        if (gapX < -epsilon && gapY < -epsilon) {
          fail('tile-tile-collision', { a: describe(first), b: describe(second), overlapX: +(-gapX).toFixed(2), overlapY: +(-gapY).toFixed(2) });
        } else {
          const gap = Math.hypot(Math.max(0, gapX), Math.max(0, gapY));
          minimumObservedGap = Math.min(minimumObservedGap, gap);
          if (gap + epsilon < minimumGap) fail('no-tile-separation', { a: describe(first), b: describe(second), gap: +gap.toFixed(2), required: minimumGap });
        }
      }
      const mainButtons = [...document.querySelectorAll('button')].filter(button => visible(button) &&
        !button.matches('#yourHand button.tile') && !button.closest('#reactionPanel, #controls'));
      if (mainButtons.length !== 1 || mainButtons[0].id !== 'tableMenuBtn') fail('unexpected-main-buttons', { buttons: mainButtons.map(button => ({ id: button.id, text: button.textContent.trim(), box: box(rectOf(button)) })) });
      const portraits = [...document.querySelectorAll('.seat-portrait')].map(element => ({
        visible: visible(element), image: getComputedStyle(element).backgroundImage,
        size: getComputedStyle(element).backgroundSize, position: getComputedStyle(element).backgroundPosition,
        box: box(rectOf(element))
      }));
      if (portraits.length !== 4 || portraits.some(portrait => !portrait.visible || !/player-portraits\.(png|webp)/.test(portrait.image))) fail('missing-portraits', { portraits });
      if (new Set(portraits.map(portrait => portrait.position)).size !== 4) fail('portrait-quadrants-not-distinct', { portraits });
      return { table: box(table), groups, infos: infos.map(info => ({ pid: info.pid, box: box(info.rect), text: info.element.innerText })),
        physicalRendered: allTiles.length, minimumObservedGap: Number.isFinite(minimumObservedGap) ? +minimumObservedGap.toFixed(2) : null,
        mainButtons: mainButtons.map(button => button.id), portraits, failures };
    };
  });
}

async function runDiscardSmoke(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(spec => wideTableFixture(spec), scenarios[0]);
  await page.waitForTimeout(220);
  const before = await page.evaluate(() => {
    const hand = S.players[0].hand;
    const index = hand.findIndex(tile => canDiscardTile(0, tile) && [1, 2, 3].every(pid =>
      !canWinOn(pid, tile) && !canKong(pid, tile) && !canPong(pid, tile) && !canChow(pid, tile).length));
    if (index < 0) return { error: 'Fixture has no discard without a legal opponent reaction' };
    const tile = hand[index];
    window.wideTableDiscardSmoke = null;
    document.addEventListener('click', event => {
      // The genuine inline tile handler runs first; stop only scheduled AI work.
      cancelGameTimers();
      window.wideTableDiscardSmoke = { trusted: event.isTrusted, phase: S.phase, turn: S.turn,
        hand: S.players[0].hand.length, discards: S.players[0].discards.length,
        discardedId: S.players[0].discards.at(-1)?.id, drawnTile: S.players[0].drawnTile,
        pendingTimers: gameTimers.size, lastAction: S.lastAction, lastActor: S.lastActor,
        renderedHand: document.querySelectorAll('#yourHand button.tile').length,
        renderedDiscards: document.querySelectorAll('#discardArea0 .tile').length };
    }, { once: true });
    return { index, id: tile.id, key: tileKey(tile), hand: hand.length, discards: S.players[0].discards.length,
      turn: S.turn, nextTurn: getNextTurn(S.turn) };
  });
  if (before.error) return { passed: false, before };
  await page.locator(`#yourHand button[onclick="onClickYourTile(${before.index})"]`).click();
  const after = await page.evaluate(() => wideTableDiscardSmoke);
  const passed = !!after && after.trusted && after.phase === 'play' && after.turn === before.nextTurn &&
    after.hand === before.hand - 1 && after.discards === before.discards + 1 &&
    after.discardedId === before.id && after.drawnTile === null && after.pendingTimers === 0 &&
    after.lastAction === 'discard' && after.lastActor === 0 && after.renderedHand === after.hand && after.renderedDiscards === after.discards;
  return { passed, before, after };
}

async function inspectFrameStability(page) {
  return page.evaluate(async () => {
    const selectors = ['#playersGrid', '#yourHandArea', '#playerInfo0', '#playerInfo1', '#playerInfo2', '#playerInfo3',
      '#handBack1', '#handBack2', '#handBack3', '#meldRail0', '#meldRail1', '#meldRail2', '#meldRail3',
      '#discardArea0', '#discardArea1', '#discardArea2', '#discardArea3'];
    const snapshots = [];
    for (let frame = 0; frame < 12; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      snapshots.push({ frame, classes: [...document.documentElement.classList].sort().join(' '),
        boxes: selectors.map(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { selector, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        }) });
    }
    const baseline = snapshots[0];
    const changes = snapshots.slice(1).flatMap(snapshot => {
      const different = snapshot.boxes.filter((box, index) => ['left', 'top', 'width', 'height'].some(key =>
        Math.abs(box[key] - baseline.boxes[index][key]) > .1));
      return snapshot.classes !== baseline.classes || different.length
        ? [{ frame: snapshot.frame, classes: snapshot.classes, baselineClasses: baseline.classes,
          boxes: different.map(box => ({ before: baseline.boxes.find(prior => prior.selector === box.selector), after: box })) }]
        : [];
    });
    return { passed: !changes.length, frames: snapshots.length, classes: baseline.classes, changes };
  });
}

async function run() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [], errors = [];
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await enterGame(page);
    await installFixture(page);
    const atlas = await page.evaluate(async () => {
      const image = new Image();
      image.src = 'assets/player-portraits.png';
      await image.decode();
      return { loaded: image.complete, width: image.naturalWidth, height: image.naturalHeight };
    });
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      const viewportScenarios = [1440, 844].includes(width) ? [...scenarios, sideKongs] : scenarios;
      for (const scenario of viewportScenarios) {
        await page.mouse.move(0, 0);
        const physical = await page.evaluate(spec => wideTableFixture(spec), scenario);
        assert.equal(physical.physicalCount, 144);
        assert.equal(physical.uniqueIds, 144);
        assert.equal(physical.players[0].discards, 24);
        assert.deepEqual(physical.players.slice(2).map(player => player.discards), [12, 12]);
        await page.waitForTimeout(220);
        const metrics = await page.evaluate(() => inspectWideTable());
        const frameStability = width === 660 && height === 900 ? await inspectFrameStability(page) : null;
        if (frameStability && !frameStability.passed) metrics.failures.push({ type: 'layout-frame-instability', ...frameStability });
        let hitChecks = 0, clickChecks = 0;
        const hand = page.locator('#yourHand button.tile');
        for (let index = 0; index < await hand.count(); index++) {
          const tile = hand.nth(index), resting = await tile.boundingBox();
          if (!resting) continue;
          await page.mouse.move(resting.x + resting.width / 2, resting.y + resting.height / 2);
          await page.waitForTimeout(170);
          const hit = await tile.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const points = [[rect.left + Math.min(2, rect.width / 5), rect.top + Math.min(2, rect.height / 5)],
              [rect.right - Math.min(2, rect.width / 5), rect.top + Math.min(2, rect.height / 5)],
              [rect.left + rect.width / 2, rect.top + rect.height / 2]];
            return { box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
              hits: points.map(([x, y]) => { const target = document.elementFromPoint(x, y); return { x, y,
                clear: !!target && element.contains(target), blocker: target?.closest('[id]')?.id || target?.className || null }; }) };
          });
          hitChecks += hit.hits.length;
          if (hit.hits.some(point => !point.clear)) metrics.failures.push({ type: 'blocked-hand-hit', index, ...hit });
          const hover = await page.evaluate(() => inspectWideTable());
          metrics.failures.push(...hover.failures.filter(failure => ['tile-info-collision', 'tile-tile-collision', 'badge-hand-collision', 'tile-outside-table', 'clipped-physical-tile'].includes(failure.type)).map(failure => ({ phase: 'hover', hoveredIndex: index, ...failure })));
          if (await tile.isDisabled()) continue;
          // Capture one trusted pointer click without advancing the fixture's game state.
          await tile.evaluate(element => {
            window.wideTableClick = null;
            document.addEventListener('click', event => {
              window.wideTableClick = { expected: element.contains(event.target), trusted: event.isTrusted,
                blocker: event.target.closest('[id]')?.id || event.target.className };
              event.preventDefault(); event.stopImmediatePropagation();
            }, { capture: true, once: true });
          });
          const center = hit.hits.at(-1);
          await page.mouse.click(center.x, center.y);
          const clicked = await page.evaluate(() => wideTableClick);
          clickChecks++;
          if (!clicked?.expected || !clicked.trusted) metrics.failures.push({ type: 'hand-click-wrong-target', index, clicked, box: hit.box });
        }
        await page.mouse.move(0, 0);
        await page.waitForTimeout(170);
        await page.screenshot({ path: path.join(out, `wide-table-${width}x${height}-${scenario.name}.png`), fullPage: true });
        const result = { width, height, scenario: scenario.name, physical, hitChecks, clickChecks, frameStability, ...metrics };
        results.push(result);
        console.log(JSON.stringify({ width, height, scenario: scenario.name, table: metrics.table,
          rendered: metrics.physicalRendered, hitChecks, clickChecks, failureCount: metrics.failures.length,
          firstFailures: metrics.failures.slice(0, 3) }));
      }
    }
    const discardSmoke = await runDiscardSmoke(page);
    await page.locator('#tableMenuBtn').click();
    const menu = await page.evaluate(() => ({ hidden: document.getElementById('tableMenu').hidden,
      expanded: document.getElementById('tableMenuBtn').getAttribute('aria-expanded'),
      originalActionsOnTable: ['btnHu', 'btnChow', 'btnPong', 'btnKong', 'btnListen', 'btnPass'].every(id => document.getElementById('playersGrid').contains(document.getElementById(id))) }));
    const failures = results.flatMap(result => result.failures.map(failure => ({ width: result.width, height: result.height, scenario: result.scenario, ...failure })));
    if (!atlas.loaded || atlas.width !== atlas.height || !atlas.width) failures.push({ type: 'atlas-unavailable', atlas });
    if (menu.hidden || menu.expanded !== 'true' || !menu.originalActionsOnTable) failures.push({ type: 'menu-unavailable', menu });
    if (!discardSmoke.passed) failures.push({ type: 'actual-discard-smoke-failed', discardSmoke });
    const report = { passed: !failures.length && !errors.length, viewports: viewports.length, scenarios: results.length,
      hitChecks: results.reduce((sum, result) => sum + result.hitChecks, 0), clickChecks: results.reduce((sum, result) => sum + result.clickChecks, 0),
      atlas, menu, discardSmoke, errors, failures, results };
    fs.writeFileSync(path.join(out, 'wide-table.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, viewports: report.viewports, scenarios: report.scenarios,
      hitChecks: report.hitChecks, clickChecks: report.clickChecks, failures: failures.length, firstCollision: failures.find(failure => failure.type.includes('collision')) || null, errors }));
    assert.equal(report.passed, true, 'See artifacts/wide-table.json for exact collision boxes, clipping, and click blockers');
  } finally { await browser.close(); }
}

module.exports = { installFixture, scenarios, sideKongs };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
