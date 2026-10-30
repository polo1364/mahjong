const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../feedback-voice.js'), 'utf8');
const { game, source: engineSource } = require('./game-harness.cjs');
const settle = () => new Promise(resolve => setImmediate(resolve));

function voicePlayer({ timed = false } = {}) {
  const timers = new Map(); let timerId = 0;
  const nodes = [], events = new Map(), announcements = [], ducks = [];
  let time = 0;
  class Audio {
    constructor() { this.paused = true; this.requests = []; nodes.push(this); }
    play() { this.paused = false; return new Promise((resolve, reject) => this.requests.push({
      resolve: () => { this.paused = false; resolve(); }, reject })); }
    pause() { this.paused = true; }
    end() { this.onended?.(); }
  }
  const document = { hidden: false, addEventListener: (name, fn) => events.set(name, fn) };
  const window = { Audio, performance: { now: () => time }, MahjongAudio: { setDucked: value => ducks.push(value) },
    MahjongHeroVoices: require('../hero-voices.js'),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    dispatchEvent: event => announcements.push(event), addEventListener: (name, fn) => events.set(name, fn) };
  if (timed) { window.setTimeout = (fn, ms) => { timers.set(++timerId, { fn, at: time + ms }); return timerId; }; window.clearTimeout = id => timers.delete(id); }
  vm.runInNewContext(source, { window, document });
  return { api: window.MahjongVoice, nodes, document, events, announcements, ducks, advance: ms => { time += ms; for (const [id, timer] of timers) if (timer.at <= time) { timers.delete(id); timer.fn(); } } };
}

test('voice accepts 42 crystal tile names and 30 existing calls without browser speech or game randomness', async () => {
  const { api, nodes } = voicePlayer();
  assert.equal(api.play('chow'), false);
  api.setEnabled(true);
  const cues = [...['w','t','b'].flatMap(s => Array.from({length:9},(_,i)=>`tile-${s}${i+1}`)),
    ...['fe','fs','fw','fn','dc','df','db'].map(k=>'tile-'+k),
    ...Array.from({length:8},(_,i)=>`tile-h${i+1}`), 'chow','pong','kong','concealed-kong',
    'win','self-draw','flower','ready','draw-game','dealer-east','dealer-south','dealer-west','dealer-north','dealer-repeat',
    ...['e','s','w','n'].flatMap(round=>['e','s','w','n'].map(seat=>`round-${round}${seat}`))];
  assert.equal(cues.length, 72);
  for (const cue of cues) {
    api.stopAll(); assert.equal(api.play(cue), true);
    const folder=cue.startsWith('tile-')?'voice-crystal-v1':'voice';
    assert.equal(nodes[0].src, `assets/audio/${folder}/${cue}.mp3${cue === 'flower' ? '?v=20261020-clear-flower' : ''}`);
    nodes[0].requests.at(-1).resolve(); await settle();
    assert.equal(api.getState().lastPlayed, cue);
  }
  for (const cue of ['../secret','tile-h0','tile-h9','toString','https://example.com','tile-w10']) assert.equal(api.play(cue), false);
  assert.equal(nodes.length, 1);
  assert.doesNotMatch(source, /Math\.random|speechSynthesis|\bS\./);
  assert.doesNotMatch(engineSource, /speechSynthesis|SpeechSynthesisUtterance/);
});

test('all ten heroes use their own 42 tile names, 24 chants and two cultivation calls', () => {
  const { api, nodes }=voicePlayer();api.setEnabled(true);
  const catalog=require('../hero-voices.js');
  assert.equal(catalog.all.filter(h=>h.gender==='男').length,5);
  assert.equal(catalog.all.filter(h=>h.gender==='女').length,5);
  assert.equal(new Set(catalog.all.map(h=>h.voiceId)).size,10);
  for(const hero of catalog.all){
    for(const tile of require('../tile-names.js').entries){
      api.stopAll();const cue='tile-'+tile.key.toLowerCase();
      api.play(cue,{cultivation:true,heroId:hero.id});
      assert.equal(nodes[0].src,`assets/audio/voice-heroes-v1/${hero.id}/${cue}.mp3`);
      assert.equal(api.getState().activeHeroId,hero.id);
    }
    for(const cue of ['chow','pong','kong','concealed-kong','win','self-draw']){
      for(let variant=1;variant<=4;variant++){
        api.stopAll();api.play(cue,{cultivation:true,heroId:hero.id});
        assert.equal(nodes[0].src,`assets/audio/voice-heroes-v1/${hero.id}/${cue}-${variant}.mp3`);
      }
    }
    for(const cue of ['ready','flower']){
      api.stopAll();api.play(cue,{cultivation:true,heroId:hero.id});
      assert.equal(nodes[0].src,`assets/audio/voice-heroes-v1/${hero.id}/${cue}.mp3`);
    }
    api.stopAll();api.play('flower',{cultivation:true,heroId:hero.id,tileKey:'H8'});
    assert.equal(nodes[0].src,`assets/audio/voice-heroes-v1/${hero.id}/tile-h8.mp3`);
  }
});

