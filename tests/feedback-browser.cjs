const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { enterGame } = require('./start-screen-helper.cjs');
const tileNames = require('../tile-names.js');

const root = path.join(__dirname, '..');
const out = path.join(root, 'artifacts');
const noAudio = process.argv.includes('--no-audio');
const withVoice = process.argv.includes('--voice') && !noAudio;
const prefix = process.argv.find(arg => arg.startsWith('--prefix='))?.slice(9) ?? (withVoice ? 'voice-' : 'feedback-');
assert.match(prefix, /^[a-z0-9-]+$/, 'artifact prefix must be a safe filename prefix');
const voiceCues = [...tileNames.keys.map(key => 'tile-' + key.toLowerCase()),
  ...['e', 's', 'w', 'n'].flatMap(round => ['e', 's', 'w', 'n'].map(seat => `round-${round}${seat}`)),
  'dealer-east', 'dealer-south', 'dealer-west', 'dealer-north', 'dealer-repeat'];
const result = { mode: withVoice ? 'real-local-voice-through-current-settings' : 'current-settings-controls-only',
  checks: [], viewports: [], voice: [], errors: [], screenshots: [] };
fs.mkdirSync(out, { recursive: true });
const check = (condition, message) => { assert.ok(condition, message); result.checks.push(message); };

