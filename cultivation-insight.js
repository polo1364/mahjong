/* 傷害算式側欄: hovering a hand tile, a meld or a flower shows what it would deal now.
   Every figure comes from running the real combat engine on a throwaway copy of the hand. */
(function (root) {
  'use strict';
  const game = () => (typeof S !== 'undefined' ? S : null);
  const C = () => root.MahjongCultivationCombat, K = () => root.MahjongCultivationSkills;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const elements = { fire: '火', water: '水', metal: '金', wood: '木', earth: '土', neutral: '無' };
  const actionNames = { chow: '吃', pong: '碰', exposed: '明槓', concealed: '暗槓', added: '加槓', flower: '補花', formation: '花陣' };
  let panel = null, shownFor = null;
  // The name shown on the seat plate (in cultivation mode that is the hero's name).
  const seatName = pid => { const n = document.querySelector(`#playerInfo${pid} .seat-name`)?.firstChild; return (n?.nodeType === 3 ? n.textContent.trim() : '') || (root.playerName ? root.playerName(pid) : ''); };

  // Run one event on a copy of the combat state and report what the acting player gains.
  function simulate(pid, event) {
    const combat = C(), state = game()?.cultivation; if (!state || state.ended) return null;
    if (state.damageVariance !== 1 || !combat.withDamageRoll) return once(pid, event, null);
    const [lo, hi] = combat.damageRollRange;
    const low = combat.withDamageRoll(lo, () => once(pid, event, null)), high = combat.withDamageRoll(hi, () => once(pid, event, null));
    if (!low || !high) return null;
    const span = key => ({ lo: low[key], hi: high[key] });
    return { ...high, damage: span('damage'), basic: span('basic'), heal: span('heal'), shield: span('shield'), ranged: true };
  }
  function once(pid, event) {
    const state = game()?.cultivation; if (!state || state.ended) return null;
    try {
      const copy = JSON.parse(JSON.stringify(state));
      // A flower already in front of its owner is re-played as if newly revealed.
      if (event.type === 'flower') copy.players[pid].flowers = copy.players[pid].flowers.filter(k => k !== event.key);
      const result = C().apply(copy, { id: copy.seq + 1, monsterId: copy.monster.id, ...event });
      const mine = result.effects.filter(e => e.pid === pid);
      const sum = (type, filter = () => true) => mine.filter(e => e.type === type && filter(e)).reduce((n, e) => n + (e.amount || 0), 0);
      return { damage: result.state.players[pid].damage - state.players[pid].damage, basic: sum('damage', e => e.source === 'basic'),
        heal: sum('heal'), shield: sum('shield'), effects: result.effects };
    } catch (_) { return null; }
  }
  function meldEvent(pid, skill) {
    if (!skill) return null;
    if (skill.action === 'flower') return { type: 'flower', pid, key: skill.combo };
    if (/^[WTB]$/.test(skill.family)) return { type: 'meld', pid, action: skill.action, keys: [...skill.combo].map(n => skill.family + n) };
    return { type: 'meld', pid, action: skill.action, key: skill.combo };
  }
  const top = v => (typeof v === 'object' && v ? v.hi : v) || 0;
  const fmt = v => typeof v === 'object' && v ? (v.lo === v.hi ? String(v.lo) : `${v.lo}～${v.hi}`) : String(v);
  function line(label, value, tone = '') { return `<div class="ins-line"><span>${label}</span><b class="${tone}">${value}</b></div>`; }
  function total(label, value) { return `<div class="ins-total"><span>${label}</span><b>${value}</b></div>`; }
  function constantBonuses(player, kind, context) {
    const equipment = root.MahjongCultivationEquipment?.bonuses?.(player);
    if (!equipment) return '';
    const progression = player.progression ? root.MahjongCultivationProgression?.bonuses?.(player.progression) : null;
    const suffix = kind === 'damage' ? context === 'basic' ? 'basic' : 'active' : null;
    const gear = (equipment[kind] || 0) + (suffix ? equipment[suffix] || 0 : 0);
    const growth = (progression?.[kind] || 0) + (suffix ? progression?.[suffix] || 0 : 0);
    const format = value => `${value > 0 ? '+' : ''}${Math.round(value * 1000) / 10}%`;
    return (gear ? line('裝備常駐加成', format(gear), gear > 0 ? 'up' : 'down') : '') +
      (growth ? line('境界／功法常駐加成', format(growth), growth > 0 ? 'up' : 'down') : '') +
      line('奇遇', format((player.expeditionEffect?.[kind] || 0) + (suffix ? player.expeditionEffect?.[suffix] || 0 : 0)));
  }
  function threatNote(player) {
    if (!player.progression) return '';
    const E = root.MahjongCultivationEquipment, factor = E?.factor?.(player, 'aggro');
    if (factor === undefined || factor === 1) return '';
    return line('新增仇恨（裝備／功法）', `×${Math.round(factor * 100) / 100}`) +
      '<div class="ins-detail">隱修被動、劫印另算；最終新增仇恨倍率不低於 0.75。</div>';
  }

  function discardCard(key) {
    const g = game(), c = g.cultivation, p = c.players[0], m = c.monster, combat = C();
    const sim = simulate(0, { type: 'discard', pid: 0, key }); if (!sim) return null;
    const element = combat.tileElement(key), mult = combat.elementMultiplier(element, m.element);
    const armorCut = Math.max(0, (m.armor || 0) - (m.statuses || []).filter(s => s.kind === 'armor').reduce((n, s) => n + (s.value || 0), 0));
    const hero = root.MahjongCultivationHeroes?.get(p.heroId), ps = p.passiveState || {};
    const rows = [line('晶石普攻', 50)];
    if (p.heroId === 'shen-gufeng' && (ps.discards + 1) % 3 === 0 && ps.swordUses < 5) rows.push(line('劍意（第 3n 次出牌）', '+10', 'up'));
    if (ps.stored > 0) rows.push(line(hero?.passive?.name || '儲存加傷', '+' + Math.round(ps.stored), 'up'));
    if (p.equipmentState?.stored > 0) rows.push(line('裝備儲傷', '+' + Math.round(p.equipmentState.stored), 'up'));
    rows.push(line(`${elements[element] || '無'}屬 → ${elements[m.element] || ''}屬妖`, '×' + mult, mult > 1 ? 'up' : mult < 1 ? 'down' : ''));
    if (hero && hero.stats.damage !== 100) rows.push(line(`${hero.name} 傷害`, hero.stats.damage + '%', hero.stats.damage > 100 ? 'up' : 'down'));
    rows.push(constantBonuses(p, 'damage', 'basic'));
    rows.push(threatNote(p));
    if (armorCut > 0) rows.push(line(`怪物護甲 ${Math.round(armorCut * 100)}%`, '×' + (Math.round((1 - armorCut) * 100) / 100), 'down'));
    if (m.shield > 0) rows.push(line(`怪物護盾 ${m.shield}`, '先吸收', 'down'));
    const combos = possibleSkills(key).slice(0, 2).map(x => `<div class="ins-combo">可組 ${esc(x.label)} → <b>${esc(x.skill.name)}</b> ${x.text}</div>`).join('');
    return { title: `打出 ${esc(root.MahjongTileNames?.getName(key) || key)}`, body: rows.join('') + (sim.ranged ? line('浮動', '90%～110%') : '') + total('預估傷害', fmt(sim.basic)) + combos };
  }
  // Melds this tile could still complete from your hand: pong/kong with copies held, chow with both partners held.
  function possibleSkills(key) {
    const hand = game().players[0].hand.map(t => root.tileKey(t)), count = k => hand.filter(x => x === k).length, out = [], skills = K();
    const add = (action, keys, label) => { const skill = skills.find(action, keys); if (!skill || out.some(o => o.skill.id === skill.id)) return;
      const sim = simulate(0, meldEvent(0, skill)); out.push({ skill, label, text: sim ? effectText(sim) : '' }); };
    if (count(key) >= 3) add('concealed', [key, key, key, key], '暗槓');
    if (count(key) >= 2) add('pong', [key, key, key], '碰');
    if (/^[WTB][1-9]$/.test(key)) {
      const suit = key[0], n = Number(key[1]);
      for (const start of [n - 2, n - 1, n]) {
        if (start < 1 || start > 7) continue;
        const keys = [0, 1, 2].map(i => suit + (start + i));
        if (keys.every(k => k === key || count(k) > 0)) add('chow', keys, '吃 ' + keys.map(k => k[1]).join(''));
      }
    }
    return out;
  }
  function effectText(sim) {
    const parts = [];
    if (top(sim.damage) > 0) parts.push(`${fmt(sim.damage)} 傷害`);
    if (top(sim.heal) > 0) parts.push(`回復 ${fmt(sim.heal)}`);
    if (top(sim.shield) > 0) parts.push(`護盾 ${fmt(sim.shield)}`);
    return parts.join('・') || '輔助效果';
  }
  function skillCard(pid, skill, source, cast) {
    const g = game(), owner = pid === 0 ? '你' : seatName(pid);
    const details = (K().details?.(skill) || []).slice(0, 3).map(t => `<div class="ins-detail">${esc(t)}</div>`).join('');
    const sim = simulate(pid, meldEvent(pid, skill));
    const m = g.cultivation.monster, mult = C().elementMultiplier(skill.element, m.element);
    const rows = [line('屬性', `${elements[skill.element] || '無'} → ${elements[m.element] || ''}妖 ×${mult}`, mult > 1 ? 'up' : mult < 1 ? 'down' : '')];
    const player = g.cultivation.players[pid];
    if (sim && top(sim.damage) > 0) rows.push(constantBonuses(player, 'damage', 'active'));
    if (sim && top(sim.heal) > 0) rows.push(constantBonuses(player, 'heal'));
    if (sim && top(sim.shield) > 0) rows.push(constantBonuses(player, 'shield'));
    rows.push(threatNote(player));
    if (sim && top(sim.heal) > 0) rows.push(line('回復', fmt(sim.heal), 'up'));
    if (sim && top(sim.shield) > 0) rows.push(line('護盾', fmt(sim.shield), 'up'));
    return { title: `${esc(owner)} · ${esc(source)}`, sub: `${esc(skill.name)}${cast ? '（已施放）' : ''}`,
      body: details + rows.join('') + total(sim && top(sim.damage) > 0 ? '現在施放' : '現在施放', sim ? (top(sim.damage) > 0 ? fmt(sim.damage) : effectText(sim)) : '—') };
  }
  function secretCard(pid) {
    return { title: `${esc(seatName(pid))} · 暗槓`, sub: '秘術', body: '<div class="ins-detail">牌型與技能於結算後公開。</div>' };
  }

  function element() {
    if (panel?.isConnected) return panel;
    panel = document.createElement('aside');
    panel.id = 'cultInsight'; panel.className = 'cult-insight'; panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite'); panel.hidden = true;
    document.body.append(panel); return panel;
  }
  function show(card, anchor) {
    if (!card) { hide(); return; }
    const box = element();
    box.innerHTML = `<h6>${card.title}</h6>${card.sub ? `<p class="ins-sub">${card.sub}</p>` : ''}${card.body}`;
    box.hidden = false; shownFor = anchor;
    // Fixed column above the left end of your hand, so it never sits on the tile being read.
    const hand = document.getElementById('yourHand')?.getBoundingClientRect();
    const narrow = innerWidth < 700;
    const w = box.offsetWidth, h = box.offsetHeight;
    let x = narrow ? (innerWidth - w) / 2 : Math.max(8, (hand?.left ?? 16) - 4);
    let y = (hand?.top ?? innerHeight - 160) - h - 26;
    x = Math.min(Math.max(8, x), innerWidth - w - 8); y = Math.max(8, y);
    box.style.left = x + 'px'; box.style.top = y + 'px';
  }
  function hide() { if (panel) panel.hidden = true; shownFor = null; }
  function cardFor(target) {
    const g = game();
    if (!g?.cultivation || g.cultivation.ended || g.phase === 'end' || document.querySelector('dialog[open]')) return null;
    const handTile = target.closest('#yourHand button.tile');
    if (handTile) {
      const index = Number(/onClickYourTile\((\d+)\)/.exec(handTile.getAttribute('onclick') || '')?.[1]);
      const tile = g.players[0].hand[index];
      if (!tile || tile.suit === 'H') return null;
      return discardCard(root.tileKey(tile));
    }
    const group = target.closest('[id^="meldRail"] .rail-group');
    if (group) {
      const pid = Number(group.parentElement.id.replace('meldRail', '')), index = [...group.parentElement.children].indexOf(group);
      const meld = g.players[pid]?.melds[index]; if (!meld) return null;
      const reference = root.MahjongCultivationCatalog?.meldReference(meld, pid !== 0 && g.phase !== 'end');
      if (reference?.secret) return secretCard(pid);
      const skill = reference && K().get(reference.skillId); if (!skill) return null;
      return skillCard(pid, skill, actionNames[skill.action] || '牌組', true);
    }
    const flower = target.closest('[data-flower-key][data-flower-player]');
    if (flower) {
      const pid = Number(flower.dataset.flowerPlayer), skill = K().find('flower', flower.dataset.flowerKey);
      return skill ? skillCard(pid, skill, root.MahjongTileNames?.getName(flower.dataset.flowerKey) || '花牌', true) : null;
    }
    return null;
  }
  const pointerFine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  document.addEventListener('pointerover', event => {
    if (!pointerFine()) return;
    const anchor = event.target.closest?.('#yourHand button.tile, [id^="meldRail"] .rail-group, [data-flower-key][data-flower-player]');
    if (!anchor) { if (shownFor && !shownFor.contains(event.target)) hide(); return; }
    if (anchor === shownFor) return;
    show(cardFor(anchor), anchor);
  });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) hide(); });
  document.addEventListener('focusin', event => {
    const anchor = event.target.closest?.('#yourHand button.tile, [id^="meldRail"] .rail-group, [data-flower-key][data-flower-player]');
    if (anchor) show(cardFor(anchor), anchor); else hide();
  });
  // Touch: the "出牌確認" pref arms a tile on the first tap; show its preview while armed.
  document.addEventListener('click', () => requestAnimationFrame(() => {
    if (pointerFine()) return;
    const armed = document.querySelector('#yourHand button.tile.tile-armed');
    if (armed) show(cardFor(armed), armed); else hide();
  }));
  root.addEventListener('resize', hide); root.addEventListener('scroll', hide, true);
  root.MahjongCultivationInsight = Object.freeze({ simulate, hide });
})(typeof window !== 'undefined' ? window : globalThis);
