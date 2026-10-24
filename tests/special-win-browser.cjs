const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const out = path.join(__dirname, '../artifacts');
const plain16 = 'W1 W2 W4 W6 W8 T1 T3 T5 T7 B1 B3 B5 FE FS FW FN';
const cases = [
  ['清一色', 'suit', 'W1 W2 W3 W1 W2 W3 W4 W5 W6 W4 W5 W6 W7 W8 W9 W9 W9'],
  ['字一色', 'honors', 'FE FE FE FS FS FS FW FW FW DC DC DC DF DF DF DB DB'],
  ['大四喜', 'winds', 'FE FE FE FS FS FS FW FW FW FN FN FN W1 W2 W3 DB DB'],
  ['小四喜', 'winds', 'FE FE FE FS FS FS FW FW FW FN FN W1 W2 W3 T1 T2 T3'],
  ['大三元', 'dragons', 'DC DC DC DF DF DF DB DB DB W1 W2 W3 T4 T5 T6 B9 B9'],
  ['小三元', 'dragons', 'DC DC DC DF DF DF DB DB W1 W2 W3 T4 T5 T6 B1 B2 B3'],
  ['五暗刻', 'pungs', 'W1 W1 W1 W4 W4 W4 T2 T2 T2 T7 T7 T7 B5 B5 B5 DB DB'],
  ['四暗刻', 'pungs', 'W1 W1 W1 W4 W4 W4 T2 T2 T2 T7 T7 T7 B1 B2 B3 DB DB'],
  ['三暗刻', 'pungs', 'W1 W1 W1 T2 T2 T2 B3 B3 B3 W4 W5 W6 T6 T7 T8 DB DB'],
  ['八仙過海', 'flowers', plain16, { flowers: { 0: 'H1 H2 H3 H4 H5 H6 H7' }, nextDraw: 'H8' }],
  ['七搶一', 'flowers', plain16, { flowers: { 1: 'H1 H2 H3 H4 H5 H6 H7' }, nextDraw: 'H8' }]
];
const specialNames = ['八仙過海','七搶一','天胡','地胡','人胡','字一色','大四喜','小四喜',
  '大三元','小三元','五暗刻','清一色','四暗刻','三暗刻','混一色','對對胡','全求人','半求人',
  '槓上開花','海底撈月','河底撈魚','搶槓','四季花槓','四君子花槓','天聽','地聽'];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [], results = [];
  let buttonWins = 0, automaticFlowerWins = 0;
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(process.env.MAHJONG_URL || pathToFileURL(path.join(__dirname, '../index.html')).href);
    await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play' && window.MahjongEffects?.showWin);
    await page.evaluate(() => {
      cancelGameTimers();
      window.specialFixture = spec => {
        cancelGameTimers(); S = null; startNewHand(true); cancelGameTimers(); hideReactionPanel(); MahjongEffects.clear();
        const pool = generateTiles();
        const take = key => {
          const index = pool.findIndex(t => tileKey(t) === key);
          if (index < 0) throw new Error('Missing physical tile ' + key);
          return pool.splice(index, 1)[0];
        };
        const takeHand = text => text ? text.split(' ').map(take) : [];
        S.players.forEach(p => Object.assign(p, {
          hand: [], melds: [], flowers: [], discards: [], points: 100000, draws: 3,
          passedHu: false, passedPong: [], discardBan: [], lastDiscardKey: null,
          declaredListen: false, tingLocked: false, autoMode: false, rinshan: false,
          drawnTile: null, waitKeys: [], tianTing: false, diTing: false
        }));
        S.players[0].hand = takeHand(spec.hand);
        for (const [pid, flowers] of Object.entries(spec.flowers || {})) S.players[pid].flowers = takeHand(flowers);
        const nextDraw = spec.nextDraw ? take(spec.nextDraw) : null;
        for (let pid = 1; pid < 4; pid++) {
          for (let n = 0; n < 16; n++) S.players[pid].hand.push(pool.splice(pool.findIndex(t => t.suit !== 'H'), 1)[0]);
        }
        S.deadWall = pool.splice(0, 16); S.wall = pool;
        if (nextDraw) S.wall.push(nextDraw);
        S.remain = S.wall.length;
        Object.assign(S, {
          phase: 'play', turn: 0, dealer: 1, round: 1, dealerStreak: 0, drawCount: 12,
          lastDiscard: null, lastPlayed: null, waitReact: null, currentReactions: null,
          winner: null, fromPlayer: null, winTile: null, resultDetail: null, flowerWin: null,
          robKong: false, pendingKong: null, lastAction: 'draw', lastActor: 0,
          anyOpenMeld: false, kongCount: 0
        });
        if (S.players[0].hand.length === 17) S.players[0].drawnTile = S.players[0].hand.at(-1);
        seatNames = ['西', '東', '北', '南'];
        renderAll();
      };
    });
    async function win(entry) {
      const [name, , hand, extras] = entry;
      await page.evaluate(spec => specialFixture(spec), { hand, ...extras });
      await page.locator('.center-area').scrollIntoViewIfNeeded();
      if (extras?.nextDraw) { await page.evaluate(() => stepNext()); automaticFlowerWins++; }
      else {
        assert.equal(await page.locator('#btnHu').isEnabled(), true, `${name}: legal Hu button`);
        await page.locator('#btnHu').click(); buttonWins++;
      }
      const result = await page.evaluate(() => ({
        phase: S.phase, detail: S.resultDetail, points: S.players.map(p => p.points),
        physical: (() => {
          const tiles = S.wall.concat(S.deadWall, ...S.players.map(p => p.hand.concat(p.flowers,p.discards,...p.melds.map(m=>m.tiles))));
          return [tiles.length, new Set(tiles.map(t=>t.id)).size];
        })()
      }));
      assert.equal(result.phase, 'end', `${name}: real settlement`);
      assert.ok(result.detail.categories.includes(name), `${name}: awarded by engine`);
      assert.equal(result.points.reduce((sum, point) => sum + point, 0), 400000);
      assert.deepEqual(result.physical, [144,144]);
      return result;
    }
    for (const [width,height] of [[1440,1000],[390,844]]) {
      await page.setViewportSize({ width, height });
      for (const style of ['jade','ink','neon']) {
        await page.evaluate(style => { MahjongEffects.setStyle(style); MahjongEffects.setReduced(false); }, style);
        for (const entry of cases) {
          const result = await win(entry);
          const effect = page.locator('.mahjong-fx.fx-special');
          assert.equal(await effect.getAttribute('data-special'), entry[0]);
          assert.equal(await effect.getAttribute('data-motif'), entry[1]);
          assert.ok((await effect.textContent()).includes(`合計 ${result.detail.fan} 台`));
          for (const awarded of result.detail.categories.filter(name => specialNames.includes(name))) {
            assert.ok((await effect.textContent()).includes(awarded), `${entry[0]}: also names ${awarded}`);
          }
          const box = await effect.boundingBox();
          assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height);
          assert.equal(await effect.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          assert.equal(await page.evaluate(() => {
            const first = document.querySelector('.mahjong-fx');
            MahjongEffects.showWin(S.fromPlayer === -1 ? 'selfDraw' : 'win', S.resultDetail);
            return first === document.querySelector('.mahjong-fx');
          }), true, 'same result cannot restart animation');
          if (entry[0] === (style === 'jade' ? '大三元' : style === 'ink' ? '字一色' : '大四喜')) {
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(out, `special-win-${style}-${width}.png`) });
            await page.waitForSelector('#btnContinueNext');
            assert.ok((await page.locator('.result-summary').textContent()).includes(entry[0]));
          }
          await page.evaluate(() => {
            cancelGameTimers(); MahjongEffects.clear(); renderAll();
            MahjongEffects.showWin(S.fromPlayer === -1 ? 'selfDraw' : 'win', S.resultDetail);
          });
          assert.equal(await page.locator('.mahjong-fx').count(), 0, 'cleared result cannot replay on redraw');
          results.push({ width, style, name: entry[0], motif: entry[1], fan: result.detail.fan, categories: result.detail.categories });
        }
        console.log(`PASS ${width} ${style}: ${cases.length} legal settlements and special effects`);
      }
    }
    // Render coverage for all supported *settled labels*, separate from the real-hand fixtures.
    let labelRenders = 0;
    for (const style of ['jade','ink','neon']) {
      await page.evaluate(style => MahjongEffects.setStyle(style), style);
      for (const name of specialNames) {
        await page.evaluate(name => MahjongEffects.showWin('win', { fan: 8, categories: [name] }), name);
        assert.equal(await page.locator('.fx-word').textContent(), name);
        assert.equal(await page.locator('.fx-special-mark').count(), 1);
        labelRenders++;
      }
    }
    for (const style of ['jade','ink','neon']) {
      await page.evaluate(style => { MahjongEffects.setStyle(style); MahjongEffects.setReduced(true); }, style);
      await win(cases[0]);
      assert.equal(await page.locator('.mahjong-fx svg').count(), 0);
      assert.equal(await page.locator('.fx-word').textContent(), '清一色');
      assert.equal(await page.locator('.mahjong-fx').evaluate(el => getComputedStyle(el).animationName), 'none');
    }
    await page.evaluate(() => { cancelGameTimers(); MahjongEffects.setReduced(false); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await win(cases[4]);
    assert.equal(await page.locator('.mahjong-fx svg').count(), 0);
    assert.equal(await page.locator('.fx-word').textContent(), '大三元');
    await page.evaluate(() => { cancelGameTimers(); MahjongEffects.setStyle('off'); });
    await win(cases[1]);
    assert.equal(await page.locator('.mahjong-fx').count(), 0);
    await page.evaluate(() => { cancelGameTimers(); MahjongEffects.setStyle('jade'); MahjongEffects.showWin('selfDraw', S.resultDetail); });
    assert.equal(await page.locator('.mahjong-fx').count(), 0, 'enabling effects never replays an old muted result');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      MahjongEffects.showWin('win', { fan: 0, categories: ['門清', '莊家', '八對子', '<img src=x onerror=alert(1)>'] });
    });
    assert.equal(await page.locator('.fx-special').count(), 0, 'unknown/removed patterns never receive special effects');
    assert.equal(await page.locator('.fx-word').textContent(), '胡');
    assert.equal(await page.locator('.mahjong-fx img').count(), 0);
    await page.evaluate(() => {
      const random = Math.random;
      Math.random = () => { throw new Error('Special effect consumed game RNG'); };
      try { MahjongEffects.showWin('selfDraw', { fan: 16, categories: ['清一色'] }); }
      finally { Math.random = random; }
    });
    await page.waitForSelector('.mahjong-fx', { state: 'detached', timeout: 3300 });
    assert.deepEqual(errors, []);
    const report = { passed: true, legalSettlements: buttonWins + automaticFlowerWins, buttonWins,
      automaticFlowerWins, labelRenders, reduced: true, systemReduced: true, off: true,
      sameResultDoesNotReplay: true, errors, results,
      boundary: '11 fixed legal scoring cases in each of 3 styles and 2 Chromium viewports. Other supported labels tested as presentation metadata, not additional scoring validation. No physical phone.' };
    fs.writeFileSync(path.join(out, 'special-win-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: true, legalSettlements: report.legalSettlements, labelRenders, errors }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
