/* 整備庭院 without page scrolling: the existing preparation dialog is regrouped into a fixed-height,
   two-column layout (left: 角色/征途/同行 tabs, right: the supply tabs), and long lists are split into
   pages that fit the space. Game logic and the existing markup builders are untouched. */
(function (root) {
  'use strict';
  const GRID = '.supply-grid, .equip-shop-grid, .equip-redemptions, .equip-item-list, .equip-sets, .supply-summary';
  const KEEP = '.equip-comparison, .supply-toolbar, .equip-filters, .equip-worn, .equip-npc-intro';
  const pageOf = new Map();        // remembered page per screen part, so a re-render keeps your place
  let leftTab = 'hero';

  function flowItems(box) {
    const out = [];
    for (const el of box.children) {
      if (el.classList.contains('prep-pager') || el.matches(KEEP) || el.hidden || getComputedStyle(el).display === 'none' && !el.classList.contains('prep-off')) continue;
      if (el.matches(GRID)) out.push(...el.children);
      else if (el.querySelector(GRID)) out.push(...flowItems(el));
      else out.push(el);
    }
    return out;
  }
  // Split a box's flowing children into pages that fit its height and show one page with a pager.
  function paginate(box, key, items = flowItems(box)) {
    if (!box || !box.isConnected) return;
    box.querySelector(':scope > .prep-pager')?.remove();
    for (const el of box.querySelectorAll('.prep-off')) el.classList.remove('prep-off');
    if (!items.length) return;
    const limitBottom = box.getBoundingClientRect().bottom - 4;
    const fits = () => items.every(el => el.getBoundingClientRect().bottom <= limitBottom + .5);
    if (fits()) { pageOf.delete(key); return; }
    const pager = document.createElement('nav'); pager.className = 'prep-pager'; pager.setAttribute('aria-label', '分頁');
    pager.innerHTML = '<button type="button" data-step="-1" aria-label="上一頁">‹ 上一頁</button><span></span><button type="button" data-step="1" aria-label="下一頁">下一頁 ›</button>';
    box.append(pager);
    const room = pager.getBoundingClientRect().top - 10;
    const pages = []; let current = [], start = null;
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (start === null) start = r.top;
      if (current.length && r.bottom - start > room - items[0].getBoundingClientRect().top) { pages.push(current); current = []; start = r.top; }
      current.push(el);
    }
    if (current.length) pages.push(current);
    let page = Math.min(pageOf.get(key) || 0, pages.length - 1);
    const show = () => {
      pages.forEach((list, i) => list.forEach(el => el.classList.toggle('prep-off', i !== page)));
      pager.querySelector('span').textContent = `${page + 1} / ${pages.length}`;
      pager.querySelector('[data-step="-1"]').disabled = page === 0;
      pager.querySelector('[data-step="1"]').disabled = page === pages.length - 1;
      pageOf.set(key, page);
    };
    pager.onclick = event => { const step = Number(event.target.closest('button')?.dataset.step); if (!step) return; page = Math.max(0, Math.min(pages.length - 1, page + step)); show(); };
    show();
  }

  function enhance(dialog) {
    if (dialog.classList.contains('prep-noscroll')) return;
    const wrap = dialog.querySelector('.journey-wrap'), grid = dialog.querySelector('.journey-preparation-grid'), equip = dialog.querySelector('.equip-ui');
    const hero = dialog.querySelector('.journey-prepared-hero'), road = dialog.querySelector('.journey-preparation-side'), party = dialog.querySelector('.journey-party'), progression = dialog.querySelector('.journey-progression');
    const header = dialog.querySelector('.journey-header'), intro = dialog.querySelector('.journey-intro'), footer = dialog.querySelector('.journey-footer');
    if (!wrap || !grid || !equip || !hero || !header || !footer) return;
    dialog.classList.add('prep-noscroll');
    // Header carries the title, the hand summary and the two navigation buttons, always in view.
    const titleBox = header.firstElementChild; if (intro) titleBox?.append(intro);
    // On short screens the left column folds away behind this button.
    const leftToggle = document.createElement('button'); leftToggle.type = 'button'; leftToggle.className = 'prep-left-toggle'; leftToggle.textContent = progression ? '角色・修行' : '角色・征途';
    leftToggle.setAttribute('aria-expanded', 'false');
    leftToggle.onclick = () => { const open = dialog.classList.toggle('prep-left-open'); leftToggle.setAttribute('aria-expanded', String(open)); if (open) requestAnimationFrame(() => layoutLeft(dialog)); };
    header.append(leftToggle, footer);
    // Left column: one card at a time.
    const left = document.createElement('section'); left.className = 'prep-left';
    const panes = [['hero', '角色', hero], ['progression', '修行', progression], ['road', '征途', road], ['party', '同行', party]].filter(([, , el]) => el);
    left.innerHTML = `<div class="prep-left-tabs" role="tablist" aria-label="庭院資訊">${panes.map(([id, name]) => `<button type="button" role="tab" data-left="${id}">${name}</button>`).join('')}<button type="button" class="prep-left-close" aria-label="收起角色資訊">×</button></div>`;
    left.querySelector('.prep-left-close').onclick = () => { dialog.classList.remove('prep-left-open'); dialog.querySelector('.prep-left-toggle')?.setAttribute('aria-expanded', 'false'); };
    const body = document.createElement('div'); body.className = 'prep-left-body';
    for (const [id, , el] of panes) { el.dataset.leftPane = id; body.append(el); }
    left.append(body); grid.prepend(left);
    const selectLeft = id => {
      leftTab = panes.some(p => p[0] === id) ? id : 'hero';
      left.querySelectorAll('[data-left]').forEach(b => { const on = b.dataset.left === leftTab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      for (const [id2, , el] of panes) el.hidden = id2 !== leftTab;
      layoutLeft(dialog);
    };
    left.querySelector('.prep-left-tabs').onclick = event => { const b = event.target.closest('[data-left]'); if (b) selectLeft(b.dataset.left); };
    selectLeft(leftTab);
    // The supply side re-renders its whole host after every action; re-split its lists each time.
    new MutationObserver(() => requestAnimationFrame(() => layoutRight(dialog))).observe(equip, { childList: true });
    // Pictures and fonts can arrive after the split: measure again once they settle.
    dialog.addEventListener('load', event => { if (event.target.tagName === 'IMG') { clearTimeout(dialog.prepReflow); dialog.prepReflow = setTimeout(() => { layoutRight(dialog); layoutLeft(dialog); }, 60); } }, true);
    document.fonts?.ready.then(() => { layoutRight(dialog); layoutLeft(dialog); });
    new MutationObserver(() => requestAnimationFrame(() => layoutLeft(dialog))).observe(hero, { childList: true, subtree: true });
    if (progression) new MutationObserver(() => requestAnimationFrame(() => layoutLeft(dialog))).observe(progression, { childList: true });
    requestAnimationFrame(() => { layoutRight(dialog); layoutLeft(dialog); });
  }
  function layoutRight(dialog) {
    const panel = dialog.querySelector('#equipPanel'); if (!panel) return;
    const tab = dialog.querySelector('.equip-tabs [aria-selected="true"]')?.dataset.tab || 'tab';
    // 鑄器師 is laid out to fit as one page so its main action never moves behind a pager.
    if (tab === 'forge') { panel.querySelector(':scope > .prep-pager')?.remove(); panel.querySelectorAll('.prep-off').forEach(el => el.classList.remove('prep-off')); return; }
    paginate(panel, 'right:' + tab);
  }
  function layoutLeft(dialog) {
    const pane = dialog.querySelector(`.prep-left-body > [data-left-pane="${leftTab}"]`); if (!pane) return;
    if (leftTab === 'progression') {
      dialog.querySelector('.prep-left-body > .prep-pager')?.remove();
      pane.querySelectorAll('.prep-off').forEach(el => el.classList.remove('prep-off'));
      return;
    }
    const inner = [...pane.children].flatMap(el => el.matches('div:not([class])') ? [...el.children] : [el]);
    paginate(dialog.querySelector('.prep-left-body'), 'left:' + leftTab, inner.filter(el => !el.hidden));
  }
  const refresh = () => document.querySelectorAll('dialog.journey-supplies-screen.prep-noscroll[open]').forEach(d => { layoutRight(d); layoutLeft(d); });
  new MutationObserver(() => document.querySelectorAll('dialog.journey-supplies-screen[open]:not(.prep-noscroll)').forEach(enhance))
    .observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ['open'] });
  document.addEventListener('toggle', () => document.querySelectorAll('dialog.journey-supplies-screen[open]').forEach(enhance), true);
  let resizeTimer = 0; root.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(refresh, 120); });
  root.MahjongPrepLayout = Object.freeze({ refresh });
})(typeof window !== 'undefined' ? window : globalThis);
