const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { enterGame } = require('./start-screen-helper.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts');
const errors = [], missing = [], cases = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
let update = false;
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/mahjong\//, '/');
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  if (update && name === '/pwa-assets.js') {
    res.end(fs.readFileSync(file, 'utf8').replace(/"version": "([^"]+)"/, '"version": "$1-test-update"'));
  } else fs.createReadStream(file).pipe(res);
});
async function ready(page) {
  await page.waitForFunction(() => window.MahjongStartScreen?.state === 'home' && !document.getElementById('startGameBtn').disabled);
}
async function controlled(page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
}
async function until(check, message) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const prefix of ['/', '/mahjong/']) {
      update = false;
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      let page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
      await page.goto(base + prefix);
      await ready(page);
      await controlled(page);
      const cdp = await context.newCDPSession(page);
      const installability = await cdp.send('Page.getInstallabilityErrors');
      assert.deepEqual(installability.installabilityErrors, []);
      const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
      assert.equal(manifest.orientation, 'landscape');
      assert.equal(manifest.display, 'standalone');
      for (const icon of manifest.icons) {
        assert.equal(await page.evaluate(async src => {
          const image = new Image(); image.src = src; await image.decode(); return `${image.naturalWidth}x${image.naturalHeight}`;
        }, icon.src), icon.sizes);
      }
      for (const [width, height] of [[1440, 900], [844, 390], [568, 320], [1024, 768], [390, 844], [320, 568], [768, 1024], [900, 1440]]) {
        await page.setViewportSize({ width, height });
        await page.waitForFunction(portrait => document.getElementById('landscapeNotice').open === portrait, height >= width);
        const isPortrait = height >= width;
        if (isPortrait) {
          await page.keyboard.press('Escape');
          await page.keyboard.press('Tab');
          assert.equal(await page.locator('#landscapeNotice').evaluate(el => el.open), true, `${prefix} ${width}x${height}: reminder survives Escape/Tab`);
          assert.equal(await page.evaluate(() => document.getElementById('landscapeNotice').contains(document.activeElement) || document.activeElement === document.body), true);
          assert.equal(await page.evaluate(() => S), null);
          const rect = await page.locator('#landscapeNotice').boundingBox();
          assert.equal(Math.round(rect.width), width);
          assert.equal(Math.round(rect.height), height);
        } else {
          await page.locator('#startGameBtn').click();
          await page.locator('#startBackBtn').click();
        }
        if (prefix === '/' && [390, 844, 1440].includes(width)) {
          await page.screenshot({ path: path.join(output, `pwa-${width}x${height}.png`) });
        }
        cases.push(`${prefix} viewport ${width}x${height}`);
      }
      await page.setViewportSize({ width: 844, height: 390 });
      await page.reload(); // Populate runtime media now that the first worker controls the page.
      await ready(page);
      await enterGame(page);
      await page.waitForTimeout(600);
      await page.evaluate(() => cancelGameTimers());
      await page.setViewportSize({ width: 390, height: 844 });
      const before = await page.evaluate(() => {
        window.pwaCallbackCount = 0;
        scheduleGame(() => { window.pwaCallbackCount++; }, 20);
        return JSON.stringify(S);
      });
      await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => window.pwaCallbackCount), 0);
      assert.equal(await page.evaluate(() => JSON.stringify(S)), before);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#landscapeNotice').evaluate(el => el.open), true);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => window.pwaCallbackCount === 1);
      assert.equal(await page.evaluate(() => JSON.stringify(S)), before);
      if (prefix === '/') await page.screenshot({ path: path.join(output, 'pwa-game-landscape.png') });
      cases.push(`${prefix} game pause/resume preserves state`);

      await context.setOffline(true);
      await page.reload();
      await ready(page);
      await enterGame(page);
      assert.equal(await page.evaluate(() => S.phase), 'play');
      await page.evaluate(() => cancelGameTimers());
      cases.push(`${prefix} offline reload and normal game`);
      await context.setOffline(false);
      await page.reload();
      await ready(page);
      await page.locator('#startGameBtn').click();
      await page.locator('#cultivationModeBtn').click();
      await page.locator('#journeyChooseConfirm').waitFor({ state: 'visible' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.getElementById('landscapeNotice').open);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.journey-selection-screen').evaluate(el => el.open), true);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.locator('#journeyChooseConfirm').click();
      await page.waitForFunction(() => !!S?.cultivation);
      await page.evaluate(() => window.MahjongOpening?.finish('test-skip'));
      assert.equal(await page.evaluate(() => !!S.cultivation), true);
      await page.evaluate(() => cancelGameTimers());
      cases.push(`${prefix} cultivation starts`);

      // A new version must wait without taking over/reloading an active game.
      const controller = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
      update = true;
      const nextWorker = context.waitForEvent('serviceworker');
      await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
      const worker = await nextWorker;
      await until(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), 'update should wait');
      assert.equal(await page.evaluate(() => !!S.cultivation), true);
      assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), controller);
      await page.close();
      let activated = false;
      for (let attempt = 0; attempt < 100 && !activated; attempt++) {
        activated = await worker.evaluate(() => self.registration.active?.state === 'activated' && !self.registration.waiting);
        if (!activated) await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(activated, true, 'new worker activates after the game tab closes');
      page = await context.newPage();
      await page.goto(base + prefix);
      await ready(page);
      await controlled(page);
      await until(() => page.evaluate(async prefix => (await caches.keys()).some(key => key.endsWith('-test-update'))
        && !(await navigator.serviceWorker.getRegistration()).waiting
        && (await caches.keys()).filter(name => name.startsWith(`mahjong-pwa:${prefix}:`)).length === 1, prefix), 'new cache should replace old cache');
      const cacheNames = await page.evaluate(() => caches.keys());
      assert.equal(cacheNames.filter(name => name.startsWith(`mahjong-pwa:${prefix}:`)).length, 1, JSON.stringify(cacheNames));
      cases.push(`${prefix} update waits for game tabs to close, removes obsolete app cache`);
      await context.close();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    const report = { passed: cases.length, cases, browserErrors: errors, missingOnlineAssets: missing };
    fs.writeFileSync(path.join(output, 'pwa-browser.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
