const {chromium,webkit}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
let hold=true,fail=false,holdHome=false;const pending=[];
const critical=url=>/assets\/(tiles-crystal\/.*\.webp|cultivation-journey\/(heroes|monsters)\/.*\.webp)/.test(url);
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
 const send=()=>{if(res.destroyed)return;if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}if(fail&&critical(name)){res.writeHead(503).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);};
 if(hold&&(critical(name)||(holdHome&&name==='/assets/start-screen/home.webp')))pending.push(send);else send();
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const reports=[];
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  hold=true;const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:844,height:390},serviceWorkers:'block'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
   await page.locator('#startGameBtn').click();await page.locator('#cultivationModeBtn').click();await page.locator('#journeyChooseConfirm').click();
   await page.waitForFunction(()=>!!S?.cultivation);await page.evaluate(()=>MahjongOpening.finish('test'));
   await page.waitForTimeout(1700);
   const blocked=await page.evaluate(()=>({phase:S.phase,discards:S.players.reduce((n,p)=>n+p.discards.length,0),emptyPortraits:[...document.querySelectorAll('.cult-hero-portrait')].filter(i=>!i.complete||!i.naturalWidth).length,loading:!!window.MahjongImages?.isLoading()}));
   if(baseline)assert.equal(blocked.phase,'play');else {assert.equal(blocked.phase,'deal');assert.equal(blocked.loading,true);assert.equal(blocked.discards,0);}
   hold=false;pending.splice(0).forEach(send=>send());
   await page.waitForFunction(()=>S.phase==='play');await page.evaluate(()=>cancelGameTimers());
   await page.waitForFunction(()=>[...document.querySelectorAll('.cult-hero-portrait')].every(i=>i.complete&&i.naturalWidth));
   await page.screenshot({path:path.join(root,'artifacts/ready-'+name+(baseline?'-before':'-after')+'.png')});
   reports.push({engine:name,blocked,errors});assert.deepEqual(errors,[]);
   if(!baseline){
    await page.evaluate(()=>cancelGameTimers());
    const saved=await page.evaluate(async()=>{await autoSaveGame();return await loadAutoSave('cultivation');});
    const retryContext=await browser.newContext({viewport:{width:844,height:390},serviceWorkers:'block'}),retryPage=await retryContext.newPage();
    fail=true;
    await retryPage.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await retryPage.evaluate(async data=>{const db=await initDB();await new Promise((resolve,reject)=>{const tx=db.transaction([STORE_NAME],'readwrite');tx.objectStore(STORE_NAME).put(data,CULTIVATION_AUTO_SAVE_KEY);tx.oncomplete=resolve;tx.onerror=reject;});db.close();await MahjongStartScreen.showHome();},saved);
    await retryPage.locator('#continueCultivationBtn').click();
    await retryPage.locator('#imageLoading [data-retry]').waitFor({state:'visible'});
    const frozen=await retryPage.evaluate(()=>JSON.stringify(S));await retryPage.waitForTimeout(600);assert.equal(await retryPage.evaluate(()=>JSON.stringify(S)),frozen,'failed images must not advance restored game');
    await retryPage.screenshot({path:path.join(root,'artifacts/ready-'+name+'-retry.png')});
    fail=false;await retryPage.locator('#imageLoading [data-retry]').click();
    await retryPage.waitForFunction(()=>!MahjongImages.isLoading());await retryPage.evaluate(()=>cancelGameTimers());
    assert.equal(await retryPage.locator('#imageLoading').evaluate(d=>d.open),false);
    await retryPage.waitForFunction(()=>[...document.querySelectorAll('.cult-hero-portrait')].every(img=>img.complete&&img.naturalWidth),null,{timeout:3000});
    reports.push({engine:name,restoreFailurePaused:true,retryPassed:true});await retryContext.close();
    if(name==='chromium'){
     hold=true;holdHome=true;const installed=await browser.newContext({viewport:{width:844,height:390}}),installedPage=await installed.newPage();
     await installedPage.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
     await installedPage.waitForFunction(async()=>!!await navigator.serviceWorker.getRegistration());
     assert.equal(await installedPage.evaluate(()=>document.readyState),'interactive','register before images finish and window.load');
     await installedPage.locator('#startGameBtn').click();await installedPage.locator('#normalModeBtn').click();
     await installedPage.evaluate(()=>{window.beforeInstall=S;MahjongOpening.finish('test');});
     hold=false;holdHome=false;pending.splice(0).forEach(send=>send());
     await installedPage.waitForFunction(()=>!!navigator.serviceWorker.controller && !MahjongImages.isLoading());
     assert.equal(await installedPage.evaluate(()=>S===window.beforeInstall),true,'first install does not reload active game');
     reports.push({earlyPwaRegistration:true,firstInstallPreservesGame:true});await installed.close();
    }
   }
   await context.close();
  }finally{hold=false;pending.splice(0).forEach(send=>send());await browser.close();}
 }
 fs.writeFileSync(path.join(root,'artifacts/image-readiness-'+(baseline?'before':'after')+'.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
