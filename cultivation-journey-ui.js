/* Journey screens present committed combat state; they never deal tiles or consume RNG. */
(function (root) {
  'use strict';
  const imageURL = root.MahjongImageURL || (value => value);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const statNames = { damage: '傷害', defense: '防禦', healing: '治療', shield: '護盾' };
  let current = null;
  let previousFocus = null;
  let equipmentSession = null;
  let progressionBusy = false;
  function close(options = {}) {
    if (equipmentSession?.busy || equipmentSession?.pending || (progressionBusy && !options.progressionCommitted)) return;
    if (!current) return;
    root.MahjongProgressionUI?.close();
    const dialog = current;
    current = null;
    equipmentSession = null;
    progressionBusy = false;
    dialog.close(); dialog.remove();
    if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus({ preventScroll: true });
  }
  function open(title, content, className) {
    close();
    previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = `journey-screen ${className}`;
    dialog.setAttribute('aria-labelledby', 'journeyTitle');
    dialog.innerHTML = `<div class="journey-wrap"><header class="journey-header"><div><p>上古神兵 · 修仙論道</p><h1 id="journeyTitle" tabindex="-1">${esc(title)}</h1></div><span class="journey-chapter">CULTIVATION JOURNEY</span></header>${content}</div>`;
    document.body.append(dialog);
    current = dialog;
    dialog.showModal();
    return dialog;
  }
  // Hero base stats with always-on equipment and progression bonuses; conditional effects resolve per move.
  function statValues(hero, player) {
    const E = root.MahjongCultivationEquipment, base = hero.stats;
    if ((!player?.economy && !player?.progression) || !E) return { ...base };
    return { damage: base.damage * E.factor(player, 'damage'), defense: 200 - (200 - base.defense) * E.factor(player, 'taken'),
      healing: base.healing * E.factor(player, 'heal'), shield: base.shield * E.factor(player, 'shield') };
  }
  function stats(hero, player) {
    const values = statValues(hero, player);
    return `<dl class="journey-stats">${Object.entries(statNames).map(([key, name]) => {
      const value = Number(values[key].toFixed(1)), gain = Number((value - hero.stats[key]).toFixed(1));
      return `<div${gain ? ` title="基礎 ${hero.stats[key]}%"` : ''}><dt>${name}</dt><dd>${esc(value)}<small>%</small>${gain ? `<em class="journey-stat-gain${gain < 0 ? ' is-down' : ''}">${gain > 0 ? '+' : ''}${esc(gain)}</em>` : ''}</dd></div>`;
    }).join('')}</dl>`;
  }
  function heroDetails(hero, player) {
    const life = player ? `${Number(player.hp).toLocaleString('en-US')} / ${Number(player.maxHp).toLocaleString('en-US')}` : Number(hero.hp || 1000).toLocaleString('en-US');
    return `<p class="journey-role">${esc(hero.role)} · 生命 ${life}</p><h2>${esc(hero.name)}</h2>${player?.economy || player?.progression ? '<p class="journey-muted journey-stats-note">含裝備、境界、功法與奇遇常駐加成；條件效果另依招式結算。</p>' : ''}${stats(hero, player)}${player ? (root.MahjongExpeditionUI?.details(player) || '') : ''}${player?.progression ? (root.MahjongProgressionUI?.details(player) || '') : ''}<div class="journey-passive"><h3>${esc(hero.passive.name)}</h3><p>${esc(hero.passive.description)}</p></div>`;
  }
  function chooseHero(onChoose, onCancel) {
    const heroes = root.MahjongCultivationHeroes.all;
    let selected = heroes[0];
    const dialog = open('選一位道友，踏上征途', `<p class="journey-intro">四位道友將一路同行。角色只影響戰鬥能力；全部牌組技能皆可施放。</p><div class="journey-selection"><div class="journey-hero-grid" role="group" aria-label="選擇英雄">${heroes.map((hero, index) => `<button type="button" class="journey-hero-option${index === 0 ? ' is-selected' : ''}" data-hero="${esc(hero.id)}" aria-pressed="${index === 0}"><img src="${esc(hero.thumbnail)}" alt="" width="240" height="260" fetchpriority="high" decoding="async"><span>${esc(hero.name)}</span><small>${esc(hero.role)}</small></button>`).join('')}</div><article class="journey-hero-detail" aria-live="polite"><div class="journey-selected-art"></div><div id="journeyHeroDetails"></div></article></div><footer class="journey-footer"><p>確認後建立新旅程；同伴從其他角色中選出，整段旅程保持不變。</p><div><button type="button" id="journeyChooseCancel">返回</button><button type="button" class="primary" id="journeyChooseConfirm">與${esc(selected.name)}啟程 →</button></div></footer>`, 'journey-selection-screen');
    const update = () => {
      dialog.querySelector('.journey-selected-art').innerHTML = `<picture><source media="(max-width: 1000px)" srcset="${esc(selected.thumbnail)}"><img src="${esc(imageURL(selected.image))}" alt="${esc(selected.name)}" width="480" height="520" decoding="async"></picture>`;
      dialog.querySelector('#journeyHeroDetails').innerHTML = heroDetails(selected);
      dialog.querySelector('#journeyChooseConfirm').textContent = `與${selected.name}啟程 →`;
      dialog.querySelectorAll('[data-hero]').forEach(button => {
        const active = button.dataset.hero === selected.id;
        button.classList.toggle('is-selected', active); button.setAttribute('aria-pressed', String(active));
      });
    };
    dialog.querySelectorAll('[data-hero]').forEach(button => button.addEventListener('click', () => { selected = root.MahjongCultivationHeroes.get(button.dataset.hero); update(); }));
    const cancel = () => { close(); onCancel?.(); };
    dialog.querySelector('#journeyChooseCancel').onclick = cancel;
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    dialog.querySelector('#journeyChooseConfirm').onclick = () => { const id = selected.id; close(); onChoose(id); };
    update(); dialog.querySelector('[data-hero]')?.focus();
  }
  function passiveState(player, monsterId) {
    const state = player.passiveState || {};
    const caps = { 'shen-gufeng': ['swordUses', 5], 'mu-canglan': ['tideUses', 3], 'tie-wujiu': ['counterUses', 5], 'yun-zhiwei': ['changeUses', 6], 'hua-jianlu': ['flowerUses', 3] };
    const values = [];
    if (caps[player.heroId]) { const [key, cap] = caps[player.heroId]; values.push(['本局剩餘觸發', Math.max(0, cap - (state[key] || 0))]); }
    if (['su-lingheng', 'luo-xuanyu'].includes(player.heroId)) values.push(['儲存加傷', `${state.stored || 0} / 30`], ['本局產生', `${state.generated || 0} / 60`]);
    if (player.heroId === 'shen-gufeng') values.push(['自己出牌', state.discards || 0]);
    if (player.heroId === 'chi-ling') values.push(['目前妖獸燃心', state.fireMonsterId !== monsterId ? '可觸發' : '已觸發']);
    if (player.heroId === 'tie-wujiu') values.push(['回鋒', state.counterReady ? '待觸發' : '等待自己出牌']);
    return values.length ? `<dl class="journey-counters">${values.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : '<p class="journey-muted">被動依戰鬥條件持續生效。</p>';
  }
  function seals(player) {
    const pending = player.pendingSeals || [];
    return pending.length ? pending.map(seal => `<li>${esc(root.MahjongCultivationFinishers.describeSeal(seal))}</li>`).join('') : '<li>無待生效劫印</li>';
  }
  function progressText(progress) {
    if (typeof progress === 'string') return progress;
    if (!progress) return '';
    const labels = { cycle: '循環', small: '小怪', elite: '菁英', miniboss: '小王', smallKills: '小怪擊殺', eliteKills: '菁英擊殺', minibossKills: '小王擊殺' };
    return Object.entries(progress).filter(([, value]) => typeof value === 'number' || typeof value === 'string').map(([key, value]) => `${labels[key] || key} ${value}`).join(' · ');
  }
  function showPreparation(state, callbacks) {
    const combat = state.cultivation;
    const player = combat.players[0];
    const hero = root.MahjongCultivationHeroes.get(player.heroId);
    const preview = root.MahjongCultivationCombat.journeyPreview(combat);
    const next = root.MahjongCultivationMonsters.get(preview.nextMonsterId);
    const dialog = open('整備庭院', `<p class="journey-intro">第 ${esc(combat.handNumber || 1)} 局已結算。整理心法，再迎下一場論道。</p><div class="journey-preparation-grid"><article class="journey-prepared-hero journey-panel"><img class="journey-prepared-art" src="${esc(imageURL(hero.image))}" alt="${esc(hero.name)}" width="440" height="480"><div>${heroDetails(hero)}${passiveState(player, combat.monster.id)}<div class="journey-seals"><h3>下局劫印</h3><p>下一局生效，下一局結束解除。</p><ul>${seals(player)}</ul></div></div></article><div class="journey-preparation-side"><section class="journey-panel journey-road"><div><p class="journey-kicker">征途 · 下一場</p><h2>${esc(preview.nextMonsterName)}</h2><p class="journey-progress">${esc(progressText(preview.progress))}</p><p>${esc(preview.message)}</p><p class="journey-muted">道友生命回滿；護盾、一般狀態與仇恨重設。角色與征途進度沿用。</p></div>${next ? `<img src="${esc(imageURL(next.thumbnail||next.image))}" alt="${esc(next.name)}" width="220" height="240">` : ''}</section><section class="journey-panel"><h2>行囊 · 裝備</h2><div class="journey-equipment">${[['weapon', '武器'], ['armor', '防具'], ['accessory', '飾品']].map(([key, name]) => `<div class="journey-slot"><img src="assets/cultivation-journey/slots/${key}.webp" alt="" width="96" height="96"><strong>${name}</strong><span>空欄</span></div>`).join('')}</div></section><section class="journey-npcs"><article class="journey-panel"><img src="assets/cultivation-journey/npcs/merchant.webp" alt="雲遊商人" width="160" height="180"><div><h3>雲遊商人</h3><p>商品與交易規則待開放</p></div></article><article class="journey-panel"><img src="assets/cultivation-journey/npcs/blacksmith.webp" alt="鑄器師" width="160" height="180"><div><h3>鑄器師</h3><p>強化規則待開放</p></div></article></section></div></div><section class="journey-party journey-panel" aria-label="同行道友"><h2>同行道友</h2><div>${combat.players.map((member, pid) => { const identity = root.MahjongCultivationHeroes.get(member.heroId); return `<article><img src="${esc(imageURL(identity.image))}" alt="" width="100" height="110"><div><strong>${esc(identity.name)}${pid === 0 ? ' · 你' : ''}</strong><small>${esc(identity.role)}</small><p>下局劫印 ${member.pendingSeals?.length || 0}</p></div></article>`; }).join('')}</div></section><footer class="journey-footer"><p>返回首頁會封存庭院進度，下次從此處繼續。</p><div><button type="button" id="journeyHome">返回首頁</button><button type="button" class="primary" id="journeyNext">開始下一局 →</button></div></footer>`, 'journey-preparation-screen');
    dialog.addEventListener('cancel', event => event.preventDefault());
    const nextButton = dialog.querySelector('#journeyNext');
    const homeButton = dialog.querySelector('#journeyHome');
    const status = dialog.querySelector('.journey-footer p');
    let navigating = false;
    let equipmentLocked = false;
    let progressionHost = null;
    let expeditionHost = null;
    const updateNavigationLock = () => {
      const locked = equipmentLocked || progressionBusy;
      nextButton.disabled = homeButton.disabled = locked || navigating;
      if (progressionHost) progressionHost.inert = locked;
      if (expeditionHost) expeditionHost.inert = locked;
      callbacks.onLock?.(locked);
    };
    if (combat.expedition && root.MahjongExpeditionUI && callbacks.progression) {
      expeditionHost = document.createElement('section');
      expeditionHost.className = 'journey-expedition';
      expeditionHost.setAttribute('aria-label', '巡歷與奇遇');
      dialog.querySelector('.journey-road').after(expeditionHost);
      root.MahjongExpeditionUI.preparation(expeditionHost, combat, {
        ...callbacks.progression,
        onBusy(busy) { progressionBusy = busy; equipmentSession?.setNavigationLocked(busy); updateNavigationLock(); },
        onUpdated(next) { close({progressionCommitted:true}); showPreparation(next, {...callbacks, progression:root.MahjongProgressionFlow.preparationOptions()}); }
      });
    }
    if (callbacks.progression && root.MahjongProgressionUI) {
      const host = document.createElement('section');
      progressionHost = host;
      host.className = 'journey-progression';
      host.setAttribute('aria-label', '修為與功法整備');
      dialog.querySelector('.journey-road').after(host);
      root.MahjongProgressionUI.preparation(host, combat, {
        ...callbacks.progression,
        onBusy(busy) { progressionBusy = busy; equipmentSession?.setNavigationLocked(busy); updateNavigationLock(); callbacks.progression.onBusy?.(busy); }
      });
    }
    if (combat.version === 3 && root.MahjongCultivationEquipmentUI) {
      dialog.classList.add('journey-equipment-screen');
      dialog.querySelector('.journey-preparation-side > .journey-panel:not(.journey-road)')?.remove();
      dialog.querySelector('.journey-npcs')?.remove();
      const equipment = document.createElement('section');
      equipment.className = 'equip-ui';
      equipment.setAttribute('aria-label', '裝備整備');
      if(combat.itemRulesVersion===1){dialog.classList.add('journey-supplies-screen');dialog.querySelector('.journey-preparation-grid').append(equipment);}else dialog.querySelector('.journey-preparation-grid').after(equipment);
      if(combat.itemRulesVersion===1&&next){const skills=root.MahjongMonsterSkills?.forSpecies(next.id)||[];const detail=document.createElement('details');detail.className='supply-next-skills';detail.innerHTML='<summary>下局怪物技能 · '+skills.length+' 招</summary><ul>'+skills.map(k=>'<li>'+esc(root.MahjongMonsterSkills.describe(k))+'</li>').join('')+'</ul>';dialog.querySelector('.journey-road > div').append(detail);}
      equipmentSession = root.MahjongCultivationEquipmentUI.mount(equipment, state, {
        getState: callbacks.getState,
        save: callbacks.save,
        publish: callbacks.publish,
        onLock(locked) {
          equipmentLocked = locked;
          updateNavigationLock();
        }
      });
    }
    nextButton.onclick = () => {
      if (navigating || equipmentLocked) return;
      if (callbacks.getState?.()?.cultivation?.expedition?.pendingEvent) { status.textContent = '請先到「巡歷」處理奇遇，或選擇離開。'; dialog.querySelector('[data-left="expedition"]')?.click(); dialog.classList.add('prep-left-open'); return; }
      navigating = true;
      nextButton.disabled = homeButton.disabled = true;
      close(); callbacks.onStart();
    };
    homeButton.onclick = async () => {
      if (navigating || equipmentLocked) return;
      navigating = true;
      nextButton.disabled = homeButton.disabled = true;
      status.textContent = '正在封存庭院進度…';
      equipmentSession?.setNavigationLocked(true);
      try {
        const saved = await callbacks.onHome();
        if (saved === false && dialog.isConnected) status.textContent = '封存未完成，已保留目前進度，請再試一次。';
      } catch (error) {
        if (dialog.isConnected) status.textContent = `封存失敗，已保留目前進度：${error.message}`;
      } finally {
        if (dialog.isConnected) {
          navigating = false;
          equipmentSession?.setNavigationLocked(false);
          nextButton.disabled = homeButton.disabled = false;
        }
      }
    };
    dialog.querySelector('#journeyTitle').focus({ preventScroll: true });
    dialog.scrollTop = 0;
  }
  root.MahjongCultivationJourneyUI = Object.freeze({ chooseHero, showPreparation, close, heroDetails, passiveState, statValues });
})(typeof window !== 'undefined' ? window : globalThis);
