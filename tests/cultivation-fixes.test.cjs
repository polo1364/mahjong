// Regressions for combat bugs found in the 2026-10-22 review of 修仙模式.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const C = require(path.join(__dirname, '../cultivation-combat.js'));
const Skills = require(path.join(__dirname, '../cultivation-skills.js'));

const clone = (v) => JSON.parse(JSON.stringify(v));
const sendFx = (s, e) => C.apply(s, { id: s.seq + 1, ...e });
const send = (s, e) => sendFx(s, e).state;
function fixture(attack) {
  const s = C.create(123);
  s.monster.element = 'earth'; s.monster.armor = 0.15;
  s.monster.hp = s.monster.maxHp = 20000; s.monster.shield = 0;
  s.monster.nextAttack = Object.assign({ type: 'single', charged: false, damage: 200, ailment: null, cancelled: false, controlUsed: false, sealAilment: false }, attack || {});
  return s;
}
function ev(id, pid = 0) {
  const sk = Skills.get(id);
  if (sk.action === 'flower') return { type: 'flower', pid, key: sk.combo };
  if (['W', 'T', 'B'].includes(sk.family)) {
    if (sk.action === 'chow') return { type: 'meld', pid, action: 'chow', keys: sk.combo.split('').map(r => sk.family + r) };
    return { type: 'meld', pid, action: sk.action, key: sk.family + sk.combo[0] };
  }
  return { type: 'meld', pid, action: sk.action, key: sk.combo };
}
const cast = (s, id, pid = 0) => send(s, ev(id, pid));
const castFx = (s, id, pid = 0) => sendFx(s, ev(id, pid));
const due = (s) => { s = clone(s); s.discardCount = 4; s.enemyDue = s.monster.id; return s; };
const status = (s, kind, pid = 0) => s.players[pid].statuses.find(x => x.kind === kind);

test('a stored flat next-hit bonus is added once, not to every hit of a multi-hit skill', () => {
  for (const id of ['T.exposed.1111', 'B.chow.123', 'B.chow.789', 'T.added.5555']) {
    const run = withFlat => {
      const s = fixture(); s.monster.element = 'metal';
      if (withFlat) s.players[0].statuses.push({ kind: 'nextFlatDamage', value: 200, duration: 3, charges: 1, owner: 0, element: 'earth' });
      return castFx(s, id).state.players[0].damage;
    };
    assert.equal(run(true) - run(false), 170, id); // 200 through 15% armor, once
  }
});

test('九轉丹心 steps once per attack skill and never boosts a hit mid-cast', () => {
  let s = cast(fixture(), 'W.concealed.3333');
  const r = castFx(s, 'T.exposed.1111');
  assert.deepEqual([status(r.state, 'rampDamage').current, status(r.state, 'rampDamage').charges], [0.2, 3]);
  const hits = r.effects.filter(e => e.type === 'damage').map(e => e.amount);
  assert.equal(hits[0], hits[1]);
  s = cast(cast(fixture(), 'W.concealed.3333'), 'T.added.5555');
  assert.deepEqual([status(s, 'rampDamage').current, status(s, 'rampDamage').charges], [0.2, 3]);
});

test('an empty cleanse or zero heal keeps an existing next-damage buff', () => {
  let s = cast(fixture(), 'W.chow.345');
  assert.equal(status(cast(s, 'W.pong.888'), 'nextDamage').value, 0.65);
  assert.equal(status(cast(s, 'FE.added'), 'nextDamage').value, 0.65);
});

test('吞潮卸勢 converts aggro into damage and ends with less aggro', () => {
  const s = fixture(); s.monster.element = 'fire'; s.players[0].aggro = 1000;
  const r = castFx(s, 'T.added.8888');
  const first = r.effects.find(e => e.type === 'damage').amount;
  assert.equal(r.state.players[0].aggro, 1000 + first - 350);
});

test('sealing or interrupting a charge also removes the charge buff', () => {
  let seed, s;
  for (seed = 1; seed < 100000; seed++) { s = C.create(seed); if (s.monster.element === 'metal' && s.monster.nextAttack.charged) break; }
  s = cast(s, 'T.exposed.3333', 0);
  assert.equal(s.monster.statuses.some(x => x.kind === 'attackUp'), false);
  const target = C.target(s), before = s.players[target].hp;
  s = send(due(s), { type: 'enemy' });
  assert.equal(before - s.players[target].hp, 160);
});

test('a delay does not stop a later interrupt on the same charge', () => {
  let s = fixture({ charged: true, damage: 240 });
  s = cast(s, 'DF.exposed', 1);
  s = cast(s, 'FN.exposed', 2);
  assert.equal(s.monster.nextAttack.cancelled, true);
});

