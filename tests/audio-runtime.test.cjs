const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../feedback-audio.js'), 'utf8');

test('cultivation suppresses legacy meld and win sounds but retains other cues and normal-mode audio', () => {
  const {game,source:engineSource}=require('./game-harness.cjs');
  const {run}=game();
  // The engine harness disables presentation; restore the real wrapper for this integration check.
  run(engineSource.match(/function playSound\(cue\) \{[\s\S]*?\n\}/)[0]);
  run(`let sounds=[];window.MahjongAudio={play(cue){sounds.push(cue)}};soundEnabled=true;
    const actions=['chow','pong','kong','concealed-kong','win','self-draw'];
    S.cultivation={};actions.forEach(playSound);`);
  assert.equal(run('sounds.length'),0);
  run(`['draw','discard','flower','ready','draw-game','ui','shuffle','dice','wall','turn','session-end'].forEach(playSound);`);
  assert.equal(run('sounds.length'),11);
  run('sounds=[];S.cultivation=null;actions.forEach(playSound);');
  assert.equal(run('sounds.join(",")'),'chow,pong,kong,concealed-kong,win,self-draw');
  run('sounds=[];soundEnabled=false;actions.forEach(playSound);');
  assert.equal(run('sounds.length'),0);
});

function player({ pending = false, throws = false, timed = false } = {}) {
  const timers = new Map(); let timerId = 0;
  const instances = [];
  const events = new Map();
  const windowEvents = new Map();
  let time = 1000;
  class AudioMock {
    constructor() { this.paused = true; this.volume = 1; this.requests = []; instances.push(this); }
    play() {
      if (throws) throw new Error('Media unavailable');
      this.paused = false;
      if (!pending) return Promise.resolve();
      return new Promise((resolve, reject) => this.requests.push({
        resolve: () => { this.paused = false; resolve(); }, reject
      }));
    }
    pause() { this.paused = true; }
    end() { if (this.onended) this.onended(); }
    fail() { if (this.onerror) this.onerror(); }
  }
  const document = { hidden: false, addEventListener: (name, fn) => events.set(name, fn) };
  const window = { Audio: AudioMock, performance: { now: () => time },
    addEventListener: (name, fn) => windowEvents.set(name, fn) };
  if (timed) { window.setTimeout = (fn, ms) => { timers.set(++timerId, { fn, at: time + ms }); return timerId; }; window.clearTimeout = id => timers.delete(id); }
  const context = vm.createContext({ window, document });
  vm.runInContext(source, context);
  return { api: window.MahjongAudio, instances, document, events, windowEvents,
    advance: (ms = 1000) => { time += ms; for (const [id, timer] of timers) if (timer.at <= time) { timers.delete(id); timer.fn(); } } };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('audio defaults to off, uses a fixed local cue whitelist and reports successful starts', async () => {
  const { api, instances } = player();
  assert.equal(api.getState().enabled, false);
  assert.equal(api.getState().volume, .65);
  assert.equal(api.play('draw'), false);
  assert.equal(instances.length, 0);
  api.setEnabled(true);
  for (const cue of ['../secret', 'https://example.com/a', 'toString', '__proto__', '', null]) {
    assert.equal(api.play(cue), false);
  }
  assert.equal(api.play('draw'), true);
  assert.equal(instances[0].src, 'assets/audio/draw.mp3');
  await settle();
  assert.equal(api.getState().lastPlayed, 'draw');
  assert.equal(api.getState().active, 1);
});

test('same cue is throttled and ended sounds release their pooled voice', async () => {
  const { api, instances, advance } = player();
  api.setEnabled(true);
  assert.equal(api.play('discard'), true);
  assert.equal(api.play('discard'), false);
  advance(99);
  assert.equal(api.play('discard'), false);
  instances[0].end();
  advance(1);
  assert.equal(api.play('discard'), true);
  assert.equal(instances.length, 1);
  await settle();
  assert.equal(api.getState().active, 1);
});

test('four voice limit protects higher priority claims and a win clears lower priority sounds', async () => {
  const { api, instances } = player();
  api.setEnabled(true);
  ['chow', 'pong', 'flower', 'ready'].forEach(cue => assert.equal(api.play(cue), true));
  assert.equal(api.getState().active, 4);
  assert.equal(api.play('ui'), false);
  assert.equal(api.play('win'), true);
  await settle();
  assert.equal(api.getState().active, 1);
  assert.equal(api.getState().lastPlayed, 'win');
  assert.equal(instances.length, 4);
  assert.equal(instances.filter(audio => !audio.paused).length, 1);
});

test('sustained events reuse at most four nodes and stale ended callbacks do not stop a new cue', async () => {
  const { api, instances, advance } = player();
  api.setEnabled(true);
  api.play('draw');
  const oldEnd = instances[0].onended;
  const cues = ['draw', 'discard', 'chow', 'pong', 'kong', 'concealed-kong', 'flower', 'ready', 'win', 'self-draw', 'draw-game', 'ui'];
  for (let i = 0; i < 500; i++) { advance(); api.play(cues[i % cues.length]); }
  await settle();
  const active = api.getState().active;
  oldEnd();
  assert.equal(api.getState().active, active);
  assert.ok(active <= 4);
  assert.equal(instances.length, 4);
});

test('master volume clamps safely and updates existing and future voices with headroom', () => {
  const { api, instances } = player();
  api.setEnabled(true);
  api.play('chow');
  api.setVolume(1);
  assert.equal(instances[0].volume, .55 * .9);
  api.play('pong');
  assert.equal(instances[1].volume, instances[0].volume);
  api.setVolume(-1);
  assert.equal(api.getState().volume, 0);
  assert.ok(instances.every(audio => audio.volume === 0));
  api.setVolume(5);
  api.setVolume(NaN);
  api.setVolume('0.1');
  assert.equal(api.getState().volume, 1);
});

test('muting stops pending sounds and a late play completion cannot revive them', async () => {
  const { api, instances } = player({ pending: true });
  api.setEnabled(true);
  api.play('self-draw');
  api.setEnabled(false);
  assert.equal(api.getState().active, 0);
  instances[0].requests[0].resolve();
  await settle();
  assert.equal(instances[0].paused, true);
  assert.equal(api.getState().lastPlayed, null);
});

test('zero volume stops active audio and late playback cannot return when volume rises', async () => {
  const { api, instances } = player({ pending: true });
  api.setEnabled(true);
  api.play('flower');
  api.setVolume(0);
  assert.equal(api.getState().active, 0);
  assert.equal(instances[0].paused, true);
  assert.equal(api.play('win'), false);
  api.setVolume(.65);
  instances[0].requests[0].resolve();
  await settle();
  assert.equal(instances[0].paused, true);
  assert.equal(api.getState().lastPlayed, null);
  assert.equal(api.play('win'), true);
});

test('hidden/pagehide stops voices without changing the saved enabled choice', async () => {
  const { api, instances, document, events, windowEvents } = player({ pending: true });
  api.setEnabled(true);
  api.play('flower');
  document.hidden = true;
  events.get('visibilitychange')();
  assert.equal(api.play('draw'), false);
  instances[0].requests[0].resolve();
  await settle();
  assert.equal(api.getState().active, 0);
  assert.equal(api.getState().enabled, true);
  assert.equal(instances[0].paused, true);
  document.hidden = false;
  assert.equal(api.play('flower'), true);
  windowEvents.get('pagehide')();
  assert.equal(api.getState().active, 0);
});

test('an old rejected play promise cannot stop or mark failure on its reused voice', async () => {
  const { api, instances } = player({ pending: true });
  api.setEnabled(true);
  api.play('draw');
  api.stopAll();
  api.play('win');
  instances[0].requests[0].reject(new Error('Old abort'));
  instances[0].requests[1].resolve();
  await settle();
  assert.equal(api.getState().active, 1);
  assert.equal(api.getState().lastPlayed, 'win');
  assert.equal(api.getState().failedCues.length, 0);
  assert.equal(instances[0].paused, false);
});

test('missing samples and rejected/throwing playback fail quietly and recover on success', async () => {
  const { api, instances, advance } = player({ pending: true });
  api.setEnabled(true);
  api.play('kong');
  instances[0].fail();
  instances[0].requests[0].reject(new Error('Missing sample'));
  await settle();
  assert.equal(api.getState().active, 0);
  assert.equal(api.getState().failedCues.join(','), 'kong');
  advance();
  api.play('kong');
  instances[0].requests[1].resolve();
  await settle();
  assert.equal(api.getState().failedCues.length, 0);
  const unavailable = player({ throws: true }).api;
  unavailable.setEnabled(true);
  assert.equal(unavailable.play('ui'), false);
  assert.equal(unavailable.getState().failedCues.join(','), 'ui');
  assert.equal(unavailable.getState().active, 0);
});

test('voice ducking applies to active and future effects and restores the selected volume', () => {
  const { api, instances } = player();
  api.setEnabled(true);
  api.play('chow');
  const normal = instances[0].volume;
  api.setDucked(true);
  assert.equal(instances[0].volume, normal * .28);
  api.play('pong');
  assert.equal(instances[1].volume, normal * .28);
  api.setVolume(.4);
  assert.equal(instances[0].volume, .4 * .55 * .9 * .28);
  api.setDucked(false);
  assert.equal(instances[0].volume, .4 * .55 * .9);
  assert.equal(api.getState().volume, .4);
});


test('slow-network effects expire before a late play completion can revive them', async () => {
  const h = player({ pending: true, timed: true }); h.api.setEnabled(true);
  h.api.play('discard'); h.advance(301);
  assert.equal(h.api.getState().active, 0);
  h.instances[0].requests[0].resolve(); await settle();
  assert.equal(h.instances[0].paused, true);
  assert.equal(h.api.getState().lastPlayed, null);
  h.api.play('pong'); h.instances[0].requests[1].resolve(); await settle(); h.advance(500);
  assert.equal(h.instances[0].paused, false, 'already-started clips can finish normally');
});
