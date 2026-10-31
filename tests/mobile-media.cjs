const fs = require('fs'), path = require('path'), http = require('http');
const assert = require('assert/strict'), { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const desktop = process.argv.includes('--desktop');
const viewport = desktop ? { width: 1440, height: 900 } : { width: 844, height: 390 };
const dpr = desktop ? 1 : 3, prefix = desktop ? 'desktop-media' : 'mobile-media';
let holdAudio = true;
const pending = [];
const server = http.createServer((req, res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  const send = () => {
    if (res.destroyed) return;
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  };
  if (holdAudio && name.endsWith('.mp3')) pending.push(send); else send();
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const reports = [];
  for (const [engineName, engine] of (process.argv.includes('--webkit') ? [['webkit', webkit]] : [['chromium', chromium], ['webkit', webkit]])) {
    holdAudio = true;
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, serviceWorkers: 'block' });
      const page = await context.newPage(), errors = [], missing = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
      // Instrument only this isolated test context, without changing application code.
      await page.addInitScript(() => {
        window.testCrops = []; window.testSoundStarts = []; window.testDraws = 0;
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) {
          if (a.length === 8) {
            const [x, y, w, h] = a; window.testDraws++;
            if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > (img.naturalWidth || img.width) || y + h > (img.naturalHeight || img.height)) window.testCrops.push({ src: img.src, x, y, w, h });
          }
          return draw.call(this, img, ...a);
        };
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          const at = performance.now();
          if (!this.src.includes('/music/')) this.addEventListener('playing', () => window.testSoundStarts.push({ src: this.src, delay: performance.now() - at }), { once: true });
          return play.call(this);
        };
      });
      await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'domcontentloaded' });
      await page.locator('#startGameBtn').click(); await page.locator('#cultivationModeBtn').click(); await page.locator('#journeyChooseConfirm').click();
      await page.waitForFunction(() => !!S?.cultivation); await page.evaluate(() => MahjongOpening.finish('test'));
      await page.waitForFunction(() => S.phase === 'play' && !MahjongImages.isLoading());
      await page.evaluate(async () => {
        cancelGameTimers(); await Promise.all([MahjongCultivationEffects.loaded, MahjongMonsterEffects.loaded]);
        MahjongAudio.setEnabled(true); MahjongAudio.setVolume(.5); window.testSoundStarts = [];
        MahjongMonsterEffects.showPreview(MahjongMonsterSkills.all[0].id);
      });
      await page.waitForFunction(() => !!document.querySelector('.cult-vfx-preview canvas')?.dataset.lastSound, null, {timeout: 4000}).catch(async error => { console.log(engineName, await page.evaluate(() => ({prefs:MahjongAudio.getState(),canvas:{...document.querySelector('.cult-vfx-preview canvas')?.dataset}})), errors, missing); throw error; });
      await page.waitForTimeout(600); holdAudio = false; pending.splice(0).forEach(send => send()); await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => window.testSoundStarts.length), 0, 'late audio cannot outlive its visual cue');
      await page.locator('.cult-vfx-preview button').last().click();
      await page.waitForFunction(() => window.testSoundStarts.length > 0);
      const timely = await page.evaluate(() => window.testSoundStarts.at(-1).delay); assert.ok(timely < 350);
      await page.locator('.cult-vfx-preview header button').click();
      const skills = await page.evaluate(() => MahjongMonsterSkills.all.map(s => s.id));
      for (const id of skills) {
        await page.evaluate(id => MahjongMonsterEffects.showPreview(id), id); await page.waitForTimeout(220);
        await page.locator('.cult-vfx-preview header button').click();
      }
      await page.evaluate(() => MahjongMonsterEffects.showPreview(MahjongMonsterSkills.all.find(s => s.motion === 'dragon-wave').id));
      await page.waitForTimeout(600); await page.screenshot({ path: path.join(root, 'artifacts/' + prefix + '-' + engineName + '.png') });
      await page.locator('.cult-vfx-preview header button').click();
      const graphics = await page.evaluate(() => ({ draws: window.testDraws, badCrops: window.testCrops }));
      assert.ok(graphics.draws > 100); assert.deepEqual(graphics.badCrops, []); assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      reports.push({ engine: engineName, viewport: [viewport.width, viewport.height], dpr, recipes: skills.length, slowAudioDropped: true, soundStartMs: timely, ...graphics, errors, missing });
      await context.close();
    } finally { holdAudio = false; pending.splice(0).forEach(send => send()); await browser.close(); }
  }
  fs.writeFileSync(path.join(root, 'artifacts/' + prefix + '-browser.json'), JSON.stringify(reports, null, 2)); console.log(JSON.stringify(reports, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
