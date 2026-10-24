const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const out = path.join(__dirname, '../artifacts');
const url = process.env.MAHJONG_URL || pathToFileURL(path.join(__dirname, '../index.html')).href;
const results = [];
const errors = [];

async function snapshot(page) {
  return page.evaluate(() => {
    const table = document.querySelector('.mahjong-table');
    const overlay = table.querySelector('.opening-overlay');
    const geometry = node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      table: geometry(table), frame: geometry(document.querySelector('.table-frame')),
      background: getComputedStyle(table).backgroundImage,
      contentVisible: [...table.children].filter(node => node !== overlay)
        .map(node => getComputedStyle(node).visibility),
      overlay: overlay && {
        background: getComputedStyle(overlay).backgroundImage,
        color: getComputedStyle(overlay).backgroundColor,
        zIndex: getComputedStyle(overlay).zIndex,
        phase: overlay.dataset.phase,
        style: ['jade', 'ink', 'neon'].find(style => overlay.classList.contains(`opening-${style}`))
      }
    };
  });
}

async function viewportChecks(browser, width, height, label) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(url);
    for (const style of ['jade', 'ink', 'neon']) {
      if (style !== 'jade') {
        await page.evaluate(style => { document.getElementById('effectStyle').value = style; }, style);
        await page.locator('#newGameBtn').click();
      }
      const phases = [];
      let first;
      for (const phase of ['shuffle', 'dice', 'wall', 'deal']) {
        await page.waitForFunction(phase => document.querySelector('.opening-overlay')?.dataset.phase === phase, phase);
        const current = await snapshot(page);
        first ||= current;
        assert.deepEqual(current.table, first.table);
        assert.deepEqual(current.frame, first.frame);
        assert.equal(current.background, first.background);
        assert.ok(current.background.includes('/assets/xianxia-table.jpg'));
        assert.deepEqual(current.overlay, {
          background: 'none', color: 'rgba(0, 0, 0, 0)', zIndex: '25', phase, style
        });
        assert.ok(current.contentVisible.every(value => value === 'hidden'));
        phases.push(phase);
        if (style === 'jade' && phase === 'shuffle') {
          await page.waitForTimeout(150);
          await page.screenshot({ path: path.join(out, `opening-surface-${label}-after.png`) });
        }
        if (phase === 'wall') {
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(out, `opening-surface-${label}-${style}-wall.png`) });
        }
      }
      await page.waitForFunction(() => !MahjongOpening.getState().active && S.phase === 'play');
      const ending = await page.evaluate(() => {
        cancelGameTimers();
        return MahjongOpening.getState();
      });
      const after = await snapshot(page);
      assert.equal(ending.status, 'completed');
      assert.equal(after.overlay, null);
      assert.deepEqual(after.table, first.table);
      assert.deepEqual(after.frame, first.frame);
      assert.equal(after.background, first.background);
      assert.ok(after.contentVisible.every(value => value === 'visible'));
      if (style === 'jade') await page.screenshot({ path: path.join(out, `opening-surface-${label}-game.png`) });
      results.push({ width, height, style, phases, table: first.table, frame: first.frame,
        sameSurface: true, contentRestored: true, completion: ending.status });
    }
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const completed = await Promise.allSettled([
      viewportChecks(browser, 1440, 1000, 'desktop'),
      viewportChecks(browser, 390, 844, 'phone'),
      viewportChecks(browser, 844, 390, 'landscape')
    ]);
    for (const result of completed) if (result.status === 'rejected') errors.push(result.reason.stack);
    assert.deepEqual(errors, []);
    assert.equal(results.length, 9);
    const report = { passed: true, checks: results.length, results, errors,
      boundary: 'Isolated Chromium contexts at DPR 1. All four phases and normal completion checked for three viewports and three styles. Lifecycle controls are covered by opening-browser.cjs; no physical device validation.' };
    fs.writeFileSync(path.join(out, 'opening-surface-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch(error => {
  fs.writeFileSync(path.join(out, 'opening-surface-report.json'), JSON.stringify({
    passed: false, checks: results.length, results, errors: [...errors, error.stack]
  }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
