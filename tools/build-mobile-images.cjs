// Derived web images only: retain all original images and their catalog paths.
// Requires sharp. Re-run after updating the source art, then tools/build-pwa.cjs.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const heroes = require('../cultivation-heroes.js').all;
const root = path.resolve(__dirname, '..');
(async () => {
  const results = [];
  const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const name = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(name) : [name];
  });
  const jobs = [
    ...walk('assets').filter(file => /\.(png|jpe?g)$/i.test(file) && !file.startsWith('assets/pwa/') && !file.startsWith('assets/cultivation-preview/'))
      .map(source => ({ source, target: source.replace(/\.(png|jpe?g)$/i, '.webp') })),
    ...heroes.map(hero => ({ source: hero.image, target: hero.thumbnail, width: 256 }))
  ];
  for (const job of jobs) {
    const source = path.join(root, job.source), target = path.join(root, job.target);
    let image = sharp(source);
    if (job.width) image = image.resize({ width: job.width, withoutEnlargement: true });
    await image.webp({ quality: 82, alphaQuality: 100, effort: 4 }).toFile(target);
    const metadata = await sharp(target).metadata();
    results.push({ ...job, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha,
      before: fs.statSync(source).size, after: fs.statSync(target).size });
  }
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
