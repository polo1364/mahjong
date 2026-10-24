(() => {
  'use strict';
  const portrait = window.matchMedia('(orientation: portrait)');
  const notice = document.getElementById('landscapeNotice');
  let previousFocus = null;

  function syncOrientation() {
    if (portrait.matches) {
      if (!notice.open) {
        previousFocus = document.activeElement;
        notice.showModal();
      }
      window.MahjongVoice?.stopAll();
    } else if (notice.open) {
      notice.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      window.MahjongTableLayout?.fitNow();
    }
  }

  // A modal dialog makes the rest of the page inert without changing the
  // start screen's own inert flags or losing an open game/settings dialog.
  notice.addEventListener('cancel', event => event.preventDefault());
  // Existing document shortcuts must not dismiss a game dialog behind this one.
  notice.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      notice.focus({ preventScroll: true });
    }
  });
  window.MahjongPWA = Object.freeze({ isPortrait: () => portrait.matches });
  portrait.addEventListener('change', syncOrientation);
  syncOrientation();

  // ---- Version label and safe updates ----
  const versionText = info => info?.label || (info?.version ? info.version.slice(0, 8) : '');
  function showVersion(info, pending) {
    const text = versionText(info); if (!text) return;
    for (const host of [document.querySelector('#tableMenu .table-menu-heading'), document.getElementById('startScreen')]) {
      if (!host) continue;
      let tag = host.querySelector(':scope > .app-version');
      if (!tag) { tag = document.createElement('span'); tag.className = 'app-version'; host.append(tag); }
      tag.textContent = `版本 ${text}${pending ? '（有新版）' : ''}`;
    }
  }
  // Safe moment: no hand in progress (home screen, between hands, or before the first deal).
  const idle = () => document.documentElement.classList.contains('start-screen-active')
    || typeof S === 'undefined' || !S || S.phase === 'end';
  let reloading = false, banner = null;
  let hadController = !!navigator.serviceWorker?.controller;
  function applyUpdate(worker) {
    try { if (typeof autoSaveGame === 'function' && S && S.phase !== 'end') autoSaveGame(); } catch (_) { /* best effort */ }
    worker.postMessage({ type: 'MAHJONG_SKIP_WAITING' });
  }
  function offerUpdate(worker) {
    if (idle()) { applyUpdate(worker); return; }
    if (banner) return;
    banner = document.createElement('button');
    banner.type = 'button'; banner.className = 'app-update-banner';
    banner.innerHTML = '<b>有新版本</b><span>存檔後重新載入更新</span>';
    banner.onclick = () => { banner.disabled = true; banner.querySelector('span').textContent = '更新中…'; applyUpdate(worker); };
    document.body.append(banner);
  }
  function watch(registration) {
    const consider = worker => { if (worker && navigator.serviceWorker.controller) { worker.postMessage({ type: 'MAHJONG_VERSION' }); offerUpdate(worker); } };
    if (registration.waiting) consider(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') consider(worker); });
    });
    const check = () => registration.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 30 * 60 * 1000);
    // A pending update waiting for a quiet moment is applied once the hand ends.
    setInterval(() => { if (registration.waiting && idle() && !banner) applyUpdate(registration.waiting); }, 5000);
  }
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'MAHJONG_VERSION') showVersion(event.data, event.source !== navigator.serviceWorker.controller);
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) {
        hadController = true;
        navigator.serviceWorker.controller?.postMessage({ type: 'MAHJONG_VERSION' });
        return; // First installation must not reload a game started during download.
      }
      if (reloading) return; reloading = true; location.reload();
    });
    // Register now: waiting for window.load also waits for every stalled image.
    (() => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(registration => { watch(registration); navigator.serviceWorker.controller?.postMessage({ type: 'MAHJONG_VERSION' }); })
        .catch(error => console.warn('PWA 離線功能未啟用，仍可線上遊玩。', error));
    })();
  } else {
    // Not installed as an app (file:// or http preview): read the label directly.
    const script = document.createElement('script'); script.src = 'pwa-assets.js';
    script.onload = () => showVersion(self.MAHJONG_PRECACHE); script.onerror = () => {}; document.head.append(script);
  }
})();
