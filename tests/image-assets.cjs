// Verify every derivative, including the dimensions used by SVG/Canvas atlas crops.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
require('../image-assets.js');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
(async () => {
  const sources = walk('assets').filter(file => /\.(png|jpe?g)$/i.test(file) && !file.startsWith('assets/pwa/') && !file.startsWith('assets/cultivation-preview/'));
  const results = [];
  for (const source of sources) {
    const target = MahjongImageURL(source);
    const before = await sharp(path.join(root, source)).metadata();
    const after = await sharp(path.join(root, target)).metadata();
    assert.equal(after.format, 'webp', source);
    assert.equal(after.width, before.width, source);
    assert.equal(after.height, before.height, source);
    // An opaque alpha channel may be removed without changing pixels.
    if (before.hasAlpha) {
      const originalAlpha = await sharp(path.join(root, source)).ensureAlpha().extractChannel(3).raw().toBuffer();
      const derivedAlpha = await sharp(path.join(root, target)).ensureAlpha().extractChannel(3).raw().toBuffer();
      assert.ok(originalAlpha.equals(derivedAlpha), `${source}: exact alpha preserved`);
    }
    results.push({ source, target, width: after.width, height: after.height,
      before: fs.statSync(path.join(root, source)).size, after: fs.statSync(path.join(root, target)).size });
  }
  assert.equal(MahjongImageURL('assets/cultivation-preview/bronze-atlas.png'), 'assets/cultivation-preview/bronze-atlas.png');
  assert.equal(MahjongImageURL('assets/pwa/icon-192.png'), 'assets/pwa/icon-192.png');
  assert.equal(MahjongImageURL('https://example.test/mahjong/assets/cultivation-vfx/bronze.png?v=1'),
    'https://example.test/mahjong/assets/cultivation-vfx/bronze.webp?v=1');
  assert.equal(MahjongImageURL('assets/sound.mp3'), 'assets/sound.mp3');
  const gameplay = results.filter(row => !row.source.includes('/cultivation-preview/'));
  const summary = rows => ({ count: rows.length, before: rows.reduce((n, r) => n + r.before, 0), after: rows.reduce((n, r) => n + r.after, 0) });
  const report = { all: summary(results), gameplay: summary(gameplay), tiles: summary(results.filter(row => row.source.includes('/tiles-crystal/'))), results };
  fs.writeFileSync(path.join(root, 'artifacts/all-images-validation.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
