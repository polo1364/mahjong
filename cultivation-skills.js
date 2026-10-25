/* Approved cultivation skill catalogue. Tile keys and normal Mahjong rules are unchanged. */
(function (root) {
  'use strict';

  const all = [];
  const byId = Object.create(null);
  const elements = { W: 'fire', T: 'water', B: 'metal', FE: 'wood', FS: 'fire', FW: 'metal', FN: 'water', DC: 'fire', DF: 'wood', DB: 'earth', H1: 'wood', H2: 'water', H3: 'fire', H4: 'water', H5: 'wood', H6: 'wood', H7: 'wood', H8: 'metal' };
  const power = { chow: 100, pong: 120, exposed: 240, concealed: 260, added: 200, flower: 60, formation: 320, finish: 300 };
  const familyBalance = {
    W: { name: '赤晶', basic: 55, damage: 115, recovery: 100, role: '爆發、灼燒' },
    T: { name: '靈珠', basic: 40, damage: 85, recovery: 110, role: '回復、續戰' },
    B: { name: '飛劍', basic: 50, damage: 105, recovery: 100, role: '連擊、穿透' },
    honor: { name: '字牌', basic: 60, damage: 110, recovery: 100, role: '碰槓威力、特殊效果' },
    flower: { name: '花牌', basic: null, damage: 110, recovery: 115, role: '補花支援、集齊成陣' },
  };
  function familyFor(tile) {
    const key = tileKey(tile);
    if (/^[WTB][1-9]$/.test(key)) return key[0];
    if (/^(?:F[ESWN]|D[CFB])$/.test(key)) return 'honor';
    if (/^H[1-8]$/.test(key)) return 'flower';
    return null;
  }
  function basicDamage(tile) { return familyBalance[familyFor(tile)]?.basic ?? null; }
  // Change only fixed operands when constructing the catalogue. Stored effects and
  // resource-based conversions never pass through this function again.
  function balanceEffects(effects, family, finisher) {
    const balance = !finisher && familyBalance[family === 'formation' ? 'flower' : family];
    if (!balance) return effects;
    const damageValues = new Set(['nextFlatDamage']);
    const recoveryValues = new Set(['hot', 'shieldBreakHeal', 'onHitHeal', 'onHitShield', 'deathGuard']);
    return effects.map(effect => {
      const next = { ...effect };
      const adjust = (key, percent) => {
        if (typeof next[key] === 'number') next[key] = Math.round(next[key] * percent / 100);
      };
      if (['damage', 'dot', 'mark', 'buff'].includes(effect.op)) adjust('amount', balance.damage);
      if (effect.op === 'damage') adjust('shieldDamage', balance.damage);
      if (['heal', 'shield'].includes(effect.op)) adjust('amount', balance.recovery);
      if (effect.op === 'buff') {
        adjust('heal', balance.recovery);
        if (damageValues.has(effect.kind)) adjust('value', balance.damage);
        if (recoveryValues.has(effect.kind)) adjust('value', balance.recovery);
      }
      if (effect.onKill) next.onKill = balanceEffects(effect.onKill, family, false);
      return next;
    });
  }
  const D = (amount, options) => ({ op: 'damage', amount, ...options });
  const H = (amount, options) => ({ op: 'heal', amount, cap: 500, ...options });
  const S = (amount, options) => ({ op: 'shield', amount, cap: 600, duration: 3, ...options });
  const A = (mode, value) => ({ op: 'aggro', mode, value });
  const B = (kind, value, options) => ({ op: 'buff', kind, value, duration: 3, ...options });
  const E = (kind, value, options) => ({ op: 'debuff', kind, value, duration: 2, ...options });
  const O = (kind, amount, options) => ({ op: 'dot', kind, amount, ticks: 3, ...options });
  const C = (count, options) => ({ op: 'cleanse', count, ...options });
  const K = (kind, options) => ({ op: 'control', kind, value: 1, ...options });
  const M = (trigger, amount, options) => ({ op: 'mark', trigger, amount, duration: 4, ...options });
  const X = (source, ratio, cap, options) => ({ op: 'convert', source, ratio, cap, consume: true, ...options });
  const scale = (source, ratio, cap) => ({ source, ratio, cap });
  const execute = (multiplier = 1.6) => ({ threshold: 0.35, multiplier });
  const guard = (value, options) => B('guard', value, { charges: 1, ...options });
  const next = (value, options) => B('nextDamage', value, { charges: 1, duration: 5, ...options });

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function add(id, action, family, combo, name, description, element, effects, options) {
    if (byId[id]) throw new Error('Duplicate cultivation skill: ' + id);
    const skill = freeze({ id, action, family, combo, name, description, element, effects: balanceEffects(effects, family, options?.finisher), power: power[action], ...options });
    all.push(skill);
    byId[id] = skill;
    return skill;
  }

  function numeric(family, action, rows) {
    rows.forEach(([name, description, effects], index) => {
      const rank = index + 1;
      const combo = action === 'chow' ? '' + rank + (rank + 1) + (rank + 2) : String(rank).repeat(action === 'pong' ? 3 : 4);
      add(family + '.' + action + '.' + combo, action, family, combo, name, description, elements[family], effects);
    });
  }

  numeric('W', 'chow', [
    ['星火燎原', '攻擊並附加燃燒，持續傷害算自己。', [D(75), O('burn', 30)]],
    ['熔甲赤焰', '攻擊並降低怪物護甲，全員都能利用破甲輸出。', [D(100), E('armor', 0.25)]],
    ['燃心戰歌', '強化自己的下一個攻擊技能。', [next(0.65)]],
    ['回生丹火', '攻擊怪物，同時恢復自己的生命。', [D(100), H(95)]],
    ['焰衣護體', '獲得火盾，護盾受到怪物攻擊時反擊。', [S(150), B('shieldCounter', 0, { amount: 90, charges: 3 })]],
    ['灰燼隱息', '攻擊後降低自己的仇恨。', [D(110), A('reduce', 0.4)]],
    ['赤霄焚天', '高額爆發，同時產生額外仇恨。', [D(190, { extraAggro: 130 })]]
  ]);
  numeric('W', 'pong', [
    ['引火訣', '附加燃燒；自己的後續攻擊能延長一次燃燒。', [O('burn', 55, { extendOnHit: 1 })]],
    ['熔骨印', '攻擊並獲得穿透，使自己的後續攻擊忽略部分護甲。', [D(100), B('penetration', 0.35)]],
    ['赤心印', '自己的下一個攻擊技能附帶一次火焰追擊。', [B('nextFollowup', 0, { amount: 140, charges: 1, duration: 5 })]],
    ['吞焰訣', '攻擊並吸血，自己生命偏低時提高吸血效果。', [D(145, { lifeSteal: 0.5, when: 'notLowHp' }), D(145, { lifeSteal: 0.85, when: 'lowHp' })]],
    ['燼甲術', '獲得護盾，護盾被怪物擊破時爆炸反擊。', [S(180), B('shieldBreakDamage', 0, { amount: 203, charges: 1 })]],
    ['煙步訣', '降低自身仇恨，並減少下一擊產生的仇恨。', [A('reduce', 0.4), B('aggroRate', 0.4, { charges: 1, trigger: 'attackSkill', duration: 5 })]],
    ['烽火招妖', '挑釁至仇恨最高，減輕自己下一次受到的攻擊。', [A('top', 100), guard(0.55)]],
    ['淨炎息', '解除自己一項負面狀態，成功解除時強化下一擊。', [C(1), next(0, { scale: scale('lastCleanse', 0.65, 0.65) })]],
    ['殘陽刃', '斬擊怪物，怪物剩餘生命越低，傷害加成越高。', [D(130, { scale: scale('enemyMissingRatio', 130, 130) })]]
  ]);
  numeric('W', 'exposed', [
    ['焚野火劫', '攻擊並提前結算自己剩餘的燃燒傷害，隨後清除該燃燒。', [D(170), { op: 'consumeDot', kind: 'burn' }]],
    ['熔城震', '攻擊、削減怪物護盾，並施加破甲。', [D(240, { shieldDamage: 180 }), E('armor', 0.4)]],
    ['丹陽爆', '火焰重擊；本次若受到自身增傷效果強化，額外施加破甲。', [D(280), E('armor', 0.3, { when: 'hadDamageBoost' })]],
    ['赤髓回流', '攻擊並吸血，超過自身生命上限的回復量轉成護盾。', [D(250, { lifeSteal: 0.7, overhealShield: true })]],
    ['火壁鎮身', '獲得護盾，並降低怪物下一次對自己的傷害。', [S(300), guard(0.45)]],
    ['燼幕遁形', '大幅降低自身仇恨，同時減輕下一次受到的單體攻擊。', [A('reduce', 0.8), guard(0.65, { when: 'single' })]],
    ['焚天怒號', '重擊並挑釁，自己受到下一次怪物攻擊時反擊。', [D(220), A('top', 160), B('counter', 0, { amount: 172, charges: 1 })]],
    ['破厄炎輪', '清除自己的負面狀態，依解除數量生成火盾。', [C('all'), S(0, { scale: scale('lastCleanse', 100, 400) })]],
    ['落日斬妖', '對低生命怪物造成斬殺傷害，成功擊殺時恢復自身生命。', [D(250, { execute: execute(1.7), onKill: [H(240)] })]]
  ]);
  numeric('W', 'concealed', [
    ['潛火藏焰', '埋下火印，怪物下一次出手後引爆。', [M('enemyAfterAttack', 340)]],
    ['地火鑽心', '附加穿透燃燒，該持續傷害忽略部分護甲。', [O('burn', 110, { penetration: 0.6 })]],
    ['九轉丹心', '自己接下來數次攻擊逐次增傷，達到上限後停止增長。', [B('rampDamage', 0.2, { cap: 0.8, charges: 4, duration: 6 })]],
    ['命燈不滅', '獲得一次護命，受到致命傷時保留生命並立即回血。', [B('deathGuard', 300, { charges: 1, duration: 6 })]],
    ['玄炎返照', '獲得持續減傷，受到怪物攻擊後以火焰反擊。', [B('reduceDamage', 0.3), B('counter', 0, { amount: 149, charges: 3 })]],
    ['無相灰身', '獲得一次格擋，並降低自己下一擊產生的仇恨。', [guard(0.9), B('aggroRate', 0.2, { charges: 1, trigger: 'attackSkill', duration: 5 })]],
    ['炎魄鎮妖', '提高自身仇恨，期間承受的生命傷害強化下一擊。', [A('top', 160), B('takenToNext', 0.5, { cap: 220, duration: 4 })]],
    ['真火煉體', '淨化自己，並短暫抵抗新的負面狀態。', [C('all'), B('immuneAilment', 1, { duration: 3 })]],
    ['封日蓄炎', '埋下延遲爆炸；引爆前自己的攻擊會提高爆炸威力。', [M('enemyAfterAttack', 230, { scale: scale('ownHitsSinceMark', 40, 200) })]]
  ]);
  numeric('W', 'added', [
    ['火種重燃', '攻擊並刷新自己的燃燒時間，未有燃燒時施加新的燃燒。', [D(165), O('burn', 65, { refresh: true })]],
    ['熔甲追魂', '攻擊，依怪物目前被削弱的護甲追加傷害。', [D(205, { scale: scale('armorLost', 260, 180) })]],
    ['赤心連爆', '使下一擊留下火印，怪物出手後再引爆一次。', [B('nextMark', 0, { amount: 240, charges: 1, duration: 5 })]],
    ['血焰逆生', '立即回血，並讓下一次吸血的溢出回復轉成護盾。', [H(250), B('lifestealOverflow', 1, { charges: 1, duration: 5 })]],
    ['碎甲焚身', '消耗自己的剩餘護盾追加火傷，隨後獲得短暫減傷。', [X('shield', 1, 360, { consumeAll: true }), B('reduceDamage', 0.35, { duration: 2 })]],
    ['潛焰回襲', '攻擊前若自己不是仇恨最高者，獲得穿透；攻擊後降仇。', [D(230, { penetration: 0.7, when: 'notTopAggro' }), D(230, { when: 'topAggro' }), A('reduce', 0.4)]],
    ['怒焰還天', '重擊，依本隻怪物曾對自己造成的生命傷害取得加成。', [D(200, { scale: scale('damageTaken', 0.5, 250) })]],
    ['百厄化焰', '抵擋下一項負面狀態，成功抵擋時反擊怪物。', [B('statusGuard', 0, { amount: 250, charges: 1, duration: 5 })]],
    ['天燼續命', '斬擊怪物；成功擊殺時，強化自己對下一隻怪物的首擊。', [D(250, { onKill: [next(0.6)] })]]
  ]);

  numeric('T', 'chow', [
    ['滲潮連環', '攻擊並附加滲流，造成屬於自己的持續水傷。', [D(70), O('flow', 35)]],
    ['甘霖回脈', '恢復生命，溢出回復轉成護盾；依本招實際回血追加水擊，滿血空補不攻擊。', [H(170, { overhealShield: true }), D(0, { scale: scale('lastHeal', 0.6, 105), when: 'healed' })]],
    ['靜水凝鋒', '讓自己的下一個攻擊技能附帶吸血。', [B('nextLifesteal', 0.8, { charges: 1, duration: 5 })]],
    ['霧隱行舟', '降低自身仇恨，並減輕下一次受到的全體攻擊。', [A('reduce', 0.4), guard(0.6, { when: 'aoe' })]],
    ['滄浪護身', '獲得護盾，護盾被怪物擊破時恢復自身生命。', [S(150), B('shieldBreakHeal', 100, { charges: 1 })]],
    ['霜潮斷咒', '攻擊並打斷怪物蓄力；沒有蓄力時仍造成傷害。', [D(110), K('interrupt')]],
    ['天河倒灌', '攻擊；自己滿血時追加傷害，未滿血時改為回血。', [D(175, { when: 'fullHp' }), D(95, { when: 'notFullHp' }), H(100, { when: 'notFullHp' })]]
  ]);
  numeric('T', 'pong', [
    ['泉矢連心', '攻擊怪物，並強化自己的下一個攻擊技能。', [D(100), next(0.35)]],
    ['活泉潤脈', '缺血越多回復越強；依本招實際回血追加水擊，回擊有上限。', [H(140, { missingRatio: 0.2, cap: 340 }), D(0, { scale: scale('lastHeal', 0.75, 200), when: 'healed' })]],
    ['寒露鎖魄', '攻擊並降低怪物下一次攻擊的傷害，全員受益。', [D(100), E('attack', 0.3, { charges: 1 })]],
    ['水霧藏息', '降低自身目前仇恨，並暫時減少自己的持續傷害所產生的仇恨。', [A('reduce', 0.4), B('dotAggroRate', 0.25, { duration: 4 })]],
    ['玉潭護心', '缺血越多護盾越厚；護盾吸收直接傷害時按吸收量回擊，最多兩次。', [S(160, { missingRatio: 0.2, cap: 360 }), B('shieldCounter', 0, { scale: scale('lastAbsorbed', 0.78, 84), charges: 2, when: 'direct' })]],
    ['清泉滌塵', '恢復生命，並移除自己一項負面狀態。', [H(150), C(1)]],
    ['蝕水裂甲', '攻擊並降低怪物護甲。', [D(120), E('armor', 0.3)]],
    ['招潮迎敵', '提高自身仇恨，受到下一次單體攻擊後反擊。', [A('top', 80), B('counter', 0, { amount: 265, charges: 1, when: 'single' })]],
    ['殘月沉淵', '攻擊怪物，對低生命目標取得額外傷害。', [D(150, { execute: execute(1.7) })]]
  ]);
  numeric('T', 'exposed', [
    ['巨瀑連落', '連續水擊，最後一擊忽略部分護甲。', [D(80, { hits: 2 }), D(120, { penetration: 0.6 })]],
    ['沛雨攝生', '攻擊怪物，依本次實際扣除的生命恢復自己。', [D(260, { lifeSteal: 0.9 })]],
    ['冰瀑封法', '攻擊並封技，將怪物下一次特殊招式改為普通攻擊。', [D(220), K('seal')]],
    ['霧海退潮', '先造成傷害，再降低包含本次攻擊在內的自身仇恨。', [D(250), A('reduce', 0.65)]],
    ['浪壁返瀾', '獲得護盾，護盾第一次吸收怪物傷害時反擊。', [S(330), B('shieldCounter', 0, { amount: 281, charges: 1 })]],
    ['澄海洗厄', '清除自己所有持續傷害狀態，並暫時減少受到的持續傷害。', [C('all', { onlyDot: true }), B('reduceDot', 0.65, { duration: 4 })]],
    ['海蝕崩岩', '攻擊並施加易傷，全員對該怪物的傷害提高。', [D(220), E('vulnerable', 0.25)]],
    ['怒潮引禍', '將自己的仇恨提高至最高者之上，同時獲得護盾。', [A('top', 180), S(330)]],
    ['雪海狂瀾', '強力水擊，代價是自己接下來暫時承受更多傷害。', [D(390), B('fragile', 0.25, { duration: 2 })]]
  ]);
  numeric('T', 'concealed', [
    ['潛潮藏鋒', '自己下一個攻擊技能命中後，追加一道水擊。', [B('nextFollowup', 0, { amount: 300, charges: 1, duration: 5 })]],
    ['靈淵長息', '獲得持續回復，期間溢出的回復量轉成護盾。', [B('hot', 100, { duration: 4, overhealShield: true })]],
    ['凍魄靜界', '自己下次受到怪物攻擊後凍結怪物，延後其後續攻擊。', [B('counter', 0, { amount: 0, charges: 1, control: 'delay', duration: 4 })]],
    ['無痕水鏡', '保持下一擊傷害，降低該次攻擊新增的仇恨。', [B('aggroRate', 0.05, { charges: 1, trigger: 'attackSkill', duration: 5 })]],
    ['深潭磐守', '獲得減傷，期間承受的部分生命傷害轉成自身護盾。', [B('reduceDamage', 0.25, { duration: 4 }), B('takenToShield', 0.5, { cap: 250, duration: 4 })]],
    ['玄泉淨域', '抵擋下一項負面狀態，成功抵擋時恢復生命。', [B('statusGuard', 0, { heal: 240, charges: 1, duration: 5 })]],
    ['滴水穿空', '下一個攻擊技能無視護甲，仍受其他減傷效果影響。', [B('nextPenetration', 1, { charges: 1, duration: 5 })]],
    ['潛鱗鎮海', '減輕自己受到的全體攻擊，受此類攻擊後反擊。', [B('reduceDamage', 0.5, { when: 'aoe', duration: 4 }), B('counter', 0, { amount: 211, when: 'aoe', charges: 3, duration: 4 })]],
    ['寒玉護魂', '獲得一次護魂，生命歸零時立即回血並反擊怪物。', [B('deathGuard', 200, { amount: 180, charges: 1, duration: 6 })]]
  ]);
  numeric('T', 'added', [
    ['迴瀾逐浪', '攻擊；施放前若自己仇恨最高，追加一道水擊。', [D(240, { when: 'notTopAggro' }), D(170, { hits: 2, when: 'topAggro' })]],
    ['泉脈化刃', '依自己目前缺失的生命追加水傷，不扣除自身生命。', [D(180, { scale: scale('missingHp', 0.25, 240) })]],
    ['冰鏈遲鋒', '攻擊並延後怪物下一次攻擊。', [D(210), K('delay')]],
    ['隱川渡影', '清除自身目前仇恨，並減少下一擊產生的仇恨。', [A('reduce', 1), B('aggroRate', 0.2, { charges: 1, trigger: 'attackSkill', duration: 5 })]],
    ['碧海裂盾', '消耗部分自身護盾追加水傷，保留其餘護盾。', [D(160), X('shield', 0.5, 240)]],
    ['滌厄化雨', '淨化自己，依成功移除的負面狀態數量追加水傷。', [C('all'), D(150, { scale: scale('lastCleanse', 100, 300) })]],
    ['千流蝕骨', '攻擊，怪物護甲被削弱得越多，追加傷害越高。', [D(210, { scale: scale('armorLost', 300, 210) })]],
    ['吞潮卸勢', '將自身部分仇恨轉為額外水傷，結算後扣除被轉換的仇恨。', [D(140), X('aggro', 0.35, 350)]],
    ['返命潮生', '攻擊；成功擊殺怪物時恢復生命並獲得護盾。', [D(260, { onKill: [H(200), S(160)] })]]
  ]);

  numeric('B', 'chow', [
    ['流光追刺', '連續刺擊三次，最後一擊忽略部分護甲。', [D(35, { hits: 2 }), D(50, { penetration: 0.5 })]],
    ['分金斷岳', '斬擊並降低怪物護甲。', [D(105), E('armor', 0.25)]],
    ['旋鋒護身', '斬擊並準備招架，減輕自己下一次受到的直接傷害。', [D(80), guard(0.45)]],
    ['引劍回元', '攻擊並恢復生命，自己生命越低，回復越強。', [D(100), H(65, { missingRatio: 0.12, cap: 185 })]],
    ['截天斷式', '打斷怪物蓄力；無蓄力時改為削弱其下一次攻擊。', [K('interrupt', { fallbackAttackDown: 0.3 })]],
    ['踏影藏鋒', '斬擊後降低自己的仇恨。', [D(125), A('reduce', 0.3)]],
    ['九霄劍雨', '連續劍擊，依怪物身上的不同減益種類追加傷害。', [D(35, { hits: 3, scale: scale('debuffCount', 8, 32) })]]
  ]);
  numeric('B', 'pong', [
    ['迅劍雙擊', '刺擊；自己不是仇恨最高者時，追加第二次刺擊。', [D(100, { when: 'topAggro' }), D(100, { hits: 2, when: 'notTopAggro' })]],
    ['裂金留痕', '斬擊並移除怪物一項可解除的防禦增益。', [D(130), { op: 'removeBuff', kind: 'defense', count: 1 }]],
    ['橫劍招架', '減輕自己下一次受到的直接傷害，成功招架後反擊。', [guard(0.6), B('counter', 0, { amount: 174, charges: 1 })]],
    ['飲血劍息', '攻擊並吸血，依怪物實際失去的生命回復自己。', [D(160, { lifeSteal: 0.6 })]],
    ['封喉短鋒', '斬擊並封住怪物下一次攻擊附帶的負面狀態效果。', [D(120), K('sealAilment')]],
    ['拂塵劍心', '解除自己一項負面狀態，同時降低仇恨。', [C(1), A('reduce', 0.45)]],
    ['劍鳴問戰', '提高自身仇恨並獲得減傷，下次受到單體攻擊時反擊。', [A('top', 90), B('reduceDamage', 0.25), B('counter', 0, { amount: 172, charges: 1, when: 'single' })]],
    ['斷命劍判', '斬擊，怪物生命低於門檻時取得斬殺加成。', [D(150, { execute: execute(1.8) })]],
    ['藏鋒養意', '強化下一個攻擊技能，並賦予該次攻擊穿透。', [next(0.45), B('nextPenetration', 0.5, { charges: 1, duration: 5 })]]
  ]);
  numeric('B', 'exposed', [
    ['逐影連環', '連續斬擊；自己仇恨最高時，最後一擊追加穿透傷害。', [D(80, { hits: 2 }), D(100, { when: 'notTopAggro' }), D(150, { when: 'topAggro', penetration: 0.7 })]],
    ['破城金鋒', '造成穿透傷害並施加強破甲。', [D(260, { penetration: 0.5 }), E('armor', 0.45)]],
    ['天關劍壁', '獲得護盾，護盾結束時依吸收的傷害反擊。', [S(340), B('shieldEndDamage', 0, { amount: 0, cap: 340, scale: scale('shieldAbsorbed', 0.9, 340), charges: 1 })]],
    ['補天血刃', '先恢復自己的生命，再依實際回復量追加斬擊傷害。', [H(240), D(130, { scale: scale('lastHeal', 0.8, 200) })]],
    ['截龍斬', '斬擊並封住怪物下一次特殊攻擊，使其改用普通攻擊。', [D(230), K('seal')]],
    ['斬穢開霽', '淨化自己並斬擊，依解除的負面狀態種類取得傷害加成。', [C('all'), D(190, { scale: scale('lastCleanse', 80, 240) })]],
    ['孤峰迎敵', '提高仇恨並獲得護盾，護盾尚存時受到單體攻擊便反擊。', [A('top', 180), S(300), B('shieldCounter', 0, { amount: 156, charges: 3, when: 'single' })]],
    ['一線封生', '對低生命怪物強力斬擊，成功擊殺時恢復自身生命。', [D(270, { execute: execute(1.7), onKill: [H(200)] })]],
    ['天罡劍勢', '暫時強化自己，期間攻擊技能附帶一次額外斬擊。', [B('followup', 0, { amount: 90, charges: 3, duration: 5 })]]
  ]);
  numeric('B', 'concealed', [
    ['虛空點刃', '無視護甲造成傷害，本次產生的仇恨較低。', [D(310, { penetration: 1, aggroFactor: 0.5 })]],
    ['藏鋒蝕骨', '埋下劍痕，怪物出手後受到穿透傷害並被破甲。', [M('enemyAfterAttack', 280, { penetration: 0.7, debuff: E('armor', 0.4) })]],
    ['無漏劍境', '抵擋下一次直接傷害，依抵擋量反擊。', [guard(1), B('guardCounter', 0, { scale: scale('lastBlocked', 1.44, 480), amount: 0, cap: 480, charges: 1 })]],
    ['歸元劍胎', '獲得持續回復，實際回復的生命另生成少量護盾。', [B('hot', 95, { duration: 4, shieldRatio: 0.35 })]],
    ['靜域封刃', '移除怪物一項攻擊增益，並延後其下一次攻擊。', [{ op: 'removeBuff', kind: 'attack', count: 1 }, K('delay')]],
    ['斂息無塵', '抵擋下一項負面狀態，並暫時免除技能的額外仇恨。', [B('statusGuard', 0, { charges: 1, duration: 4 }), B('noExtraAggro', 1, { duration: 4 })]],
    ['鐵心劍誓', '提高自身仇恨，下一次致命傷改為保留生命並立即反擊。', [A('top', 200), B('deathGuard', 1, { amount: 280, charges: 1, duration: 6 })]],
    ['寂滅斷魂', '標記怪物，下次怪物出手後，依標記期間自己的傷害追加追斬。', [M('enemyAfterAttack', 120, { scale: scale('ownDamageSinceMark', 0.5, 350) })]],
    ['太虛劍匣', '獲得護盾；護盾結束時，依期間自己造成的傷害釋放追斬。', [S(280), B('shieldEndDamage', 0, { amount: 100, cap: 350, scale: scale('ownDamageSinceMark', 0.4, 350), charges: 1 })]]
  ]);
  numeric('B', 'added', [
    ['飛星接刃', '立即斬擊，並讓下一個攻擊技能追加一次追刺。', [D(190), B('nextFollowup', 0, { amount: 95, charges: 1, duration: 5 })]],
    ['金裂貫心', '依怪物破甲程度追加穿透傷害，再施加全員可利用的易傷。', [D(190, { penetration: 0.6, scale: scale('armorLost', 230, 180) }), E('vulnerable', 0.2)]],
    ['折鋒返照', '斬擊並消耗部分自身護盾追加傷害，無護盾仍有基本傷害。', [D(180), X('shield', 0.4, 220)]],
    ['返命化刃', '攻擊並吸血，自己處於虛弱時提高吸血效果。', [D(260, { lifeSteal: 0.5, lifeStealWeak: 1.2 })]],
    ['斷機反噬', '削弱怪物下一次攻擊，怪物出手後承受自己的反噬傷害。', [E('attack', 0.3, { charges: 1 }), M('enemyAfterAttack', 230)]],
    ['蟬蛻留刃', '降低仇恨；怪物下次單體攻擊若未選自己，觸發一次追斬。', [A('reduce', 0.55), M('enemySingleOther', 280)]],
    ['迎鋒破陣', '提高自身仇恨，保持仇恨最高時，攻擊技能獲得額外穿透。', [A('top', 180), B('penetration', 0.75, { when: 'topAggro', trigger: 'attackSkill', duration: 4 })]],
    ['斬後回鋒', '暫時強化自己的攻擊，命中低生命怪物時附加斬殺傷害。', [B('damageUp', 0.25, { duration: 4 }), B('execute', 0.5, { threshold: 0.35, duration: 4 })]],
    ['開匣定乾坤', '立即斬擊，將現有的下一擊增傷用於本招，並取得額外穿透；每份增益只消耗一次。', [D(250, { penetration: 0.7 })]]
  ]);

  const honors = {
    FE: [
      ['龍息回元', '恢復生命，依本招實際回血釋放木靈回擊；滿血空補不攻擊。', [H(230), D(0, { scale: scale('lastHeal', 0.75, 175), when: 'healed' })]],
      ['青木復甦', '大量恢復生命，並解除自己的負面狀態。', [H(360), C('all')]],
      ['龍鱗長生', '獲得持續回復與護盾。', [B('hot', 95, { duration: 4 }), S(220)]],
      ['回春化刃', '恢復生命，依實際回復量強化下一個攻擊技能。', [H(260), next(0, { scale: scale('lastHeal', 0.003, 0.8) })]]
    ],
    FS: [
      ['照世炎光', '造成火傷，並產生額外仇恨。', [D(190, { extraAggro: 100 })]],
      ['日冕焚甲', '攻擊並降低怪物護甲。', [D(260), E('armor', 0.35)]],
      ['日輪藏鋒', '獲得護盾，吸收的傷害強化自己的下一擊。', [S(340), B('absorbedToNext', 0.7, { cap: 240 })]],
      ['烈日巡天', '攻擊，依目前仇恨追加傷害，結算後降低部分仇恨。', [D(180, { scale: scale('aggro', 0.3, 300) }), A('reduce', 0.35)]]
    ],
    FW: [
      ['虎牙裂甲', '造成金傷，本次攻擊忽略部分護甲。', [D(175, { penetration: 0.6 })]],
      ['虎嘯鎮邪', '攻擊並降低怪物攻擊力，全員受益。', [D(240), E('attack', 0.3)]],
      ['伏虎待機', '獲得一次格擋，成功格擋後施放穿透反擊。', [guard(0.9), B('guardCounter', 0, { amount: 343, penetration: 0.7, charges: 1 })]],
      ['白虎追魂', '斬擊，怪物剩餘生命越低，傷害越高。', [D(220, { scale: scale('enemyMissingRatio', 240, 240) })]]
    ],
    FN: [
      ['龜甲鎮海', '獲得護盾並提高自身仇恨。', [S(230), A('top', 90)]],
      ['冰封斷潮', '攻擊並打斷怪物蓄力。', [D(260), K('interrupt')]],
      ['北冥藏息', '降低自身仇恨，並獲得持續回復。', [A('reduce', 0.7), B('hot', 110, { duration: 4 })]],
      ['玄甲返潮', '攻擊並消耗部分自身護盾追加水傷。', [D(180), X('shield', 0.55, 300)]]
    ],
    DC: [
      ['鳳火續命', '攻擊並吸血，恢復自己的生命。', [D(180, { lifeSteal: 0.65 })]],
      ['鳳鳴破劫', '淨化自己並攻擊，自己生命越低，傷害越高。', [C('all'), D(220, { scale: scale('missingHp', 0.22, 220) })]],
      ['鳳魂不滅', '獲得一次護命，下一次致命傷改為保留最低生命。', [B('deathGuard', 1, { charges: 1, duration: 7 })]],
      ['赤羽焚天', '高額火傷與額外仇恨，自己生命越低，爆發越強。', [D(280, { extraAggro: 200, scale: scale('missingHp', 0.2, 200) })]]
    ],
    DF: [
      ['蔓毒纏身', '攻擊並施加木毒，持續傷害算自己。', [D(80), O('poison', 45)]],
      ['萬藤縛魔', '攻擊並延後怪物下一次出手。', [D(240), K('delay')]],
      ['長青護元', '淨化自己，接下來數次自己出牌時恢復生命。', [C('all'), B('hot', 130, { duration: 4 })]],
      ['枯榮噬生', '攻擊並提前結算自己的剩餘木毒，移除木毒後吸血。', [D(180), { op: 'consumeDot', kind: 'poison', lifeSteal: 0.7 }]]
    ],
    DB: [
      ['玉璧生輝', '獲得護盾；護盾吸收直接傷害時按吸收量回擊，最多兩次，未受擊不造成傷害。', [S(280), B('shieldCounter', 0, { scale: scale('lastAbsorbed', 0.9, 108), charges: 2, when: 'direct' })]],
      ['山鎮萬劫', '大幅減輕下一次受到的傷害，承受後獲得護盾。', [guard(0.8), B('onHitShield', 200, { charges: 1 })]],
      ['坤元不動', '獲得持續減傷，存活承受怪物攻擊後恢復生命。', [B('reduceDamage', 0.35, { duration: 4 }), B('onHitHeal', 100, { charges: 3, duration: 4 })]],
      ['碎玉歸塵', '攻擊，依自己的目前護盾追加土傷，保留護盾。', [D(180, { scale: scale('shield', 0.6, 300) })]]
    ]
  };
  for (const [key, rows] of Object.entries(honors)) {
    rows.forEach(([name, description, effects], index) => {
      const action = ['pong', 'exposed', 'concealed', 'added'][index];
      add(key + '.' + action, action, 'honor', key, name, description, elements[key], effects);
    });
  }

  const flowers = [
    ['春芽回生', '立即恢復自己的生命。', [H(100)]],
    ['蓮華養元', '獲得持續回復，接下來數次自己出牌時回血。', [B('hot', 45, { duration: 3 })]],
    ['丹楓燃枝', '攻擊並附加燃燒，後續傷害算自己。', [D(45), O('burn', 25)]],
    ['寒雪凝衣', '獲得護盾，並減輕下一次受到的傷害。', [S(100), guard(0.25)]],
    ['傲霜破穢', '解除自己一項負面狀態，並獲得短暫減傷。', [C(1), B('reduceDamage', 0.2, { duration: 2 })]],
    ['幽蘭隱息', '降低自身仇恨，並減少下一擊產生的仇恨。', [A('reduce', 0.3), B('aggroRate', 0.5, { charges: 1, trigger: 'attackSkill', duration: 5 })]],
    ['翠竹卸力', '減輕下一次受到的攻擊，存活受擊後反擊。', [guard(0.35), B('counter', 0, { amount: 109, charges: 1 })]],
    ['鎏金綻刃', '造成金屬性攻擊，忽略部分怪物護甲。', [D(100, { penetration: 0.5 })]]
  ];
  flowers.forEach(([name, description, effects], index) => {
    const key = 'H' + (index + 1);
    add(key + '.flower', 'flower', 'flower', key, name, description, elements[key], effects);
  });
  add('formation.seasons', 'formation', 'formation', 'H1,H2,H3,H4', '四時生息陣', '集齊四季時，立即恢復生命，獲得護盾與持續回復。', 'wood', [H(260), S(230), B('hot', 75, { duration: 4 })]);
  add('formation.gentlemen', 'formation', 'formation', 'H5,H6,H7,H8', '君子誅邪陣', '集齊四君子時，對怪物造成穿透攻擊，隨後降低自身仇恨。', 'metal', [D(380, { penetration: 0.7 }), A('reduce', 0.5)]);
  add('formation.seven', 'formation', 'formation', 'seven', '七曜歸元', '七搶一時發動穿透終擊，計入傷害後結算全員排名，不再追加一般胡牌終式。', 'neutral', [D(1100, { penetration: 1 })], { finisher: true });
  add('formation.eight', 'formation', 'formation', 'eight', '八仙朝聖', '八仙過海時發動五行終擊，計入傷害後結算全員排名，不再追加一般胡牌終式。', 'neutral', ['metal', 'wood', 'water', 'fire', 'earth'].map(element => D(300, { element })), { finisher: true });
  add('finish.hu', 'finish', 'finish', 'hu', '五行歸一', '胡牌、自摸或搶槓胡時，依台數造成終結傷害並結算；胡牌者不一定是傷害冠軍。', 'neutral', [D(300, { fanRatio: 60, cap: 1500 })], { finisher: true });

  function get(id) {
    return typeof id === 'string' ? byId[id] || null : null;
  }

  function tileKey(tile) {
    return typeof tile === 'string' ? tile : tile && typeof tile.key === 'string' ? tile.key : null;
  }

  function elementFor(key) {
    const normalized = tileKey(key);
    if (!normalized) return 'neutral';
    if (/^[WTB][1-9]$/.test(normalized)) return elements[normalized[0]];
    return normalized.length === 2 && Object.prototype.hasOwnProperty.call(elements, normalized) ? elements[normalized] : 'neutral';
  }

  // A scalar key denotes a legal committed meld; arrays are validated in full.
  function find(action, keyOrKeys) {
    if (action === 'finish') return keyOrKeys === 'hu' || keyOrKeys == null ? get('finish.hu') : null;
    if (action === 'formation') {
      if (typeof keyOrKeys === 'string') return get('formation.' + keyOrKeys);
      if (Array.isArray(keyOrKeys)) {
        const keys = keyOrKeys.map(tileKey).sort();
        if (keys.join(',') === 'H1,H2,H3,H4') return get('formation.seasons');
        if (keys.join(',') === 'H5,H6,H7,H8') return get('formation.gentlemen');
      }
      return null;
    }
    const array = Array.isArray(keyOrKeys);
    const keys = array ? keyOrKeys.map(tileKey) : [tileKey(keyOrKeys)];
    if (!keys.length || keys.some(key => !key)) return null;
    if (action === 'chow') {
      if (keys.length !== 3 || !keys.every(key => /^[WTB][1-9]$/.test(key))) return null;
      const sorted = keys.slice().sort();
      const suit = sorted[0][0];
      if (!sorted.every(key => key[0] === suit)) return null;
      const ranks = sorted.map(key => Number(key[1]));
      if (ranks[1] !== ranks[0] + 1 || ranks[2] !== ranks[1] + 1) return null;
      return get(suit + '.chow.' + ranks.join(''));
    }
    const key = keys[0];
    if (!keys.every(value => value === key)) return null;
    if (action === 'flower') return keys.length === 1 ? get(key + '.flower') : null;
    if (!['pong', 'exposed', 'concealed', 'added'].includes(action)) return null;
    const length = action === 'pong' ? 3 : 4;
    if (array && keys.length !== length) return null;
    if (/^[WTB][1-9]$/.test(key)) return get(key[0] + '.' + action + '.' + key[1].repeat(length));
    return get(key + '.' + action);
  }

  const labels = {
    nextDamage: '下一招增傷', nextLifesteal: '下一招吸血', nextPenetration: '下一招穿透', nextFollowup: '下一招追擊',
    nextMark: '下一招附火印', damageUp: '增傷', rampDamage: '逐次增傷', penetration: '穿透', hot: '持續回復',
    reduceDamage: '減傷', guard: '格擋', counter: '受擊反擊', shieldCounter: '護盾受擊反擊', shieldBreakDamage: '破盾反擊',
    shieldBreakHeal: '破盾回復', guardCounter: '格擋反擊', deathGuard: '護命', statusGuard: '抵擋負面狀態',
    immuneAilment: '抵抗負面狀態', reduceDot: '持續傷害減免', aggroRate: '攻擊仇恨倍率', dotAggroRate: '持續傷害仇恨倍率',
    noExtraAggro: '免除額外仇恨', takenToShield: '受傷轉盾', takenToNext: '受傷蓄力', absorbedToNext: '吸收蓄力',
    execute: '低血量斬殺加成', followup: '技能追斬', shieldEndDamage: '護盾結束追斬', fragile: '承傷增加',
    lifestealOverflow: '吸血溢出轉盾', onHitShield: '受擊後護盾', onHitHeal: '受擊後回復',
    armor: '破甲', attack: '降攻', vulnerable: '易傷', burn: '燃燒', flow: '滲流', poison: '木毒'
  };
  const scaleLabels = { missingHp: '自身缺失生命', enemyMissingRatio: '怪物缺血比例', armorLost: '怪物破甲比例', debuffCount: '怪物減益種類', damageTaken: '本怪造成的生命傷害', shield: '自身護盾', aggro: '自身仇恨', lastHeal: '本招實際回復', lastCleanse: '本招淨化數量', ownDamageSinceMark: '標記後自身傷害', ownHitsSinceMark: '標記後自身命中', shieldAbsorbed: '護盾吸收傷害', lastAbsorbed: '本次護盾吸收', lastBlocked: '格擋傷害' };
  const percentKinds = new Set(['nextDamage', 'nextLifesteal', 'nextPenetration', 'damageUp', 'rampDamage', 'penetration', 'reduceDamage', 'guard', 'reduceDot', 'aggroRate', 'dotAggroRate', 'takenToShield', 'takenToNext', 'absorbedToNext', 'execute', 'fragile']);
  const pct = value => Number((value * 100).toFixed(2)) + '%';

  function effectDetail(effect) {
    let text = '';
    switch (effect.op) {
      case 'damage':
        text = effect.fanRatio ? '終式傷害 ' + effect.amount + '＋台數×' + effect.fanRatio + '，基礎上限 ' + effect.cap + '（增益另計）' : '傷害 ' + effect.amount + (effect.hits ? '×' + effect.hits + ' 擊' : '');
        if (effect.penetration) text += '，穿透 ' + pct(effect.penetration);
        if (effect.lifeSteal) text += '，吸血 ' + pct(effect.lifeSteal);
        if (effect.lifeStealWeak) text += '，虛弱時吸血 ' + pct(effect.lifeStealWeak);
        if (effect.execute) text += '，目標生命≤' + pct(effect.execute.threshold) + ' 時傷害×' + effect.execute.multiplier;
        if (effect.extraAggro) text += '，額外仇恨 ' + effect.extraAggro;
        if (effect.aggroFactor != null) text += '，仇恨倍率 ' + pct(effect.aggroFactor);
        if (effect.shieldDamage) text += '，額外削盾 ' + effect.shieldDamage;
        if (effect.onKill) text += '；擊殺後：' + effect.onKill.map(effectDetail).join('、');
        break;
      case 'heal': text = '回復 ' + effect.amount + (effect.missingRatio ? '＋缺失生命×' + pct(effect.missingRatio) : '') + '，上限 ' + effect.cap; break;
      case 'shield': text = '護盾 ' + effect.amount + (effect.missingRatio ? '＋缺失生命×' + pct(effect.missingRatio) : '') + '，上限 ' + effect.cap + '／' + effect.duration + ' 次自身出牌'; break;
      case 'aggro': text = effect.mode === 'top' ? '仇恨升至最高值＋' + effect.value : effect.mode === 'reduce' ? '降低目前仇恨 ' + pct(effect.value) : '增加仇恨 ' + effect.value; break;
      case 'buff': text = (labels[effect.kind] || effect.kind) + (effect.value ? ' ' + (percentKinds.has(effect.kind) ? pct(effect.value) : effect.value) : '') + (effect.amount ? '，傷害 ' + effect.amount : '') + (effect.heal ? '，回復 ' + effect.heal : '') + '／' + effect.duration + ' 次自身出牌' + (effect.charges ? '，限 ' + effect.charges + ' 次' : '') + (['counter', 'shieldCounter'].includes(effect.kind) && effect.amount > 0 ? '；未觸發到期時釋放 80%' : ''); break;
      case 'debuff': text = (labels[effect.kind] || effect.kind) + ' ' + pct(effect.value) + '／' + effect.duration + ' 次怪物行動' + (effect.charges ? '，限 ' + effect.charges + ' 次' : ''); break;
      case 'dot': text = (labels[effect.kind] || effect.kind) + '每次 ' + effect.amount + '／' + effect.ticks + ' 次怪物行動' + (effect.extendOnHit ? '，後續攻擊技能命中可延長 ' + effect.extendOnHit + ' 次' : ''); break;
      case 'cleanse': text = '解除' + (effect.onlyDot ? '持續傷害' : '負面') + '狀態 ' + (effect.count === 'all' ? '全部' : effect.count + ' 項'); break;
      case 'control': text = ({ interrupt: '打斷蓄力', delay: '延後怪物出手 1 次出牌', seal: '下一招特殊攻擊改普通攻擊；未蓄力時封印待命，保留至怪物之後 2 次出手', sealAilment: '封鎖下一次攻擊附帶的負面狀態' })[effect.kind]; if (effect.fallbackAttackDown) text += '；無蓄力時下次攻擊降低 ' + pct(effect.fallbackAttackDown); break;
      case 'removeBuff': text = '移除怪物 ' + effect.count + ' 項' + (effect.kind === 'attack' ? '攻擊' : '防禦') + '增益'; break;
      case 'consumeDot': text = '提前結算並清除自己的' + labels[effect.kind] + (effect.lifeSteal ? '，吸血 ' + pct(effect.lifeSteal) : ''); break;
      case 'convert': text = (scaleLabels[effect.source] || effect.source) + '×' + pct(effect.ratio) + ' 轉為傷害，上限 ' + effect.cap + (effect.consumeAll ? '，消耗全部剩餘護盾' : effect.consume ? '，消耗轉換量' : ''); break;
      case 'mark': text = ({ enemyAfterAttack: '怪物下次出手後', enemySingleOther: '怪物下次單體攻擊未選自己時', shieldEnd: '護盾結束時' })[effect.trigger] + '傷害 ' + effect.amount + '，最長 ' + effect.duration + ' 次自身出牌'; break;
      default: throw new Error('Unknown skill operation: ' + effect.op);
    }
    if (effect.element) text = ({ metal: '金', wood: '木', water: '水', fire: '火', earth: '土', neutral: '無' })[effect.element] + '屬性，' + text;
    if (effect.op !== 'damage' && effect.penetration) text += '，穿透 ' + pct(effect.penetration);
    if (effect.trigger === 'attackSkill') text += '，僅攻擊技能觸發';
    if (effect.kind === 'execute' && effect.threshold != null) text += '，目標生命≤' + pct(effect.threshold) + ' 時生效';
    if (effect.scale) {
      const fraction = effect.op === 'buff' && percentKinds.has(effect.kind);
      text += '；' + (effect.hits ? '每擊' : '') + '追加' + (scaleLabels[effect.scale.source] || effect.scale.source) + '×' + (fraction ? pct(effect.scale.ratio) : effect.scale.ratio) + '，追加上限 ' + (fraction ? pct(effect.scale.cap) : effect.scale.cap);
    }
    if (effect.op === 'buff' && effect.cap != null && !effect.scale) text += '，上限 ' + (effect.kind === 'rampDamage' ? pct(effect.cap) : effect.cap);
    if (effect.control === 'delay') text += '，觸發後延後怪物出手 1 次出牌';
    if (effect.refresh) text += '，刷新同類持續時間';
    if (effect.debuff) text += '，附加' + effectDetail(effect.debuff);
    if (effect.overhealShield) text += '，溢出回復轉護盾';
    if (effect.shieldRatio) text += '，實際回復×' + pct(effect.shieldRatio) + ' 額外轉盾';
    if (effect.when) text += '（' + ({ fullHp: '自身滿血', notFullHp: '自身未滿血', lowHp: '自身生命≤35%', notLowHp: '自身生命>35%', topAggro: '自身仇恨最高', notTopAggro: '自身非最高仇恨', hadNextDamage: '本招使用下一擊增傷', hadDamageBoost: '本招受到自身增傷強化', healed: '本招實際回血後', direct: '受到直接攻擊', single: '受到單體攻擊', aoe: '受到全體攻擊', weak: '自身虛弱', notWeak: '自身未虛弱' })[effect.when] + '）';
    return text;
  }

  function details(skillOrId) {
    const skill = typeof skillOrId === 'string' ? get(skillOrId) : skillOrId;
    return skill && Array.isArray(skill.effects) ? skill.effects.map(effectDetail) : [];
  }

  const api = freeze({ all, get, find, elementFor, familyFor, basicDamage, familyBalance, details, labels, version: 1 });
  root.MahjongCultivationSkills = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
