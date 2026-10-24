const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enterGame } = require('./start-screen-helper.cjs');
const out=path.join(__dirname,'../artifacts');
const report={checks:[],errors:[],mobile:'Chromium viewport emulation only; no physical device'};
function check(value,label){assert.ok(value,label);report.checks.push(label);}
async function stop(page){await page.evaluate(()=>cancelGameTimers());}
async function home(page){
  await page.locator('#tableMenuBtn').click();
  await page.locator('#returnHomeBtn').click();
  await page.waitForFunction(()=>MahjongStartScreen.state==='home');
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    for(const viewport of [{width:1440,height:900},{width:320,height:568},{width:568,height:320}]) {
      const context=await browser.newContext({viewport});
      const page=await context.newPage();
      page.on('pageerror',error=>report.errors.push(error.message));
      page.on('dialog',dialog=>dialog.accept());
      await page.goto(process.env.MAHJONG_URL||'http://127.0.0.1:8765');
      await page.waitForFunction(()=>MahjongStartScreen?.state==='home');
      await page.waitForTimeout(200);
      check(await page.evaluate(()=>S===null&&gameTimers.size===0&&!MahjongOpening.getState().active),`${viewport.width}: homepage idle`);
      await enterGame(page);
      await stop(page);
      await page.evaluate(()=>saveGame());
      await home(page);
      const normalSave=await page.evaluate(async()=>JSON.stringify(await loadAutoSave('normal')));
      check(!!normalSave,`${viewport.width}: normal saved on return`);
      await page.locator('#startGameBtn').click();
      await page.evaluate(()=>{window.dealCalls=0;const original=startNewHand;startNewHand=(...args)=>{dealCalls++;return original(...args);};});
      await page.locator('#cultivationModeBtn').evaluate(button=>{button.click();button.click();});
      await page.waitForFunction(()=>S?.cultivation&&S.phase==='deal');
      check(await page.evaluate(()=>dealCalls===1),`${viewport.width}: repeated cultivation start deals once`);
      check(await page.evaluate(()=>{const t=document.getElementById('playersGrid');const a=document.querySelector('.opening-overlay').getBoundingClientRect();return Math.abs(t.clientWidth-a.width)<1&&Math.abs(t.clientHeight-a.height)<1;}),`${viewport.width}: opening aligned with visible cultivation table`);
      await page.evaluate(()=>MahjongOpening.finish('flow-test'));
      await page.waitForFunction(()=>S.phase==='play');
      await stop(page);
      await page.evaluate(()=>{
        const pool=generateTiles();
        const take=key=>pool.splice(pool.findIndex(t=>tileKey(t)===key),1)[0];
        const hand=text=>text.split(' ').map(take);
        for(const p of S.players)Object.assign(p,{hand:[],melds:[],flowers:[],discards:[],passedHu:false,passedPong:[],discardBan:[],drawnTile:null,declaredListen:false,tingLocked:false,tianTing:false,diTing:false,rinshan:false});
        S.players[0].hand=hand('DC DC W1 W3 W5 W7 T1 T3 T5 T7 T9 B2 B4 B6 B8 FN');
        S.players[2].hand=hand('DC W2 W4 W6 W8 T1 T2 T4 T6 T8 B1 B3 B5 B7 FE FS DF');
        for(const pid of [1,3]) {
          const keys=pool.filter(t=>t.suit!=='H').filter((_,i)=>i%2===0).slice(0,16).map(tileKey);
          S.players[pid].hand=keys.map(take);S.players[pid].passedHu=true;
        }
        S.deadWall=pool.splice(-16);S.wall=pool;S.remain=pool.length;
        S.turn=2;S.lastAction='draw';S.lastActor=2;S.lastDiscard=null;S.waitReact=null;S.currentReactions=null;
        S.cultivation=MahjongCultivationCombat.create(400);
        S.cultivation.discardCount=3;
        discard(2,S.players[2].hand[0]);cancelGameTimers();
      });
      check(await page.evaluate(()=>S.waitReact.some(r=>r.pid===0&&r.type==='pong')&&S.cultivation.discardCount===4&&!S.cultivation.log.some(e=>e.type==='enemy')),`${viewport.width}: fourth discard waits on claim`);
      await page.evaluate(()=>saveGame());
      const pending=await page.evaluate(()=>JSON.stringify(S.cultivation));
      await home(page);
      check(await page.locator('#continueGameBtn').isVisible()&&await page.locator('#continueCultivationBtn').isVisible(),`${viewport.width}: dual continue buttons`);
      check(await page.evaluate(()=>{const p=document.getElementById('startScreen');return p.scrollWidth<=p.clientWidth+1;}),`${viewport.width}: dual-save homepage no horizontal scroll`);
      await page.screenshot({path:path.join(out,`cultivation-dual-home-${viewport.width}x${viewport.height}.png`)});
      check(await page.evaluate(async snapshot=>JSON.stringify(await loadAutoSave('normal'))===snapshot,normalSave),`${viewport.width}: cultivation does not replace normal autosave`);
      await page.locator('#continueCultivationBtn').click();
      check(await page.evaluate(()=>!MahjongOpening.getState().active),`${viewport.width}: resume skips shuffle`);
      check(await page.evaluate(snapshot=>JSON.stringify(S.cultivation)===snapshot,pending),`${viewport.width}: pending resume no combat replay`);
      await page.locator('#btnPong').click();
      await stop(page);
      check(await page.evaluate(()=>S.players[0].melds[0].type==='pong'&&S.cultivation.log.filter(e=>e.type==='enemy').length===1),`${viewport.width}: resumed claim then one monster attack`);
      await page.evaluate(()=>loadGame());await stop(page);
      check(await page.evaluate(snapshot=>JSON.stringify(S.cultivation)===snapshot,pending),`${viewport.width}: cultivation manual restore retains pending action`);
      await home(page);
      await page.locator('#continueGameBtn').click();await stop(page);
      check(await page.evaluate(()=>!S.cultivation&&!document.documentElement.classList.contains('cultivation-mode')&&!document.getElementById('cultivationMonster')),`${viewport.width}: normal resume clears battle HUD`);
      await page.evaluate(()=>loadGame());await stop(page);
      check(await page.evaluate(()=>!S.cultivation),`${viewport.width}: normal manual save stays normal`);
      await home(page);
      await page.evaluate(async()=>{
        const saved=await loadAutoSave('cultivation');saved.gameState.cultivation.rng=0;
        const db=await initDB();await new Promise((resolve,reject)=>{const tx=db.transaction([STORE_NAME],'readwrite');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.objectStore(STORE_NAME).put(saved,CULTIVATION_AUTO_SAVE_KEY);});db.close();
        await MahjongStartScreen.showHome();
      });
      await page.locator('#continueCultivationBtn').click();
      check(await page.evaluate(()=>S===null&&MahjongStartScreen.state==='home'&&document.getElementById('startStatus').textContent.includes('無法恢復')),`${viewport.width}: invalid battle save stays home`);
      await context.close();
    }
    assert.deepEqual(report.errors,[]);
    report.passed=true;
    fs.writeFileSync(path.join(out,'cultivation-flow-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({passed:true,checks:report.checks.length,viewports:3,errors:report.errors}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
