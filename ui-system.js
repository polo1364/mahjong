/* Interface feel: focus rings only for keyboard use, a small gold ring where a button is pressed, and a soft fade when switching tabs. */
(function (root) {
  'use strict';
  const doc = root.document, html = doc.documentElement;
  const set = on => html.classList.toggle('ui-keyboard', on);
  let tabTimer = 0;
  root.addEventListener('keydown', event => { if (event.key === 'Tab' || event.key.startsWith('Arrow')) set(true); }, true);
  root.addEventListener('pointerdown', event => {
    set(false);
    const button = event.target.closest?.('button:not(:disabled), [role="tab"]');
    if (!button || button.closest('.tile, .hand, #hand')) return;
    const spark = doc.createElement('span');
    spark.className = 'ui-spark';
    spark.setAttribute('aria-hidden', 'true');
    spark.style.left = event.clientX + 'px';
    spark.style.top = event.clientY + 'px';
    spark.addEventListener('animationend', () => spark.remove());
    // A modal dialog sits in the top layer, so the ring must live inside it to be seen.
    ([...doc.querySelectorAll('dialog[open]')].pop() || doc.body).append(spark);
    root.setTimeout(() => spark.remove(), 600);
    if (button.matches('[role="tab"]')) {
      html.classList.remove('ui-tab-fx');
      void html.offsetWidth;
      html.classList.add('ui-tab-fx');
      root.clearTimeout(tabTimer);
      tabTimer = root.setTimeout(() => html.classList.remove('ui-tab-fx'), 260);
    }
  }, true);
})(window);
