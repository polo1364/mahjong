// Draws the interface art (frames, button plates, nav tiles, logo, icons) from SVG, so every piece can be
// re-made or re-coloured by editing this file. Needs Playwright (NODE_PATH) and Python with Pillow.
// usage: node tools/build-ui-art.cjs [only-name]
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'ui');
const iconDir = path.join(outDir, 'icons');
const tempDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ui-art-'));
fs.mkdirSync(iconDir, { recursive: true });

const metal = (id, scale = 3, blur = 1.2, shine = 1) => `
  <filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${blur}" result="h"/>
    <feSpecularLighting in="h" surfaceScale="${scale}" specularConstant="${shine}" specularExponent="18" lighting-color="#fff6d6" result="s"><feDistantLight azimuth="235" elevation="50"/></feSpecularLighting>
    <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
    <feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit"/>
    <feDropShadow in="lit" dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000" flood-opacity=".75"/>
  </filter>`;
const gold = `
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0bd"/><stop offset=".38" stop-color="#d9b163"/><stop offset=".68" stop-color="#94682c"/><stop offset="1" stop-color="#e2bd70"/></linearGradient>
  <linearGradient id="goldV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0bd"/><stop offset=".45" stop-color="#d9b163"/><stop offset="1" stop-color="#8d6228"/></linearGradient>
  <radialGradient id="gem" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#d8fff2"/><stop offset=".4" stop-color="#46c3a6"/><stop offset="1" stop-color="#0b4a41"/></radialGradient>
  <radialGradient id="ruby" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ffd7c4"/><stop offset=".4" stop-color="#d24a30"/><stop offset="1" stop-color="#5a1208"/></radialGradient>`;
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${gold}${defs}</defs>${body}</svg>`;

// One corner ornament in the top-left; the frame mirrors it to the other three.
const scrolls = `
  <path d="M15 15 C30 10 46 11 55 18 C63 25 58 36 49 34 C42 33 42 24 49 24" fill="none" stroke="url(#gold)" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M15 15 C10 30 11 46 18 55 C25 63 36 58 34 49 C33 42 24 42 24 49" fill="none" stroke="url(#gold)" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M24 24 C30 26 33 30 34 37" fill="none" stroke="url(#gold)" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M24 24 C26 30 30 33 37 34" fill="none" stroke="url(#gold)" stroke-width="2.2" stroke-linecap="round"/>`;
const panelCorner = `<g filter="url(#m)">${scrolls}<path d="M15 3 L27 15 L15 27 L3 15Z" fill="url(#gold)"/></g><path d="M15 8.5 L21.5 15 L15 21.5 L8.5 15Z" fill="url(#gem)" stroke="#2a1b07" stroke-width=".8"/>`;
const mirrored = (corner, s) => `<g>${corner}</g><g transform="translate(${s} 0) scale(-1 1)">${corner}</g><g transform="translate(0 ${s}) scale(1 -1)">${corner}</g><g transform="translate(${s} ${s}) scale(-1 -1)">${corner}</g>`;

const framePanel = () => svg(240, 240, `
  <rect x="9" y="9" width="222" height="222" fill="none" stroke="url(#gold)" stroke-width="2.6" filter="url(#m)"/>
  <rect x="16" y="16" width="208" height="208" fill="none" stroke="#c9a15a" stroke-opacity=".5" stroke-width="1"/>
  ${mirrored(panelCorner, 240)}`, metal('m', 3, 1));

const frameSmall = () => svg(96, 96, `
  <rect x="5" y="5" width="86" height="86" fill="none" stroke="#b78f4c" stroke-opacity=".62" stroke-width="1.6"/>
  ${mirrored('<path d="M3 15 V3 H15" fill="none" stroke="url(#gold)" stroke-width="3" filter="url(#m)"/><path d="M12 8 L16 12 L12 16 L8 12Z" fill="url(#gold)"/>', 96)}`, metal('m', 2, .7));

const cardCorner = `<g filter="url(#m)"><path d="M6 30 V6 H30" fill="none" stroke="url(#gold)" stroke-width="3.4"/><path d="M6 20 C14 18 18 14 20 6" fill="none" stroke="url(#gold)" stroke-width="2.2"/></g>`;
const frameCard = on => svg(120, 120, `
  ${on ? '<rect x="6" y="6" width="108" height="108" fill="none" stroke="#ffe7a8" stroke-width="7" filter="url(#g)"/>' : ''}
  <rect x="6" y="6" width="108" height="108" fill="none" stroke="${on ? 'url(#gold)' : '#b78f4c'}" stroke-opacity="${on ? 1 : .55}" stroke-width="${on ? 3 : 1.6}"/>
  ${on ? mirrored(cardCorner, 120) : ''}`, metal('m', 2.4, .8) + '<filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>');

// Button plate: pointed tablet ends; the middle stretches.
const platePath = 'M26 10 H334 Q341 10 345 16 L356 48 L345 80 Q341 86 334 86 H26 Q19 86 15 80 L4 48 L15 16 Q19 10 26 10Z';
const innerPath = 'M29 17 H331 Q336 17 339 21 L348 48 L339 75 Q336 79 331 79 H29 Q24 79 21 75 L12 48 L21 21 Q24 17 29 17Z';
const brushed = '<filter id="br" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .55" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .8  .9 0 0 0 -.32"/><feComposite in2="SourceAlpha" operator="in"/></filter>';
const endGems = fill => `<path d="M22 40 L30 48 L22 56 L14 48Z" fill="${fill}" stroke="#2a1b07" stroke-opacity=".7" stroke-width="1"/><path d="M338 40 L346 48 L338 56 L330 48Z" fill="${fill}" stroke="#2a1b07" stroke-opacity=".7" stroke-width="1"/>`;
const btnGold = () => svg(360, 96, `
  <path d="${platePath}" fill="url(#rim)" filter="url(#m)"/>
  <path d="${innerPath}" fill="url(#face)"/>
  <path d="${innerPath}" fill="#fff" filter="url(#br)"/>
  <path d="M29 18 H331" stroke="#fffbe6" stroke-width="2" stroke-opacity=".9"/>
  <path d="${innerPath}" fill="none" stroke="#6d4716" stroke-opacity=".75" stroke-width="1.4"/>
  ${endGems('url(#ruby)')}`, metal('m', 3, 1) + brushed + `
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff5cf"/><stop offset=".5" stop-color="#a97b36"/><stop offset="1" stop-color="#5d3c12"/></linearGradient>
  <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffefbb"/><stop offset=".42" stop-color="#ecca83"/><stop offset=".6" stop-color="#d2a658"/><stop offset="1" stop-color="#b98a41"/></linearGradient>`);
const btnJade = () => svg(360, 96, `
  <path d="${platePath}" fill="url(#rim)" filter="url(#m)"/>
  <path d="${innerPath}" fill="url(#face)"/>
  <path d="M29 18 H331" stroke="#9ce8d3" stroke-width="1.4" stroke-opacity=".5"/>
  <path d="${innerPath}" fill="none" stroke="#04181b" stroke-width="1.4"/>
  ${endGems('url(#gold)')}`, metal('m', 2.4, .9) + `
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d99a"/><stop offset=".5" stop-color="#8d6830"/><stop offset="1" stop-color="#4d3412"/></linearGradient>
  <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27696a"/><stop offset=".5" stop-color="#16464a"/><stop offset="1" stop-color="#0c2d31"/></linearGradient>`);

// Navigation tiles: dark jade at rest, lit gold when selected. The thick lower edge reads as a mahjong tile.
const navTile = on => svg(120, 150, `
  ${on ? '<rect x="9" y="9" width="102" height="130" rx="15" fill="#ffe39b" filter="url(#g)"/>' : ''}
  <rect x="8" y="14" width="104" height="128" rx="15" fill="${on ? '#8d6124' : '#07252a'}"/>
  <rect x="8" y="8" width="104" height="125" rx="15" fill="url(#rim)" filter="url(#m)"/>
  <rect x="13" y="13" width="94" height="115" rx="11" fill="url(#face)"/>
  <rect x="13" y="13" width="94" height="115" rx="11" fill="none" stroke="${on ? '#fffbe6' : '#000'}" stroke-opacity=".55" stroke-width="1.2"/>
  <path d="M22 16 H98" stroke="#fff" stroke-opacity="${on ? .9 : .25}" stroke-width="1.6" stroke-linecap="round"/>`, metal('m', 2.4, 1) + `
  <filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${on ? '#fffbe6' : '#ecd193'}"/><stop offset=".55" stop-color="${on ? '#e4bf72' : '#8a6730'}"/><stop offset="1" stop-color="${on ? '#a97b36' : '#b8914f'}"/></linearGradient>
  <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${on ? '#fff6d8' : '#1d5557'}"/><stop offset="1" stop-color="${on ? '#e3bd72' : '#0b2d31'}"/></linearGradient>`);

// Title plate for screen headings.
const scrollEnd = `<g filter="url(#m)"><path d="M78 44 H36 C22 44 12 38 12 30 C12 22 24 20 27 28 C29 33 22 36 20 32" fill="none" stroke="url(#gold)" stroke-width="3" stroke-linecap="round"/><path d="M36 44 C22 44 12 50 12 58 C12 66 24 68 27 60 C29 55 22 52 20 56" fill="none" stroke="url(#gold)" stroke-width="3" stroke-linecap="round"/></g>`;
const titlePlate = () => svg(480, 88, `
  <rect x="0" y="16" width="480" height="56" fill="url(#fade)"/>
  <path d="M60 16 H420 M60 72 H420" stroke="url(#gold)" stroke-width="1.6"/>
  ${scrollEnd}<g transform="translate(480 0) scale(-1 1)">${scrollEnd}</g>`, metal('m', 2.4, .8) + '<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b2b30" stop-opacity="0"/><stop offset=".12" stop-color="#0b2b30" stop-opacity=".95"/><stop offset=".88" stop-color="#0b2b30" stop-opacity=".95"/><stop offset="1" stop-color="#0b2b30" stop-opacity="0"/></linearGradient>');

// Seamless dark lacquer with cloud mottling and a few gold flecks.
const lacquer = () => svg(512, 512, `
  <rect width="512" height="512" fill="#0a2125"/>
  <rect width="512" height="512" filter="url(#cloud)"/>
  <rect width="512" height="512" filter="url(#fleck)"/>`, `
  <filter id="cloud" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".0078125" numOctaves="4" seed="11" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .12  0 0 0 0 .3  0 0 0 0 .32  1.5 0 0 0 -.55"/></filter>
  <filter id="fleck" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".5" numOctaves="1" seed="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .95  0 0 0 0 .8  0 0 0 0 .5  6 0 0 0 -4.35"/></filter>`);

const logo = () => svg(1040, 340, `
  <g filter="url(#glow)" opacity=".75"><text x="48" y="238" class="t" fill="#d7a64f">雀仙門</text></g>
  <text x="48" y="238" class="t" fill="#04100f" stroke="#04100f" stroke-width="14" stroke-linejoin="round">雀仙門</text>
  <text x="48" y="238" class="t" fill="url(#lg)" filter="url(#m)">雀仙門</text>`, metal('m', 7, 2.4, .72) + `
  <filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
  <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset=".12" stop-color="#fff3cf"/><stop offset=".46" stop-color="#ecc97f"/><stop offset=".6" stop-color="#a97a33"/><stop offset=".92" stop-color="#e6c27a"/></linearGradient>
  <style>.t{font:${process.env.LOGO_FONT || '700 250px "Noto Serif TC"'};letter-spacing:44px}</style>`);

const plates = { 'frame-panel': [framePanel, 240, 240], 'frame-small': [frameSmall, 96, 96], 'frame-card': [() => frameCard(false), 120, 120], 'frame-card-on': [() => frameCard(true), 120, 120],
  'btn-gold': [btnGold, 360, 96], 'btn-jade': [btnJade, 360, 96], 'tile-jade': [() => navTile(false), 120, 150], 'tile-gold': [() => navTile(true), 120, 150],
  'title-plate': [titlePlate, 480, 88], lacquer: [lacquer, 512, 512, true], logo: [logo, 1040, 340] };

// Silhouette icons, used through CSS masks so one file works in every colour.
const cog = (() => { let d = ''; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, p = (r, o) => `${(32 + r * Math.cos(a + o)).toFixed(1)} ${(32 + r * Math.sin(a + o)).toFixed(1)}`; d += `${i ? 'L' : 'M'}${p(20, -.33)} L${p(28, -.2)} L${p(28, .2)} L${p(20, .33)} `; } return d + 'Z M32 22 A10 10 0 1 0 32 42 A10 10 0 1 0 32 22Z'; })();
const icons = {
  hero: '<circle cx="32" cy="21" r="10"/><path d="M28 10 C28 5 36 5 36 10 L35 12 H29Z"/><path d="M20 7 L44 13 L44 14.5 L20 8.5Z"/><path fill-rule="evenodd" d="M9 58 C9 42 20 34 32 34 C44 34 55 42 55 58Z M32 38 L25 38.6 L32 50 L39 38.6Z"/>',
  lotus: '<path d="M32 6 C41 17 41 33 32 46 C23 33 23 17 32 6Z"/><path d="M13 15 C24 18 29 30 29.5 46 C18 41 12 29 13 15Z"/><path d="M51 15 C40 18 35 30 34.5 46 C46 41 52 29 51 15Z"/><path d="M2 30 C13 29 22 37 27 48 C15 49 6 42 2 30Z"/><path d="M62 30 C51 29 42 37 37 48 C49 49 58 42 62 30Z"/><path d="M12 52 H52 C50 57 42 59 32 59 C22 59 14 57 12 52Z"/>',
  compass: '<path fill-rule="evenodd" d="M32 4 A28 28 0 1 0 32 60 A28 28 0 1 0 32 4Z M32 9 A23 23 0 1 1 32 55 A23 23 0 1 1 32 9Z"/><path d="M32 12 L37 27 L52 32 L37 37 L32 52 L27 37 L12 32 L27 27Z"/>',
  road: '<path d="M3 57 L23 23 L33 39 L42 28 L61 57Z"/><rect x="21.6" y="4" width="2.8" height="21"/><path d="M24.4 5 L42 11 L24.4 17Z"/>',
  party: '<circle cx="42" cy="20" r="8.5"/><path d="M28 36 C31 32 37 30 42 30 C52 30 60 37 60 50 H46 C45 44 40 39 28 36Z"/><circle cx="23" cy="25" r="10"/><path d="M4 58 C4 44 13 38 23 38 C33 38 42 44 42 58Z"/>',
  chest: '<path d="M8 27 V20 C8 13 13 9 20 9 H44 C51 9 56 13 56 20 V27 H37 V23 H27 V27Z"/><path fill-rule="evenodd" d="M8 31 H27 V37 H37 V31 H56 V55 H8Z"/><rect x="29.5" y="26" width="5" height="9"/>',
  pouch: '<path d="M22 6 C27 9 37 9 42 6 L39 16 H25Z"/><rect x="23" y="18" width="18" height="4" rx="1"/><path fill-rule="evenodd" d="M26 24 H38 C49 30 56 38 56 47 C56 56 46 60 32 60 C18 60 8 56 8 47 C8 38 15 30 26 24Z M32 31 L39 41 L32 51 L25 41Z"/>',
  sword: '<g transform="rotate(45 32 32)"><path d="M32 -4 L37 5 V40 H27 V5Z"/><rect x="18" y="41" width="28" height="4.5" rx="1"/><rect x="29.3" y="47" width="5.4" height="11"/><circle cx="32" cy="62" r="4"/></g>',
  stall: '<path d="M8 9 H56 L61 25 C61 31 52 32 50.5 26 C49 32 40 32 38.5 26 C37 32 27 32 25.5 26 C24 32 15 32 13.5 26 C12 32 3 31 3 25Z"/><path fill-rule="evenodd" d="M9 33 C11 34 14 34 16 33 V58 H9Z M48 33 C50 34 53 34 55 33 V58 H48Z"/><path fill-rule="evenodd" d="M32 37 A9 9 0 1 0 32 55 A9 9 0 1 0 32 37Z M29 43 H35 V49 H29Z"/>',
  forge: '<path d="M6 36 H46 C46 43 41 46 36 46 L41 58 H15 L20 46 C13 46 7 43 6 36Z"/><path d="M46 36 H62 C57 41 52 43 46 43Z"/><g transform="rotate(38 34 18)"><rect x="19" y="6" width="26" height="12" rx="2"/><rect x="29.5" y="18" width="5" height="22"/></g>',
  cog: `<path fill-rule="evenodd" d="${cog}"/>`,
  coin: '<path fill-rule="evenodd" d="M32 4 A28 28 0 1 0 32 60 A28 28 0 1 0 32 4Z M25 25 H39 V39 H25Z M32 10 A22 22 0 1 0 32 54 A22 22 0 1 0 32 10Z M32 13 A19 19 0 1 1 32 51 A19 19 0 1 1 32 13Z"/>',
  crystal: '<path d="M20 5 H31 V22 H10Z"/><path d="M33 5 H44 L54 22 H33Z"/><path d="M9 25 H31 V60Z"/><path d="M33 25 H55 L33 60Z"/>',
  feed: '<path d="M12 7 H46 C52 7 54 11 54 15 V49 H22 V54 C22 60 12 60 12 54Z"/><path d="M24 53 H60 C60 58 57 60 53 60 H22 C24 58 24 56 24 53Z"/>',
  tile: '<path fill-rule="evenodd" d="M18 4 H46 C51 4 54 7 54 12 V52 C54 57 51 60 46 60 H18 C13 60 10 57 10 52 V12 C10 7 13 4 18 4Z M32 18 L44 32 L32 46 L20 32Z"/>',
  speaker: '<path d="M6 24 H18 L34 10 V54 L18 40 H6Z"/><path d="M41 21 C46 27 46 37 41 43 L38 40 C41 36 41 28 38 24Z"/><path d="M48 13 C57 23 57 41 48 51 L45 48 C52 39 52 25 45 16Z"/>',
  eye: '<path fill-rule="evenodd" d="M2 32 C13 15 22 10 32 10 C42 10 51 15 62 32 C51 49 42 54 32 54 C22 54 13 49 2 32Z M32 19 A13 13 0 1 0 32 45 A13 13 0 1 0 32 19Z"/><circle cx="32" cy="32" r="7"/>',
  hand: '<path d="M24 58 C16 50 10 42 7 35 C5 30 11 27 14 31 L20 38 V10 C20 5 27 5 27 10 V28 H29 V6 C29 1 36 1 36 6 V28 H38 V9 C38 4 45 4 45 9 V29 H47 V15 C47 10 54 10 54 15 V40 C54 48 51 54 47 58Z"/>',
  tag: '<path fill-rule="evenodd" d="M6 8 H30 L58 36 C60 38 60 40 58 42 L42 58 C40 60 38 60 36 58 L6 28Z M19 14 A6 6 0 1 0 19 26 A6 6 0 1 0 19 14Z"/>',
  voice: '<path d="M10 7 H54 C58 7 60 10 60 13 V40 C60 44 58 46 54 46 H30 L16 58 V46 H10 C6 46 4 44 4 40 V13 C4 10 6 7 10 7Z"/>',
};

