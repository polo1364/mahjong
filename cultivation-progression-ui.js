/* Cultivation progress is displayed here; persistence and combat stay with the caller. */
(function (root) {
  'use strict';
  const P = () => root.MahjongCultivationProgression;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let editor = null;
  let returnFocus = null;

  function valid(profile) {
    if (!profile || !P()) return false;
    try { P().validate(profile); return true; } catch (_) { return false; }
  }
  function progress(profile) {
    const realm = P().realms[profile.realm], next = P().realms[profile.realm + 1];
    const width = next ? Math.max(0, Math.min(100, (profile.xp - realm.xp) / (next.xp - realm.xp) * 100)) : 100;
    const label = next ? `${profile.xp} / ${next.xp} 修為 · 下一境界 ${next.name}` : `${profile.xp} 修為 · 已達最高境界`;
    return `<div class="progression-meter" role="progressbar" aria-label="修為" aria-valuemin="${realm.xp}" aria-valuemax="${next?.xp ?? profile.xp}" aria-valuenow="${Math.min(profile.xp,next?.xp ?? profile.xp)}"><span style="width:${width}%"></span></div><p class="progression-muted">${esc(label)}</p>`;
  }
  function levelText(skill, level) { return `${Math.round(skill.values[level - 1] * 100)}%`; }
  const skillKinds = {basic:'普攻傷害',active:'組牌、花技與終式傷害',counter:'反擊傷害',heal:'治療量',shield:'護盾取得量',aggro:'新增仇恨降低'};
  function skillEffect(skill, level) {
    // The label already says 降低, so the reduction is written without a minus sign.
    const amount = `${skill.kind === 'aggro' ? '' : '+'}${levelText(skill, level)}`;
    return `${skillKinds[skill.kind] || skill.kind} ${amount}`;
  }
  function aiSummary(combat) {
    const members = combat?.players?.slice(1) || [];
    if (!members.length) return '';
    const breakthroughs = combat.progression?.aiBreakthroughs || [];
    return `<details class="progression-ai"><summary>同行道友養成 · ${members.length} 人</summary><ul>${members.map((member, index) => {
      const pid = index + 1, name = root.MahjongCultivationHeroes?.get?.(member.heroId)?.name || `道友 ${pid}`;
      const profile = member.progression;
      if (!valid(profile)) return `<li><strong>${esc(name)}</strong><span>養成資料未啟用</span></li>`;
      const realm = P().realms[profile.realm];
      const skills = P().skills.filter(skill => profile.allocation[skill.id]).map(skill => `${skill.name} ${profile.allocation[skill.id]} 級`).join('、') || '未配置功法';
      const breakthrough = breakthroughs.find(entry => entry.pid === pid);
      const remaining = profile.eligibleHand !== undefined ? Math.max(0,profile.eligibleHand+10-combat.handNumber) : null;
      const gear = Object.values(member.equipment || {}).map(uid => member.economy?.inventory?.find(item => item.uid === uid)).filter(Boolean);
      const supplies = member.economy ? `<span>整備：裝備 ${gear.length}/3 件 · 最高強化 +${Math.max(0,...gear.map(item => item.level))} · 備妥道具 ${member.economy.items?.prepared?.length || 0}/2 · 金幣 ${esc(member.economy.gold)} · 靈砂 ${esc(member.economy.sand)}</span>` : '';
      return `<li><strong>${esc(name)}</strong><span>${esc(realm.name)} · ${esc(profile.xp)} 修為 · ${esc(skills)}</span>${supplies}${breakthrough ? `<em>本次突破：${esc(realm.name)} · ${esc(realm.title)}</em>` : remaining !== null ? `<em>修為已達標，最多再 ${remaining} 局保底突破；戰績達標可提早。</em>` : ''}</li>`;
    }).join('')}</ul></details>`;
  }
  function details(player) {
    const profile = player?.progression;
    if (!profile) return '<section class="progression-details"><h3>修為與功法</h3><p>此旅程尚未啟用永久養成。</p></section>';
    if (!valid(profile)) return '<section class="progression-details"><h3>修為與功法</h3><p>養成資料無法讀取，請勿覆寫存檔。</p></section>';
    const realm = P().realms[profile.realm];
    const equipped = P().skills.filter(skill => profile.allocation[skill.id]);
    const bonus = P().bonuses(profile), pct = value => `${Math.round(value * 100)}%`;
    return `<section class="progression-details"><h3>修為與功法</h3><p><strong>${esc(realm.name)}</strong> · ${esc(realm.title)} · ${esc(profile.xp)} 修為</p><p>境界常駐（與裝備相加）：傷害 +${pct(bonus.damage)}、治療 +${pct(profile.realm * .01)}、護盾 +${pct(profile.realm * .01)}；承傷降低 ${pct(bonus.taken)}。</p><p>功法：${equipped.length ? equipped.map(skill => `${esc(skill.name)} ${esc(profile.allocation[skill.id])} 級（${esc(skillEffect(skill, profile.allocation[skill.id]))}）`).join('、') : '尚未配置'}</p></section>`;
  }
  function home(host, profile, trial, callbacks = {}) {
    if (!host) return;
    if (profile && !valid(profile)) { host.innerHTML = '<section class="progression-card"><h3>修為資料無法讀取</h3><p>請檢查存檔，暫勿開始新旅程。</p></section>'; return; }
    const data = profile || P()?.fresh();
    if (!data) return;
    const realm = P().realms[data.realm];
    host.innerHTML = `<section class="progression-card"><p class="progression-kicker">永久養成</p><h3>${esc(realm.name)} <small>${esc(realm.title)}</small></h3>${progress(data)}${trial ? '<div class="progression-actions"><button type="button" data-progression-resume>繼續渡劫</button><button type="button" data-progression-abandon>放棄渡劫</button></div><p class="progression-muted">放棄後返回原旅程整備；修為與原旅程道具不受影響。</p><p class="progression-error" role="status" aria-live="polite"></p>' : ''}</section>`;
    const act = async callback => {
      if (!callback) return;
      const buttons = host.querySelectorAll('.progression-actions button');
      buttons.forEach(button => button.disabled = true);
      try { await callback(); }
      catch (error) { host.querySelector('.progression-error').textContent = `操作失敗：${error?.message || '請稍後重試。'}`; }
      finally { buttons.forEach(button => { if (button.isConnected) button.disabled = false; }); }
    };
    host.querySelector('[data-progression-resume]')?.addEventListener('click', () => act(callbacks.onResume));
    host.querySelector('[data-progression-abandon]')?.addEventListener('click', () => act(callbacks.onAbandon));
  }
  function close() {
    if (!editor || editor.dataset.busy === 'true') return;
    const dialog = editor;
    editor = null;
    dialog.close(); dialog.remove();
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  }
  function preparation(host, combat, options = {}) {
    if (!host || !P()) return;
    let profile = options.profile || combat?.players?.[0]?.progression;
    if (!profile) { host.innerHTML = '<section class="progression-card"><h3>功法與渡劫</h3><p>此旅程尚未啟用永久養成。</p></section>'; return; }
    if (!valid(profile)) { host.innerHTML = '<section class="progression-card"><h3>功法與渡劫</h3><p>養成資料無法讀取，請勿覆寫存檔。</p></section>'; return; }
    const draw = () => {
      const next = P().realms[profile.realm + 1];
      const ready = !!next && profile.xp >= next.xp;
      const realm = P().realms[profile.realm];
      const used = Object.values(profile.allocation).reduce((a,b) => a+b, 0);
      const points = profile.xp >= 20 ? realm.points : 0;
      host.innerHTML = `<section class="progression-card"><p class="progression-kicker">修為 · 功法</p><h3>${esc(realm.name)} <small>${esc(realm.title)}</small></h3>${progress(profile)}<p>功法點 ${used}/${points} · 裝備功法 ${Object.keys(profile.allocation).length}/${realm.slots}</p><div class="progression-actions"><button type="button" data-progression-edit ${profile.xp < 20 ? 'disabled' : ''}>配置功法</button>${next ? `<button type="button" data-progression-trial ${ready ? '' : 'disabled'}>挑戰${esc(next.name)}渡劫</button>` : ''}</div><p class="progression-muted">${ready ? '試煉獨立進行；失敗不扣修為，也不消耗原旅程道具。' : profile.xp < 20 ? '累積 20 修為後開放六種功法。' : next ? `尚需 ${next.xp - profile.xp} 修為才能挑戰渡劫。` : '已達最高境界，修為仍會記錄。'}</p>${aiSummary(combat)}<p class="progression-error" role="status" aria-live="polite"></p></section>`;
      host.querySelector('[data-progression-edit]')?.addEventListener('click', openEditor);
      host.querySelector('[data-progression-trial]')?.addEventListener('click', async event => {
        if (!ready || !options.onTrial) return;
        const button = event.currentTarget;
        button.disabled = true;
        options.onBusy?.(true);
        try { await options.onTrial(); }
        catch (error) { host.querySelector('.progression-error').textContent = `渡劫未開始：${error?.message || '請稍後重試。'}`; }
        finally { options.onBusy?.(false); if (button.isConnected) button.disabled = false; }
      });
    };
    function openEditor() {
      if (editor || !options.onConfigure) return;
      returnFocus = document.activeElement;
      const dialog = document.createElement('dialog');
      dialog.className = 'progression-dialog';
      dialog.setAttribute('aria-labelledby', 'progressionEditorTitle');
      dialog.innerHTML = '<div class="progression-dialog-body"></div>';
      document.body.append(dialog); editor = dialog;
      const draft = {...profile.allocation};
      const realm = P().realms[profile.realm];
      const cap = profile.realm === 0 ? 1 : profile.realm === 1 ? 2 : 3;
      const points = profile.xp >= 20 ? realm.points : 0;
      let busy = false;
      const errorNode = () => dialog.querySelector('.progression-error');
      const paint = (message = '') => {
        const used = Object.values(draft).reduce((a,b) => a+b, 0), slots = Object.keys(draft).length;
        dialog.firstElementChild.innerHTML = `<header><p class="progression-kicker">整備配置 · 下一場生效</p><h2 id="progressionEditorTitle">六種功法</h2></header><p>剩餘功法點 ${points - used} / ${points} · 功法 ${slots} / ${realm.slots} · 單項最高 ${cap} 級</p><div class="progression-skill-list">${P().skills.map(skill => { const level = draft[skill.id] || 0; return `<div class="progression-skill"><div><strong>${esc(skill.name)}</strong><small>${esc(level ? `第 ${level} 級 · ${skillEffect(skill, level)}` : `未裝備 · 最高 ${skillEffect(skill, cap)}`)}</small></div><div class="progression-stepper"><button type="button" data-skill="${esc(skill.id)}" data-delta="-1" aria-label="降低${esc(skill.name)}等級" ${level ? '' : 'disabled'}>−</button><b>${level}</b><button type="button" data-skill="${esc(skill.id)}" data-delta="1" aria-label="提高${esc(skill.name)}等級" ${level < cap && used < points && (level || slots < realm.slots) ? '' : 'disabled'}>＋</button></div></div>`; }).join('')}</div><p class="progression-muted">可免費退點重配。保存成功後，下場戰鬥才套用新功法。</p><p class="progression-error" role="status" aria-live="polite">${esc(message)}</p><footer><button type="button" data-progression-cancel>取消</button><button type="button" data-progression-save>保存配置</button></footer>`;
        dialog.querySelectorAll('[data-skill]').forEach(button => button.onclick = () => {
          if (busy) return;
          const id = button.dataset.skill, level = (draft[id] || 0) + Number(button.dataset.delta);
          const candidate = {...draft}; if (level) candidate[id] = level; else delete candidate[id];
          try { P().configure(profile, candidate); Object.assign(draft, candidate); Object.keys(draft).filter(k => !candidate[k]).forEach(k => delete draft[k]); paint(); }
          catch (_) { errorNode().textContent = '點數、功法欄位或等級已達上限。'; }
        });
        dialog.querySelector('[data-progression-cancel]').onclick = close;
        dialog.querySelector('[data-progression-save]').onclick = async () => {
          if (busy) return;
          busy = true; dialog.dataset.busy = 'true';
          dialog.querySelectorAll('button').forEach(button => button.disabled = true);
          errorNode().textContent = '正在保存功法…'; options.onBusy?.(true);
          try {
            const next = await options.onConfigure({...draft});
            P().validate(next);
            profile = next; delete dialog.dataset.busy; busy = false; close(); draw();
          } catch (error) {
            busy = false; delete dialog.dataset.busy; paint(`保存失敗，配置尚未生效：${error?.message || '請稍後重試。'}`);
          } finally { options.onBusy?.(false); }
        };
      };
      dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); else { event.preventDefault(); close(); } });
      paint(); dialog.showModal();
      const heading=dialog.querySelector('#progressionEditorTitle');
      heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true}); dialog.scrollTop=0;
    }
    draw();
  }
  function result(host, combat, options = {}) {
    if (!host) return;
    const profile = options.profile;
    const earned = Number.isSafeInteger(options.earned) ? options.earned : P()?.award(combat, 0) || 0;
    const trial = !!combat?.trial;
    host.innerHTML = `<section class="progression-card"><p class="progression-kicker">${trial ? '渡劫結果' : '本局修為'}</p><h3>${trial ? '獨立試煉' : options.error ? '修為尚未入帳' : options.pending ? '正在保存修為…' : earned ? `+${esc(earned)} 修為` : '本局無修為獎勵'}</h3><p>${trial ? '試煉不產出修為，也不消耗原旅程道具。' : options.pending ? '保存完成後更新永久進度。' : earned ? `完成牌局 12 點${earned > 12 ? `，吃、碰、槓、補花或胡牌操作加成 ${earned - 12} 點` : ''}。` : '中途離開、舊版旅程或未完成結算不會發放修為。'}</p>${valid(profile) ? progress(profile) : '<p class="progression-muted">永久資料尚未讀取。</p>'}<p class="progression-error" role="status" aria-live="polite">${esc(options.error?.message || options.error || '')}</p>${options.error && options.onRetry ? '<button type="button" data-progression-retry>重試保存</button>' : ''}</section>`;
    host.querySelector('[data-progression-retry]')?.addEventListener('click', () => options.onRetry());
  }
  root.MahjongProgressionUI = Object.freeze({home, preparation, result, details, close});
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MahjongProgressionUI;
})(typeof window !== 'undefined' ? window : globalThis);