test('queued identical cues retain distinct actors and ignore later option changes', () => {
  const {api,nodes}=voicePlayer();api.setEnabled(true);
  const second={cultivation:true,heroId:'su-lingheng'};
  api.play('pong',{cultivation:true,heroId:'shen-gufeng'});
  assert.equal(api.play('pong',second),true);
  assert.equal(api.play('pong',second),false);
  second.heroId='yun-zhiwei';nodes[0].end();
  assert.equal(api.getState().activeHeroId,'su-lingheng');
  assert.equal(nodes[0].src,'assets/audio/voice-heroes-v1/su-lingheng/pong-1.mp3');
  api.play('win',{cultivation:true,heroId:'ye-shuying'});
  assert.equal(api.getState().activeHeroId,'ye-shuying');
  assert.equal(api.getState().pending.length,0);
  api.setEnabled(false);assert.equal(api.getState().activeHeroId,null);
});

test('normal mode and narrator cues never route to character voices, invalid hero paths stay safe', () => {
  const {api,nodes}=voicePlayer();api.setEnabled(true);
  api.play('chow',{cultivation:false,heroId:'chi-ling'});
  assert.equal(nodes[0].src,'assets/audio/voice/chow.mp3');
  api.stopAll();api.play('round-ee',{cultivation:true,heroId:'chi-ling'});
  assert.equal(nodes[0].src,'assets/audio/voice/round-ee.mp3');
  for(const heroId of ['../voice','toString',undefined]){
    api.stopAll();api.play('tile-w1',{cultivation:true,heroId});
    assert.equal(nodes[0].src,'assets/audio/voice-crystal-v1/tile-w1.mp3');
  }
});

test('engine captures actor hero ID rather than the current turn and keeps preview overrides', () => {
  const {run}=game(23,{cultivation:true,heroId:'su-lingheng'});
  run('soundEnabled=true;voiceEnabled=true;window.recorded=[];window.MahjongVoice={play:(cue,options)=>window.recorded.push({cue,options})};');
  run("S.turn=2;playVoice('tile-w1',{pid:0});playVoice('tile-b1',{pid:1});playVoice('ready',{pid:3});playVoice('tile-t1',{heroId:'hua-jianlu'});");
  assert.equal(run('window.recorded[0].options.heroId'),'su-lingheng');
  assert.equal(run('window.recorded[1].options.heroId'),run('S.cultivation.players[1].heroId'));
  assert.equal(run('window.recorded[2].options.heroId'),run('S.cultivation.players[3].heroId'));
  assert.equal(run('window.recorded[3].options.heroId'),'hua-jianlu');
});

test('public flower names keep flower action priority, deduplication and status events', async () => {
  const { api, nodes, announcements }=voicePlayer(); api.setEnabled(true);
  api.play('tile-w1');
  assert.equal(api.play('flower',{tileKey:'H1'}),true);
  assert.equal(api.getState().active,'flower');
  assert.equal(nodes[0].src,'assets/audio/voice-crystal-v1/tile-h1.mp3');
  assert.equal(api.play('flower',{tileKey:'H2'}),false,'consecutive flowers retain one action announcement');
  assert.equal(nodes[0].src,'assets/audio/voice-crystal-v1/tile-h1.mp3');
  nodes[0].requests.at(-1).resolve(); await settle();
  assert.equal(api.getState().lastPlayed,'flower');
  assert.equal(announcements.at(-1).detail.type,'started');
  assert.equal(announcements.at(-1).detail.cue,'flower');
  assert.equal(api.play('win'),true);
  assert.equal(api.getState().active,'win');
  assert.equal(api.play('flower',{tileKey:'H8'}),false,'winning speech blocks late flower names');
});

