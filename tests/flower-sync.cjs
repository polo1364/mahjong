const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const out = path.join(__dirname, '../artifacts');
const baseline = process.argv.includes('--baseline');
const flowerBaseline = process.argv.includes('--flower-baseline');
const plain = 'W1 W2 W4 W6 W8 T1 T3 T5 T7 B1 B3 B5 FE FS FW FN';
const cases = [
  { name: '大三元', hand: 'DC DC DC DF DF DF DB DB DB W1 W2 W3 T4 T5 T6 B9 B9' },
  { name: '清一色', hand: 'W1 W2 W3 W1 W2 W3 W4 W5 W6 W4 W5 W6 W7 W8 W9 W9 W9', discard: true },
  { name: '八仙過海', hand: plain, flowers: { 0: 'H1 H2 H3 H4 H5 H6 H7' }, nextDraw: 'H8' },
  { name: '七搶一', hand: plain, flowers: { 1: 'H1 H2 H3 H4 H5 H6 H7' }, nextDraw: 'H8' }
];
const flowerCases = [
  { name:'單補花', hand:plain, nextDraw:'H1', replacements:['T9'], count:1 },
  { name:'連補花', hand:plain, nextDraw:'H1', replacements:['H2','T9'], count:2 },
  { name:'暗槓連補花', hand:'DC DC DC DC W1 W2 W3 T1 T2 T3 B1 B2 B3 FE FE FE DB',
    replacements:['H1','H2','DB'], count:2, kong:true }
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { mode: baseline ? 'baseline' : flowerBaseline ? 'flower-baseline' : 'final', results: [], flowers: [], lifecycle: [], errors: [],
    flowerSha256: createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../assets/audio/voice/flower.mp3'))).digest('hex'),
    crystalFlowerSha256: Object.fromEntries(Array.from({length:8},(_,i)=>{
      const cue=`tile-h${i+1}`;
      return [cue,createHash('sha256').update(fs.readFileSync(path.join(__dirname,`../assets/audio/voice-crystal-v1/${cue}.mp3`))).digest('hex')];
    })),
    boundary: 'Real local MP3 playing events/currentTime and live CSS animation. Normal game timers; no audio replacement or animation freezing.' };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type()==='error') report.errors.push(message.text()); });
    await page.route('**/favicon.ico', route=>route.fulfill({status:204,body:''}));
    await page.addInitScript(() => {
      window.syncEvents = [];
      window.syncMedia = [];
      const record = (type, detail={}) => syncEvents.push({type, at:performance.now(), ...detail});
      addEventListener('mahjong-voice-status',event=>record('voice-status',event.detail));
      const nativePlay = HTMLMediaElement.prototype.play;
      const requests = new WeakMap();
      let serial = 0;
      HTMLMediaElement.prototype.play = function (...args) {
        if(!syncMedia.includes(this))syncMedia.push(this);
        const id = ++serial, src = this.src, cue = new URL(src).pathname.split('/').at(-1).replace('.mp3','');
        const channel = /\/voice(?:-crystal-v1)?\//.test(src) ? 'voice' : 'sfx';
        requests.set(this,id);
        const info = () => ({id,cue,channel,src,currentTime:this.currentTime,duration:this.duration,readyState:this.readyState});
        record('request',info());
        for (const event of ['playing','ended']) this.addEventListener(event,()=>{
          if(requests.get(this)===id)record(event,info());
        },{once:true,capture:true});
        const result=nativePlay.apply(this,args);
        Promise.resolve(result).then(()=>{
          if(requests.get(this)!==id)return;
          record('resolved',info());
          let frames=0;
          const measure=()=>{
            if(requests.get(this)!==id)return;
            if(this.currentTime>0)record('advancing',info());
            else if(!this.paused && ++frames<30)requestAnimationFrame(measure);
          };
          requestAnimationFrame(measure);
        },error=>record('rejected',{id,cue,channel,error:error.name}));
        return result;
      };
      addEventListener('DOMContentLoaded',()=>{
        new MutationObserver(mutations=>{
          for(const mutation of mutations) {
            for(const node of mutation.addedNodes) if(node.nodeType===1 && node.matches('.mahjong-fx')) {
              const info={kind:node.dataset.kind,special:node.dataset.special || null};
              record('effect-added',info);
              const fading=()=>{
                if(!node.isConnected || Number(getComputedStyle(node).opacity)<.1)record('effect-hidden',info);
                else requestAnimationFrame(fading);
              };
              const visible=()=>{
                if(!node.isConnected)return;
                if(Number(getComputedStyle(node).opacity)>=.1){record('effect-visible',info);requestAnimationFrame(fading);}
                else requestAnimationFrame(visible);
              };
              requestAnimationFrame(visible);
            }
            for(const node of mutation.removedNodes) if(node.nodeType===1 && node.matches('.mahjong-fx'))
              record('effect-removed',{kind:node.dataset.kind,special:node.dataset.special || null});
          }
        }).observe(document.body,{childList:true});
      });
    });
    await page.goto('http://127.0.0.1:8765');
    await page.locator('#startGameBtn').click();
    await page.locator('#normalModeBtn').click();
    await page.waitForFunction(()=>typeof S!=='undefined' && S?.phase==='play' && window.MahjongEffects?.showWin);
    await page.evaluate(()=>cancelGameTimers());
    await page.locator('#tableMenuBtn').click();
    await page.locator('#voiceAnnouncements').check();
    if(await page.locator('#soundBtn').getAttribute('aria-pressed')!=='true')await page.locator('#soundBtn').click();
    await page.locator('#tableMenuClose').click();
    await page.evaluate(()=>{
      window.syncFixture=spec=>{
        cancelGameTimers();S=null;startNewHand(true);cancelGameTimers();hideReactionPanel();MahjongEffects.clear();MahjongAudio.stopAll();
        const pool=generateTiles();
        const take=key=>{const i=pool.findIndex(t=>tileKey(t)===key);if(i<0)throw Error('Missing physical tile '+key);return pool.splice(i,1)[0];};
        const hand=text=>text?text.split(' ').map(take):[];
        S.players.forEach(p=>Object.assign(p,{hand:[],melds:[],flowers:[],discards:[],points:100000,draws:3,passedHu:false,passedPong:[],
          discardBan:[],lastDiscardKey:null,declaredListen:false,tingLocked:false,autoMode:false,rinshan:false,drawnTile:null,waitKeys:[],tianTing:false,diTing:false}));
        S.players[0].hand=hand(spec.hand);
        for(const [pid,flowers] of Object.entries(spec.flowers || {}))S.players[pid].flowers=hand(flowers);
        const next=spec.nextDraw?take(spec.nextDraw):null;
        const replacements=(spec.replacements || []).map(take);
        for(let pid=1;pid<4;pid++)for(let n=0;n<16;n++)S.players[pid].hand.push(pool.splice(pool.findIndex(t=>t.suit!=='H'),1)[0]);
        S.deadWall=pool.splice(0,16-replacements.length);S.deadWall.push(...replacements.reverse());
        S.wall=pool;if(next)S.wall.push(next);S.remain=S.wall.length;
        Object.assign(S,{phase:'play',turn:0,dealer:1,round:1,dealerStreak:0,drawCount:12,lastDiscard:null,lastPlayed:null,waitReact:null,
          currentReactions:null,winner:null,fromPlayer:null,winTile:null,resultDetail:null,flowerWin:null,robKong:false,pendingKong:null,
          lastAction:'draw',lastActor:0,anyOpenMeld:false,kongCount:0});
        if(S.players[0].hand.length===17)S.players[0].drawnTile=S.players[0].hand.at(-1);
        seatNames=['西','東','北','南'];renderAll();
        if(spec.discard){const tile=S.players[0].hand.pop();S.players[1].hand.push(tile);S.turn=1;discard(1,tile);}
      };
    });
    for(const [width,height] of baseline || flowerBaseline ? [[1440,1000]] : [[1440,1000],[390,844]]) {
      await page.setViewportSize({width,height});
      for(const style of ['jade','ink','neon']) {
        await page.evaluate(style=>{MahjongEffects.setStyle(style);MahjongEffects.setReduced(false);},style);
        for(const spec of flowerBaseline ? [] : baseline ? cases.slice(0,2) : cases) {
          await page.evaluate(spec=>syncFixture(spec),spec);
          await page.locator('.center-area').scrollIntoViewIfNeeded();
          await page.evaluate(()=>{syncEvents.length=0;});
          if(spec.nextDraw)await page.evaluate(()=>stepNext());else await page.locator('#btnHu').click();
          await page.waitForFunction(()=>S.phase==='end' && S.resultDetail);
          if(!baseline && spec.name==='大三元') {
            await page.waitForTimeout(600);
            await page.screenshot({path:path.join(out,`flower-sync-${style}-${width}-special.png`),fullPage:false});
            await page.waitForTimeout(2400);
          } else await page.waitForTimeout(3000);
          const result=await page.evaluate(()=>({events:syncEvents.slice(),detail:S.resultDetail,points:S.players.map(p=>p.points),
            from:S.fromPlayer,audio:MahjongAudio.getState(),voice:MahjongVoice.getState(),effects:MahjongEffects.getState()}));
          assert.ok(result.detail.categories.includes(spec.name));
          assert.equal(result.points.reduce((a,b)=>a+b,0),400000);
          const cue=result.from===-1?'self-draw':'win';
          if(spec.nextDraw) {
            assert.equal(result.events.filter(event=>event.type==='playing' && event.channel==='voice' && (event.cue==='flower' || /^tile-h[1-8]$/.test(event.cue))).length,0,
              'flower-win priority prevents stale flower speech after settlement');
            assert.equal(result.voice.pending.length,0);
          }
          const selected=result.events.filter(event=>event.cue===cue);
          const effect=result.events.find(event=>event.type==='effect-added' && event.special===spec.name);
          const visible=result.events.find(event=>event.type==='effect-visible' && event.special===spec.name);
          assert.ok(effect && visible,'special effect becomes visibly animated');
          const media={};
          for(const channel of ['sfx','voice']) {
            const playing=selected.filter(event=>event.channel===channel && event.type==='playing');
            assert.equal(playing.length,1,`${spec.name} ${channel} starts exactly once`);
            assert.ok(selected.some(event=>event.channel===channel && event.type==='advancing' && event.currentTime>0));
            const ended=selected.find(event=>event.channel===channel && event.type==='ended');
            assert.ok(ended,`${spec.name} ${channel} finishes naturally`);
            media[channel]={playing:playing[0].at,effectDelta:playing[0].at-effect.at,visibleDelta:playing[0].at-visible.at,
              duration:playing[0].duration,ended:ended.at};
          }
          const startSpread=Math.max(media.sfx.playing,media.voice.playing,visible.at)-Math.min(media.sfx.playing,media.voice.playing,visible.at);
          assert.ok(startSpread<180,`sound/voice/visible animation starts within 180ms: ${startSpread}`);
          assert.equal(result.events.filter(event=>event.type==='effect-added' && event.special===spec.name).length,1);
          assert.deepEqual(result.audio.failedCues,[]);assert.deepEqual(result.voice.failedCues,[]);
          report.results.push({width,height,style,name:spec.name,cue,fan:result.detail.fan,startSpread,media,events:result.events});
          console.log('PASS',width,style,spec.name,'spread',startSpread.toFixed(1),'ms');
        }
        for(const spec of baseline ? [] : flowerCases) {
          await page.evaluate(spec=>syncFixture(spec),spec);
          await page.evaluate(()=>{syncEvents.length=0;});
          if(spec.kong)await page.locator('#btnKong').click();else await page.evaluate(()=>stepNext());
          await page.waitForTimeout(4200);
          const result=await page.evaluate(()=>({events:syncEvents.slice(),flowers:S.players[0].flowers.map(tileKey),
            audio:MahjongAudio.getState(),voice:MahjongVoice.getState()}));
          assert.equal(result.flowers.length,spec.count);
          const flowerCue=baseline||flowerBaseline?'flower':'tile-h1';
          const selected=result.events.filter(event=>event.cue===flowerCue && event.channel==='voice');
          assert.equal(selected.filter(event=>event.type==='playing').length,1,'chain flowers share one uninterrupted announcement');
          if(!baseline && !flowerBaseline) {
            assert.equal(result.events.filter(event=>event.type==='playing' && event.channel==='voice' && /^tile-h[1-8]$/.test(event.cue)).length,1,
              'chain flower names announce the first public flower once');
            assert.equal(result.events.filter(event=>event.type==='started' && event.cue==='flower').length,1,
              'named flower playback retains the logical flower status event');
          }
          assert.ok(selected.some(event=>event.type==='advancing' && event.currentTime>0));
          const ended=selected.find(event=>event.type==='ended');
          assert.ok(ended,'flower voice finishes naturally');
          const removed=result.events.filter(event=>event.type==='effect-removed' && event.kind==='flower').at(-1);
          assert.ok(removed,'flower animation completes');
          const overhang=ended.at-removed.at;
          const hidden=result.events.filter(event=>event.type==='effect-hidden' && event.kind==='flower').at(-1);
          assert.ok(hidden,'flower animation visibly finishes');
          const visibleOverhang=ended.at-hidden.at;
          if(!flowerBaseline)assert.ok(visibleOverhang<100,`flower animation remains visible through voice; overhang ${visibleOverhang.toFixed(1)}ms`);
          assert.deepEqual(result.audio.failedCues,[]);assert.deepEqual(result.voice.failedCues,[]);
          report.flowers.push({width,height,style,name:spec.name,overhang,visibleOverhang,events:result.events});
          console.log(flowerBaseline?'MEASURE':'PASS',width,style,spec.name,'voice after effect',overhang.toFixed(1),'ms');
        }
      }
    }
    if(!baseline && !flowerBaseline) {
      await page.evaluate(spec=>{syncFixture(spec);window.savedBeforeWin={gameState:clone(S),rules:clone(RULES),seatNames,randomNames,dealerStreak};},cases[0]);
      await page.locator('#btnHu').click();
      await page.waitForFunction(()=>MahjongAudio.getState().active && MahjongVoice.getState().active);
      await page.evaluate(()=>{
        window.oldWinMedia=syncMedia.filter(audio=>/\/(?:self-draw|win)\.mp3$/.test(new URL(audio.src).pathname))
          .map(audio=>({audio,src:audio.src}));
        restoreGame(savedBeforeWin);
      });
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(()=>oldWinMedia.length>=2 && oldWinMedia.every(({audio,src})=>audio.paused || audio.src!==src)),
        'restored hand stops the old win media; its legitimate turn prompt may play separately');
      assert.equal(await page.evaluate(()=>MahjongVoice.getState().active),null);
      assert.equal(await page.locator('.mahjong-fx').count(),0);
      report.lifecycle.push('Valid restore stops actual winning SFX/voice and clears the old special effect');

      await page.evaluate(spec=>syncFixture(spec),cases[0]);
      await page.locator('#btnHu').click();
      await page.waitForFunction(()=>MahjongAudio.getState().active && MahjongVoice.getState().active);
      await page.locator('#tableMenuBtn').click();
      await page.locator('#soundVolume').fill('0');
      await page.locator('#soundVolume').dispatchEvent('input');
      assert.equal(await page.evaluate(()=>MahjongAudio.getState().active),0);
      assert.equal(await page.evaluate(()=>MahjongVoice.getState().active),null);
      await page.locator('#soundVolume').fill('65');
      await page.locator('#soundVolume').dispatchEvent('input');
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>MahjongAudio.getState().active),0);
      assert.equal(await page.evaluate(()=>MahjongVoice.getState().active),null);
      report.lifecycle.push('Volume slider zero stops actual playback and raising it does not revive the old win');
    }
    assert.deepEqual(report.errors,[]);
    report.passed=true;
    report.maxStartSpread=Math.max(...report.results.map(item=>item.startSpread));
    console.log(JSON.stringify({passed:true,cases:report.results.length,flowers:report.flowers.length,maxStartSpread:report.maxStartSpread,errors:report.errors.length}));
  } finally {
    fs.writeFileSync(path.join(out,baseline?'flower-sync-baseline.json':flowerBaseline?'flower-sync-flower-baseline.json':'flower-sync-results.json'),JSON.stringify(report,null,2));
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
