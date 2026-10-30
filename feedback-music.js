(() => {
  'use strict';

  const PLAYLISTS = Object.freeze({
    normal: ['music/一般模式 ①〈茶香摸八圈〉.mp3', 'music/一般模式 ②〈月下聽牌〉.mp3'],
    cultivation: ['music/修仙模式 ①〈雲海問道〉.mp3', 'music/修仙模式 ②〈御劍破陣〉.mp3']
  });
  const failedTracks = new Set();
  let mode = null;
  let index = 0;
  let enabled = true;
  let activated = false;
  let suspended = false;
  let blocked = false;
  let current = null;

  function preferences() {
    return window.MahjongAudio?.getState() || { enabled: false, volume: 0, ducked: false };
  }

  function wanted() {
    const master = preferences();
    return activated && enabled && mode !== null && master.enabled && Number.isFinite(master.volume)
      && master.volume > 0 && !document.hidden && !suspended;
  }

  function pause(record) {
    if (!record) return;
    record.token++;
    record.pending = false;
    record.started = false;
    try { record.audio.pause(); } catch (_) { /* Unavailable media. */ }
  }

  function release() {
    if (!current) return;
    const record = current;
    current = null;
    pause(record);
    record.audio.onended = null;
    record.audio.onerror = null;
    // Stop fetching an old track as well as stopping its playback.
    try { record.audio.removeAttribute?.('src'); record.audio.load?.(); } catch (_) { /* Detached media. */ }
  }

  function next() {
    release();
    index = (index + 1) % PLAYLISTS[mode].length;
    sync();
  }

  function fail(record) {
    if (record !== current) return;
    failedTracks.add(record.track);
    next();
  }

  function sync() {
    if (!wanted()) { pause(current); return; }
    const playlist = PLAYLISTS[mode];
    // A missing pair stays silent instead of spinning through failed requests.
    let attempts = 0;
    while (attempts < playlist.length && failedTracks.has(playlist[index])) {
      index = (index + 1) % playlist.length;
      attempts++;
    }
    if (attempts === playlist.length) { release(); return; }
    if (blocked) return;

    if (!current) {
      try {
        const audio = new window.Audio();
        const record = { audio, track: playlist[index], token: 0, pending: false, started: false };
        current = record;
        audio.preload = 'none';
        audio.loop = false;
        audio.onended = () => { if (record === current && record.started && wanted()) next(); };
        audio.onerror = () => fail(record);
        audio.src = record.track;
      } catch (_) {
        if (current) fail(current);
        else { failedTracks.add(playlist[index]); index = (index + 1) % playlist.length; sync(); }
        return;
      }
    }
    const record = current;
    const master = preferences();
    record.audio.volume = Math.max(0, Math.min(1, master.volume)) * .28 * (master.ducked ? .25 : 1);
    if (record.pending || !record.audio.paused) return;

    const token = ++record.token;
    record.pending = true;
    const started = () => {
      // A resolved request may belong to a disposed track or an earlier mute.
      if (record !== current || !wanted()) {
        try { record.audio.pause(); } catch (_) { /* Already unavailable. */ }
        return;
      }
      if (record.token !== token) {
        if (!record.pending && !record.started) record.audio.pause();
        return;
      }
      record.pending = false;
      record.started = true;
    };
    const rejected = error => {
      if (record !== current || record.token !== token) return;
      if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
        blocked = true;
        pause(record);
      } else fail(record);
    };
    try {
      const result = record.audio.play();
      if (result && typeof result.then === 'function') Promise.resolve(result).then(started, rejected);
      else started();
    } catch (error) { rejected(error); }
  }

  window.MahjongMusic = Object.freeze({
    setMode(value) {
      const nextMode = value === 'normal' || value === 'cultivation' ? value : null;
      if (nextMode === mode) return;
      release();
      mode = nextMode;
      index = 0;
      blocked = false;
      sync();
    },
    setEnabled(value) { enabled = Boolean(value); sync(); },
    syncPreferences: sync,
    getState() {
      return { mode, enabled, track: current?.track || null,
        playing: Boolean(current?.started && !current.audio.paused && wanted()),
        blocked, failedTracks: Array.from(failedTracks) };
    }
  });

  const interact = event => {
    if (!event.isTrusted) return;
    activated = true;
    blocked = false;
    sync();
  };
  for (const name of ['pointerdown', 'keydown', 'click']) document.addEventListener(name, interact, { capture: true });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => { suspended = true; pause(current); });
  window.addEventListener('pageshow', () => { suspended = false; sync(); });
})();
