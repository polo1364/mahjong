/* Read-only skill reference. Values come from the same records as combat. */
(function (root) {
  'use strict';
  const actions = { chow: '吃', pong: '碰', exposed: '明槓', concealed: '暗槓', added: '加槓', flower: '補花', formation: '花陣', finish: '胡牌終式', monster: '怪物出招' };
  const families = { W: '赤晶', T: '靈珠', B: '飛劍', honor: '字牌', flower: '花牌', formation: '花陣', finish: '胡牌台型', monster: '怪物技能' };
  const elements = { fire: '火', water: '水', metal: '金', wood: '木', earth: '土', neutral: '無屬性' };
  const purposes = { attack: '攻擊', heal: '治療', defense: '防禦', counter: '反擊', aggro: '仇恨', control: '控制', support: '輔助' };
  const triggers = { chow: '合法吃牌成功時', pong: '合法碰牌成功時', exposed: '明槓成功時', concealed: '暗槓成功時', added: '加槓成功且未被搶胡時', flower: '補入並公開此花牌時', formation: '集齊花組時，每局一次' };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  function keysFor(skill) {
    if (/^[WTB]$/.test(skill.family)) return [...skill.combo].map(n => skill.family + n);
    if (skill.family === 'honor') return Array(skill.action === 'pong' ? 3 : 4).fill(skill.combo);
    if (/^H[1-8](,H[1-8])*$/.test(skill.combo)) return skill.combo.split(',');
    if (skill.combo === 'eight') return Array.from({ length: 8 }, (_, i) => 'H' + (i + 1));
    return [];
  }
  function roles(effects) {
    const found = new Set();
    function visit(e) {
      const kind = e.kind || '';
      if (['damage', 'dot', 'mark', 'convert', 'consumeDot'].includes(e.op)) found.add('attack');
      if (e.op === 'heal' || e.lifeSteal || e.lifeStealWeak || /heal|lifesteal|^hot$/i.test(kind)) found.add('heal');
      if (e.op === 'shield' || /Shield|shield|guard|Guard|reduce|immune/.test(kind) || kind === 'lifestealOverflow') found.add('defense');
      if (/counter|Counter|shieldBreakDamage|shieldEndDamage/.test(kind)) { found.add('counter'); found.add('attack'); }
      if (e.op === 'aggro' || /aggro|Aggro/.test(kind) || e.extraAggro || e.aggroFactor != null || /Aggro/.test(e.when || '') || e.scale?.source === 'aggro' || e.trigger === 'enemySingleOther') found.add('aggro');
      if (e.op === 'control' || e.control) found.add('control');
      if (['buff', 'debuff', 'cleanse', 'removeBuff'].includes(e.op)) found.add('support');
      (e.onKill || []).forEach(visit);
      if (e.debuff) visit({ op: 'debuff', ...e.debuff });
    }
    effects.forEach(visit);
    return Object.keys(purposes).filter(key => found.has(key));
  }
  function records() {
    const names = root.MahjongTileNames;
    const skills = root.MahjongCultivationSkills;
    const finishers = root.MahjongCultivationFinishers;
    const tileWords = keys => [...new Set(keys)].flatMap(key => [names?.getName(key), names?.getLegacyName(key), key]).filter(Boolean).join(' ');
    const result = skills.all.filter(s => s.id !== 'finish.hu').map(s => {
      const keys = keysFor(s);
      const combo = /^[WTB]$/.test(s.family) ? `${families[s.family]} ${s.combo}` : s.combo === 'seven' ? '任意七種花牌 · 七搶一' : s.combo === 'eight' ? '八種花牌 · 八仙過海' : [...new Set(keys)].map(k => names.getName(k)).join('・');
      const details = skills.details(s);
      const legacy = [...new Set(keys)].map(k => names.getLegacyName(k)).join('・');
      const aggroAliases = s.effects.map(e => e.op === 'aggro' && e.mode === 'reduce' || /aggroRate/i.test(e.kind || '') && e.value < 1 ? '降仇' : e.op === 'aggro' && e.mode === 'top' ? '挑釁' : '').join(' ');
      const element = new Set(s.effects.filter(e => e.op === 'damage').map(e => e.element || s.element)).size > 1 ? 'multi' : s.element;
      return { id: s.id, name: s.name, description: s.description, action: s.action, family: s.family, element, keys, combo, legacy, details, roles: roles(s.effects), trigger: s.finisher ? '花胡成立時；取代普通終式，不重複施放' : triggers[s.action], search: `${tileWords(keys)} ${s.combo} ${aggroAliases} ${s.combo === 'seven' ? '春夏秋冬梅蘭竹菊' : ''}` };
    });
    for (const row of finishers.all) {
      const method = row.selfOnly ? '僅自摸成立' : row.id === 'rob-kong' ? '搶槓成立' : ['all-chows', 'full-beg', 'human', 'last-discard'].includes(row.id) ? '僅點胡成立' : row.id === 'seven' ? '七搶一花胡成立' : '依實際成立台型，點胡／自摸皆可';
      const seal = row.curse ? `${finishers.describeSeal(row.curse)}；${row.id === 'base' ? '僅零台、無其他台型時施加' : row.id === 'seven' ? '由持單花者承受' : '僅點胡／搶槓的放槍者承受'}。下一局結束解除，普通淨化無效。` : '不施加劫印。';
      const details = row.special ? [row.description, '花胡專用終式；不疊加普通台型連招。'] : [row.id === 'base' ? '基本起手分配 240；高台達上限時等比例縮減。' : '按此台型實際台數分配傷害；不是額外一份完整終式傷害。', row.description];
      result.push({ id: 'finisher:' + row.id, finisher: row.id, name: row.name, description: row.description, action: 'finish', family: 'finish', keys: row.keys || [], combo: row.label, element: row.source === 'suit' || row.source === 'mixed' || row.source === 'keys' ? 'source' : row.keys?.length > 1 || row.id === 'eight' ? 'multi' : row.keys?.length === 1 ? finishers.element(row.keys[0]) : 'neutral', details, seal, roles: ['attack', ...(row.removeDefense ? ['support'] : []), ...(['top', 'not-top'].includes(row.bonus) ? ['aggro'] : [])], trigger: method, search: `${row.id === 'all-pungs' ? '碰碰胡' : ''} ${tileWords(row.keys || [])} ${seal}` });
    }
    for(const skill of root.MahjongMonsterSkills?.all || []){
      const species=root.MahjongCultivationMonsters.get(skill.speciesId),list=root.MahjongMonsterSkills.forSpecies(species.id);
      const rhythm=species.tier==='boss'?'每第3次行動施放五相劫雷，其餘依當前屬性出招；每2次行動換屬性':species.tier==='miniboss'?'第一招 → 第二招 → 第三招 → 普攻':species.tier==='elite'?'第一招 → 普攻 → 第二招 → 普攻':species.id==='bladefeather-crow'?'僅第一次行動，其後為普攻':'第1、4、7…次行動，其他為普攻';
      result.push({id:skill.id,monster:true,image:species.thumbnail||species.image,name:skill.name,description:root.MahjongMonsterSkills.describe(skill),action:'monster',family:'monster',element:skill.element,keys:[],combo:species.name,details:[rhythm,'每4次合法出牌行動一次；本招取代該次普攻。',skill.charged?'應對：打斷取消整招；封印降為同類型普攻。':'應對：單體鎖定最高仇恨；可用降仇、護盾、防禦應對。',skill.ailment?'負面狀態可淨化；按受影響者自己的出牌計次；怪物死亡時解除。':'削盾不算吸收，回血與獲盾每次遭遇各最多2次。'],roles:['attack',...(skill.heal?['heal']:[]),...(skill.shield?['defense']:[]),...(skill.riposte?['counter']:[]),...(skill.ailment?['control']:[])],trigger:`${species.name} · 第${list.indexOf(skill)+1}招`,search:species.name+' '+skill.id});
    }
    return result.map(row => ({ ...row, search: normalize([row.search, row.name, row.combo, row.description, row.trigger, ...row.details, actions[row.action], families[row.family], elements[row.element], ...row.roles.map(r => purposes[r])].join(' ')) }));
  }
  function filter(rows, options = {}) {
    const terms = String(options.query || '').trim().split(/\s+/).map(normalize).filter(Boolean);
    return rows.filter(row => (!options.action || row.action === options.action) && (!options.family || row.family === options.family) && (!options.role || row.roles.includes(options.role)) && terms.every(term => row.search.includes(term)));
  }
  let dialog = null;
  function close() { if (dialog?.open) dialog.close(); }
  function meldReference(meld, hideConcealed = false) {
    if (!meld || !['chow', 'pong', 'kong'].includes(meld.type)) return null;
    // Do not even resolve the hidden tiles: neither DOM nor preview may expose the secret skill.
    if (meld.type === 'kong' && meld.concealed && hideConcealed) return { secret: true };
    const action = meld.type === 'kong' ? meld.concealed ? 'concealed' : meld.added ? 'added' : 'exposed' : meld.type;
    const keys = (meld.tiles || []).map(tile => typeof tile === 'string' ? tile : root.tileKey(tile));
    const skill = root.MahjongCultivationSkills.find(action, keys);
    return skill ? { skillId: skill.id } : null;
  }
  function flowerReference(key, player, finisher = null) {
    if (!/^H[1-8]$/.test(key) || !player?.flowers?.includes(key)) return null;
    const skill = root.MahjongCultivationSkills.find('flower', key);
    if (!skill) return null;
    const related = [];
    for (const id of ['seasons', 'gentlemen']) {
      const formation = root.MahjongCultivationSkills.get('formation.' + id);
      if (player.formations?.includes(id) && keysFor(formation).every(k => player.flowers.includes(k)))
        related.push({ skillId: formation.id, status: '已成陣 · 本局已觸發，每局一次' });
    }
    for (const id of ['seven', 'eight']) {
      if (finisher?.parts?.some(part => part.id === id))
        related.push({ skillId: 'formation.' + id, status: '花胡終式 · 本局已施放' });
    }
    return { skillId: skill.id, related };
  }
  function open(initial = {}) {
    if (dialog?.open) return;
    const previous = document.activeElement, rows = records(), selected = new Set();
    const single = initial.secret ? { id: 'secret', name: '秘術', action: 'concealed', element: 'neutral', keys: [], combo: '對手暗槓', roles: [], trigger: '暗槓成功時施放', description: '此牌組仍未公開，牌型、技能名稱與數值於結算後公開。', details: ['目前可見的生命、護盾、傷害與仇恨請查看玩家資訊及修仙戰況。', '查閱說明不會重新施放技能。'], secret: true } : rows.find(row => row.id === initial.skillId);
    if (initial.skillId && !single) return;
    const related = single ? (initial.related || []).map(item => {
      const row = rows.find(row => row.id === item.skillId);
      return row ? { ...row, completion: item.status } : null;
    }).filter(Boolean) : [];
    let page = 0, comparing = false;
    dialog = document.createElement('dialog');
    dialog.id = 'cultivationCodex'; dialog.className = 'cult-codex';
    dialog.setAttribute('aria-labelledby', 'cultivationCodexTitle');
    const options = values => Object.entries(values).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    dialog.innerHTML = `<header class="codex-header"><div><span class="codex-eyebrow">雀仙門 · 修仙秘卷</span><h2 id="cultivationCodexTitle">技能圖鑑</h2><p>169 種牌組技能 · 38 項終式對照</p></div><button type="button" id="cultivationCodexClose" aria-label="關閉技能圖鑑">關閉 ×</button></header>
      <div class="codex-scroll"><section class="codex-filters" aria-label="搜尋與篩選"><label class="codex-search">搜尋招式、牌型或效果<input id="cultivationSkillSearch" type="search" placeholder="例如：123、青龍、東、碰碰胡、反擊" autocomplete="off"></label><label>動作<select id="cultivationAction"><option value="">全部動作</option>${options(actions)}</select></label><label>牌系<select id="cultivationFamily"><option value="">全部牌系</option>${options(families)}</select></label><label>用途<select id="cultivationPurpose"><option value="">全部用途</option>${options(purposes)}</select></label><button type="button" id="cultivationFilterReset">重設篩選</button></section>
      <details class="codex-guide"><summary>如何出招？胡牌與劫印怎麼算？</summary><div><p>每次合法出牌自動普攻。吃、碰、明槓、暗槓、加槓各有對應技能，合法組牌成功後額外施放。治療、護盾、增益及淨化只作用自己，怪物減益全員共用。</p><p>普通胡牌連招預算為 min(1500, 240＋60×台數)，先分配基本起手，再依成立台型分配其餘傷害；整套只消耗一次「下一招」增益。元素、護甲、虛弱及條件增傷會影響實際傷害。</p><p>門清自摸取代門清與自摸，暗刻只計最高階，平胡僅可點胡。七搶一、八仙過海在牌組與終式中均可查到，但使用同一花胡終式，不重複施放。</p><p>點胡／搶槓由放槍者承受下一局劫印；七搶一由持單花者承受。自摸不施加劫印。不同效果並存，同類取最強；傷害最多降低 35%、治療及護盾最多降低 30%、承傷最多增加 25%、新增仇恨最多增加 35%。</p><p>劫印持續到下一局結束，包含該局終式；普通淨化、續局與門規套用重開不會提前解除；「重開論道」或「重新開始修仙旅程」會清除連戰與劫印。怪物鎖定未虛弱玩家中仇恨最高者，結算依累積傷害排名。</p><p>圖鑑展示完整牌組作為規則參考，不代表其他玩家的實際暗槓。</p></div></details>
      <div class="codex-results-heading"><p id="cultivationSkillCount" role="status" aria-live="polite"></p><span>勾選最多 3 招比較</span></div><div id="cultivationSkillList" class="codex-grid"></div>
      <nav class="codex-pages" aria-label="圖鑑分頁"><button type="button" id="cultivationPrev">← 上一頁</button><span id="cultivationPage"></span><button type="button" id="cultivationNext">下一頁 →</button></nav></div>
      <footer class="codex-footer"><span id="cultivationSelected" role="status">已選 0 / 3 招</span><button type="button" id="cultivationClearCompare">清空</button><button type="button" id="cultivationCompare">比較招式</button></footer>`;
    const modal = dialog, find = selector => modal.querySelector(selector);
    const readFilters = () => ({ query: find('#cultivationSkillSearch').value, family: find('#cultivationFamily').value, action: find('#cultivationAction').value, role: find('#cultivationPurpose').value });
    function card(row) {
      const tiles = row.keys.length ? `<div class="codex-tiles" aria-hidden="true">${row.keys.map(key => `<span>${root.MahjongCrystalTiles?.render(key) || escape(root.MahjongTileNames.getName(key))}</span>`).join('')}</div>` : '';
      const motion = row.secret ? null : row.monster ? '妖獸專屬攻擊' : root.MahjongCultivationPresentation?.profile(row.id)?.label;
      const element = elements[row.element] || (row.element === 'source' ? '依來源牌元素' : '多元素');
      return `<article class="cult-skill-card codex-card" ${row.finisher ? `data-finisher="${escape(row.finisher)}"` : `data-skill="${escape(row.id)}"`} data-element="${row.element}">${row.completion ? `<p class="codex-formation-status">${escape(row.completion)}</p>` : ''}<div class="codex-card-top"><span>${actions[row.action]}</span><span>${element}</span></div><p class="codex-combo">${escape(row.combo)}</p>${tiles}${row.legacy ? `<p class="codex-legacy">原牌：${escape(row.legacy)}</p>` : ''}<h3>${escape(row.name)}</h3><p class="codex-trigger">${escape(row.trigger)}</p><div class="codex-tags">${row.roles.map(role => `<span>${purposes[role]}</span>`).join('')}</div><p>${escape(row.description)}</p><ul class="cult-skill-values">${row.details.filter(text => text !== row.description).map(text => `<li>${escape(text)}</li>`).join('')}</ul>${row.seal ? `<div class="codex-seal"><strong>下一局劫印</strong><p>${escape(row.seal)}</p></div>` : ''}${motion ? `<p class="codex-trigger codex-motion">招式演出 · ${escape(motion)}</p>` : ''}<div class="codex-card-actions"><button type="button" class="cult-skill-demo" data-demo="${escape(row.id)}" aria-label="試放與試聽：${escape(row.name)}">試放 · 試聽</button><label><input type="checkbox" data-compare="${escape(row.id)}" ${selected.has(row.id) ? 'checked' : ''}>比較<span class="sr-only">${escape(row.name)}</span></label></div></article>`;
    }
    function updateSelection() {
      find('#cultivationSelected').textContent = `已選 ${selected.size} / 3 招`;
      find('#cultivationCompare').disabled = !comparing && selected.size < 2;
      find('#cultivationCompare').textContent = comparing ? '返回列表' : `比較招式${selected.size ? '（' + selected.size + '）' : ''}`;
      find('#cultivationClearCompare').disabled = selected.size === 0;
      modal.querySelectorAll('[data-compare]').forEach(input => { input.disabled = !selected.has(input.dataset.compare) && selected.size === 3; });
    }
    function update(scroll = false) {
      const list = single ? [single, ...related] : comparing ? rows.filter(row => selected.has(row.id)) : filter(rows, readFilters());
      const pages = Math.max(1, Math.ceil(list.length / 12)); page = Math.min(page, pages - 1);
      find('#cultivationSkillCount').textContent = comparing ? `正在比較 ${list.length} 招` : `找到 ${list.length} 項對照 · 共 ${rows.length} 項`;
      find('#cultivationSkillList').innerHTML = (comparing ? list : list.slice(page * 12, (page + 1) * 12)).map(card).join('') || '<div class="codex-empty"><h3>沒有符合的招式</h3><p>試試新舊牌名、數字牌組，或重設篩選。</p><button type="button" data-reset>重設篩選</button></div>';
      if (single) {
        // A table lookup shows the effect only: no preview, audition, comparison or motion note.
        modal.querySelectorAll('.codex-card-actions, .codex-motion').forEach(node => node.remove());
        if (single.secret) {
          find('.codex-card-actions')?.remove();
          find('.codex-card-top span:last-child')?.remove();
          find('[data-skill]')?.removeAttribute('data-skill');
        }
      }
      find('#cultivationPage').textContent = `${page + 1} / ${pages}`;
      find('#cultivationPrev').disabled = page === 0;
      find('#cultivationNext').disabled = page >= pages - 1;
      find('.codex-pages').hidden = comparing || list.length === 0;
      modal.classList.toggle('is-comparing', comparing);
      updateSelection();
      if (scroll) find('.codex-scroll').scrollTop = 0;
    }
    function reset() {
      modal.querySelectorAll('.codex-filters input,.codex-filters select').forEach(control => { control.value = ''; });
      comparing = false; page = 0; update(true); find('#cultivationSkillSearch').focus({ preventScroll: true });
    }
    modal.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.demo) {
        if(root.MahjongMonsterSkills?.get(button.dataset.demo))root.MahjongMonsterEffects?.showPreview(button.dataset.demo);
        else root.MahjongCultivationEffects?.showPreview(button.dataset.demo);
      }
      else if (button.id === 'cultivationCodexClose') close();
      else if (button.id === 'cultivationFilterReset' || button.hasAttribute('data-reset')) reset();
      else if (button.id === 'cultivationPrev' || button.id === 'cultivationNext') { page += button.id === 'cultivationNext' ? 1 : -1; update(true); }
      else if (button.id === 'cultivationCompare') { comparing = !comparing; update(true); }
      else if (button.id === 'cultivationClearCompare') { selected.clear(); comparing = false; update(); find('#cultivationSkillSearch').focus({ preventScroll: true }); }
    });
    modal.addEventListener('change', event => {
      const input = event.target;
      if (!input.matches('[data-compare]')) return;
      if (input.checked && selected.size < 3) selected.add(input.dataset.compare); else selected.delete(input.dataset.compare);
      if (comparing) { if (selected.size < 2) comparing = false; update(); (find('[data-compare]') || find('#cultivationCodexClose')).focus({ preventScroll: true }); }
      else updateSelection();
    });
    modal.querySelectorAll('.codex-filters input,.codex-filters select').forEach(control => control.addEventListener('input', () => { page = 0; comparing = false; update(); }));
    modal.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select,summary')].filter(node => node.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    modal.addEventListener('close', () => {
      modal.remove(); if (dialog === modal) dialog = null;
      const replacement = initial.returnFocus?.();
      const target = previous?.isConnected && previous.getClientRects().length ? previous : replacement?.getClientRects().length ? replacement : document.getElementById('tableMenuBtn');
      target?.focus({ preventScroll: true });
    }, { once: true });
    if (single) {
      modal.classList.add('is-single');
      find('#cultivationCodexTitle').textContent = single.secret ? '暗槓秘術' : single.action === 'flower' ? '花牌與陣法' : '牌組技能';
      find('.codex-header p').textContent = initial.source || '牌桌上的已完成牌組';
      const note = document.createElement('p'); note.className = 'codex-meld-note';
      note.textContent = '技能效果參考；實際傷害依出招當下狀態計算。查閱不會再次施放。';
      if (single.action === 'flower') note.textContent += related.length ? ' 下方列出此玩家本局已觸發的花陣與花胡終式；效果不代表仍在持續。' : ' 此玩家尚無已觸發的花陣。';
      find('.codex-scroll').prepend(note);
    }
    find('#cultivationSkillSearch').value=initial.query || '';
    find('#cultivationFamily').value=initial.family || '';
    if(root.MahjongMonsterSkills)find('.codex-header p').textContent='169 種牌組技能 · 38 項終式 · 35 招怪物技能';
    document.body.append(modal); update(); modal.showModal(); find('#cultivationCodexClose').focus({ preventScroll: true });
  }
  const api = Object.freeze({ open, close, records, filter, keysFor, roles, meldReference, flowerReference });
  root.MahjongCultivationCatalog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
