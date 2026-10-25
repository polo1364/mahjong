const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../cultivation-combat.js");
const Skills = require("../cultivation-skills.js");
const clone = (value) => JSON.parse(JSON.stringify(value));
function send(state, event) {
  return C.apply(state, { id: state.seq + 1, ...event }).state;
}
function fixture() {
  const s = C.create(123);
  s.monster.element = "earth";
  s.monster.armor = 0.15;
  s.monster.hp = s.monster.maxHp = 20000;
  s.monster.shield = 0;
  s.monster.nextAttack = {
    type: "single",
    charged: true,
    damage: 240,
    ailment: "burn",
    cancelled: false,
    controlUsed: false,
    sealAilment: false,
  };
  return s;
}
function eventFor(skill, pid = 0) {
  if (skill.action === "finish") return { type: "finish", pid, fan: 5 };
  if (skill.action === "formation") {
    if (["seven", "eight"].includes(skill.combo))
      return { type: "finish", pid, flowerKind: skill.combo };
    return {
      type: "flower",
      pid,
      key: skill.id === "formation.seasons" ? "H4" : "H8",
    };
  }
  if (skill.action === "flower")
    return { type: "flower", pid, key: skill.combo };
  if (["W", "T", "B"].includes(skill.family))
    return {
      type: "meld",
      pid,
      action: skill.action,
      keys: [...skill.combo].map((n) => skill.family + n),
    };
  return { type: "meld", pid, action: skill.action, key: skill.combo };
}
function cast(state, id, pid = 0) {
  return send(state, eventFor(Skills.get(id), pid));
}
function due(state, type = "single", amount = 160) {
  state.enemyDue = state.monster.id;
  state.discardCount = 4;
  state.monster.nextAttack = {
    type,
    charged: false,
    damage: amount,
    ailment: null,
    cancelled: false,
    controlUsed: false,
    sealAilment: false,
  };
  return state;
}
function status(state, kind, pid = 0) {
  return state.players[pid].statuses.find((s) => s.kind === kind);
}