test('recasting a DoT never downgrades the caster\'s stronger one', () => {
  const s = cast(fixture(), 'W.concealed.2222');
  for (const id of ['W.chow.123', 'W.added.1111']) {
    const burn = cast(s, id).monster.statuses.filter(x => x.kind === 'burn');
    assert.equal(burn.length, 1);
    assert.equal(burn[0].amount, 110, id);
    assert.equal(burn[0].penetration, 0.6, id);
  }
});

test('partial shield conversion keeps whole-number shield and HP', () => {
  let s = fixture(); s.players[0].shield = 333; s.players[0].shieldTurns = 3;
  s = cast(s, 'FN.added');
  assert.ok(Number.isInteger(s.players[0].shield));
  s = send(due(s), { type: 'enemy' });
  assert.ok(Number.isInteger(s.players[0].hp));
});

test('saves with corrupt nested status fields are rejected at load', () => {
  const bad = [
    s => { s.players[0].statuses.push({ kind: 'rampDamage', value: 0.2, current: 'x', duration: 3, owner: 0 }); },
    s => { s.players[0].statuses.push({ kind: 'nextDamage', value: 0.2, duration: 3, owner: 0, trigger: 'junk' }); },
  ];
  for (const corrupt of bad) {
    const s = fixture(); corrupt(s);
    assert.throws(() => C.apply(s, { id: s.seq + 1, type: 'discard', pid: 0 }));
  }
});

// Round 2 (2026-10-23).
test('九轉丹心 raises each later attack by 20/40/60/80% and then ends', () => {
  let s = cast(fixture(), 'W.concealed.3333'); const seen = [];
  for (let i = 0; i < 5; i++) { s = cast(s, 'T.exposed.1111'); seen.push(status(s, 'rampDamage')?.current ?? null); }
  assert.deepEqual(seen, [0.2, 0.4, 0.6, null, null]);
});

test('converting an empty shield is not an attack and keeps a stored next-damage buff', () => {
  const s = fixture(); s.players[0].shield = 0;
  s.players[0].statuses.push({ kind: 'nextDamage', value: 0.5, duration: 3, charges: 1, owner: 0 });
  const r = castFx(s, 'W.added.5555');
  assert.equal(r.effects.some(e => e.type === 'damage'), false);
  assert.equal(status(r.state, 'nextDamage')?.value, 0.5);
});

test('蟬蛻留刃 is spent without striking when the monster picks its owner', () => {
  let s = cast(fixture(), 'B.added.6666');
  s.players.forEach((p, i) => { p.aggro = i === 0 ? 9999 : 0; });
  assert.equal(C.target(s), 0);
  const r = sendFx(due(s), { type: 'enemy' });
  assert.equal(r.state.players[0].statuses.some(x => x.trigger === 'enemySingleOther'), false);
  assert.equal(r.effects.some(e => e.type === 'damage' && e.pid === 0), false);
});

test('a shield-break heal cannot revive a player the same hit knocked weak', () => {
  let s = cast(fixture({ damage: 2000 }), 'T.chow.567');
  s.players.forEach((p, i) => { p.aggro = i === 0 ? 9999 : 0; });
  s.players[0].hp = 100;
  s = send(due(s), { type: 'enemy' });
  assert.equal(s.players[0].hp, 0);
});

// Rule decisions (2026-10-23).
test('an interrupted attack keeps "after the monster attacks" marks for its next real attack', () => {
  let s = fixture({ cancelled: true });
  s.players[0].statuses.push({ kind: 'mark', trigger: 'enemyAfterAttack', amount: 200, duration: 4, owner: 0, monsterId: s.monster.id, element: 'earth' });
  let r = sendFx(due(s), { type: 'enemy' });
  assert.ok(status(r.state, 'mark'));
  assert.equal(r.effects.some(e => e.type === 'damage' && e.pid === 0), false);
  s = r.state; s.monster.nextAttack.cancelled = false;
  r = sendFx(due(s), { type: 'enemy' });
  assert.equal(status(r.state, 'mark'), undefined);
});

test('a seal cast with no charge waits and seals a charge within the monster\'s next 2 attacks', () => {
  let consumed = 0;
  for (let seed = 1; seed <= 300; seed++) {
    let s = C.create(seed); s.monster.hp = s.monster.maxHp = 50000;
    Object.assign(s.monster.nextAttack, { charged: false, ailment: null });
    s = cast(s, 'T.exposed.3333');
    assert.ok(s.monster.statuses.some(x => x.kind === 'sealPending'), String(seed));
    for (let attack = 0; attack < 2; attack++) {
      const had = s.monster.statuses.some(x => x.kind === 'sealPending');
      s = send(due(s), { type: 'enemy' });
      if (had) assert.equal(s.monster.nextAttack.charged, false, String(seed));
      if (had && !s.monster.statuses.some(x => x.kind === 'sealPending') && attack < 1) consumed++;
    }
    s = send(due(s), { type: 'enemy' });
    assert.equal(s.monster.statuses.some(x => x.kind === 'sealPending'), false, String(seed));
  }
  assert.ok(consumed > 0);
});

