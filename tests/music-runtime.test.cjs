const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../feedback-music.js'), 'utf8');
const tracks = {
  normal: ['music/一般模式 ①〈茶香摸八圈〉.mp3', 'music/一般模式 ②〈月下聽牌〉.mp3'],
  cultivation: ['music/修仙模式 ①〈雲海問道〉.mp3', 'music/修仙模式 ②〈御劍破陣〉.mp3']
};
const settle = () => new Promise(resolve => setImmediate(resolve));

function player({ pending = false, playError = null, masterPresent = true } = {}) {
  const instances = [], events = new Map(), windowEvents = new Map();
  const master = { enabled: true, volume: .65, ducked: false };
  class AudioMock {
    constructor() {
      this.paused = true; this.currentTime = 0; this.volume = 1; this.requests = []; this.playCalls = 0;
      instances.push(this);
    }
    play() {
      this.playCalls++;
      if (playError) throw playError;
      this.paused = false;
      if (!pending) return Promise.resolve();
      return new Promise((resolve, reject) => this.requests.push({
        resolve: () => { this.paused = false; resolve(); }, reject
      }));
    }
    pause() { this.paused = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() { this.loads = (this.loads || 0) + 1; }
    end() { this.paused = true; this.onended?.(); }
    fail() { this.onerror?.(); }
  }
  const document = { hidden: false, addEventListener: (name, fn) => events.set(name, fn) };
  const window = { Audio: AudioMock, addEventListener: (name, fn) => windowEvents.set(name, fn) };
  if (masterPresent) window.MahjongAudio = { getState: () => master };
  vm.runInNewContext(source, { window, document });
  return { api: window.MahjongMusic, instances, events, windowEvents, master, document,
    gesture: (name = 'pointerdown', isTrusted = true) => events.get(name)({ isTrusted }),
    start(mode = 'normal') { this.api.setMode(mode); this.gesture(); } };
}

test('four local music files exist and the home screen never loads them', () => {
  for (const track of Object.values(tracks).flat()) assert.ok(fs.statSync(path.join(__dirname, '..', track)).size > 0);
  const h = player();
  assert.equal(h.api.getState().mode, null);
  assert.equal(h.api.getState().enabled, true);
  h.gesture(); h.api.syncPreferences();
  assert.equal(h.instances.length, 0);
  h.api.setMode('https://example.com/track.mp3');
  assert.equal(h.instances.length, 0);
});

test('loading is gated by a real gesture and the existing master preference', async () => {
  const h = player();
  h.api.setMode('normal'); h.gesture('click', false);
  assert.equal(h.instances.length, 0);
  h.master.enabled = false; h.gesture();
  assert.equal(h.instances.length, 0);
  h.master.enabled = true; h.api.syncPreferences(); await settle();
  assert.equal(h.api.getState().playing, true);
  assert.equal(h.instances[0].src, tracks.normal[0]);
  assert.equal(h.instances[0].preload, 'none');
  const missing = player({ masterPresent: false }); missing.start();
  assert.equal(missing.instances.length, 0);
});

test('each mode rotates its two tracks and repeated renders keep playback position', async () => {
  for (const mode of ['normal', 'cultivation']) {
    const h = player(); h.start(mode); await settle();
    h.instances[0].currentTime = 37;
    for (let i = 0; i < 20; i++) { h.api.setMode(mode); h.api.syncPreferences(); }
    assert.equal(h.instances.length, 1);
    assert.equal(h.instances[0].playCalls, 1);
    assert.equal(h.instances[0].currentTime, 37);
    h.instances[0].end(); await settle();
    assert.equal(h.api.getState().track, tracks[mode][1]);
    h.instances[1].end(); await settle();
    assert.equal(h.api.getState().track, tracks[mode][0]);
    assert.equal(h.instances.filter(audio => !audio.paused).length, 1);
  }
});

test('switching modes resets to the first track and stale callbacks cannot advance it', async () => {
  const h = player(); h.start(); await settle();
  const old = h.instances[0], ended = old.onended, failed = old.onerror;
  h.api.setMode('cultivation'); await settle();
  assert.equal(old.paused, true);
  assert.equal(old.src, '');
  ended(); failed();
  assert.equal(h.api.getState().track, tracks.cultivation[0]);
  assert.equal(h.instances.length, 2);
  h.api.setMode(null);
  assert.equal(h.api.getState().track, null);
  assert.ok(h.instances.every(audio => audio.paused));
});

test('master volume, voice ducking and independent music mute preserve the current position', async () => {
  const h = player(); h.start(); await settle();
  const audio = h.instances[0]; audio.currentTime = 42;
  assert.equal(audio.volume, .65 * .28);
  h.master.ducked = true; h.api.syncPreferences();
  assert.equal(audio.volume, .65 * .28 * .25);
  h.master.volume = .4; h.api.syncPreferences();
  assert.equal(audio.volume, .4 * .28 * .25);
  h.master.ducked = false; h.api.syncPreferences();
  assert.equal(audio.volume, .4 * .28);
  for (const mute of ['master', 'volume', 'music']) {
    if (mute === 'master') h.master.enabled = false;
    else if (mute === 'volume') h.master.volume = 0;
    else h.api.setEnabled(false);
    h.api.syncPreferences();
    assert.equal(audio.paused, true, mute);
    h.master.enabled = true; h.master.volume = .4; h.api.setEnabled(true); await settle();
    assert.equal(audio.paused, false, mute);
    assert.equal(audio.currentTime, 42);
    assert.equal(h.instances.length, 1);
  }
});

test('hidden tabs pause and pageshow alone releases the pagehide suspension', async () => {
  const h = player(); h.start(); await settle();
  const audio = h.instances[0];
  h.document.hidden = true; h.events.get('visibilitychange')();
  assert.equal(audio.paused, true);
  h.document.hidden = false; h.events.get('visibilitychange')(); await settle();
  assert.equal(audio.paused, false);
  h.windowEvents.get('pagehide')();
  h.api.syncPreferences(); h.gesture(); h.events.get('visibilitychange')();
  assert.equal(audio.paused, true);
  h.windowEvents.get('pageshow')(); await settle();
  assert.equal(audio.paused, false);
});

test('pending playback is not duplicated and old mode completion cannot revive disposed audio', async () => {
  const h = player({ pending: true }); h.start();
  for (let i = 0; i < 10; i++) { h.api.syncPreferences(); h.gesture(); }
  const old = h.instances[0]; assert.equal(old.requests.length, 1);
  h.api.setMode('cultivation');
  const current = h.instances[1]; current.requests[0].resolve(); await settle();
  old.requests[0].resolve(); await settle();
  assert.equal(old.paused, true);
  assert.equal(current.paused, false);
  assert.equal(h.api.getState().playing, true);
  assert.equal(h.instances.filter(audio => !audio.paused).length, 1);
});

test('late completion after mute, home, hidden or pagehide remains stopped', async () => {
  for (const stop of ['music', 'master', 'volume', 'home', 'hidden', 'pagehide']) {
    const h = player({ pending: true }); h.start();
    const audio = h.instances[0];
    if (stop === 'music') h.api.setEnabled(false);
    else if (stop === 'master') { h.master.enabled = false; h.api.syncPreferences(); }
    else if (stop === 'volume') { h.master.volume = 0; h.api.syncPreferences(); }
    else if (stop === 'home') h.api.setMode(null);
    else if (stop === 'hidden') { h.document.hidden = true; h.events.get('visibilitychange')(); }
    else h.windowEvents.get('pagehide')();
    audio.requests[0].resolve(); await settle();
    assert.equal(audio.paused, true, stop);
    assert.equal(h.api.getState().playing, false, stop);
  }
});

test('old pending rejection cannot stop a newer resume on the same element', async () => {
  const h = player({ pending: true }); h.start();
  const audio = h.instances[0];
  h.api.setEnabled(false); h.api.setEnabled(true);
  assert.equal(audio.requests.length, 2);
  audio.requests[1].resolve(); await settle();
  audio.requests[0].reject(new Error('Old cancellation')); await settle();
  assert.equal(h.api.getState().playing, true);
  assert.equal(h.api.getState().failedTracks.length, 0);
  assert.equal(h.instances.length, 1);
});

test('old pending success cannot pause a newer valid resume', async () => {
  const h = player({ pending: true }); h.start();
  const audio = h.instances[0];
  h.api.setEnabled(false); h.api.setEnabled(true);
  audio.requests[0].resolve(); await settle();
  assert.equal(audio.paused, false);
  audio.requests[1].resolve(); await settle();
  assert.equal(h.api.getState().playing, true);
});

test('missing tracks skip forward once and an entirely broken playlist stays silent', async () => {
  const h = player({ pending: true }); h.start();
  h.instances[0].fail();
  h.instances[0].requests[0].reject(new Error('Missing first song')); await settle();
  assert.equal(h.api.getState().track, tracks.normal[1]);
  assert.equal(h.instances.length, 2);
  h.instances[1].fail();
  h.instances[1].requests[0].reject(new Error('Missing second song')); await settle();
  for (let i = 0; i < 10; i++) { h.gesture(); h.api.syncPreferences(); }
  assert.equal(h.instances.length, 2);
  assert.equal(h.api.getState().playing, false);
  assert.equal(h.api.getState().failedTracks.length, 2);
  h.api.setMode('cultivation');
  h.instances[2].requests[0].resolve(); await settle();
  assert.equal(h.api.getState().playing, true);
});

test('autoplay denial retries on the next trusted gesture without condemning the track', async () => {
  const h = player({ pending: true }); h.start();
  const audio = h.instances[0];
  audio.requests[0].reject(Object.assign(new Error('Gesture needed'), { name: 'NotAllowedError' })); await settle();
  assert.equal(h.api.getState().blocked, true);
  assert.equal(h.api.getState().failedTracks.length, 0);
  h.api.syncPreferences(); h.api.setMode('normal');
  assert.equal(audio.requests.length, 1);
  h.gesture('keydown');
  assert.equal(audio.requests.length, 2);
  audio.requests[1].resolve(); await settle();
  assert.equal(h.api.getState().playing, true);
  assert.equal(h.api.getState().blocked, false);
});

test('synchronous media failures stop after trying both tracks', () => {
  const h = player({ playError: new Error('Media unavailable') }); h.start();
  assert.equal(h.instances.length, 2);
  assert.equal(h.api.getState().failedTracks.length, 2);
  assert.equal(h.api.getState().playing, false);
});
