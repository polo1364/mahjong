// Catalogs retain source artwork paths; browser renderers use generated WebP files.
(function (root) {
  'use strict';
  root.MahjongImageURL = value => String(value ?? '').replace(
    /(assets\/(?!pwa\/|cultivation-preview\/)[^?#]+)\.(png|jpe?g)(?=[?#]|$)/i, '$1.webp');
})(typeof window !== 'undefined' ? window : globalThis);
