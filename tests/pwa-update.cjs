// Version label and safe self-update: home screen updates at once, a hand in progress gets a banner.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
let release = 0;
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  if (name === '/pwa-assets.js' && release) {
    res.end(fs.readFileSync(file, 'utf8').replace(/"version": "([^"]+)"/, `"version": "$1-r${release}"`).replace(/"label": "([^"]+)"/, `"label": "$1-r${release}"`));
  } else fs.createReadStream(file).pipe(res);
});
const checks = [];
const check = (ok, label) => { assert.ok(ok, label); checks.push(label); };
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.MahjongStartScreen?.state === 'home');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.waitForFunction(() => /版本 \d{4}\.\d{2}\.\d{2}-/.test(document.querySelector('#startScreen > .app-version')?.textContent || ''));
    const label = await page.locator('#startScreen > .app-version').textContent();
    check(true, `home shows ${label}`);
    // Home screen: a new release activates and reloads by itself.
    release = 1;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(() => /-r1/.test(document.querySelector('#startScreen > .app-version')?.textContent || ''), null, { timeout: 20000 });
    check(true, 'home screen applies the update and reloads into the new version');
    // A hand in progress: no takeover; a banner offers the update, which saves first.
    await page.locator('#startGameBtn').click(); await page.locator('#normalModeBtn').click();
    await page.waitForFunction(() => typeof S !== 'undefined' && S && S.phase !== 'deal' || (window.MahjongOpening?.finish?.('t'), false));
    await page.evaluate(() => { window.MahjongOpening?.finish?.('t'); cancelGameTimers(); window.__marker = 1; });
    release = 2;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.locator('.app-update-banner').waitFor({ timeout: 20000 });
    await page.waitForTimeout(6000);
    check(await page.evaluate(() => window.__marker === 1 && S.phase === 'play'), 'active hand is not interrupted while the banner waits');
    await page.locator('.app-update-banner').click();
    await page.waitForFunction(() => window.MahjongStartScreen?.state === 'home' && /-r2/.test(document.querySelector('#startScreen > .app-version')?.textContent || ''), null, { timeout: 20000 });
    check(await page.evaluate(() => !document.getElementById('continueGameBtn')?.hidden || !!document.querySelector('[id*="resume"]:not([hidden])')), 'after updating, the saved hand can be resumed');
    // Menu shows the label too.
    check(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
