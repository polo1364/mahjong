/* Local ElevenLabs Taiwanese Mandarin clips. One speaker at a time, at most two pending cues. */
(() => {
  'use strict';
  const cues = new Set([
    ...['w', 't', 'b'].flatMap(suit => Array.from({ length: 9 }, (_, i) => `tile-${suit}${i + 1}`)),
    ...['fe', 'fs', 'fw', 'fn', 'dc', 'df', 'db'].map(key => `tile-${key}`),
    ...Array.from({ length: 8 }, (_, i) => `tile-h${i + 1}`),
    'chow', 'pong', 'kong', 'concealed-kong', 'win', 'self-draw', 'flower', 'ready', 'draw-game',
    'dealer-east', 'dealer-south', 'dealer-west', 'dealer-north', 'dealer-repeat',
    ...['e', 's', 'w', 'n'].flatMap(round => ['e', 's', 'w', 'n'].map(seat => `round-${round}${seat}`))
  ]);
  const priority = cue => cue === 'win' || cue === 'self-draw' ? 3 : cue.startsWith('tile-') ? 0 : 1;
  const chantCues = new Set(['chow', 'pong', 'kong', 'concealed-kong', 'win', 'self-draw']);
  const chantTurns = new Map();
  const mediaCue = (cue, options) => options?.cultivation === true && chantCues.has(cue)
    ? `chant-${cue}` : cue === 'flower' && /^H[1-8]$/.test(options?.tileKey)
      ? `tile-${options.tileKey.toLowerCase()}` : cue;
  const clock = () => window.performance ? window.performance.now() : Date.now();
  const failedCues = new Set();
  let audio = null;
  let enabled = false;
  let volume = .65;
  let active = null;
  let activeHeroId = null;
  let pending = [];
  let token = 0;
  let lastPlayed = null;
  let lastPlayedHeroId = null;

  const available = () => enabled && volume > 0 && !document.hidden;
  const duck = value => window.MahjongAudio?.setDucked(value);
  function state() {
    return { enabled, volume, active, activeHeroId, pending: pending.map(item => item.cue), lastPlayed, lastPlayedHeroId,
      failedCues: Array.from(failedCues).sort() };
  }
  function notify(type, cue) {
    if (typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent('mahjong-voice-status', { detail: { type, cue } }));
    }
  }
  function stopCurrent() {
    token++;
    active = null;
    activeHeroId = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try { audio.pause(); } catch (_) { /* Media is already unavailable. */ }
      try { audio.currentTime = 0; } catch (_) { /* Metadata may not exist yet. */ }
    }
    duck(false);
  }
  function stopAll() {
    pending = [];
    stopCurrent();
  }
  function next() {
    if (!available()) { stopAll(); return; }
    const time = clock();
    pending = pending.filter(item => time - item.at <= (priority(item.cue) ? 3000 : 1200));
    const item = pending.shift();
    if (item) start(item.cue, item.media, item.heroId);
  }
  function start(cue, media = cue, heroId = null) {
    const current = ++token;
    active = cue;
    activeHeroId = heroId;
    const valid = () => token === current && active === cue;
    const fail = () => {
      if (!valid()) return;
      failedCues.add(cue);
      stopCurrent();
      notify('error', cue);
      next();
    };
    try {
      if (!audio) { audio = new window.Audio(); audio.preload = 'auto'; }
      audio.onended = () => {
        if (!valid()) return;
        stopCurrent();
        next();
      };
      audio.onerror = fail;
      let folder = media.startsWith('tile-') ? 'voice-crystal-v1' : 'voice';
      if (media === `chant-${cue}` && chantCues.has(cue)) {
        // Rotate only when playback starts; rejected/expired calls consume no variant.
        // Presentation counters never touch the seeded game or combat randomness.
        const rotationKey = heroId ? `${heroId}:${cue}` : cue;
        const turn = chantTurns.get(rotationKey) || 0;
        chantTurns.set(rotationKey, (turn + 1) % 4);
        media = `${cue}-${turn + 1}`;
        folder = 'voice-cultivation-v1';
      }
      if (heroId) folder = `voice-heroes-v1/${heroId}`;
      audio.src = `assets/audio/${folder}/${media}.mp3${!heroId && media === 'flower' ? '?v=20261020-clear-flower' : ''}`;
      audio.volume = volume * .9;
      duck(true);
      const started = () => {
        if (!valid() || !available()) {
          if (!active || !available()) try { audio.pause(); } catch (_) { /* Already stopped. */ }
          return;
        }
        lastPlayed = cue;
        lastPlayedHeroId = heroId;
        failedCues.delete(cue);
        notify('started', cue);
      };
      const result = audio.play();
      if (result && typeof result.then === 'function') Promise.resolve(result).then(started, fail);
      else started();
      return true;
    } catch (_) { fail(); return false; }
  }
  function play(cue, options) {
    if (!available() || !cues.has(cue)) return false;
    const media = mediaCue(cue, options);
    // Capture the actor before queuing; never read the current turn when playback starts.
    const heroId = options?.cultivation === true &&
      (media.startsWith('tile-') || media.startsWith('chant-') || ['ready', 'flower'].includes(media))
      ? window.MahjongHeroVoices?.get(options.heroId)?.id || null : null;
    const sameActor = active === cue && activeHeroId === heroId;
    if (priority(cue) === 3) {
      if (sameActor) return false;
      stopAll();
      return start(cue, media, heroId);
    }
    if (!active) return start(cue, media, heroId);
    if (priority(active) === 3 || sameActor || pending.some(item => item.cue === cue && item.heroId === heroId)) return false;
    if (priority(cue) > priority(active)) {
      pending = [];
      stopCurrent();
      return start(cue, media, heroId);
    }
    // Keep actions intact; a following discard waits instead of cutting speech.
    // Old tile names are expendable so fast AI turns never build a long backlog.
    pending = pending.filter(item => !item.cue.startsWith('tile-'));
    if (pending.length === 2) {
      if (priority(cue) === 0) return false;
      pending.shift();
    }
    pending.push({ cue, media, heroId, at: clock() });
    return true;
  }
  window.MahjongVoice = Object.freeze({
    play, stopAll, getState: state,
    setEnabled(value) { enabled = Boolean(value); if (!enabled) stopAll(); },
    setVolume(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      volume = Math.max(0, Math.min(1, value));
      if (audio) audio.volume = volume * .9;
      if (!volume) stopAll();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
  window.addEventListener('pagehide', stopAll);
})();
