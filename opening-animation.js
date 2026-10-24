/* Original Qinghe opening choreography. Only public dice, seats and counts enter here.
 * The engine owns shuffling, dealing and flower replacement; these backs reveal no tiles. */
(() => {
  'use strict';

  const OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const MOVE = 'cubic-bezier(0.77, 0, 0.175, 1)';
  const SEAT_NAMES = ['你', '對家', '上家', '下家'];
  const HAND_SELECTORS = ['#yourHand', '#handBack1', '#handBack2', '#handBack3'];
  const PHASES = [
    ['shuffle', '洗牌', '靈牌流轉，陣法將啟'],
    ['dice', '擲骰', '骰定天機，四方入座'],
    ['wall', '堆牌', '四方牌牆 · 每方十八墩'],
    ['deal', '拿牌', '依序取牌，靜候機緣']
  ];
  const PIPS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8],
    4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
  };
  const motionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let active = null;
  let lastState = { active: false, phase: 'idle', status: 'idle' };

  function element(tag, className, parent, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  function later(run, delay, callback) {
    if (run.settled) return;
    const timer = window.setTimeout(() => {
      run.timers.delete(timer);
      if (!run.settled) {
        try { callback(); } catch (_) { settle(run, 'skipped', 'presentation-error'); }
      }
    }, delay);
    run.timers.add(timer);
  }

  function animate(run, node, frames, options) {
    if (typeof node.animate !== 'function' || run.settled) return;
    const animation = node.animate(frames, { fill: 'both', easing: OUT, ...options });
    run.animations.add(animation);
    animation.finished.then(() => {
      if (!run.settled && typeof animation.commitStyles === 'function') {
        try { animation.commitStyles(); } catch (_) { /* Detached elements need no final style. */ }
      }
      animation.cancel();
      run.animations.delete(animation);
    }, () => run.animations.delete(animation));
  }

  function cue(run, name) {
    if (typeof run.options.onCue === 'function') {
      try { run.options.onCue(name); } catch (_) { /* Audio must never block a round. */ }
    }
  }

  function settle(run, status, reason) {
    if (!run || run.settled) return;
    run.settled = true;
    for (const timer of run.timers) window.clearTimeout(timer);
    run.timers.clear();
    for (const animation of run.animations) animation.cancel();
    run.animations.clear();
    document.removeEventListener('keydown', run.keyHandler);
    document.removeEventListener('visibilitychange', run.visibilityHandler);
    window.removeEventListener('resize', run.resizeHandler);
    run.node.remove();
    if (active === run) active = null;
    lastState = {
      active: false, phase: run.phase, status, reason: reason || '',
      dice: run.dice.slice(), dealer: run.dealer, handCounts: run.counts.slice()
    };
    run.resolve({ status, phase: run.phase, reason: reason || '' });
  }

  function finish(reason = 'skip') {
    if (active) settle(active, 'skipped', typeof reason === 'string' ? reason : 'skip');
  }

  function cancel(reason = 'cancelled') {
    if (active) settle(active, 'cancelled', String(reason));
  }

  function phase(run, index) {
    if (run.settled) return;
    const [name, title, caption] = PHASES[index];
    run.phase = name;
    run.node.dataset.phase = name;
    run.title.textContent = title;
    run.caption.textContent = caption;
    run.step.textContent = `0${index + 1} / 04`;
    run.progress.forEach((item, i) => {
      item.classList.toggle('opening-current', i === index);
      item.classList.toggle('opening-done', i < index);
      if (i === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    if (typeof run.options.onPhase === 'function') {
      try { run.options.onPhase(name); } catch (_) { /* Observer errors must not strand the gate. */ }
    }
  }

  function transform(x, y, angle = 0, scale = 1) {
    return `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg) scale(${scale})`;
  }

  function makeBack(parent, className = '') {
    return element('span', `opening-tile ${className}`.trim(), parent);
  }

  function makeDie(parent, value, index) {
    const wrap = element('div', 'opening-die-wrap', parent);
    const cube = element('div', 'opening-die', wrap);
    cube.dataset.value = String(value);
    cube.setAttribute('role', 'img');
    cube.setAttribute('aria-label', `第${index + 1}顆骰子：${value}點`);
    const front = [1, 2, 3].find(n => n !== value && n !== 7 - value);
    const right = [1, 2, 3, 4, 5, 6].find(n => ![value, 7 - value, front, 7 - front].includes(n));
    const faces = { front, back: 7 - front, top: value, bottom: 7 - value, right, left: 7 - right };
    for (const [side, dots] of Object.entries(faces)) {
      const face = element('div', `opening-die-face opening-die-${side}`, cube);
      face.dataset.pips = String(dots);
      face.setAttribute('aria-hidden', 'true');
      for (const position of PIPS[dots]) {
        const pip = element('i', 'opening-pip', face);
        pip.style.gridArea = `${Math.floor(position / 3) + 1} / ${position % 3 + 1}`;
      }
      if (dots === 1 || dots === 4) face.classList.add('opening-red-pips');
    }
    return { wrap, cube };
  }

  function build(run) {
    const wide = document.documentElement.classList.contains('table-scene');
    if (wide) window.MahjongTableLayout?.fitNow?.();
    const node = element('div', `opening-overlay opening-${run.style}`, run.container);
    node.dataset.phase = 'shuffle';
    node.dataset.dice = run.dice.join(',');
    node.dataset.dealer = String(run.dealer);
    node.setAttribute('aria-label', '開局動畫');
    run.node = node;
    const head = element('div', 'opening-heading', node);
    element('span', 'opening-eyebrow', head, '雀仙門 · 開壇');
    const titleRow = element('div', 'opening-title-row', head);
    run.step = element('span', 'opening-step', titleRow, '01 / 04');
    run.title = element('strong', 'opening-title', titleRow, '洗牌');
    run.caption = element('span', 'opening-caption', head, '');
    head.setAttribute('role', 'status');
    head.setAttribute('aria-live', 'polite');
    const stage = element('div', 'opening-stage', node);
    stage.setAttribute('aria-hidden', 'true');
    run.stage = stage;
    const seal = element('div', 'opening-seal', stage);
    element('span', 'opening-seal-inner', seal, '仙');
    run.shuffle = element('div', 'opening-shuffle', stage);
    run.wall = element('div', 'opening-wall', stage);
    run.wall.dataset.stacks = '72';
    run.wall.dataset.tiles = '144';
    run.diceLayer = element('div', 'opening-dice-layer', node);
    const diceTray = element('div', 'opening-dice-tray', run.diceLayer);
    run.diceNodes = run.dice.map((value, i) => makeDie(diceTray, value, i));
    element('div', 'opening-dice-result', run.diceLayer,
      `${run.dice[0]} ＋ ${run.dice[1]} ＝ ${run.dice[0] + run.dice[1]} 點`);
    run.diceLayer.setAttribute('aria-label', `骰子${run.dice[0]}點、${run.dice[1]}點，共${run.dice[0] + run.dice[1]}點`);
    run.diceLayer.setAttribute('role', 'group');
    const footer = element('div', 'opening-footer', node);
    const progress = element('ol', 'opening-progress', footer);
    progress.setAttribute('aria-label', '開局步驟');
    run.progress = PHASES.map(([, title], i) => {
      const item = element('li', 'opening-progress-item', progress);
      element('span', 'opening-progress-number', item, String(i + 1).padStart(2, '0'));
      element('span', 'opening-progress-label', item, title);
      return item;
    });
    const skip = element('button', 'opening-skip', footer, '跳過動畫');
    skip.type = 'button';
    skip.setAttribute('aria-label', '跳過開局動畫，立即開始打牌');
    skip.addEventListener('click', finish);
    element('span', 'opening-skip-hint', footer, 'Esc 可略過');
    const bounds = node.getBoundingClientRect();
    run.width = bounds.width;
    run.height = bounds.height;
    run.cx = bounds.width / 2;
    run.cy = bounds.height * .47;
    const compact = Math.min(bounds.width, bounds.height) < 440;
    const narrowCompact = compact && bounds.width <= 600;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const handPoints = HAND_SELECTORS.map(selector => {
      const hand = run.container.querySelector(selector);
      const rect = hand && hand.getBoundingClientRect();
      const inside = rect && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
        && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
      return rect && rect.width > 0 && rect.height > 0 && (!wide || inside)
        ? { x: rect.left + rect.width / 2 - bounds.left, y: rect.top + rect.height / 2 - bounds.top }
        : null;
    });
    const compactTop = clamp(handPoints[1]?.y ?? 72, 72, Math.max(72, Math.min(90, bounds.height * .28)));
    // The self rail may be outside a small square table. Keep its representative
    // arrival row inside the overlay, above the skip controls.
    const compactBottom = bounds.height - 60;
    if (wide) {
      const center = run.container.querySelector('.center-info-panel')?.getBoundingClientRect();
      // Short tables move their compass upward; share its actual center with every phase.
      if (center && center.width > 0 && center.height > 0
        && center.left >= bounds.left && center.right <= bounds.right
        && center.top >= bounds.top && center.bottom <= bounds.bottom) {
        run.cx = center.left + center.width / 2 - bounds.left;
        run.cy = center.top + center.height / 2 - bounds.top;
      } else run.cy = bounds.height / 2;
    } else if (compact) run.cy = (compactTop + compactBottom) / 2;
    node.classList.toggle('opening-compact', compact);
    node.classList.toggle('opening-narrow', bounds.width <= 600);
    node.classList.toggle('opening-tiny', bounds.width < 256);
    if (wide && bounds.width <= 600 && handPoints[0]) {
      footer.style.bottom = `${Math.max(12, bounds.height - handPoints[0].y + 24)}px`;
    }
    let tileWidth = narrowCompact
      ? Math.max(4, Math.min(12, (bounds.width - 80) / 24, (bounds.height - 185) / 25))
      : compact
      ? Math.max(5, Math.min(14, (bounds.width - 132) / 24, (bounds.height - 130) / 23))
      : Math.max(7, Math.min(16, (bounds.width - 132) / 24));
    // Reserve a separate lane for the dealt hands, including the tile edges.
    if (compact) tileWidth = Math.max(3, Math.min(tileWidth, (compactBottom - compactTop - 32) / 24));
    if (wide) {
      // A wide table can be short: fit the complete wall between its real controls.
      const headingBottom = head.getBoundingClientRect().bottom - bounds.top;
      const footerTop = footer.getBoundingClientRect().top - bounds.top;
      const radius = Math.min(run.cx - 12, bounds.width - run.cx - 12,
        run.cy - headingBottom - 12, footerTop - run.cy - 12);
      // Wall extent + half a rotated tile + the upper layer / arrival overshoot.
      tileWidth = Math.max(1, Math.min(tileWidth, (radius - 9 * 1.4 - 11) / 11.37));
      run.diceLayer.style.left = `${run.cx}px`;
      run.diceLayer.style.top = `${run.cy}px`;
    }
    run.tileWidth = tileWidth;
    run.wallGap = compact
      ? Math.min(1.4, Math.max(.4, (compactBottom - compactTop - tileWidth * 24 - 6) / 18))
      : 1.4;
    run.wallExtent = (tileWidth + run.wallGap) * 9 + tileWidth * 1.65;
    node.style.setProperty('--opening-tile-width', `${tileWidth}px`);
    stage.style.left = `${run.cx}px`;
    stage.style.top = `${run.cy}px`;
    run.targets = HAND_SELECTORS.map((selector, i) => {
      if (wide && handPoints[i]) {
        const point = handPoints[i];
        const along = (Math.max(0, run.counts[i] - 1) * .34 + .44) * tileWidth;
        const across = .72 * .88 * tileWidth;
        const halfWidth = i < 2 ? along : across;
        const halfHeight = i < 2 ? across : along;
        return {
          x: clamp(point.x, halfWidth, bounds.width - halfWidth) - run.cx,
          y: clamp(point.y, halfHeight, bounds.height - halfHeight) - run.cy
        };
      }
      if (compact) {
        const point = handPoints[i];
        let x = run.cx;
        let y = i === 0 ? compactBottom : compactTop;
        if (i === 1 && point) x = clamp(point.x, bounds.width * .3, bounds.width * .7);
        if (i === 2 || i === 3) {
          x = i === 2
            ? clamp(point?.x ?? bounds.width * .12, 16, run.cx - run.wallExtent - 12)
            : clamp(point?.x ?? bounds.width * .88, run.cx + run.wallExtent + 12, bounds.width - 16);
          const halfHand = (run.counts[i] - 1) * tileWidth * .34;
          y = clamp(point?.y ?? run.cy, compactTop + halfHand + 12, compactBottom - halfHand - 12);
        }
        return { x: x - run.cx, y: y - run.cy };
      }
      const fallback = [
        [bounds.width / 2, bounds.height * .79], [bounds.width / 2, bounds.height * .23],
        [bounds.width * .13, bounds.height * .48], [bounds.width * .87, bounds.height * .48]
      ][i];
      const x = handPoints[i]?.x ?? fallback[0];
      const y = handPoints[i]?.y ?? fallback[1];
      return {
        x: Math.max(24, Math.min(bounds.width - 24, x)) - run.cx,
        y: Math.max(145, Math.min(bounds.height - 140, y)) - run.cy
      };
    });
    run.seats = run.targets.map((target, i) => {
      const seat = element('div', `opening-seat opening-seat-${i}`, stage);
      seat.style.transform = `translate(${target.x}px, ${target.y}px)`;
      seat.dataset.seat = String(i);
      element('span', 'opening-seat-name', seat, `${SEAT_NAMES[i]}${i === run.dealer ? ' · 莊' : ''}`);
      const count = element('span', 'opening-seat-count', seat, '0 張');
      return { node: seat, count, dealt: 0 };
    });
  }

  function shuffle(run) {
    phase(run, 0);
    if (run.settled) return;
    cue(run, 'shuffle');
    for (let i = 0; i < 48; i++) {
      const tile = makeBack(run.shuffle, 'opening-scattered');
      const angle = i * 2.399963;
      const radius = 28 + (i % 9) * run.tileWidth * .8;
      const x = Math.cos(angle) * radius * 1.25;
      const y = Math.sin(angle) * radius * .74;
      const final = transform(x, y, i * 73 % 180);
      tile.style.transform = final;
      animate(run, tile, [
        { transform: transform(x * .4, y * .4, i * 19, .94), opacity: 0 },
        { transform: transform(-y * 1.3, x * .65, i * 19 + 120), opacity: 1, offset: .32 },
        { transform: transform(x * 1.15, y * 1.15, i * 19 + 260), opacity: 1, offset: .72 },
        { transform: final, opacity: .9 }
      ], { duration: 900, delay: i % 8 * 12, easing: MOVE });
    }
  }

  function rollDice(run) {
    phase(run, 1);
    if (run.settled) return;
    animate(run, run.shuffle, [{ opacity: 1 }, { opacity: .12 }], { duration: 200 });
    run.diceNodes.forEach(({ wrap, cube }, i) => {
      const x = i ? 39 : -39;
      wrap.style.transform = transform(x, 0, i ? 8 : -8);
      cube.style.transform = 'rotateX(-62deg) rotateY(18deg)';
      animate(run, wrap, [
        { transform: transform(x - 74, -125, -35), opacity: 0 },
        { transform: transform(x + 12, 13, 16), opacity: 1, offset: .46 },
        { transform: transform(x - 7, -26, -14), opacity: 1, offset: .65 },
        { transform: transform(x + 3, 4, 11), opacity: 1, offset: .84 },
        { transform: transform(x, 0, i ? 8 : -8), opacity: 1 }
      ], { duration: 650, delay: i * 70, easing: MOVE });
      animate(run, cube, [
        { transform: `rotateX(${i ? 658 : -782}deg) rotateY(${i ? -702 : 738}deg)` },
        { transform: 'rotateX(-62deg) rotateY(18deg)' }
      ], { duration: 650, delay: i * 70 });
    });
    later(run, 120, () => cue(run, 'dice'));
  }

  function buildWall(run) {
    phase(run, 2);
    if (run.settled) return;
    run.wallTiles = [];
    const width = run.tileWidth;
    const gap = width + run.wallGap;
    const extent = run.wallExtent;
    for (let side = 0; side < 4; side++) {
      for (let index = 0; index < 18; index++) {
        const distance = (index - 8.5) * gap;
        const positions = [
          [distance, extent, 0], [-distance, -extent, 180],
          [-extent, distance, 90], [extent, -distance, -90]
        ];
        const [x, y, angle] = positions[side];
        const stack = element('div', 'opening-stack', run.wall);
        stack.dataset.side = String(side);
        stack.dataset.stack = String(index);
        stack.style.transform = transform(x, y, angle);
        const tiles = [makeBack(stack, 'opening-wall-lower'), makeBack(stack, 'opening-wall-upper')];
        // Upper then lower is also the visible draw order from each two-tile stack.
        run.wallTiles.push({ node: tiles[1], x, y: y - 5, angle });
        run.wallTiles.push({ node: tiles[0], x, y, angle });
        animate(run, stack, [
          { transform: transform(x * .38, y * .38, angle + 80, .95), opacity: 0 },
          { transform: transform(x, y - 6, angle), opacity: 1, offset: .8 },
          { transform: transform(x, y, angle), opacity: 1 }
        ], { duration: 300, delay: index * 16 + side * 40 });
      }
    }
    cue(run, 'wall');
  }

  function deal(run) {
    phase(run, 3);
    if (run.settled) return;
    const turnOrder = [0, 3, 1, 2];
    const firstSeat = turnOrder.indexOf(run.dealer);
    const order = Array.isArray(run.options.dealOrder)
      && run.options.dealOrder.length === 4
      && new Set(run.options.dealOrder).size === 4
      && run.options.dealOrder.every(seat => Number.isInteger(seat) && seat >= 0 && seat < 4)
      ? run.options.dealOrder.slice()
      : Array.from({ length: 4 }, (_, i) => turnOrder[(firstSeat + i) % 4]);
    let batch = 0;
    let drawn = 0;
    const requested = run.counts.map(count => Math.min(17, count));
    // Presentation only: taking 4 at a time communicates normal sixteen-tile dealing.
    // Any special flower result can provide smaller public final hand counts.
    for (let round = 0; round < 5; round++) {
      for (const seat of order) {
        const count = Math.max(0, Math.min(4, requested[seat] - round * 4));
        if (!count) continue;
        const startIndex = drawn;
        drawn += count;
        later(run, batch * 64, () => {
          const target = run.targets[seat];
          const hand = run.seats[seat];
          if (seat === run.dealer && round < 4) cue(run, 'draw');
          for (let tileIndex = 0; tileIndex < count; tileIndex++) {
            const wallIndex = (run.dice[0] + run.dice[1]) * 2 + startIndex + tileIndex;
            const source = run.wallTiles[wallIndex % run.wallTiles.length];
            source.node.style.visibility = 'hidden';
            const tile = makeBack(run.stage, 'opening-flight');
            const spread = (hand.dealt + tileIndex - (requested[seat] - 1) / 2) * run.tileWidth * .68;
            const vertical = seat === 2 || seat === 3;
            const x = target.x + (vertical ? 0 : spread);
            const y = target.y + (vertical ? spread : 0);
            const angle = vertical ? 90 : 0;
            tile.style.transform = transform(x, y, angle, .88);
            tile.style.opacity = '0';
            animate(run, tile, [
              { transform: transform(source.x, source.y, source.angle), opacity: 1 },
              { transform: transform((source.x + x) / 2, (source.y + y) / 2 - 22, angle, 1.08), opacity: 1, offset: .5 },
              { transform: transform(x, y, angle, .88), opacity: 1, offset: .88 },
              { transform: transform(x, y, angle, .88), opacity: .9 }
            ], { duration: 260, delay: tileIndex * 15 });
          }
          hand.dealt += count;
          hand.count.textContent = `${hand.dealt} 張`;
          hand.node.dataset.count = String(hand.dealt);
        });
        batch++;
      }
    }
    later(run, Math.max(1100, batch * 64 + 260), () => {
      run.title.textContent = '論道開始';
      run.caption.textContent = '牌陣已成，請出手';
      animate(run, run.node, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
      later(run, 180, () => settle(run, 'completed'));
    });
  }

  function play(options = {}) {
    cancel('replaced');
    const container = options.container || document.querySelector('.mahjong-table');
    if (!container || typeof container.appendChild !== 'function') {
      return Promise.resolve({ status: 'skipped', phase: 'idle', reason: 'missing-container' });
    }
    const dice = Array.isArray(options.dice) && options.dice.length === 2
      && options.dice.every(n => Number.isInteger(n) && n >= 1 && n <= 6)
      ? options.dice.slice() : null;
    // Never invent a dice result when the engine has not supplied a valid one.
    if (!dice) return Promise.resolve({ status: 'skipped', phase: 'idle', reason: 'invalid-dice' });
    const dealer = Number.isInteger(options.dealer) && options.dealer >= 0 && options.dealer < 4
      ? options.dealer : 0;
    const counts = Array.from({ length: 4 }, (_, seat) => {
      const count = options.handCounts && options.handCounts[seat];
      return Number.isInteger(count) && count >= 0 && count <= 17 ? count : seat === dealer ? 17 : 16;
    });
    const style = ['jade', 'ink', 'neon', 'off'].includes(options.style) ? options.style : 'jade';
    return new Promise(resolve => {
      const run = {
        options, container, dice, dealer, counts, style, resolve,
        timers: new Set(), animations: new Set(), settled: false, phase: 'shuffle'
      };
      active = run;
      try {
        build(run);
        run.keyHandler = event => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          event.preventDefault();
          finish();
        };
        run.visibilityHandler = () => {
          if (document.hidden) finish('background');
        };
        run.resizeHandler = () => finish('resize');
        document.addEventListener('keydown', run.keyHandler);
        document.addEventListener('visibilitychange', run.visibilityHandler);
        window.addEventListener('resize', run.resizeHandler);
        if (document.hidden) {
          settle(run, 'skipped', 'background');
          return;
        }
        if (options.reduced || (motionQuery && motionQuery.matches) || style === 'off') {
          run.node.classList.add('opening-reduced');
          phase(run, 3);
          run.title.textContent = '開局準備';
          run.caption.textContent = `骰子 ${dice[0]}、${dice[1]} 點 · 牌已入席`;
          later(run, 220, () => {
            animate(run, run.node, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
            later(run, 180, () => settle(run, 'completed'));
          });
          return;
        }
        shuffle(run);
        later(run, 950, () => rollDice(run));
        later(run, 1800, () => buildWall(run));
        later(run, 2500, () => deal(run));
      } catch (error) {
        if (run.node) settle(run, 'skipped', 'presentation-error');
        else {
          active = null;
          resolve({ status: 'skipped', phase: 'idle', reason: 'presentation-error' });
        }
      }
    });
  }

  function getState() {
    if (!active) return { ...lastState, dice: lastState.dice?.slice(), handCounts: lastState.handCounts?.slice() };
    return {
      active: true, phase: active.phase, status: 'playing', dice: active.dice.slice(),
      dealer: active.dealer, handCounts: active.counts.slice(),
      timers: active.timers.size, animations: active.animations.size
    };
  }

  window.MahjongOpening = Object.freeze({ play, cancel, finish, getState });
})();
