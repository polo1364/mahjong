(() => {
  'use strict';
  const root = document.documentElement;
  const screen = document.getElementById('startScreen');
  const home = document.getElementById('startHome');
  const modes = document.getElementById('startModes');
  const start = document.getElementById('startGameBtn');
  const resume = document.getElementById('continueGameBtn');
  const cultivationResume = document.getElementById('continueCultivationBtn');
  const restartJourney = document.getElementById('restartCultivationJourneyBtn');
  const back = document.getElementById('startBackBtn');
  const normal = document.getElementById('normalModeBtn');
  const cultivation = document.getElementById('cultivationModeBtn');
  const status = document.getElementById('startStatus');
  const savedTime = document.getElementById('startSaveTime');
  const cultivationSavedTime = document.getElementById('startCultivationSaveTime');
  const shell = document.querySelector('.shell');
  const menu = document.getElementById('tableMenuBtn');
  let state = 'home';
  let initialized = false;
  let actions;
  const autoSaves = { normal: null, cultivation: null };

  shell.inert = true;
  menu.inert = true;

  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }

  function showPage(page, focus) {
    state = page;
    screen.dataset.page = page;
    home.hidden = page !== 'home';
    modes.hidden = page !== 'modes';
    message('');
    focus?.focus({ preventScroll: true });
    screen.scrollTop = 0;
  }

  function revealTable() {
    state = 'game';
    screen.hidden = true;
    root.classList.remove('start-screen-active');
    shell.inert = false;
    menu.inert = false;
    window.MahjongTableLayout?.fitNow();
  }

  start.addEventListener('click', () => {
    if (!initialized || state !== 'home') return;
    showPage('modes', normal);
  });
  back.addEventListener('click', () => {
    if (state === 'modes') showPage('home', start);
  });
  screen.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state === 'modes') {
      event.preventDefault();
      showPage('home', start);
    }
  });

  async function startMode(mode) {
    if (!initialized || state !== 'modes') return;
    state = 'starting';
    normal.disabled = true;
    cultivation.disabled = true;
    back.disabled = true;
    // Measure the visible table before the opening animation captures its targets.
    try {
      if (mode === 'cultivation' && window.MahjongProgressionFlow?.hasTrial) {
        await window.MahjongProgressionFlow.resumeTrial();
      } else if (mode === 'cultivation' && autoSaves.cultivation) {
        actions.restoreGame(autoSaves.cultivation, mode);
        revealTable();
      } else {
        const started = actions.startNewSession(mode, {
          onStarted: revealTable,
          onCancelled() { showPage('modes', cultivation); normal.disabled = false; cultivation.disabled = false; back.disabled = false; }
        });
        if (started === false) return;
      }
    } catch (error) {
      actions.onRestoreError?.();
      showHome().then(() => message(`修仙旅程無法恢復：${error.message}`, true));
      return;
    }
    window.MahjongTableLayout?.fitNow();
    const skip = document.querySelector('.opening-skip');
    if (skip?.getClientRects().length) skip.focus({ preventScroll: true });
    else if (document.getElementById('reactionPanel').style.display === 'none') menu.focus({ preventScroll: true });
  }
  normal.addEventListener('click', () => startMode('normal'));
  cultivation.addEventListener('click', () => startMode('cultivation'));
  restartJourney?.addEventListener('click', () => {
    if (!initialized || state !== 'home') return;
    if (!confirm('重新開始修仙旅程會重設牌局、連戰與所有劫印，確定重新開始嗎？')) return;
    actions.startNewSession('cultivation', { freshJourney: true,
      onStarted: revealTable,
      onCancelled() { restartJourney.disabled = false; restartJourney.focus(); }
    });
  });

  async function resumeMode(mode, button) {
    if (!initialized || state !== 'home' || !autoSaves[mode]) return;
    state = 'starting';
    button.disabled = true;
    start.disabled = true;
    try {
      // Existing restore validates the original save format before assigning state.
      if (mode === 'cultivation' && window.MahjongProgressionFlow?.hasTrial) await window.MahjongProgressionFlow.resumeTrial();
      else actions.restoreGame(autoSaves[mode], mode);
      revealTable();
      if (document.getElementById('reactionPanel').style.display === 'none') menu.focus({ preventScroll: true });
    } catch (error) {
      actions.onRestoreError?.();
      state = 'home';
      button.disabled = false;
      start.disabled = false;
      message(`自動暫存無法恢復：${error?.message || '資料無法讀取。請另開新局。'}`, true);
      button.focus({ preventScroll: true });
    }
  }
  resume.addEventListener('click', () => resumeMode('normal', resume));
  cultivationResume.addEventListener('click', () => resumeMode('cultivation', cultivationResume));

  async function showHome() {
    state = 'loading';
    screen.hidden = false;
    root.classList.add('start-screen-active');
    shell.inert = true;
    menu.inert = true;
    start.disabled = true;
    normal.disabled = false;
    cultivation.disabled = false;
    back.disabled = false;
    home.hidden = false;
    modes.hidden = true;
    for (const button of [resume, cultivationResume]) { button.hidden = true; button.disabled = true; }
    const loaded = await Promise.all([actions.loadAutoSave('normal'), actions.loadAutoSave('cultivation')]);
    let progressionError = null;
    if (window.MahjongProgressionFlow) {
      let host = document.getElementById('cultivationProgressionHome');
      if (!host) { host = document.createElement('div'); host.id = 'cultivationProgressionHome'; home.querySelector('.start-home-copy').append(host); }
      try { await window.MahjongProgressionFlow.refresh(); window.MahjongProgressionFlow.home(host); }
      catch (error) { progressionError = error; host.textContent = '永久養成資料無法讀取，請重試。'; }
    }
    ['normal', 'cultivation'].forEach((mode, index) => {
      autoSaves[mode] = loaded[index];
      const button = mode === 'normal' ? resume : cultivationResume;
      const label = mode === 'normal' ? savedTime : cultivationSavedTime;
      button.hidden = !loaded[index];
      button.disabled = !loaded[index];
      label.hidden = true;
      if (loaded[index]) {
        const date = new Date(loaded[index].timestamp);
        if (Number.isFinite(date.getTime())) {
          const combat = loaded[index].gameState?.cultivation;
          const phase = { combat: '戰鬥中', result: '傷害結算', preparation: '整備庭院' }[combat?.journey?.phase];
          label.textContent = `${mode === 'normal' ? '一般' : combat?.version >= 2 ? `修仙 · ${phase || '戰鬥中'}` : '修仙 · 舊版旅程'}封存 · ${date.toLocaleString('zh-TW')}`;
          label.hidden = false;
        }
      }
    });
    start.disabled = false;
    if (restartJourney) { restartJourney.hidden = !autoSaves.cultivation; restartJourney.disabled = !!progressionError || !!window.MahjongProgressionFlow?.hasTrial; }
    cultivation.textContent = autoSaves.cultivation ? '繼續修仙旅程 →' : '踏入修仙之路 →';
    initialized = true;
    showPage('home', start);
    if (progressionError) message(`養成資料讀取失敗：${progressionError.message}`, true);
  }

  async function init(callbacks) {
    if (actions) return;
    actions = callbacks;
    await showHome();
  }

  window.MahjongStartScreen = Object.freeze({ init, showHome, revealTable, get state() { return state; } });
})();