test("catalog has all 169 combinations and one Hu finisher, with unique names", () => {
  assert.equal(Skills.all.length, 170);
  assert.equal(new Set(Skills.all.map((s) => s.name)).size, 170);
});
for (const skill of Skills.all)
  test("skill effect contract: " + skill.id + " " + skill.name, () => {
    let s = fixture();
    const p = s.players[0];
    p.hp = 350;
    p.shield = 200;
    p.shieldTurns = 6;
    p.aggro = 400;
    p.damageTaken = 300;
    s.players[1].aggro = 500;
    p.statuses = [
      { kind: "burn", negative: true, duration: 3, value: 40 },
      { kind: "fragile", negative: true, duration: 3, value: 0.2 },
      { kind: "nextDamage", duration: 5, value: 0.5, charges: 1 },
    ];
    s.monster.statuses = [
      { kind: "armor", value: 0.25, duration: 3 },
      {
        op: "dot",
        kind: "burn",
        owner: 0,
        element: "fire",
        amount: 60,
        ticks: 3,
      },
      {
        op: "dot",
        kind: "poison",
        owner: 0,
        element: "wood",
        amount: 60,
        ticks: 3,
      },
      { kind: "attackUp", value: 0.2, duration: 3 },
      { kind: "defenseUp", value: 0.2, duration: 3 },
    ];
    if (skill.id === "formation.seasons") p.flowers = ["H1", "H2", "H3"];
    if (skill.id === "formation.gentlemen") p.flowers = ["H5", "H6", "H7"];
    const before = clone(s);
    let result = C.apply(s, { id: 1, ...eventFor(skill) });
    if (result.state.players[0].pendingFlowerSkills?.length) {
      const turn = C.apply(result.state, { id: result.state.seq + 1, type: 'turn', pid: 0 });
      result = { state: turn.state, effects: [...result.effects, ...turn.effects] };
    }
    const after = result.state;
    assert.deepEqual(s, before, "reducer must not mutate original state");
    assert.equal(C.validate(after), true);
    assert.ok(
      result.effects.some((e) => e.type === "skill" && e.skillId === skill.id),
      "correct skill dispatched",
    );
    assert.notDeepEqual(
      { p: after.players[0], m: after.monster, d: after.discardCount },
      { p: before.players[0], m: before.monster, d: before.discardCount },
      "skill changes relevant combat state",
    );
    for (let pid = 1; pid < 4; pid++) {
      assert.equal(
        after.players[pid].hp,
        before.players[pid].hp,
        "no teammate healing",
      );
      assert.equal(
        after.players[pid].shield,
        before.players[pid].shield,
        "no teammate shields",
      );
      assert.equal(
        after.players[pid].damage,
        0,
        "damage credited only to caster",
      );
    }
    const declared = skill.effects;
    for (const e of declared.filter((e) => e.op === "buff"))
      assert.ok(
        after.players[0].statuses.some((x) => x.kind === e.kind),
        "buff " + e.kind + " must exist",
      );
    for (const e of declared.filter((e) => e.op === "dot"))
      assert.ok(
        after.monster.statuses.some(
          (x) => x.kind === e.kind && x.owner === 0 && x.ticks === e.ticks,
        ),
        "own DoT must exist",
      );
    if (declared.some((e) => e.op === "heal"))
      assert.ok(
        after.players[0].hp > before.players[0].hp,
        "healing changes HP",
      );
    if (declared.some((e) => e.op === "shield" && e.amount > 0))
      assert.ok(
        after.players[0].shield > before.players[0].shield,
        "shield changes protection",
      );
    if (declared.some((e) => e.op === "damage" || e.op === "convert"))
      assert.ok(
        after.players[0].damage > 0,
        "attack contributes damage ranking",
      );
  });