test('queued flower retains the first public tile key and action expiration', () => {
  const { api, nodes, advance }=voicePlayer(); api.setEnabled(true);
  api.play('kong');api.play('flower',{tileKey:'H3'});
  assert.equal(api.play('flower',{tileKey:'H4'}),false);
  advance(1500);nodes[0].end();
  assert.equal(api.getState().active,'flower');
  assert.equal(nodes[0].src,'assets/audio/voice-crystal-v1/tile-h3.mp3');
  api.stopAll();api.play('kong');api.play('flower',{tileKey:'H5'});
  advance(3001);nodes[0].end();
  assert.equal(api.getState().active,null);
});

test('only flower H1-H8 options change the public sound source; names can be previewed independently', () => {
  const { api, nodes }=voicePlayer();api.setEnabled(true);
  for(const tileKey of ['W1','h1','H0','H9','../tile-h1',null]) {
    api.stopAll();api.play('flower',{tileKey});
    assert.equal(nodes[0].src,'assets/audio/voice/flower.mp3?v=20261020-clear-flower');
  }
  api.stopAll();api.play('pong',{tileKey:'H1'});
  assert.equal(nodes[0].src,'assets/audio/voice/pong.mp3');
  api.stopAll();api.play('tile-h8');
  assert.equal(nodes[0].src,'assets/audio/voice-crystal-v1/tile-h8.mp3');
});

test('chow pong and kong finish before a following discard while pending tile names stay bounded', () => {
  const { api, nodes } = voicePlayer(); api.setEnabled(true);
  for (const action of ['chow','pong','kong','concealed-kong']) {
    api.stopAll(); api.play(action);
    for (let n=1;n<=9;n++) api.play('tile-w'+n);
    assert.equal(api.getState().active, action);
    assert.equal(api.getState().pending.join(','), 'tile-w9');
    nodes[0].end(); assert.equal(api.getState().active, 'tile-w9');
  }
  assert.equal(nodes.length, 1);
});

test('winning speech preempts all lower cues and stale promises cannot stop or revive it', async () => {
  const { api, nodes, ducks } = voicePlayer(); api.setEnabled(true);
  api.play('chow'); api.play('tile-w1'); api.play('win');
  assert.equal(api.getState().active, 'win');
  assert.equal(api.getState().pending.length, 0);
  assert.equal(api.play('tile-w2'), false);
  nodes[0].requests[0].reject(new Error('old interrupted play'));
  nodes[0].requests[1].resolve(); await settle();
  assert.equal(api.getState().lastPlayed, 'win');
  assert.equal(api.getState().failedCues.length, 0);
  assert.equal(ducks.at(-1), true);
  nodes[0].end(); assert.equal(ducks.at(-1), false);
});

test('pending actions are bounded and stale discards expire before they become misleading', () => {
  const { api, nodes, advance } = voicePlayer(); api.setEnabled(true);
  api.play('chow'); ['pong','kong','ready','flower','dealer-east'].forEach(api.play);
  assert.equal(api.getState().pending.length, 2);
  api.stopAll(); api.play('chow'); api.play('tile-w1'); advance(1201); nodes[0].end();
  assert.equal(api.getState().active, null);
  assert.equal(api.getState().pending.length, 0);
});

test('mute voice-off zero-volume hidden and new-hand stops clear voice and release ducking', async () => {
  for (const stop of ['disable','volume','hidden','pagehide','stopAll']) {
    const { api, nodes, document, events, ducks } = voicePlayer(); api.setEnabled(true);
    api.play('pong'); api.play('tile-t2');
    if (stop==='disable') api.setEnabled(false);
    else if (stop==='volume') api.setVolume(0);
    else if (stop==='hidden') { document.hidden=true; events.get('visibilitychange')(); }
    else if (stop==='pagehide') events.get('pagehide')();
    else api.stopAll();
    nodes[0].requests[0].resolve(); await settle();
    assert.equal(api.getState().active, null, stop);
    assert.equal(api.getState().pending.length, 0, stop);
    assert.equal(nodes[0].paused, true, stop);
    assert.equal(ducks.at(-1), false, stop);
  }
});