(async () => {
  const only = process.argv[2];
  for (const [name, body] of Object.entries(icons)) fs.writeFileSync(path.join(iconDir, name + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>\n`);
  const browser = await chromium.launch();
  for (const [name, [draw, w, h, opaque]] of Object.entries(plates)) {
    if (only && only !== name) continue;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${draw()}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(tempDir, name + '.png'), omitBackground: !opaque });
    await page.close();
  }
  await browser.close();
  // Blurred, darkened key art keeps full-screen dialogs in the same world as the home screen.
  const convert = `
import os, sys
from PIL import Image, ImageFilter, ImageEnhance
temp, out, root = sys.argv[1:4]
for f in os.listdir(temp):
    if not f.endswith('.png'): continue
    im = Image.open(os.path.join(temp, f))
    if f == 'logo.png': im.resize((312, 102), Image.LANCZOS).save(os.path.join(temp, 'logo-mask.webp'), 'WEBP', quality=60, alpha_quality=70, method=6)
    name = f[:-4]
    im.save(os.path.join(out, name + '.webp'), 'WEBP', quality=72 if name == 'lacquer' else 88, alpha_quality=90, method=6)
home = Image.open(os.path.join(root, 'assets/start-screen/home.webp')).convert('RGB').resize((1024, 576), Image.LANCZOS)
bg = ImageEnhance.Brightness(ImageEnhance.Color(home.filter(ImageFilter.GaussianBlur(9))).enhance(.8)).enhance(.42)
bg.save(os.path.join(out, 'bg-mist.webp'), 'WEBP', quality=58, method=6)
for f in sorted(os.listdir(out)):
    p = os.path.join(out, f)
    if os.path.isfile(p): print(f, os.path.getsize(p))
`;
  const result = spawnSync('python', ['-c', convert, tempDir, outDir, root], { encoding: 'utf8' });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr);
  if (!only && result.status === 0) {
    const icon = name => `url("data:image/svg+xml,${encodeURIComponent(fs.readFileSync(path.join(iconDir, name + '.svg'), 'utf8').trim())}")`;
    const mask = fs.readFileSync(path.join(tempDir, 'logo-mask.webp')).toString('base64');
    fs.writeFileSync(path.join(root, 'ui-art-data.css'), `/* Generated by tools/build-ui-art.cjs. CSS masks are blocked for file:// pages unless the image is inline. */\n:root {\n${Object.keys(icons).map(name => `  --icon-${name}: ${icon(name)};`).join('\n')}\n  --logo-mask: url("data:image/webp;base64,${mask}");\n}\n`);
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exit(result.status);
})();
