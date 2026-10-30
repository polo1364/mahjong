const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const registry = require('../hero-skill-voices.js');
const source = fs.readFileSync(path.join(__dirname, '../feedback-voice.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const actors = ['shen-gufeng', 'chi-ling'];
  const names = ['W.chow.123', 'W.chow.234', 'H1.flower', 'formation.seasons', 'call:concealed'];
  const finishers = require('../cultivation-finishers.js').all.map(line => 'finisher:' + line.id);
  const lines = new Map(actors.flatMap(heroId => [...names, ...finishers].map(id => [heroId + '/' + id,
    Object.freeze({ heroId, id, file: 'assets/audio/voice-hero-skills-v1/' + heroId + '/' + id.replace(/:/g, '--') + '.mp3',
      durationSeconds: 1, action: id.startsWith('finisher:') ? 'finish' : 'chow' })])));
  const helpers = {
    get(heroId, id, options) { return lines.get(heroId + '/' + (options?.secret ? 'call:concealed' : id)) || null; },
    onEffect(effect, before) {
      if (!['skill', 'finisherPart'].includes(effect.type)) return null;
      if (effect.secret) return this.get(before.players[effect.pid]?.heroId, null, { secret: true });
      return this.get(before.players[effect.pid]?.heroId, effect.type === 'finisherPart' ? 'finisher:' + effect.segmentId : effect.skillId);
    },
  };
  let now = 0, timerId = 0;
  const nodes = [], events = new Map(), timers = new Map();
  class Audio {
    constructor() { this.requests = []; this.paths = []; this.paused = true; nodes.push(this); }
    play() { this.paused = false; this.paths.push(this.src); return new Promise((resolve, reject) => this.requests.push({ resolve, reject })); }
    pause() { this.paused = true; }
    end() { this.onended?.(); }
  }
  const document = { hidden: false, addEventListener: (name, fn) => events.set(name, fn) };
  const window = { Audio, MahjongHeroSkillVoices: helpers, performance: { now: () => now },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, at: now + ms }); return timerId; },
    clearTimeout: id => timers.delete(id), addEventListener: (name, fn) => events.set(name, fn) };
  vm.runInNewContext(source, { window, document });
  const before = { seq: 4, handNumber: 2, rng: 123, players: actors.map(heroId => ({ heroId })) };
  const effect = (skillId, pid = 0) => ({ type: 'skill', skillId, pid, seq: before.seq + 1 });
  return { api: window.MahjongVoice, nodes, document, events, before, effect, finishers, lines,
    advance(ms) { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } } };
}

test('complete names, aliases and only available audio are exported without mutable entries', () => {
  const approved = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/CULTIVATION_HERO_VOICE_SCRIPT.json'), 'utf8'));
  assert.equal(registry.all.length, 10);
  assert.equal(registry.contentSha256, createHash('sha256').update(JSON.stringify(approved.heroes)).digest('hex'));
  for (const hero of registry.all) {
    assert.equal(hero.lines.length, 213);
    assert.equal(hero.name, approved.heroes.find(item => item.heroId === hero.heroId).name);
    assert.ok(Object.isFrozen(hero) && Object.isFrozen(hero.lines));
    for (const line of hero.lines) {
      assert.ok(Object.isFrozen(line));
      assert.equal(line.reading, line.text);
      assert.doesNotMatch(line.name + line.text, /吃|碰|槓|胡|自摸/u);
      if (line.file) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', line.file)));
        assert.ok(line.durationSeconds > 0);
      } else assert.equal(line.durationSeconds, null);
    }
    assert.equal(registry.get(hero.heroId, 'formation.seven'), registry.get(hero.heroId, 'finisher:seven'));
    assert.equal(registry.get(hero.heroId, 'formation.eight'), registry.get(hero.heroId, 'finisher:eight'));
    assert.equal(registry.get(hero.heroId, 'finish.combo'), null);
  }
  for (const id of ['toString', '__proto__', '../secret', 'https://example.com']) {
    assert.equal(registry.get(id, 'W.chow.123'), null);
    assert.equal(registry.get('shen-gufeng', id), null);
  }
});

