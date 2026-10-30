const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const { enterGame } = require('./start-screen-helper.cjs');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts');
const tracks = {
  normal: ['music/一般模式 ①〈茶香摸八圈〉.mp3', 'music/一般模式 ②〈月下聽牌〉.mp3'],
  cultivation: ['music/修仙模式 ①〈雲海問道〉.mp3', 'music/修仙模式 ②〈御劍破陣〉.mp3']
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.mp3': 'audio/mpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((request, response) => {
  let name;
  try { name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch (_) { response.writeHead(400).end(); return; }
  if (name === '/favicon.ico') { response.writeHead(204).end(); return; }
  if (name.endsWith('/')) name += 'index.html';
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end(); return;
  }
  const size = fs.statSync(file).size;
  response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  response.setHeader('Accept-Ranges', 'bytes');
  const range = request.headers.range;
  let start = 0, end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || !match[1] && !match[2]) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
    response.statusCode = 206;
    response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  response.setHeader('Content-Length', end - start + 1);
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
});

async function waitPlaying(page, track) {
  await page.waitForFunction(expected => {
    const state = window.MahjongMusic?.getState();
    return state?.track === expected && state.playing && window.__musicMedia.some(audio =>
      decodeURIComponent(new URL(audio.currentSrc || audio.src).pathname).endsWith('/' + expected)
      && !audio.paused && audio.readyState >= 2 && audio.currentTime > .03
      && Number.isFinite(audio.duration) && audio.duration > 1 && !audio.error);
  }, track, { timeout: 15000 });
  return page.evaluate(expected => {
    const audio = window.__musicMedia.findLast(item =>
      decodeURIComponent(new URL(item.currentSrc || item.src).pathname).endsWith('/' + expected) && !item.paused);
    return { track: expected, duration: audio.duration, currentTime: audio.currentTime, volume: audio.volume,
      readyState: audio.readyState, mediaError: audio.error?.code || null };
  }, track);
}

async function waitStopped(page) {
  await page.waitForFunction(() => !MahjongMusic.getState().playing && window.__musicMedia.every(audio => audio.paused));
}

async function openTab(page, name) {
  if (await page.locator('#tableMenu').isHidden()) await page.locator('#tableMenuBtn').click();
  await page.locator('#tmTab-' + name).click();
  await page.waitForFunction(id => {
    const panel = document.getElementById(id);
    return !panel.hidden && Number(getComputedStyle(panel).opacity) === 1;
  }, 'tmPage-' + name);
}

async function goHome(page) {
  await openTab(page, 'session');
  await page.locator('#returnHomeBtn').click();
  await page.waitForFunction(() => MahjongStartScreen.state === 'home' && !document.getElementById('startGameBtn').disabled);
  await waitStopped(page);
  assert.equal(await page.evaluate(() => MahjongMusic.getState().mode), null);
}

async function freezeGame(page) {
  await page.evaluate(() => MahjongOpening?.finish('music-test'));
  await page.waitForFunction(() => S?.phase === 'play' && !MahjongImages.isLoading());
  // Keep the real hand intact; stop scheduled opponents while exercising settings.
  await page.evaluate(() => { cancelGameTimers(); hideReactionPanel(); });
}

async function nextTrack(page, expected) {
  const ended = await page.evaluate(() => {
    const audio = window.__musicMedia.findLast(item => !item.paused);
    if (!audio || !Number.isFinite(audio.duration)) throw new Error('No decoded music to seek');
    const count = window.__musicEnded.length;
    audio.currentTime = Math.max(0, audio.duration - .18);
    return count;
  });
  const media = await waitPlaying(page, expected);
  assert.ok(await page.evaluate(count => window.__musicEnded.length > count, ended), 'A native ended event advances the playlist');
  return media;
}

