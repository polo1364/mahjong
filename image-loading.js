// Keep decoded gameplay images alive across frequent SVG/portrait redraws.
(() => {
  'use strict';
  const images = new Map();
  let current = [], dialog = null, generation = 0, loading = false;
  const urlsFor = state => {
    const urls = Object.values(MahjongCrystalTiles.sheets).map(sheet => MahjongImageURL(`assets/tiles-crystal/${sheet.file}`));
    if (state?.cultivation) {
      for (const player of state.cultivation.players) {
        const hero = window.MahjongCultivationHeroes.get(player.heroId);
        if (hero) urls.push(hero.thumbnail);
      }
      const monster = window.MahjongCultivationMonsters.get(state.cultivation.monster.speciesId);
      urls.push(MahjongImageURL(monster?.image || 'assets/cultivation-vfx/monster.png'));
    }
    return [...new Set(urls)];
  };
  function load(url) {
    if (images.has(url)) return images.get(url).promise;
    const image = new Image(), entry = { image, ready: false };
    images.set(url, entry);
    image.fetchPriority = 'high';
    entry.promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { image.src = ''; reject(new Error('圖片下載逾時')); }, 25000);
      const fail = () => { clearTimeout(timer); reject(new Error('圖片下載失敗')); };
      image.onerror = fail;
      image.onload = async () => {
        try {
          await image.decode();
          clearTimeout(timer); entry.ready = true; resolve();
        } catch (_) { fail(); }
      };
      image.src = url;
    }).catch(error => { images.delete(url); throw error; });
    return entry.promise;
  }
  function panel() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'imageLoading';
    dialog.setAttribute('aria-labelledby', 'imageLoadingTitle');
    dialog.innerHTML = '<h2 id="imageLoadingTitle">準備牌面與角色圖片</h2><p role="status" aria-live="polite"></p><progress></progress><p class="image-loading-hint">圖片就緒後才會繼續牌局，請稍候。</p><div><button type="button" data-retry hidden>重新載入圖片</button><button type="button" data-home>返回首頁</button></div>';
    dialog.addEventListener('cancel', event => event.preventDefault());
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.querySelector('[data-retry]').onclick = () => run();
    dialog.querySelector('[data-home]').onclick = async () => {
      const button = dialog.querySelector('[data-home]'); button.disabled = true;
      try { if (await document.getElementById('returnHomeBtn').onclick()) reset(); }
      finally { button.disabled = false; }
    };
    document.body.append(dialog);
    return dialog;
  }
  function reset() {
    generation++; loading = false; current = [];
    dialog?.close();
  }
  function run() {
    const token = ++generation, urls = current.slice(), view = panel();
    loading = true;
    view.querySelector('[data-retry]').hidden = true;
    if (!view.open) view.showModal();
    // The landscape notice must remain the topmost modal on a portrait phone.
    const orientation = document.getElementById('landscapeNotice');
    if (orientation?.open) { orientation.close(); orientation.showModal(); }
    const progress = () => {
      if (token !== generation) return;
      const done = urls.filter(url => images.get(url)?.ready).length;
      view.querySelector('[role=status]').textContent = `載入圖片 ${done} / ${urls.length}`;
      Object.assign(view.querySelector('progress'), { max: urls.length, value: done });
    };
    progress();
    Promise.allSettled(urls.map(url => load(url).finally(progress))).then(results => {
      if (token !== generation) return;
      if (results.some(result => result.status === 'rejected')) {
        view.querySelector('[role=status]').textContent = '部分圖片未載入，請確認連線後重試。牌局已暫停。';
        view.querySelector('[data-retry]').hidden = false;
        return;
      }
      loading = false; view.close();
      document.dispatchEvent(new Event('mahjong-images-ready'));
    });
  }
  function watch(state) {
    if (!state) { reset(); return; }
    const urls = urlsFor(state);
    if (urls.every(url => images.get(url)?.ready)) { if (loading) reset(); return; }
    if (loading && urls.join('|') === current.join('|')) return;
    current = urls; run();
  }
  window.MahjongImages = Object.freeze({ watch, reset, isLoading: () => loading });
})();