test('secret effects resolve to the actor generic line before consulting any precise identifier', () => {
  const before = { players: [{ heroId: 'shen-gufeng' }, { heroId: 'chi-ling' }] };
  const secret = { type: 'skill', pid: 1, secret: true, get skillId() { throw Error('Private ID was read'); } };
  assert.equal(registry.onEffect(secret, before), registry.get('chi-ling', 'call:concealed'));
  assert.equal(registry.name('chi-ling', 'W.concealed.1', { secret: true }), registry.get('chi-ling', 'call:concealed').name);
  assert.equal(registry.onEffect({ type: 'flowerPending', pid: 0, skillId: 'H3.flower' }, before), null);
  assert.equal(registry.onEffect({ type: 'finisherPart', pid: 0, segmentId: 'base' }, before).id, 'finisher:base');
});

test('new skills keep actor and exact ID; missing files never create audio requests', () => {
  const { api, nodes, lines } = harness();
  assert.equal(api.playSkill('W.chow.123', { heroId: 'shen-gufeng' }), false);
  api.setEnabled(true);
  assert.equal(api.playSkill('W.chow.123', { heroId: 'shen-gufeng' }), true);
  assert.equal(api.playSkill('W.chow.234', { heroId: 'shen-gufeng' }), true);
  assert.equal(api.playSkill('W.chow.123', { heroId: 'chi-ling' }), true);
  assert.equal(api.getState().pending.length, 2);
  nodes[0].end(); assert.match(nodes[0].src, /shen-gufeng\/W\.chow\.234\.mp3$/);
  nodes[0].end(); assert.match(nodes[0].src, /chi-ling\/W\.chow\.123\.mp3$/);
  api.stopAll();
  lines.set('shen-gufeng/missing', { heroId: 'shen-gufeng', id: 'missing', file: null });
  assert.equal(api.playSkill('missing', { heroId: 'shen-gufeng' }), false);
  assert.equal(api.playSkill('../secret', { heroId: 'shen-gufeng' }), false);
  assert.equal(nodes[0].paths.length, 3);
});

test('only actual fresh casts play, while saved logs, duplicate events and pending flowers stay silent', () => {
  const { api, nodes, before, effect } = harness(); api.setEnabled(true);
  assert.equal(api.consumeSkills([{ ...effect('H1.flower'), type: 'flowerPending' }], before), 0);
  assert.equal(nodes.length, 0);
  const effects = [effect('H1.flower'), effect('W.chow.123')];
  const saved = JSON.stringify({ effects, before });
  assert.equal(api.consumeSkills(effects, before), 2);
  assert.equal(api.consumeSkills(structuredClone(effects), structuredClone(before)), 0);
  assert.equal(JSON.stringify({ effects, before }), saved);
  assert.equal(api.consumeSkills(effects, { ...before, seq: 5 }), 0, 'restored log is already applied');
  assert.equal(api.consumeSkills([{ ...effect('W.chow.123'), seq: 8 }], before), 0, 'gapped event is not a new cast');
  nodes[0].end(); assert.match(nodes[0].src, /W\.chow\.123\.mp3$/);
  assert.equal(api.consumeSkills([{ ...effect('W.chow.123'), seq: 6 }], { ...before, seq: 5 }), 1, 'same move in a later event is distinct');
});

test('muted casts cannot replay on re-enable and concealed requests expose only the generic ID', () => {
  const { api, nodes, before, effect } = harness();
  assert.equal(api.consumeSkills([effect('W.chow.123')], before), 0);
  api.setEnabled(true);
  assert.equal(api.consumeSkills([effect('W.chow.123')], before), 0);
  const secret = { type: 'skill', secret: true, seq: 6, pid: 1, get skillId() { throw Error('Private skill consulted'); } };
  assert.equal(api.consumeSkills([secret], { ...before, seq: 5 }), 1);
  assert.equal(api.getState().activeSkillId, 'call:concealed');
  assert.match(nodes[0].src, /chi-ling\/call--concealed\.mp3$/);
  assert.doesNotMatch(JSON.stringify(api.getState()), /W\.concealed|secret/);
});

