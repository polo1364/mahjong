// Cold-cache hero loading under a fixed 1.6 Mbit/s, 150 ms connection.
// --baseline records the previous implementation without optimization assertions.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
const baseline = process.argv.includes('--baseline');
const label = baseline ? 'before' : 'after';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const results = [], errors = [], missing = [];
  try {
    for (const [width, height, slow] of [[844, 390, true], [1440, 900, false]]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: 'block' });
      const page = await context.newPage();
      const imageRequests = [];
      page.on('request', request => { if (/\.(png|jpg|webp)(?:[?#]|$)/.test(request.url())) imageRequests.push(request.url()); });
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
      if (slow) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 100000 });
      }
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      if (!baseline) assert.ok(!imageRequests.some(url => /assets\/(cultivation-vfx|monster-skills)\//.test(url)), 'home does not eagerly fetch battle effects');
      await page.locator('#startGameBtn').click();
      const started = Date.now();
      await page.locator('#cultivationModeBtn').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.journey-hero-option img')].length === 10
        && [...document.querySelectorAll('.journey-hero-option img')].every(img => img.complete && img.naturalWidth > 0), null, { timeout: 120000 });
      const allHeroesMs = Date.now() - started;
      const stats = await page.evaluate(() => {
        const images = [...document.querySelectorAll('.journey-hero-option img')];
        const sources = images.map(img => img.currentSrc);
        return { sources, bytes: performance.getEntriesByType('resource').filter(r => sources.includes(r.name)).reduce((n, r) => n + r.encodedBodySize, 0),
          visible: images.every(img => { const r = img.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) };
      });
      assert.equal(stats.visible, true);
      if (!baseline) {
        assert.ok(stats.sources.every(src => src.endsWith('.thumb.webp')));
        assert.ok(stats.bytes < 500000, 'hero grid stays below 500 KB');
        const detailSource = await page.locator('.journey-selected-art img').evaluate(img => img.currentSrc);
        assert.equal(detailSource.endsWith('.thumb.webp'), width <= 1000, 'hidden mobile portrait reuses its thumbnail');
      }
      await page.screenshot({ path: path.join(root, `artifacts/hero-loading-${label}-${width}.png`) });
      for (const hero of require('../cultivation-heroes.js').all) {
        await page.locator(`[data-hero="${hero.id}"]`).click();
        assert.equal(await page.locator('#journeyHeroDetails h2').textContent(), hero.name);
      }
      assert.equal(await page.evaluate(() => S), null, 'selection does not deal a hidden game');
      await page.locator('#journeyChooseConfirm').click();
      await page.waitForFunction(() => !!S?.cultivation);
      await page.evaluate(() => { window.MahjongOpening?.finish('test'); cancelGameTimers(); });
      if (!baseline) {
        await page.evaluate(async () => {
          const loaded = await Promise.all([MahjongCultivationEffects.loaded, MahjongMonsterEffects.loaded]);
          if (loaded.some(group => group.some(ok => !ok))) throw new Error('VFX derivative did not decode');
          await Promise.all(Object.values(MahjongCrystalTiles.sheets).map(async sheet => {
            const img = new Image(); img.src = MahjongImageURL(`assets/tiles-crystal/${sheet.file}`); await img.decode();
          }));
        });
        const tileSources = await page.locator('#yourHand .tile-art image').evaluateAll(images => images.map(img => img.getAttribute('href')));
        assert.ok(tileSources.length > 0 && tileSources.every(src => src.endsWith('.webp')), 'hand uses optimized atlases');
        assert.ok(!imageRequests.some(url => /\.(png|jpg)(?:[?#]|$)/.test(url) && !url.includes('/assets/pwa/')), 'game uses no original raster downloads');
        await page.screenshot({ path: path.join(root, `artifacts/all-images-table-${width}.png`) });
      }
      results.push({ width, height, deviceScaleFactor: 2, slow, allHeroesMs, ...stats });
      await context.close();
    }
    if (!baseline) {
      const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => navigator.serviceWorker.controller
        && document.getElementById('startGameBtn')?.disabled === false
        && document.querySelector('#startScreen > .app-version'));
      await context.setOffline(true);
      await page.reload();
      await page.locator('#startGameBtn').click();
      const started = Date.now();
      await page.locator('#cultivationModeBtn').click();
      await page.waitForFunction(() => [...document.querySelectorAll('.journey-hero-option img')].length === 10
        && [...document.querySelectorAll('.journey-hero-option img')].every(img => img.complete && img.naturalWidth > 0));
      results.push({ offlineFirstSelection: true, allHeroesMs: Date.now() - started, visibleHeroes: 10 });
      await context.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    const report = { label, connection: '1.6 Mbit/s, 150 ms latency; fresh context, service worker disabled for cold-load comparison', results, errors, missing };
    fs.writeFileSync(path.join(root, `artifacts/hero-loading-${label}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