test('missing voice reports a readable UI event and fails silently without synthetic fallback', async () => {
  const { api, nodes, announcements, ducks } = voicePlayer(); api.setEnabled(true);
  api.play('tile-fe'); nodes[0].requests[0].reject(new Error('missing local file')); await settle();
  assert.equal(api.getState().active, null);
  assert.equal(api.getState().failedCues.join(','), 'tile-fe');
  assert.equal(announcements.at(-1).detail.type, 'error');
  assert.equal(announcements.at(-1).detail.cue, 'tile-fe');
  assert.equal(ducks.at(-1), false);
  api.play('tile-fe'); nodes[0].requests[1].resolve(); await settle();
  assert.equal(api.getState().failedCues.length, 0);
});

test('voice tracks master volume and resumes when foreground with both preferences enabled', () => {
  const { api, nodes, document, events } = voicePlayer(); api.setEnabled(true);
  api.setVolume(.4); api.play('tile-b1'); assert.equal(nodes[0].volume, .4*.9);
  document.hidden=true; events.get('visibilitychange')(); assert.equal(api.play('kong'), false);
  document.hidden=false; assert.equal(api.play('kong'), true);
  api.setVolume(9); assert.equal(nodes[0].volume, .9);
  api.setVolume(NaN); assert.equal(api.getState().volume, 1);
});

test('cultivation rotates four local short chants per action without changing public cue identity', () => {
  const { api, nodes } = voicePlayer(); api.setEnabled(true);
  for (const cue of ['chow','pong','kong','concealed-kong','win','self-draw']) {
    for (let n=0; n<5; n++) {
      api.stopAll(); assert.equal(api.play(cue,{cultivation:true}),true);
      assert.equal(nodes[0].src,`assets/audio/voice-cultivation-v1/${cue}-${n%4+1}.mp3`);
      assert.equal(api.getState().active,cue);
      assert.ok(fs.existsSync(path.join(__dirname,'..',nodes[0].src)));
    }
    api.stopAll(); api.play(cue,{cultivation:false});
    assert.equal(nodes[0].src,`assets/audio/voice/${cue}.mp3`);
  }
  for (const cue of ['tile-w1','flower','ready','round-ee']) {
    api.stopAll(); api.play(cue,{cultivation:true});
    assert.doesNotMatch(nodes[0].src,/voice-cultivation/);
  }
});

test('queued chants retain mode and rejected or expired cues do not consume variants', () => {
  const {api,nodes,advance}=voicePlayer();api.setEnabled(true);
  api.play('ready');api.play('chow',{cultivation:true});
  assert.equal(api.play('chow',{cultivation:true}),false);
  nodes[0].end();assert.match(nodes[0].src,/chow-1\.mp3$/);
  api.stopAll();api.play('ready');api.play('chow',{cultivation:true});advance(3001);
  nodes[0].end();assert.equal(api.getState().active,null);
  api.play('chow',{cultivation:true});assert.match(nodes[0].src,/chow-2\.mp3$/);
  api.play('win',{cultivation:true});assert.match(nodes[0].src,/win-1\.mp3$/);
  assert.equal(api.getState().pending.length,0);
  assert.equal(api.play('pong',{cultivation:true}),false);
});

test('chant assets contain 24 distinct two-character names with complete unclipped output', () => {
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../art-source/audio/voice-cultivation-v1/manifest.json'),'utf8'));
  assert.equal(manifest.clips.length,24);
  assert.equal(new Set(manifest.clips.map(c=>c.text)).size,24);
  for (const clip of manifest.clips) {
    assert.match(clip.text,/^[\u4e00-\u9fff]{1,2}$/u);
    assert.equal(clip.levels.clipped_samples,0);
    assert.ok(clip.levels.sample_peak_dbfs <= -6);
    assert.ok(clip.levels.duration_seconds > .3 && clip.levels.duration_seconds < 1.5);
    assert.ok(clip.source_region_seconds[1] < manifest.accidental_tail.excluded_region_seconds[0]);
  }
});

function recordedGame() {
  const runtime = game();
  runtime.run(`let announced=[];let announcedOptions=[];let voiceStops=0; window.MahjongVoice={play(cue,options){announced.push(cue);announcedOptions.push(options)},stopAll(){voiceStops++},setEnabled(){}};
    soundEnabled=true;voiceEnabled=true;document.hidden=false;`);
  return runtime;
}