test('finisher parts form one ordered bounded sequence and survive ordinary three-second expiry', async () => {
  const { api, nodes, before, finishers, advance } = harness(); api.setEnabled(true);
  api.play('tile-w1');
  const effects = finishers.map(id => ({ type: 'finisherPart', segmentId: id.slice(9), pid: 0, seq: 5 }));
  assert.equal(api.consumeSkills([...effects, ...effects], before), 38);
  assert.equal(api.getState().pending.length, 37);
  assert.equal(api.getState().activeSkillId, finishers[0]);
  nodes[0].requests[0].reject(Error('superseded tile')); nodes[0].requests.at(-1).resolve(); await settle();
  advance(3500); nodes[0].end();
  assert.equal(api.getState().activeSkillId, finishers[1]);
  assert.equal(api.play('tile-w2'), false, 'lower-priority narration must not interrupt a finisher');
  for (let i = 2; i < 38; i++) { nodes[0].end(); assert.equal(api.getState().activeSkillId, finishers[i]); }
  nodes[0].end(); assert.equal(api.getState().active, null);
  assert.deepEqual(nodes[0].paths.slice(1).map(file => path.basename(file)), finishers.map(id => id.replace(/:/g, '--') + '.mp3'));
});

test('ordinary skills expire and all lifecycle stops cancel the whole finisher sequence', async () => {
  const ordinary = harness(); ordinary.api.setEnabled(true);
  ordinary.api.playSkill('W.chow.123', { heroId: 'shen-gufeng' });
  ordinary.nodes[0].requests[0].resolve(); await settle();
  ordinary.api.playSkill('W.chow.234', { heroId: 'shen-gufeng' });
  ordinary.advance(3001); ordinary.nodes[0].end();
  assert.equal(ordinary.api.getState().active, null);
  for (const stop of ['stopAll', 'disable', 'volume', 'hidden', 'pagehide']) {
    const { api, nodes, before, finishers, document, events } = harness(); api.setEnabled(true);
    api.consumeSkills(finishers.map(id => ({ type: 'finisherPart', segmentId: id.slice(9), pid: 0, seq: 5 })), before);
    if (stop === 'disable') api.setEnabled(false);
    else if (stop === 'volume') api.setVolume(0);
    else if (stop === 'hidden') { document.hidden = true; events.get('visibilitychange')(); }
    else if (stop === 'pagehide') events.get('pagehide')();
    else api.stopAll();
    nodes[0].requests[0].resolve(); await settle();
    assert.equal(api.getState().activeSkillId, null, stop);
    assert.equal(api.getState().pending.length, 0, stop);
    assert.equal(nodes[0].paused, true, stop);
  }
});

test('real combat output resolves delayed flowers only at release and finisher parts only once', () => {
  const combat = require('../cultivation-combat.js');
  const initial = combat.create(123, null, { heroId: 'shen-gufeng' });
  const pending = combat.apply(initial, { id: initial.seq + 1, type: 'flower', pid: 0, key: 'H3' });
  assert.equal(pending.effects.map(effect => registry.onEffect(effect, initial)).filter(Boolean).length, 0);
  const released = combat.apply(pending.state, { id: pending.state.seq + 1, type: 'turn', pid: 0 });
  assert.deepEqual(released.effects.map(effect => registry.onEffect(effect, pending.state)?.id).filter(Boolean), ['H3.flower']);
  const finished = combat.apply(released.state, { id: released.state.seq + 1, type: 'finish', pid: 0, from: 1, method: 'discard', items: [{ id: 'all-pungs', fan: 4 }], fan: 4, reason: 'hu' });
  assert.ok(finished.effects.some(effect => effect.skillId === 'finish.combo'));
  assert.deepEqual(finished.effects.map(effect => registry.onEffect(effect, released.state)?.id).filter(Boolean), ['finisher:base', 'finisher:all-pungs']);
  const concealed = combat.apply(initial, { id: initial.seq + 1, type: 'meld', pid: 1, action: 'concealed', key: 'W1' });
  const secret = concealed.effects.find(effect => effect.type === 'skill');
  assert.equal(secret.skillId, null);
  assert.equal(registry.onEffect(secret, initial).id, 'call:concealed');
});
