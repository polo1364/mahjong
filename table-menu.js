/* One utility entrance. Existing game controls keep their nodes and handlers. */
(function () {
  'use strict';
  const menu = document.getElementById('tableMenu');
  const trigger = document.getElementById('tableMenuBtn');
  const close = document.getElementById('tableMenuClose');
  const overlay = document.getElementById('overlay');
  const settings = document.getElementById('settingsPanel');
  const reaction = document.getElementById('reactionPanel');
  const shell = document.querySelector('.shell');
  const controls = document.getElementById('controls');
  const sidebar = document.querySelector('.sidebar');
  if (!menu || !trigger || !controls || !sidebar) return;

  // Claim buttons live on the table above your rack; only available actions are shown.
  controls.classList.add('table-actions');
  (document.querySelector('.bottom-area > .hand-meld-container') || document.querySelector('.bottom-area'))?.append(controls);
  document.getElementById('tableMenuSessionActions').append(document.querySelector('.header-actions'));
  // Standard settings: the existing controls move into labelled rows and keep their listeners.
  const slot = (id, node) => { const target = document.getElementById(id); if (target && node) target.append(node); };
  slot('prefSoundSlot', document.getElementById('soundBtn'));
  slot('prefVolumeSlot', document.getElementById('soundVolume'));
  slot('prefVolumeValueSlot', document.getElementById('volumeValue'));
  slot('prefVoiceSlot', document.getElementById('voiceAnnouncements'));
  slot('prefAmbienceSlot', document.getElementById('ambienceSound'));
  slot('prefEffectSlot', document.getElementById('effectStyle'));
  slot('prefReducedSlot', document.getElementById('reduceEffects'));
  document.getElementById('tableMenuSessionActions').append(sidebar.querySelector('.session-note'));
  // Keep the requested tile-name reference and speech audition in settings.
  const voicePreview = document.getElementById('tileVoicePreview');
  if (voicePreview) {
    const card = document.createElement('div'); card.className = 'tile-voice-preview';
    card.append(document.querySelector('label[for="voiceCue"]'), document.getElementById('voiceCue').closest('.feedback-preview'));
    voicePreview.append(card, document.getElementById('feedbackStatus'));
  }
  window.MahjongTileNames?.renderReference(document.getElementById('tileNameReference'));

  // Tabs: one page at a time, each sized to fit the dialog so the menu never scrolls.
  const tabs = [...menu.querySelectorAll('.tm-tab')];
  let currentTab = 'session';
  const tabShown = tab => tab.getClientRects().length > 0;
  function selectTab(name, focus = false) {
    const tab = tabs.find(t => t.dataset.page === name && tabShown(t)) || tabs[0];
    currentTab = tab.dataset.page;
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus({ preventScroll: true });
  }
  tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab.dataset.page)));
  menu.querySelector('.tm-tabs').addEventListener('keydown', event => {
    const shown = tabs.filter(tabShown), at = shown.indexOf(document.activeElement);
    if (at < 0) return;
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    const next = step ? shown[(at + step + shown.length) % shown.length] : event.key === 'Home' ? shown[0] : event.key === 'End' ? shown.at(-1) : null;
    if (!next) return;
    event.preventDefault();
    selectTab(next.dataset.page, true);
  });
  window.MahjongTableMenu = { selectTab };
  // The retired effect workshop remains hidden; existing sound controls keep their handlers.
  document.getElementById('feedbackPanel')?.remove();
  document.querySelectorAll('#settingsPanel .settings-section-title, #settingsPanel .settings-section-note').forEach(node => {
    if (node.textContent.includes('聲光') || node.textContent.includes('即時套用')) node.remove();
  });
  // Scores, log and guide stay in the DOM for the game, but are not shown in this menu.
  sidebar.hidden = true;
  document.querySelector('.mobile-tools')?.setAttribute('hidden', '');

  const prefsKey = 'qinghe_table_prefs_v1';
  let prefs = { centerStyle: 'board', pace: 1, confirmDiscard: false };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(prefsKey) || '{}') }; } catch (_) { /* storage may be blocked */ }
  const centerSelect = document.getElementById('prefCenterStyle');
  const paceSelect = document.getElementById('prefPace');
  const confirmBox = document.getElementById('prefConfirmDiscard');
  function applyPrefs(save) {
    prefs.centerStyle = ['board', 'dial', 'bar', 'clear'].includes(centerSelect.value) ? centerSelect.value : 'board';
    prefs.pace = [1.6, 1, 0.55].includes(Number(paceSelect.value)) ? Number(paceSelect.value) : 1;
    prefs.confirmDiscard = confirmBox.checked;
    document.documentElement.dataset.centerStyle = prefs.centerStyle;
    window.MahjongPrefs = { pace: prefs.pace, confirmDiscard: prefs.confirmDiscard };
    window.MahjongTableLayout?.refresh();
    if (save) try { localStorage.setItem(prefsKey, JSON.stringify(prefs)); } catch (_) { /* keep in-session value */ }
  }
  centerSelect.value = prefs.centerStyle;
  paceSelect.value = String(prefs.pace);
  confirmBox.checked = prefs.confirmDiscard === true;
  [centerSelect, paceSelect, confirmBox].forEach(el => el.addEventListener('change', () => applyPrefs(true)));
  applyPrefs(false);

  const visible = panel => panel.style.display !== 'none' && !panel.hidden;
  const otherDialogOpen = () => visible(settings) || visible(reaction);
  let fromMenuSettings = false;
  let settingsWasOpen = visible(settings);
  let reactionWasOpen = visible(reaction);
  let fromMenuReaction = false;
  let shellWasInert = false;
  const actionStatus = document.getElementById('tableMenuActionStatus');
  const badge = document.getElementById('tableMenuBadge');
  function updateActions() {
    const cultivation = typeof S !== 'undefined' && !!S?.cultivation;
    window.MahjongFeedbackControls?.syncMode();
    window.MahjongCultivationTerms?.render(controls, cultivation);
    const enabled = [...controls.querySelectorAll('button:not(:disabled)')];
    const awaitingReaction = enabled.some(button => button.id === 'btnPass');
    const label = awaitingReaction ? '待回應' : enabled.length ? '可操作' : '';
    badge.hidden = !label;
    badge.textContent = label;
    trigger.classList.toggle('has-actions', !!label);
    trigger.classList.toggle('has-reaction', awaitingReaction);
    trigger.setAttribute('aria-label', label ? `設定，${label}：${enabled.map(button => button.textContent).join('、')}` : '設定');
    if (actionStatus) actionStatus.textContent = awaitingReaction
      ? '請選擇亮起的吃、碰、槓、胡，或按「過」放棄本次反應。'
      : enabled.length ? `目前可用：${enabled.map(button => button.textContent).join('、')}。出牌請關閉選單後點選手牌。`
      : document.getElementById('turnMessage').textContent;
    window.MahjongCultivationTerms?.render(menu, cultivation, { names: window.MahjongCultivationTerms.names(typeof S !== 'undefined' ? S : null) });
    window.MahjongCultivationTerms?.render(trigger, cultivation);
  }
  function closeMenu(restoreFocus = true) {
    if (menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    shell.inert = shellWasInert;
    if (!otherDialogOpen()) overlay.style.display = 'none';
    if (restoreFocus && !otherDialogOpen()) trigger.focus({ preventScroll: true });
  }
  function openMenu() {
    if (otherDialogOpen()) return;
    updateActions();
    shellWasInert = shell.inert;
    shell.inert = true;
    menu.hidden = false;
    selectTab(currentTab);
    trigger.setAttribute('aria-expanded', 'true');
    overlay.style.display = 'block';
    menu.scrollTop = 0;
    window.MahjongTableLayout?.refresh();
    close.focus({ preventScroll: true });
  }
  trigger.addEventListener('click', () => menu.hidden ? openMenu() : closeMenu());
  close.addEventListener('click', () => closeMenu());
  overlay.addEventListener('click', () => closeMenu());

  // Close before an existing handler opens a chooser, confirms, saves, or restarts.
  menu.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.id === 'settingsBtn') fromMenuSettings = true;
    if (controls.contains(button) || ['settingsBtn', 'saveGameBtn', 'loadGameBtn', 'newGameBtn'].includes(button.id)) closeMenu();
  }, true);
  document.addEventListener('keydown', event => {
    if (menu.hidden || document.getElementById('cultivationCodex')?.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...menu.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
      .filter(element => element.getClientRects().length
        && (!element.closest('details:not([open])') || element.tagName === 'SUMMARY'));
    if (!items.length) return;
    if (event.shiftKey && (document.activeElement === items[0] || !menu.contains(document.activeElement))) {
      event.preventDefault(); items.at(-1).focus();
    } else if (!event.shiftKey && (document.activeElement === items.at(-1) || !menu.contains(document.activeElement))) {
      event.preventDefault(); items[0].focus();
    }
  });
  const modalObserver = new MutationObserver(() => {
    const settingsOpen = visible(settings);
    const reactionOpen = visible(reaction);
    if (reactionOpen && !reactionWasOpen && (!menu.hidden || document.activeElement === trigger)) {
      fromMenuReaction = true;
    }
    if (otherDialogOpen()) closeMenu(false);
    // AI claims may close reaction UI; the open utility dialog still owns a backdrop.
    if (!menu.hidden && overlay.style.display !== 'block') overlay.style.display = 'block';
    if (fromMenuReaction && reactionOpen && !reaction.contains(document.activeElement)) {
      reaction.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    }
    if (fromMenuReaction && reactionWasOpen && !reactionOpen) {
      fromMenuReaction = false;
      if (!settingsOpen) trigger.focus({ preventScroll: true });
    }
    if (fromMenuSettings && settingsWasOpen && !settingsOpen) {
      fromMenuSettings = false;
      if (!visible(reaction)) trigger.focus({ preventScroll: true });
    }
    settingsWasOpen = settingsOpen;
    reactionWasOpen = reactionOpen;
  });
  modalObserver.observe(settings, { attributes: true, attributeFilter: ['style', 'hidden'] });
  modalObserver.observe(reaction, { attributes: true, attributeFilter: ['style', 'hidden'] });
  modalObserver.observe(overlay, { attributes: true, attributeFilter: ['style'] });
  new MutationObserver(updateActions).observe(controls, { subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });
  new MutationObserver(updateActions).observe(document.getElementById('turnMessage'), { childList: true, characterData: true, subtree: true });
  updateActions();
})();
