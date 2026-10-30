const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../feedback-controls.js'), 'utf8');
const { source: engine } = require('./game-harness.cjs');

function controls(cultivation = true, saved = { voice: true }) {
  const nodes = [], played = [], skills = [];
  const music = [], preferences = [];
  const makeNode = (tag = 'div') => {
    const node = { tagName: tag.toUpperCase(), children: [], handlers: {}, value: '', checked: false,
      classList: { toggle() {} }, setAttribute() {},
      addEventListener(name, fn) { this.handlers[name] = fn; },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      get options() { return this.children; },
      get selectedOptions() { return this.children.filter(child => child.value === this.value); }
    };
    nodes.push(node); return node;
  };
  const document = { hidden: false, documentElement: makeNode(), createElement: makeNode,
    getElementById(id) {
      const existing = nodes.find(node => node.id === id);
      if (existing) return existing;
      const node = makeNode(); node.id = id; return node;
    }
  };
  document.getElementById('soundVolume').value = '80';
  document.getElementById('effectStyle').value = 'jade';
  const state = { cultivation: cultivation ? { players: [{ heroId: 'shen-gufeng' }] } : null };
  const window = { MahjongHeroVoices: require('../hero-voices.js'), addEventListener() {},
    MahjongMusic: { setEnabled(value) { music.push(value); } },
    MahjongHeroSkillVoices: { get: () => ({ file: 'clip.mp3' }) },
    MahjongVoice: { stopAll() {}, setVolume() {}, setEnabled() {},
      play(cue, options) { played.push({ cue, options }); return true; },
      playSkill(id, options) { skills.push({ id, options }); return true; }
    }
  };
  const context = vm.createContext({ window, document, S: state, soundEnabled: true, voiceEnabled: true,
    localStorage: { getItem: () => JSON.stringify(saved), setItem(key, value) { preferences.push(JSON.parse(value)); } },
    setSoundEnabled() {}, playSound() {}, showEffect() {} });
  vm.runInContext(engine.match(/function playVoice\(cue, options\) \{[\s\S]*?\n\}/)[0], context);
  vm.runInContext(source, context);
  return { window, document, state, played, skills, music, preferences,
    choose(value) { document.getElementById('heroVoiceCall').value = value; },
    click() { document.getElementById('previewHeroCall').handlers.click(); },
    status: () => document.getElementById('feedbackStatus').textContent,
    options: () => document.getElementById('heroVoiceCall').options.map(option => [option.value, option.textContent])
  };
}

test('cultivation explicit previews use the eight new calls while ordinary game calls stay gated', () => {
  const ui = controls();
  const mapping = { chow: 'chow', pong: 'pong', kong: 'exposed', 'concealed-kong': 'concealed',
    added: 'added', win: 'win', 'self-draw': 'self-draw', 'rob-kong': 'rob-kong' };
  for (const [cue, action] of Object.entries(mapping)) {
    ui.choose(cue); ui.click();
    assert.equal(ui.skills.at(-1).id, 'call:' + action);
    assert.equal(ui.skills.at(-1).options.heroId, 'shen-gufeng');
    assert.match(ui.status(), /正在試聽出招/);
  }
  assert.equal(ui.played.length, 0);
  assert.doesNotMatch(ui.options().map(([, text]) => text).join(' '), /吃|碰|槓|胡|自摸/);
  ui.choose('ready'); ui.click();
  assert.equal(ui.played.at(-1).cue, 'ready');
  assert.equal(ui.played.at(-1).options.cultivation, true);
});

test('music defaults on for old preferences and its independent choice survives saving', () => {
  const ui = controls();
  const checkbox = ui.document.getElementById('backgroundMusic');
  assert.equal(checkbox.checked, true);
  assert.equal(ui.music.at(-1), true);
  checkbox.checked = false;
  checkbox.handlers.change();
  assert.equal(ui.music.at(-1), false);
  assert.equal(ui.preferences.at(-1).music, false);
  assert.equal(ui.preferences.at(-1).voice, true);
  assert.equal(ui.preferences.at(-1).sound, true);
  const restored = controls(false, ui.preferences.at(-1));
  assert.equal(restored.document.getElementById('backgroundMusic').checked, false);
  assert.equal(restored.music.at(-1), false);
});

test('missing or unavailable preview clips never claim to be playing', () => {
  const ui = controls();
  ui.window.MahjongVoice.playSkill = () => false;
  ui.window.MahjongHeroSkillVoices.get = () => ({ file: null });
  ui.click(); assert.match(ui.status(), /尚未製作/);
  ui.window.MahjongHeroSkillVoices.get = () => ({ file: 'clip.mp3' });
  ui.click(); assert.match(ui.status(), /暫時無法播放/);
  ui.document.getElementById('soundVolume').value = '0';
  ui.click(); assert.match(ui.status(), /提高音量/);
});

test('normal mode preserves original preview options and mode switches restore them', () => {
  const ui = controls(false), original = ui.options();
  assert.deepEqual(original.map(([cue]) => cue), ['chow', 'pong', 'kong', 'concealed-kong', 'win', 'self-draw', 'ready', 'flower']);
  ui.choose('flower'); ui.click();
  assert.equal(ui.played.at(-1).cue, 'flower');
  assert.equal(ui.played.at(-1).options.cultivation, false);
  assert.equal(ui.skills.length, 0);
  ui.state.cultivation = { players: [{ heroId: 'chi-ling' }] };
  ui.window.MahjongFeedbackControls.syncMode();
  assert.ok(ui.options().some(([cue]) => cue === 'added'));
  ui.choose('rob-kong'); ui.click();
  assert.equal(ui.skills.at(-1).options.heroId, 'chi-ling');
  ui.state.cultivation = null;
  ui.window.MahjongFeedbackControls.syncMode();
  assert.deepEqual(ui.options(), original);
});

test('voice starts on, an old saved default turns on once, and a choice made since is kept', () => {
  const checked = saved => controls(true, saved).document.getElementById('voiceAnnouncements').checked;
  assert.equal(checked({}), true, 'a new player hears voices');
  assert.equal(checked({ voice: false, sound: true }), true, 'a save from before the change recorded the old default');
  assert.equal(checked({ voice: false, voiceChosen: true }), false, 'turning it off since is respected');
  assert.equal(checked({ voice: true, voiceChosen: true }), true);
});
