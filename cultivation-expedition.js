/* Pure expedition rules. No storage or combat RNG access. */
(function (root) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  const elements = ['metal', 'wood', 'water', 'fire', 'earth'];
  const names = ['鎏金礦域', '青木幽林', '滄瀾寒潭', '赤焰荒原', '厚土古陵'];
  const bosses = ['mountaincleaver-lion', 'miasma-queen', 'abyss-whale', 'boneflame-phoenix', 'earthvein-hou'];
  const regions = elements.map((id, i) => Object.freeze({ id, name: names[i], bossId: bosses[i] }));
  const calibration = Object.freeze({ a: 198.52941176470588, b: 317.64705882352945 });
  const scoring = Object.freeze({ combat: 50, heal: 1.5, shield: 1.5 });
  // Battle index measures the party's absolute output against a fixed yardstick (mean small-monster life),
  // so a hand spent on a miniboss does not read as a weak party and lower the next monsters' strength.
  const referenceHp = 1700;
  const HANDS_PER_REGION = 16;
  const EFFECT_KINDS = ['damage', 'taken', 'heal', 'shield', 'aggro', 'basic', 'active'];
  const mean = a => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);

  function region(completed = 0) { return regions[Math.floor(completed / HANDS_PER_REGION) % 5]; }
  function progress(e) {
    return { ...region(e.completed), completed: e.completed, local: e.completed % HANDS_PER_REGION,
      total: e.completed + 1, cycle: Math.floor(e.completed / (HANDS_PER_REGION * 5)) + 1 };
  }
  function create(journeyId, seed = 1, startHand = 1) {
    return { version: 1, journeyId, startHand, completed: 0, recentScores: [], recentIndices: [],
      rng: (seed >>> 0) || 1, bags: {}, pendingEvent: null, pendingEffect: null, activeEffect: null,
      bossChoice: null, settled: [], receipts: [], lastResult: null };
  }

  // Permanent per-region qualifications: the best three-hand average, and what it unlocks.
  function createProfile() {
    return { version: 1, regions: Object.fromEntries(elements.map(id => [id, { highest: 0, rare: false, advanced: false }])) };
  }
  function validateProfile(p) {
    if (!p || p.version !== 1 || !p.regions) throw Error('Invalid expedition profile');
    for (const id of elements) {
      const r = p.regions[id];
      if (!r || !Number.isFinite(r.highest) || r.highest < 0 || r.highest > 100 ||
          typeof r.rare !== 'boolean' || typeof r.advanced !== 'boolean' ||
          r.rare !== (r.highest >= 60) || r.advanced !== (r.highest >= 75)) throw Error('Invalid expedition qualification');
    }
    return true;
  }
  function mergeProfile(p, id, value) {
    validateProfile(p);
    if (!elements.includes(id) || !Number.isFinite(value) || value < 0 || value > 100) throw Error('Invalid expedition score');
    const n = clone(p), r = n.regions[id];
    r.highest = Math.max(r.highest, value);
    r.rare = r.highest >= 60;
    r.advanced = r.highest >= 75;
    return n;
  }

  function difficulty(indices, thresholds = calibration) {
    const recent = indices.length ? mean(indices) : thresholds.a;
    const ratio = Math.max(0, Math.min(1, (recent - thresholds.a) / (thresholds.b - thresholds.a)));
    return { life: 1 + 0.3 * ratio, damage: 1 + 0.15 * ratio };
  }
  // 歷練評分: combat share of the party (capped 70), 5 each for a meld, declaring ready and not dealing in, 15 for the win.
  function score(metrics, actions = [], winner = null, discarder = null) {
    const contributions = metrics.map(m => m.damage + scoring.heal * m.heal + scoring.shield * m.shield);
    const average = mean(contributions);
    return contributions.map((contribution, pid) => {
      const combat = average ? Math.min(70, Math.round(scoring.combat * contribution / average)) : 0;
      const a = actions[pid] || {};
      const operation = (a.meld ? 5 : 0) + (a.listen ? 5 : 0) + (discarder !== pid ? 5 : 0);
      const winning = winner === pid ? 15 : 0;
      return { pid, contribution, combat, operation, winning, total: combat + operation + winning };
    });
  }
  function random(e) {
    let x = e.rng >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    e.rng = x >>> 0 || 1;
    return e.rng / 4294967296;
  }

  // Event table: [name, choice 1, choice 2]; each choice is {cost, reward, effect for the next normal hand}.
  const c = (cost, reward, effect = null) => ({ cost, reward, effect });
  const gold = (n, reward, effect) => c({ gold: n }, reward, effect);
  const effects = (kind, value) => ({ [kind]: value });
  const rows = [
    ['廢礦金脈', gold(15, { metal: 2 }), c({}, { sand: 2 }, effects('taken', 0.05))],
    ['斷兵遺庫', gold(15, { 'weapon-stone': 1 }), gold(15, { edge: 1 })],
    ['鑄坊殘爐', c({ metal: 2 }, { sand: 2 }), c({ sand: 2 }, { metal: 2 })],
    ['封印兵匣', gold(40, { luck: 1 }), c({}, { gold: 45, sand: 2 }, effects('taken', 0.08))],
    ['百草坡', gold(15, { wood: 2 }), c({}, { heal: 1 }, effects('damage', -0.05))],
    ['迷霧花圃', gold(15, { cleanse: 1 }), c({ water: 1 }, { wood: 2 })],
    ['古樹療泉', gold(20, {}, effects('heal', 0.1)), gold(20, {}, effects('shield', 0.1))],
    ['青帝遺圃', gold(30, { preserve: 1 }), c({}, { wood: 3, sand: 2 }, effects('damage', -0.08))],
    ['古井尋珠', gold(15, { water: 2 }), c({}, { sand: 2 }, effects('shield', -0.05))],
    ['渡口行商', gold(15, { stealth: 1 }), gold(20, { guard: 1 })],
    ['寒潭洗髓', gold(20, {}, effects('aggro', -0.05)), gold(20, {}, effects('heal', 0.1))],
    ['玄冰寶庫', gold(30, { 'armor-stone': 2 }), c({}, { water: 3, gold: 30 }, effects('taken', 0.08))],
    ['熔火採集', gold(15, { fire: 2 }), c({}, { sand: 2 }, effects('taken', 0.05))],
    ['丹爐餘火', c({ fire: 2 }, { heal: 1 }), c({ fire: 2 }, { edge: 1 })],
    ['試煉碑', gold(20, {}, effects('basic', 0.05)), gold(20, {}, effects('active', 0.05))],
    ['赤陽密藏', gold(40, { luck: 1 }), c({}, { fire: 3, sand: 2 }, effects('shield', -0.08))],
    ['斷崖石窟', gold(15, { earth: 2 }), c({}, { sand: 2 }, effects('damage', -0.05))],
    ['守路石靈', c({ earth: 2 }, { barrier: 1 }), c({ earth: 2 }, { guard: 1 })],
    ['地脈祭壇', gold(20, {}, effects('shield', 0.1)), gold(20, {}, effects('taken', -0.05))],
    ['后土遺藏', gold(30, { 'accessory-stone': 2 }), c({}, { earth: 3, gold: 30 }, effects('aggro', 0.08))]
  ];
  // Four per region in element order; the fourth of each region is the rare one.
  const events = rows.map((r, i) => ({
    id: elements[Math.floor(i / 4)] + '-' + (i % 4 + 1), regionId: elements[Math.floor(i / 4)], name: r[0],
    rare: i % 4 === 3, choices: r.slice(1).map((x, j) => ({ ...x, id: String(j + 1) }))
  }));

  // Normal events are drawn without replacement per region and cycle, never repeating the previous event first.
  function drawEvent(e, id, rare) {
    let selected;
    if (rare) selected = events.find(x => x.regionId === id && x.rare);
    else {
      const pool = events.filter(x => x.regionId === id && !x.rare);
      const key = id + ':' + Math.floor((e.completed - 1) / (HANDS_PER_REGION * 5));
      let bag = e.bags[key] || [];
      if (!bag.length) {
        bag = pool.map(x => x.id);
        for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(random(e) * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
        if (bag[0] === e.lastEventId && bag.length > 1) [bag[0], bag[1]] = [bag[1], bag[0]];
      }
      const picked = bag.shift();
      selected = events.find(x => x.id === picked);
      e.bags[key] = bag;
    }
    e.lastEventId = selected.id;
    return { id: e.journeyId + ':' + e.completed + ':' + selected.id, eventId: selected.id, completed: e.completed };
  }

  function settle(input, info, profile = createProfile()) {
    const e = clone(input);
    if (info.handNumber < e.startHand || info.trial || e.settled.includes(info.handNumber))
      return { expedition: e, profile: clone(profile), result: e.lastResult };
    const id = region(e.completed).id;
    const scores = score(info.metrics, info.actions, info.winner, info.discarder);
    const index = info.monsterDamage / referenceHp * 100;
    e.recentScores = [...e.recentScores, scores[0].total].slice(-3);
    e.recentIndices = [...e.recentIndices, index].slice(-3);
    const recent = mean(e.recentScores);
    // Permanent unlocks need a full three-hand average, not one lucky opening hand.
    const p = e.recentScores.length >= 3 ? mergeProfile(profile, id, recent) : clone(profile);
    e.completed++;
    e.settled.push(info.handNumber);
    e.activeEffect = null;
    e.lastResult = { scores, recentScore: recent, battleIndex: index, recentIndex: mean(e.recentIndices), regionId: id, completed: e.completed };
    if (e.completed % 4 === 0 && !e.pendingEvent)
      e.pendingEvent = drawEvent(e, id, e.completed % HANDS_PER_REGION === 0 && p.regions[id].rare);
    return { expedition: e, profile: p, result: e.lastResult };
  }
  // A trial neither applies nor consumes the pending event effect.
  function activateHand(input, trial = false) {
    const e = clone(input);
    if (!trial) { e.activeEffect = e.pendingEffect; e.pendingEffect = null; }
    return e;
  }
  const walletKey = id => id === 'gold' || id === 'sand';
  function chooseEvent(input, choiceId) {
    const s = clone(input), e = s.expedition, pending = e?.pendingEvent;
    if (!pending) throw Error('No pending expedition event');
    if (e.receipts.includes(pending.id)) throw Error('Expedition event already settled');
    const event = events.find(x => x.id === pending.eventId), choice = event?.choices.find(x => x.id === choiceId);
    if (choiceId !== 'leave' && !choice) throw Error('Unknown expedition choice');
    const wallet = s.players[0].economy, counts = wallet.items?.counts;
    if (!counts) throw Error('Event requires item inventory');
    if (choice) {
      for (const [id, n] of Object.entries(choice.cost))
        if ((walletKey(id) ? wallet[id] : counts[id] || 0) < n) throw Error('insufficient-funds');
      for (const [id, n] of Object.entries(choice.cost)) { if (walletKey(id)) wallet[id] -= n; else counts[id] -= n; }
      for (const [id, n] of Object.entries(choice.reward)) { if (walletKey(id)) wallet[id] += n; else counts[id] = (counts[id] || 0) + n; }
      if (choice.effect) e.pendingEffect = { eventId: event.id, ...clone(choice.effect) };
    }
    e.receipts.push(pending.id);
    e.pendingEvent = null;
    return s;
  }

  // Miniboss choices: unused original minibosses, the local regional boss, and its advanced form once unlocked.
  function bossOptions(state, profile = createProfile(), catalog = []) {
    validateProfile(profile);
    if (!state.expedition || state.trial || state.journey.nextTier !== 'miniboss' || state.journey.pendingMinibossId) return [];
    const r = region(state.expedition.completed), used = state.expedition.bossUsed || [];
    const ids = catalog.filter(m => m.tier === 'miniboss' && !m.region && !used.includes(m.id)).map(m => ({ speciesId: m.id, advanced: false }));
    if (!used.includes(r.bossId)) {
      ids.push({ speciesId: r.bossId, advanced: false });
      if (profile.regions[r.id].advanced) ids.push({ speciesId: r.bossId, advanced: true });
    }
    return ids;
  }
  function selectBoss(input, choice, profile, catalog) {
    const s = clone(input);
    if (!bossOptions(s, profile, catalog).some(x => x.speciesId === choice.speciesId && x.advanced === !!choice.advanced))
      throw Error('Invalid expedition boss choice');
    s.expedition.bossChoice = { speciesId: choice.speciesId, advanced: !!choice.advanced };
    return s;
  }

  const validScale = s => Number.isFinite(s.life) && s.life >= 1 && s.life <= 1.3 && Number.isFinite(s.damage) && s.damage >= 1 && s.damage <= 1.15;
  function validate(e) {
    if (!e || e.version !== 1 || typeof e.journeyId !== 'string' || !Number.isSafeInteger(e.completed) || e.completed < 0 ||
        !Number.isSafeInteger(e.rng) || e.rng < 1 || !Array.isArray(e.settled) || !Array.isArray(e.receipts)) throw Error('Invalid expedition');
    for (const [key, max] of [['recentScores', 100], ['recentIndices', 1e12]])
      if (!Array.isArray(e[key]) || e[key].length > 3 || e[key].some(x => !Number.isFinite(x) || x < 0 || x > max))
        throw Error('Invalid expedition recent history');
    if (e.pendingEvent && !events.some(x => x.id === e.pendingEvent.eventId)) throw Error('Invalid expedition event');
    for (const effect of [e.pendingEffect, e.activeEffect])
      if (effect && Object.entries(effect).some(([k, v]) => k !== 'eventId' && (!EFFECT_KINDS.includes(k) || !Number.isFinite(v) || v < -0.1 || v > 0.1)))
        throw Error('Invalid expedition effect');
    if (e.metrics && (!Array.isArray(e.metrics) || e.metrics.length !== 4 ||
        e.metrics.some(m => ['damage', 'heal', 'shield'].some(k => !Number.isFinite(m[k]) || m[k] < 0 || m[k] > 1e12))))
      throw Error('Invalid expedition metrics');
    if (e.firstMonsterHp !== undefined && (!Number.isFinite(e.firstMonsterHp) || e.firstMonsterHp < 0 || e.firstMonsterHp > 1e8))
      throw Error('Invalid expedition monster base');
    for (const scale of [e.snapshot, ...Object.values(e.retryMonsters || {}).map(m => m.scale)])
      if (scale && !validScale(scale)) throw Error('Invalid expedition scale');
    return true;
  }

  const api = Object.freeze({ regions, events, calibration, scoring, referenceHp, mean, region, progress, create, createProfile,
    validateProfile, mergeProfile, difficulty, score, settle, activateHand, chooseEvent, bossOptions, selectBoss, validate });
  root.MahjongCultivationExpedition = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
