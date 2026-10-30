const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../cultivation-effects.js'), 'utf8');
const previewSource = source.slice(source.indexOf('  function showPreview('), source.indexOf("  document.addEventListener('visibilitychange'"));
const voiceSource = fs.readFileSync(path.join(__dirname, '../feedback-voice.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

function preview() {
  const nodes = [], audio = [], lookups = [];
  let ready;
  const assets = new Promise(resolve => { ready = resolve; });
  const element = tag => {
    const node = { tag, isConnected: true, handlers: {}, children: [], textContent: '',
      append(...children) { this.children.push(...children); },
      setAttribute() {}, showModal() {}, close() {}, focus() {},
      remove() { this.isConnected = false; },
      addEventListener(name, fn) { this.handlers[name] = fn; }
    };
    nodes.push(node); return node;
  };
  class Audio {
    constructor() { this.paused = true; audio.push(this); }
    play() { this.paused = false; this.plays = (this.plays || 0) + 1; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const document = { hidden: false, createElement: element, body: element('body'),
    addEventListener() {}, getElementById: () => null };
  const root = { Audio, addEventListener() {}, MahjongHeroSkillVoices: {
    get(heroId, id) {
      lookups.push({ heroId, id });
      return id === 'W.chow.123' ? { id, heroId, action: 'chow', durationSeconds: 1,
        file: 'assets/audio/voice-hero-skills-v1/' + heroId + '/W.chow.123.mp3' } : null;
    }
  } };
  const context = vm.createContext({ root, window: root, document, preview: null,
    P: { profile: () => ({ name: '角色招式' }) },
    mountPreview: () => ({ stop() {}, add() {}, destroy() {} }),
    previewEvents: () => ({ plan: { damage: 100 }, state: { monster: {} } }),
    loadAssets: () => assets });
  vm.runInContext(voiceSource, context);
  vm.runInContext(previewSource, context);
  return { api: root.MahjongVoice, document, nodes, audio, lookups,
    open: (id = 'W.chow.123', heroId = 'shen-gufeng') => context.showPreview(id, heroId),
    ready: () => ready(), close: () => context.preview.close(),
    replay: () => nodes.find(node => node.textContent === '重播招式與音效').onclick()
  };
}

test('catalog audition plays the selected hero recording and replay or close cancels the previous speech', async () => {
  const p = preview(); p.api.setEnabled(true); p.open(); p.ready(); await settle();
  assert.equal(p.audio[0].src, 'assets/audio/voice-hero-skills-v1/shen-gufeng/W.chow.123.mp3');
  assert.equal(p.api.getState().active, 'skill:W.chow.123');
  p.replay(); await settle();
  assert.equal(p.audio[0].plays, 2);
  assert.equal(p.api.getState().pending.length, 0);
  p.close(); assert.equal(p.audio[0].paused, true);
  assert.equal(p.api.getState().active, null);
});

test('catalog audition honors voice-off, zero volume, hidden page and missing recordings', async () => {
  for (const mode of ['muted', 'zero', 'hidden', 'missing']) {
    const p = preview();
    if (mode !== 'muted') p.api.setEnabled(true);
    if (mode === 'zero') p.api.setVolume(0);
    if (mode === 'hidden') p.document.hidden = true;
    p.open(mode === 'missing' ? 'W.chow.234' : 'W.chow.123'); p.ready(); await settle();
    assert.ok(p.audio.every(node => !node.plays), mode);
    assert.equal(p.api.getState().active, null, mode);
    p.close();
  }
});

test('secret and unassigned-hero previews do not resolve private recordings', async () => {
  for (const [id, heroId] of [['secret', 'chi-ling'], ['W.chow.123', null]]) {
    const p = preview(); p.api.setEnabled(true); p.open(id, heroId); p.ready(); await settle();
    assert.equal(p.lookups.length, 0);
    p.close();
  }
});

test('closing before preview assets load cannot start delayed speech', async () => {
  const p = preview(); p.api.setEnabled(true); p.open(); p.close(); p.ready(); await settle();
  assert.equal(p.lookups.length, 0);
  assert.equal(p.api.getState().active, null);
});
