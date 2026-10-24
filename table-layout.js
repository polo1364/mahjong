/* Move existing controls into viewport-sized panels; never mutate the game state. */
(function () {
  'use strict';
  const table = document.getElementById('playersGrid');
  const app = document.getElementById('table');
  const sidebar = document.querySelector('.sidebar');
  if (!table || !sidebar) return;
  const compact = matchMedia('(max-width: 1000px)');
  const landscape = matchMedia('(max-width: 1000px) and (max-height: 500px) and (orientation: landscape)');
  const playColumn = document.querySelector('.play-column');
  document.documentElement.classList.add('square-table', 'table-scene');
  const seatNames = ['你', '對家', '上家', '下家'];
  let scheduled = false;
  const pagers = [];
  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function button(text, action, className) {
    const el = make('button', className, text);
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; refresh(); });
  }
  const pages = new Map();
  const tabButtons = [];
  const tabs = make('nav', 'sidebar-tabs');
  tabs.setAttribute('aria-label', '牌桌工具');
  tabs.setAttribute('role', 'tablist');
  const mobileTools = make('nav', 'mobile-tools');
  mobileTools.setAttribute('aria-label', '切換牌桌與工具');
  mobileTools.setAttribute('role', 'tablist');
  const mobileButtons = [];
  let selectedPage = 'game';
  let selectedTool = 'table';
  function selectPage(name, mobile) {
    selectedPage = name === 'table' ? selectedPage : name;
    if (mobile) selectedTool = name;
    app.dataset.tool = compact.matches ? selectedTool : 'table';
    for (const [id, page] of pages) page.hidden = id !== selectedPage;
    for (const entry of tabButtons) entry.el.setAttribute('aria-selected', String(entry.id === selectedPage));
    for (const entry of mobileButtons) entry.el.setAttribute('aria-selected', String(entry.id === selectedTool));
    schedule();
  }
  for (const [id, title] of [['game', '論道'], ['guide', '秘笈']]) {
    const page = make('div', 'sidebar-page');
    page.dataset.page = id;
    page.id = `table-panel-${id}`;
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-label', title);
    pages.set(id, page);
    const el = button(title, () => selectPage(id, false));
    el.id = `table-tab-${id}`;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-controls', page.id);
    tabButtons.push({ id, el });
    tabs.append(el);
  }
  for (const [id, title] of [['table', '牌陣'], ['game', '論道'], ['guide', '秘笈']]) {
    const el = button(title, () => selectPage(id, true));
    el.id = `table-tool-${id}`;
    el.setAttribute('role', 'tab');
    mobileButtons.push({ id, el });
    mobileTools.append(el);
  }
  const scorePanel = document.getElementById('scoreboard').closest('.side-panel');
  const log = document.getElementById('log');
  const logPanel = log.closest('.side-panel');
  logPanel.classList.add('log-panel');
  pages.get('game').append(scorePanel, logPanel);
  function tabSection(details) {
    const section = make('section', details.className);
    if (details.id) section.id = details.id;
    while (details.firstChild) section.append(details.firstChild);
    details.replaceWith(section);
    return section;
  }
  const guide = tabSection(sidebar.querySelector('.guide'));
  const guideContent = make('div', 'guide-pages');
  for (const paragraph of [...guide.querySelectorAll(':scope > p')]) guideContent.append(paragraph);
  guide.append(guideContent);
  pages.get('guide').append(guide);
  const feedback = tabSection(document.getElementById('feedbackPanel'));
  const settings = feedback.querySelector('.feedback-settings');
  const previewSettings = make('div', 'feedback-settings');
  previewSettings.id = 'table-workshop-preview';
  settings.id = 'table-workshop-settings';
  const previewLabel = settings.querySelector('label[for="feedbackCue"]');
  let current = previewLabel;
  const status = document.getElementById('feedbackStatus');
  while (current && current !== status) {
    const next = current.nextElementSibling;
    previewSettings.append(current);
    current = next;
  }
  const workshopTabs = make('nav', 'workshop-tabs');
  workshopTabs.setAttribute('aria-label', '聲光工坊');
  workshopTabs.setAttribute('role', 'tablist');
  const workshopButtons = [];
  function workshop(name) {
    settings.hidden = name !== 'settings';
    previewSettings.hidden = name !== 'preview';
    for (const item of workshopButtons) item.el.setAttribute('aria-selected', String(item.id === name));
    schedule();
  }
  for (const [id, title] of [['settings', '效果與聲音'], ['preview', '試聽與預覽']]) {
    const el = button(title, () => workshop(id));
    el.id = `table-workshop-${id}-tab`;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-controls', `table-workshop-${id}`);
    workshopButtons.push({ id, el });
    workshopTabs.append(el);
  }
  feedback.prepend(workshopTabs);
  feedback.append(previewSettings, status);
  // Sound and effects live in the game settings dialog; they apply at once and never restart the hand.
  feedback.classList.remove('side-panel');
  const settingsContent = document.querySelector('#settingsPanel .settings-content');
  const firstGroup = settingsContent.querySelector('.settings-group');
  settingsContent.insertBefore(make('h4', 'settings-section-title', '牌桌與分數'), firstGroup);
  const settingsError = document.getElementById('settingsError');
  settingsContent.insertBefore(make('h4', 'settings-section-title', '聲光'), settingsError);
  settingsContent.insertBefore(make('p', 'settings-section-note', '特效、音量與語音即時套用，不會重新開局。'), settingsError);
  settingsContent.insertBefore(feedback, settingsError);
  // The stakes readout moves into the header so the table can take the freed title row.
  const masthead = document.querySelector('.masthead');
  const tableMeta = document.querySelector('.table-meta');
  if (masthead && tableMeta) masthead.insertBefore(tableMeta, masthead.querySelector('.header-actions'));
  const sessionNote = sidebar.querySelector('.session-note');
  sidebar.append(tabs, ...pages.values(), sessionNote);
  app.append(mobileTools);
  workshop('settings');
  selectPage('game', false);

  // Each page uses measured paragraph heights. All original nodes remain in the DOM.
  function pager(container, host, name, newestFirst) {
    const nav = make('div', 'page-nav');
    nav.dataset.pager = name;
    const label = make('span');
    const state = { container, index: 0, pageCount: 1, newestFirst, label, nav };
    container.tabIndex = 0;
    const previous = button(newestFirst ? '較新' : '上一頁', () => { state.index = Math.max(0, state.index - 1); schedule(); });
    const next = button(newestFirst ? '較早' : '下一頁', () => { state.index = Math.min(state.pageCount - 1, state.index + 1); schedule(); });
    previous.setAttribute('aria-label', `${name}${previous.textContent}`);
    next.setAttribute('aria-label', `${name}${next.textContent}`);
    nav.append(previous, label, next);
    host.append(nav);
    state.previous = previous;
    state.next = next;
    pagers.push(state);
    return state;
  }
  const logPager = pager(log, logPanel, '紀錄', true);
  pager(guideContent, guide, '指南', false);
  function updatePager(state) {
    if (!state.container.getClientRects().length) return;
    const nodes = [...state.container.children];
    nodes.forEach(node => { node.hidden = false; });
    const height = state.container.clientHeight;
    const ordered = state.newestFirst ? [...nodes].reverse() : nodes;
    const groups = [[]];
    let used = 0;
    for (const node of ordered) {
      const style = getComputedStyle(node);
      const size = node.getBoundingClientRect().height + parseFloat(style.marginTop || 0) + parseFloat(style.marginBottom || 0);
      if (used + size > height + 1 && groups.at(-1).length) { groups.push([]); used = 0; }
      groups.at(-1).push(node);
      used += size;
    }
    state.pageCount = groups.length;
    state.index = Math.min(state.index, groups.length - 1);
    const visible = new Set(groups[state.index]);
    nodes.forEach(node => { node.hidden = !visible.has(node); });
    state.previous.disabled = state.index === 0;
    state.next.disabled = state.index === groups.length - 1;
    state.label.textContent = `${state.index + 1} / ${groups.length}${state.newestFirst ? ` · 共 ${nodes.length} 筆` : ''}`;
    state.nav.dataset.pages = String(groups.length);
  }

  // Every discard stays on the table in front of its player; no separate public-tiles dialog.
  for (let pid = 0; pid < 4; pid++) {
    const discardArea = document.getElementById(`discardArea${pid}`);
    const zone = make('div', `table-discard-zone table-discard-zone-${pid}`);
    zone.dataset.seat = String(pid);
    zone.append(discardArea);
    table.append(zone);
  }
  const handArea = document.getElementById('yourHandArea');
  const handContainer = handArea.parentElement;
  // Keep the public flower row separate from the shared hand and meld rack.
  document.querySelector('.bottom-area').append(document.getElementById('meldArea0'));
  ['top', 'left', 'right'].forEach((seat, index) => {
    table.querySelector(`.${seat}-area`).append(document.getElementById(`meldArea${index + 1}`));
  });
  function fitPersonalRack() {
    // Fit the complete row within the table's inner edges, including compact views.
    const handCount = handArea.querySelectorAll('button.tile').length;
    const melds = document.getElementById('meldRail0');
    const meldCount = melds.querySelectorAll('.rail-tile').length;
    const groupCount = melds.childElementCount;
    if (!handCount && !meldCount) return;
    const available = handContainer.clientWidth;
    const gap = table.clientWidth < 620 ? 1 : 3;
    const drawnGap = handArea.querySelector('.tile-drawn') ? 4 : 0;
    const handSpace = handCount ? 4 + Math.max(0, handCount - 1) * gap + drawnGap : 0;
    const meldSpace = meldCount ? 2 + meldCount - groupCount + Math.max(0, groupCount - 1) * 4 : 0;
    const between = handCount && meldCount ? 6 : 0;
    const limit = Math.min(76, table.clientHeight * .15);
    const tileWidth = Math.max(1, Math.floor(Math.min(limit,
      (available - handSpace - meldSpace - between - 2) / (handCount + meldCount * .86))));
    handContainer.style.setProperty('--personal-tile-width', `${tileWidth}px`);
    handContainer.style.setProperty('--personal-tile-gap', `${gap}px`);
    handArea.scrollLeft = 0;
    melds.scrollLeft = 0;
  }
  function sizeTable() {
    const portrait = matchMedia('(max-width: 680px) and (orientation: portrait)').matches;
    const short = matchMedia('(max-height: 550px)').matches;
    const narrow = portrait && matchMedia('(max-width: 360px)').matches;
    // Viewport modes do not change when their own frame padding changes.
    document.documentElement.classList.toggle('table-portrait', portrait);
    document.documentElement.classList.toggle('table-short', short);
    document.documentElement.classList.toggle('table-narrow', narrow);
    const width = table.clientWidth, height = table.clientHeight;
    if (!width || !height) return;
    document.documentElement.classList.toggle('table-center-compact',
      document.documentElement.dataset.centerStyle === 'board' && (portrait ? height < 620 : height < 340));
    playColumn.dataset.squareMode = portrait ? 'portrait' : 'wide';
    table.dataset.squareSmall = 'false';
    table.dataset.squareMedium = 'false';
    table.dataset.portrait = String(portrait);
    const cardWidth = portrait ? Math.min(narrow ? 100 : 126, (width - 52) / 2) : Math.max(82, Math.min(142, width * .095));
    const selfWidth = portrait ? 190 : Math.max(138, Math.min(222, width * .15));
    const values = {
      'seat-card-width': cardWidth,
      'self-card-width': selfWidth,
      'top-hand-y': portrait ? 80 : short ? Math.min(64, height * .17) : 110,
      'top-hand-inset': portrait ? 14 : cardWidth + (short ? 60 : 90),
      'side-hand-x': portrait ? 12 : cardWidth + 22,
      'side-hand-top': portrait ? Math.min(280, height * .40) : short ? 65 : 135,
      'side-hand-bottom': portrait ? 150 : short ? 100 : 175,
      'self-hand-left': portrait ? 12 : selfWidth + 28,
      'self-card-bottom': portrait ? 88 : short ? 22 : 46,
      'side-card-top': portrait ? 148 : height * .45,
      'center-size': short ? 70 : portrait ? 90 : 124,
      'seat-font': Math.max(12, Math.min(19, width / 75))
    };
    for (const [key, value] of Object.entries(values)) table.style.setProperty(`--${key}`, `${value}px`);
  }
  function fitFlowers() {
    const origin = table.getBoundingClientRect();
    const portrait = table.dataset.portrait === 'true';
    const short = document.documentElement.classList.contains('table-short');
    for (let pid = 0; pid < 4; pid++) {
      const flowers = document.getElementById(`meldArea${pid}`);
      if (pid === 0 && portrait) {
        table.style.setProperty('--self-card-bottom', `${Math.max(88,
          origin.bottom - handContainer.getBoundingClientRect().top + 30)}px`);
      }
      const card = document.getElementById(`playerInfo${pid}`).getBoundingClientRect();
      const hasFlowers = !!flowers.querySelector('.flower-row .tile');
      flowers.style.setProperty('--flower-width', `${portrait ? 12 : short ? 16 : 24}px`);
      // Flowers hang in a tray right under their owner's plate.
      // Side plates leave room for the 出牌中 badge that hangs below them.
      let x = card.left, y = card.bottom + (pid >= 2 ? 16 : 6);
      const hand = handContainer.getBoundingClientRect();
      if (pid === 0 && !portrait && hasFlowers && hand.left - card.right >= flowers.offsetWidth + 16) {
        // Your own tray sits beside your plate, in the gap before the hand.
        x = card.right + 8; y = card.bottom - flowers.offsetHeight;
      } else if (pid === 0) {
        x = portrait ? card.right + 10 : card.left + 4;
        y = portrait ? card.top + 6 : card.bottom + 3;
        if (!portrait && hasFlowers) {
          // Keep this player's flowers below their own card, clear of the left seat.
          const rows = Math.ceil(flowers.querySelectorAll('.flower-row .tile').length / 4);
          const tileWidth = Math.min(short ? 14 : 22,
            (card.width - 78) / 4, (origin.bottom - y - 5 - (rows - 1) * 3) / rows * 5 / 7);
          flowers.style.setProperty('--flower-width', `${Math.max(1, Math.floor(tileWidth))}px`);
        }
      } else if (pid === 1) {
        // The top hand runs right under this plate: the tray sits beside it (or tucks onto its corner on phones).
        x = portrait ? card.left + 4 : card.left - flowers.offsetWidth - 8;
        y = portrait ? card.bottom + 1 : card.top + (card.height - flowers.offsetHeight) / 2;
      } else if (portrait && pid === 3) {
        x = card.right - flowers.offsetWidth;
      } else if (!portrait && short) {
        // Above the left plate; below the right one, clear of the 戰況 button under 設定.
        y = pid === 3 ? card.bottom + 6 : card.top - flowers.offsetHeight - 10;
        if (pid === 3) x = card.right - flowers.offsetWidth;
      }
      Object.assign(flowers.style, { left: `${x - origin.left - table.clientLeft}px`, right: 'auto', top: `${y - origin.top - table.clientTop}px`, bottom: 'auto', transform: 'none' });
      const cultivationNarrow = portrait && document.documentElement.classList.contains('cultivation-mode') && matchMedia('(max-width: 360px) and (max-height: 650px)').matches;
      if (portrait && pid >= 2) {
        const rack = table.querySelector(`.${pid === 2 ? 'left' : 'right'}-area > .hand-meld-container`);
        rack.style.top = `${cultivationNarrow ? card.top - origin.top - 4 : Math.max(parseFloat(table.style.getPropertyValue('--side-hand-top')), (hasFlowers ? y + flowers.offsetHeight : card.bottom) - origin.top + 12)}px`;
      } else if (pid >= 2) {
        table.querySelector(`.${pid === 2 ? 'left' : 'right'}-area > .hand-meld-container`).style.removeProperty('top');
      }
      if (pid >= 2) {
        const rack = table.querySelector(`.${pid === 2 ? 'left' : 'right'}-area > .hand-meld-container`);
        const lowerEdge = portrait && !cultivationNarrow ? Math.min(handContainer.getBoundingClientRect().top,
          document.getElementById('playerInfo0').getBoundingClientRect().top) : handContainer.getBoundingClientRect().top;
        rack.style.bottom = `${Math.max(cultivationNarrow ? 0 : parseFloat(table.style.getPropertyValue('--side-hand-bottom')),
          origin.bottom - lowerEdge + 12)}px`;
      }
    }
  }
  function fitOpponentRacks() {
    for (let pid = 1; pid < 4; pid++) {
      const rail = document.getElementById(`handBack${pid}`);
      const count = rail.children.length;
      rail.setAttribute('aria-label', `${seatNames[pid]}手牌 ${count} 張`);
      const horizontal = pid === 1;
      const melds = document.getElementById(`meldRail${pid}`);
      const meldCount = melds.querySelectorAll('.rail-tile').length;
      const groups = melds.childElementCount;
      const available = horizontal ? rail.parentElement.clientWidth : rail.parentElement.clientHeight;
      const gap = horizontal ? 3 : 2;
      const space = Math.max(0, count - 1) * gap + Math.max(0, meldCount - groups) + Math.max(0, groups - 1) * 4 + (count && meldCount ? 6 : 0) + 8;
      const limit = horizontal ? Math.min(52, rail.parentElement.clientHeight * 5 / 7) : 36;
      const size = Math.max(1, Math.floor(Math.min(limit, (available - space) / Math.max(1, count + meldCount * .86))));
      rail.parentElement.style.setProperty('--opponent-tile-width', `${size}px`);
      rail.parentElement.style.setProperty('--opponent-gap', `${gap}px`);
    }
  }
  function fitPublicTiles() {
    const origin = table.getBoundingClientRect();
    const center = (table.querySelector('#cultivationMonster') || table.querySelector('.center-info-panel')).getBoundingClientRect();
    const leftHand = table.querySelector('.left-area > .hand-meld-container').getBoundingClientRect();
    const rightHand = table.querySelector('.right-area > .hand-meld-container').getBoundingClientRect();
    const topHand = table.querySelector('.top-area > .hand-meld-container').getBoundingClientRect();
    const ownHand = handContainer.getBoundingClientRect();
    const portrait = table.dataset.portrait === 'true';
    const topFlowers = document.getElementById('meldArea1');
    const compactCenter = document.documentElement.classList.contains('table-center-compact');
    const centerGap = compactCenter ? 6 : 16;
    const top = Math.max(topHand.bottom + 14, portrait && topFlowers.querySelector('.flower-row .tile') ? topFlowers.getBoundingClientRect().bottom + 8 : 0);
    const bottom = Math.min(ownHand.top, portrait ? document.getElementById('playerInfo0').getBoundingClientRect().top : ownHand.top) - 12;
    const left = leftHand.right + 12, right = rightHand.left - 12;
    const mid = origin.left + origin.width / 2;
    const centralWidth = Math.max(50, (right - left) * (portrait ? .52 : .55));
    const regions = [
      [mid - centralWidth / 2, center.bottom + centerGap, centralWidth, bottom - center.bottom - centerGap],
      [mid - centralWidth / 2, top, centralWidth, center.top - top - 16],
      [left, Math.max(top, leftHand.top), (right - left - centralWidth) / 2 - 10, Math.min(bottom, leftHand.bottom) - Math.max(top, leftHand.top)],
      [mid + centralWidth / 2 + 10, Math.max(top, rightHand.top), (right - left - centralWidth) / 2 - 10, Math.min(bottom, rightHand.bottom) - Math.max(top, rightHand.top)]
    ];
    if (portrait) {
      // Use the clear strip between the standing hand and the two side cards.
      const topTiles = [...table.querySelectorAll('#handBack1 .tile-back, #meldRail1 .rail-tile')];
      const tileBottom = Math.max(topHand.top, ...topTiles.map(tile => tile.getBoundingClientRect().bottom));
      const cards = [2,3].map(pid => document.getElementById(`playerInfo${pid}`).getBoundingClientRect());
      const cardsTop = Math.min(...cards.map(card => card.top));
      const start = tileBottom + 7;
      const sideFlowers = [2,3].map(pid => document.getElementById(`meldArea${pid}`));
      const belowCards = Math.max(...cards.map(card => card.bottom),
        ...sideFlowers.filter(flowers => flowers.querySelector('.tile')).map(flowers => flowers.getBoundingClientRect().bottom)) + 8;
      if (document.documentElement.classList.contains('cultivation-mode') && matchMedia('(max-width: 360px) and (max-height: 650px)').matches) {
        // Narrow combat seats sit inside the standing rails; public tiles begin below the cards.
        for (let pid = 2; pid < 4; pid++) {
          const oldBottom = regions[pid][1] + regions[pid][3];
          regions[pid][1] = Math.max(regions[pid][1], belowCards);
          regions[pid][3] = oldBottom - regions[pid][1];
        }
      }
      const options = [
        [topHand.left, start, topHand.width, Math.min(cardsTop - 4, center.top - 12) - start],
        [mid - centralWidth / 2, belowCards, centralWidth, center.top - 12 - belowCards],
        [cards[0].right + 4, start, cards[1].left - cards[0].right - 8, center.top - 12 - start]
      ];
      const capacity = (rect, count) => {
        const columns = Math.max(1, Math.min(6, count)), rows = Math.max(1, Math.ceil(count / 6));
        return Math.min((rect[2] - (columns - 1) * 2 - 6) / columns,
          (rect[3] - (rows - 1) * 2 - 8) / rows * 5 / 7);
      };
      const count = document.querySelectorAll('#discardArea1 .tile').length;
      regions[1] = options.reduce((best, candidate) => capacity(candidate, count) > capacity(best, count) ? candidate : best);
      // The own card only blocks its left-hand area, not the entire lower table.
      const ownCard = document.getElementById('playerInfo0').getBoundingClientRect();
      const ownFlowers = document.getElementById('meldArea0');
      const ownLeft = Math.max(regions[0][0], ownCard.right + 12,
        ownFlowers.querySelector('.tile') ? ownFlowers.getBoundingClientRect().right + 12 : 0);
      const ownOption = [ownLeft, regions[0][1], mid + centralWidth / 2 - ownLeft,
        ownHand.top - 12 - regions[0][1]];
      const ownCount = document.querySelectorAll('#discardArea0 .tile').length;
      if (capacity(ownOption, ownCount) > capacity(regions[0], ownCount)) regions[0] = ownOption;
    } else if (regions[1][3] < 28) {
      // Share the space to the right of the compass vertically. Reserving a
      // separate top strip prevents a six-tile line collapsing to one pixel.
      const start = center.right + (compactCenter ? 4 : 12);
      const topTiles = [...table.querySelectorAll('#handBack1 .tile-back, #meldRail1 .rail-tile')];
      const startY = Math.max(topHand.top, ...topTiles.map(tile => tile.getBoundingClientRect().bottom)) + 8;
      const lines = Math.max(1, Math.ceil(document.querySelectorAll('#discardArea1 .tile').length / 6));
      const stripHeight = Math.min(center.bottom - startY - 4, Math.max(28, Math.ceil(lines * 6 * 7 / 5 + (lines - 1) * 2 + 8)));
      regions[1] = [start, startY, right - start, stripHeight];
      const rightBottom = regions[3][1] + regions[3][3];
      regions[3][1] = Math.max(regions[3][1], startY + stripHeight + 4);
      regions[3][3] = rightBottom - regions[3][1];
    }
    for (let pid = 0; pid < 4; pid++) {
      const area = document.getElementById(`discardArea${pid}`), zone = area.parentElement;
      const [x, y, width, height] = regions[pid];
      Object.assign(zone.style, { left: `${x - origin.left - table.clientLeft}px`, top: `${y - origin.top - table.clientTop}px`, width: `${Math.max(1, width)}px`, height: `${Math.max(1, height)}px` });
      // Rendering groups tiles in .discard-row wrappers; count physical tiles, not rows.
      const tiles = [...area.querySelectorAll('.tile')];
      const count = tiles.length;
      if (!count) continue;
      // Six per line from each player's left to right, then toward the center.
      // Keep DOM chronology intact: only the visual grid coordinates change.
      const vertical = pid >= 2;
      const lineLength = Math.min(6, count);
      const lines = Math.ceil(count / 6);
      const columns = vertical ? lines : lineLength;
      const rows = vertical ? lineLength : lines;
      const gap = compactCenter ? 1 : portrait || table.clientHeight < 500 ? 2 : 4;
      const tileWidth = Math.max(1, Math.floor(Math.min(portrait ? 24 : 36,
        (width - (columns - 1) * gap - (compactCenter ? 2 : 6)) / columns / (vertical ? 7 / 5 : 1),
        (height - (rows - 1) * gap - 8) / rows / (vertical ? 1 : 7 / 5))));
      area.style.setProperty('--river-columns', String(columns));
      area.style.setProperty('--river-rows', String(rows));
      area.style.setProperty('--river-tile-width', `${tileWidth}px`);
      area.style.setProperty('--river-cell-width', `${tileWidth * (vertical ? 7 / 5 : 1)}px`);
      area.style.setProperty('--river-cell-height', `${tileWidth * (vertical ? 1 : 7 / 5)}px`);
      area.style.setProperty('--river-angle', `${[0,180,90,-90][pid]}deg`);
      area.style.setProperty('--river-tile-gap', `${gap}px`);
      tiles.forEach((tile, index) => {
        const line = Math.floor(index / 6), position = index % 6;
        const column = [position + 1, lineLength - position, line + 1, lines - line][pid];
        const row = [lines - line, line + 1, position + 1, lineLength - position][pid];
        tile.style.gridColumn = String(column);
        tile.style.gridRow = String(row);
      });
    }
  }
  function refresh() {
    sizeTable();
    pagers.forEach(updatePager);
    fitPersonalRack();
    fitFlowers();
    fitOpponentRacks();
    fitPublicTiles();
  }
  const observed = [log, ...[0, 1, 2, 3].flatMap(pid => [
    document.getElementById(`discardArea${pid}`), document.getElementById(`meldArea${pid}`)
  ]), ...[1, 2, 3].map(pid => document.getElementById(`handBack${pid}`)),
  ...[0, 1, 2, 3].map(pid => document.getElementById(`meldRail${pid}`)), document.getElementById('yourHand')];
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target === log && record.removedNodes.length)) logPager.index = 0;
    schedule();
  });
  observed.forEach(node => observer.observe(node, { childList: true, subtree: true }));
  const resize = new ResizeObserver(schedule);
  resize.observe(table);
  resize.observe(sidebar);
  resize.observe(playColumn);
  compact.addEventListener('change', () => selectPage(selectedPage, false));
  landscape.addEventListener('change', schedule);
  window.addEventListener('resize', schedule);
  window.MahjongTableLayout = { refresh: schedule, fitNow: refresh, showTool: name => selectPage(name, compact.matches), showWorkshop: workshop };
  schedule();
})();
