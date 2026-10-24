// Controlled combat fixtures on a real 144-tile game; lifecycle tests, not legal gameplay evidence.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {enterGame}=require('./start-screen-helper.cjs');
const report={method:'Browser lifecycle fixtures; isolated storage; separate from 12 legal games',checks:[],errors:[]};
const check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
async function home(page){await page.locator('#tableMenuBtn').click();await page.locator('#returnHomeBtn').click();await page.waitForFunction(()=>MahjongStartScreen.state==='home');}
async function finishOpening(page){await page.evaluate(()=>MahjongOpening.finish('seal-test'));await page.waitForFunction(()=>S.phase==='play');await page.evaluate(()=>cancelGameTimers());}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]) {
   const context=await browser.newContext({viewport});const page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.goto('http://127.0.0.1:8765');await enterGame(page,{mode:'cultivation'});
   await page.evaluate(()=>{
    cancelGameTimers();S.turn=0;S.waitReact=null;S.currentReactions=null;
    S.cultivation=MahjongCultivationCombat.apply(S.cultivation,{id:S.cultivation.seq+1,type:'finish',pid:0,from:2,method:'discard',fan:1,items:[{id:'closed',fan:1}],reason:'hu'}).state;
    S.phase='end';S.winner=0;S.fromPlayer=2;S.resultDetail={fan:1,categories:['門清'],items:[{id:'closed',fan:1}]};showHandsAndContinue();
   });
   await page.evaluate(()=>autoSaveGame());
   const ended=await page.evaluate(()=>JSON.stringify(S.cultivation));
   await page.reload();await page.locator('#continueCultivationBtn').click();
   check(await page.evaluate(s=>JSON.stringify(S.cultivation)===s,ended),`${viewport.width}: pending seals and finisher survive refresh without replay`);
   await page.locator('#btnContinueNext').click();await finishOpening(page);
   const identity=await page.evaluate(()=>({names:S.names,ids:S.cultivation.players.map(p=>p.characterId),seals:S.cultivation.players.map(p=>p.activeSeals),hand:S.cultivation.handNumber}));
   check(identity.hand===2&&identity.seals[2][0].name==='閉脈',`${viewport.width}: pending activates in hand two`);
   await page.evaluate(()=>{S.turn=0;S.waitReact=null;S.currentReactions=null;renderAll();});
   await page.evaluate(()=>saveGame());await page.evaluate(()=>autoSaveGame());
   const active=await page.evaluate(()=>JSON.stringify(S.cultivation));
   await page.reload();await page.locator('#continueCultivationBtn').click();await page.evaluate(()=>cancelGameTimers());
   check(await page.evaluate(s=>JSON.stringify(S.cultivation)===s,active),`${viewport.width}: active save resumes without replay or expiry`);
   await page.evaluate(()=>loadGame());await page.evaluate(()=>cancelGameTimers());
   check(await page.evaluate(s=>JSON.stringify(S.cultivation)===s,active),`${viewport.width}: manual restore retains active seals`);
   await home(page);await page.locator('#startGameBtn').click();await page.locator('#cultivationModeBtn').click();await page.evaluate(()=>cancelGameTimers());
   check(await page.evaluate(s=>JSON.stringify(S.cultivation)===s,active),`${viewport.width}: mode entry resumes existing journey`);
   await page.locator('#tableMenuBtn').click();await page.locator('#newGameBtn').click();await finishOpening(page);
   const restarted=await page.evaluate(()=>({names:S.names,ids:S.cultivation.players.map(p=>p.characterId),seals:S.cultivation.players.map(p=>p.activeSeals),hand:S.cultivation.handNumber}));
   assert.deepEqual(restarted,identity);report.checks.push(`${viewport.width}: confirmed in-game restart preserves identities and seal duration`);
   await page.locator('#tableMenuBtn').click();await page.locator('#settingsBtn').click();await page.locator('#settingsConfirm').click();await finishOpening(page);
   assert.deepEqual(await page.evaluate(()=>({names:S.names,ids:S.cultivation.players.map(p=>p.characterId),seals:S.cultivation.players.map(p=>p.activeSeals),hand:S.cultivation.handNumber})),identity);
   report.checks.push(`${viewport.width}: rules apply/restart preserves identities and seal duration`);
   const geometry=await page.evaluate(()=>{
    const a=document.querySelector('.top-area > .player-info-inline').getBoundingClientRect(),b=document.getElementById('tableMenuBtn').getBoundingClientRect();
    return {a:a.toJSON(),b:b.toJSON(),noOverlap:a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom,noScroll:document.documentElement.scrollWidth<=innerWidth+1};
   });
   await page.screenshot({path:`artifacts/cultivation-seal-active-${viewport.width}.png`});
   check(geometry.noOverlap&&geometry.noScroll,`${viewport.width}: top player info clear of settings and no page horizontal scroll ${JSON.stringify(geometry)}`);
   await home(page);check(await page.locator('#restartCultivationJourneyBtn').isVisible(),`${viewport.width}: explicit fresh journey control visible`);
   await page.locator('#restartCultivationJourneyBtn').click();await finishOpening(page);
   check(await page.evaluate(()=>S.cultivation.handNumber===1&&S.cultivation.players.every(p=>!p.activeSeals.length&&!p.pendingSeals.length)),`${viewport.width}: explicit fresh journey resets seals and hand number`);
   await context.close();
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
 } finally {fs.writeFileSync('artifacts/cultivation-seal-flow-report.json',JSON.stringify(report,null,2));await browser.close();}
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
