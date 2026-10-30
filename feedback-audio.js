(() => {
  'use strict';

  // All samples are local ElevenLabs exports. No synthesis or network fallback.
  const CUES = Object.freeze({
    draw: { gain: .65, priority: 0, gap: 90 },
    discard: { gain: .8, priority: 1, gap: 100 },
    chow: { gain: .9, priority: 2, gap: 180 },
    pong: { gain: .9, priority: 2, gap: 180 },
    kong: { gain: 1, priority: 3, gap: 250 },
    'concealed-kong': { gain: 1, priority: 3, gap: 250 },
    flower: { gain: .8, priority: 2, gap: 140 },
    ready: { gain: .9, priority: 3, gap: 350 },
    win: { gain: 1, priority: 4, gap: 700 },
    'self-draw': { gain: 1, priority: 4, gap: 700 },
    'draw-game': { gain: .9, priority: 3, gap: 500 },
    ui: { gain: .55, priority: 0, gap: 80 },
    shuffle: { gain: .7, priority: 1, gap: 1500 },
    dice: { gain: .85, priority: 1, gap: 800 },
    wall: { gain: .7, priority: 1, gap: 800 },
    turn: { gain: .6, priority: 1, gap: 600 },
    'session-end': { gain: 1, priority: 4, gap: 3000 }
  });
  const MAX_VOICES = 4;
  const HEADROOM = .55;
  const voices = [];
  const recent = new Map();
  const failedCues = new Set();
  let enabled = false;
  let volume = .65;
  let ducked = false;
  let lastPlayed = null;
  let sequence = 0;
  // Background room tone loops on its own element; event sounds never evict it.
  const AMBIENCE_GAIN = .32;
  let ambienceWanted = false;
  let ambience = null;

  function ambienceVolume() { return volume * HEADROOM * AMBIENCE_GAIN * (ducked ? .5 : 1); }
  function syncAmbience() {
    const shouldPlay = ambienceWanted && enabled && volume > 0 && !hidden();
    if (!shouldPlay) {
      if (ambience) try { ambience.pause(); } catch (_) { /* Unavailable media. */ }
      return;
    }
    try {
      if (!ambience) {
        ambience = new window.Audio('assets/audio/ambience.mp3');
        ambience.loop = true;
        ambience.preload = 'auto';
        ambience.onerror = () => failedCues.add('ambience');
      }
      ambience.volume = ambienceVolume();
      const result = ambience.paused ? ambience.play() : null;
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).then(() => { if (!ambienceWanted || !enabled || hidden()) ambience.pause(); }, () => failedCues.add('ambience'));
      }
    } catch (_) { failedCues.add('ambience'); }
  }

  const now = () => window.performance ? window.performance.now() : Date.now();
  const hidden = () => document.hidden === true;

  function stopVoice(voice) {
    window.clearTimeout?.(voice.startTimer);
    voice.token = ++sequence;
    voice.active = false;
    voice.audio.onended = null;
    voice.audio.onerror = null;
    try { voice.audio.pause(); } catch (_) { /* Detached or unavailable media. */ }
    try { voice.audio.currentTime = 0; } catch (_) { /* Metadata may not be loaded. */ }
  }

  function stopAll() {
    voices.forEach(stopVoice);
    recent.clear();
  }

  function makeVoice() {
    const audio = new window.Audio();
    audio.preload = 'auto';
    const voice = { audio, active: false, cue: null, priority: 0, order: 0, token: 0 };
    voices.push(voice);
    return voice;
  }

  function play(cue) {
    if (!enabled || !volume || hidden() || typeof cue !== 'string' || !Object.prototype.hasOwnProperty.call(CUES, cue)) return false;
    const config = CUES[cue];
    const time = now();
    if (recent.has(cue) && time - recent.get(cue) < config.gap) return false;

    // A win has room to breathe instead of stacking over tile and claim sounds.
    if (config.priority === 4) voices.filter(voice => voice.active).forEach(stopVoice);
    let voice = voices.find(item => !item.active);
    if (!voice && voices.length < MAX_VOICES) {
      try { voice = makeVoice(); } catch (_) { failedCues.add(cue); return false; }
    }
    if (!voice) {
      voice = voices.reduce((oldest, item) => item.priority < oldest.priority ||
        (item.priority === oldest.priority && item.order < oldest.order) ? item : oldest);
      if (voice.priority > config.priority) return false;
      stopVoice(voice);
    }

    const token = ++sequence;
    const deadline = time + 300;
    Object.assign(voice, { active: true, cue, priority: config.priority, order: token, token });
    recent.set(cue, time);
    const isCurrent = () => voice.token === token && voice.active;
    const fail = () => {
      if (!isCurrent()) return;
      failedCues.add(cue);
      stopVoice(voice);
    };
    voice.startTimer = window.setTimeout?.(() => { if (isCurrent()) stopVoice(voice); }, 300);
    const started = () => {
      if (!isCurrent() || !enabled || hidden()) {
        // A late play() completion must never revive a stopped sound. Do not
        // pause a newer valid cue that has since reused this pooled element.
        if (!voice.active || !enabled || hidden()) {
          try { voice.audio.pause(); } catch (_) { /* Already unavailable. */ }
        }
        return;
      }
      window.clearTimeout?.(voice.startTimer);
      if (now() > deadline) { stopVoice(voice); return; }
      failedCues.delete(cue);
      lastPlayed = cue;
    };
    voice.audio.onended = () => { if (isCurrent()) stopVoice(voice); };
    voice.audio.onerror = fail;
    try {
      voice.audio.src = `assets/audio/${cue}.mp3`;
      voice.audio.volume = volume * HEADROOM * config.gain * (ducked ? .28 : 1);
      const result = voice.audio.play();
      if (result && typeof result.then === 'function') Promise.resolve(result).then(started, fail);
      else started();
      return true;
    } catch (_) {
      fail();
      return false;
    }
  }

  window.MahjongAudio = Object.freeze({
    play,
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) stopAll();
      syncAmbience();
      window.MahjongMusic?.syncPreferences();
    },
    setVolume(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      volume = Math.max(0, Math.min(1, value));
      voices.filter(voice => voice.active).forEach(voice => {
        voice.audio.volume = volume * HEADROOM * CUES[voice.cue].gain * (ducked ? .28 : 1);
      });
      if (!volume) stopAll();
      syncAmbience();
      window.MahjongMusic?.syncPreferences();
    },
    setDucked(value) {
      ducked = Boolean(value);
      voices.filter(voice => voice.active).forEach(voice => {
        voice.audio.volume = volume * HEADROOM * CUES[voice.cue].gain * (ducked ? .28 : 1);
      });
      if (ambience) ambience.volume = ambienceVolume();
      window.MahjongMusic?.syncPreferences();
    },
    setAmbience(value) {
      ambienceWanted = Boolean(value);
      syncAmbience();
    },
    stopAll,
    getState() {
      return { enabled, volume, ducked, active: voices.filter(voice => voice.active).length,
        ambience: Boolean(ambience && !ambience.paused),
        lastPlayed, failedCues: Array.from(failedCues).sort() };
    }
  });
  document.addEventListener('visibilitychange', () => { if (hidden()) stopAll(); syncAmbience(); });
  window.addEventListener('pagehide', () => { stopAll(); if (ambience) try { ambience.pause(); } catch (_) { /* Unavailable media. */ } });
})();
