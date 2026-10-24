/* Cultivation presentation only. The mahjong and combat engines own every action. */
(function (root) {
  'use strict';
  const elements = { fire: '火', water: '水', metal: '金', wood: '木', earth: '土', neutral: '五行' };
  const actions = { chow: '吃', pong: '碰', exposed: '明槓', concealed: '暗槓', added: '加槓', flower: '補花', formation: '花陣', finish: '胡牌' };
  const families = { W: '赤晶', T: '靈珠', B: '飛劍', honor: '字牌', flower: '花牌', formation: '花陣', finish: '終式' };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const number = value => Math.max(0, Math.round(Number(value) || 0)).toLocaleString('zh-TW');
  const compactNumber = value => Number(value) >= 100000000 ? `${(value / 100000000).toFixed(1)}億` : Number(value) >= 10000 ? `${(value / 10000).toFixed(1)}萬` : number(value);
  const ratio = (value, maximum) => Math.max(0, Math.min(100, 100 * (Number(value) || 0) / (Number(maximum) || 1)));
  let currentState = null;
  let activeChoice = null;
  let lastAnnouncement = '';

  function playerName(state, pid) {
    if (state?.cultivation?.version >= 2) {
      const hero = root.MahjongCultivationHeroes?.get(state.cultivation.players[pid]?.heroId);
      if (hero) return hero.name;
    }
    return state?.names?.[pid] || state?.players?.[pid]?.name || ['你', '對家', '上家', '下家'][pid] || '道友';
  }
  function skills() { return (root.MahjongCultivationSkills?.all || []).filter(skill => skill.id !== 'finish.hu'); }
  function bindMeldSkills(state) {
    state.players.forEach((player, pid) => {
      document.querySelectorAll(`#meldRail${pid} .rail-group`).forEach((group, index) => {
        const meld = player.melds[index];
        if (!meld) return;
        const action = meld.type === 'kong' ? meld.concealed ? 'concealed' : meld.added ? 'added' : 'exposed' : meld.type;
        const source = `${playerName(state, pid)} · ${actions[action] || '牌組'}`;
        group.classList.add('cult-meld-trigger'); group.tabIndex = 0;
        group.setAttribute('role', 'button'); group.setAttribute('aria-haspopup', 'dialog');
        group.setAttribute('aria-label', `${source}，查看${meld.concealed && pid !== 0 && state.phase !== 'end' ? '秘術說明' : '技能與效果'}`);
        group.title = '點選查看技能與效果';
        const show = event => {
          event.preventDefault(); event.stopPropagation();
          if (!currentState?.cultivation) return;
          const latest = currentState.players[pid]?.melds[index];
          const reference = root.MahjongCultivationCatalog?.meldReference(latest, pid !== 0 && currentState.phase !== 'end');
          if (reference) root.MahjongCultivationCatalog.open({ ...reference, source,
            returnFocus: () => document.querySelectorAll(`#meldRail${pid} .rail-group`)[index] });
        };
        group.onclick = show;
        group.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') show(event); };
      });
    });
  }
  function bindFlowerSkills(state) {
    document.querySelectorAll('[data-flower-key][data-flower-player]').forEach(tile => {
      const pid = Number(tile.dataset.flowerPlayer), key = tile.dataset.flowerKey;
      const referenceFor = snapshot => root.MahjongCultivationCatalog?.flowerReference(key,
        snapshot?.cultivation?.players[pid], snapshot?.cultivation?.finisher?.pid === pid ? snapshot.cultivation.finisher : null);
      const reference = referenceFor(state);
      if (!reference) return;
      const source = `${playerName(state, pid)} · ${root.MahjongTileNames.getName(key)}`;
      tile.classList.add('cult-flower-trigger'); tile.tabIndex = 0;
      tile.classList.toggle('cult-flower-formed', reference.related.length > 0);
      tile.setAttribute('role', 'button'); tile.setAttribute('aria-haspopup', 'dialog');
      tile.setAttribute('aria-label', `${source}，查看花牌技能${reference.related.length ? '與已成陣效果' : ''}`);
      tile.title = tile.title.split(' · 點選查看花技')[0] + ' · 點選查看花技' + (reference.related.length ? '與已成陣效果' : '');
      const show = event => {
        event.preventDefault(); event.stopPropagation();
        const latest = referenceFor(currentState);
        if (latest) root.MahjongCultivationCatalog.open({ ...latest, source,
          returnFocus: () => document.querySelector(`[data-flower-player="${pid}"][data-flower-key="${key}"]`) });
      };
      tile.onclick = show;
      tile.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') show(event); };
    });
  }
  function sealList(player, field) {
    return (player[field] || []).map(s => `${root.MahjongCultivationFinishers.describeSeal(s)}（${root.MahjongCultivationFinishers.get(s.sourceId)?.label || '台型'}）`).join('；');
  }
  function information(title, content, className = '') {
    document.getElementById('cultivationInformation')?.remove();
    const previous = document.activeElement;
    const dialog = document.createElement('dialog'); dialog.id = 'cultivationInformation'; dialog.className = `cult-choice cult-information ${className}`.trim();
    dialog.setAttribute('aria-labelledby', 'cultivationInformationTitle');
    dialog.innerHTML = `<header><h2 id="cultivationInformationTitle">${escape(title)}</h2><button type="button">關閉 ×</button></header><div class="cult-information-body">${content}</div>`;
    document.body.append(dialog);
    const close = () => { dialog.close(); dialog.remove(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    dialog.querySelector('button').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.showModal(); dialog.querySelector('button').focus();
  }
  function findSkill(action, keys) {
    const api = root.MahjongCultivationSkills;
    if (!api) return null;
    if (typeof action === 'object' && action) return action.skill || findSkill(action.action, action.keys || action.key);
    if (typeof keys === 'string' && api.get(keys)) return api.get(keys);
    return api.find(action, keys) || null;
  }
  function combination(skill) {
    if (['W', 'T', 'B'].includes(skill.family)) return `${families[skill.family]} ${skill.combo}`;
    const formation = { seasons: '四季', gentlemen: '四君子', seven: '七搶一', eight: '八仙過海', hu: '五行歸一' }[skill.action === 'formation' ? skill.id.split('.')[1] : skill.combo];
    return formation || root.MahjongTileNames?.getName?.(skill.combo) || families[skill.family] || skill.combo;
  }
  function skillPreview(action, keys) {
    const skill = findSkill(action, keys);
    if (!skill) return '<span class="cult-skill-description">本次合法組牌成功後施放技能。</span>';
    const details = root.MahjongCultivationSkills?.details?.(skill) || [];
    return `<span class="cult-skill-heading"><strong>${escape(skill.name)}</strong><span>${escape(elements[skill.element] || '五行')} · ${escape(actions[skill.action] || skill.action)}</span></span><span class="cult-skill-description">${escape(skill.description)}</span>${details.length ? `<span class="cult-skill-values">${escape(details.join('；'))}</span>` : ''}`;
  }
  function target(combat) {
    if (root.MahjongCultivationCombat?.target) return root.MahjongCultivationCombat.target(combat) ?? -1;
    let result = -1;
    combat.players.forEach((player, pid) => {
      if (player.hp > 0 && (result < 0 || player.aggro > combat.players[result].aggro)) result = pid;
    });
    return result;
  }
  function statusText(status) {
    const left = status.remaining ?? status.turns ?? status.duration ?? status.ticks ?? status.charges;
    const label = status.label || status.name || root.MahjongCultivationCombat?.statusLabels?.[status.kind] || '狀態';
    const unit = status.clock === 'discard' || status.tick === 'discard' ? '次出牌' : '次';
    return `${label}${Number.isFinite(left) ? ` ${left}${unit}` : ''}`;
  }
  function playerStats(state, pid, targeted) {
    const player = state.cultivation.players[pid];
    const statuses = (player.statuses || []).filter(status => status.remaining !== 0);
    const weak = player.hp <= 0;
    const remaining = Math.max(0, 2 - (Number(player.weakDiscards) || 0));
    return `<div class="cult-player-stats" aria-label="${escape(playerName(state, pid))}的戰鬥資訊">
      <div class="cult-life"><span>生命 <b>${number(player.hp)}</b><small> / ${number(player.maxHp)}</small></span><span class="cult-lock${targeted ? ' is-target' : ''}">${weak ? '虛弱' : targeted ? '鎖定' : ''}</span></div>
      <div class="cult-bar" role="meter" aria-label="生命" aria-valuenow="${Math.max(0, Number(player.hp) || 0)}" aria-valuemin="0" aria-valuemax="${Number(player.maxHp) || 1000}"><i style="width:${ratio(player.hp, player.maxHp)}%"></i></div>
      <div class="cult-numbers"><span>護盾 <b>${number(player.shield)}</b></span><span title="傷害 ${number(player.damage)}">傷害 <b>${compactNumber(player.damage)}</b></span><span title="仇恨 ${number(player.aggro)}">仇恨 <b>${compactNumber(player.aggro)}</b></span></div>
      ${player.economy?.items?.carried.length ? `<div class="supply-battle-status" title="${escape(player.economy.items.carried.map(x=>root.MahjongCultivationItems.get(x.id).name+'：'+(x.used?'已使用':'待觸發')).join('、'))}">${player.economy.items.carried.map(x=>escape(root.MahjongCultivationItems.get(x.id).name)+(x.used?' ✓':' · 待')).join(' / ')}</div>` : ''}
      ${weak ? `<p class="cult-weak">虛弱 · ${remaining} 次出牌後復甦</p>` : ''}
      ${statuses.length ? `<div class="cult-statuses" title="${escape(statuses.map(statusText).join('、'))}">${statuses.slice(0, 2).map(status => `<span>${escape(statusText(status))}</span>`).join('')}${statuses.length > 2 ? `<span>＋${statuses.length - 2}</span>` : ''}</div>` : ''}
      ${player.activeSeals?.length ? `<button type="button" class="cult-seal-trigger" data-seals="${pid}" aria-label="劫印 ${player.activeSeals.length}，本局結束解除，查看說明" title="${escape(sealList(player, 'activeSeals'))}；本局結束解除">劫印 ${player.activeSeals.length}<span class="cult-seal-duration"> · 本局結束解除</span></button>` : ''}
    </div>`;
  }
  function emblem(element, monster, version) {
    const species = version >= 2 && root.MahjongCultivationMonsters?.get(monster.speciesId);
    if (species) return `<img src="${escape(species.image)}" alt="${escape(species.name)}" class="cult-emblem cult-journey-emblem">`;
    return `<img src="assets/cultivation-vfx/monster.png" alt="${escape(elements[element] || '五行')}屬性妖獸" class="cult-emblem">`;
  }
  function monsterMarkup(state, locked) {
    const combat = state.cultivation, monster = combat.monster;
    if (!monster) return '';
    const attack = monster.nextAttack || {};
    const skill = root.MahjongMonsterSkills?.get(attack.skillId);
    const all = attack.type === 'all';
    const destination = all ? '全體道友' : locked >= 0 ? playerName(state, locked) : '無有效目標';
    const remaining = Math.max(0, 4 - (combat.discardCount || 0));
    return `<div class="cult-monster-top">${emblem(monster.element, monster, combat.version)}<span><small><span class="cult-monster-number">第 ${number(monster.index || combat.monsterIndex || 1)} 隻 · </span>${escape(elements[monster.element] || '五行')}屬性</small><strong>${escape(monster.name || '五行妖獸')}</strong></span></div>
      <div class="cult-boss-hp"><div class="cult-bar cult-enemy-bar" role="meter" aria-label="怪物生命" aria-valuenow="${Math.max(0, Number(monster.hp) || 0)}" aria-valuemin="0" aria-valuemax="${Number(monster.maxHp) || 1}"><i style="width:${ratio(monster.hp, monster.maxHp)}%"></i></div><div class="cult-monster-hp"><b>${number(monster.hp)}</b><span> / ${number(monster.maxHp)}</span></div></div>
      <div class="cult-boss-tags">${(monster.statuses || []).length ? `<div class="cult-statuses cult-monster-status">${monster.statuses.slice(0, 2).map(status => `<span>${escape(statusText(status))}</span>`).join('')}</div>` : ''}<button type="button" class="cult-monster-lookup" aria-label="查看${escape(monster.name)}完整技能組">${skill ? escape(skill.name) : '一般攻擊'}${attack.sealed ? ' · 已封印' : ''} ↗</button></div>
      <div class="cult-monster-stage" aria-hidden="true"></div>
      <div class="cult-boss-intent${attack.charged ? ' is-charged' : ''}${attack.cancelled ? ' is-cancelled' : ''}"><span class="cult-intent-icon" aria-hidden="true">${attack.cancelled ? '斷' : all ? '群' : '攻'}</span><strong class="cult-intent-damage">${attack.cancelled ? '—' : number(attack.damage)}</strong>
      <div class="cult-attack${attack.charged ? ' is-charged' : ''}" title="基礎傷害；實際傷害另計怪物減益與自己的防禦"><b>${attack.cancelled ? '已打斷' : `${all ? '全體' : '單體'} · ${attack.charged ? '可打斷' : '不可打斷'}`}</b><span>${attack.cancelled ? '此次不攻擊' : `${number(attack.damage)} <small>基礎</small>`}</span></div>
      ${skill && !attack.sealed && !attack.cancelled ? `<div class="cult-monster-extra">${escape([skill.hits>1?skill.hits+'段連擊':'',skill.strip?'先削盾 '+skill.strip:'',skill.heal&&(monster.heals||0)<2?'回復 '+skill.heal+'（剩'+(2-(monster.heals||0))+'次）':'',skill.shield&&(monster.shields||0)<2?'獲盾 '+skill.shield+'（剩'+(2-(monster.shields||0))+'次）':'',skill.riposte?'劍罡反震 30（一次）':'',skill.ailment?(skill.ailment.topOnly?'最高仇恨者：':'')+root.MahjongMonsterSkills.labels[skill.ailment.kind]+' '+(skill.ailment.kind==='burn'?skill.ailment.value:Math.round(skill.ailment.value*100)+'%')+' · '+skill.ailment.duration+'次自身出牌':''].filter(Boolean).join('／'))}</div>` : ''}</div>
      <div class="cult-boss-turn"><div class="cult-target" title="${escape(destination)}">${all ? '目標' : '鎖定'} · ${escape(destination)}</div>
      <div class="cult-countdown">${combat.ended ? '戰鬥已結束' : combat.enemyDue ? '等待牌局反應後出手' : `再出牌 ${remaining} 次後出手`}<span class="cult-pips" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i${i < 4 - remaining || combat.enemyDue ? ' class="on"' : ''}></i>`).join('')}</span></div></div>`;
  }
  function logText(state, entry) {
    if (typeof entry === 'string') return entry;
    const pid = entry.pid ?? entry.owner;
    const skill = root.MahjongCultivationSkills?.get(entry.skillId);
    const secret = entry.secret && pid !== 0 && !state.cultivation.ended;
    if (secret && entry.type === 'skill') return `${playerName(state, pid)}施放秘術`;
    if (entry.text || entry.message) return entry.text || entry.message;
    if (skill || entry.type === 'skill') return `${playerName(state, pid)} · ${skill?.name || entry.name || '技能'}`;
    const actor = Number.isInteger(pid) ? playerName(state, pid) : '怪物';
    if (entry.type === 'damage') return `${actor}造成 ${number(entry.amount)} 傷害`;
    if (entry.type === 'finisherPart') return `${actor} · ${entry.label} → ${entry.name}`;
    if (entry.type === 'heal') return `${actor}恢復 ${number(entry.amount || entry.actual)} 生命`;
    if (entry.type === 'hurt') return `${actor}受到 ${number(entry.amount)} 傷害`;
    if (entry.type === 'kill') return `${actor}擊敗${entry.name || '怪物'}`;
    if (entry.type === 'spawn') return `${entry.name || '新的怪物'}現身`;
    if (entry.type === 'item') return `${playerName(state, entry.pid)}使用${entry.name || root.MahjongCultivationItems?.get(entry.itemId)?.name || '道具'}`;
    if (entry.type === 'enemy') return '怪物發動攻擊';
    if (entry.type === 'monsterSkill') return `${entry.name || root.MahjongMonsterSkills?.get(entry.skillId)?.name || '怪物招式'} · ${entry.targets?.length > 1 ? '全體' : '單體'}`;
    if (entry.type === 'end') return '戰鬥結束，按累積傷害排名';
    return '戰鬥狀態已更新';
  }
  function render(state) {
    currentState = state;
    const active = !!state?.cultivation;
    document.documentElement.classList.toggle('cultivation-mode', active);
    root.MahjongCultivationEffects?.sync(state);
    root.MahjongMonsterEffects?.sync(state);
    ensureCatalog();
    document.querySelectorAll('.cult-player-stats').forEach(node => node.remove());
    document.querySelectorAll('.cult-targeted,.cult-weakened').forEach(node => node.classList.remove('cult-targeted', 'cult-weakened'));
    let monsterNode = document.getElementById('cultivationMonster');
    if (!active) {
      root.MahjongCultivationCatalog?.close();
      monsterNode?.remove();
      document.getElementById('cultivationLog')?.replaceChildren();
      const live = document.getElementById('cultivationLive');
      if (live) live.textContent = '';
      lastAnnouncement = '';
      if (activeChoice) activeChoice(false);
      return;
    }
    bindMeldSkills(state);
    bindFlowerSkills(state);
    const locked = target(state.cultivation);
    state.cultivation.players.forEach((player, pid) => {
      const info = document.getElementById(`playerInfo${pid}`);
      if (!info) return;
      info.classList.toggle('cult-targeted', pid === locked && state.cultivation.monster?.nextAttack?.type !== 'all');
      info.classList.toggle('cult-weakened', player.hp <= 0);
      info.insertAdjacentHTML('beforeend', playerStats(state, pid, pid === locked && state.cultivation.monster?.nextAttack?.type !== 'all'));
      if (state.cultivation.version >= 2) {
        const hero = root.MahjongCultivationHeroes.get(player.heroId);
        const portrait = info.querySelector('.seat-portrait');
        if (portrait) {
          portrait.style.backgroundImage = 'none';
          portrait.innerHTML = `<img src="${escape(hero.image)}" alt="" class="cult-hero-portrait">`;
        }
        const name = info.querySelector('.seat-name');
        if (name?.firstChild?.nodeType === 3) name.firstChild.textContent = hero.name;
        if (name) {
          name.classList.add('cult-hero-detail-trigger');
          name.title = `${playerName(state, pid)} · ${hero.role} · 查看角色與被動`;
          name.setAttribute('role', 'button'); name.setAttribute('aria-haspopup', 'dialog'); name.tabIndex = 0;
          const show = () => { information(`${hero.name} · ${hero.role}`, `<div class="role-sheet"><figure class="role-portrait"><img src="${escape(hero.image)}" alt="${escape(hero.name)}"></figure><div class="role-main">${root.MahjongCultivationJourneyUI.heroDetails(hero) + root.MahjongCultivationJourneyUI.passiveState(currentState.cultivation.players[pid], currentState.cultivation.monster.id) + (root.MahjongCultivationEquipmentUI?.roleInfo(currentState.cultivation.players[pid]) || '')}</div></div>`, 'cult-role-sheet');
            // Only sets with pieces worn (rendered open) are shown on the status sheet.
            document.querySelectorAll('#cultivationInformation .equip-sets details:not([open])').forEach(node => node.remove());
            document.querySelectorAll('#cultivationInformation .equip-sets:empty').forEach(node => node.remove()); };
          name.onclick = show;
          name.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } };
        }
      }
      info.querySelector('[data-seals]')?.addEventListener('click', () => information(`${playerName(state, pid)} · 劫印`, `<p>本局結束解除，普通淨化無效。同類取最強，不同類並存。</p><p>${escape(sealList(player, 'activeSeals'))}</p>`));
    });
    if (!monsterNode) {
      monsterNode = document.createElement('section');
      monsterNode.id = 'cultivationMonster';
      monsterNode.className = 'cult-monster';
      monsterNode.setAttribute('aria-label', '怪物戰鬥資訊');
      document.querySelector('.center-area')?.append(monsterNode);
    }
    monsterNode.dataset.element = state.cultivation.monster?.element || 'earth';
    monsterNode.innerHTML = monsterMarkup(state, locked);
    const lookup = () => root.MahjongCultivationCatalog?.open({family:'monster',query:state.cultivation.monster.name});
    monsterNode.querySelector('.cult-monster-lookup').onclick = lookup;
    const portrait=monsterNode.querySelector('.cult-emblem');
    if(portrait){portrait.setAttribute('role','button');portrait.setAttribute('aria-label','查看怪物技能');portrait.tabIndex=0;portrait.onclick=lookup;portrait.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();lookup();}};}
    const entries = (state.cultivation.log || []).slice(-8).reverse();
    const log = document.getElementById('cultivationLog');
    const kindOf = entry => { const type = typeof entry === 'string' ? '' : entry.type;
      return type === 'damage' ? 'dmg' : type === 'heal' ? 'heal' : type === 'hurt' ? 'hurt' : ['skill', 'finisherPart'].includes(type) ? 'sk'
        : ['enemy', 'monsterSkill', 'interrupted', 'ailment', 'kill', 'spawn', 'enemyHeal', 'enemyShield'].includes(type) ? 'mon' : 'info'; };
    if (log) log.innerHTML = entries.length ? entries.map(entry => `<li data-kind="${kindOf(entry)}">${escape(logText(state, entry))}</li>`).join('') : '<li data-kind="info">成功出牌與組牌後，會在這裡記錄戰鬥。</li>';
    const table = document.getElementById('cultBattleTable');
    if (table) {
      const locked = root.MahjongCultivationCombat?.target?.(state.cultivation);
      table.innerHTML = '<div class="cft-row cft-head"><span>道友</span><span>生命</span><span>傷害</span><span>仇恨</span></div>' + state.cultivation.players.map((player, pid) => {
        const ratioHp = Math.max(0, Math.min(100, player.hp / (player.maxHp || 1000) * 100));
        return `<div class="cft-row${pid === locked && state.cultivation.monster?.nextAttack?.type !== 'all' ? ' is-target' : ''}${player.hp === 0 ? ' is-weak' : ''}"><b>${escape(playerName(state, pid))}</b><span class="cft-hp" title="生命 ${number(player.hp)} / ${number(player.maxHp || 1000)}${player.shield > 0 ? ' · 護盾 ' + number(player.shield) : ''}"><i class="${ratioHp <= 35 ? 'is-low' : ''}" style="width:${ratioHp}%"></i>${player.shield > 0 ? `<i class="cft-shield" style="width:${Math.min(100, player.shield / 10)}%"></i>` : ''}</span><em>${number(player.damage)}</em><u>${number(player.aggro)}</u></div>`;
      }).join('');
    }
    const statusReference = document.getElementById('cultivationStatusReference');
    if (statusReference) statusReference.innerHTML = `<p>第 ${number(state.cultivation.monster?.index || 1)} 隻 · ${escape(state.cultivation.monster?.name)}：${escape((state.cultivation.monster?.statuses || []).map(status => statusText(status) + '怪物行動').join('、') || '無狀態')}</p>`
      + state.cultivation.players.map((player, pid) => `<p>${escape(playerName(state, pid))}：傷害 ${number(player.damage)}／仇恨 ${number(player.aggro)}；${player.shield > 0 ? `護盾 ${number(player.shield)}／剩 ${number(player.shieldTurns)} 次自身出牌；` : ''}${escape(player.statuses.map(status => statusText(status) + '自身出牌').join('、') || '無其他狀態')}</p>`).join('');
    let live = document.getElementById('cultivationLive');
    if (!live) {
      live = document.createElement('div'); live.id = 'cultivationLive'; live.className = 'cult-sr-only';
      live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); document.body.append(live);
    }
    const announcement = entries[0] ? logText(state, entries[0]) : '';
    if (announcement !== lastAnnouncement) { lastAnnouncement = announcement; live.textContent = announcement; }
    if (activeChoice && state.phase !== 'play') activeChoice(false);
    root.MahjongCultivationEffects?.sync(state);
  }

  function ensureCatalog() {
    const body = document.getElementById('tmCultSlot') || document.querySelector('#tableMenu .table-menu-body');
    if (!body || document.getElementById('cultivationCatalog')) return;
    const section = document.createElement('section');
    section.id = 'cultivationCatalog'; section.className = 'cult-catalog';
    section.innerHTML = `<div class="cult-catalog-entry"><div><h3>修仙技能圖鑑</h3><p>169 種牌組技能 · 38 項終式 · 35 招怪物技能<br>牌組、花陣、劫印與妖獸招式，一起查找比較。</p></div><button type="button" id="cultivationCatalogOpen">開啟圖鑑 →</button></div>
      <details class="cult-log-details"><summary>修仙戰況</summary><div id="cultivationStatusReference"></div><ol id="cultivationLog"></ol></details>`;
    section.querySelector('#cultivationCatalogOpen').onclick = () => root.MahjongCultivationCatalog?.open();
    body.prepend(section);
    const vfx = document.createElement('div'); vfx.className = 'cult-vfx-controls';
    vfx.innerHTML = '<label><input type="checkbox" id="cultivationVfxEnabled">上古神兵 · 技能攻擊特效</label><p>音效共用主音量；可在各招式下試放與試聽。減少動態效果會改為短促命中回饋。</p>';
    section.querySelector('.cult-log-details').before(vfx);
    // 戰況 sits on the table: a corner card on large screens, a button with a popover on small ones.
    const details = section.querySelector('.cult-log-details');
    const feed = document.createElement('aside'); feed.id = 'cultBattleFeed'; feed.className = 'cult-battle-feed'; feed.setAttribute('aria-label', '戰況');
    feed.innerHTML = '<button type="button" class="cult-feed-toggle" aria-expanded="false" aria-controls="cultBattleFeedBody" title="拖曳移動 · 雙擊回到預設位置"><span class="cult-feed-grip" aria-hidden="true">⠿</span><span class="cult-feed-seal" aria-hidden="true">戰</span><span class="cult-feed-title">戰況</span><span class="cult-feed-more">詳情</span></button><div id="cultBattleFeedBody" class="cult-feed-body"><div id="cultBattleTable" class="cult-feed-table" role="table" aria-label="道友戰況"></div></div>';
    feed.querySelector('.cult-feed-body').append(...details.querySelectorAll('#cultivationLog, #cultivationStatusReference'));
    details.remove(); document.body.append(feed);
    const toggle = feed.querySelector('.cult-feed-toggle');
    const setOpen = open => { feed.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); feed.querySelector('.cult-feed-more').textContent = open ? '收合' : '詳情'; };
    const POS_KEY = 'qinghe_cult_feed_pos';
    const floating = () => !matchMedia('(max-width: 899px), (max-height: 599px)').matches;
    const clampTo = (x, y) => [Math.min(Math.max(8, x), innerWidth - feed.offsetWidth - 8), Math.min(Math.max(8, y), innerHeight - feed.offsetHeight - 8)];
    const place = () => {
      let pos = null; try { pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (_) { /* optional preference */ }
      if (!floating() || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) { feed.style.left = feed.style.top = ''; return; }
      const [x, y] = clampTo(pos.x * innerWidth, pos.y * innerHeight); feed.style.left = x + 'px'; feed.style.top = y + 'px';
    };
    let drag = null, dragged = false;
    toggle.addEventListener('pointerdown', event => {
      if (!floating() || event.button !== 0) return;
      const r = feed.getBoundingClientRect(); drag = { dx: event.clientX - r.left, dy: event.clientY - r.top, sx: event.clientX, sy: event.clientY }; dragged = false;
      toggle.setPointerCapture?.(event.pointerId);
    });
    toggle.addEventListener('pointermove', event => {
      if (!drag || (!dragged && Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) < 5)) return;
      dragged = true; feed.classList.add('is-dragging');
      const [x, y] = clampTo(event.clientX - drag.dx, event.clientY - drag.dy); feed.style.left = x + 'px'; feed.style.top = y + 'px';
    });
    const endDrag = () => {
      if (!drag) return; drag = null; feed.classList.remove('is-dragging');
      if (dragged) { const r = feed.getBoundingClientRect(); try { localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); } catch (_) { /* optional preference */ } }
    };
    toggle.addEventListener('pointerup', endDrag); toggle.addEventListener('pointercancel', endDrag);
    toggle.addEventListener('dblclick', () => { try { localStorage.removeItem(POS_KEY); } catch (_) { /* optional preference */ } place(); });
    root.addEventListener('resize', place); requestAnimationFrame(place);
    toggle.onclick = event => { if (dragged) { dragged = false; event.preventDefault(); return; } setOpen(!feed.classList.contains('is-open')); };
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && feed.classList.contains('is-open')) { setOpen(false); toggle.focus({ preventScroll: true }); } });
    document.addEventListener('pointerdown', event => { if (feed.classList.contains('is-open') && !feed.contains(event.target) && matchMedia('(max-width: 899px), (max-height: 599px)').matches) setOpen(false); });
    const vfxToggle = vfx.querySelector('input'); vfxToggle.checked = root.MahjongCultivationEffects?.enabled !== false;
    vfxToggle.addEventListener('change', () => root.MahjongCultivationEffects?.setEnabled(vfxToggle.checked));
  }

  function chooseSkills(options, onChoose, onCancel) {
    if (!Array.isArray(options) || options.length === 0) return;
    if (activeChoice) activeChoice(false);
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog'); dialog.className = 'cult-choice'; dialog.id = 'cultivationChoice';
    dialog.setAttribute('aria-labelledby', 'cultivationChoiceTitle');
    dialog.innerHTML = `<header><div><p>組牌 · 施法</p><h2 id="cultivationChoiceTitle">選擇這一招</h2></div><button type="button" class="cult-choice-cancel" aria-label="取消技能選擇">取消 ×</button></header><p>選擇合法牌組後立即施放。取消會返回牌桌，不消耗牌。</p><div class="cult-choice-options">${options.map((option, index) => `<button type="button" class="cult-choice-option" data-option="${index}"><span class="cult-choice-label">${escape(option.label || `${actions[option.action] || '組牌'} · ${(option.keys || [option.key]).filter(Boolean).map(k => root.MahjongTileNames?.getName?.(k) || k).join(' ')}`)}</span>${skillPreview(option)}</button>`).join('')}</div>`;
    document.body.append(dialog);
    let done = false;
    const close = (cancelled = true, selected = null) => {
      if (done) return;
      done = true; activeChoice = null;
      dialog.close(); dialog.remove();
      if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus({ preventScroll: true });
      if (selected !== null) onChoose?.(selected);
      else if (cancelled) onCancel?.();
      // The claim button that opened the dialog is gone after casting; keep keyboard focus on the table.
      const focused = document.activeElement;
      if (!focused || focused === document.body || focused.disabled || !focused.getClientRects().length)
        (document.querySelector('#yourHand button:not(:disabled)') || document.getElementById('tableMenuBtn'))?.focus({ preventScroll: true });
    };
    activeChoice = close;
    dialog.querySelector('.cult-choice-cancel').addEventListener('click', () => close());
    dialog.querySelectorAll('[data-option]').forEach(button => button.addEventListener('click', () => close(false, options[Number(button.dataset.option)])));
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
      const next = buttons.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1);
      if (next < 0 || next >= buttons.length) { event.preventDefault(); buttons[(next + buttons.length) % buttons.length].focus(); }
    });
    dialog.showModal(); dialog.querySelector('[data-option]')?.focus();
  }

  function showResult(state) {
    if (!state?.cultivation) return;
    const panel = document.querySelector('#reactionPanel .result-panel');
    if (!panel) return;
    panel.classList.add('cult-result');
    const combat = state.cultivation;
    const rank = combat.players.map((player, pid) => ({ pid, damage: player.damage || 0 })).sort((a, b) => b.damage - a.damage || a.pid - b.pid);
    const leaders = rank.filter(player => player.damage === rank[0].damage);
    const failed = combat.result?.reason === 'defeat' || combat.result?.reason === 'all-weak' || combat.result?.reason === 'allWeak' || combat.players.every(player => player.hp <= 0);
    const won = Number.isInteger(state.winner) && state.winner >= 0;
    const head = panel.querySelector('.rs-head');
    if (head) head.innerHTML = `<div class="eyebrow">修仙論道 · 第 ${number(combat.handNumber || 1)} 局 · 傷害結算</div><h3>${failed ? '全員虛弱 · 挑戰結束' : `${leaders.length > 1 ? '並列首席' : '本局首席'} · ${leaders.map(row => escape(playerName(state, row.pid))).join('、')}`}</h3><div class="rs-summary"><span class="rs-from">${won ? `${escape(playerName(state, state.winner))}${(combat.finisher?.method === 'selfDraw' || (!combat.finisher && state.fromPlayer === -1)) ? '自摸' : combat.finisher?.method === 'robKong' ? '搶槓' : '點胡'}，終式已計分` : '無胡牌終式'}</span><span>擊敗 ${number(combat.kills?.length)} 隻 · 傷害含過量傷害</span></div>`;
    if (head && (combat.finisher || combat.players.some(p => p.pendingSeals?.length || p.expiredSeals?.length))) {
      head.insertAdjacentHTML('beforeend', `<button type="button" class="cult-finish-detail">終式 ${number(combat.finisher?.total || 0)} 傷害 · 查看連招與劫印</button>`);
      head.querySelector('.cult-finish-detail').onclick = () => information('終式連招與跨局劫印',
        `<p>${combat.finisher ? `${escape(playerName(state, combat.finisher.pid))} · ${escape({ selfDraw: '自摸', discard: '點胡', robKong: '搶槓' }[combat.finisher.method])} · 共 ${number(combat.finisher.total)} 傷害` : '本局無胡牌終式'}</p>`
        + (combat.finisher?.parts || []).map(part => `<div class="cult-finish-part"><span>${escape(part.label)} → <strong>${escape(part.name)}</strong></span><b>${number(part.damage)} 傷害</b></div>`).join('')
        + combat.players.map((p, pid) => `${p.expiredSeals?.length ? `<p>${escape(playerName(state, pid))}：上一局劫印已於本局結算後解除。</p>` : ''}${p.pendingSeals?.length ? `<p class="cult-pending-seals">${escape(playerName(state, pid))} · 下一局生效：${escape(sealList(p, 'pendingSeals'))}。下一局結束解除，普通淨化無效。</p>` : ''}`).join(''));
    }
    panel.querySelectorAll('.result-player').forEach((row, pid) => {
      const identity = row.querySelector('.rs-name');
      if (combat.version >= 2 && identity?.firstChild?.nodeType === 3) identity.firstChild.textContent = playerName(state, pid);
      const place = 1 + rank.filter(player => player.damage > combat.players[pid].damage).length;
      row.classList.toggle('winner', place === 1 && !failed); row.classList.remove('is-from');
      const points = row.querySelector('.rs-points');
      if (points) points.innerHTML = `<span class="cult-rank">第 ${place} 名</span><strong>${number(combat.players[pid].damage)}</strong><small>傷害</small>`;
      row.setAttribute('aria-label', `${playerName(state, pid)}，第 ${place} 名，${number(combat.players[pid].damage)} 傷害`);
      row.querySelector('.cult-result-seals')?.remove();
      row.querySelector('.equip-loot')?.remove();
      if (combat.version === 3) row.insertAdjacentHTML('beforeend', root.MahjongCultivationEquipmentUI?.loot(combat.players[pid]) || '');
      if (combat.players[pid].pendingSeals?.length) row.querySelector('.rs-name')?.insertAdjacentHTML('beforeend', `<small class="cult-result-seals" title="${escape(sealList(combat.players[pid], 'pendingSeals'))}">下局劫印 ${combat.players[pid].pendingSeals.length}</small>`);
    });
    currentState = state;
    bindFlowerSkills(state);
    const next = panel.querySelector('#btnContinueNext');
    if (next) next.textContent = combat.version >= 2 ? '前往整備 →' : '再戰一場 →';
    if (combat.version < 2 && head) head.insertAdjacentHTML('beforeend', '<p class="journey-muted">舊版旅程 · 保留既有修仙規則與劫印。重新開始旅程可選擇新英雄。</p>');
    // The normal renderer preserves all physical tiles. Fit each existing full row without scrolling.
    requestAnimationFrame(() => {
      panel.querySelectorAll('.rs-tiles').forEach(rail => {
        const tiles = rail.querySelectorAll('.tile');
        if (!tiles.length) return;
        const groups = [...rail.children];
        const labels = [...rail.querySelectorAll('.rs-tag')].reduce((sum, tag) => sum + tag.getBoundingClientRect().width + 4, 0);
        const gaps = Math.max(0, groups.length - 1) * 4 + groups.length * 6 + Math.max(0, tiles.length - groups.length);
        const tileWidth = Math.max(4, Math.min(40, (rail.clientWidth - gaps - labels - 10) / tiles.length));
        rail.style.setProperty('--rt', `${tileWidth}px`);
      });
    });
  }
  let resultResizePending = false;
  root.addEventListener('resize', () => {
    if (resultResizePending || !currentState?.cultivation?.ended) return;
    resultResizePending = true;
    requestAnimationFrame(() => { resultResizePending = false; showResult(currentState); });
  });
  root.MahjongCultivationUI = Object.freeze({ render, showResult, chooseSkills, skillPreview, closeChoice: () => { activeChoice?.(false); root.MahjongCultivationEffects?.closePreview?.(); root.MahjongCultivationCatalog?.close(); } });
})(typeof window !== 'undefined' ? window : globalThis);
