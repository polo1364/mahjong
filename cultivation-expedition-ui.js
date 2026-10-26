/* Expedition views use committed state and the existing preparation navigation. */
(function (root) {
  'use strict';
  const X = () => root.MahjongCultivationExpedition;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const percent = value => `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
  const kinds = { damage: '傷害', taken: '承傷', heal: '治療', shield: '護盾取得', aggro: '新增仇恨', basic: '普攻', active: '主動技能傷害' };
  const resources = { gold: '金幣', sand: '靈砂', metal: '金材料', wood: '木材料', water: '水材料', fire: '火材料', earth: '土材料',
    shard: '劫晶碎片', heal: '回春丹', barrier: '玉障符', cleanse: '清心丹', stealth: '匿影香', edge: '銳芒符', guard: '護元符',
    'weapon-stone': '淬鋒石', 'armor-stone': '鍛甲石', 'accessory-stone': '蘊靈石', luck: '祈運符', preserve: '鎮器保級符' };
  const effectText = effect => (effect ? Object.entries(effect).filter(([key]) => kinds[key]).map(([key, value]) => `${kinds[key]} ${percent(value)}`).join('、') : '');
  const resourceText = values => Object.entries(values).map(([key, value]) => `${resources[key] || key} ×${value}`).join('、');

  function title(combat) {
    if (combat.trial) return `渡劫・${root.MahjongCultivationProgression.realms[combat.trial.targetRealm].name}`;
    const completed = combat.expedition?.completed || 0;
    const inResult = combat.ended && combat.expedition?.settled.includes(combat.handNumber);
    return `${X().region(Math.max(0, completed - (inResult ? 1 : 0))).name}・修行第 ${combat.handNumber} 局`;
  }
  function result(host, combat) {
    const r = combat.expedition?.lastResult;
    if (!r) return;
    const s = r.scores[0], section = document.createElement('section');
    section.className = 'expedition-result';
    section.innerHTML = `<strong>歷練 ${s.total} / 100 分</strong><span>戰鬥 ${s.combat} · 操作 ${s.operation} · 胡牌 ${s.winning}</span><span>近期評分 ${r.recentScore.toFixed(1)} · 戰果指數 ${r.recentIndex.toFixed(1)}</span>`;
    host.append(section);
  }
  function details(player) { return `<p class="expedition-effect">奇遇：${esc(effectText(player.expeditionEffect) || '無')}（與裝備、境界、功法相加）</p>`; }

  // One event choice: cost → reward, the next-hand effect, and why it cannot be taken.
  function choiceButton(combat, choice, pendingEffect) {
    let affordable = true;
    try { X().chooseEvent(combat, choice.id); } catch (_) { affordable = false; }
    return `<button type="button" data-expedition-event="${choice.id}" ${affordable ? '' : 'disabled data-unaffordable'}><strong>${esc(resourceText(choice.cost) || '接受代價')} → ${esc(resourceText(choice.reward) || '下局加成')}</strong>`
      + (choice.effect ? `<span>下局${esc(effectText(choice.effect))}</span>` : '')
      + (choice.effect && pendingEffect ? '<em>此效果會取代目前待生效的奇遇。</em>' : '')
      + (affordable ? '' : '<span>資源不足</span>') + '</button>';
  }
  function eventMarkup(combat, event, pendingEffect) {
    if (!event) return '<p class="journey-muted">每區第 4、8、12、16 局後遇到奇遇。</p>';
    return `<div class="expedition-event"><h3>${esc(event.name)}${event.rare ? ' · 稀有' : ''}</h3><p>選擇一項或離開，處理後才開始下一局。</p>`
      + event.choices.map(choice => choiceButton(combat, choice, pendingEffect)).join('')
      + '<button type="button" data-expedition-event="leave">離開，不領取獎勵</button></div>';
  }
  function bossMarkup(expedition, choices) {
    if (!choices.length) return '';
    return '<div class="expedition-boss"><h3>選擇下場小王</h3>' + choices.map((choice, i) => {
      const monster = root.MahjongCultivationMonsters.get(choice.speciesId);
      const selected = expedition.bossChoice?.speciesId === choice.speciesId && !!expedition.bossChoice.advanced === choice.advanced;
      const label = choice.advanced ? '進階：生命 ×1.15、額外劫晶碎片 ×1' : monster.region ? '地區首領' : '原小王';
      return `<button type="button" data-expedition-boss="${i}" aria-pressed="${selected}">${esc(monster.name)} · ${label}</button>`;
    }).join('') + '</div>';
  }
  function preparation(host, combat, options = {}) {
    if (!combat.expedition) return;
    const e = combat.expedition, r = X().progress(e), scale = X().difficulty(e.recentIndices);
    const profile = options.expeditionProfile || X().createProfile();
    const event = e.pendingEvent && X().events.find(x => x.id === e.pendingEvent.eventId);
    const choices = X().bossOptions(combat, profile, root.MahjongCultivationMonsters.all);
    const qualifies = profile.regions[r.id];
    const counting = e.recentScores.length < 3 ? `（本旅程累積滿 3 局才列入，目前 ${e.recentScores.length} 局）` : '';
    host.innerHTML = `<section class="journey-panel expedition-card"><p class="journey-kicker">五行巡歷 · 第 ${r.cycle} 輪</p><h2>${esc(r.name)}</h2>`
      + `<p>區內已完成 ${r.local} / 16 局 · 下局為修行第 ${combat.handNumber + 1} 局</p>`
      + `<p>下一局新怪物：生命 ×${scale.life.toFixed(2)} · 傷害 ×${scale.damage.toFixed(2)}</p>`
      + `<p class="journey-muted">重戰怪物沿用初次登場強度。近期戰果 ${e.recentIndices.length ? X().mean(e.recentIndices).toFixed(1) : '尚無紀錄'}。</p>`
      + `<p>最高近期評分 ${qualifies.highest.toFixed(1)}${counting} · ${qualifies.rare ? '稀有奇遇已解鎖' : '60 分解鎖稀有奇遇'} · ${qualifies.advanced ? '進階首領已解鎖' : '75 分解鎖進階首領'}</p>`
      + `<p>下局奇遇：${esc(effectText(e.pendingEffect) || '無')}；渡劫保留、不消耗。</p>`
      + eventMarkup(combat, event, e.pendingEffect) + bossMarkup(e, choices)
      + '<p role="status" class="expedition-status"></p></section>';
    const buttons = () => host.querySelectorAll('button');
    const act = async callback => {
      options.onBusy?.(true);
      buttons().forEach(button => { button.disabled = true; });
      try { const next = await callback(); options.onBusy?.(false); options.onUpdated?.(next); }
      catch (error) {
        host.querySelector('.expedition-status').textContent = `保存未完成：${error.message}，可重試。`;
        // Re-enable for a retry, but a choice the player cannot afford stays disabled.
        buttons().forEach(button => { button.disabled = button.hasAttribute('data-unaffordable'); });
      }
      finally { options.onBusy?.(false); }
    };
    host.querySelectorAll('[data-expedition-event]').forEach(button => { button.onclick = () => act(() => options.onEvent(button.dataset.expeditionEvent)); });
    host.querySelectorAll('[data-expedition-boss]').forEach(button => { button.onclick = () => act(() => options.onBoss(choices[Number(button.dataset.expeditionBoss)])); });
  }
  root.MahjongExpeditionUI = Object.freeze({ title, result, preparation, details, effectText });
})(window);