// Monster skills (2026-10-24).
test('a monster heal skill at full health is not spent and shows no empty heal', () => {
  const M = require(path.join(__dirname, '../cultivation-monsters.js'));
  const K = require(path.join(__dirname, '../cultivation-monster-skills.js'));
  for (const sk of K.all.filter(k => k.heal)) {
    const s = C.create(201, null, { heroId: 'yun-zhiwei' }), m = M.get(sk.speciesId);
    Object.assign(s.monster, { speciesId: m.id, tier: m.tier, name: m.name, element: sk.element === 'neutral' ? 'wood' : sk.element, hp: m.hp, maxHp: m.hp, shield: 0, armor: m.armor, attacks: 0, heals: 0, shields: 0, statuses: [] });
    if (m.tier === 'boss') s.monster.attacks = 2 * ['metal', 'wood', 'water', 'fire', 'earth'].indexOf(s.monster.element);
    s.monster.nextAttack = { type: sk.type, damage: sk.damage, charged: sk.charged, ailment: null, cancelled: false, controlUsed: false, sealAilment: false, skillId: sk.id, monsterId: s.monster.id, actionNumber: s.monster.attacks + 1, sealed: false };
    const r = sendFx(due(s), { type: 'enemy', monsterId: s.monster.id });
    assert.equal(r.state.monster.heals, 0, sk.id);
    assert.equal(r.effects.some(e => e.type === 'enemyHeal'), false, sk.id);
  }
});

// Balance (2026-10-24): an unused counter stance releases 80% of one strike when it lapses (V2 only).
test('蓄勢反擊: an unused counter stance releases once on expiry; a used one does not', () => {
  const setup = version2 => {
    const s = version2 ? C.create(301, null, { heroId: 'yun-zhiwei', monsterSkillVersion: 0 }) : C.create(301);
    if (!version2) { s.monster.hp = s.monster.maxHp = 50000; s.monster.armor = 0; s.monster.shield = 0; }
    return cast(s, 'B.pong.333');
  };
  const expire = s => { const fx = []; for (let i = 0; i < 3; i++) { const r = sendFx(s, { type: 'discard', pid: 0, key: 'W1' }); s = r.state; fx.push(...r.effects); } return { s, fx }; };
  const counterHits = fx => fx.filter(e => e.type === 'damage' && e.source === 'counter');
  const amount = Skills.get('B.pong.333').effects.find(e => e.kind === 'counter').amount;
  const lapsed = expire(setup(true));
  assert.equal(counterHits(lapsed.fx).length, 1);
  assert.equal(lapsed.s.players[0].statuses.some(x => x.kind === 'counter'), false);
  const raw = counterHits(lapsed.fx)[0];
  assert.ok(raw.amount > 0 && raw.amount < amount * 1.6, `release ${raw.amount} for amount ${amount}`);
  // Triggered by a monster hit first: the stance is spent, nothing is released later.
  let hit = setup(true); hit.players.forEach((p, i) => { p.aggro = i === 0 ? 9999 : 0; });
  hit = send(due(hit), { type: 'enemy' });
  assert.equal(counterHits(expire(hit).fx).length, 0);
  // Legacy journeys keep their original rules.
  assert.equal(counterHits(expire(setup(false)).fx).length, 0);
});

// Equipment (2026-10-24): acquired gear fills an empty slot but never replaces worn gear.
test('new gear auto-equips into an empty slot and never replaces worn gear', () => {
  const N = require(path.join(__dirname, '../cultivation-economy.js'));
  const Eq = require(path.join(__dirname, '../cultivation-equipment.js'));
  let s = C.create(71, null, { heroId: 'shen-gufeng', equipment: true });
  s = C.prepare(C.apply(s, { id: s.seq + 1, type: 'finish', reason: 'draw' }).state);
  s.players[0].economy.gold = 1000;
  let n = 0;
  const buy = stock => { const r = N.transact(s, { commandId: 'fix-' + (++n), pid: 0, type: 'buy', stockId: stock.id }); assert.equal(r.result.ok, true); s = r.state; return r.result.item; };
  const stock = s.players[0].economy.shop.stock;
  const first = buy(stock[0]), slot = Eq.get(first.catId).slot;
  assert.equal(s.players[0].equipment[slot], first.uid);
  const same = stock.find(x => x !== stock[0] && Eq.get(x.catId).slot === slot);
  const second = buy(same);
  assert.equal(s.players[0].equipment[slot], first.uid);
  assert.ok(s.players[0].economy.inventory.some(i => i.uid === second.uid));
});