test("damage multiplier is five-element countercycle, neutral otherwise", () => {
  for (const [a, b] of [
    ["metal", "wood"],
    ["wood", "earth"],
    ["earth", "water"],
    ["water", "fire"],
    ["fire", "metal"],
  ]) {
    assert.equal(C.elementMultiplier(a, b), 1.25);
    assert.equal(C.elementMultiplier(b, a), 0.8);
    assert.equal(C.elementMultiplier(a, a), 1);
  }
});
test("seeded snapshots, resume and replay produce identical states", () => {
  let a = C.create(42),
    b = C.create(42);
  for (let i = 0; i < 24; i++) {
    const ev = { type: "discard", pid: i % 4, key: "W1" };
    a = send(a, ev);
    b = send(clone(b), ev);
    if (a.enemyDue) {
      a = send(a, { type: "enemy" });
      b = send(b, { type: "enemy" });
    }
  }
  assert.deepEqual(a, b);
  const duplicate = C.apply(a, {
    id: a.seq,
    type: "discard",
    pid: 0,
    key: "W1",
  });
  assert.deepEqual(duplicate.state, a);
  assert.deepEqual(duplicate.effects, []);
  assert.throws(() => C.apply(a, { id: a.seq + 2, type: "enemy" }), /gap/);
});
test("four committed discards queue enemy; meld and flowers do not advance clock", () => {
  let s = fixture();
  s = cast(s, "W.chow.123");
  s = cast(s, "H1.flower");
  assert.equal(s.discardCount, 0);
  for (let i = 0; i < 4; i++)
    s = send(s, { type: "discard", pid: i, key: "T1" });
  assert.equal(s.enemyDue, s.monster.id);
  assert.ok(s.players.every((p) => p.hp === 1000));
  s = send(s, { type: "enemy" });
  assert.equal(s.enemyDue, null);
  assert.equal(s.discardCount, 0);
  assert.ok(s.players.some((p) => p.hp < 1000));
});
test("highest aggro gets single attack; tie uses lowest seat; weak excluded", () => {
  let s = fixture();
  s.players[2].aggro = 200;
  s.players[1].aggro = 200;
  assert.equal(C.target(s), 1);
  s = send(due(s), { type: "enemy" });
  assert.equal(s.players[1].hp, 840);
  assert.equal(s.players[2].hp, 1000);
  s.players[1].hp = 0;
  s.players[1].weak = true;
  assert.equal(C.target(s), 2);
});
test("AOE is atomic before counter damage; guards can avert total defeat", () => {
  let s = fixture();
  for (const p of s.players) p.hp = 20;
  s = cast(s, "W.concealed.4444", 3);
  s = send(due(s, "all", 100), { type: "enemy" });
  assert.deepEqual(
    s.players.map((p) => p.hp),
    [0, 0, 0, 300],
  );
  assert.equal(s.ended, false);
  let other = fixture();
  other.players.forEach((p) => (p.hp = 20));
  other = send(due(other, "all", 100), { type: "enemy" });
  assert.equal(other.result.reason, "defeat");
  assert.equal(other.ended, true);
});
test("weak halves damage, recovers only after two own discards; healing revives early", () => {
  let s = fixture();
  s.players[0].hp = 0;
  s.players[0].weak = true;
  const normal = send(fixture(), { type: "discard", pid: 0, key: "W1" });
  s = send(s, { type: "discard", pid: 0, key: "W1" });
  assert.ok(Math.abs(s.players[0].damage - normal.players[0].damage / 2) <= 1);
  assert.equal(s.players[0].hp, 0);
  s = send(s, { type: "discard", pid: 1, key: "W1" });
  assert.equal(s.players[0].weakDiscards, 1);
  s = send(s, { type: "discard", pid: 0, key: "W1" });
  assert.equal(s.players[0].hp, 300);
  let early = fixture();
  early.players[0].hp = 0;
  early.players[0].weak = true;
  early = cast(early, "FE.pong");
  assert.ok(early.players[0].hp > 0);
  assert.equal(early.players[0].weak, false);
});
test("healing without an attack effect does not create damage or aggro", () => {
  let s = fixture();
  s.players[0].hp = 500;
  s = cast(s, "T.pong.666");
  assert.ok(s.players[0].hp > 500);
  assert.equal(s.players[0].damage, 0);
  assert.equal(s.players[0].aggro, 0);
});
test("overkill full combo scores; lifesteal uses actual HP and switches once after combo", () => {
  let s = fixture();
  s.monster.hp = 1;
  s.players[0].hp = 500;
  s = cast(s, "W.exposed.4444");
  assert.equal(s.players[0].hp, 501);
  assert.ok(s.players[0].damage > 100);
  assert.equal(s.kills.length, 1);
  assert.equal(s.kills[0].pid, 0);
  assert.equal(s.monster.id, 2);
  assert.ok(s.players.every((p) => p.aggro === 0));
  assert.equal(s.discardCount, 0);
  let multi = fixture();
  multi.monster.hp = 1;
  multi = cast(multi, "B.chow.123");
  assert.equal(multi.kills.length, 1);
  assert.equal(multi.players[0].hits, 3);
});
test("new monsters clear old due, dots and delayed marks; keep accumulated score and kill reward buffs", () => {
  let s = fixture();
  s = cast(s, "W.concealed.1111");
  s = cast(s, "W.chow.123");
  s = due(s);
  s.monster.hp = 1;
  const before = s.players[0].damage;
  s = cast(s, "W.added.9999");
  assert.equal(s.monster.id, 2);
  assert.equal(s.enemyDue, null);
  assert.equal(s.monster.statuses.length, 0);
  assert.ok(!s.players[0].statuses.some((x) => x.kind === "mark"));
  assert.ok(status(s, "nextDamage"));
  assert.ok(s.players[0].damage > before);
});
test("basic attacks do not consume next skill buffs; one whole skill consumes once", () => {
  let s = fixture();
  s = cast(s, "W.chow.345");
  s = send(s, { type: "discard", pid: 0, key: "W1" });
  assert.ok(status(s, "nextDamage"));
  const before = s.players[0].damage;
  s = cast(s, "B.chow.123");
  assert.ok(!status(s, "nextDamage"));
  const plain = cast(fixture(), "B.chow.123");
  assert.ok(s.players[0].damage - before > plain.players[0].damage);
});
test("attack branches use pre-cast aggro/health; not duplicated after first hit", () => {
  let s = fixture();
  s.players[1].aggro = 1;
  s = cast(s, "W.added.6666");
  assert.equal(s.players[0].hits, 1);
  let full = cast(fixture(), "T.chow.789");
  assert.equal(full.players[0].hits, 1);
  let wounded = fixture();
  wounded.players[0].hp = 950;
  wounded = cast(wounded, "T.chow.789");
  assert.equal(wounded.players[0].hits, 1);
  assert.equal(wounded.players[0].hp, 1000);
});
test("shared armor debuff benefits actual attacker without transferring score", () => {
  let s = fixture();
  s = cast(s, "W.chow.234", 0);
  const origin = s.players[0].damage;
  s = cast(s, "W.chow.789", 1);
  const plain = cast(fixture(), "W.chow.789", 1);
  assert.ok(s.players[1].damage > plain.players[1].damage);
  assert.equal(s.players[0].damage, origin);
});
test("dots are per owner, trigger once per enemy action and maintain attribution", () => {
  let s = fixture();
  s = cast(s, "W.pong.111", 0);
  s = cast(s, "W.pong.111", 1);
  assert.equal(s.monster.statuses.filter((x) => x.kind === "burn").length, 2);
  s = send(due(s), { type: "enemy" });
  assert.ok(s.players[0].damage > 0);
  assert.equal(s.players[0].damage, s.players[1].damage);
  assert.ok(s.monster.statuses.every((x) => x.ticks === 2));
});
test("detonating DoT consumes only owner remaining ticks exactly once", () => {
  let s = fixture();
  s = cast(s, "W.pong.111", 0);
  s = cast(s, "W.pong.111", 1);
  s = cast(s, "W.exposed.1111", 0);
  assert.ok(
    !s.monster.statuses.some((x) => x.kind === "burn" && x.owner === 0),
  );
  assert.ok(s.monster.statuses.some((x) => x.kind === "burn" && x.owner === 1));
  assert.ok(s.players[0].damage > 200);
});
test("counter and followup do not recursively chase or consume next-skill buff", () => {
  let s = fixture();
  s = cast(s, "W.exposed.7777");
  s = cast(s, "W.chow.345");
  const before = s.players[0].hits;
  s = send(due(s), { type: "enemy" });
  assert.equal(s.players[0].hits, before + 1);
  assert.ok(status(s, "nextDamage"));
  assert.ok(!status(s, "counter"));
  s = cast(s, "B.exposed.9999");
  const beforeAttack = s.players[0].hits;
  s = cast(s, "W.chow.789");
  assert.equal(s.players[0].hits, beforeAttack + 2);
});
test("shield-end attack fires on expiry using accumulated damage; breaking fires once", () => {
  let s = fixture();
  s = cast(s, "B.concealed.9999");
  for (let i = 0; i < 3; i++)
    s = send(s, { type: "discard", pid: 0, key: "W1" });
  assert.equal(s.players[0].shield, 0);
  assert.equal(s.players[0].hits, 4);
  assert.ok(!status(s, "shieldEndDamage"));
  let broken = cast(fixture(), "W.pong.555");
  const before = broken.players[0].hits;
  broken = send(due(broken, "single", 200), { type: "enemy" });
  assert.equal(broken.players[0].hits, before + 1);
  assert.ok(!status(broken, "shieldBreakDamage"));
});
test("control extends current clock at most once, seal downgrades charged, interrupt cancels", () => {
  let s = due(fixture());
  s = cast(s, "T.added.3333");
  assert.equal(s.discardCount, 3);
  assert.equal(s.enemyDue, null);
  s = cast(s, "T.added.3333");
  assert.equal(s.discardCount, 3);
  s = send(s, { type: "discard", pid: 0, key: "W1" });
  assert.equal(s.enemyDue, s.monster.id);
  let seal = fixture();
  seal = cast(seal, "T.exposed.3333");
  assert.equal(seal.monster.nextAttack.charged, false);
  assert.equal(seal.monster.nextAttack.damage, 160);
  let interrupt = fixture();
  interrupt.enemyDue = 1;
  interrupt.discardCount = 4;
  interrupt = cast(interrupt, "T.chow.678");
  const health = interrupt.players.map((p) => p.hp);
  interrupt = send(interrupt, { type: "enemy" });
  assert.deepEqual(
    interrupt.players.map((p) => p.hp),
    health,
  );
});
test("frozen counter delays subsequent attack, not attack already being resolved", () => {
  let s = cast(fixture(), "T.concealed.3333");
  s = send(due(s), { type: "enemy" });
  assert.equal(s.players[0].hp, 840);
  assert.equal(s.discardCount, -1);
  assert.equal(s.monster.nextAttack.controlUsed, true);
});
test("guard-based reflection uses actual blocked damage", () => {
  let s = cast(fixture(), "B.concealed.3333");
  s = send(due(s, "single", 200), { type: "enemy" });
  assert.equal(s.players[0].hp, 1000);
  assert.ok(s.players[0].damage >= 100);
  assert.ok(!status(s, "guardCounter"));
});
test("status guard blocks one ailment, heals or retaliates with ownership", () => {
  let s = fixture();
  s.players[0].hp = 500;
  s = cast(s, "T.concealed.6666");
  s.enemyDue = 1;
  s.discardCount = 4;
  s = send(s, { type: "enemy" });
  assert.ok(!s.players[0].statuses.some((x) => x.negative));
  assert.equal(s.players[0].hp, 524);
  assert.ok(!status(s, "statusGuard"));
});
test("flower groups execute once and no flower skill prematurely ends a hand", () => {
  let s = fixture();
  for (const key of ["H1", "H2", "H3", "H4"])
    s = send(s, { type: "flower", pid: 0, key });
  assert.deepEqual(s.players[0].formations, ["seasons"]);
  assert.equal(s.ended, false);
  const shield = s.players[0].shield;
  s = send(s, { type: "flower", pid: 0, key: "H4" });
  assert.equal(s.players[0].shield, shield);
  assert.equal(
    s.log.filter((e) => e.skillId === "formation.seasons").length,
    1,
  );
});
test("Hu finisher scores then ranks; Hu player need not win; no replacement monster", () => {
  let s = fixture();
  s.players[1].damage = 4000;
  s.monster.hp = 1;
  s = send(s, { type: "finish", pid: 0, fan: 2, reason: "hu" });
  assert.equal(s.result.ranking[0].pid, 1);
  assert.equal(s.result.huPid, 0);
  assert.equal(s.monster.id, 1);
  assert.equal(s.kills.length, 1);
  assert.equal(s.ended, true);
});
test("flower finish replaces Hu bonus; eight elements cast complete before final death", () => {
  let s = fixture();
  s.monster.hp = 1;
  s = send(s, { type: "finish", pid: 0, flowerKind: "八仙過海", fan: 100 });
  assert.equal(s.players[0].hits, 5);
  assert.equal(s.log.filter((x) => x.type === "skill").length, 1);
  assert.equal(s.monster.id, 1);
  assert.equal(s.kills.length, 1);
  let seven = send(fixture(), { type: "finish", pid: 0, flowerKind: "七搶一" });
  assert.ok(seven.log.some((x) => x.skillId === "formation.seven"));
});
test("draw gives no Hu score, exact ties share rank", () => {
  let s = fixture();
  s.players[0].damage = s.players[1].damage = 200;
  s = send(s, { type: "finish", pid: null, reason: "draw" });
  assert.equal(s.players[0].damage, 200);
  assert.deepEqual(
    s.result.ranking.map((x) => x.rank),
    [1, 1, 3, 3],
  );
});
test("concealed opponent skill log masks exact skill name and key", () => {
  let s = cast(fixture(), "W.concealed.3333", 2);
  const entry = s.log.find((x) => x.type === "skill");
  assert.equal(entry.name, "秘術");
  assert.equal(entry.skillId, null);
  assert.equal(entry.secret, true);
});
test("stale-monster event is ignored without damaging replacement", () => {
  let s = fixture();
  s.monster.hp = 1;
  s = cast(s, "W.chow.789");
  const hp = s.monster.hp;
  const before = s.players[0].damage;
  s = send(s, {
    type: "meld",
    pid: 0,
    action: "pong",
    key: "W1",
    monsterId: 1,
  });
  assert.equal(s.monster.hp, hp);
  assert.equal(s.players[0].damage, before);
});
test("AI estimate does not mutate state and values survival when threatened", () => {
  const s = fixture();
  s.players[0].hp = 100;
  s.players[0].aggro = 100;
  const before = clone(s);
  assert.ok(C.estimate(s, 0, Skills.get("FE.exposed")) > 0);
  assert.deepEqual(s, before);
});
test("reject corrupt state before committing event", () => {
  for (const change of [
    (s) => (s.players[0].hp = NaN),
    (s) => (s.rng = 0),
    (s) => (s.players[0].damage = -1),
    (s) => (s.monster.nextAttack.type = "bad"),
    (s) => s.players[0].statuses.push({ kind: "bad", duration: -1 }),
    (s) => (s.enemyDue = 999),
  ]) {
    const s = fixture();
    change(s);
    assert.throws(() => C.apply(s, { id: 1, type: "enemy" }));
  }
});

