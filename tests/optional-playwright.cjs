// Browser-backed unit tests need Playwright; without it they are reported as skipped, not failed.
let playwright = null;
try { playwright = require('playwright'); } catch (_) { /* Not installed in this environment. */ }
const skipReason = playwright ? false : '未安裝 playwright，略過瀏覽器 IndexedDB 測試（安裝後即會執行）';
module.exports = { playwright, skipReason };
