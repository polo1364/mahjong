/* Stable scoring IDs, finisher composition and one-hand tribulation seals. */
(function (root) {
  'use strict';
  const element = key => ({ W: 'fire', T: 'water', B: 'metal', FE: 'wood', FS: 'fire', FW: 'metal', FN: 'water', DC: 'fire', DF: 'wood', DB: 'earth', H1: 'wood', H2: 'water', H3: 'fire', H4: 'water', H5: 'wood', H6: 'wood', H7: 'wood', H8: 'metal' }[key] || 'neutral');
  const seal = (name, kind, value) => ({ name, kind, value });
  const all = [];
  function add(id, label, name, description, hits, penetration, curse, options = {}) {
    all.push({ id, label, name, description, hits, penetration, curse, ...options });
  }
  add('base', '基本起手', '歸元一擊', '基本起手式；零台仍可胡牌。', 1, 0, seal('氣機失守', 'basic', .05));
  add('all-chows', '平胡', '流雲歸一', '三段攻擊，末段增傷 10%。', 3, 0, seal('散氣', 'basic', .1), { bonus: 'last' });
  add('all-pungs', '對對胡', '五嶽鎮魔', '五段重擊，穿透 15%。', 5, .15, seal('碎甲', 'taken', .1));
  add('closed', '門清', '閉關破境', '穿透 20% 的靈力攻擊。', 1, .2, seal('閉脈', 'skill', .1));
  add('self-draw', '自摸', '天賜靈機', '穿透 15% 的自摸攻擊。', 1, .15, null, { selfOnly: true });
  add('closed-self-draw', '門清自摸', '無漏真仙', '穿透 30%；不重複施放門清與自摸。', 1, .3, null, { selfOnly: true });
  add('single-wait', '獨聽', '一線問道', '單次穿透 50% 攻擊。', 1, .5, seal('亂神', 'finish', .1));
  for (const [n, word, pen, value] of [[3, '三', .2, .1], [4, '四', .3, .15], [5, '五', .4, .2]])
    add('concealed-' + n, word + '暗刻', word + '影歸真', `${word}段攻擊，穿透 ${pen * 100}%。`, n, pen, seal('封訣', 'skill', value));
  add('half-flush', '混一色', '靈晶合流', '所用數牌元素與無屬性各一擊。', 2, 0, seal('濁息', 'element', .15), { source: 'mixed' });
  add('pure-flush', '清一色', '純元天劫', '所用數牌元素三連擊，穿透 25%。', 3, .25, seal('封元', 'element', .2), { source: 'suit' });
  add('all-honors', '字一色', '七曜敕天', '依七種字牌元素發出七段攻擊。', 7, 0, seal('鎮魂', 'finish', .2), { keys: ['FE', 'FS', 'FW', 'FN', 'DC', 'DF', 'DB'] });
  add('dragons', '三元牌', '三靈歸元', '每組成立的三元刻／槓依其元素各一擊。', 1, 0, seal('三靈禁', 'skill', .1), { source: 'keys' });
  add('small-dragons', '小三元', '三靈結界', '火、木、土三連擊，穿透 20%。', 3, .2, seal('蝕元', 'heal', .15), { keys: ['DC', 'DF', 'DB'] });
  add('big-dragons', '大三元', '三聖誅邪', '火、木、土三連擊，穿透 40%。', 3, .4, seal('枯脈', 'heal', .2), { keys: ['DC', 'DF', 'DB'] });
  add('small-winds', '小四喜', '四象封妖', '木、火、金、水四連擊，穿透 20%。', 4, .2, seal('引妖', 'aggro', .2), { keys: ['FE', 'FS', 'FW', 'FN'] });
  add('big-winds', '大四喜', '四象天罰', '木、火、金、水四連擊，穿透 50%。', 4, .5, seal('群妖覬覦', 'aggro', .3), { keys: ['FE', 'FS', 'FW', 'FN'] });
  add('seat-wind', '門風', '本命鎮位', '門風元素攻擊，穿透 15%。', 1, .15, seal('命位受損', 'shield', .1), { source: 'keys' });
  add('round-wind', '圈風', '周天巡狩', '圈風元素攻擊，穿透 15%。', 1, .15, seal('天時不利', 'aggro', .15), { source: 'keys' });
  add('full-beg', '全求人', '借勢登仙', '自身非最高仇恨時，本招增傷 20%。', 1, 0, seal('因果纏身', 'aggro', .2), { bonus: 'not-top' });
  add('half-beg', '半求人', '半步通玄', '依缺血比例增傷，最高 20%。', 1, 0, null, { bonus: 'missing', selfOnly: true });
  add('rob-kong', '搶槓', '截劫奪機', '先解除一項防禦增益，再攻擊。', 1, 0, seal('逆劫', 'shield', .2), { removeDefense: true });
  add('rinshan', '槓上開花', '破關綻靈', '穿透 40% 攻擊。', 1, .4, null, { selfOnly: true });
  add('haitei', '海底撈月', '滄海攬月', '怪物生命低於 35% 時，本招增傷 20%。', 1, 0, null, { bonus: 'low-20', selfOnly: true });
  add('last-discard', '河底撈魚', '幽淵攝魂', '怪物生命低於 35% 時，本招增傷 15%。', 1, 0, seal('沉淵', 'basic', .15), { bonus: 'low-15' });
  add('heaven', '天胡', '太初開天', '無視護甲的無屬性終擊。', 1, 1, null, { selfOnly: true });
  add('earth', '地胡', '地脈升仙', '土屬性攻擊，穿透 80%。', 1, .8, null, { keys: ['DB'], selfOnly: true });
  add('human', '人胡', '紅塵證道', '無屬性攻擊，穿透 60%。', 1, .6, seal('紅塵劫', 'skill', .2));
  add('heaven-ready', '天聽', '先天洞玄', '四段攻擊，穿透 30%。', 4, .3, seal('失機', 'finish', .15));
  add('earth-ready', '地聽', '地脈知微', '兩段攻擊，穿透 20%。', 2, .2, seal('遲悟', 'finish', .1));
  add('flower', '正花', '本命靈華', '每朵正花依其元素各一擊。', 1, 0, seal('花靈凋零', 'heal', .1), { source: 'keys' });
  add('seasons', '四季花槓', '四時輪轉', '春、夏、秋、冬元素四連擊。', 4, 0, seal('四時失調', 'heal', .15), { keys: ['H1', 'H2', 'H3', 'H4'] });
  add('gentlemen', '四君子花槓', '君子誅邪', '梅、蘭、竹、菊元素四連擊。', 4, 0, seal('靈植衰敗', 'shield', .15), { keys: ['H5', 'H6', 'H7', 'H8'] });
  add('dealer', '莊家', '掌壇鎮妖', '最高仇恨時，本招增傷 10%。', 1, 0, seal('壇威震懾', 'aggro', .1), { bonus: 'top' });
  add('streak', '連莊', '連劫登階', '依連莊數攻擊，最多五段；按實際台數分配傷害。', 1, 0, seal('壇威震懾', 'aggro', .15), { source: 'streak' });
  add('seven', '七搶一', '七曜歸元', '沿用花胡專用穿透終擊 1100，持單花者承受劫印。', 1, 1, seal('七曜劫', 'skill', .2), { special: true });
  add('eight', '八仙過海', '八仙朝聖', '沿用花胡五行終擊，每種元素 300。', 5, 0, null, { special: true, selfOnly: true });
  const byId = Object.fromEntries(all.map(row => [row.id, row]));
  const get = id => Object.hasOwn(byId, id) ? byId[id] : null;
  const copy = value => JSON.parse(JSON.stringify(value));
  const split = (total, n) => Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));
  function validateItems(items, fan, method) {
    if (!Array.isArray(items) || items.length > 40 || !Number.isSafeInteger(fan) || fan < 0 || fan > 1000000) throw Error('Invalid finisher scoring');
    const seen = new Set();
    for (const item of items) {
      const row = get(item.id);
      if (!row || row.special || row.id === 'base' || seen.has(item.id) || !Number.isSafeInteger(item.fan) || item.fan < 1 || item.fan > 1000000) throw Error('Invalid finisher item');
      seen.add(item.id);
      if (row.selfOnly && method !== 'selfDraw') throw Error('Invalid self-draw pattern');
      if (['all-chows', 'full-beg', 'human', 'last-discard', 'rob-kong'].includes(row.id) && method === 'selfDraw') throw Error('Invalid discard pattern');
      if (row.source === 'suit' || row.source === 'mixed') { if (!['W', 'T', 'B'].includes(item.suit)) throw Error('Missing finisher suit'); }
      if (row.source === 'keys') {
        const pattern = row.id === 'flower' ? /^H[1-8]$/ : row.id === 'dragons' ? /^D[CFB]$/ : /^F[ESWN]$/;
        if (!Array.isArray(item.keys) || !item.keys.length || item.keys.length > 4 || new Set(item.keys).size !== item.keys.length || item.keys.some(k => !pattern.test(k))) throw Error('Invalid finisher source');
      }
      if (row.source === 'streak' && (!Number.isSafeInteger(item.streak) || item.streak < 1 || item.streak > 499999)) throw Error('Invalid finisher streak');
    }
    if (items.reduce((n, item) => n + item.fan, 0) !== fan) throw Error('Finisher fan mismatch');
    for (const group of [['concealed-3', 'concealed-4', 'concealed-5'], ['half-flush', 'pure-flush', 'all-honors'], ['small-dragons', 'big-dragons', 'dragons'], ['small-winds', 'big-winds'], ['heaven-ready', 'earth-ready'], ['dealer', 'streak'], ['closed-self-draw', 'closed', 'self-draw'], ['all-chows', 'all-pungs']])
      if (group.filter(id => seen.has(id)).length > 1) throw Error('Incompatible finisher patterns');
  }
  function curses(items) {
    const selected = new Map();
    for (const item of items.length ? items : [{ id: 'base' }]) {
      const row = get(item.id);
      if (!row?.curse) continue;
      const curse = { ...row.curse, sourceId: row.id };
      if (curse.kind === 'element') curse.element = element(item.suit);
      const key = curse.kind + (curse.element || '');
      if (!selected.has(key) || selected.get(key).value < curse.value) selected.set(key, curse);
    }
    return [...selected.values()];
  }
  const kindLabels = { basic: '普攻傷害', skill: '技能傷害', finish: '終式傷害', element: '對應元素傷害', heal: '治療量', shield: '護盾取得量', taken: '受到傷害', aggro: '新增仇恨' };
  function describeSeal(s) { return `${s.name}：${kindLabels[s.kind]}${['taken', 'aggro'].includes(s.kind) ? '＋' : '−'}${Math.round(s.value * 100)}%`; }
  function validateSeals(seals) {
    if (!Array.isArray(seals) || seals.length > 12) throw Error('Invalid tribulation seals');
    const seen = new Set();
    for (const s of seals) {
      const row = s && get(s.sourceId), canonical = row?.curse;
      if (!canonical || s.kind !== canonical.kind || s.value !== canonical.value || s.name !== canonical.name || (s.kind === 'element' ? !['fire', 'water', 'metal'].includes(s.element) : s.element !== undefined)) throw Error('Invalid tribulation seal');
      const key = s.kind + (s.element || '');
      if (seen.has(key)) throw Error('Duplicate tribulation seal');
      seen.add(key);
    }
  }
  function factor(player, kind, options = {}) {
    const applicable = (player.activeSeals || []).filter(s => s.kind === kind || (kind === 'damage' &&
      ((s.kind === 'basic' && options.basic) || (s.kind === 'skill' && !options.basic) || (s.kind === 'finish' && options.finisher) || (s.kind === 'element' && s.element === options.element))));
    if (['aggro', 'taken'].includes(kind)) return 1 + Math.min(kind === 'aggro' ? .35 : .25, Math.max(0, ...applicable.map(s => s.value)));
    return Math.max(kind === 'damage' ? .65 : .7, applicable.reduce((n, s) => n * (1 - s.value), 1));
  }
  function build(items, fan, method, player, monster, top) {
    validateItems(items, fan, method);
    const entries = [{ id: 'base', fan: 0 }, ...all.filter(row => items.some(i => i.id === row.id)).map(row => items.find(i => i.id === row.id))];
    const budget = Math.min(1500, 240 + 60 * fan), total = 240 + 60 * fan;
    const shares = entries.map(item => Math.floor((item.id === 'base' ? 240 : 60 * item.fan) * budget / total));
    for (let i = 0, rest = budget - shares.reduce((a, b) => a + b, 0); rest > 0; rest--, i++) shares[i % shares.length]++;
    let bonusLeft = Math.floor(budget * .2);
    const parts = entries.map((item, index) => {
      const row = get(item.id);
      let elements = row.keys?.map(element) || Array(row.hits).fill('neutral');
      if (row.source === 'keys') elements = item.keys.map(element);
      if (row.source === 'suit') elements = Array(row.hits).fill(element(item.suit));
      if (row.source === 'mixed') elements = [element(item.suit), 'neutral'];
      if (row.source === 'streak') elements = Array(Math.min(5, item.streak + 1)).fill('neutral');
      const amounts = split(shares[index], elements.length);
      const effects = row.removeDefense ? [{ op: 'removeBuff', kind: 'defense', count: 1 }] : [];
      amounts.forEach((amount, hit) => {
        let rate = 0;
        if (row.bonus === 'last' && hit === amounts.length - 1) rate = .1;
        if (row.bonus === 'not-top' && !top) rate = .2;
        if (row.bonus === 'top' && top) rate = .1;
        if (row.bonus === 'missing') rate = .2 * (1 - player.hp / player.maxHp);
        if (row.bonus?.startsWith('low-') && monster.hp / monster.maxHp < .35) rate = row.bonus === 'low-20' ? .2 : .15;
        const extra = Math.min(bonusLeft, Math.floor(amount * rate)); bonusLeft -= extra;
        effects.push({ op: 'damage', amount: amount + extra, element: elements[hit], penetration: row.penetration });
      });
      return { op: 'segment', id: item.id, name: row.name, label: row.label, fan: item.fan, budget: shares[index], effects };
    });
    return { id: 'finish.combo', name: method === 'selfDraw' ? '自摸 · 天機連招' : method === 'robKong' ? '搶槓 · 截劫連招' : '點胡 · 借勢連招', element: 'neutral', finisher: true, budget, effects: parts };
  }
  function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
  const api = freeze({ all, get, element, build, curses, factor, validateItems, validateSeals, describeSeal, copy });
  root.MahjongCultivationFinishers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
