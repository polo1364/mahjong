/* Pure presentation recipes. Combat results are the only source of hits and numbers. */
(function (root) {
  'use strict';
  const Skills = typeof module === 'object' && module.exports ? require('./cultivation-skills.js') : root.MahjongCultivationSkills;
  const Finishers = typeof module === 'object' && module.exports ? require('./cultivation-finishers.js') : root.MahjongCultivationFinishers;
  const Choreography = typeof module === 'object' && module.exports ? require('./cultivation-choreography.js') : root.MahjongCultivationChoreography;
  const sprites = Object.freeze({
    fire: ['bronze', 0], blast: ['bronze', 1], wave: ['nature', 3], quake: ['bronze', 3],
    dust: ['bronze', 4], spark: ['bronze', 5], mountain: ['bronze', 6], shield: ['bronze', 7],
    sword: ['weapons', 0], slash: ['weapons', 1], thunder: ['weapons', 2], impact: ['weapons', 3],
    chain: ['weapons', 4], seal: ['weapons', 5], beam: ['weapons', 6], light: ['weapons', 7],
    vines: ['nature', 0], lotus: ['nature', 1], ice: ['nature', 2], poison: ['nature', 4],
    leaves: ['nature', 5], root: ['nature', 6], dome: ['nature', 7], phoenix: ['spirits', 0],
    dragon: ['spirits', 1], tiger: ['spirits', 2], tortoise: ['spirits', 3], bell: ['spirits', 4],
    smoke: ['spirits', 5], orbs: ['spirits', 6], pillar: ['spirits', 7],
    tornado: ['fire-forms', 0], crater: ['fire-forms', 1], meteor: ['fire-forms', 2], fireblade: ['fire-forms', 3],
    firewall: ['fire-forms', 4], firelotus: ['fire-forms', 5], embers: ['fire-forms', 6], sun: ['fire-forms', 7],
    waterdragon: ['water-forms', 0], waterfall: ['water-forms', 1], glacier: ['water-forms', 2], tidalwave: ['water-forms', 3],
    waterwall: ['water-forms', 4], fountain: ['water-forms', 5], mist: ['water-forms', 6], icelance: ['water-forms', 7]
  });
  const elements = {
    fire: { projectile: 'fire', impact: 'blast', sound: 'fire', color: '#ffb463' },
    water: { projectile: 'ice', impact: 'wave', sound: 'water', color: '#8deaff' },
    metal: { projectile: 'sword', impact: 'slash', sound: 'metal', color: '#ffe9a2' },
    wood: { projectile: 'root', impact: 'vines', sound: 'wood', color: '#adffc0' },
    earth: { projectile: 'mountain', impact: 'quake', sound: 'earth', color: '#e6c183' },
    neutral: { projectile: 'beam', impact: 'light', sound: 'thunder', color: '#fff0cf' }
  };
  const finisherShapes = {
    base: 'beam', 'all-chows': 'wave', 'all-pungs': 'mountain', closed: 'seal', 'self-draw': 'pillar',
    'closed-self-draw': 'light', 'single-wait': 'beam', 'concealed-3': 'slash', 'concealed-4': 'sword',
    'concealed-5': 'thunder', 'half-flush': 'orbs', 'pure-flush': 'thunder', 'all-honors': 'orbs',
    dragons: 'phoenix', 'small-dragons': 'seal', 'big-dragons': 'phoenix', 'small-winds': 'dragon',
    'big-winds': 'tiger', 'seat-wind': 'seal', 'round-wind': 'bell', 'full-beg': 'beam', 'half-beg': 'lotus',
    'rob-kong': 'chain', rinshan: 'pillar', haitei: 'wave', 'last-discard': 'smoke', heaven: 'pillar',
    earth: 'mountain', human: 'beam', 'heaven-ready': 'thunder', 'earth-ready': 'quake', flower: 'leaves',
    seasons: 'orbs', gentlemen: 'leaves', dealer: 'bell', streak: 'pillar', seven: 'orbs', eight: 'orbs'
  };
  function hash(text) { return [...String(text)].reduce((v, c) => (v * 31 + c.charCodeAt(0)) >>> 0, 7); }
  function profile(id, secret = false, heroId = null) {
    if (secret) return { id: 'secret', name: '秘術', element: 'neutral', tier: 2, variant: 0, motion: 'orbit', form: 'brand', rank: 1, beats: 3, projectile: 'seal', impact: 'light', sound: 'seal' };
    const finisher = id?.startsWith('finisher:') && Finishers.get(id.slice(9));
    const skill = Skills.get(id);
    if (!skill && !finisher) return { id: 'basic', name: '普攻', element: 'neutral', tier: 0, variant: 0, motion: 'bolt', form: 'bolt', rank: 1, beats: 1 };
    const tier = finisher ? 4 : ({ chow: 1, pong: 2, exposed: 3, concealed: 3, added: 3, flower: 1, formation: 4, finish: 4 }[skill.action] || 1);
    const variant = hash(id);
    const result = { id, name: root.MahjongHeroSkillVoices?.name(heroId, id) || (finisher || skill).name, element: skill?.element || 'neutral', tier, variant,
      motion: finisher ? 'fall' : ({ chow: 'arc', pong: 'bolt', exposed: 'fall', concealed: 'orbit', added: 'spiral', flower: 'bloom', formation: 'orbit' }[skill.action] || 'bolt') };
    if (finisher) result.projectile = finisherShapes[finisher.id];
    else if (skill.family === 'honor') result.projectile = ({ FE: 'dragon', FS: 'phoenix', FW: 'tiger', FN: 'tortoise', DC: 'phoenix', DF: 'vines', DB: 'bell' })[skill.combo];
    else if (skill.family === 'flower') result.projectile = ['lotus', 'leaves', 'ice', 'root'][variant % 4];
    else if (skill.family === 'formation') result.projectile = 'orbs';
    Object.assign(result, finisher ? Choreography.forFinisher(finisher.id) : Choreography.forSkill(skill));
    return result;
  }
  function appearance(item) {
    const p = item.profile, e = elements[item.element] || elements[p.element] || elements.neutral;
    let projectile = p.projectile || e.projectile, impact = p.impact || e.impact, sound = p.sound || e.sound;
    let form = p.form;
    const motifs = { eruption: 'crater', crater: 'crater', sun: 'sun', sunburst: 'sun', firelotus: 'firelotus', firewall: 'firewall', emberstep: 'embers', meteor: 'meteor', brand: 'seal', armor: 'shield', beacon: 'bell', purify: 'leaves', smokeveil: 'embers', phoenix: 'phoenix', firering: 'fireblade', mirror: 'tortoise', wave: 'tidalwave', fountain: 'fountain', mist: 'mist', waterwall: 'waterwall', prison: 'glacier', waterfall: 'waterfall', dome: 'dome', dragon: p.element === 'wood' ? 'dragon' : 'waterdragon', crescent: 'tidalwave', blizzard: 'ice', lotus: 'lotus', chains: 'chain', maelstrom: 'wave', cleave: 'slash', swordring: 'sword', cross: 'slash', shadowstep: 'smoke', rain: 'sword', bladegate: 'sword', bell: 'bell', mountain: 'mountain', tiger: 'tiger', roar: 'tiger', tortoise: 'tortoise', petals: 'leaves', vines: 'vines', roots: 'root', tree: 'vines', poison: 'poison', sprout: 'root', bamboo: 'root', constellation: 'orbs', triangle: 'seal', heavenbeam: 'pillar' };
    if (motifs[form]) projectile = motifs[form];
    if (form === 'execute') projectile = p.element === 'fire' ? 'fireblade' : 'slash';
    if (form === 'lance') projectile = p.element === 'water' ? 'icelance' : p.element === 'metal' ? 'sword' : 'beam';
    if (form === 'vortex') projectile = p.element === 'fire' ? 'tornado' : p.element === 'wood' ? 'poison' : 'wave';
    const formSounds = {meteor:'meteor',rain:'sword-rain',eruption:'eruption',crater:'eruption',vortex:'tornado',dragon:'dragon',phoenix:'dragon',tiger:'dragon',roar:'dragon',bell:'bell',beacon:'bell',shatter:'shatter',fountain:'fountain',heavenbeam:'thunder',chains:'seal',brand:'seal',prison:'seal',sunburst:'meteor',mountain:'eruption',blizzard:'sword-rain'};
    sound = formSounds[form] || sound;
    if(item.type==='damage'&&form==='fountain'){form='lance';projectile='icelance';sound='water';}
    if (item.type === 'heal') { projectile = impact = p.element === 'fire' ? 'firelotus' : p.element === 'water' ? 'fountain' : p.element === 'wood' ? 'lotus' : 'leaves'; sound = p.element === 'water' ? 'fountain' : 'bless'; form = ['dragon','sprout','tree','petals','lotus','firelotus'].includes(form) ? form : 'fountain'; }
    if (item.type === 'shield') { projectile = impact = p.element === 'fire' ? 'firewall' : p.element === 'water' ? 'waterwall' : p.element === 'metal' ? 'sword' : p.element === 'wood' ? 'dome' : 'shield'; sound = 'shield'; form = ['firewall','waterwall','bladegate','dome','armor','tortoise','mirror'].includes(form) ? form : 'armor'; }
    if (item.type === 'cleanse') { projectile = impact = p.element === 'fire' ? 'fireblade' : 'leaves'; sound = 'bless'; form = 'purify'; }
    if (item.type === 'control' || item.type === 'interrupted') { projectile = impact = p.element === 'water' ? 'glacier' : p.element === 'wood' ? 'vines' : 'chain'; sound = p.element === 'wood' ? 'wood' : 'seal'; form = p.element === 'water' ? 'prison' : p.element === 'wood' ? 'vines' : 'chains'; }
    if (item.type === 'aura') {
      if (item.op === 'dot') { projectile = impact = item.kind === 'poison' ? 'poison' : e.impact; sound = item.kind === 'poison' ? 'poison' : e.sound; form = item.kind === 'poison' ? 'vines' : 'brand'; }
      else if (item.op === 'aggro' && item.mode === 'reduce' || ['aggroRate', 'noExtraAggro', 'dotAggroRate'].includes(item.kind)) { projectile = impact = p.element === 'water' ? 'mist' : p.element === 'fire' ? 'embers' : 'smoke'; sound = 'stealth'; form = 'mist'; }
      else if (item.op === 'aggro') { projectile = impact = 'bell'; sound = 'bell'; form = 'beacon'; }
      else if (['debuff', 'mark', 'removeBuff'].includes(item.op)) { projectile = impact = 'seal'; sound = 'seal'; }
      else if (/guard|shield|immune|reduce|defense|absorbed/i.test(item.kind || '')) { projectile = impact = 'tortoise'; sound = 'shield'; }
      else if (/heal|hot|life/i.test(item.kind || '')) { projectile = impact = 'dome'; sound = 'bless'; }
      else { projectile = impact = /counter|followup/i.test(item.kind || '') ? 'sword' : motifs[form] || 'seal'; sound = formSounds[form] || 'seal'; }
    }
    if (item.source === 'dot') { projectile = impact = item.element === 'wood' ? 'poison' : e.impact; sound = item.element === 'wood' ? 'poison' : e.sound; }
    if (item.source === 'counter') { projectile = 'sword'; impact = 'slash'; sound = 'shatter'; form = 'shatter'; }
    if (item.type === 'hurt') { projectile = 'slash'; impact = item.absorbed && !item.amount ? 'shield' : 'impact'; sound = item.absorbed && !item.amount ? 'shield' : 'earth'; }
    return { projectile, impact, sound, form, color: e.color };
  }
  const statusNames = { heal: '回復', shield: '護盾', cleanse: '淨化', control: '封鎖', interrupted: '打斷', hurt: '受擊', ailment: '異常', kill: '擊破', spawn: '妖獸現身' };
  function plan(effects, before = null) {
    let current = profile(null), cursor = 0, segment = null, hitIndex = 0;
    const items = [];
    for (const effect of effects || []) {
      const heroId = before?.players?.[effect.pid]?.heroId;
      if (effect.monsterSkillId && ['hurt', 'ailment'].includes(effect.type)) continue;
      if (effect.type === 'skill') { current = effect.secret ? profile(null, true) : profile(effect.skillId, false, heroId); segment = null; hitIndex = 0; }
      if (effect.type === 'finisherPart') { current = profile('finisher:' + effect.segmentId, false, heroId); segment = effect.segmentId; hitIndex = 0; }
      if (!['skill', 'finisherPart', 'damage', 'heal', 'shield', 'control', 'aura', 'cleanse', 'hurt', 'ailment', 'interrupted', 'kill', 'spawn'].includes(effect.type)) continue;
      if (['heal', 'shield', 'cleanse'].includes(effect.type) && !(effect.amount > 0)) continue;
      let recipe = current;
      if (effect.type === 'damage' && (effect.source === 'basic' || effect.secondary)) recipe = effect.secret ? profile(null, true) : profile(effect.skillId, false, heroId);
      // Never use a private meld key or recipe to animate opponents' concealed kongs.
      if (effect.secret) recipe = profile(null, true);
      const visible = effect.secret ? Object.fromEntries(Object.keys(effect).filter(key => !['skillId', 'name', 'element'].includes(key)).map(key => [key, effect[key]])) : effect;
      const item = { ...visible, profile: recipe, at: cursor, duration: effect.type === 'damage' ? 900 : 760,
        element: effect.secret ? 'neutral' : effect.element || recipe.element, segmentId: effect.segmentId || segment, hitIndex: effect.type === 'damage' ? hitIndex++ : 0 };
      item.label = effect.type === 'damage' ? `${effect.source === 'counter' ? '反擊 ' : effect.source === 'dot' ? '持續 ' : effect.source === 'followup' ? '追擊 ' : ''}${Math.round(effect.amount)}`
        : effect.type === 'skill' || effect.type === 'finisherPart' ? recipe.name
        : statusNames[effect.type] ? statusNames[effect.type] + (effect.amount ? ` ${Math.round(effect.amount)}` : '')
        : effect.op === 'aggro' ? effect.mode === 'reduce' ? '斂息 · 降仇' : '挑釁 · 引妖'
        : effect.op === 'dot' ? '持續印記' : effect.op === 'debuff' ? '破法' : effect.op === 'mark' ? '延遲印記' : effect.op === 'removeBuff' ? '驅散' : '靈力加持';
      item.art = appearance(item);
      if (recipe.tier > 0) item.duration = ['rain','waterfall','constellation','mountain','meteor','sunburst'].includes(item.art.form) ? 1700 : 1350;
      item.soundAt = ['meteor','sword-rain','eruption','tornado','dragon','shatter','fountain'].includes(item.art.sound) ? .08 : effect.type === 'damage' || effect.type === 'hurt' ? .58 : .12;
      items.push(item);
      cursor += ['skill', 'finisherPart'].includes(effect.type) ? 100 : effect.type === 'damage' ? 230 : effect.type === 'spawn' ? 100 : 100;
      if (effect.type === 'kill') cursor += 400;
    }
    const length = Math.max(1, ...items.map(x => x.at + x.duration));
    const factor = Math.min(1, 4400 / length);
    for (const item of items) { item.at *= factor; item.duration *= factor; }
    return { items, duration: length * factor, damage: items.filter(x => x.type === 'damage').reduce((n, x) => n + x.amount, 0) };
  }
  const all = [...Skills.all.filter(s => s.id !== 'finish.hu').map(s => profile(s.id)), ...Finishers.all.map(s => profile('finisher:' + s.id))];
  const api = Object.freeze({ sprites, elements, profile, appearance, plan, all });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MahjongCultivationPresentation = api;
})(typeof window === 'object' ? window : globalThis);
