/* 修仙新手提示: each system gets one short tip the first time it appears, then never again on this device.
   Tips only explain; nothing is locked or skipped. They sit inside the open dialog when there is one,
   because a modal dialog makes the rest of the page unclickable. */
(function (root) {
  'use strict';
  const STORE_KEY = 'qinghe_cult_guide_v1';
  const game = () => (typeof S !== 'undefined' ? S : null);
  const openDialog = () => [...document.querySelectorAll('dialog[open]')].pop() || null;
  const prepOpen = () => document.querySelector('dialog.journey-preparation-screen[open]');
  const tips = [
    { id: 'table', title: '牌桌即戰場', literal: true, text: '每次出牌都會普攻怪物；吃（引氣）、碰（聚靈）、槓（開陣）會施放牌組技能，胡牌（決勝）則打出終式連招。怪物卡上的倒數歸零時，它會攻擊仇恨最高的道友。',
      when: () => { const s = game(); return s?.cultivation && !s.cultivation.trial && s.phase === 'play' && !openDialog(); } },
    { id: 'result', title: '修為與歷練評分', text: '每局完成都有修為，累積到門檻可挑戰渡劫提升境界。歷練評分看戰鬥貢獻、牌局操作與胡牌，近三局平均達 60、75 分會永久解鎖該地區的稀有奇遇與進階首領。',
      when: () => !!document.querySelector('.result-panel .expedition-result, .result-panel .progression-result') },
    { id: 'prep', title: '整備庭院', text: '每局之間在這裡整理：「道具行囊」準備下局道具、「行囊配裝」換裝備、「雲遊商人」購買、「鑄器師」強化。「角色」分頁可看含裝備加成的數值（手機版在「角色・修行」按鈕裡）。',
      when: () => !!prepOpen() },
    { id: 'skills', title: '功法開放', text: '修為滿 20 後可在「修行」分頁配置功法，例如普攻、技能、治療或護盾加成。可免費退點重配，下一局生效。',
      when: () => !!prepOpen() && (game()?.cultivation?.players?.[0]?.progression?.xp || 0) >= 20 },
    { id: 'event', title: '奇遇', text: '每個地區第 4、8、12、16 局後會遇到奇遇，到「巡歷」分頁選一項或離開。代價與效果都會寫明，處理完才能開始下一局。',
      when: () => !!prepOpen() && !!game()?.cultivation?.expedition?.pendingEvent },
    { id: 'trial', title: '可以渡劫了', text: '修為已達下一境界門檻。到「修行」分頁按「挑戰渡劫」，打倒指定怪物即可突破；失敗不扣修為，原本的旅程與道具都會保留。',
      when: () => !!prepOpen() && !!document.querySelector('[data-progression-trial]:not([disabled])') },
    { id: 'boss', title: '選擇小王', text: '下一場是小王時，可在「巡歷」分頁選原小王或當地首領。各首領都會掉對應的王印，用來兌換套裝。',
      when: () => !!prepOpen() && !!document.querySelector('.expedition-boss') }
  ];
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (_) { seen = {}; }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(seen)); } catch (_) { /* Tips simply show again next time. */ } };
  let card = null, current = null;
  function close() {
    if (current) { seen[current.id] = true; save(); }
    card?.remove(); card = null; current = null;
  }
  function show(tip) {
    current = tip;
    card = document.createElement('aside');
    card.className = 'cult-guide'; card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite');
    card.innerHTML = `<p class="cult-guide-kicker">修仙指引</p><h3>${tip.title}</h3><p${tip.literal ? ' data-cultivation-preserve' : ''}>${tip.text}</p><button type="button">知道了</button>`;
    root.MahjongCultivationTerms?.render(card, true);
    card.querySelector('button').onclick = close;
    (openDialog() || document.body).append(card);
  }
  function tick() {
    if (!game()?.cultivation && !prepOpen()) return;
    // A tip whose dialog closed is shown again later rather than lost.
    if (card && !card.isConnected) { card = null; current = null; }
    // A full-screen dialog opened over the tip: move it inside, or it could never be seen or dismissed.
    // A small dialog (codex, skill choice) closes on its own, so the tip waits behind it instead of covering its controls.
    if (card) { const open = openDialog(), host = !open ? document.body : open.matches('.journey-screen') ? open : card.parentElement; if (card.parentElement !== host) host.append(card); return; }
    const tip = tips.find(t => !seen[t.id] && (() => { try { return t.when(); } catch (_) { return false; } })());
    if (tip) show(tip);
  }
  setInterval(tick, 700);
  root.MahjongCultivationGuide = Object.freeze({
    reset() { seen = {}; save(); close(); },
    get seen() { return { ...seen }; }
  });
})(typeof window !== 'undefined' ? window : globalThis);
