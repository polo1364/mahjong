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

  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .catch(error => console.warn('PWA 離線功能未啟用，仍可線上遊玩。', error));
    });
  }
})();
