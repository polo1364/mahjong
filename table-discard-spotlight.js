/* 剛打亮牌: the latest discard pops up large beside its owner's river until the next discard or a claim. */
(function (root) {
  'use strict';
  let spot = null, current = null;
  // The game's state is a top-level `let S` (shared by classic scripts, not a window property).
  const game = () => (typeof S !== 'undefined' ? S : null);
  // The name shown on the seat plate (in cultivation mode that is the hero's name).
  const seatName = pid => { const n = document.querySelector(`#playerInfo${pid} .seat-name`)?.firstChild; return (n?.nodeType === 3 ? n.textContent.trim() : '') || (root.playerName ? root.playerName(pid) : ''); };
  const sideOf = pid => ['above', 'below', 'right', 'left'][pid];
  function element() {
    if (spot?.isConnected) return spot;
    const table = document.getElementById('playersGrid');
    if (!table) return null;
    spot = document.createElement('div');
    spot.id = 'discardSpotlight'; spot.className = 'discard-spotlight'; spot.setAttribute('aria-live', 'polite'); spot.hidden = true;
    table.append(spot);
    return spot;
  }
  function hide() { if (spot) spot.hidden = true; }
  function update() {
    const S = game();
    if (!S || !S.players || S.phase === 'end' || S.phase === 'deal') { current = null; hide(); return; }
    const last = S.lastDiscard;
    if (last?.tile) current = { from: last.from, tile: last.tile };
    // The live discard waits outside the river until claims are settled; once claimed it leaves, and so does the spotlight.
    const live = S.lastDiscard?.tile?.id === current?.tile.id;
    if (!current || (!live && !S.players[current.from]?.discards.some(t => t.id === current.tile.id))) { current = null; hide(); return; }
    const box = element(); if (!box) return;
    const river = document.querySelector(`#discardArea${current.from} .discard-latest`) || document.getElementById('playerInfo' + current.from);
    const table = document.getElementById('playersGrid');
    if (!river || !table) { hide(); return; }
    const key = root.tileKey(current.tile);
    const name = seatName(current.from);
    box.innerHTML = `<span class="spot-tile tile">${root.tileFace(current.tile)}</span><small>${current.from === 0 ? '你' : name} 剛打</small>`;
    box.setAttribute('aria-label', `${current.from === 0 ? '你' : name}剛打出 ${root.keyToText ? root.keyToText(key) : key}`);
    box.dataset.side = sideOf(current.from);
    box.classList.toggle('is-live', live);
    box.hidden = false;
    const t = table.getBoundingClientRect(), r = river.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight, gap = 10;
    let x = r.left + r.width / 2 - w / 2, y = r.top + r.height / 2 - h / 2;
    if (box.dataset.side === 'below') y = r.bottom + gap;
    if (box.dataset.side === 'above') y = r.top - h - gap;
    if (box.dataset.side === 'right') x = r.right + gap;
    if (box.dataset.side === 'left') x = r.left - w - gap;
    x = Math.min(Math.max(t.left + 6, x), t.right - w - 6); y = Math.min(Math.max(t.top + 6, y), t.bottom - h - 6);
    box.style.left = (x - t.left - table.clientLeft) + 'px'; box.style.top = (y - t.top - table.clientTop) + 'px';
  }
  // Every table repaint passes through renderAll; follow it without touching game state.
  if (typeof root.renderAll === 'function') {
    const original = root.renderAll;
    root.renderAll = function (...args) { const result = original.apply(this, args); try { update(); } catch (_) { hide(); } return result; };
  }
  root.addEventListener('resize', () => requestAnimationFrame(update));
  root.MahjongDiscardSpotlight = Object.freeze({ update, hide });
})(typeof window !== 'undefined' ? window : globalThis);
