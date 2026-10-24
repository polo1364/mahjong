/* Original Qinghe effect drawings. Presentation only: no game state or game RNG. */
(() => {
  'use strict';
  const styles = new Set(['jade', 'ink', 'neon', 'off']);
  const names = {
    chow: ['吃', '借勢化形'], pong: ['碰', '三元歸一'], kong: ['槓', '四象鎮天'],
    concealedKong: ['暗槓', '藏鋒入鞘'], win: ['胡', '破境飛昇'],
    selfDraw: ['自摸', '天命自得'], flower: ['補花', '靈花綻放'],
    ready: ['聽牌', '凝神待機'], drawGame: ['流局', '靈氣耗盡，來局再戰']
  };
  const motionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let style = 'jade';
  let reduced = false;
  let active = null;
  let timer = null;
  let tableCue = null;
  const shownResults = new WeakSet();
  const seats = new Set(['bottom', 'top', 'left', 'right']);
  // Names come from settled calcFanDetails.categories, never from hand inspection.
  // This order selects a headline when a legal result has several special awards.
  const specialKinds = new Map([
    ['八仙過海', 'flowers'], ['七搶一', 'flowers'],
    ['天胡', 'celestial'], ['地胡', 'celestial'], ['人胡', 'celestial'],
    ['字一色', 'honors'], ['大四喜', 'winds'], ['小四喜', 'winds'],
    ['大三元', 'dragons'], ['小三元', 'dragons'], ['五暗刻', 'pungs'],
    ['清一色', 'suit'], ['四暗刻', 'pungs'], ['三暗刻', 'pungs'],
    ['混一色', 'suit'], ['對對胡', 'pungs'], ['全求人', 'open'], ['半求人', 'open'],
    ['槓上開花', 'flowers'], ['海底撈月', 'moon'], ['河底撈魚', 'moon'],
    ['搶槓', 'open'], ['四季花槓', 'flowers'], ['四君子花槓', 'flowers'],
    ['天聽', 'celestial'], ['地聽', 'celestial']
  ]);

  function clear() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    if (active) active.remove();
    active = null;
    document.body?.classList?.remove('fx-active');
    if (tableCue) tableCue.element.classList?.remove(tableCue.name);
    tableCue = null;
  }

  // Tile faces arrive pre-rendered by the game's own tileFace(); anything else shows a back.
  function tileRow(tiles) {
    const row = document.createElement('div');
    row.className = 'fx-tiles';
    tiles.slice(0, 5).forEach((face, i) => {
      const tile = document.createElement('span');
      const known = typeof face === 'string' && face.startsWith('<svg class="tile-art"');
      tile.className = known ? 'fx-tile' : 'fx-tile is-back';
      tile.style.setProperty('--i', String(i));
      if (known) tile.innerHTML = face;
      row.append(tile);
    });
    return row;
  }

  // A short physical cue on the table itself: a thud for kongs, a glow for wins.
  function cueTable(kind) {
    const name = kind === 'win' || kind === 'selfDraw' ? 'fx-table-win' : kind === 'kong' || kind === 'concealedKong' ? 'fx-table-thud' : null;
    const element = name && document.querySelector('.table-frame');
    if (!element || !element.classList) return;
    element.classList.remove(name);
    void element.offsetWidth; // restart the animation for back-to-back kongs
    element.classList.add(name);
    tableCue = { element, name };
  }

  // Each set is drawn in the same bounded viewBox; no particles escape the card.
  function jadeArt(celebration, flower) {
    const flecks = [[79,82,8],[111,47,-22],[155,33,18],[290,36,-12],[339,67,36],
      [366,117,-16],[322,181,28],[282,206,-6],[142,199,42],[86,160,-28]];
    const petals = flower ? Array.from({length: 6}, (_, i) =>
      `<ellipse class="fx-jade-petal" cx="220" cy="91" rx="7" ry="19" transform="rotate(${i * 60} 220 120)"/>`).join('') : '';
    return `<svg class="fx-art" viewBox="0 0 440 240" aria-hidden="true" focusable="false">
      <ellipse class="fx-jade-halo" cx="220" cy="120" rx="140" ry="78"/>
      <g class="fx-jade-orbit"><path class="fx-jade-arc" d="M80 137C66 76 144 30 233 39C306 45 359 84 354 126"/>
        <path class="fx-jade-arc fx-jade-arc-gold" d="M356 110C376 164 298 210 205 202C134 196 86 169 80 137"/>
        <path class="fx-jade-fine" d="M104 71C145 37 220 28 285 52M334 172C291 205 217 216 158 191"/>
      </g>
      <g class="fx-jade-seal"><path d="M220 54L229 63L220 72L211 63Z"/><path d="M220 168L228 176L220 184L212 176Z"/></g>
      ${petals}
      <g class="fx-jade-flecks">${flecks.slice(0, celebration ? 10 : 6).map(([x,y,r],i) =>
        `<path style="--i:${i}" d="M${x} ${y}l4 -6l3 8l-5 3Z" transform="rotate(${r} ${x} ${y})"/>`).join('')}</g>
      <path class="fx-jade-thread" d="M68 120H112M328 120H372"/>
    </svg>`;
  }

  function inkArt(celebration, flower) {
    const dots = [[69,72,4],[95,49,2],[352,74,3],[372,142,5],[341,183,2],
      [100,189,3],[58,150,2],[310,49,2],[136,37,2],[287,203,3]];
    const botanical = flower
      ? '<path class="fx-ink-sprig" d="M92 170Q110 151 120 126M105 151Q82 139 85 128Q104 134 105 151M112 140Q136 128 139 115Q120 119 112 140"/>'
      : '<path class="fx-ink-sprig" d="M83 164Q106 158 120 151M321 76Q344 70 358 64"/>';
    return `<svg class="fx-art" viewBox="0 0 440 240" aria-hidden="true" focusable="false">
      <path class="fx-ink-paper" d="M99 74L340 64L355 167L108 181L88 101Z"/>
      <g class="fx-ink-strokes">
        <path class="fx-ink-wash" d="M69 112Q163 61 355 83L371 113Q253 100 79 146Z"/>
        <path class="fx-ink-brush" d="M68 114Q133 64 357 78L348 88Q175 78 82 128Z"/>
        <path class="fx-ink-brush fx-ink-brush-low" d="M80 174Q202 191 366 157L357 173Q209 207 93 190Z"/>
        <path class="fx-ink-dry" d="M82 105Q176 70 337 78M102 188Q208 198 337 174"/>
      </g>
      ${botanical}
      <g class="fx-ink-dots">${dots.slice(0, celebration ? 10 : 6).map(([x,y,r],i) =>
        `<circle cx="${x}" cy="${y}" r="${r}" style="--i:${i}"/>`).join('')}</g>
      <g class="fx-ink-stamp"><path d="M322 145L354 143L357 175L324 178Z"/><path d="M329 152L348 151M338 151L339 170M329 160L348 159M330 169L348 168"/></g>
    </svg>`;
  }

  function neonArt(celebration, flower) {
    const sparks = [[74,81],[103,174],[338,62],[367,158],[149,43],[290,197]];
    const motif = flower
      ? '<path class="fx-neon-flower" d="M220 53L226 63L237 65L230 74L231 85L220 81L210 85L211 74L204 65L215 63Z"/>'
      : '<path class="fx-neon-flower" d="M208 64L220 57L232 64L220 71Z"/>';
    return `<svg class="fx-art" viewBox="0 0 440 240" aria-hidden="true" focusable="false">
      <path class="fx-neon-panel" d="M113 64H327L354 91V153L327 180H113L86 153V91Z"/>
      <g class="fx-neon-frame"><path d="M155 54H112L75 91V115M285 54H328L365 91V115"/>
        <path d="M155 190H112L75 153V129M285 190H328L365 153V129"/></g>
      <g class="fx-neon-traces"><path d="M39 97H57L74 80H95M401 145H381L364 162H345"/>
        <path d="M50 154H66L82 170H111M390 85H373L357 69H330"/>
        <path d="M143 204H177L190 191M297 38H263L250 51"/></g>
      <g class="fx-neon-nodes">${sparks.map(([x,y],i) =>
        `<rect x="${x-3}" y="${y-3}" width="${celebration ? 6 : 4}" height="${celebration ? 6 : 4}" style="--i:${i}"/>`).join('')}</g>
      ${motif}
      <path class="fx-neon-scan" d="M115 105H325"/>
      <path class="fx-neon-slits" d="M187 176H198M204 176H215M221 176H232M238 176H249"/>
    </svg>`;
  }

  // Deterministic celebration trajectories stay inside the 440 x 240 drawing.
  function celebrationArt(theme, special) {
    const count = special ? 14 : 8;
    let drawing;
    if (theme === 'jade') {
      drawing = '<g class="fx-jade-ripples"><ellipse cx="220" cy="120" rx="153" ry="86"/><ellipse cx="220" cy="120" rx="153" ry="86"/></g>' +
        Array.from({length: count}, (_, i) => {
          const angle = i * Math.PI * 2 / count;
          const x = 220 + Math.cos(angle) * 177, y = 120 + Math.sin(angle) * 93;
          return `<path class="fx-burst-leaf" style="--i:${i};--pull-x:${(220-x)*.7}px;--pull-y:${(120-y)*.7}px;--drift-x:${(x-220)*.12}px;--drift-y:${(y-120)*.12}px" d="M${x} ${y}l5 -8l4 9l-6 4Z"/>`;
        }).join('');
    } else if (theme === 'ink') {
      drawing = '<g class="fx-ink-flourish"><path pathLength="1" d="M47 130Q63 20 205 27Q324 20 392 90"/><path pathLength="1" d="M392 124Q357 222 222 218Q98 224 49 172"/></g>' +
        '<g class="fx-ink-impact"><path d="M316 139L360 137L364 181L320 184Z"/><path d="M311 134L365 132L369 186L315 189Z"/></g>' +
        Array.from({length: count}, (_, i) => {
          const angle = (i * 2 / count + .12) * Math.PI;
          const x = 220 + Math.cos(angle) * (167 + i % 3 * 8);
          const y = 120 + Math.sin(angle) * (84 + i % 2 * 10);
          return `<ellipse class="fx-ink-droplet" cx="${x}" cy="${y}" rx="${2+i%3}" ry="${3+i%4}" style="--i:${i};--pull-x:${(220-x)*.24}px;--pull-y:${(120-y)*.24}px;--drift-x:${(x-220)*.08}px;--drift-y:9px"/>`;
        }).join('');
    } else {
      const route = 'M106 30H334L402 98V142L334 210H106L38 142V98Z';
      drawing = `<g class="fx-neon-wave"><path d="${route}"/><path d="${route}"/></g>` +
        `<g class="fx-neon-comets"><path pathLength="1" d="${route}"/><path pathLength="1" d="${route}"/></g>` +
        Array.from({length: special ? 10 : 6}, (_, i) => {
          const angle = (i * 2 / (special ? 10 : 6) + .1) * Math.PI;
          const x = 220 + Math.cos(angle) * 183, y = 120 + Math.sin(angle) * 99;
          return `<path class="fx-neon-shard" style="--i:${i};--pull-x:${(220-x)*.5}px;--pull-y:${(120-y)*.5}px" d="M${x-5} ${y}h10M${x} ${y-5}v10"/>`;
        }).join('');
    }
    return `<svg class="fx-burst-art" viewBox="0 0 440 240" aria-hidden="true" focusable="false">${drawing}</svg>`;
  }

  function specialArt(motif, headline) {
    let drawing;
    if (motif === 'dragons') {
      drawing = [-42, 0, 42].map((x, i) => `<g transform="translate(${x} 0)">
        <circle r="14"/><path d="M-17 4Q-27 -8 -15 -18M16 -6Q27 7 14 20"/>
        <text y="5">${['中','發','白'][i]}</text></g>`).join('');
    } else if (motif === 'winds') {
      drawing = [0,90,180,270].map(angle => `<path transform="rotate(${angle})" d="M0 -5Q-27 -9 -15 -28Q-4 -24 0 -5Z"/>`).join('') +
        '<circle r="5"/><path d="M-47 0H-36M36 0H47"/><text x="-59" y="5">東</text><text x="59" y="5">西</text>';
    } else if (motif === 'honors') {
      drawing = ['東','南','西','北','中','發','白'].map((name,i) => `<g transform="translate(${(i-3)*23} ${Math.abs(i-3)*2}) rotate(${(i-3)*-4})">
        <rect x="-9" y="-15" width="18" height="27" rx="2"/><text y="4">${name}</text></g>`).join('');
    } else if (motif === 'pungs') {
      const count = headline === '三暗刻' ? 3 : headline === '四暗刻' ? 4 : 5;
      drawing = Array.from({length: count}, (_, i) => `<g transform="translate(${(i-(count-1)/2)*26} 0)">
        <path d="M-10 -13H10V-7H-10ZM-10 -3H10V3H-10ZM-10 7H10V13H-10Z"/>
        <path d="M-7 17H7"/></g>`).join('');
    } else if (motif === 'flowers') {
      const count = headline === '七搶一' ? 7 : headline.includes('花槓') ? 4 : 8;
      drawing = Array.from({length: count}, (_, i) => `<path transform="rotate(${i*360/count})" d="M0 -5Q-14 -18 0 -31Q14 -18 0 -5Z"/>`).join('') +
        '<circle r="5"/><path d="M-58 4Q-48 -8 -36 -1M36 -1Q48 -8 58 4"/>';
    } else if (motif === 'celestial') {
      drawing = '<path d="M-63 17Q0 -20 63 17M-46 20H46M-20 -11L-3 -25L20 -15L44 -22"/>' +
        '<path d="M-3 -33L0 -25L-3 -17L-6 -25ZM44 -29L47 -22L44 -15L41 -22Z"/><circle cx="-20" cy="-11" r="3"/><circle cx="20" cy="-15" r="3"/>';
    } else if (motif === 'moon') {
      drawing = '<path d="M7 -27A25 25 0 1 0 27 12A22 22 0 0 1 7 -27Z"/>' +
        '<path d="M-65 23Q-47 11 -29 23Q-11 35 7 23Q25 11 43 23Q53 30 65 23"/>';
    } else if (motif === 'open') {
      drawing = Array.from({length: 5}, (_, i) => `<g transform="translate(${(i-2)*25} ${Math.abs(i-2)*3}) rotate(${(i-2)*8})">
        <rect x="-9" y="-16" width="18" height="28" rx="2"/><path d="M-5 -9H5M-5 5H5"/></g>`).join('');
    } else {
      drawing = '<path d="M-74 -11Q-37 -32 0 -11T74 -11M-74 0Q-37 -21 0 0T74 0M-74 11Q-37 -10 0 11T74 11"/>' +
        '<path d="M-17 24H17"/>';
    }
    return `<svg class="fx-special-art" viewBox="0 0 440 240" aria-hidden="true" focusable="false">
      <g class="fx-special-mark" data-motif="${motif}" transform="translate(220 39)"><g class="fx-special-motion">${drawing}</g></g></svg>`;
  }

  function place(element) {
    const anchor = document.querySelector('.center-area');
    const rect = anchor && anchor.getBoundingClientRect();
    const width = Math.min(440, window.innerWidth - 24);
    const height = width * 240 / 440;
    const x = rect && rect.width ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect && rect.height ? rect.top + rect.height / 2 : window.innerHeight * .38;
    element.style.left = `${Math.max(width / 2 + 12, Math.min(window.innerWidth - width / 2 - 12, x))}px`;
    element.style.top = `${Math.max(height / 2 + 12, Math.min(window.innerHeight - height / 2 - 12, y))}px`;
  }

  function show(kind, label, special = null, context = null) {
    clear();
    if (document.hidden || style === 'off' || !Object.hasOwn(names, kind) || !document.body) return;
    const [title, subtitle] = names[kind];
    const isReduced = reduced || Boolean(motionQuery && motionQuery.matches);
    const celebration = kind === 'win' || kind === 'selfDraw';
    // A flower call can follow a complete kong announcement in the voice queue.
    const duration = kind === 'flower' ? 2700 : isReduced ? (special ? 1200 : 900) : special ? 2700 : celebration ? 1900 : 1150;
    const element = document.createElement('div');
    element.className = `action-announcement mahjong-fx fx-${style}${isReduced ? ' fx-reduced' : ''}${celebration ? ' fx-celebration' : ''}${special ? ' fx-special' : ''}`;
    element.dataset.kind = kind;
    if (special) {
      element.dataset.special = special.headline;
      element.dataset.motif = special.motif;
      element.dataset.awards = special.awards.join('、');
    }
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    element.setAttribute('aria-atomic', 'true');
    element.style.setProperty('--fx-duration', `${duration}ms`);
    const seat = context && seats.has(context.seat) ? context.seat : null;
    if (seat) element.dataset.seat = seat;
    if (!isReduced) {
      const drawing = style === 'ink' ? inkArt : style === 'neon' ? neonArt : jadeArt;
      element.innerHTML = drawing(celebration, kind === 'flower');
      if (celebration) element.insertAdjacentHTML('beforeend', celebrationArt(style, Boolean(special)));
      if (special) element.insertAdjacentHTML('beforeend', specialArt(special.motif, special.headline));
    }
    const copy = document.createElement('div');
    copy.className = 'fx-copy';
    const word = document.createElement('strong');
    word.className = 'fx-word';
    word.textContent = special ? special.headline : title;
    const caption = document.createElement('span');
    caption.className = 'fx-caption';
    caption.textContent = special ? special.awards.filter(name => name !== special.headline).join(' · ') :
      label && String(label).trim() !== title ? String(label).slice(0, 40) : subtitle;
    if (special) {
      const outcome = document.createElement('span');
      outcome.className = 'fx-outcome';
      outcome.textContent = `${title}${Number.isFinite(special.fan) ? ` · 合計 ${special.fan} 台` : ''}`;
      copy.append(outcome);
    }
    // The actor's name joins the caption so it never sits over the table's own centre text.
    if (seat && context.name && !special) caption.textContent = `${String(context.name).slice(0, 12)} · ${caption.textContent}`;
    copy.append(word, caption);
    if (!special && Array.isArray(context?.tiles) && context.tiles.length) {
      copy.classList?.add('has-tiles');
      copy.append(tileRow(context.tiles));
    }
    element.append(copy);
    document.body.append(element);
    active = element;
    place(element);
    document.body.classList?.add('fx-active');
    if (!isReduced) cueTable(kind);
    timer = window.setTimeout(clear, duration);
  }

  function showWin(kind, detail, context = null) {
    if (kind !== 'win' && kind !== 'selfDraw') return;
    if (!detail || typeof detail !== 'object' || !Array.isArray(detail.categories)) { show(kind, undefined, null, context); return; }
    if (shownResults.has(detail)) return;
    shownResults.add(detail);
    const awards = [...specialKinds.keys()].filter(name => detail.categories.includes(name));
    show(kind, undefined, awards.length ? {
      headline: awards[0], motif: specialKinds.get(awards[0]), awards, fan: detail.fan
    } : null, context);
  }

  function setStyle(value) {
    const aliases = { '玉光': 'jade', '墨韻': 'ink', '霓虹': 'neon', '關閉': 'off' };
    const next = aliases[value] || value;
    style = styles.has(next) ? next : 'jade';
    clear();
    return style;
  }

  function setReduced(value) {
    reduced = Boolean(value);
    clear();
  }

  // A resize or changed OS preference must never leave a stale large animation.
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  window.addEventListener('pagehide', clear);
  window.addEventListener('resize', clear, { passive: true });
  if (motionQuery) {
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', clear);
    else if (motionQuery.addListener) motionQuery.addListener(clear);
  }
  window.MahjongEffects = Object.freeze({
    show, showWin, setStyle, setReduced, clear,
    getState: () => ({
      style, reduced, systemReduced: Boolean(motionQuery && motionQuery.matches),
      active: active ? active.dataset.kind : null,
      special: active ? active.dataset.special || null : null
    })
  });
})();
