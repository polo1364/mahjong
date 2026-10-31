const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.join(__dirname, '../artifacts');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(process.env.MAHJONG_URL || 'http://127.0.0.1:8765');
  await require('./start-screen-helper.cjs').enterGame(page);
  await page.waitForFunction(() => typeof S !== 'undefined' && S?.phase === 'play');
  await page.screenshot({ path: path.join(out, process.argv.includes('--baseline') ? 'before-desktop.png' : 'desktop.png'), fullPage: true });
  if (process.argv.includes('--baseline')) {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: path.join(out, 'before-mobile.png'), fullPage: true });
    await browser.close();
    return;
  }
  await page.evaluate(() => { cancelGameTimers(); S.turn = 0; stepNext(); });
  const before = await page.evaluate(() => S.players[0].hand.length);
  await page.locator('#yourHand button.tile').first().click();
  assert.equal(await page.evaluate(() => S.players[0].hand.length), before - 1);
  await page.evaluate(() => cancelGameTimers());
  if (await page.locator('#tableMenu').isHidden()) await page.locator('#tableMenuBtn').click();
  await page.locator('#tmTab-session').click();
  await page.locator('#settingsBtn').click();
  await page.locator('#baseScorePreset').selectOption('custom');
  await page.locator('#baseScoreCustom').fill('');
  await page.locator('#settingsConfirm').click();
  assert.equal(await page.locator('#settingsPanel').isVisible(), true);
  assert.ok(await page.locator('#settingsError').textContent());
  await page.locator('#baseScoreCustom').fill('2500');
  await page.locator('#settingsConfirm').click();
  assert.equal(await page.evaluate(() => RULES.points.base), 2500);
  await page.waitForFunction(() => S.phase === 'play');
  await page.evaluate(() => { cancelGameTimers(); S.turn = 0; stepNext(); });
  await page.evaluate(() => saveGame());
  const saved = await page.evaluate(() => S.players[0].hand.map(t => t.id));
  await page.evaluate(() => { S.players[0].hand.reverse(); });
  assert.equal(await page.evaluate(() => loadGame()), true);
  assert.deepEqual(await page.evaluate(() => S.players[0].hand.map(t => t.id)), saved);
  for (const [width, height] of [[1440,1000], [1280,720], [1024,768], [844,390], [740,360]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `page overflow at ${width}`);
    await page.locator('#yourHand').scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(180);
    const handLayout = await page.locator('#yourHand button.tile').evaluateAll(els => {
      const boxes = els.map(el => el.getBoundingClientRect());
      return { rows: new Set(boxes.map(r => Math.round(r.top))).size,
        readable: boxes.every(r => r.width >= (innerHeight <= 400 ? 24 : 32) && r.height >= (innerHeight <= 400 ? 34 : 44) && Math.abs(r.width / r.height - 5 / 7) < .02) };
    });
    assert.equal(handLayout.rows, 1, `concealed hand remains one row at ${width}`);
    assert.ok(handLayout.readable, `tile size and ratio at ${width}`);
    for (const tile of await page.locator('#yourHand button.tile').all()) {
      await tile.scrollIntoViewIfNeeded();
      assert.equal(await tile.evaluate(el => {
        const r = el.getBoundingClientRect(), rail = document.getElementById('yourHandArea').getBoundingClientRect();
        return r.left >= rail.left - 1 && r.right <= rail.right + 1 && r.left >= 0 && r.right <= innerWidth;
      }), true, `every tile can scroll fully into view at ${width}`);
    }
    await page.evaluate(() => document.getElementById('yourHandArea').scrollLeft = 0);
    await page.evaluate(() => window.scrollTo(0,0));
    await page.screenshot({ path: path.join(out, `viewport-${width}x${height}.png`), fullPage: true });
    if (await page.locator('#tableMenu').isHidden()) await page.locator('#tableMenuBtn').click();
  await page.locator('#tmTab-session').click();
  await page.locator('#settingsBtn').click();
    await page.locator('#settingsCancel').scrollIntoViewIfNeeded();
    await page.locator('#settingsCancel').click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Run the real render and event handlers through complete games, with only delays shortened.
  const games = await page.evaluate(async () => {
    const originalSchedule = scheduleGame;
    scheduleGame = (fn, delay) => originalSchedule(fn, Math.min(delay, 5));
    const results=[];
    for(let round=0; round<3; round++) {
      cancelGameTimers(); S=null; startNewHand(true);
      const openingStarted = performance.now();
      while (S.phase === 'deal') {
        if (performance.now() - openingStarted > 15000) throw new Error('Opening did not finish');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      for(let step=0;step<1500;step++) {
        if(S.phase==='end') { results.push({winner:S.winner,total:S.players.reduce((n,p)=>n+p.points,0)}); break; }
        if(S.waitReact?.some(r=>r.pid===0) && S.currentReactions) {
          const button = S.currentReactions.some(r=>r.type==='hu') ? 'btnHu' : S.currentReactions.some(r=>r.type==='pong') ? 'btnPong' : S.currentReactions.some(r=>r.type==='chow') ? 'btnChow' : 'btnPass';
          document.getElementById(button).click();
          document.querySelector('.chowOpt')?.click();
        } else if(S.turn===0 && !S.waitReact) {
          const me=S.players[0];
          if (me.hand.length===17-me.melds.length*3) {
            if(!document.getElementById('btnHu').disabled) document.getElementById('btnHu').click();
            else onClickYourTile(me.hand.indexOf(aiChooseDiscard(0)));
          }
        }
        await new Promise(resolve=>setTimeout(resolve,10));
      }
    }
    scheduleGame=originalSchedule;
    return results;
  });
  assert.equal(games.length,3, 'three browser games finish');
  assert.ok(games.every(g=>g.total===400000), 'zero-sum settlement');
  await page.waitForFunction(() => document.getElementById('reactionPanel').style.display === 'block');
  await page.screenshot({path:path.join(out,'settlement-desktop.png'),fullPage:true});
  await page.setViewportSize({width:844,height:390});
  await page.screenshot({path:path.join(out,'settlement-mobile.png'),fullPage:true});
  await page.locator('#btnContinueNext').click();
  assert.equal(await page.evaluate(()=>S.phase),'deal');
  await page.waitForFunction(() => S.phase === 'play');
  assert.equal(await page.evaluate(()=>S.phase),'play');
  // Restoring an AI turn must progress; restoring a human response must expose actions.
  const aiSnapshot = await page.evaluate(async()=>{
    cancelGameTimers(); S=null; startNewHand(true);
    window.MahjongOpening.finish('test');
    await Promise.resolve();
    cancelGameTimers();
    for(let attempt=0;S.turn===0 && attempt<20;attempt++) {
      startNewHand(true);
      window.MahjongOpening.finish('test');
      await Promise.resolve();
      cancelGameTimers();
    }
    if(S.turn===0) throw new Error('Unable to initialize an AI dealer');
    await saveGame();
    await loadGame();
    return JSON.stringify(S.players.map(p=>p.discards.map(t=>t.id)));
  });
  assert.equal(await page.evaluate(()=>gameTimers.size>0),true);
  await page.waitForFunction(before=>JSON.stringify(S.players.map(p=>p.discards.map(t=>t.id)))!==before || S.phase==='end' || !!S.lastDiscard, aiSnapshot, {timeout:8000});
  await page.evaluate(()=>cancelGameTimers());
  for (const selfDraw of [true,false]) {
    await page.evaluate(selfDraw=>{
      cancelGameTimers(); S=null; startNewHand(true); cancelGameTimers();
      const pool=generateTiles();
      const take=key=>pool.splice(pool.findIndex(t=>tileKey(t)===key),1)[0];
      const winning='W1 W1 W1 W2 W2 W2 T3 T3 T3 B4 B4 B4 FE FE FE DC DC'.split(' ').map(take);
      const winningTile=winning.pop();
      S.players.forEach(p=>{p.hand=[];p.melds=[];p.flowers=[];p.discards=[];p.draws=3;p.passedHu=false;p.passedPong=[];p.discardBan=[];p.lastDiscardKey=null;p.points=100000;p.declaredListen=false;p.tingLocked=false;p.autoMode=false;p.rinshan=false;p.waitKeys=[];});
      S.players[0].hand=selfDraw ? [...winning,winningTile]:winning;
      for(let i=1;i<4;i++) S.players[i].hand=pool.splice(0,16);
      if(!selfDraw) S.players[2].hand.push(winningTile);
      S.deadWall=pool.splice(0,16); S.wall=pool;
      S.phase='play'; S.turn=selfDraw?0:2; S.dealer=0; S.lastDiscard=null; S.waitReact=null; S.currentReactions=null; S.lastAction=selfDraw?'draw':null;
      S.drawCount=12; S.dealerStreak=0; S.robKong=false;
      renderAll();
      if(!selfDraw) discard(2,winningTile);
    },selfDraw);
    await page.locator('#btnHu').click();
    await page.waitForFunction(()=>document.getElementById('reactionPanel').style.display==='block');
    assert.equal(await page.evaluate(()=>S.winner),0);
    assert.equal(await page.evaluate(()=>S.players.reduce((n,p)=>n+p.points,0)),400000);
    assert.ok((await page.locator('.rs-summary').textContent()).includes('對對胡'));
    await page.screenshot({path:path.join(out,selfDraw?'self-draw-result.png':'discard-win-result.png'),fullPage:true});
    await page.locator('#btnContinueNext').click();
    await page.waitForFunction(() => S.phase === 'play');
    await page.evaluate(()=>cancelGameTimers());
  }
  const offline=await browser.newPage();
  offline.on('dialog',d=>d.dismiss());
  offline.on('pageerror',e=>errors.push(e.message));
  await offline.goto(require('node:url').pathToFileURL(path.join(__dirname,'../index.html')).href);
  await require('./start-screen-helper.cjs').enterGame(offline);
  await offline.waitForFunction(()=>typeof S!=='undefined' && S?.phase==='play');
  assert.ok(await offline.locator('#yourHand .tile-art').count()>=16);
  await offline.close();
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ passed: true, viewportChecks: 6, games, controlledWins: 2, errors }, null, 2));
  console.log('PASS: real browser discard, settings validation, save/load and AI resume, six viewports with 5:7 tiles, three complete games and next hand, offline file launch, no runtime errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