async function verify(engineName, engine, device) {
  const report = { engine: engineName, device: device.name, viewport: device.viewport,
    checks: [], tracks: [], errors: [], missing: [], screenshots: [] };
  const check = (value, label) => { assert.ok(value, label); report.checks.push(label); };
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: device.viewport, deviceScaleFactor: device.mobile ? 2 : 1,
      isMobile: device.mobile, hasTouch: device.mobile, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const requests = [];
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.missing.push({ url: response.url(), status: response.status() }); });
    page.on('request', request => { if (new URL(request.url()).pathname.includes('/music/')) requests.push(request.url()); });
    page.on('dialog', dialog => dialog.accept());
    await page.addInitScript(() => {
      window.__musicMedia = []; window.__musicEnded = []; window.__musicStarts = [];
      const nativePlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (new URL(this.currentSrc || this.src || document.baseURI).pathname.includes('/music/')) {
          if (!window.__musicMedia.includes(this)) {
            window.__musicMedia.push(this);
            this.addEventListener('ended', () => window.__musicEnded.push(this.src));
          }
          window.__musicStarts.push(this.src);
        }
        return nativePlay.apply(this, args);
      };
    });
    const url = 'http://127.0.0.1:' + server.address().port + '/';
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MahjongStartScreen?.state === 'home' && window.MahjongMusic);
    check(requests.length === 0 && await page.evaluate(() => window.__musicMedia.length === 0), 'Home does not download or start music');
    await enterGame(page);
    await freezeGame(page);
    report.tracks.push(await waitPlaying(page, tracks.normal[0]));
    check(true, 'Normal mode starts its first real MP3 after user interaction');
    const stable = await page.evaluate(() => {
      const audio = window.__musicMedia.findLast(item => !item.paused);
      audio.currentTime = 3;
      const starts = window.__musicStarts.length;
      for (let i = 0; i < 5; i++) renderAll();
      return { time: audio.currentTime, starts, after: window.__musicStarts.length };
    });
    check(stable.time >= 3 && stable.starts === stable.after, 'Repeated same-mode render does not rewind or restart music');
    report.tracks.push(await nextTrack(page, tracks.normal[1]));
    await nextTrack(page, tracks.normal[0]);
    check(true, 'Normal playlist advances and loops through native ended events');

    await openTab(page, 'sound');
    const bounds = await page.evaluate(() => {
      const menu = document.getElementById('tableMenu').getBoundingClientRect();
      const controls = ['soundBtn', 'soundVolume', 'voiceAnnouncements', 'ambienceSound', 'backgroundMusic'];
      return { width: innerWidth, height: innerHeight, menu: { x: menu.x, y: menu.y, right: menu.right, bottom: menu.bottom },
        controls: controls.map(id => {
          const node = document.getElementById(id), rect = node.getBoundingClientRect();
          return { id, width: rect.width, height: rect.height, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
        }) };
    });
    check(bounds.menu.x >= -1 && bounds.menu.y >= -1 && bounds.menu.right <= bounds.width + 1 && bounds.menu.bottom <= bounds.height + 1
      && bounds.controls.every(rect => rect.width > 0 && rect.height > 0 && rect.x >= bounds.menu.x - 1 && rect.y >= bounds.menu.y - 1
        && rect.right <= bounds.menu.right + 1 && rect.bottom <= bounds.menu.bottom + 1), 'Sound settings and music checkbox fit the viewport');
    const screenshot = `music-${engineName}-${device.name}.png`;
    await page.screenshot({ path: path.join(out, screenshot) }); report.screenshots.push(screenshot);
    check(await page.locator('#backgroundMusic').isChecked(), 'Music is enabled by default');
    await page.locator('#soundBtn').click(); await waitStopped(page);
    check(!(await page.evaluate(() => MahjongAudio.getState().enabled)), 'Master mute stops background music');
    await page.locator('#soundBtn').click(); await waitPlaying(page, tracks.normal[0]);
    await page.locator('#soundVolume').focus(); await page.locator('#soundVolume').press('Home'); await waitStopped(page);
    check(await page.evaluate(() => MahjongAudio.getState().volume) === 0, 'Zero master volume pauses music');
    for (let i = 0; i < 8; i++) await page.locator('#soundVolume').press('ArrowRight');
    const quiet = await waitPlaying(page, tracks.normal[0]);
    check(Math.abs(quiet.volume - .4 * .28) < .00001, 'Music uses master volume with background headroom');
    await page.locator('#backgroundMusic').uncheck(); await waitStopped(page);
    check(await page.evaluate(() => MahjongAudio.getState().enabled && !MahjongMusic.getState().enabled), 'Music toggle preserves master sound');
    await page.locator('#backgroundMusic').check(); await waitPlaying(page, tracks.normal[0]);

    await page.locator('#voiceAnnouncements').check();
    await openTab(page, 'voice');
    await page.locator('#voiceCue').selectOption('dealer-east');
    await page.locator('#previewVoice').click();
    await page.waitForFunction(() => MahjongVoice.getState().active && MahjongAudio.getState().ducked);
    const ducked = await page.evaluate(() => window.__musicMedia.findLast(audio => !audio.paused).volume);
    check(Math.abs(ducked - quiet.volume * .25) < .00001, 'Real voice preview ducks background music');
    await page.waitForFunction(() => !MahjongVoice.getState().active && !MahjongAudio.getState().ducked);
    const restored = await waitPlaying(page, tracks.normal[0]);
    check(Math.abs(restored.volume - quiet.volume) < .00001, 'Music volume recovers after voice playback');
    await openTab(page, 'sound'); await page.locator('#voiceAnnouncements').uncheck();

    await page.evaluate(() => {
      window.__testMusicHidden = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__testMusicHidden });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitStopped(page);
    await page.evaluate(() => { window.__testMusicHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await waitPlaying(page, tracks.normal[0]);
    check(true, 'Controlled visibilitychange pauses and resumes music');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await waitStopped(page);
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow'))); await waitPlaying(page, tracks.normal[0]);
    check(true, 'Controlled pagehide/pageshow pauses and resumes music');

    await goHome(page); check(true, 'Returning home stops music and clears the active mode');
    await page.locator('#startGameBtn').click(); await page.locator('#cultivationModeBtn').click();
    await page.locator('#journeyChooseConfirm').click();
    await page.waitForFunction(() => !!S?.cultivation); await freezeGame(page);
    report.tracks.push(await waitPlaying(page, tracks.cultivation[0]));
    report.tracks.push(await nextTrack(page, tracks.cultivation[1]));
    await nextTrack(page, tracks.cultivation[0]);
    check(true, 'Real cultivation entrance selects and loops its two exclusive tracks');
    check(await page.evaluate(() => window.__musicMedia.filter(audio => !audio.paused).length) === 1, 'Only one music element is playing after mode changes');

    await openTab(page, 'sound');
    await page.locator('#backgroundMusic').uncheck(); await page.locator('#soundBtn').click(); await waitStopped(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('qinghe_feedback_v1')));
    check(saved.music === false && saved.sound === false && saved.volume === 40, 'Music, master mute and volume preferences are saved');
    await goHome(page); await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#continueCultivationBtn').click(); await freezeGame(page); await waitStopped(page);
    await openTab(page, 'sound');
    check(!await page.locator('#backgroundMusic').isChecked() && await page.locator('#soundBtn').getAttribute('aria-pressed') === 'false'
      && await page.locator('#soundVolume').inputValue() === '40', 'Saved preferences survive reload and restore');
    await page.locator('#backgroundMusic').check(); await waitStopped(page);
    check(true, 'Enabling music cannot bypass a saved master mute');
    await page.locator('#soundBtn').click(); await waitPlaying(page, tracks.cultivation[0]);
    check(await page.evaluate(() => MahjongMusic.getState().failedTracks.length === 0), 'All real MP3 files decode without music errors');
    await goHome(page);
    assert.deepEqual(report.errors, [], 'Browser console and page errors');
    assert.deepEqual(report.missing, [], 'HTTP failures');
    check(true, 'No page errors, console errors or HTTP failures');
    await context.close();
    return report;
  } catch (error) {
    error.message = `${engineName}/${device.name}: ${error.message}`;
    report.failure = error.message;
    fs.writeFileSync(path.join(out, `music-${engineName}-${device.name}-failure.json`), JSON.stringify(report, null, 2));
    throw error;
  } finally { await browser.close(); }
}

