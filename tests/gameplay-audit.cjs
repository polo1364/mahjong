const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, '../artifacts');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const mobile = process.argv.includes('--mobile');
  const withVoice = process.argv.includes('--voice');
  const prefix = process.argv.find(arg => arg.startsWith('--prefix='))?.slice(9) ?? (withVoice ? 'voice-' : '');
  assert.match(prefix, /^[a-z0-9-]*$/, 'artifact prefix must be a safe filename prefix');
  const seedOption = process.argv.find(arg => arg.startsWith('--seeds='));
  const seeds = seedOption ? seedOption.slice(8).split(',').map(Number) : [1,7,19,23,41];
  assert.ok(seeds.length && seeds.every(Number.isSafeInteger), 'seeds must be comma-separated integers');
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
  const errors = [], checks = [], games = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  if (withVoice) await page.addInitScript(() => {
    window.auditVoicePlayback = [];
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      const result = nativePlay.apply(this, args), source = this.src;
      if (source.includes('/audio/voice/')) Promise.resolve(result).then(() => {
        let attempts = 0;
        const measure = () => {
          if (this.src !== source) return;
          if (this.currentTime > 0) auditVoicePlayback.push({ cue: new URL(source).pathname.split('/').at(-1).replace('.mp3',''),
            currentTime: this.currentTime, duration: this.duration, readyState: this.readyState });
          else if (!this.paused && ++attempts < 10) requestAnimationFrame(measure);
        };
        requestAnimationFrame(measure);
      }, () => {});
      return result;
    };
  });
  await page.goto('http://127.0.0.1:8765');
  await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play');
  const feedbackStyle = process.argv.find(arg => arg.startsWith('--style='))?.slice(8);
  if (feedbackStyle || withVoice || process.argv.includes('--sound')) {
    await page.evaluate(() => {
      MahjongTableLayout.showTool('feedback');
      MahjongTableLayout.showWorkshop('settings');
    });
  }
  if (feedbackStyle) {
    assert.ok(['jade','ink','neon','off'].includes(feedbackStyle), 'known feedback style');
    await page.locator('#effectStyle').selectOption(feedbackStyle);
  }
  if (withVoice) {
    await page.evaluate(() => {
      window.auditVoiceEvents = [];
      window.addEventListener('mahjong-voice-status', event => auditVoiceEvents.push({...event.detail}));
    });
    await page.locator('#voiceAnnouncements').check();
  }
  if (process.argv.includes('--sound') || withVoice) await page.locator('#soundBtn').click();
  await page.evaluate(() => MahjongTableLayout.showTool('table'));
  await page.evaluate(() => {
    cancelGameTimers();
    window.auditFixture = spec => {
      cancelGameTimers(); S = null; startNewHand(true); cancelGameTimers();
      hideReactionPanel();
      const pool = generateTiles();
      const take = key => {
        const index = pool.findIndex(t => tileKey(t) === key);
        if (index < 0) throw new Error('Missing physical tile ' + key);
        return pool.splice(index, 1)[0];
      };
      const takeHand = text => text ? text.split(' ').map(take) : [];
      S.players.forEach(p => Object.assign(p, { hand: [], melds: [], flowers: [], discards: [], points: 100000, draws:3, passedHu:false, passedPong:[], lastDiscardKey:null, discardBan:[],
        declaredListen: false, tingLocked: false, autoMode: false, rinshan: false,
        drawnTile: null, waitKeys: [], tianTing: false, diTing: false }));
      for (const [pid, hand] of Object.entries(spec.hands || { 0: spec.hand })) S.players[pid].hand = takeHand(hand);
      for (const [pid, melds] of Object.entries(spec.melds || {})) {
        S.players[pid].melds = melds.map(m => ({ ...m, tiles: takeHand(m.tiles) }));
      }
      for (const [pid, flowers] of Object.entries(spec.flowers || {})) S.players[pid].flowers = takeHand(flowers);
      const discardTile = spec.discard ? take(spec.discard) : null;
      const replacements = (spec.replacements || (spec.replacement ? [spec.replacement] : [])).map(take);
      const nextDraw = spec.nextDraw ? take(spec.nextDraw) : null;
      // Fill opponents from the remaining real deck, never fabricate fifth copies.
      let seed = 29;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      S.players.forEach((p, pid) => {
        const size = 16 - p.melds.length * 3;
        if (!p.hand.length) for(let n=0;n<size;n++) p.hand.push(pool.splice(pool.findIndex(t=>t.suit!=='H'),1)[0]);
      });
      if (discardTile) S.players[spec.from ?? 2].hand.push(discardTile);
      S.deadWall = pool.splice(0, 16 - replacements.length);
      S.deadWall.push(...replacements.reverse());
      S.wall = pool;
      if (nextDraw) S.wall.push(nextDraw);
      S.remain = S.wall.length;
      Object.assign(S, { phase: 'play', turn: spec.discard ? spec.from ?? 2 : spec.turn ?? 0,
        dealer: spec.dealer ?? 0, round: 1, dealerStreak: spec.streak ?? 0, drawCount: 12,
        lastDiscard: null, lastPlayed: null, waitReact: null, currentReactions: null,
        winner: null, fromPlayer: null, winTile: null, resultDetail: null,
        robKong: false, pendingKong: null, lastAction: 'draw', lastActor: spec.turn ?? 0,
        anyOpenMeld: S.players.some(p => p.melds.some(m => !m.concealed)), kongCount: S.players.reduce((n,p)=>n+countKongs(p),0) });
      seatNames = ['東', '西', '北', '南'];
      RULES.points.base = 2000; RULES.points.perFan = 1000;
      renderAll();
      if (discardTile) discard(spec.from ?? 2, discardTile);
    };
    window.auditPhysical = () => {
      const physical = [...S.wall, ...S.deadWall, ...S.players.flatMap(p => [...p.hand, ...p.flowers, ...p.discards, ...p.melds.flatMap(m => m.tiles)])];
      if (S.lastDiscard && !physical.some(t => t.id === S.lastDiscard.tile.id)) physical.push(S.lastDiscard.tile);
      return { count: physical.length, unique: new Set(physical.map(t => t.id)).size, total: S.players.reduce((n,p)=>n+p.points,0) };
    };
  });
  async function fixture(spec) { await page.evaluate(spec => auditFixture(spec), spec); }
  async function check(name, fn) {
    try { await fn(); checks.push({ name, passed: true }); console.log('PASS', name); }
    catch (error) { checks.push({ name, passed: false, error: error.message }); console.log('FAIL', name, error.message); }
    finally {
      if (withVoice) await page.waitForTimeout(100);
      await page.evaluate(() => cancelGameTimers());
    }
  }
  async function physical() {
    assert.deepEqual(await page.evaluate(() => auditPhysical()), { count: 144, unique: 144, total: 400000 });
    assert.equal(await page.evaluate(() => S.deadWall.length === 16 && S.players.every(p =>
      p.hand.every(t => t.suit !== 'H') && p.flowers.every(t => t.suit === 'H') &&
      [16-3*p.melds.length,17-3*p.melds.length].includes(p.hand.length))),true,'reserve, flower separation and concealed hand sizes');
  }
  async function click(id) { await page.locator('#' + id).click({ timeout: 4000 }); }
  const loose13 = 'W1 W2 W4 W6 W8 T1 T3 T5 T7 B1 B3 B5 FE';

  await check('chow via tile-choice UI, keeps 144 tiles', async () => {
    await fixture({ hand: 'W1 W2 W4 T3 T5 T7 T9 B1 B3 B5 B7 B9 FE FS FW FN', discard: 'W3' });
    await click('btnChow'); await page.locator('.chowOpt').first().click();
    assert.deepEqual(await page.evaluate(() => [S.turn,S.players[0].hand.length,S.players[0].melds[0].type]),[0,14,'chow']);
    await physical();
  });
  await check('pong via UI, no replacement draw', async () => {
    await fixture({ hand: 'DC DC ' + loose13 + ' FS', discard: 'DC' });
    const wall = await page.evaluate(() => S.wall.length);
    await click('btnPong');
    assert.equal(await page.evaluate(() => S.wall.length),wall);
    assert.equal(await page.evaluate(() => S.players[0].hand.length),14);
    await physical();
  });
  await check('open kong via UI takes exactly one replacement', async () => {
    await fixture({ hand: 'DC DC DC ' + loose13, discard: 'DC', from:1, replacement: 'FS' });
    const wall = await page.evaluate(() => S.wall.length);
    await click('btnKong');
    assert.deepEqual(await page.evaluate(() => [S.players[0].hand.length,S.players[0].melds[0].tiles.length,tileKey(S.players[0].drawnTile),S.wall.length]),[14,4,'FS',wall-1]);
    await physical();
  });
  await check('concealed kong via UI preserves closed state', async () => {
    await fixture({ hand: 'DC DC DC DC ' + loose13, replacement: 'FS' });
    await click('btnKong');
    assert.equal(await page.evaluate(() => S.players[0].melds[0].concealed),true);
    assert.equal(await page.evaluate(() => S.players[0].hand.length),14);
    await physical();
  });
  await check('added kong upgrades existing pong, does not create sixth meld', async () => {
    await fixture({ hand: 'DC ' + loose13, melds: {0:[{type:'pong',tiles:'DC DC DC'}]}, replacement:'FS' });
    await click('btnKong');
    assert.deepEqual(await page.evaluate(() => [S.players[0].melds.length,S.players[0].melds[0].type,S.players[0].melds[0].tiles.length,S.players[0].hand.length]),[1,'kong',4,14]);
    await physical();
  });
  await check('passing a win to pong cannot become self draw', async () => {
    await fixture({ hand: 'W1 W1 W1 T2 T2 T2 B3 B3 W4 W5 W6 T6 T7 T8 DB DB', discard:'B3' });
    await click('btnPong');
    assert.equal(await page.locator('#btnHu').isDisabled(),true);
    await page.locator('#yourHand button:not([disabled])').first().click();
    assert.equal(await page.evaluate(() => S.phase),'play');
    await physical();
  });
  await check('kong replacement win: exact 9 fan and 33000 gain', async () => {
    await fixture({ hand:'DC DC DC DC W1 W2 W3 T1 T2 T3 B1 B2 B3 FE FE FE DB',replacement:'DB' });
    await click('btnKong'); await click('btnHu');
    // Dragon 1, seat wind 1, round wind 1, closed self draw 3, single wait 1, replacement 1, dealer 1 = 9.
    assert.equal(await page.evaluate(() => S.resultDetail.fan),9);
    assert.deepEqual(await page.evaluate(() => S.players.map(p=>p.points)),[133000,89000,89000,89000]);
    assert.ok(await page.evaluate(() => S.resultDetail.categories.includes('槓上開花')));
    await physical();
    await page.waitForSelector('#btnContinueNext');
    await page.screenshot({path:path.join(out,`${prefix}audit-kong-win-${mobile?'mobile':'desktop'}.png`),fullPage:true});
  });
  await check('nondealer self draw charges dealer surcharge exactly once', async () => {
    await fixture({ hand:'W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 T5',dealer:1,streak:2 });
    await click('btnHu');
    assert.equal(await page.evaluate(() => S.resultDetail.fan),4);
    assert.deepEqual(await page.evaluate(() => S.players.map(p=>p.points)),[123000,89000,94000,94000]);
    await physical();
  });
  await check('discard win charges one payment and dealer surcharge once', async () => {
    await fixture({ hand:'W1 W2 W3 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5',discard:'T5',dealer:2,streak:2 });
    await click('btnHu');
    assert.equal(await page.evaluate(() => S.resultDetail.fan),2);
    assert.deepEqual(await page.evaluate(() => S.players.map(p=>p.points)),[109000,100000,91000,100000]);
    await physical();
  });
  await check('human may pass rob-kong and the pending kong resumes', async () => {
    // The fourth W3 completes a sequence in the human hand.
    await fixture({ hands:{0:'W1 W2 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 T5',1:'W3 W7 W8 T2 T4 T6 T8 B2 B4 B6 B8 FE FS FN'},
      melds:{1:[{type:'pong',tiles:'W3 W3 W3'}]},turn:1,replacement:'DB' });
    await page.evaluate(() => stepAI());
    assert.equal(await page.evaluate(() => S.phase),'play','rob-kong must wait for human choice');
    await click('btnPass');
    assert.equal(await page.evaluate(() => S.players[1].melds[0].type),'kong');
    await physical();
  });

  const robSpec = { hands:{0:'W1 W2 W4 W5 W6 T1 T2 T3 B1 B2 B3 B7 B8 B9 T5 T5',1:'W3 W7 W8 T2 T4 T6 T8 B2 B4 B6 B8 FE FS FN'},
    melds:{1:[{type:'pong',tiles:'W3 W3 W3'}]},turn:1,replacement:'DB' };
  await check('rob-kong Hu button settles once, keeps original pong and no replacement', async () => {
    await fixture(robSpec);
    const wall=await page.evaluate(()=>[S.wall.length,S.deadWall.length]);
    await page.evaluate(()=>stepAI());
    await click('btnHu');
    assert.equal(await page.evaluate(()=>S.resultDetail.fan),4);
    assert.deepEqual(await page.evaluate(()=>S.players.map(p=>p.points)),[106000,94000,100000,100000]);
    assert.equal(await page.evaluate(()=>S.players[1].melds[0].type),'pong');
    assert.deepEqual(await page.evaluate(()=>[S.wall.length,S.deadWall.length]),wall);
    assert.ok(await page.evaluate(()=>S.resultDetail.categories.includes('搶槓')));
    await physical();
  });
  await check('rob-kong prioritizes next seat, not numeric player index', async () => {
    await fixture({...robSpec,hands:{...robSpec.hands,2:'W1 W2 T4 T5 T6 T7 T8 T9 B4 B5 B6 B7 B8 B9 FS FS'}});
    await page.evaluate(async()=>{stepAI();await saveGame();await loadGame();});
    await page.waitForFunction(()=>S.phase==='end');
    assert.equal(await page.evaluate(()=>S.winner),2);
    await physical();
  });
  await check('pending rob-kong survives save/load and can still be passed', async () => {
    await fixture(robSpec);
    await page.evaluate(async()=>{stepAI();await saveGame();await loadGame();});
    await click('btnPass');
    assert.equal(await page.evaluate(()=>S.players[1].melds[0].type),'kong');
    await physical();
  });
  await check('open-kong replacement cannot self draw and must discard', async () => {
    await fixture({hand:'DC DC DC W1 W2 W3 T1 T2 T3 B1 B2 B3 FE FE FE DB',discard:'DC',from:1,replacement:'DB'});
    await click('btnKong');
    assert.equal(await page.locator('#btnHu').isDisabled(),true);
    await page.locator('#yourHand button:not([disabled])').first().click();
    assert.equal(await page.evaluate(()=>S.players[0].hand.length),13);
    await physical();
  });
  await check('ready player can choose concealed kong, then auto play resumes', async () => {
    await fixture({hand:'W1 W1 W1 W2 W3 W4 T1 T2 T3 B1 B2 B3 FE FE FE DB',nextDraw:'W1',replacement:'T9'});
    await page.evaluate(()=>{
      Object.assign(S.players[0],{declaredListen:true,tingLocked:true,autoMode:true,waitKeys:['DB']});
      stepNext();
    });
    assert.equal(await page.locator('#btnKong').isEnabled(),true);
    assert.equal(await page.locator('#yourHand button.tile').count(),17);
    await click('btnKong');
    assert.equal(await page.evaluate(()=>S.players[0].melds[0].concealed),true);
    await page.waitForFunction(()=>S.turn!==0 || !!S.waitReact || S.phase==='end');
    assert.equal(await page.evaluate(()=>S.players[0].hand.length),13);
    await physical();
  });
  await check('ready player added kong retains waits and resumes automatic discard', async () => {
    await fixture({hand:'W1 W2 W3 W4 T1 T2 T3 B1 B2 B3 FE FE FE DB',melds:{0:[{type:'pong',tiles:'W1 W1 W1'}]},replacement:'T9'});
    await page.evaluate(()=>{
      Object.assign(S.players[0],{declaredListen:true,tingLocked:true,autoMode:true,waitKeys:['DB'],drawnTile:S.players[0].hand[0]});
      stepNext();
    });
    await click('btnKong');
    assert.equal(await page.evaluate(()=>S.players[0].melds[0].type),'kong');
    await page.waitForFunction(()=>S.turn!==0 || !!S.waitReact || S.phase==='end');
    assert.equal(await page.evaluate(()=>S.players[0].hand.length),13);
    assert.deepEqual(await page.evaluate(()=>S.players[0].waitKeys),['DB']);
    await physical();
  });

  await check('flowers draw in a chain, display correct images and survive save/load', async () => {
    await fixture({hand:'W1 W2 W4 W6 W8 T1 T3 T5 T7 B1 B3 B5 FE FS FW FN',nextDraw:'H1',replacements:['H2','T9'],flowers:{0:'H5',1:'H7'}});
    const voiceStart = withVoice ? await page.evaluate(()=>auditVoicePlayback.length) : 0;
    await page.evaluate(()=>stepNext());
    if (withVoice) await page.waitForFunction(start => auditVoicePlayback.slice(start).some(event => event.cue==='flower' && event.currentTime>0), voiceStart);
    await page.evaluate(()=>cancelGameTimers());
    assert.deepEqual(await page.evaluate(()=>S.players[0].flowers.map(tileKey)),['H5','H1','H2']);
    assert.equal(await page.evaluate(()=>tileKey(S.players[0].drawnTile)),'T9');
    assert.equal(await page.locator('#meldArea0 [data-flower]').count(),3);
    await physical();
    await page.evaluate(async()=>{await saveGame();await loadGame();cancelGameTimers();});
    assert.deepEqual(await page.evaluate(()=>S.players[0].flowers.map(tileKey)),['H5','H1','H2']);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.waitForSelector('.action-announcement',{state:'detached'});
    await page.screenshot({path:path.join(out,`${prefix}audit-flowers-${mobile?'mobile':'desktop'}.png`),fullPage:true});
  });
  await check('eight flowers settle automatically as eight tai plus dealer', async () => {
    await fixture({hand:'W1 W2 W4 W6 W8 T1 T3 T5 T7 B1 B3 B5 FE FS FW FN',flowers:{0:'H1 H2 H3 H4 H5 H6 H7'},nextDraw:'H8'});
    await page.evaluate(()=>stepNext());
    assert.equal(await page.evaluate(()=>S.flowerWin.kind),'八仙過海');
    assert.equal(await page.evaluate(()=>S.resultDetail.fan),9);
    assert.deepEqual(await page.evaluate(()=>S.players.map(p=>p.points)),[133000,89000,89000,89000]);
    await physical();
    await page.waitForSelector('#btnContinueNext');
    assert.equal(await page.locator('.result-player [data-flower]').count(),8);
  });
  await check('seventh-owner robs eighth flower and only its revealer pays', async () => {
    await fixture({hand:'W1 W2 W4 W6 W8 T1 T3 T5 T7 B1 B3 B5 FE FS FW FN',flowers:{1:'H1 H2 H3 H4 H5 H6 H7'},nextDraw:'H8'});
    await page.evaluate(()=>stepNext());
    assert.equal(await page.evaluate(()=>S.flowerWin.kind),'七搶一');
    assert.deepEqual(await page.evaluate(()=>S.players.map(p=>p.points)),[89000,111000,100000,100000]);
    await physical();
  });

  for (const kind of ['concealed','added','open']) await check(`${kind} kong chains two flowers without losing tiles or adding duplicate replacement tai`, async () => {
    const waiting='W1 W2 W3 T1 T2 T3 B1 B2 B3 FE FE FE DB';
    const spec={hand:(kind==='concealed'?'DC DC DC DC ':kind==='added'?'DC ':'DC DC DC ')+waiting,
      replacements:['H1','H2','DB'], ...(kind==='added'?{melds:{0:[{type:'pong',tiles:'DC DC DC'}]}}:{}),
      ...(kind==='open'?{discard:'DC',from:1}:{})};
    await fixture(spec);
    const wall=await page.evaluate(()=>S.wall.length);
    await click('btnKong');
    assert.deepEqual(await page.evaluate(()=>S.players[0].flowers.map(tileKey)),['H1','H2']);
    assert.equal(await page.evaluate(()=>S.wall.length),wall-3);
    assert.equal(await page.evaluate(()=>tileKey(S.players[0].drawnTile)),'DB');
    if(kind==='open') {
      assert.equal(await page.locator('#btnHu').isDisabled(),true);
      await page.locator('#yourHand button:not([disabled])').first().click();
      assert.equal(await page.evaluate(()=>S.players[0].hand.length),13);
    } else {
      await click('btnHu');
      const fan=kind==='concealed'?10:8;
      assert.equal(await page.evaluate(()=>S.resultDetail.fan),fan);
      assert.equal(await page.evaluate(()=>S.resultDetail.categories.filter(c=>c==='槓上開花').length),1);
      const payment=2000+fan*1000;
      assert.deepEqual(await page.evaluate(()=>S.players.map(p=>p.points)),[100000+3*payment,100000-payment,100000-payment,100000-payment]);
    }
    await physical();
  });
  for (const [flowers,fan] of [['H3 H7',2],['H1 H2 H3 H4 H7',3],['H1 H5',0]]) await check(`flower discard-win scoring ${flowers}: exactly ${fan} tai and one payer`,async()=>{
    await fixture({hand:'W1 W2 W3 W4 W5 W6 T1 T2 T3 B4 B5 B7 B7',melds:{0:[{type:'pong',tiles:'T9 T9 T9'}]},flowers:{0:flowers},dealer:1,discard:'B6',from:2});
    await click('btnHu');
    assert.equal(await page.evaluate(()=>S.resultDetail.fan),fan);
    const payment=2000+fan*1000;
    assert.deepEqual(await page.evaluate(()=>S.players.map(p=>p.points)),[100000+payment,100000,100000-payment,100000]);
    await physical();
  });
  await check('last drawable flower ends a draw without consuming the sixteen-tile reserve',async()=>{
    await fixture({hand:'W1 W2 W4 W6 W8 T1 T3 T5 T7 B1 B3 B5 FE FS FW FN',nextDraw:'H1'});
    const reserve=await page.evaluate(()=>{
      const removed=S.wall.splice(0,S.wall.length-1);
      let flowerSeat=1;
      for(const t of removed) {if(t.suit==='H') {S.players[flowerSeat].flowers.push(t);flowerSeat=flowerSeat%3+1;} else S.players[1].discards.push(t);}
      S.remain=1;return S.deadWall.map(t=>t.id);
    });
    await page.evaluate(()=>stepNext());
    assert.deepEqual(await page.evaluate(()=>[S.phase,S.winner,S.players[0].flowers.map(tileKey)]),['end',null,['H1']]);
    assert.deepEqual(await page.evaluate(()=>S.deadWall.map(t=>t.id)),reserve);
    await physical();
    await page.waitForSelector('#btnContinueNext');
    await click('btnContinueNext');
    if (feedbackStyle !== 'off') assert.equal(await page.evaluate(()=>S.phase),'deal');
    await page.waitForFunction(() => S.phase === 'play');
    assert.equal(await page.evaluate(()=>S.phase),'play');
    await page.evaluate(()=>cancelGameTimers());
    await physical();
  });

  // Real DOM clicks for complete seeded games; scheduled waits are shortened.
  await page.evaluate(() => {
    cancelGameTimers();
    const schedule = scheduleGame;
    scheduleGame = (fn, delay) => schedule(fn, Math.min(delay, 30));
    window.auditEvents = [];
    for (const name of ['receiveTile','doChow','doPong','doKong','doConcealedKong','doAddedKong','doWin']) {
      const original = window[name];
      window[name] = (...args) => { auditEvents.push({action:name,pid:args[0],...(name==='receiveTile'?{tile:args[1]?tileKey(args[1]):null}:{})}); return original(...args); };
    }
  });
  for (const seed of process.argv.includes('--controlled') ? [] : seeds) {
    await page.evaluate(seed => {
      Math.random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; };
      cancelGameTimers(); S=null; startNewHand(true); auditEvents.length=0;
    },seed);
    await page.waitForFunction(() => S.phase === 'play' || S.phase === 'end');
    let steps=0;
    for (;steps<1200;steps++) {
      const action=await page.evaluate(()=>{
        if(S.phase==='end') return {end:true};
        if(S.waitReact && S.currentReactions) {
          const choice=['hu','kong','pong','chow'].find(type=>S.currentReactions.some(r=>r.type===type));
          return {button:{hu:'btnHu',kong:'btnKong',pong:'btnPong',chow:'btnChow'}[choice] || 'btnPass'};
        }
        if(S.turn===0 && !S.waitReact && S.players[0].hand.length===17-S.players[0].melds.length*3) {
          if(!document.getElementById('btnHu').disabled) return {button:'btnHu'};
          if(!document.getElementById('btnKong').disabled) return {button:'btnKong'};
          const tile=aiChooseDiscard(0);
          return {index:S.players[0].hand.indexOf(tile)};
        }
        return {};
      });
      if(action.end) break;
      if(action.button) {
        await click(action.button);
        if(action.button==='btnChow' && await page.locator('.chowOpt:visible').count()) await page.locator('.chowOpt:visible').first().click({timeout:4000});
      } else if(action.index!==undefined) {
        await page.locator(`#yourHand button[onclick="onClickYourTile(${action.index})"]`).click({timeout:4000});
      } else await page.waitForTimeout(40);
      await physical();
    }
    assert.ok(steps<1200,`seed ${seed} stalled`);
    const result=await page.evaluate(()=>({winner:S.winner,fan:S.resultDetail?.fan??null,points:S.players.map(p=>p.points),categories:S.resultDetail?.categories??[],flowers:S.players.map(p=>p.flowers.map(tileKey)),events:auditEvents.slice()}));
    games.push({seed,steps,...result});
    console.log('GAME',seed,result.winner===null?'draw':'winner '+result.winner,'fan',result.fan,'actions',result.events.length);
    await page.waitForSelector('#btnContinueNext');
    await page.screenshot({path:path.join(out,`${prefix}audit-game-${seed}.png`),fullPage:true});
    await click('btnContinueNext');
    await page.waitForFunction(() => S.phase === 'play' || S.phase === 'end');
    await page.evaluate(()=>cancelGameTimers());
  }
  assert.deepEqual(errors,[]);
  const feedback = await page.evaluate(() => ({audio:window.MahjongAudio?.getState(),effects:window.MahjongEffects?.getState(),
    voice:window.MahjongVoice?.getState(), voiceEvents:window.auditVoiceEvents || [], voicePlayback:window.auditVoicePlayback || []}));
  if (process.argv.includes('--sound') || withVoice) {
    assert.equal(feedback.audio.enabled,true);
    assert.deepEqual(feedback.audio.failedCues,[]);
    assert.ok(feedback.audio.lastPlayed, 'an actual local sample started');
  }
  if (withVoice) {
    assert.equal(feedback.voice.enabled, true);
    assert.deepEqual(feedback.voice.failedCues, []);
    assert.ok(feedback.voiceEvents.some(event=>event.type==='started' && event.cue.startsWith('tile-')), 'actual discard voice started');
    assert.ok(feedback.voicePlayback.some(event=>event.cue.startsWith('tile-') && event.currentTime>0), 'actual discard voice playback time advanced');
    for (const cue of ['chow','pong','kong','concealed-kong','win','self-draw','flower','draw-game']) {
      assert.ok(feedback.voiceEvents.some(event=>event.type==='started' && event.cue===cue), `actual ${cue} voice started in gameplay`);
      assert.ok(feedback.voicePlayback.some(event=>event.cue===cue && event.currentTime>0), `actual ${cue} voice playback time advanced`);
    }
  }
  fs.writeFileSync(path.join(out,prefix+(mobile?'gameplay-audit-mobile.json':'gameplay-audit.json')),JSON.stringify({passed:checks.every(c=>c.passed),checks,games,errors,feedback},null,2));
  await browser.close();
  assert.ok(checks.every(c=>c.passed),'some controlled gameplay checks failed; see artifacts/gameplay-audit.json');
})().catch(error=>{console.error(error);process.exit(1);});