module.exports = { fixture, eventFor };

for (const order of [
  ["T.pong.333", "FW.exposed"],
  ["FW.exposed", "T.pong.333"],
]) {
  test(
    "persistent shared debuff survives one-shot overlap in order " +
      order.join(" → "),
    () => {
      let state = fixture();
      for (const skill of order) state = cast(state, skill);
      const initial = state.players[0].hp;
      state = send(due(state), { type: "enemy" });
      assert.equal(initial - state.players[0].hp, 112);
      assert.ok(
        state.monster.statuses.some((status) => status.kind === "attack"),
      );
      const first = state.players[0].hp;
      state = send(due(state), { type: "enemy" });
      assert.equal(first - state.players[0].hp, 112);
      assert.ok(
        !state.monster.statuses.some((status) => status.kind === "attack"),
      );
    },
  );
}

test("post-attack armor refresh keeps two complete future enemy actions", () => {
  let state = cast(fixture(), "W.chow.234");
  state = cast(state, "B.concealed.2222");
  state = send(due(state), { type: "enemy" });
  const armor = state.monster.statuses.find(
    (status) => status.kind === "armor",
  );
  assert.equal(armor.value, 0.4);
  assert.equal(armor.duration, 2);
  state = send(due(state), { type: "enemy" });
  assert.equal(
    state.monster.statuses.find((status) => status.kind === "armor").duration,
    1,
  );
});

test("pure freeze counter retains its owner's identity without scoring a phantom hit", () => {
  let state = cast(fixture(), "T.concealed.3333", 2);
  state.players[2].aggro = 100;
  state = send(due(state), { type: "enemy" });
  assert.equal(state.players[2].hits, 0);
  assert.equal(state.players[2].damage, 0);
  assert.equal(state.log.find((entry) => entry.type === "control").pid, 2);
});