async function verifyCompactLayout() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 568, height: 320 }, isMobile: true,
      hasTouch: true, serviceWorkers: 'block' });
    await page.addInitScript(() => localStorage.setItem('qinghe_feedback_v1', JSON.stringify({ sound: false })));
    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded' });
    await enterGame(page); await freezeGame(page); await openTab(page, 'sound');
    const bounds = await page.locator('#tmPage-sound .pref-row').evaluateAll(rows => rows.map(row => {
      const rect = row.getBoundingClientRect();
      const input = row.querySelector('input, button');
      return { label: row.textContent.trim(), id: input?.id, top: rect.top, bottom: rect.bottom,
        visible: !!input && document.elementFromPoint(input.getBoundingClientRect().x + input.getBoundingClientRect().width / 2,
          input.getBoundingClientRect().y + input.getBoundingClientRect().height / 2) === input };
    }));
    await page.screenshot({ path: path.join(out, 'music-chromium-compact.png') });
    fs.writeFileSync(path.join(out, 'music-compact-layout.json'), JSON.stringify(bounds, null, 2));
    assert.ok(bounds.every(row => row.top >= 0 && row.bottom <= 320 && row.visible), '568×320 sound controls remain inside the viewport and receive input');
    await page.locator('#backgroundMusic').uncheck();
    assert.equal(await page.locator('#backgroundMusic').isChecked(), false);
    await page.locator('#ambienceSound').check();
    assert.equal(await page.locator('#ambienceSound').isChecked(), true);
    console.log('chromium/compact: sound controls fit 568×320 and both bottom checkboxes are clickable.');
    return { viewport: { width: 568, height: 320 }, bounds, musicAndAmbienceClickable: true };
  } finally { await browser.close(); }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const reports = [];
  const cases = [
    ['chromium', chromium, { name: 'desktop', viewport: { width: 1440, height: 900 }, mobile: false }],
    ['chromium', chromium, { name: 'mobile', viewport: { width: 844, height: 390 }, mobile: true }],
    ['webkit', webkit, { name: 'mobile', viewport: { width: 844, height: 390 }, mobile: true }]
  ];
  for (const [name, engine, device] of cases) {
    if (process.argv.includes('--compact')) continue;
    if (process.argv.includes('--chromium') && name !== 'chromium') continue;
    if (process.argv.includes('--webkit') && name !== 'webkit') continue;
    if (process.argv.includes('--desktop') && device.mobile) continue;
    const report = await verify(name, engine, device); reports.push(report);
    console.log(`${name}/${device.name}: ${report.checks.length} checks passed; four MP3 files decoded.`);
  }
  const compact = process.argv.length === 2 || process.argv.includes('--compact') ? await verifyCompactLayout() : null;
  const result = { boundary: 'Isolated browser contexts and local HTTP with Range support; real MP3 playback and native ended events after seeking. Opponent timers are stopped during settings checks. Background events are controlled simulations; physical devices, OS suspension, human listening and production deployment are not verified.', reports, compact };
  const suffix = process.argv.includes('--compact') ? '-compact' : process.argv.includes('--webkit') ? '-webkit' : process.argv.includes('--desktop') ? '-desktop' : process.argv.includes('--chromium') ? '-chromium' : '';
  fs.writeFileSync(path.join(out, `music-browser${suffix}.json`), JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
