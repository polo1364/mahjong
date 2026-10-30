/* Local ElevenLabs clips. One speaker; two ordinary pending cues or one bounded finisher sequence. */
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
  const priority = cue => cue === 'win' || cue === 'self-draw' || cue.startsWith('skill:finisher:') || ['skill:call:win', 'skill:call:self-draw', 'skill:call:rob-kong'].includes(cue) ? 3 : cue.startsWith('tile-') ? 0 : 1;
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
  let token = 0, startTimer = null;
  let lastPlayed = null;
  let lastPlayedHeroId = null;
  let activeSkillId = null;
  const seenSkillEvents = new Set();

  const available = () => enabled && volume > 0 && !document.hidden;
  const duck = value => window.MahjongAudio?.setDucked(value);
  function state() {
    return { enabled, volume, active, activeHeroId, activeSkillId, pending: pending.map(item => item.cue), lastPlayed, lastPlayedHeroId,
      failedCues: Array.from(failedCues).sort() };
  }
  function notify(type, cue) {
    if (typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new window.CustomEvent('mahjong-voice-status', { detail: { type, cue } }));
    }
  }
  function stopCurrent() {
    window.clearTimeout?.(startTimer);
    token++;
    active = null;
    activeHeroId = null;
    activeSkillId = null;
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
    pending = pending.filter(item => item.expiresAt !== undefined ? time <= item.expiresAt : time - item.at <= (priority(item.cue) ? 3000 : 1200));
    const item = pending.shift();
    if (item) start(item.cue, item.media, item.heroId, item.skill);
  }
  function start(cue, media = cue, heroId = null, skill = null) {
    const current = ++token;
    const deadline = clock() + (priority(cue) ? 1200 : 700);
    active = cue;
    activeHeroId = heroId;
    activeSkillId = skill?.id || null;
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
      audio.src = skill ? skill.file : `assets/audio/${folder}/${media}.mp3${!heroId && media === 'flower' ? '?v=20261020-clear-flower' : ''}`;
      audio.volume = volume * .9;
      duck(true);
      const expire = () => { if (!valid()) return; stopCurrent(); notify('expired', cue); next(); };
      startTimer = window.setTimeout?.(expire, Math.max(0, deadline - clock()));
      const started = () => {
        if (!valid() || !available()) {
          if (!active || !available()) try { audio.pause(); } catch (_) { /* Already stopped. */ }
          return;
        }
        window.clearTimeout?.(startTimer);
        if (clock() > deadline) { expire(); return; }
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
  function skillItem(line, expiresAt) {
    return { cue: 'skill:' + line.id, media: line.id, heroId: line.heroId, skill: line, at: clock(), ...(expiresAt !== undefined ? { expiresAt } : {}) };
  }
  function enqueueSkill(line) {
    if (!available() || !line?.file) return false;
    const item = skillItem(line);
    if (priority(item.cue) === 3) {
      stopAll();
      return start(item.cue, item.media, item.heroId, line);
    }
    if (priority(active || '') === 3) return false;
    if (!active) return start(item.cue, item.media, item.heroId, line);
    if (priority(active) === 0) {
      pending = [];
      stopCurrent();
      return start(item.cue, item.media, item.heroId, line);
    }
    pending = pending.filter(queued => !queued.cue.startsWith('tile-'));
    if (pending.length === 2) pending.shift();
    pending.push(item);
    return true;
  }
  function playSkill(skillId, options) {
    const line = window.MahjongHeroSkillVoices?.get(options?.heroId, skillId, { secret: options?.secret === true });
    return enqueueSkill(line);
  }
  function consumeSkills(effects, before) {
    if (!Array.isArray(effects) || !Number.isInteger(before?.seq) || before.ended) return 0;
    const entries = [], occurrences = new Map();
    for (const effect of effects) {
      // Saved logs and already-applied effects are never new casts. A normal
      // committed action increments the combat sequence exactly once.
      if (effect?.seq !== before.seq + 1) continue;
      const line = window.MahjongHeroSkillVoices?.onEffect(effect, before);
      if (!line) continue;
      const event = [before.progression?.journeyId || before.economy?.journeyId || before.rng,
        before.handNumber, effect.seq, effect.pid, line.id].join(':');
      const occurrence = occurrences.get(event) || 0;
      occurrences.set(event, occurrence + 1);
      const key = event + ':' + occurrence;
      if (seenSkillEvents.has(key)) continue;
      seenSkillEvents.add(key);
      if (seenSkillEvents.size > 512) seenSkillEvents.delete(seenSkillEvents.values().next().value);
      // Mark muted/unavailable events consumed too, so enabling speech later
      // cannot replay old actions. Missing files are never requested.
      if (line.file) entries.push(line);
    }
    if (!available() || !entries.length) return 0;
    const finishers = entries.filter(line => line.action === 'finish').slice(0, 38);
    if (finishers.length) {
      // One committed finisher owns the speaker until its actual parts end or
      // stopAll cancels it. Do not treat each part as a new winning interruption.
      const expiresAt = clock() + finishers.reduce((sum, line) => sum + line.durationSeconds * 1000 + 1200, 1000);
      stopAll();
      const sequence = finishers.map(line => skillItem(line, expiresAt));
      const first = sequence.shift();
      pending = sequence;
      start(first.cue, first.media, first.heroId, first.skill);
      return finishers.length;
    }
    return entries.reduce((count, line) => count + Number(enqueueSkill(line)), 0);
  }
  window.MahjongVoice = Object.freeze({
    play, playSkill, consumeSkills, stopAll, getState: state,
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
