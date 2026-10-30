const { test } = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../hero-skill-voices.js');
const presentation = require('../cultivation-presentation.js');
const skills = require('../cultivation-skills.js');
const { game } = require('./game-harness.cjs');

test('all ten heroes display their approved names while presentation IDs and recipes stay stable', () => {
  const before = JSON.stringify(skills.all);
  for (const hero of registry.all) {
    for (const line of hero.lines.filter(line => line.action !== 'call')) {
      const original = presentation.profile(line.id);
      const personal = presentation.profile(line.id, false, hero.heroId);
      assert.equal(personal.name, line.name, hero.heroId + '/' + line.id);
      assert.equal(personal.id, original.id);
      assert.equal(personal.form, original.form);
      assert.equal(personal.tier, original.tier);
    }
  }
  assert.equal(JSON.stringify(skills.all), before);
});

test('committed display plans use the actual actor and preserve source events and damage', () => {
  const effects = [{ type: 'skill', pid: 1, skillId: 'W.chow.123', name: '星火燎原' },
    { type: 'damage', pid: 1, amount: 42, element: 'fire' },
    { type: 'finisherPart', pid: 1, segmentId: 'self-draw', name: '天賜靈機' }];
  const before = { players: [{ heroId: 'shen-gufeng' }, { heroId: 'chi-ling' }] };
  const snapshot = JSON.stringify({ effects, before });
  const plan = presentation.plan(effects, before);
  assert.equal(plan.items[0].label, registry.name('chi-ling', 'W.chow.123'));
  assert.equal(plan.items[2].label, registry.name('chi-ling', 'finisher:self-draw'));
  assert.equal(plan.damage, 42);
  assert.equal(JSON.stringify({ effects, before }), snapshot);
});

test('opponent secret presentation never reads the hidden skill name, identity or element', () => {
  const hidden = { type: 'skill', secret: true, pid: 1 };
  for (const key of ['skillId', 'name', 'element']) Object.defineProperty(hidden, key, { enumerable: true, get() { throw new Error('private ' + key); } });
  const previous = globalThis.MahjongHeroSkillVoices;
  globalThis.MahjongHeroSkillVoices = { name() { throw new Error('no secret registry lookup'); } };
  try {
    const plan = presentation.plan([hidden], { players: [{}, { heroId: 'chi-ling' }] });
    assert.equal(plan.items[0].label, '秘術');
    assert.equal(plan.items[0].element, 'neutral');
    assert.equal(plan.items[0].profile.id, 'secret');
    assert.equal(Object.hasOwn(plan.items[0], 'skillId'), false);
  } finally { globalThis.MahjongHeroSkillVoices = previous; }
});

test('engine dispatches only after a successful commit and keeps the actor and previous sequence', () => {
  const { run } = game(47, { cultivation: true, heroId: 'shen-gufeng' });
  run(`window.skillDispatches=[];window.MahjongVoice={consumeSkills(effects,before){window.skillDispatches.push({effects,beforeSeq:before.seq,heroId:before.players[0].heroId,committedSeq:S.cultivation.seq})}};
    cultivationEvent({type:'meld',pid:0,action:'chow',keys:['W1','W2','W3']});`);
  assert.equal(run('window.skillDispatches.length'), 1);
  assert.equal(run('window.skillDispatches[0].heroId'), 'shen-gufeng');
  assert.ok(run('window.skillDispatches[0].committedSeq > window.skillDispatches[0].beforeSeq'));
  assert.equal(run('window.skillDispatches[0].effects.filter(e=>e.type==="skill").length'), 1);
  run(`try { cultivationEvent({type:'meld',pid:0,action:'chow',keys:['invalid']}); } catch (_) {}`);
  assert.equal(run('window.skillDispatches.length'), 1, 'failed combat validation must not dispatch sound');
});

test('delayed offensive flowers keep the actor-specific name in both pending and committed logs', () => {
  const { run } = game(47, { cultivation: true, heroId: 'shen-gufeng' });
  const expected = registry.name('shen-gufeng', 'H3.flower');
  run(`S.cultivation=window.MahjongCultivationCombat.create(47,null,{heroId:'shen-gufeng'});
    window.MahjongHeroSkillVoices={name:(hero,id)=>hero==='shen-gufeng'&&id==='H3.flower'?${JSON.stringify(expected)}:null};
    window.flowersLog=[];log=message=>window.flowersLog.push(message);
    cultivationEvent({type:'turn',pid:1});cultivationEvent({type:'flower',pid:0,key:'H3'});`);
  assert.match(run('window.flowersLog.join("\\n")'), new RegExp(expected + '」待命'));
  assert.doesNotMatch(run('window.flowersLog.join("\\n")'), /施放「/);
  run(`cultivationEvent({type:'turn',pid:0});`);
  assert.match(run('window.flowersLog.join("\\n")'), new RegExp('施放「' + expected + '」'));
  assert.doesNotMatch(run('window.flowersLog.join("\\n")'), new RegExp(skills.get('H3.flower').name));
});