test('game voice gates block hidden events, honor both controls, and recover in foreground', () => {
  const { run } = recordedGame();
  run(`playVoice('chow');document.hidden=true;playVoice('pong');document.hidden=false;playVoice('kong');`);
  assert.equal(run("announced.join(',')"), 'chow,kong');
  run(`voiceEnabled=false;playVoice('win');voiceEnabled=true;soundEnabled=false;playVoice('win');`);
  assert.equal(run('announced.length'), 2);
});

test('cultivation committed skills replace legacy action calls while normal calls and ready stay available', () => {
  const {run}=recordedGame();
  run(`playVoice('chow');S.cultivation={};
    for(const cue of ['chow','pong','kong','concealed-kong','win','self-draw','flower']) playVoice(cue,{tileKey:'H3'});
    playVoice('ready');S.cultivation=null;playVoice('win');`);
  assert.equal(run('announced.join(",")'),'chow,ready,win');
  assert.equal(run('announcedOptions.map(o=>o.cultivation).join(",")'),'false,true,false');
});

test('game forwards public flower keys while initial dealing never queues flower names', () => {
  const { run }=recordedGame();
  run(`fixture();S.wall=tiles('W1 W2 W3');S.deadWall=tiles('T9 H2');
    receiveTile(0,tiles('H1')[0],false);`);
  assert.equal(run("announced.join(',')"),'flower,flower');
  assert.equal(run("announcedOptions.map(options=>options.tileKey).join(',')"),'H1,H2');
  assert.equal(run("S.players[0].flowers.map(tileKey).join(',')"),'H1,H2');
  run(`fixture();announced.length=0;announcedOptions.length=0;S.phase='deal';
    S.wall=tiles('W1 W2 W3');S.deadWall=tiles('T9 H4');receiveTile(0,tiles('H3')[0],false);`);
  assert.equal(run('announced.length'),0);
  assert.equal(run("S.players[0].flowers.map(tileKey).join(',')"),'H3,H4');
});

test('restoring a valid hand clears old audio voice and effects; invalid saves leave them intact', () => {
  const { run } = recordedGame();
  run(`let audioStops=0, effectClears=0;
    window.MahjongAudio={stopAll(){audioStops++}};
    window.MahjongEffects={clear(){effectClears++}};
    try { restoreGame({gameState:{players:[]}}); } catch {}
  `);
  assert.equal(run('audioStops+voiceStops+effectClears'), 0);
  run(`let saved={gameState:clone(S),rules:clone(RULES),seatNames,randomNames,dealerStreak};
    restoreGame(saved);`);
  assert.equal(run('audioStops'), 1);
  assert.equal(run('voiceStops'), 1);
  assert.equal(run('effectClears'), 1);
});

test('successful discard announces its actual key once and rejected discards are silent', () => {
  const { run } = recordedGame();
  run(`fixture();S.turn=0;S.players[0].hand=tiles('W1 W2 W4 W6 W8 T1 T3 T5 T7 T9 B1 B3 B5 B7 FE FS DC');
    let out=S.players[0].hand.at(-1);discard(0,out);discard(0,out);`);
  assert.equal(run("announced.join(',')"), 'tile-dc');
});

test('delayed round announcement uses public round-and-seat clips and checks visibility when callback executes', () => {
  const { run } = recordedGame();
  run(`let dealerCallbacks=[];const originalSchedule=scheduleGame; scheduleGame=(fn,delay)=>{
    if(delay===500){dealerCallbacks.push(fn);return 0;}return originalSchedule(fn,delay);};
    startNewHand(true);cancelGameTimers();document.hidden=true;dealerCallbacks.shift()();`);
  assert.equal(run('announced.length'), 0);
  run(`document.hidden=false;startNewHand(true);cancelGameTimers();dealerCallbacks.shift()();`);
  // First hand of a session is the East round; the second wind is the dealer's seat.
  assert.match(run('announced[0]'), /^round-e[eswn]$/);
  assert.ok(run('voiceStops')>0, 'new hand cancels old local speech');
});


test('a stalled spoken tile expires and releases ducking without replaying late', async () => {
  const h = voicePlayer({ timed: true }); h.api.setEnabled(true);
  h.api.play('tile-w1'); h.advance(701);
  assert.equal(h.api.getState().active, null);
  assert.equal(h.ducks.at(-1), false);
  h.nodes[0].requests[0].resolve(); await settle();
  assert.equal(h.nodes[0].paused, true);
  assert.equal(h.api.getState().lastPlayed, null);
  assert.equal(h.announcements.at(-1).detail.type, 'expired');
});