// The settings menu is tabbed; bring the page holding a control forward before using it.
const show = (pg, id) => pg.evaluate(id => {
  const page = document.getElementById(id)?.closest('.tm-page');
  if (page) window.MahjongTableMenu?.selectTab(page.id.slice('tmPage-'.length));
}, id);
async function preparePage(page) {
  page.on('pageerror', error => result.errors.push({ type: 'pageerror', message: error.message, url: page.url() }));
  page.on('console', message => {
    if (message.type() === 'error') result.errors.push({ type: 'console', message: message.text(), url: page.url() });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
  // Observe real media without substituting play(), decoding, or timing. Start
  // this isolated context with a saved mute preference so previews opt in later.
  await page.addInitScript(() => {
    if (!localStorage.getItem('qinghe_feedback_v1')) {
      localStorage.setItem('qinghe_feedback_v1', JSON.stringify({ sound: false, volume: 65 }));
    }
    window.__feedbackMedia = [];
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (!window.__feedbackMedia.includes(this)) window.__feedbackMedia.push(this);
      return nativePlay.apply(this, args);
    };
  });
}

async function freezeGame(page) {
  await enterGame(page);
  await page.waitForFunction(() => S?.phase === 'play' && window.MahjongAudio && window.MahjongVoice);
  return page.evaluate(() => { cancelGameTimers(); return JSON.stringify(S); });
}

async function openNames(page) {
  if (await page.locator('#tableMenu').isHidden()) await page.locator('#tableMenuBtn').click();
  await page.locator('#tmTab-voice').click();
}

async function noGameChange(page, before, label) {
  assert.equal(await page.evaluate(() => JSON.stringify(S)), before, label);
  result.checks.push(label);
}

async function playRealVoice(page, cue, protocol) {
  await page.evaluate(() => { MahjongVoice.stopAll(); MahjongAudio.stopAll(); });
  await show(page, 'voiceCue'); await page.locator('#voiceCue').selectOption(cue);
  await show(page, 'previewVoice'); await page.locator('#previewVoice').click();
  await page.waitForFunction(cue => MahjongVoice.getState().lastPlayed === cue &&
    window.__feedbackMedia.some(audio => audio.currentSrc.split('?')[0].endsWith(`/${cue}.mp3`) &&
      audio.readyState >= 2 && Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime > 0), cue,
    { timeout: 12000 });
  const media = await page.evaluate(cue => {
    const audio = window.__feedbackMedia.find(item => item.currentSrc.split('?')[0].endsWith(`/${cue}.mp3`));
    return { cue, src: audio.currentSrc, duration: audio.duration, currentTime: audio.currentTime,
      readyState: audio.readyState, volume: audio.volume, mediaError: audio.error?.code || null,
      voice: MahjongVoice.getState(), sfx: MahjongAudio.getState() };
  }, cue);
  check(media.mediaError === null && media.voice.failedCues.length === 0 && media.volume > 0,
    `${protocol} ${cue} decodes and plays through the settings preview button`);
  check(media.voice.active === cue && media.sfx.ducked, `${protocol} ${cue} ducks sound effects during speech`);
  check(media.src.includes(cue.startsWith('tile-') ? '/voice-crystal-v1/' : '/voice/'),
    `${protocol} ${cue} loads the intended asset version`);
  result.voice.push({ protocol, ...media });
}

(async () => {
  if (withVoice) for (const cue of voiceCues) {
    const file = path.join(root, 'assets', 'audio', cue.startsWith('tile-') ? 'voice-crystal-v1' : 'voice', `${cue}.mp3`);
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, `Real ElevenLabs voice required: ${file}`);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await preparePage(page);
    await page.goto(process.env.MAHJONG_URL || 'http://127.0.0.1:8765');
    let before = await freezeGame(page);
    await openNames(page);
    check(await page.locator('#soundBtn').getAttribute('aria-pressed') === 'false', 'saved muted preference starts with sound disabled');
    check(await page.evaluate(() => MahjongAudio.getState().volume) === .65, 'master volume starts at 65 percent');
    const options = await page.locator('#voiceCue option').evaluateAll(nodes => nodes.map(node => ({ value: node.value, text: node.textContent })));
    check(options.length === 63 && new Set(options.map(option => option.value)).size === 63,
      '42 tile, 16 round and five dealer previews are available without duplicates');
    assert.deepEqual(options.map(option => option.value).sort(), [...voiceCues].sort());
    for (const entry of tileNames.entries) {
      check(options.find(option => option.value === 'tile-' + entry.key.toLowerCase())?.text === entry.name,
        `${entry.key} preview uses the shared crystal name`);
    }
    check(await page.locator('#tileNameReference tbody tr').count() === 18, 'reference table covers three suits, seven honors and eight flowers');
    check(await page.locator('#effectStyle option').count() === 4, 'existing three effect styles and off remain selectable');
    await page.locator('#tmTab-voice').focus();
    await page.keyboard.press('Tab');
    check(await page.evaluate(() => document.activeElement.id === 'voiceCue'), 'Tab enters the voice selector from the voice tab');
    await page.locator('#previewVoice').focus();
    await page.keyboard.press('Tab');
    check(await page.locator('#cultivationCatalog').isHidden(), 'Normal mode excludes cultivation catalogs from the focus order');
    check(await page.evaluate(() => document.activeElement.id === 'tableMenuClose'), 'Tab wraps from voice preview to settings close in normal mode');
    await page.keyboard.press('Shift+Tab');
    check(await page.evaluate(() => document.activeElement.id === 'previewVoice'), 'Shift Tab returns to voice preview in normal mode');

    for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#tmTab-names').click();
      const reference = path.join(out, `${prefix}reference-${width}x${height}.png`);
      await page.screenshot({ path: reference, fullPage: false });
      result.screenshots.push(reference);
      await page.locator('#tmTab-voice').click();
      const geometry = await page.evaluate(() => {
        const panel = document.getElementById('tableMenu');
        return { overflow: panel.scrollWidth > panel.clientWidth + 1,
          controls: ['voiceCue', 'previewVoice'].map(id => {
            const rect = document.getElementById(id).getBoundingClientRect();
            return { id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
          }) };
      });
      check(!geometry.overflow && geometry.controls.every(rect => rect.left >= 0 && rect.right <= width && rect.width > 0 && rect.height > 0),
        `crystal name preview controls fit ${width}x${height} without horizontal overflow`);
      const screenshot = path.join(out, `${prefix}names-${width}x${height}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      result.screenshots.push(screenshot);
      result.viewports.push({ width, height, ...geometry });
    }
    await noGameChange(page, before, 'opening name reference and resizing preserve the entire game state');
    await show(page, 'effectStyle'); await page.locator('#effectStyle').selectOption('ink');
    await show(page, 'soundVolume'); await page.locator('#soundVolume').fill('35');
    await show(page, 'reduceEffects'); await page.locator('#reduceEffects').check();
    await show(page, 'voiceAnnouncements'); await page.locator('#voiceAnnouncements').check();
    check(await page.evaluate(() => voiceEnabled && !soundEnabled && !MahjongAudio.getState().enabled),
      'voice preference does not implicitly enable master audio');
    await noGameChange(page, before, 'presentation preference changes preserve game state');
    await page.reload();
    before = await freezeGame(page);
    await openNames(page);
    check(await page.locator('#effectStyle').inputValue() === 'ink' && await page.locator('#soundVolume').inputValue() === '35' &&
      await page.locator('#reduceEffects').isChecked() && await page.locator('#voiceAnnouncements').isChecked(),
      'style volume reduced-motion and voice preferences survive reload');
    check(await page.locator('#volumeValue').textContent() === '35%' &&
      await page.evaluate(() => MahjongAudio.getState().volume === .35 && !MahjongAudio.getState().enabled),
      'reloaded volume applies with master mute preserved');
    await show(page, 'reduceEffects'); await page.locator('#reduceEffects').uncheck();
    await show(page, 'soundVolume'); await page.locator('#soundVolume').fill('65');

    if (withVoice) {
      await show(page, 'soundBtn'); await page.locator('#soundBtn').click();
      for (const cue of voiceCues) await playRealVoice(page, cue, 'http');
      await page.waitForFunction(() => MahjongVoice.getState().active === null && !MahjongAudio.getState().ducked,
        null, { timeout: 10000 });
      check(true, 'finishing a real voice clip restores effects without changing master volume');
      await playRealVoice(page, 'tile-h1', 'http-voice-toggle');
      await show(page, 'voiceAnnouncements'); await page.locator('#voiceAnnouncements').uncheck();
      check(await page.evaluate(() => soundEnabled && !MahjongAudio.getState().ducked &&
        MahjongVoice.getState().active === null && !MahjongVoice.getState().enabled), 'voice-off stops speech while master sound stays enabled');
      await show(page, 'voiceAnnouncements'); await page.locator('#voiceAnnouncements').check();
      await playRealVoice(page, 'tile-w1', 'http-master-mute');
      await show(page, 'soundBtn'); await page.locator('#soundBtn').click();
      check(await page.evaluate(() => MahjongVoice.getState().active === null && MahjongVoice.getState().pending.length === 0 &&
        window.__feedbackMedia.every(audio => audio.paused)), 'master mute stops voice and pending announcements');
      await show(page, 'previewVoice'); await page.locator('#previewVoice').click();
      await page.waitForTimeout(100);
      check(await page.evaluate(() => MahjongVoice.getState().active === null && window.__feedbackMedia.every(audio => audio.paused)),
        'muted preview does not restart playback');
      check(await page.evaluate(() => window.__feedbackMedia.filter(audio => /\/voice(?:-crystal-v1)?\//.test(audio.currentSrc)).length === 1),
        'all voice previews reuse one real HTMLAudioElement');
    }
    await noGameChange(page, before, 'voice preview and mute controls preserve the entire game state');

    const filePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await preparePage(filePage);
    await filePage.goto(pathToFileURL(path.join(root, 'index.html')).href);
    const fileBefore = await freezeGame(filePage);
    await openNames(filePage);
    check(await filePage.locator('#voiceCue option').count() === 63, 'file URL provides the same 63 current voice previews');
    if (withVoice) {
      await show(filePage, 'voiceAnnouncements'); await filePage.locator('#voiceAnnouncements').check();
      await show(filePage, 'soundBtn'); await filePage.locator('#soundBtn').click();
      for (const cue of ['tile-db', 'tile-h8', 'round-ee']) await playRealVoice(filePage, cue, 'file');
      await show(filePage, 'soundBtn'); await filePage.locator('#soundBtn').click();
      check(await filePage.evaluate(() => MahjongVoice.getState().active === null), 'file URL mute also stops its local voice');
    }
    await noGameChange(filePage, fileBefore, 'file URL preview preserves game state');
    await filePage.close();
    check(result.errors.length === 0, `no console or page errors: ${JSON.stringify(result.errors)}`);
    result.status = 'passed';
    console.log(JSON.stringify({ status: result.status, mode: result.mode, checks: result.checks.length,
      viewports: result.viewports.length, realVoicePreviews: result.voice.length, errors: result.errors.length }));
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, prefix + (noAudio ? 'visual-results.json' : 'browser-results.json')), JSON.stringify(result, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
