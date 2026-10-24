const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const out = path.join(__dirname, '../artifacts');
const variants = [
  { style: 'jade', name: '大三元', motion: '.fx-burst-leaf' },
  { style: 'ink', name: '字一色', motion: '.fx-ink-droplet' },
  { style: 'neon', name: '大四喜', motion: '.fx-neon-comets path' }
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1000, height: 800 },
    recordVideo: { dir: path.join(out, 'motion-recording'), size: { width: 1000, height: 800 } }
  });
  const page = await context.newPage();
  const errors = [], sequences = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(process.env.MAHJONG_URL || pathToFileURL(path.join(__dirname, '../index.html')).href);
    await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play' && window.MahjongEffects?.showWin);
    await page.evaluate(() => {
      cancelGameTimers();
      MahjongEffects.setReduced(false);
      window.scrollTo(0, Math.max(0, document.querySelector('.table-frame').getBoundingClientRect().top + scrollY - 16));
    });
    await page.waitForTimeout(200);
    for (const variant of variants) {
      const stateBefore = await page.evaluate(() => JSON.stringify(S));
      await page.evaluate(({ style, name }) => {
        MahjongEffects.setStyle(style);
        window.motionStarted = performance.now();
        // Scoring is covered separately by special-win-browser.cjs; this isolates presentation.
        MahjongEffects.showWin('selfDraw', { fan: 16, categories: [name] });
      }, variant);
      const frames = [];
      for (const requestedMs of [220, 800, 1550, 2350]) {
        await page.waitForFunction(ms => performance.now() - window.motionStarted >= ms, requestedMs);
        const snapshot = await page.evaluate(selector => {
          const root = document.querySelector('.mahjong-fx');
          const particle = root.querySelector(selector);
          const css = getComputedStyle(particle);
          const emblem = getComputedStyle(root.querySelector('.fx-special-motion'));
          const rect = root.getBoundingClientRect();
          return {
            elapsedMs: Math.round(performance.now() - window.motionStarted),
            running: root.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
            translate: css.translate, rotate: css.rotate, scale: css.scale,
            dash: css.strokeDashoffset, emblem: emblem.transform,
            pointerEvents: getComputedStyle(root).pointerEvents,
            nodes: root.querySelectorAll('*').length,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          };
        }, variant.motion);
        assert.ok(snapshot.running > 0, `${variant.style}: animation still running at ${requestedMs} ms`);
        assert.equal(snapshot.pointerEvents, 'none');
        assert.ok(snapshot.nodes < 100, 'bounded presentation DOM');
        const buffer = await page.screenshot({
          path: path.join(out, `motion-${variant.style}-${requestedMs}.png`),
          clip: snapshot.rect
        });
        frames.push({ requestedMs, ...snapshot, sha256: createHash('sha256').update(buffer).digest('hex') });
      }
      assert.equal(new Set(frames.map(frame => frame.sha256)).size, 4, 'four visibly distinct rendered frames');
      assert.equal(new Set(frames.map(frame => JSON.stringify([frame.translate, frame.rotate, frame.scale, frame.dash]))).size, 4,
        'particle geometry changes across all four stages, beyond container opacity');
      await page.waitForSelector('.mahjong-fx', { state: 'detached', timeout: 1000 });
      assert.equal(await page.evaluate(() => JSON.stringify(S)), stateBefore, 'effects do not change game state');
      sequences.push({ style: variant.style, special: variant.name, durationMs: 2700, frames });
      await page.waitForTimeout(250);
    }
    // Ordinary wins also move, while claim animations retain their short duration.
    await page.evaluate(() => MahjongEffects.show('win'));
    assert.equal(await page.locator('.fx-burst-art').count(), 1);
    assert.equal(await page.locator('.mahjong-fx').evaluate(el => el.style.getPropertyValue('--fx-duration')), '1900ms');
    await page.evaluate(() => MahjongEffects.show('pong'));
    assert.equal(await page.locator('.fx-burst-art').count(), 0);
    assert.equal(await page.locator('.mahjong-fx').evaluate(el => el.style.getPropertyValue('--fx-duration')), '1150ms');
    await page.evaluate(() => MahjongEffects.clear());
    for (const variant of variants) {
      await page.evaluate(({ style, name }) => {
        MahjongEffects.setStyle(style);
        MahjongEffects.setReduced(true);
        MahjongEffects.showWin('win', { fan: 8, categories: [name] });
      }, variant);
      assert.equal(await page.locator('.mahjong-fx svg').count(), 0);
      assert.equal(await page.locator('.mahjong-fx').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
      assert.equal(await page.locator('.fx-word').textContent(), variant.name);
    }
    await page.evaluate(() => { MahjongEffects.setReduced(false); MahjongEffects.setStyle('off'); MahjongEffects.show('selfDraw'); });
    assert.equal(await page.locator('.mahjong-fx').count(), 0);
    assert.deepEqual(errors, []);
    const video = page.video();
    await context.close();
    await video.saveAs(path.join(out, 'special-win-motion.webm'));
    const report = {
      passed: true, sequences, errors, video: 'artifacts/special-win-motion.webm',
      noGameStateChange: true, reducedHasNoAnimations: true, off: true,
      boundary: 'Chromium animation and video from real local game UI; controlled settled-label metadata isolates presentation. Actual legal scoring/button tests are in special-win-report.json. No physical mobile device.'
    };
    fs.writeFileSync(path.join(out, 'effects-motion-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: true, sequences: sequences.length, distinctFrames: sequences.length * 4, errors }));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
