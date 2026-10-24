/* Deterministic cultivation combat. Mahjong remains the authority for legal actions. */
(function (root) {
  "use strict";
  const Skills =
    typeof module !== "undefined" && module.exports
      ? require("./cultivation-skills.js")
      : root.MahjongCultivationSkills;
  const Finishers = typeof module !== "undefined" && module.exports
    ? require("./cultivation-finishers.js") : root.MahjongCultivationFinishers;
  const Heroes = typeof module !== "undefined" && module.exports
    ? require("./cultivation-heroes.js") : root.MahjongCultivationHeroes;
  const Monsters = typeof module !== "undefined" && module.exports
    ? require("./cultivation-monsters.js") : root.MahjongCultivationMonsters;
  const MonsterSkills = typeof module !== "undefined" && module.exports
    ? require("./cultivation-monster-skills.js") : root.MahjongMonsterSkills;
  const Equipment = typeof module !== "undefined" && module.exports ? require("./cultivation-equipment.js") : root.MahjongCultivationEquipment;
  const Economy = typeof module !== "undefined" && module.exports ? require("./cultivation-economy.js") : root.MahjongCultivationEconomy;
  const Items = typeof module !== 'undefined' && module.exports ? require('./cultivation-items.js') : root.MahjongCultivationItems;
  const ELEMENTS = ["metal", "wood", "water", "fire", "earth"];
  const BEASTS = {
    metal: "金魄白虎",
    wood: "森羅藤妖",
    water: "玄淵蛟龍",
    fire: "焚天獅獸",
    earth: "鎮山岩魁",
  };
  const COUNTERS = {
    metal: "wood",
    wood: "earth",
    earth: "water",
    water: "fire",
    fire: "metal",
  };
  const MAX_DAMAGE = 1000000000;
  // First monster HP; each later monster has ×1.15 more. Raised from 1,500 (2026-10-22): four players deal ~2,900 per hand.
  // Battle item strengths (balance 2026-10-24): edge = share of base damage with a cap; stealth/guard = cuts.
  const ITEM_EDGE_RATE = 0.2, ITEM_EDGE_CAP = 50, ITEM_STEALTH_CUT = 0.3, ITEM_GUARD_CUT = 0.4;
  // Share of one counter strike released when an unused counter stance expires (V2 only).
  const COUNTER_RELEASE = 0.8;
  const MONSTER_BASE_HP = 3000;
  const BUFFS = new Set([
    "absorbedToNext",
    "onHitShield",
    "onHitHeal",
    "nextDamage",
    "nextFlatDamage",
    "nextLifesteal",
    "nextPenetration",
    "nextFollowup",
    "nextMark",
    "lifestealOverflow",
    "fragile",
    "guardCounter",
    "damageUp",
    "rampDamage",
    "penetration",
    "hot",
    "reduceDamage",
    "guard",
    "counter",
    "shieldCounter",
    "shieldBreakDamage",
    "shieldBreakHeal",
    "shieldAbsorbCounter",
    "deathGuard",
    "statusGuard",
    "immuneAilment",
    "reduceDot",
    "aggroRate",
    "dotAggroRate",
    "noExtraAggro",
    "takenToShield",
    "takenToNext",
    "healToShield",
    "execute",
    "followup",
    "shieldEndDamage",
  ]);
  const LABELS = {
    nextDamage: "下一招增傷",
    nextLifesteal: "下一招吸血",
    nextPenetration: "下一招穿透",
    nextFollowup: "下一招追擊",
    damageUp: "傷害提升",
    rampDamage: "丹心蓄勢",
    penetration: "穿透",
    hot: "持續回復",
    reduceDamage: "減傷",
    guard: "格擋",
    counter: "反擊",
    shieldCounter: "護盾反擊",
    shieldBreakDamage: "破盾反擊",
    shieldBreakHeal: "破盾回復",
    shieldAbsorbCounter: "蓄盾反擊",
    deathGuard: "護命",
    statusGuard: "護身",
    immuneAilment: "淨體",
    reduceDot: "持傷減免",
    aggroRate: "隱息",
    dotAggroRate: "斂息",
    noExtraAggro: "免額外仇恨",
    takenToShield: "受傷化盾",
    takenToNext: "受傷蓄力",
    healToShield: "回復化盾",
    execute: "斬殺",
    followup: "追擊",
    shieldEndDamage: "劍匣",
    armorDown: "破甲",
    attackDown: "衰弱",
    vulnerable: "易傷",
    burn: "燃燒",
    flow: "滲流",
    poison: "木毒",
    fragile: "脆弱",
    attackUp: "狂暴",
    defenseUp: "硬甲",
  };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const integer = (value, fallback) =>
    Number.isFinite(value) ? Math.round(value) : fallback;
  const actor = (state, pid) => state.players[pid];
  // Damage variance: every hit (players, monsters, counters, DoT, finishers, equipment) is scaled by
  // a roll in [DAMAGE_ROLL_MIN, DAMAGE_ROLL_MAX] drawn from state.damageRng. Previews pin the roll.
  const DAMAGE_ROLL_MIN = 0.9, DAMAGE_ROLL_MAX = 1.1;
  let rollOverride = null;
  function damageRoll(state) {
    if (state.damageVariance !== 1) return 1;
    if (rollOverride !== null) return rollOverride;
    let x = state.damageRng >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.damageRng = x >>> 0 || 0x2545f491;
    return DAMAGE_ROLL_MIN + (DAMAGE_ROLL_MAX - DAMAGE_ROLL_MIN) * (state.damageRng / 4294967296);
  }
  function withDamageRoll(value, fn) {
    const before = rollOverride; rollOverride = value;
    try { return fn(); } finally { rollOverride = before; }
  }
  function random(state) {
    let x = state.rng >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    state.rng = x >>> 0;
    return state.rng / 4294967296;
  }
  function buff(player, kind) {
    return player.statuses.find(
      (s) =>
        s.kind === kind &&
        s.duration > 0 &&
        (s.charges === undefined || s.charges > 0),
    );
  }
  function remove(player, status) {
    const index = player.statuses.indexOf(status);
    if (index >= 0) player.statuses.splice(index, 1);
  }
  function used(player, status) {
    if (status && status.charges !== undefined) {
      status.charges--;
      if (status.charges <= 0) remove(player, status);
    }
  }
  function sumStatus(statuses, kind) {
    return statuses
      .filter((s) => s.kind === kind)
      .reduce((n, s) => n + (s.value || 0), 0);
  }
  function tileElement(key) {
    if (/^W[1-9]$/.test(key)) return "fire";
    if (/^T[1-9]$/.test(key)) return "water";
    if (/^B[1-9]$/.test(key)) return "metal";
    return (
      {
        FE: "wood",
        FS: "fire",
        FW: "metal",
        FN: "water",
        DC: "fire",
        DF: "wood",
        DB: "earth",
        H1: "wood",
        H2: "water",
        H3: "fire",
        H4: "water",
        H5: "wood",
        H6: "wood",
        H7: "wood",
        H8: "metal",
      }[key] || "earth"
    );
  }
  function elementMultiplier(source, targetElement) {
    return COUNTERS[source] === targetElement
      ? 1.25
      : COUNTERS[targetElement] === source
        ? 0.8
        : 1;
  }
  function target(state) {
    let selected = null;
    for (let pid = 0; pid < 4; pid++)
      if (
        actor(state, pid).hp > 0 &&
        (selected === null ||
          actor(state, pid).aggro > actor(state, selected).aggro)
      )
        selected = pid;
    return selected;
  }
  function ranking(state) {
    const rows = state.players
      .map((p, pid) => ({ pid, damage: p.damage, rank: 0 }))
      .sort((a, b) => b.damage - a.damage || a.pid - b.pid);
    rows.forEach((row, i) => {
      row.rank =
        i && rows[i - 1].damage === row.damage ? rows[i - 1].rank : i + 1;
    });
    return rows;
  }
  function emit(state, output, item) {
    const entry = Object.assign(
      { seq: state.seq, monsterId: state.monster.id },
      item,
    );
    output.push(entry);
    state.log.push(entry);
    if (state.log.length > 120) state.log.shift();
  }
  function heroFactor(state, player, kind) {
    if (state.version < 2) return 1;
    const stats = Heroes.get(player.heroId).stats;
    return kind === "taken" ? (200 - stats.defense) / 100 : stats[kind] / 100;
  }
  function passive(player, id) { return player.heroId === id; }
  function passiveState() {
    return { discards: 0, swordUses: 0, fireMonsterId: null, tideUses: 0,
      stored: 0, generated: 0, counterUses: 0, counterReady: true,
      lastMeld: null, changeUses: 0, flowerUses: 0 };
  }
  function storePassive(player, amount) {
    const ps = player.passiveState;
    const actual = Math.max(0, Math.min(amount, 30 - ps.stored, 60 - ps.generated));
    ps.stored += actual;
    ps.generated += actual;
  }
  function journeyState() {
    return { phase: "combat", cycle: 1, smallKills: 0, eliteKills: 0, minibossKills: 0,
      smallBag: [], eliteBag: [], minibossBag: [], pendingMinibossId: null,
      nextTier: "small", retrySpeciesId: null };
  }
  function drawSpecies(state, tier) {
    if (tier === "boss") return "five-phase-sovereign";
    const bag = state.journey[tier + "Bag"];
    if (!bag.length) {
      bag.push(...Monsters.all.filter(m => m.tier === tier).map(m => m.id));
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.shift();
  }
  function spawnJourney(state) {
    const j = state.journey;
    const id = j.retrySpeciesId || (j.nextTier === "miniboss" && j.pendingMinibossId) || drawSpecies(state, j.nextTier);
    j.retrySpeciesId = null;
    const species = Monsters.get(id);
    const index = state.monster ? state.monster.id + 1 : 1;
    state.monster = { id: index, index, speciesId: id, tier: species.tier,
      name: species.name, element: species.element, hp: species.hp, maxHp: species.hp,
      shield: species.shield, armor: species.armor, statuses: [], nextAttack: null,
      attacks: 0, heals: 0, shields: 0 };
    state.monster.nextAttack = telegraphJourney(state);
    delete state.postAttackControl;
    state.discardCount = 0;
    state.enemyDue = null;
    for (const p of state.players) {
      p.aggro = 0; p.damageTaken = 0;
      p.statuses = p.statuses.filter(s => !s.monsterId || s.monsterId === index);
    }
  }
  function telegraphJourney(state) {
    const m = state.monster, species = Monsters.get(m.speciesId), behavior = species.behavior;
    if (state.monsterSkillVersion === 1) {
      const ordinaryType = random(state) < 2 / 3 ? 'single' : 'all';
      const skill = MonsterSkills.select(species, m.attacks + 1, m.element);
      const attack = {type:skill?.type || ordinaryType, charged:skill?.charged || false,
        damage:skill?.damage ?? species[ordinaryType], ailment:null, cancelled:false,
        controlUsed:false, sealAilment:false, skillId:skill?.id || null,
        monsterId:m.id, actionNumber:m.attacks+1, sealed:false};
      const pending=m.statuses.find(s=>s.kind==='sealPending');
      if(attack.charged&&pending){m.statuses.splice(m.statuses.indexOf(pending),1);sealCharge(state,attack);}
      return attack;
    }
    const third = (m.attacks + 1) % 3 === 0;
    let type = random(state) < 2 / 3 ? "single" : "all";
    let charged = false;
    if (third && behavior === "chargeSingle") { type = "single"; charged = true; }
    if (third && ["chargeAll", "sword", "sovereign"].includes(behavior)) { type = "all"; charged = true; }
    if (third && ["shieldDown", "queen"].includes(behavior)) type = "all";
    const base = species[type] * (behavior === "firstStrike" && m.attacks === 0 ? 1.1 : 1);
    const attack = { type, charged, damage: Math.round(base * (charged ? 1.25 : 1)),
      ailment: null, cancelled: false, controlUsed: false, sealAilment: false };
    const pending = m.statuses.find(s => s.kind === "sealPending");
    if (charged && pending) { m.statuses.splice(m.statuses.indexOf(pending), 1); sealCharge(state, attack); }
    return attack;
  }
  function advanceJourney(state) {
    const j = state.journey, tier = state.monster.tier;
    j.retrySpeciesId = null;
    if (tier === "small") { j.smallKills++; j.nextTier = j.smallKills >= 3 ? "elite" : "small"; }
    if (tier === "elite") { j.eliteKills++; j.smallKills = 0; j.nextTier = j.eliteKills >= 2 ? "miniboss" : "small"; }
    if (tier === "miniboss") {
      j.minibossKills++; j.smallKills = j.eliteKills = 0; j.pendingMinibossId = null;
      j.nextTier = j.minibossKills >= 3 ? "boss" : "small";
    }
    if (tier === "boss") {
      j.cycle++; j.smallKills = j.eliteKills = j.minibossKills = 0;
      j.minibossBag = []; j.pendingMinibossId = null; j.nextTier = "small";
    }
  }
  function settleJourney(state) {
    const j = state.journey;
    j.phase = "result";
    if (state.monster.hp === 0) return;
    const m = state.monster;
    if (["small", "elite"].includes(m.tier)) j.retrySpeciesId = m.speciesId;
    if (m.tier === "miniboss") {
      j.smallKills = j.eliteKills = 0; j.pendingMinibossId = m.speciesId;
      j.nextTier = "small";
    }
    if (m.tier === "boss") {
      j.smallKills = j.eliteKills = j.minibossKills = 0; j.pendingMinibossId = null;
      j.minibossBag = []; j.nextTier = "elite";
    }
  }
  function prepare(input, options = {}) {
    validate(input);
    if (input.version < 2 || !input.ended) throw Error("Preparation requires ended V2 hand");
    const state = copy(input);
    if (state.version === 2 && options.equipment) { Economy.init(state, state.rng); state.version = 3; }
    state.journey.phase = "preparation";
    if (state.version === 3) Economy.prepare(state);
    validate(state); return state;
  }
  function journeyPreview(state) {
    validate(state);
    if (state.version < 2) return { message: "舊版旅程", nextMonsterId: null, nextMonsterName: "舊版五行異獸", progress: null };
    const simulation = copy(state), j = simulation.journey;
    const speciesId = j.retrySpeciesId || (j.nextTier === "miniboss" && j.pendingMinibossId) || drawSpecies(simulation, j.nextTier);
    const next = Monsters.get(speciesId);
    let message = j.retrySpeciesId ? "同一隻異獸下局回滿重戰" : "繼續征途";
    if (state.ended && state.monster.hp > 0 && state.monster.tier === "miniboss") message = "小王未完成，退回小怪；重新達標挑戰同一隻小王";
    if (state.ended && state.monster.hp > 0 && state.monster.tier === "boss") message = "BOSS未完成，計數歸零，下局從菁英重新出發";
    return { message, nextMonsterId: speciesId, nextMonsterName: next.name,
      progress: { cycle: j.cycle, smallKills: j.smallKills, eliteKills: j.eliteKills, minibossKills: j.minibossKills } };
  }
  function monsterAfterAttack(state, targets, output) {
    const m = state.monster, behavior = Monsters.get(m.speciesId).behavior;
    if (m.attacks % 3 !== 0) return;
    if (["heal60", "heal100", "queen"].includes(behavior) && m.heals < 2 && m.hp > 0 && m.hp < m.maxHp) {
      const amount = Math.min(m.maxHp - m.hp, behavior === "heal60" ? 60 : behavior === "heal100" ? 100 : 120);
      m.hp += amount; m.heals++;
      emit(state, output, { type: "enemyHeal", amount });
    }
    if (behavior === "shield60" && m.shields < 2) {
      m.shield = Math.min(10000, m.shield + 60); m.shields++;
      emit(state, output, { type: "enemyShield", amount: 60 });
    }
    const kind = behavior === "healDown" ? "healingDown" : behavior === "shieldDown" ? "shieldGainDown" : behavior === "burn" ? "burn" : null;
    if (!kind || m.nextAttack.sealAilment) return;
    for (const pid of targets) {
      const p = actor(state, pid);
      if (!p.hp) continue;
      const context = makeContext(state, pid, { element: m.element }, true);
      const immune = buff(p, "immuneAilment"), guard = buff(p, "statusGuard");
      if (immune) { used(p, immune); continue; }
      if (guard) { used(p, guard); if (guard.heal) heal(state, context, guard.heal, false, false, output); continue; }
      p.statuses = p.statuses.filter(s => s.kind !== kind);
      p.statuses.push({ kind, negative: true, duration: kind === "healingDown" ? 1 : 2,
        value: kind === "healingDown" ? 0.05 : kind === "shieldGainDown" ? 0.08 : 10 });
      emit(state, output, { type: "ailment", pid, kind });
    }
  }
  function validateJourney(state, fail, number, int) {
    if (!Heroes || !Monsters) fail("journey catalogs");
    const j = state.journey;
    if (!j || !["combat", "result", "preparation"].includes(j.phase) ||
        (state.ended ? j.phase === "combat" : j.phase !== "combat") ||
        !int(j.cycle, 1, 1000000) || !int(j.smallKills, 0, 3) ||
        !int(j.eliteKills, 0, 2) || !int(j.minibossKills, 0, 3) ||
        !["small", "elite", "miniboss", "boss"].includes(j.nextTier)) fail("journey progress");
    for (const tier of ["small", "elite", "miniboss"]) {
      const bag = j[tier + "Bag"];
      if (!Array.isArray(bag) || new Set(bag).size !== bag.length ||
          bag.some(id => Monsters.get(id)?.tier !== tier)) fail("journey bag");
    }
    if (j.pendingMinibossId !== null && Monsters.get(j.pendingMinibossId)?.tier !== "miniboss") fail("pending miniboss");
    if (j.retrySpeciesId !== null && (!Monsters.get(j.retrySpeciesId) ||
        !["small", "elite"].includes(Monsters.get(j.retrySpeciesId).tier))) fail("retry species");
    const ids = new Set();
    for (const p of state.players) {
      if (!Heroes.get(p.heroId) || ids.has(p.heroId)) fail("hero identity");
      ids.add(p.heroId);
      if (!p.equipment || Object.keys(p.equipment).length !== 3 ||
          !(state.version === 3 ? ["weapon", "armor", "accessory"].every(k => k in p.equipment) : ["weapon", "armor", "accessory"].every(k => p.equipment[k] === null))) fail("equipment slots");
      const ps = p.passiveState;
      if (!ps || !int(ps.discards) || !int(ps.swordUses, 0, 5) || !int(ps.tideUses, 0, 3) ||
          !int(ps.counterUses, 0, 5) || !int(ps.changeUses, 0, 6) || !int(ps.flowerUses, 0, 3) ||
          !number(ps.stored, 0, 30) || !number(ps.generated, ps.stored, 60) || typeof ps.counterReady !== "boolean" ||
          (ps.lastMeld !== null && !["chow", "pong", "exposed", "concealed", "added"].includes(ps.lastMeld)) ||
          (ps.fireMonsterId !== null && !int(ps.fireMonsterId, 1, state.monster.id))) fail("passive state");
    }
    const m = state.monster, species = Monsters.get(m?.speciesId);
    if (!species || m.tier !== species.tier || m.name !== species.name || (m.maxHp !== species.hp && m.maxHp !== species.legacyHp) || m.armor !== species.armor ||
        (m.speciesId !== "five-phase-sovereign" && m.element !== species.element) ||
        !int(m.attacks) || !int(m.heals, 0, 2) || !int(m.shields, 0, 2)) fail("journey monster");
    if (m.speciesId === "five-phase-sovereign" && m.element !== ELEMENTS[Math.floor(m.attacks / 2) % 5]) fail("boss rotation");
    for (const k of state.kills) {
      const species = Monsters.get(k.speciesId);
      if (!species || species.tier !== k.tier || !int(k.cycle, 1, j.cycle)) fail("journey kill");
    }
  }
  function telegraph(state) {
    if (state.version >= 2) return telegraphJourney(state);
    const type = random(state) < 2 / 3 ? "single" : "all";
    const charged = random(state) < 0.25;
    const damage = Math.round(
      (type === "single" ? 160 : 80) *
        Math.min(10000, Math.pow(1.1, state.monster.index - 1)) *
        (charged ? 1.5 : 1),
    );
    if (charged && state.monster.element === "metal")
      state.monster.statuses.push({
        kind: "attackUp",
        value: 0.2,
        duration: 1,
        fromCharge: true,
      });
    if (charged && state.monster.element === "earth")
      state.monster.statuses.push({
        kind: "defenseUp",
        value: 0.2,
        duration: 1,
        fromCharge: true,
      });
    const ailment = charged
      ? {
          fire: "burn",
          wood: "poison",
          water: "fragile",
          metal: "fragile",
          earth: "fragile",
        }[state.monster.element]
      : null;
    const attack = {
      type,
      charged,
      damage,
      ailment,
      cancelled: false,
      controlUsed: false,
      sealAilment: false,
    };
    const pending = state.monster.statuses.find((s) => s.kind === "sealPending");
    if (charged && pending) {
      state.monster.statuses.splice(state.monster.statuses.indexOf(pending), 1);
      sealCharge(state, attack);
    }
    return attack;
  }
  function sealCharge(state, a) {
    a.charged = false;
    if (state.monsterSkillVersion === 1) {
      a.damage=Math.min(a.damage,Monsters.get(state.monster.speciesId)[a.type]);
      a.sealed=true;a.ailment=null;dropChargeBuffs(state);return;
    }
    if (state.version >= 2) {
      const species = Monsters.get(state.monster.speciesId);
      a.damage = Math.round(species[a.type] * (species.behavior === "firstStrike" && state.monster.attacks === 0 ? 1.1 : 1));
      a.ailment = null; dropChargeBuffs(state); return;
    }
    a.damage = Math.round(
      (a.type === "single" ? 160 : 80) *
        Math.min(10000, Math.pow(1.1, state.monster.index - 1)),
    );
    a.ailment = null;
    dropChargeBuffs(state);
  }
  function spawn(state) {
    if (state.version >= 2) { spawnJourney(state); return; }
    const previous = state.monster && state.monster.element;
    if (!state.bag.length) {
      state.bag = ELEMENTS.slice();
      for (let i = 4; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1));
        [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
      }
      if (state.bag[0] === previous)
        [state.bag[0], state.bag[1]] = [state.bag[1], state.bag[0]];
    }
    const index = state.monster ? state.monster.index + 1 : 1;
    const element = state.bag.shift();
    const maxHp = Math.min(
      100000000,
      Math.round(MONSTER_BASE_HP * Math.pow(1.15, index - 1)),
    );
    state.monster = {
      id: index,
      index,
      name: BEASTS[element],
      element,
      hp: maxHp,
      maxHp,
      shield: element === "earth" ? 180 : 0,
      armor: 0.15,
      statuses: [],
      nextAttack: null,
    };
    state.monster.nextAttack = telegraph(state);
    delete state.postAttackControl;
    state.discardCount = 0;
    state.enemyDue = null;
    for (const player of state.players) {
      player.aggro = 0;
      player.damageTaken = 0;
      player.statuses = player.statuses.filter(
        (s) => !s.monsterId || s.monsterId === index,
      );
    }
  }
  function create(seed, previous = null, options = {}) {
    if (previous) validate(previous);
    if (previous?.version >= 2 && !previous.ended) return copy(previous);
    const v2 = previous ? previous.version >= 2 : options.heroId !== undefined;
    if (v2 && !previous && !Heroes.get(options.heroId)) throw Error("Unknown cultivation hero");
    const state = {
      version: v2 ? (previous?.version === 3 || (!previous && options.equipment) ? 3 : 2) : 1,
      seq: v2 && previous ? previous.seq : 0,
      rng: v2 && previous ? previous.rng : Number(seed) >>> 0 || 0x6d2b79f5,
      bag: [],
      handNumber: previous ? (previous.handNumber || 1) + (previous.ended ? 1 : 0) : 1,
      players: Array.from({ length: 4 }, (_, pid) => ({
        pid,
        characterId: previous?.players[pid].characterId || 'cult-' + pid,
        activeSeals: copy(previous ? (previous.ended ? previous.players[pid].pendingSeals || [] : previous.players[pid].activeSeals || []) : []),
        pendingSeals: [],
        hp: 1000,
        maxHp: 1000,
        shield: 0,
        shieldTurns: 0,
        shieldAbsorbed: 0,
        damage: 0,
        aggro: 0,
        weak: false,
        weakDiscards: 0,
        weakCount: 0,
        damageTaken: 0,
        hits: 0,
        statuses: [],
        flowers: [],
        formations: [],
      })),
      monster: null,
      discardCount: 0,
      enemyDue: null,
      ended: false,
      result: null,
      kills: [],
      log: [],
    };
    if (previous?.damageVariance === 1 || options.damageVariance === true) {
      state.damageVariance = 1;
      state.damageRng = (previous?.damageVariance === 1 ? previous.damageRng : (state.rng ^ 0x5bd1e995) >>> 0) || 0x2545f491;
    }
    if (v2) {
      state.monsterSkillVersion = options.monsterSkillVersion === 0 ? 0 : 1;
      const pool = Heroes.all.map(h => h.id).filter(id => id !== options.heroId);
      for (let i = previous ? 0 : pool.length - 1; i > 0; i--) {
        const j = Math.floor(random(state) * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      state.journey = previous ? copy(previous.journey) : journeyState();
      state.journey.phase = "combat";
      state.kills = previous ? copy(previous.kills) : [];
      state.monster = previous ? copy(previous.monster) : null;
      state.players.forEach((p, pid) => {
        p.heroId = previous ? previous.players[pid].heroId : pid === 0 ? options.heroId : pool[pid - 1];
        // Each hero has its own life pool; a hand always starts at full life.
        p.hp = p.maxHp = Heroes.get(p.heroId).hp || 1000;
        p.equipment = previous ? copy(previous.players[pid].equipment) : { weapon: null, armor: null, accessory: null };
        p.passiveState = passiveState();
      });
    }
    if (state.version === 3) {
      if (previous) {
        if(previous.itemRulesVersion!==undefined)state.itemRulesVersion=previous.itemRulesVersion;
        state.economy = copy(previous.economy);
        state.players.forEach((p, pid) => p.economy = copy(previous.players[pid].economy));
        Economy.nextHand(state);
      } else Economy.init(state, Number(seed) >>> 0 || 0x6d2b79f5);
    }
    if(state.version===3&&!previous){if(options.itemRulesVersion===0)state.itemRulesVersion=0;else Items.init(state);}
    spawn(state);
    return state;
  }
  function condition(state, ctx, when) {
    if (!when) return true;
    const p = actor(state, ctx.pid);
    const hp = ctx.startHp === undefined ? p.hp : ctx.startHp;
    const low = hp <= p.maxHp * 0.35;
    const top =
      ctx.startTop === undefined ? target(state) === ctx.pid : ctx.startTop;
    switch (when) {
      case "topAggro":
        return top;
      case "notTopAggro":
        return !top;
      case "fullHp":
        return hp === p.maxHp;
      case "notFullHp":
        return hp < p.maxHp;
      case "lowHp":
        return low;
      case "notLowHp":
        return !low;
      case "weak":
        return hp === 0;
      case "notWeak":
        return hp > 0;
      case "hadNextDamage":
        return ctx.hadNextDamage;
      case "hadDamageBoost":
        return ctx.hadDamageBoost;
      case "aoe":
        return ctx.attackType === "all";
      case "single":
        return ctx.attackType === "single";
      case "direct":
        return ctx.directAttack === true;
      case "healed":
        return ctx.lastHeal > 0;
      default:
        throw new Error("Unknown combat condition " + when);
    }
  }
  function scaleValue(state, ctx, scale, status) {
    if (!scale) return 0;
    const p = actor(state, ctx.pid);
    let base;
    switch (scale.source) {
      case "missingHp":
        base = p.maxHp - p.hp;
        break;
      case "enemyMissingRatio":
        base = 1 - state.monster.hp / state.monster.maxHp;
        break;
      case "lastBlocked":
        base = ctx.lastBlocked || 0;
        break;
      case "lastAbsorbed":
        base = ctx.lastAbsorbed || 0;
        break;
      case "armorLost":
        base = clamp(sumStatus(state.monster.statuses, "armor"), 0, 0.75);
        break;
      case "debuffCount":
        base = new Set(
          state.monster.statuses
            .filter((s) => s.kind !== "attackUp" && s.kind !== "defenseUp")
            .map((s) => s.kind),
        ).size;
        break;
      case "damageTaken":
        base = p.damageTaken;
        break;
      case "shield":
        base = p.shield;
        break;
      case "aggro":
        base = p.aggro;
        break;
      case "lastHeal":
        base = ctx.lastHeal || 0;
        break;
      case "lastCleanse":
        base = ctx.lastCleanse || 0;
        break;
      case "ownDamageSinceMark":
        base =
          p.damage -
          (status ? status.startDamage : ctx.startDamage || p.damage);
        if (state.version === 3) base -= p.equipmentState.extraDamage - ((status || ctx).startEquipmentDamage || 0);
        break;
      case "ownHitsSinceMark":
        base = p.hits - (status ? status.startHits : ctx.startHits || p.hits);
        if (state.version === 3) base -= p.equipmentState.extraHits - ((status || ctx).startEquipmentHits || 0);
        break;
      case "shieldAbsorbed":
        base = p.shieldAbsorbed - (status ? status.startAbsorbed || 0 : 0);
        break;
      default:
        throw new Error("Unknown combat scale " + scale.source);
    }
    return Math.min(scale.cap, Math.max(0, base * scale.ratio));
  }
  function makeContext(state, pid, skill, secondary) {
    return {
      pid,
      skill,
      element: skill.element || "earth",
      secondary: !!secondary,
      finisher: !!skill.finisher,
      basic: false,
      lastHeal: 0,
      lastCleanse: 0,
      actualDamage: 0,
      killer: null,
      onKill: [],
      hadNextDamage: !!buff(actor(state, pid), "nextDamage"),
      hadDamageBoost:
        ["nextDamage", "nextFlatDamage", "damageUp"].some(
          (kind) => (buff(actor(state, pid), kind)?.value || 0) > 0,
        ) || (buff(actor(state, pid), "rampDamage")?.current || 0) > 0,
      startHp: actor(state, pid).hp,
      startTop: target(state) === pid,
      startDamage: actor(state, pid).damage,
      startHits: actor(state, pid).hits,
      startEquipmentDamage: actor(state, pid).equipmentState?.extraDamage || 0,
      startEquipmentHits: actor(state, pid).equipmentState?.extraHits || 0,
      attackStarted: false,
      secret: skill.secret || false,
    };
  }
  function addShield(state, ctx, amount, duration, output) {
    const p = actor(state, ctx.pid);
    amount *= heroFactor(state, p, 'shield') * (1 - Math.min(.15, sumStatus(p.statuses, 'shieldGainDown')));
    amount *= Finishers?.factor ? Finishers.factor(p, 'shield') : 1;
    if (state.version === 3 && !ctx.naturalRecovery) amount *= Equipment.factor(p, 'shield');
    const before = p.shield;
    p.shield = clamp(p.shield + Math.round(amount), 0, 1000);
    p.shieldTurns = Math.max(p.shieldTurns, duration || 3);
    for (const s of p.statuses)
      if (["shieldEndDamage", "shieldBreakDamage", "shieldBreakHeal", "shieldAbsorbCounter"].includes(s.kind))
        s.duration = Math.max(s.duration, p.shieldTurns + 1);
    if (p.shield > before)
      emit(state, output, {
        type: "shield",
        pid: ctx.pid,
        amount: p.shield - before,
      });
  }
  function heal(state, ctx, amount, overheal, shieldRatio, output) {
    const p = actor(state, ctx.pid);
    if (!ctx.naturalRecovery) amount *= heroFactor(state, p, 'healing') * (1 - Math.min(.15, sumStatus(p.statuses, 'healingDown'))) * (Finishers?.factor ? Finishers.factor(p, 'heal') : 1);
    if (state.version === 3 && !ctx.naturalRecovery) amount *= Equipment.factor(p, 'heal');
    const actual = Math.min(p.maxHp - p.hp, Math.max(0, Math.round(amount)));
    p.hp += actual;
    if (state.version >= 2 && passive(p, "su-lingheng") && !ctx.naturalRecovery && !ctx.passiveRecovery && !ctx.equipmentRecovery && !ctx.equipmentExtra && actual) storePassive(p, actual * 0.15);
    if (state.version === 3 && !ctx.naturalRecovery && !ctx.equipmentRecovery && !ctx.equipmentExtra && actual) Equipment.record(p, 'heal', actual);
    ctx.lastHeal = actual;
    if (p.hp > 0) {
      p.weak = false;
      p.weakDiscards = 0;
    }
    if (actual)
      emit(state, output, { type: "heal", pid: ctx.pid, amount: actual });
    if (overheal && amount > actual)
      addShield(state, ctx, amount - actual, 3, output);
    if (shieldRatio) addShield(state, ctx, actual * shieldRatio, 3, output);
    const h = buff(p, "healToShield");
    if (h && actual) addShield(state, ctx, actual * h.value, 3, output);
    return actual;
  }
  function prepareFirePassive(state, ctx) {
    if (state.version < 2 || ctx.basic || ctx.secondary || ctx.firePrepared) return;
    ctx.firePrepared = true;
    const p = actor(state, ctx.pid), ps = p.passiveState;
    if (!passive(p, "chi-ling") || ps.fireMonsterId === state.monster.id) return;
    const attacks = effects => effects.flatMap(e => e.op === "segment" ? attacks(e.effects) :
      ["damage", "dot", "convert", "mark"].includes(e.op) && condition(state, ctx, e.when) ? [e] : []);
    const effects = attacks(ctx.skill.effects);
    if (!effects.length) return;
    const direct = effects.filter(e => ["damage", "convert"].includes(e.op));
    const markBase = effects.filter(e => e.op === "mark").reduce((n, e) => n + (e.amount || 0), 0);
    const dotBase = effects.filter(e => e.op === "dot").reduce((n, e) => n + e.amount * e.ticks, 0);
    const directBase = direct.reduce((n, e) => n + (e.op === "convert" ? Math.round(Math.min(e.cap, p[e.source] * e.ratio)) :
      ((e.amount || 0) + scaleValue(state, ctx, e.scale)) * (e.hits || 1)), 0);
    const bonus = Math.min(25, (directBase + dotBase + markBase) * 0.05);
    ps.fireMonsterId = state.monster.id;
    if (direct.length) ctx.passiveFlat = (ctx.passiveFlat || 0) + bonus;
    else {
      const scheduled = dotBase + markBase;
      if (dotBase) ctx.fireDotRatio = bonus / scheduled;
      if (markBase) ctx.fireMarkRatio = bonus / scheduled;
    }
  }
  function prepareAttack(state, ctx) {
    if (ctx.attackStarted) return;
    ctx.attackStarted = true;
    ctx.next = {
      damage: 0,
      flat: 0,
      penetration: 0,
      lifeSteal: 0,
      followup: null,
      aggro: 1,
    };
    if (ctx.basic || ctx.secondary) return;
    const p = actor(state, ctx.pid);
    if (state.version >= 2) {
      const ps = p.passiveState;
      if (ctx.meldChangeEligible && ps.changeUses < 6) { ctx.passiveFlat = (ctx.passiveFlat || 0) + 10; ps.changeUses++; }

    }
    prepareFirePassive(state, ctx);
    const ramp = buff(p, "rampDamage");
    if (ramp) {
      ramp.current = Math.round(Math.min(ramp.cap || 0.6, (ramp.current || 0) + ramp.value) * 100) / 100;
      ctx.rampBonus = ramp.current;
      used(p, ramp);
    }
    for (const [kind, field] of [
      ["nextDamage", "damage"],
      ["nextFlatDamage", "flat"],
      ["nextPenetration", "penetration"],
      ["nextLifesteal", "lifeSteal"],
    ]) {
      const s = buff(p, kind);
      if (s) {
        ctx.next[field] = s.value;
        remove(p, s);
      }
    }
    const mark = buff(p, "nextMark");
    if (mark) {
      ctx.next.mark = copy(mark);
      remove(p, mark);
    }
    const follow = buff(p, "nextFollowup");
    if (follow) {
      ctx.next.followup = copy(follow);
      remove(p, follow);
    }
    const ag = buff(p, "aggroRate");
    if (ag && ag.trigger === "attackSkill") {
      ctx.next.aggro = ag.value;
      used(p, ag);
    }
  }
  function deal(state, ctx, effect, output) {
    prepareAttack(state, ctx);
    const p = actor(state, ctx.pid);
    const m = state.monster;
    const amount =
      (effect.amount || 0) + scaleValue(state, ctx, effect.scale);
    // The stored "next hit" flat bonus is spent on the first hit only.
    let flat = (ctx.next.flat || 0) + (ctx.passiveFlat || 0);
    ctx.passiveFlat = 0;
    ctx.next.flat = 0;
    const hits = effect.hits || 1;
    const up = buff(p, "damageUp");
    const ramp = buff(p, "rampDamage");
    const pen = buff(p, "penetration");
    const ex = buff(p, "execute");
    const armor = clamp(
      m.armor -
        sumStatus(m.statuses, "armor") +
        sumStatus(m.statuses, "defenseUp"),
      0,
      0.8,
    );
    const penetration = clamp(
      (effect.penetration || 0) +
        (ctx.next.penetration || 0) +
        (pen &&
        condition(state, ctx, pen.when) &&
        (!pen.trigger || (!ctx.basic && !ctx.secondary))
          ? pen.value
          : 0),
      0,
      1,
    );
    let bonus =
      1 +
      (ctx.next.damage || 0) +
      (up ? up.value : 0) +
      (ctx.rampBonus !== undefined ? ctx.rampBonus : ramp ? ramp.current || 0 : 0);
    if (effect.execute && m.hp / m.maxHp <= effect.execute.threshold)
      bonus *= effect.execute.multiplier;
    if (ex && m.hp / m.maxHp <= (ex.threshold || 0.35)) bonus *= 1 + ex.value;
    const vulnerability =
      1 + clamp(sumStatus(m.statuses, "vulnerable"), 0, 0.5);
    const weak = p.hp === 0 ? 0.5 : 1;
    const multiplier =
      bonus *
      (state.version === 3 ? Equipment.factor(p, 'damage', { basic:ctx.basic, counter:ctx.skill.id === 'reaction' && !ctx.equipmentActive, active:ctx.equipmentActive || (!ctx.basic && !ctx.secondary && !ctx.dot) }) : 1) *
      heroFactor(state, p, "damage") *
      elementMultiplier(effect.element || ctx.element, m.element) *
      vulnerability *
      weak *
      (Finishers?.factor ? Finishers.factor(p, 'damage', { basic: ctx.basic, finisher: ctx.finisher, element: effect.element || ctx.element }) : 1) *
      (1 - armor * (1 - penetration));
    for (let hit = 0; hit < hits; hit++) {
      let itemBonus=0;
      if(ctx.itemEdgePending){useItem(state,p,'edge',output);ctx.itemEdgePending=false;ctx.itemEdge=true;}
      if(ctx.itemEdge&&ctx.itemHits>0){itemBonus=Math.min(ctx.itemPerHit,ctx.itemBudget);ctx.itemBudget-=itemBonus;ctx.itemHits--;}
      const damage = Math.max(0, Math.round((amount + flat + itemBonus) * multiplier * damageRoll(state)));
      flat = 0;
      if (effect.shieldDamage)
        m.shield = Math.max(0, (m.shield || 0) - effect.shieldDamage);
      const absorbed = Math.min(m.shield || 0, damage);
      m.shield = (m.shield || 0) - absorbed;
      const actual = Math.min(m.hp, damage - absorbed);
      m.hp -= actual;
      if (state.version === 3 && ctx.equipmentExtra) {
        p.equipmentState.extraDamage += Math.min(MAX_DAMAGE - p.damage, damage);
        p.equipmentState.extraHits++;
      }
      p.damage = clamp(p.damage + damage, 0, MAX_DAMAGE);
      p.hits++;
      ctx.actualDamage += actual;
      let rate = effect.aggroFactor === undefined ? 1 : effect.aggroFactor;
      const ar = buff(p, ctx.dot ? "dotAggroRate" : "aggroRate");
      if (ar && ar.trigger !== "attackSkill") rate *= ar.value;
      rate *= ctx.next.aggro || 1;
      rate *= Finishers?.factor ? Finishers.factor(p, 'aggro') : 1;
      if (state.version >= 2 && passive(p, 'ye-shuying')) rate *= 0.92;
      if (state.version === 3) rate *= Equipment.factor(p, 'aggro');
      rate *= 1 + Math.min(.15, sumStatus(p.statuses, 'monsterAggroUp'));
      p.aggro = clamp(p.aggro + damage * rate, 0, MAX_DAMAGE);
      if (actual && m.hp === 0 && ctx.killer === null) {
        ctx.killer = ctx.pid;
        if (effect.onKill) ctx.onKill.push(...effect.onKill);
      }
      emit(state, output, {
        type: "damage",
        pid: ctx.pid,
        amount: damage,
        actual,
        element: effect.element || ctx.element,
        secondary: ctx.secondary,
        secret: ctx.secret,
        ...(ctx.segmentId ? { segmentId: ctx.segmentId } : {}),
      });
      // Presentation metadata stays out of the persistent combat log/save contract.
      output[output.length - 1] = { ...output[output.length - 1],
        source: ctx.dot ? 'dot' : ctx.skill.id === 'reaction' ? 'counter' : ctx.secondary ? 'followup' : ctx.basic ? 'basic' : 'skill',
        skillId: ctx.secret ? null : ctx.skill.id };
      if (state.version === 3 && !ctx.equipmentExtra && !ctx.secondary && !ctx.basic && !ctx.dot && damage > 0 && !ctx.equipmentElement && ELEMENTS.includes(effect.element || ctx.element)) ctx.equipmentElement = effect.element || ctx.element;
      if (state.version === 3 && !ctx.equipmentExtra && !ctx.secondary && !ctx.dot && damage > 0) ctx.equipmentDirect = true;
      const life =
        (effect.lifeStealWeak && ctx.startHp === 0
          ? effect.lifeStealWeak
          : effect.lifeSteal || 0) + (ctx.next.lifeSteal || 0);
      const overflow = buff(p, "lifestealOverflow");
      if (life && actual && !ctx.equipmentExtra) {
        heal(
          state,
          ctx,
          actual * life,
          effect.overhealShield || !!overflow,
          false,
          output,
        );
        if (overflow) used(p, overflow);
      }
    }
    if (effect.extraAggro && !buff(p, "noExtraAggro"))
      p.aggro = clamp(p.aggro + effect.extraAggro * (1+Math.min(.15,sumStatus(p.statuses,'monsterAggroUp'))) * (state.version >= 2 && passive(p, 'ye-shuying') ? 0.92 : 1) * (Finishers?.factor ? Finishers.factor(p, 'aggro') : 1) * (state.version === 3 ? Equipment.factor(p, 'aggro') : 1), 0, MAX_DAMAGE);
    if (!ctx.equipmentExtra && !ctx.secondary && !ctx.basic) {
      for (const dot of m.statuses)
        if (dot.owner === ctx.pid && dot.extendOnHit > 0) {
          dot.ticks++;
          dot.extendOnHit--;
        }
    }
  }
  function addBuff(state, ctx, effect) {
    if (!BUFFS.has(effect.kind))
      throw new Error("Unknown combat buff " + effect.kind);
    const p = actor(state, ctx.pid);
    const status = copy(effect);
    if (
      !["shieldEndDamage", "shieldAbsorbCounter", "guardCounter", "shieldCounter"].includes(
        effect.kind,
      )
    ) {
      status.value = (status.value || 0) + scaleValue(state, ctx, effect.scale);
      delete status.scale;
    }
    if (effect.kind === "fragile") status.negative = true;
    status.duration = effect.duration || 3;
    status.owner = ctx.pid;
    status.element = ctx.element;
    status.startDamage = p.damage;
    status.startHits = p.hits;
    if (state.version === 3) { status.startEquipmentDamage = p.equipmentState.extraDamage; status.startEquipmentHits = p.equipmentState.extraHits; }
    status.startAbsorbed = p.shieldAbsorbed;
    status.id = ctx.skill.id || "basic";
    if (effect.kind === "rampDamage") status.current = 0;
    if (
      ["nextDamage", "nextFlatDamage", "nextPenetration", "nextLifesteal"].includes(effect.kind) &&
      !(status.value > 0)
    )
      return;
    const prior = buff(p, effect.kind);
    if (prior) remove(p, prior);
    p.statuses.push(status);
  }
  function dropChargeBuffs(state) {
    state.monster.statuses = state.monster.statuses.filter((s) => !s.fromCharge);
  }
  function applyControl(state, ctx, effect, output) {
    const a = state.monster.nextAttack;
    if (effect.kind === "sealAilment") {
      a.sealAilment = true;
      return;
    }
    if (effect.kind === "seal") {
      if (a.charged) sealCharge(state, a);
      else if (!state.monster.statuses.some((s) => s.kind === "sealPending"))
        state.monster.statuses.push({ kind: "sealPending", duration: 3 });
      return;
    }
    // Only delays are limited to one per telegraph; an interrupt still cancels a delayed charge.
    if (effect.kind === "interrupt") {
      if (a.cancelled) return;
      if (a.charged) {
        a.cancelled = true;
        dropChargeBuffs(state);
      } else if (effect.fallbackAttackDown)
        execute(
          state,
          ctx,
          [
            {
              op: "debuff",
              kind: "attack",
              value: effect.fallbackAttackDown,
              duration: 1,
            },
          ],
          output,
        );
    } else if (effect.kind === "delay") {
      if (a.controlUsed) return;
      state.discardCount = Math.max(-1, state.discardCount - 1);
      if (state.discardCount < 4) state.enemyDue = null;
      a.controlUsed = true;
    } else throw new Error("Unknown control " + effect.kind);
    emit(state, output, { type: "control", pid: ctx.pid, kind: effect.kind });
  }
  function execute(state, ctx, effects, output) {
    for (const effect of effects) {
      if (effect.op !== "buff" && !condition(state, ctx, effect.when)) continue;
      const p = actor(state, ctx.pid);
      switch (effect.op) {
        case "segment": {
          ctx.segmentId = effect.id;
          emit(state, output, { type: 'finisherPart', pid: ctx.pid, segmentId: effect.id, name: effect.name, label: effect.label, fan: effect.fan, budget: effect.budget });
          execute(state, ctx, effect.effects, output);
          delete ctx.segmentId;
          break;
        }
        case "damage":
          deal(state, ctx, effect, output);
          break;
        case "heal":
          heal(
            state,
            ctx,
            Math.min(
              effect.cap === undefined ? 1000 : effect.cap,
              (effect.amount || 0) +
                (p.maxHp - p.hp) * (effect.missingRatio || 0) +
                scaleValue(state, ctx, effect.scale),
            ),
            effect.overhealShield,
            effect.shieldRatio,
            output,
          );
          break;
        case "shield":
          addShield(
            state,
            ctx,
            Math.min(
              effect.cap === undefined ? 1000 : effect.cap,
              (effect.amount || 0) +
                (p.maxHp - p.hp) * (effect.missingRatio || 0) +
                scaleValue(state, ctx, effect.scale),
            ),
            effect.duration,
            output,
          );
          break;
        case "aggro":
          if (effect.mode === "reduce")
            p.aggro = Math.max(0, p.aggro * (1 - effect.value));
          else if (effect.mode === "top") {
            const highest = Math.max(...state.players.map(q => q.aggro));
            const rate = (Finishers?.factor ? Finishers.factor(p, 'aggro') : 1) *
              (state.version >= 2 && passive(p, "ye-shuying") ? 0.92 : 1) *
              (state.version === 3 ? Equipment.factor(p, 'aggro') : 1) * (1+Math.min(.15,sumStatus(p.statuses,'monsterAggroUp')));
            p.aggro += (highest + effect.value - p.aggro) * rate;
            if (state.version >= 2) p.aggro = Math.max(p.aggro, highest + 1);
            if(Items.enabled(state))p.economy.items.tauntMonster=state.monster.id;
          }
          else if (effect.mode === "add") p.aggro += effect.value * (1+Math.min(.15,sumStatus(p.statuses,'monsterAggroUp'))) * (state.version >= 2 && passive(p, 'ye-shuying') ? 0.92 : 1) * (Finishers?.factor ? Finishers.factor(p, 'aggro') : 1) * (state.version === 3 ? Equipment.factor(p, 'aggro') : 1);
          else throw new Error("Unknown aggro mode");
          p.aggro = clamp(p.aggro, 0, MAX_DAMAGE);
          break;
        case "buff":
          addBuff(state, ctx, effect);
          break;
        case "debuff": {
          if (!["armor", "attack", "vulnerable"].includes(effect.kind))
            throw new Error("Unknown debuff " + effect.kind);
          const prior = state.monster.statuses.find(
            (s) => s.kind === effect.kind,
          );
          if (prior) {
            prior.value = Math.max(prior.value, effect.value);
            prior.duration = Math.max(prior.duration, effect.duration || 2);
            prior.appliedSeq = state.seq;
            // A persistent debuff must not inherit a shorter one-shot charge limit.
            if (prior.charges === undefined || effect.charges === undefined)
              delete prior.charges;
            else prior.charges = Math.max(prior.charges, effect.charges);
          } else
            state.monster.statuses.push(
              Object.assign(copy(effect), {
                owner: ctx.pid,
                duration: effect.duration || 2,
                appliedSeq: state.seq,
              }),
            );
          break;
        }
        case "dot": {
          prepareFirePassive(state, ctx);
          const prior = state.monster.statuses.find(
            (s) => s.kind === effect.kind && s.owner === ctx.pid,
          );
          if (prior)
            state.monster.statuses.splice(
              state.monster.statuses.indexOf(prior),
              1,
            );
          const next = Object.assign(copy(effect), {
            owner: ctx.pid,
            element: ctx.element,
          });
          if (ctx.fireDotRatio) {
            next.passiveBonus = effect.amount * effect.ticks * ctx.fireDotRatio;
            next.passiveBonusTicks = effect.ticks;
          } else if (prior?.passiveBonus !== undefined) {
            next.passiveBonus = prior.passiveBonus;
            next.passiveBonusTicks = prior.passiveBonusTicks;
          }
          if (prior) {
            // Keep the best of the old and new DoT: amount, remaining ticks and penetration.
            next.amount = Math.max(prior.amount || 0, effect.amount || 0);
            next.ticks = Math.max(prior.ticks || 0, effect.ticks || 0);
            next.penetration = Math.max(prior.penetration || 0, effect.penetration || 0);
            if (!next.penetration) delete next.penetration;
          }
          state.monster.statuses.push(next);
          break;
        }
        case "cleanse": {
          let n = 0;
          for (const status of p.statuses.slice())
            if (
              status.negative &&
              (!effect.onlyDot ||
                ["burn", "poison", "flow"].includes(status.kind)) &&
              (effect.count === "all" || n < effect.count)
            ) {
              remove(p, status);
              n++;
            }
          ctx.lastCleanse = n;
          emit(state, output, { type: "cleanse", pid: ctx.pid, amount: n });
          break;
        }
        case "control":
          applyControl(state, ctx, effect, output);
          break;
        case "removeBuff": {
          const kind = effect.kind === "attack" ? "attackUp" : "defenseUp";
          let count = 0;
          state.monster.statuses = state.monster.statuses.filter(
            (s) => !(s.kind === kind || (kind === 'defenseUp' && s.kind === 'monsterRiposte')) || count++ >= (effect.count || 1),
          );
          break;
        }
        case "consumeDot": {
          const dots = state.monster.statuses.filter(
            (s) => s.kind === effect.kind && s.owner === ctx.pid,
          );
          state.monster.statuses = state.monster.statuses.filter(
            (s) => !dots.includes(s),
          );
          for (const dot of dots)
            deal(
              state,
              ctx,
              {
                amount: dot.amount * dot.ticks + (dot.passiveBonus || 0),
                penetration: dot.penetration || 0,
                lifeSteal: effect.lifeSteal || 0,
              },
              output,
            );
          break;
        }
        case "convert": {
          const available = p[effect.source];
          if (!["shield", "aggro"].includes(effect.source))
            throw new Error("Unknown conversion");
          const amount = Math.round(Math.min(effect.cap, available * effect.ratio));
          if (amount > 0) prepareFirePassive(state, ctx);
          if (effect.consume)
            p[effect.source] = effect.consumeAll
              ? 0
              : Math.max(0, available - amount);
          if (amount > 0)
            deal(
              state,
              ctx,
              {
                amount,
                penetration: effect.penetration || 0,
                aggroFactor: effect.source === "aggro" ? 0 : undefined,
              },
              output,
            );
          if (effect.source === "shield" && available > 0 && p.shield === 0) {
            const reactions = [];
            expireShield(state, ctx.pid, output, reactions, false);
            const kill = reactionsRun(state, reactions, output);
            if (kill && ctx.killer === null) ctx.killer = kill.pid;
          }
          break;
        }
        case "mark": {
          prepareFirePassive(state, ctx);
          p.statuses.push(
            Object.assign(copy(effect), {
              kind: "mark",
              id: ctx.skill.id,
              owner: ctx.pid,
              element: ctx.element,
              monsterId: state.monster.id,
              startDamage: p.damage,
              startHits: p.hits,
              ...(state.version === 3 ? {startEquipmentDamage:p.equipmentState.extraDamage,startEquipmentHits:p.equipmentState.extraHits} : {}),
              ...(ctx.fireMarkRatio ? { passiveBonus: (effect.amount || 0) * ctx.fireMarkRatio } : {}),
              duration: effect.duration || 3,
            }),
          );
          break;
        }
        default:
          throw new Error("Unknown cultivation effect " + effect.op);
      }
      if (["buff", "debuff", "dot", "aggro", "mark", "removeBuff"].includes(effect.op))
        output.push({ type: 'aura', seq: state.seq, monsterId: state.monster.id, pid: ctx.pid,
          op: effect.op, kind: effect.kind, mode: effect.mode, element: ctx.element,
          secret: ctx.secret, skillId: ctx.secret ? null : ctx.skill.id });
    }
  }
  function findSkill(action, key, keys) {
    if (!Skills) throw new Error("Cultivation skill catalog unavailable");
    if (typeof Skills.find === "function")
      return Skills.find(action, keys || key);
    return null;
  }
  function cast(state, pid, skill, output, options) {
    if (!skill) throw new Error("Unknown cultivation skill");
    const ctx = makeContext(state, pid, skill, options && options.secondary);
    if (options) Object.assign(ctx, options);
    if (state.version >= 2 && !ctx.secondary && ["chow", "pong", "exposed", "concealed", "added"].includes(skill.action)) {
      const p = actor(state, pid), ps = p.passiveState;
      if (passive(p, "yun-zhiwei")) {
        ctx.meldChangeEligible = ps.lastMeld !== null && ps.lastMeld !== skill.action;
        ps.lastMeld = skill.action;
      }
    }
    if (state.version >= 2 && !ctx.secondary) {
      const p = actor(state, pid), ps = p.passiveState;
      if (ctx.basic) {
        ctx.passiveFlat = ps.stored; ps.stored = 0;
        if (state.version === 3) { ctx.equipmentStored = p.equipmentState.stored; p.equipmentState.stored = 0; }
        if (passive(p, "shen-gufeng") && ps.discards % 3 === 0 && ps.swordUses < 5) { ctx.passiveFlat += 10; ps.swordUses++; }
      }
    }
    emit(state, output, {
      type: "skill",
      pid,
      skillId: ctx.secret ? null : skill.id,
      name: ctx.secret ? "秘術" : skill.name,
      secret: ctx.secret,
    });
    if(Items.enabled(state)&&!ctx.basic&&!ctx.secondary&&!ctx.dot&&Items.has(actor(state,pid),'edge')){
      const direct=effects=>effects.reduce((n,e)=>n+(e.op==='segment'?direct(e.effects):e.op==='damage'?e.hits||1:0),0);
      const base=effects=>effects.reduce((n,e)=>n+(e.op==='segment'?base(e.effects):e.op==='damage'?Math.max(0,(e.amount||0)+scaleValue(state,ctx,e.scale))*(e.hits||1):0),0);
      ctx.itemHits=direct(skill.effects);ctx.itemBudget=Math.min(ITEM_EDGE_CAP,base(skill.effects)*ITEM_EDGE_RATE);ctx.itemPerHit=ctx.itemBudget/Math.max(1,ctx.itemHits);ctx.itemEdgePending=ctx.itemHits>0&&ctx.itemBudget>0;
    }
    execute(state, ctx, skill.effects, output);
    if (ctx.attackStarted && !ctx.secondary && !ctx.basic) {
      if (ctx.next.mark)
        execute(
          state,
          ctx,
          [
            {
              op: "mark",
              trigger: "enemyAfterAttack",
              amount: ctx.next.mark.amount,
              duration: 4,
            },
          ],
          output,
        );
      const follow = buff(actor(state, pid), "followup");
      for (const extra of [ctx.next.followup, follow])
        if (extra) {
          const c = makeContext(state, pid, skill, true);
          if (ctx.finisher) c.segmentId = 'followup';
          deal(
            state,
            c,
            {
              amount: extra.amount || extra.value || 0,
              penetration: extra.penetration || 0,
            },
            output,
          );
          if (c.killer !== null && ctx.killer === null) ctx.killer = c.killer;
          used(actor(state, pid), extra);
        }
    }
    if (ctx.killer !== null) execute(state, ctx, ctx.onKill, output);
    const p = actor(state, pid);
    if (state.version >= 2 && !ctx.secondary && passive(p, "mu-canglan") && skill.action === "chow" && p.passiveState.tideUses < 3) {
      p.passiveState.tideUses++; ctx.passiveRecovery = true;
      heal(state, ctx, 25, false, false, output);
    }
    if (state.version === 3 && !ctx.secondary) equipmentAfterCast(state, ctx, output);
    const riposte = state.monster.statuses.find(s=>s.kind==='monsterRiposte');
    if(state.monsterSkillVersion===1 && riposte && ctx.attackStarted && !ctx.basic && !ctx.secondary && !ctx.dot && state.monster.hp>0){
      state.monster.statuses.splice(state.monster.statuses.indexOf(riposte),1);
      emit(state,output,{type:'monsterSkill',skillId:'crimson-sword-demon.riposte',name:'劍罡反震',
        monsterId:state.monster.id,actionNumber:state.monster.attacks,targets:[pid],reaction:true});
      hitPlayer(state,pid,riposte.value,'single',output,[],false,1,true);
      const hurt=output.findLast(e=>e.type==='hurt'&&e.pid===pid);
      if(hurt)hurt.monsterSkillId='crimson-sword-demon.riposte';
    }
    return ctx;
  }
  function equipmentAfterCast(state, ctx, output) {
    const p=actor(state,ctx.pid), ps=p.equipmentState, b=Equipment.bonuses(p), extras=[];
    if (ctx.basic && ctx.equipmentStored > 0) extras.push({amount:ctx.equipmentStored,element:ctx.element});
    if (ctx.basic) for (const [set,element] of [['zhenyue','earth'],['jiuyou','wood']]) {
      if (b.sets[set]===3 && ps[set+'Meter']>=100 && ps[set+'Uses']<3) {
        ps[set+'Meter']-=100;ps[set+'Uses']++;extras.push({amount:10,element});
      }
    }
    if (ctx.equipmentDirect && !ctx.basic && ['chow','pong','exposed','concealed','added'].includes(ctx.skill.action) && b.sets.chixiao===3 && ps.chixiaoUses<2) {
      ps.chixiaoCount++;
      if (ps.chixiaoCount===3) {ps.chixiaoCount=0;ps.chixiaoUses++;extras.push({amount:15,element:'metal'});}
    }
    if (!ctx.basic && ctx.equipmentElement && b.sets.wuxiang===3 && ps.wuxiangUses<2) {
      ps.wuxiangCount=ps.wuxiangElement===ctx.equipmentElement?1:ps.wuxiangCount+1;ps.wuxiangElement=ctx.equipmentElement;
      if (ps.wuxiangCount===3) {ps.wuxiangCount=0;ps.wuxiangElement=null;ps.wuxiangUses++;extras.push({amount:15,element:'neutral'});}
    }
    for (const extra of extras) {
      const c=makeContext(state,ctx.pid,{id:'equipment',element:extra.element},true);
      c.equipmentExtra=true; c.basic=ctx.basic; c.finisher=ctx.finisher; c.segmentId='equipment';
      deal(state,c,extra,output); if(ctx.killer===null&&c.killer!==null)ctx.killer=c.killer;
    }
  }
  function equipmentDiscard(state,pid,output) {
    if (state.version !== 3) return;
    const p=actor(state,pid),b=Equipment.bonuses(p),ps=p.equipmentState;
    const ctx=makeContext(state,pid,{id:'equipment-discard',element:'wood'},true);ctx.equipmentRecovery=true;
    if (b.discardHeal && ps.discardHeals<5) {ps.discardHeals++;heal(state,ctx,5,false,false,output);}
    if (b.discardShield && ps.discardShields<5) {ps.discardShields++;addShield(state,ctx,5,2,output);}
  }
  function finishKill(state, ctx, output, noSpawn) {
    if (state.monster.hp > 0) return;
    if (state.kills.some(k => k.monsterId === state.monster.id)) return;
    const pid = ctx.killer === null ? ctx.pid : ctx.killer;
    if (state.version >= 2) advanceJourney(state);
    state.kills.push({
      monsterId: state.monster.id,
      index: state.monster.index,
      name: state.monster.name,
      element: state.monster.element,
      ...(state.version >= 2 ? { speciesId: state.monster.speciesId, tier: state.monster.tier, cycle: state.journey.cycle - (state.monster.tier === "boss" ? 1 : 0) } : {}),
      pid,
      seq: state.seq,
    });
    if (state.version === 3) Economy.creditKill(state, state.monster, pid);
    for(const player of state.players)player.statuses=player.statuses.filter(s=>!s.monsterSkill||s.monsterId!==state.monster.id);
    emit(state, output, { type: "kill", pid, name: state.monster.name });
    if (!noSpawn) {
      spawn(state);
      emit(state, output, { type: "spawn", name: state.monster.name });
    }
  }
  function expireShield(state, pid, output, reactions, broken) {
    const p = actor(state, pid);
    const context = makeContext(
      state,
      pid,
      { id: "shield", element: "earth" },
      true,
    );
    for (const kind of [
      "shieldBreakDamage",
      "shieldBreakHeal",
      "shieldAbsorbCounter",
      "shieldEndDamage",
    ]) {
      const s = buff(p, kind);
      if (!s) continue;
      remove(p, s);
      if (!broken && ["shieldBreakDamage", "shieldBreakHeal"].includes(kind))
        continue;
      if (kind === "shieldBreakHeal") {
        if (p.hp > 0) heal(state, context, s.amount || s.value || 0, false, false, output);
      }
      else {
        const amount =
          (s.amount || 0) +
          scaleValue(
            state,
            context,
            s.scale ||
              (kind === "shieldAbsorbCounter"
                ? {
                    source: "shieldAbsorbed",
                    ratio: s.value || 1,
                    cap: s.cap || 300,
                  }
                : null),
            s,
          );
        reactions.push({
          pid,
          element: s.element,
          amount,
          penetration: s.penetration || 0,
          allowWeak: kind === "shieldEndDamage",
        });
      }
    }
    p.shield = 0;
    p.shieldTurns = 0;
    p.shieldAbsorbed = 0;
  }
  function ailment(state, pid, kind, output, reactions) {
    const p = actor(state, pid);
    if (!kind || p.hp <= 0 || buff(p, "immuneAilment")) return;
    const guard = buff(p, "statusGuard");
    if (guard) {
      used(p, guard);
      if (guard.heal)
        heal(
          state,
          makeContext(state, pid, { element: guard.element }, true),
          guard.heal,
          false,
          false,
          output,
        );
      if (guard.amount)
        reactions.push({ pid, element: guard.element, amount: guard.amount });
      return;
    }
    const prior = p.statuses.find((s) => s.negative && s.kind === kind);
    if (prior) remove(p, prior);
    p.statuses.push({
      kind,
      negative: true,
      duration: 2,
      value: kind === "fragile" ? 0.2 : 35,
    });
    emit(state, output, { type: "ailment", pid, kind });
  }
  function hitPlayer(state, pid, amount, attackType, output, reactions, dot, hits = 1, noChain = false, itemReduction = 0) {
    const p = actor(state, pid);
    if (p.hp === 0) return;
    const context = makeContext(state, pid, { element: "earth" }, true);
    context.attackType = attackType;
    context.directAttack = !dot;
    const reduction = buff(p, dot ? "reduceDot" : "reduceDamage");
    const guard = !dot && buff(p, "guard");
    let reductionValue =
      reduction && condition(state, context, reduction.when)
        ? reduction.value
        : 0;
    if (reduction && reductionValue) used(p, reduction);
    let dealt = Math.round(
      amount * (1-itemReduction) * damageRoll(state) *
        heroFactor(state, p, "taken") *
        (state.version === 3 ? Equipment.factor(p, 'taken', {top:!dot && target(state) === pid, aoe:!dot && attackType === 'all'}) : 1) *
        (state.version >= 2 && !dot && passive(p, "yue-zhenshan") && target(state) === pid ? 0.97 : 1) *
        (Finishers?.factor ? Finishers.factor(p, 'taken') : 1) *
        (1 - clamp(reductionValue, 0, 0.85)) *
        (1 + (state.monsterSkillVersion===1 ? Math.min(.15,sumStatus(p.statuses.filter(s=>s.monsterSkill), 'fragile')) + sumStatus(p.statuses.filter(s=>!s.monsterSkill),'fragile') : sumStatus(p.statuses, "fragile"))),
    );
    if (guard && condition(state, context, guard.when)) {
      const beforeGuard = dealt;
      dealt = Math.round(dealt * (1 - clamp(guard.value, 0, 1)));
      context.lastBlocked = beforeGuard - dealt;
      used(p, guard);
      const gc = buff(p, "guardCounter");
      if (gc && context.lastBlocked && !noChain) {
        reactions.push({
          pid,
          element: gc.element,
          amount: (gc.amount || 0) + scaleValue(state, context, gc.scale, gc),
          penetration: gc.penetration || 0,
        });
        used(p, gc);
      }
    }
    const beforeShield = p.shield;
    const absorbed = Math.min(p.shield, dealt);
    context.lastAbsorbed = absorbed;
    p.shield -= absorbed;
    p.shieldAbsorbed += absorbed;
    if (state.version >= 2 && passive(p, "luo-xuanyu") && absorbed) storePassive(p, absorbed * 0.15);
    if (state.version === 3 && absorbed) Equipment.record(p, 'shield', absorbed);
    dealt -= absorbed;
    const actual = Math.min(p.hp, dealt);
    p.hp -= actual;
    p.damageTaken += actual;
    emit(state, output, { type: "hurt", pid, amount: actual, absorbed, ...(hits > 1 ? { hits } : {}) });
    if (p.hp === 0) {
      const life = buff(p, "deathGuard");
      if (life) {
        remove(p, life);
        context.naturalRecovery = true;
        heal(
          state,
          context,
          Math.max(1, life.value || 1),
          false,
          false,
          output,
        );
        context.naturalRecovery = false;
        if (life.amount && !noChain)
          reactions.push({ pid, element: life.element, amount: life.amount });
      } else {
        p.weak = true;
        p.weakDiscards = 0;
        p.weakCount++;
      }
    }
    if (state.version >= 2 && !dot && !noChain && p.hp > 0 && passive(p, "tie-wujiu") && p.passiveState.counterReady && p.passiveState.counterUses < 5) {
      p.passiveState.counterReady = false; p.passiveState.counterUses++;
      reactions.push({ pid, amount: 15, element: "earth" });
    }
    const shieldStatus = buff(p, "shieldCounter");
    if (
      !dot && !noChain &&
      absorbed &&
      shieldStatus &&
      p.hp > 0 &&
      condition(state, context, shieldStatus.when)
    ) {
      reactions.push({
        pid,
        element: shieldStatus.element,
        amount: (shieldStatus.amount || shieldStatus.value || 0) + scaleValue(state, context, shieldStatus.scale, shieldStatus),
        penetration: shieldStatus.penetration || 0,
      });
      used(p, shieldStatus);
    }
    if (beforeShield > 0 && p.shield === 0)
      expireShield(state, pid, output, reactions, true);
    if (p.hp > 0 && !dot) {
      for (const kind of [
        "counter",
        "takenToShield",
        "takenToNext",
        "absorbedToNext",
        "onHitShield",
        "onHitHeal",
      ]) {
        const s = buff(p, kind);
        if (!s || !condition(state, context, s.when)) continue;
        if (kind === "counter") {
          if(noChain)continue;
          reactions.push({
            pid,
            element: s.element,
            amount: s.amount || s.value || 0,
            penetration: s.penetration || 0,
            control: s.control,
          });
          used(p, s);
        } else if (kind === "takenToShield")
          addShield(
            state,
            context,
            Math.min(s.cap || 300, actual * s.value),
            s.duration,
            output,
          );
        else if (kind === "onHitShield") {
          addShield(state, context, s.value, s.duration, output);
          used(p, s);
        } else if (kind === "onHitHeal") {
          heal(state, context, s.value, false, false, output);
          used(p, s);
        } else if (
          (kind === "takenToNext" && actual) ||
          (kind === "absorbedToNext" && absorbed)
        ) {
          const n = buff(p, "nextFlatDamage");
          const value = Math.min(
            s.cap || 220,
            (kind === "absorbedToNext" ? absorbed : actual) * s.value,
          );
          if (n) n.value = Math.min(s.cap || 220, n.value + value);
          else
            addBuff(state, context, {
              kind: "nextFlatDamage",
              value,
              duration: 3,
              charges: 1,
            });
        }
      }
    }
  }
  function reactionsRun(state, reactions, output) {
    let last = null;
    for (const reaction of reactions) {
      if (state.monster.hp <= 0) break;
      if (actor(state, reaction.pid).hp <= 0 && !reaction.allowWeak) continue;
      const ctx = makeContext(
        state,
        reaction.pid,
        { id: "reaction", element: reaction.element || "earth" },
        true,
      );
      if (reaction.equipmentActive) ctx.equipmentActive = true;
      if (reaction.amount > 0) deal(state, ctx, reaction, output);
      if (ctx.killer !== null) last = ctx;
      if (reaction.control)
        state.postAttackControl = { kind: reaction.control, pid: reaction.pid };
      if (reaction.debuff)
        execute(
          state,
          ctx,
          [Object.assign({ op: "debuff" }, reaction.debuff)],
          output,
        );
    }
    return last;
  }
  function ownTurn(state, pid, output, wasWeak) {
    const p = actor(state, pid);
    const reactions = [];
    const ctx = makeContext(state, pid, { id: "turn", element: "earth" }, true);
    const statuses = p.statuses.slice();
    for (const status of statuses) {
      if (status.kind === "hot")
        heal(
          state,
          ctx,
          status.amount || status.value || 0,
          status.overhealShield,
          status.shieldRatio,
          output,
        );
      if (status.negative && ["burn", "poison", "flow"].includes(status.kind))
        hitPlayer(state, pid, status.value, "single", output, reactions, true);
    }
    if (p.hp === 0 && wasWeak) {
      p.weakDiscards++;
      if (p.weakDiscards >= 2)
        { ctx.naturalRecovery = true; heal(state, ctx, p.maxHp * 0.3, false, false, output); }
    }
    if (p.shield > 0 && --p.shieldTurns <= 0)
      expireShield(state, pid, output, reactions, false);
    for (const status of statuses) {
      status.duration--;
      if (status.duration <= 0) {
        // 蓄勢反擊: a counter stance that lapses with charges left releases part of one strike.
        if (state.version >= 2 && ["counter", "shieldCounter"].includes(status.kind) && p.statuses.includes(status) && (status.amount || status.value) > 0)
          reactions.push({ pid, element: status.element, amount: Math.round((status.amount || status.value) * COUNTER_RELEASE), penetration: status.penetration || 0 });
        remove(p, status);
      }
    }
    const kill = reactionsRun(state, reactions, output);
    if (kill) finishKill(state, kill, output, false);
  }
  function monsterSkillAfter(state,skill,attack,targets,highest,output){
    const m=state.monster;
    // A heal at full health is not spent: the two uses only count when HP is restored.
    if(skill.heal && m.heals<2 && m.hp>0 && m.hp<m.maxHp){
      const amount=Math.min(skill.heal,m.maxHp-m.hp);m.hp+=amount;m.heals++;
      emit(state,output,{type:'enemyHeal',amount,monsterSkillId:skill.id});
    }
    if(skill.shield && m.shields<2){m.shield=Math.min(10000,m.shield+skill.shield);m.shields++;
      emit(state,output,{type:'enemyShield',amount:skill.shield,monsterSkillId:skill.id});}
    if(skill.riposte)m.statuses.push({kind:'monsterRiposte',value:skill.riposte,duration:2});
    if(!skill.ailment || attack.sealAilment)return;
    const a=skill.ailment;
    for(const pid of a.topOnly?[highest].filter(x=>x!==null&&targets.includes(x)):targets){
      const p=actor(state,pid);if(!p.hp)continue;
      const immune=buff(p,'immuneAilment'),guard=buff(p,'statusGuard');
      if(immune){used(p,immune);continue;}
      if(guard){used(p,guard);if(guard.heal)heal(state,makeContext(state,pid,{element:m.element},true),guard.heal,false,false,output);continue;}
      const old=p.statuses.find(s=>s.kind===a.kind&&s.monsterSkill);
      if(old){old.value=Math.max(old.value,a.value);old.duration=Math.max(old.duration,a.duration);}
      else p.statuses.push({kind:a.kind,value:a.value,duration:a.duration,negative:true,monsterSkill:true,monsterId:m.id});
      emit(state,output,{type:'ailment',pid,kind:a.kind,monsterSkillId:skill.id});
    }
  }
  function enemy(state, output) {
    if (state.enemyDue !== state.monster.id) return;
    const m = state.monster;
    const attack = copy(m.nextAttack);
    const skill = state.monsterSkillVersion===1 && !attack.sealed ? MonsterSkills.get(attack.skillId) : null;
    if(Items.enabled(state)&&!attack.cancelled&&attack.type==='single'){
      const pid=target(state),p=pid===null?null:actor(state,pid);
      if(p&&p.economy.items.tauntMonster!==m.id&&p.aggro>0&&useItem(state,p,'stealth',output))p.aggro=Math.max(0,Math.round(p.aggro*(1-ITEM_STEALTH_CUT)));
    }
    const highest = target(state);
    if(Items.enabled(state))for(const p of state.players)p.economy.items.tauntMonster=0;
    m.statuses=m.statuses.filter(s=>s.kind!=='monsterRiposte');
    if (state.version >= 2) m.attacks++;
    state.enemyDue = null;
    state.discardCount = 0;
    const reactions = [];
    const targets =
      attack.type === "all"
        ? [0, 1, 2, 3].filter((pid) => actor(state, pid).hp > 0)
        : [target(state)].filter((pid) => pid !== null);
    const itemGuard=new Set();
    if (!attack.cancelled) {
      if(Items.enabled(state))for(const pid of targets){const p=actor(state,pid);
        if(p.shield<50&&useItem(state,p,'barrier',output))addShield(state,makeContext(state,pid,{id:'item.barrier'},true),100,3,output);
        if(attack.charged&&!attack.sealed&&useItem(state,p,'guard',output))itemGuard.add(pid);
      }
      if(skill)emit(state,output,{type:'monsterSkill',skillId:skill.id,name:skill.name,monsterId:m.id,
        actionNumber:m.attacks,targets:targets.slice(),element:m.element,charged:attack.charged,hits:skill.hits});
      const damage =
        attack.damage *
        (1 - clamp(sumStatus(m.statuses, "attack"), 0, 0.6)) *
        (1 + clamp(sumStatus(m.statuses, "attackUp"), 0, 0.5));
      if (state.version >= 2 && state.monsterSkillVersion!==1 && m.attacks % 3 === 0 && Monsters.get(m.speciesId).behavior === "shieldStrip")
        for (const pid of targets) actor(state, pid).shield = Math.max(0, actor(state, pid).shield - 20);
      if(skill?.strip)for(const pid of targets){const p=actor(state,pid),amount=Math.min(p.shield,skill.strip);p.shield-=amount;emit(state,output,{type:'shieldStrip',pid,amount,monsterSkillId:skill.id});}
      const double = state.version >= 2 && state.monsterSkillVersion!==1 && attack.type === "single" && ["double", "sword"].includes(Monsters.get(m.speciesId).behavior);
      for (const pid of targets) {
        // Split-strike presentation shares one damage budget and one set of reactions.
        const start=output.length;
        hitPlayer(state, pid, damage, attack.type, output, reactions, false, skill?.hits || (double ? 2 : 1),false,itemGuard.has(pid)?ITEM_GUARD_CUT:0);
        if(skill)for(let i=start;i<output.length;i++)if(output[i].type==='hurt')output[i].monsterSkillId=skill.id;
      }
      if (skill) monsterSkillAfter(state,skill,attack,targets,highest,output);
      else if (state.version >= 2 && state.monsterSkillVersion!==1) monsterAfterAttack(state, targets, output);
      for (const pid of targets)
        if (!attack.sealAilment)
          ailment(state, pid, attack.ailment, output, reactions);
      emit(state, output, {
        type: "enemy",
        attackType: attack.type,
        targets,
        charged: attack.charged,
        ...(state.monsterSkillVersion===1?{skillId:skill?.id || null,monsterId:m.id,actionNumber:m.attacks}:{}),
      });
    } else emit(state, output, { type: "interrupted", ...(state.monsterSkillVersion===1?{skillId:attack.skillId,monsterId:m.id,actionNumber:m.attacks}: {}) });
    for (const p of state.players)
      for (const status of p.statuses.slice()) {
        if (
          status.kind === "mark" &&
          status.monsterId === m.id &&
          !attack.cancelled &&
          (status.trigger === "enemyAfterAttack" ||
            (status.trigger === "enemySingleOther" && attack.type === "single"))
        ) {
          remove(p, status);
          if (status.trigger === "enemySingleOther" && targets.includes(p.pid)) continue;
          const ctx = makeContext(
            state,
            p.pid,
            { element: status.element },
            true,
          );
          reactions.push({
            pid: p.pid,
            element: status.element,
            amount:
              (status.amount || 0) + (status.passiveBonus || 0) +
              scaleValue(state, ctx, status.scale, status),
            penetration: status.penetration || 0,
            debuff: status.debuff,
            allowWeak: true,
            equipmentActive: true,
          });
        }
      }
    let kill = reactionsRun(state, reactions, output);
    for (const status of m.statuses.slice()) {
      // Post-attack marks apply/refresh debuffs for future attacks, not this one.
      if (status.appliedSeq === state.seq) continue;
      if (status.op === "dot" && m.hp > 0) {
        const ctx = makeContext(
          state,
          status.owner,
          { id: "dot", element: status.element },
          true,
        );
        ctx.dot = true;
        ctx.equipmentActive = true;
        const passiveBonus = status.passiveBonusTicks > 0 ? status.passiveBonus / status.passiveBonusTicks : 0;
        if (status.passiveBonusTicks > 0) { status.passiveBonus -= passiveBonus; status.passiveBonusTicks--; }
        deal(
          state,
          ctx,
          { amount: status.amount + passiveBonus, penetration: status.penetration || 0 },
          output,
        );
        status.ticks--;
        if (ctx.killer !== null) kill = ctx;
      } else if (status.duration !== undefined) {
        status.duration--;
        if (status.charges !== undefined) status.charges--;
      }
    }
    m.statuses = m.statuses.filter((s) =>
      s.ticks !== undefined
        ? s.ticks > 0
        : s.duration > 0 && (s.charges === undefined || s.charges > 0),
    );
    if (state.version >= 2 && m.speciesId === "five-phase-sovereign") m.element = ELEMENTS[Math.floor(m.attacks / 2) % 5];
    afterItems(state,output);
    if (state.players.every((p) => p.hp === 0)) {
      state.ended = true;
      state.result = { reason: "defeat", huPid: null, ranking: ranking(state) };
      emit(state, output, { type: "end", reason: "defeat" });
      if (kill) finishKill(state, kill, output, true);
      return;
    }
    if (kill) {
      finishKill(state, kill, output, false);
      return;
    }
    m.nextAttack = telegraph(state);
    if (state.postAttackControl) {
      const ctx = makeContext(
        state,
        state.postAttackControl.pid,
        { id: "counter-control", element: "water" },
        true,
      );
      applyControl(state, ctx, { kind: state.postAttackControl.kind }, output);
      delete state.postAttackControl;
    }
  }
  function useItem(state,p,id,output){
    if(!Items.enabled(state)||!Items.consume(p,id))return false;
    emit(state,output,{type:'item',pid:p.pid,itemId:id,name:Items.get(id).name});return true;
  }
  function afterItems(state,output){
    if(!Items.enabled(state))return;
    for(const p of state.players){
      const negative=p.statuses.find(x=>x.negative);
      if(negative&&useItem(state,p,'cleanse',output)){remove(p,negative);emit(state,output,{type:'cleanse',pid:p.pid,amount:1});}
      if(p.hp<=p.maxHp*.35&&output.some(e=>e.type==='hurt'&&e.pid===p.pid)&&useItem(state,p,'heal',output))
        heal(state,makeContext(state,p.pid,{id:'item.heal',element:'wood'},true),120,false,false,output);
    }
  }
  function apply(input, event) {
    validate(input);
    if (!event || !Number.isInteger(event.id) || event.id < 1)
      throw new Error("Combat event requires positive sequence id");
    if (event.id <= input.seq) return { state: copy(input), effects: [] };
    if (event.id !== input.seq + 1)
      throw new Error("Combat event sequence gap");
    const state = copy(input);
    const output = [];
    if (event.type === "preparation") {
      if (state.version < 2 || !state.ended) throw Error("Preparation requires ended V2 hand");
      state.seq = event.id; state.journey.phase = "preparation"; if(state.version===3)Economy.prepare(state); validate(state); return { state, effects: output };
    }
    if (state.ended) return { state, effects: output };
    state.seq = event.id;
    if (event.monsterId !== undefined && event.monsterId !== state.monster.id)
      return { state, effects: output };
    if (
      ["discard", "meld", "flower"].includes(event.type) ||
      (event.type === "finish" && event.pid !== null && event.pid !== undefined)
    ) {
      if (!Number.isInteger(event.pid) || event.pid < 0 || event.pid > 3)
        throw new Error("Invalid combat actor");
    }
    switch (event.type) {
      case "discard": {
        if (!/^(?:[WTB][1-9]|F[ESWN]|D[CFB])$/.test(event.key))
          throw new Error("Invalid discard tile");
        if (state.version >= 2) { const ps = actor(state, event.pid).passiveState; ps.discards++; ps.counterReady = true; }
        const before = state.monster.id;
        const wasWeak = actor(state, event.pid).hp === 0;
        const skill = {
          id: "basic",
          name: "晶石普攻",
          element: tileElement(event.key),
          effects: [{ op: "damage", amount: 50 }],
        };
        const ctx = cast(state, event.pid, skill, output, { basic: true });
        finishKill(state, ctx, output, false);
        ownTurn(state, event.pid, output, wasWeak);
        equipmentDiscard(state, event.pid, output);
        if (state.monster.id === before) {
          state.discardCount++;
          if (state.discardCount >= 4) state.enemyDue = state.monster.id;
        }
        break;
      }
      case "meld": {
        const skill = findSkill(event.action, event.key, event.keys);
        const ctx = cast(state, event.pid, skill, output, {
          secret: event.pid !== 0 && event.action === "concealed",
        });
        finishKill(state, ctx, output, false);
        break;
      }
      case "flower": {
        const p = actor(state, event.pid);
        if (!/^H[1-8]$/.test(event.key)) throw new Error("Invalid flower");
        if (p.flowers.includes(event.key)) break;
        p.flowers.push(event.key);
        if (state.version >= 2 && passive(p, "hua-jianlu") && p.passiveState.flowerUses < 3) {
          p.passiveState.flowerUses++;
          const context = makeContext(state, event.pid, { id: "flower-passive", element: "wood" }, true);
          context.passiveRecovery = true; heal(state, context, 15, false, false, output); addShield(state, context, 15, 3, output);
        }
        const ctx = cast(
          state,
          event.pid,
          findSkill("flower", event.key),
          output,
        );
        finishKill(state, ctx, output, false);
        for (const [id, keys] of [
          ["seasons", ["H1", "H2", "H3", "H4"]],
          ["gentlemen", ["H5", "H6", "H7", "H8"]],
        ])
          if (
            keys.every((key) => p.flowers.includes(key)) &&
            !p.formations.includes(id)
          ) {
            p.formations.push(id);
            const form = Skills.get("formation." + id);
            const c = cast(state, event.pid, form, output);
            finishKill(state, c, output, false);
          }
        break;
      }
      case "enemy":
        enemy(state, output);
        break;
      case "finish": {
        if (event.method !== undefined && !['discard', 'selfDraw', 'robKong'].includes(event.method)) throw Error('Invalid finish method');
        if (event.from !== undefined && event.from !== -1 && (!Number.isInteger(event.from) || event.from < 0 || event.from > 3 || event.from === event.pid)) throw Error('Invalid finish source');
        const method = event.method || (event.from >= 0 ? 'discard' : 'selfDraw');
        if (method === 'selfDraw' && event.from >= 0) throw Error('Self draw cannot have a discarder');
        let curseItems = null;
        if (
          event.pid !== undefined &&
          event.pid !== null &&
          event.reason !== "draw" &&
          event.reason !== "defeat"
        ) {
          let skill;
          if (event.flowerKind) {
            if (!['seven', 'sevenRobOne', '七搶一', 'eight', '八仙過海'].includes(event.flowerKind)) throw Error('Invalid flower finisher');
            const kind =
              event.flowerKind === "seven" ||
              event.flowerKind === "sevenRobOne" ||
              event.flowerKind === "七搶一"
                ? "seven"
                : "eight";
            skill = Skills.get("formation." + kind);
            curseItems = [{ id: kind }];
          } else if (event.items !== undefined) {
            skill = Finishers.build(event.items, event.fan, method, actor(state, event.pid), state.monster, target(state) === event.pid);
            curseItems = event.items;
          } else {
            skill = copy(Skills.get("finish.hu"));
            skill.effects[0].amount = Math.min(
              1500,
              300 + 60 * Math.max(0, Number(event.fan) || 0),
            );
          }
          const ctx = cast(state, event.pid, skill, output);
          finishKill(state, ctx, output, true);
          const parts = output.filter(e => e.type === 'finisherPart').map(part => ({
            id: part.segmentId, name: part.name, label: part.label, fan: part.fan, budget: part.budget,
            damage: output.filter(e => e.type === 'damage' && e.segmentId === part.segmentId && e.pid === event.pid).reduce((n, e) => n + e.amount, 0)
          }));
          if (!parts.length) parts.push({ id: event.flowerKind ? curseItems[0].id : 'legacy', name: skill.name, label: event.flowerKind || '舊版終式', fan: Number(event.fan) || 0, budget: 0, damage: output.filter(e => e.type === 'damage' && e.pid === event.pid && e.segmentId !== 'followup' && e.segmentId !== 'equipment').reduce((n, e) => n + e.amount, 0) });
          const followDamage = output.filter(e => e.type === 'damage' && e.segmentId === 'followup').reduce((n, e) => n + e.amount, 0);
          if (followDamage) parts.push({ id: 'followup', name: '既有增益追擊', label: '追擊', fan: 0, budget: 0, damage: followDamage });
          const equipmentDamage = output.filter(e => e.type === 'damage' && e.segmentId === 'equipment').reduce((n,e) => n+e.amount,0);
          if (equipmentDamage) parts.push({id:'equipment',name:'裝備追加',label:'裝備',fan:0,budget:0,damage:equipmentDamage});
          state.finisher = { pid: event.pid, from: event.from ?? -1, method, parts, total: parts.reduce((n, p) => n + p.damage, 0) };
          if (curseItems && event.from >= 0 && method !== 'selfDraw') actor(state, event.from).pendingSeals = Finishers.curses(curseItems);
        }
        state.ended = true;
        state.enemyDue = null;
        state.result = {
          reason: event.reason || "hu",
          huPid: event.pid === undefined ? null : event.pid,
          ranking: ranking(state),
        };
        emit(state, output, { type: "end", reason: state.result.reason });
        break;
      }
      default:
        throw new Error("Unknown combat event " + event.type);
    }
    if(event.type!=='enemy')afterItems(state,output);
    if (!state.ended && state.players.every((p) => p.hp === 0)) {
      state.ended = true;
      state.enemyDue = null;
      state.result = { reason: "defeat", huPid: null, ranking: ranking(state) };
      emit(state, output, { type: "end", reason: "defeat" });
    }
    if (state.ended && state.version >= 2) settleJourney(state);
    if (state.ended && state.version === 3) Economy.settle(state);
    if (state.ended) for (const p of state.players) {
      if (p.activeSeals?.length) p.expiredSeals = copy(p.activeSeals);
      if (p.activeSeals) p.activeSeals = [];
    }
    validate(state);
    return { state, effects: output };
  }
  // Saves are untrusted: reject malformed nested effects before any event runs.
  function validate(state) {
    const fail = (label) => {
      throw new Error("Invalid cultivation " + label);
    };
    const number = (v, min = 0, max = MAX_DAMAGE) =>
      typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
    const int = (v, min = 0, max = MAX_DAMAGE) =>
      number(v, min, max) && Number.isInteger(v);
    const pid = (v) => int(v, 0, 3);
    // V2 retains credit for the entire journey, up to the encounter-ID bound.
    const killLimit = state?.version >= 2 ? 1000000 : 1000;
    const equipmentNodes = state?.version === 3 && Array.isArray(state.players) ? state.players.reduce((n,p) => n + (p?.economy?.inventory?.length || 0) * 12 + (p?.economy?.receipts?.length || 0) * 80 + (p?.economy?.creditedKills?.length || 0) * 2 + (p?.economy?.settledHands?.length || 0) * 2, 0) : 0;
    const nodeLimit = 30000 + equipmentNodes + (state?.version >= 2 && Array.isArray(state.kills) ? Math.min(killLimit, state.kills.length) * 12 : 0);
    let nodes = 0;
    function json(value, depth = 0) {
      if (++nodes > nodeLimit || depth > 12) fail("save size");
      if (value === null || typeof value === "boolean") return;
      if (typeof value === "number") {
        if (!Number.isFinite(value)) fail("nonfinite value");
        return;
      }
      if (typeof value === "string") {
        if (value.length > 1000) fail("text length");
        return;
      }
      if (
        typeof value !== "object" ||
        (Object.getPrototypeOf(value) !== Object.prototype &&
          !Array.isArray(value))
      )
        fail("non-JSON value");
      for (const [key, item] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          fail("unsafe field");
        json(item, depth + 1);
      }
    }
    json(state);
    if (
      !state ||
      ![1, 2, 3].includes(state.version) ||
      !int(state.seq) ||
      !int(state.rng, 1, 4294967295)
    )
      fail("state header");
    if (!Array.isArray(state.players) || state.players.length !== 4)
      fail("players");
    const scaleSources = new Set([
      "missingHp",
      "enemyMissingRatio",
      "lastBlocked",
      "lastAbsorbed",
      "armorLost",
      "debuffCount",
      "damageTaken",
      "shield",
      "aggro",
      "lastHeal",
      "lastCleanse",
      "ownDamageSinceMark",
      "ownHitsSinceMark",
      "shieldAbsorbed",
    ]);
    function statusCheck(status, owner, isMonster) {
      if (!status || typeof status.kind !== "string") fail("status kind");
      const kinds = isMonster
        ? new Set([
            "armor",
            "attack",
            "vulnerable",
            "burn",
            "flow",
            "poison",
            "attackUp",
            "defenseUp",
            "sealPending",
            ...(state.monsterSkillVersion===1?['monsterRiposte']:[]),
          ])
        : new Set([...BUFFS, "mark", "burn", "flow", "poison", ...(state.version >= 2 ? ["healingDown", "shieldGainDown"] : []), ...(state.monsterSkillVersion===1?['monsterAggroUp']:[])]);
      if (!kinds.has(status.kind)) fail("unknown status");
      if (status.op === "dot") {
        if (
          !isMonster ||
          !["burn", "flow", "poison"].includes(status.kind) ||
          !pid(status.owner) ||
          !number(status.amount, 0, 10000) ||
          !int(status.ticks, 1, 10)
        )
          fail("DoT status");
        if (status.passiveBonus !== undefined || status.passiveBonusTicks !== undefined) {
          if (state.version < 2 || !number(status.passiveBonus, 0, 25) || !int(status.passiveBonusTicks, 0, 10) ||
              !passive(state.players[status.owner], "chi-ling") || (status.passiveBonusTicks === 0 && status.passiveBonus !== 0)) fail("passive DoT bonus");
        }
      } else if (!int(status.duration, 1, 100)) fail("status duration");
      if (
        status.owner !== undefined &&
        (!pid(status.owner) || (!isMonster && status.owner !== owner))
      )
        fail("status owner");
      if (status.value !== undefined && !number(status.value, 0, 10000))
        fail("status value");
      if(status.monsterSkill!==undefined && (state.monsterSkillVersion!==1 || status.monsterSkill!==true || !status.negative || !int(status.monsterId,1) || !['fragile','healingDown','shieldGainDown','burn','monsterAggroUp'].includes(status.kind)))fail('monster ailment');
      if (status.kind === "healingDown" && (state.monsterSkillVersion===1 ? !number(status.value,0,.15)||status.duration>2 : status.value !== 0.05 || status.duration > 1)) fail("healing penalty");
      if (status.kind === "shieldGainDown" && (state.monsterSkillVersion===1 ? !number(status.value,0,.15)||status.duration>2 : status.value !== 0.08 || status.duration > 2)) fail("shield penalty");
      if(status.kind==='monsterAggroUp'&&(!status.monsterSkill||!number(status.value,0,.15)||status.duration>2))fail('monster threat penalty');
      if(status.kind==='monsterRiposte'&&(!isMonster||status.value!==30||status.duration>2))fail('monster riposte');
      if (status.amount !== undefined && !number(status.amount, 0, 10000))
        fail("status amount");
      if (status.charges !== undefined && !int(status.charges, 1, 100))
        fail("status charges");
      if (
        status.element !== undefined &&
        !ELEMENTS.includes(status.element) &&
        status.element !== "neutral"
      )
        fail("status element");
      if (
        status.scale &&
        (!scaleSources.has(status.scale.source) ||
          !number(status.scale.ratio, 0, 10000) ||
          !number(status.scale.cap, 0, 10000))
      )
        fail("status scale");
      for (const field of ["startDamage", "startHits", "startAbsorbed"])
        if (status[field] !== undefined && !number(status[field]))
          fail("status snapshot");
      for (const field of ['startEquipmentDamage','startEquipmentHits'])
        if (status[field] !== undefined && (state.version !== 3 || !int(status[field]))) fail('equipment snapshot');
      if (
        status.kind === "mark" &&
        (!["enemyAfterAttack", "enemySingleOther"].includes(status.trigger) ||
          status.monsterId !== state.monster.id ||
          !pid(status.owner))
      )
        fail("delayed mark");
      if (status.kind === "mark" && status.passiveBonus !== undefined &&
          (state.version < 2 || !number(status.passiveBonus, 0, 25) || !passive(state.players[owner], "chi-ling"))) fail("passive mark bonus");
      if (status.negative !== undefined && typeof status.negative !== "boolean")
        fail("status sign");
      for (const field of ["current", "penetration", "shieldRatio", "threshold", "cap", "heal"])
        if (status[field] !== undefined && !number(status[field], 0, 10000))
          fail("status number");
      if (status.control !== undefined && status.control !== "delay")
        fail("status control");
      if (
        status.trigger !== undefined &&
        !["attackSkill", "enemyAfterAttack", "enemySingleOther"].includes(status.trigger)
      )
        fail("status trigger");
      if (status.fromCharge !== undefined && typeof status.fromCharge !== "boolean")
        fail("status origin");
      if (
        status.when !== undefined &&
        ![
          "fullHp",
          "notFullHp",
          "lowHp",
          "notLowHp",
          "topAggro",
          "notTopAggro",
          "weak",
          "notWeak",
          "hadNextDamage",
          "hadDamageBoost",
          "aoe",
          "single",
          "direct",
          "healed",
        ].includes(status.when)
      )
        fail("status condition");
      if (
        status.debuff &&
        (!["armor", "attack", "vulnerable"].includes(status.debuff.kind) ||
          !number(status.debuff.value, 0, 1) ||
          !int(status.debuff.duration, 1, 10))
      )
        fail("mark debuff");
    }
    const flowers = [];
    if (state.handNumber !== undefined && !int(state.handNumber, 1, 1000000)) fail('hand number');
    const characterIds = new Set();
    if (state.version >= 2) validateJourney(state, fail, number, int);
    if (state.version === 3) Economy.validate(state);
    for (let index = 0; index < 4; index++) {
      const p = state.players[index];
      if (p?.characterId !== undefined) {
        if (typeof p.characterId !== 'string' || p.characterId.length > 64 || !p.characterId.length || characterIds.has(p.characterId)) fail('character identity');
        characterIds.add(p.characterId);
      }
      for (const field of ['activeSeals', 'pendingSeals', 'expiredSeals']) if (p?.[field] !== undefined) Finishers.validateSeals(p[field]);
      if (!state.ended && p?.pendingSeals?.length) fail('premature pending seals');
      if (state.ended && p?.activeSeals?.length) fail('unexpired seals');
      if (
        !p ||
        p.pid !== index ||
        // Saves from before per-hero life keep 1,000 until their hand ends.
        ![1000, state.version >= 2 && Heroes.get(p.heroId)?.hp].includes(p.maxHp) ||
        !number(p.hp, 0, p.maxHp) ||
        !number(p.shield, 0, 1000) ||
        !int(p.shieldTurns, 0, 100) ||
        !number(p.shieldAbsorbed) ||
        !number(p.damage) ||
        !number(p.aggro) ||
        !int(p.weakDiscards, 0, 1) ||
        p.weak !== (p.hp === 0) ||
        !int(p.weakCount) ||
        !number(p.damageTaken) ||
        !int(p.hits)
      )
        fail("player " + index);
      if (!Array.isArray(p.statuses) || p.statuses.length > 100)
        fail("player statuses");
      for (const status of p.statuses) statusCheck(status, index, false);
      if (
        !Array.isArray(p.flowers) ||
        p.flowers.some((k) => !/^H[1-8]$/.test(k))
      )
        fail("flowers");
      flowers.push(...p.flowers);
      if (
        !Array.isArray(p.formations) ||
        p.formations.some((k) => !["seasons", "gentlemen"].includes(k)) ||
        new Set(p.formations).size !== p.formations.length
      )
        fail("formations");
      for (const formation of p.formations) {
        const required =
          formation === "seasons"
            ? ["H1", "H2", "H3", "H4"]
            : ["H5", "H6", "H7", "H8"];
        if (!required.every((k) => p.flowers.includes(k)))
          fail("formation ownership");
      }
    }
    if (new Set(flowers).size !== flowers.length) fail("duplicate flower");
    const m = state.monster;
    if (
      !m ||
      !int(m.id, 1, 1000000) ||
      m.index !== m.id ||
      !ELEMENTS.includes(m.element) ||
      typeof m.name !== "string" ||
      !number(m.maxHp, 1, 100000000) ||
      !number(m.hp, 0, m.maxHp) ||
      !number(m.shield, 0, 10000) ||
      !number(m.armor, 0, 1)
    )
      fail("monster");
    if (!Array.isArray(m.statuses) || m.statuses.length > 100)
      fail("monster statuses");
    for (const status of m.statuses) statusCheck(status, null, true);
    const a = m.nextAttack;
    if(state.monsterSkillVersion!==undefined && (state.version<2 || ![0,1].includes(state.monsterSkillVersion)))fail('monster skill version');
    if(state.damageVariance!==undefined && (state.damageVariance!==1 || !int(state.damageRng,1,4294967295)))fail('damage variance');
    if(state.monsterSkillVersion===1){
      const skill=MonsterSkills.get(a?.skillId);
      const validAction=a && (a.actionNumber===m.attacks+1 || (state.ended&&a.actionNumber===m.attacks));
      if(!a || (a.skillId!==null && (!skill || skill.speciesId!==m.speciesId)) || a.monsterId!==m.id ||
        !int(a.actionNumber,1) || !validAction || typeof a.sealed!=='boolean')fail('monster skill forecast');
    }
    if (
      !a ||
      !["single", "all"].includes(a.type) ||
      !number(a.damage, 0, 100000000) ||
      !["charged", "cancelled", "controlUsed", "sealAilment"].every(
        (k) => typeof a[k] === "boolean",
      ) ||
      (a.ailment !== null && !["burn", "poison", "fragile"].includes(a.ailment))
    )
      fail("attack telegraph");
    if (
      !Array.isArray(state.bag) ||
      state.bag.length > 4 ||
      state.bag.some((x) => !ELEMENTS.includes(x)) ||
      new Set(state.bag).size !== state.bag.length
    )
      fail("monster bag");
    if (
      !int(state.discardCount, -1, 100) ||
      (state.enemyDue !== null && state.enemyDue !== m.id) ||
      (state.enemyDue !== null && state.discardCount < 4)
    )
      fail("attack clock");
    if (
      typeof state.ended !== "boolean" ||
      !Array.isArray(state.kills) ||
      state.kills.length > killLimit ||
      !Array.isArray(state.log) ||
      state.log.length > 120
    )
      fail("flow");
    const killed = new Set();
    for (const kill of state.kills) {
      if (
        !int(kill.monsterId, 1, m.id) ||
        killed.has(kill.monsterId) ||
        !pid(kill.pid) ||
        !int(kill.seq, 1, state.seq) ||
        !ELEMENTS.includes(kill.element)
      )
        fail("kill credit");
      killed.add(kill.monsterId);
    }
    for (const entry of state.log)
      if (
        !entry ||
        !int(entry.seq, 1, state.seq) ||
        !int(entry.monsterId, 1, m.id) ||
        typeof entry.type !== "string" ||
        (entry.pid !== undefined && !pid(entry.pid))
      )
        fail("log");
    if (state.finisher !== undefined) {
      const f = state.finisher;
      if (!state.ended || !f || !pid(f.pid) || !['discard', 'selfDraw', 'robKong'].includes(f.method) ||
          !(f.from === -1 || (pid(f.from) && f.from !== f.pid)) ||
          (f.method === 'selfDraw' && f.from !== -1) || !Array.isArray(f.parts) || !f.parts.length || f.parts.length > 42 || !int(f.total)) fail('finisher result');
      const ids = new Set();
      for (const part of f.parts) {
        if (!part || (!Finishers.get(part.id) && !['legacy','followup',...(state.version === 3 ? ['equipment'] : [])].includes(part.id)) || ids.has(part.id) ||
            typeof part.name !== 'string' || part.name.length > 100 || typeof part.label !== 'string' || part.label.length > 100 ||
            !int(part.fan) || !int(part.budget) || !int(part.damage)) fail('finisher segment');
        ids.add(part.id);
      }
      if (f.parts.reduce((n,p) => n + p.damage, 0) !== f.total) fail('finisher sum');
    }
    if (state.ended) {
      const r = state.result;
      if (
        !r ||
        !["defeat", "draw", "hu"].includes(r.reason) ||
        (r.huPid !== null && !pid(r.huPid)) ||
        JSON.stringify(r.ranking) !== JSON.stringify(ranking(state))
      )
        fail("settlement");
    } else if (state.result !== null || m.hp === 0)
      fail("unfinished settlement");
    return true;
  }
  function estimate(state, pid, skill) {
    if (!skill) return 0;
    const before = actor(state, pid);
    const simulated = copy(state);
    const effects = [];
    cast(simulated, pid, skill, effects);
    const after = actor(simulated, pid);
    const danger = target(state) === pid ? 1.5 : 1;
    const aggroValue = (before.aggro - after.aggro) * 0.015;
    let nextSkillValue = 0;
    if (simulated.monster.hp > 0 && skill.effects.some(effect => effect.op === 'buff' &&
      ['nextDamage','nextFlatDamage','nextFollowup','nextPenetration','nextLifesteal',
        'aggroRate','rampDamage','damageUp','penetration','followup','execute'].includes(effect.kind))) {
      // A public, fixed-size future attack estimates setup value, not future draws.
      // Discount uncertain availability; identical existing buffs cancel out.
      const futureGain = candidate => {
        const forecast = copy(candidate), start = actor(forecast, pid);
        const damage = start.damage, hp = start.hp, shield = start.shield, aggro = start.aggro;
        cast(forecast, pid, { id: 'estimate-next', element: 'neutral', effects: [{op:'damage',amount:200}] }, []);
        const end = actor(forecast, pid);
        return end.damage - damage + (end.hp - hp) * (0.4 + (1 - before.hp / before.maxHp)) * danger
          + (end.shield - shield) * .35 * danger - (end.aggro - aggro) * .015;
      };
      nextSkillValue = .75 * (futureGain(simulated) - futureGain(state));
    }
    let reference = before;
    let projected = after;
    if (simulated.monster.hp > 0) {
      // Compare one publicly telegraphed attack with/without the skill. This
      // includes DoTs, marks, counters and saved HP without reading any hands
      // or future draws. Copies keep gameplay RNG, logs and timers untouched.
      const forecast = (candidate) => {
        candidate.seq++;
        candidate.discardCount = 4;
        candidate.enemyDue = candidate.monster.id;
        enemy(candidate, []);
        return actor(candidate, pid);
      };
      reference = forecast(copy(state));
      projected = forecast(simulated);
    }
    // Value only public monster penalties. This gives cleanse/status protection a
    // modest benefit without assuming future tiles or another player's hand.
    const penalty = player => state.monsterSkillVersion!==1 ? 0 : player.statuses.filter(s=>s.monsterSkill).reduce((total,s)=>{
      const turns=Math.min(2,s.duration || 0),value=s.value || 0;
      return total + turns * (s.kind==='burn' ? value*.6 : s.kind==='fragile' ? value*state.monster.nextAttack.damage*.4 :
        ['healingDown','shieldGainDown'].includes(s.kind) ? value*60 : s.kind==='monsterAggroUp' ? value*Math.min(player.aggro,300)*.015 : 0);
    },0);
    return (
      projected.damage -
      reference.damage +
      (projected.hp - reference.hp) * (0.4 + (1 - before.hp / before.maxHp)) * danger +
      (projected.shield - reference.shield) * 0.35 * danger +
      aggroValue + nextSkillValue + penalty(reference) - penalty(projected)
    );
  }
  const api = Object.freeze({
    create,
    prepare,
    journeyPreview,
    apply,
    validate,
    ranking,
    target,
    // AI and previews value skills at the average roll so their choices do not wobble.
    estimate: (...args) => withDamageRoll(1, () => estimate(...args)),
    withDamageRoll,
    damageRollRange: Object.freeze([DAMAGE_ROLL_MIN, DAMAGE_ROLL_MAX]),
    tileElement,
    elementMultiplier,
    statusLabels: Object.freeze(
      Object.assign(LABELS, {
        absorbedToNext: "吸收蓄力",
        sealPending: "封印待命",
        onHitShield: "受擊化盾",
        onHitHeal: "受擊回復",
        armor: "破甲",
        attack: "降攻",
        nextFlatDamage: "蓄力傷害",
        nextMark: "炎印追擊",
        lifestealOverflow: "吸血化盾",
        guardCounter: "格擋反擊",
        mark: "延遲秘術",
        healingDown: "治療降低",
        shieldGainDown: "護盾取得降低",
        monsterAggroUp: "引妖",
        monsterRiposte: "逆刃劍罡",
      }),
    ),
  });
  root.MahjongCultivationCombat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
