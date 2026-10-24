const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { game } = require('./game-harness.cjs');
const root = path.join(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'crystal-tiles.js'), 'utf8'), context);
const art = context.window.MahjongCrystalTiles;

test('every actual game face and the common back resolve to a distinct crystal crop', () => {
  const { run } = game();
  const expected = JSON.parse(run('JSON.stringify(Object.keys(countByKey(generateTiles())))'));
  assert.deepEqual([...art.keys].sort(), [...expected, 'BACK'].sort());
  assert.equal(run(`Object.keys(countByKey(generateTiles())).every(k => tileFace(keyToTile(k)).includes('data-crystal-key="' + k + '"'))`), true);
  const crops = art.keys.map(key => {
    const tile = art.tiles[key];
    const face = art.render(key);
    assert.ok(face.startsWith('<svg class="tile-art" viewBox="0 0 40 56"'));
    assert.ok(face.includes(`data-crystal-key="${key}"`));
    assert.ok(face.includes(`href="assets/tiles-crystal/${art.sheets[tile.sheet].file}"`));
    assert.equal(face.includes('data-flower='), key.startsWith('H'));
    if (key.startsWith('H')) assert.ok(face.includes(`data-flower="${key.slice(1)}"`));
    return `${tile.sheet}:${tile.rect.join(',')}`;
  });
  assert.equal(new Set(crops).size, 43);
});

test('all source rectangles are inside the selected PNG and never overlap another tile', () => {
  for (const [name, sheet] of Object.entries(art.sheets)) {
    const bytes = fs.readFileSync(path.join(root, 'assets/tiles-crystal', sheet.file));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    // Runtime sheets may be downscaled; crops use the source coordinate system, so only the aspect ratio must hold.
    const ratio = bytes.readUInt32BE(16) / bytes.readUInt32BE(20);
    assert.ok(Math.abs(ratio - sheet.width / sheet.height) < 0.005, `${sheet.file} aspect ratio`);
    assert.ok(bytes.readUInt32BE(16) >= sheet.width / 2 - 1, `${sheet.file} keeps at least half resolution`);
    const rectangles = Object.entries(art.tiles).filter(([, tile]) => tile.sheet === name);
    for (let i = 0; i < rectangles.length; i++) {
      const [key, { rect: [x, y, w, h] }] = rectangles[i];
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= sheet.width && y + h <= sheet.height, key);
      for (const [otherKey, { rect: [ox, oy, ow, oh] }] of rectangles.slice(i + 1)) {
        assert.ok(x + w <= ox || ox + ow <= x || y + h <= oy || oy + oh <= y, `${key} overlaps ${otherKey}`);
      }
    }
  }
});

test('runtime PNGs and their art sources match their recorded hashes', () => {
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const assets = path.join(root, 'assets/tiles-crystal');
  const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.deepEqual(manifest.sheets.map(sheet => sheet.file).sort(), Object.values(art.sheets).map(sheet => sheet.file).sort());
  for (const sheet of Object.values(art.sheets)) {
    const selected = manifest.sheets.find(entry => entry.file === sheet.file);
    assert.equal(typeof selected.source, 'string', sheet.file);
    const runtimeHash = digest(path.join(assets, sheet.file));
    // The art source is unchanged; the runtime copy is the recorded optimized build of it.
    assert.equal(digest(path.resolve(assets, selected.source)), selected.sourceSha256.toLowerCase(), `${sheet.file} source differs from its recorded hash`);
    assert.equal(runtimeHash, selected.sha256.toLowerCase(), `${sheet.file} differs from its recorded hash`);
  }
});

test('corner labels have suit colors or one character, with no background or duplicate painted honors', () => {
  const paintedHonors = new Set(['FE', 'FS', 'FW', 'FN', 'DC', 'DF']);
  for (const key of art.keys) {
    const face = art.render(key);
    const addedLabel = key !== 'BACK' && !paintedHonors.has(key);
    assert.equal(/<text\b/.test(face), addedLabel, `${key} SVG text`);
    assert.equal(/data-crystal-label=/.test(face), addedLabel, `${key} corner label`);
    assert.equal(/<rect\b/.test(face), false, `${key} no background box`);
    if (!addedLabel) continue;
    const label = face.match(/<text\b[^>]*>([^<]+)<\/text>/)[1];
    const color = { W: '#b5222b', T: '#165ca8', B: '#187344' }[key[0]];
    assert.equal(label, color ? key.slice(1) : key === 'DB' ? '白' : '春夏秋冬梅蘭竹菊'[Number(key.slice(1)) - 1]);
    if (color) assert.ok(face.includes(`fill="${color}"`), `${key} suit color`);
  }
});

test('unknown or untrusted keys cannot inject markup or select arbitrary images', () => {
  for (const key of [null, undefined, {}, [], 1, '', 'W0', 'W10', 'H9', '__proto__', 'constructor', '<image onload=alert(1)>']) {
    assert.equal(art.render(key), '');
  }
  assert.ok(Object.isFrozen(art) && Object.isFrozen(art.keys) && Object.isFrozen(art.tiles));
});
