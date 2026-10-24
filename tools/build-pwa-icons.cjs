const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const dir = path.join(__dirname, '../assets/pwa');
  const source = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [size, file] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>body{margin:0}svg{width:100vw;height:100vh;display:block}</style>${source}`);
      await page.locator('svg').screenshot({ path: path.join(dir, file) });
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
