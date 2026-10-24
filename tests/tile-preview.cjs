const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const out = path.join(root, 'artifacts');

async function decodeArtwork(page) {
  return page.evaluate(async () => {
    const urls = [...new Set([...document.querySelectorAll('image')].map(image => image.getAttribute('href')))];
    await Promise.all(urls.map(async url => {
      const image = new Image(); image.src = new URL(url, document.baseURI).href; await image.decode();
    }));
    return urls.length;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });
    await page.goto(process.env.MAHJONG_URL || 'http://127.0.0.1:8765');
    await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play');
    const faces = await page.evaluate(() => {
      cancelGameTimers();
      return Object.keys(countByKey(generateTiles())).map(key => ({ key, name: keyToText(key), svg: tileFace(keyToTile(key)) }))
        .concat({ key: 'BACK', name: '五行牌背', svg: window.MahjongCrystalTiles.render('BACK') });
    });
    const groups = [['W', '赤晶符印 · 萬'], ['T', '水靈珠 · 筒'], ['B', '碧晶飛劍 · 條'], ['F', '四風與三元'], ['H', '四季與四君子'], ['BACK', '共用牌背']];
    const base = '../';
    const css = `*{box-sizing:border-box}body{margin:0;padding:32px;background:#101b2d;color:#e3edf6;font:14px 'Microsoft JhengHei',sans-serif}h1{margin:0;font-size:26px;font-weight:500}p{color:#b3c9da;line-height:1.8}section{border-top:1px solid #b7cad344;padding:16px 0}h2{font-size:15px;font-weight:500;color:#d2bc88}.tiles{display:flex;gap:20px;flex-wrap:wrap}figure{margin:0;text-align:center}.tile{width:72px;aspect-ratio:5/7;border:1px solid #b1c9df;border-radius:3px;background:#dbe6ef;box-shadow:0 3px #365878}.tile-art{width:100%;height:100%;display:block;pointer-events:none}figcaption{margin-top:9px;font-size:12px;color:#c2d4e2}@media(max-width:540px){body{padding:20px 14px}h1{font-size:22px}.tiles{gap:16px 12px}.tile{width:56px}figcaption{font-size:11px}}`;
    const figure = face => `<figure><div class="tile">${face.svg}</div><figcaption>${face.name}</figcaption></figure>`;
    const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="${base}"><title>雀仙門 · 五行晶石牌面圖鑑</title><style>${css}</style></head><body><h1>五行晶石 · 牌面圖鑑</h1><p>42 種牌面與共用牌背 · 萬為赤晶符印、筒為水靈珠、條為碧晶飛劍</p>${groups.map(([s, label]) => `<section><h2>${label}</h2><div class="tiles">${faces.filter(face => s === 'BACK' ? face.key === 'BACK' : face.key !== 'BACK' && (s === 'F' ? ['F','D'].includes(face.key[0]) : face.key[0] === s)).map(figure).join('')}</div></section>`).join('')}</body></html>`;
    fs.mkdirSync(out, { recursive: true });
    const dest = path.join(out, 'crystal-tile-catalog.html');
    fs.writeFileSync(dest, html);
    await page.goto(pathToFileURL(dest).href);
    assert.equal(await decodeArtwork(page), 5);
    assert.equal(await page.locator('[data-crystal-key]').count(), 43);
    await page.screenshot({ path: path.join(out, 'crystal-tile-catalog.png'), fullPage: true });
    await page.locator('section').nth(4).screenshot({ path: path.join(out, 'crystal-flower-tiles.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'crystal-tile-catalog-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 440, height: 350 });
    await page.setContent(`<html lang="zh-Hant"><head><base href="${base}"><style>${css}</style></head><body><p>碧晶飛劍 · 七、八、九條</p><div class="tiles">${['B7','B8','B9'].map(key => figure(faces.find(face => face.key === key))).join('')}</div></body></html>`);
    await decodeArtwork(page);
    await page.screenshot({ path: path.join(out, 'crystal-sword-readability.png') });
    console.log('Crystal catalog PASS: 43 faces/back, 5 decoded atlases, desktop + 390px mobile, file:// loading.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
