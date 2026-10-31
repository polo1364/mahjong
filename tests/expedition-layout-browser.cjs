// Real preparation dialog; explicit event/resources fixtures exercise layout, not balance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium, webkit} = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts');
const report = {passed:false, checks:[], errors:[], boundary:'Isolated browser fixtures for all 20 events; no physical phone.'};
const record = (label, data={}) => {report.checks.push({label,...data});console.log('PASS',label);};
let server;
async function openTab(page) {
  const tab = page.locator('[data-left="expedition"]');
  if (!await tab.isVisible()) await page.locator('.prep-left-toggle').click();
  await tab.click();
  await page.locator('.expedition-card').waitFor({state:'visible'});
}
async function fixture(page) {
  await page.locator('#startGameBtn').click();
  await page.locator('#cultivationModeBtn').click();
  await page.locator('#journeyChooseConfirm').click();
  await page.locator('.opening-skip').click({timeout:10000}).catch(()=>{});
  await page.waitForFunction(()=>S?.phase==='play'&&S.cultivation);
  await page.evaluate(()=>{cancelGameTimers();endDraw();});
  await page.waitForFunction(()=>MahjongProgressionFlow.profile?.xp>=12);
  await page.evaluate(async()=>{
    cancelGameTimers();
    const c=S.cultivation,e=c.expedition;
    e.pendingEvent={id:'layout-event',eventId:MahjongCultivationExpedition.events[0].id};
    e.bossUsed=[];c.journey.nextTier='miniboss';c.journey.pendingMinibossId=null;c.journey.retrySpeciesId=null;
    c.players[0].economy.gold=999;
    const db=await initDB();
    await new Promise((resolve,reject)=>{const tx=db.transaction(['gameSaves'],'readwrite');tx.objectStore('gameSaves').put(e,'cultivationExpeditionJourneyV1:'+c.progression.journeyId);tx.oncomplete=resolve;tx.onerror=reject;});db.close();
    showHandsAndContinue();
  });
  await page.locator('#btnContinueNext').click();
  await page.locator('.journey-preparation-screen').waitFor();
  await openTab(page);
}
async function state(page) {
  return page.evaluate(()=>{
    const dialog=document.querySelector('.journey-preparation-screen'),pane=dialog.querySelector('.journey-expedition');
    const r=pane.getBoundingClientRect();
    return {visible:r.width>0&&r.height>0&&getComputedStyle(pane).visibility==='visible',scroll:pane.scrollTop,expanded:String(dialog.dataset.prepPane==='left'||innerWidth>=1100)};
  });
}
async function measure(page) {
  return page.evaluate(()=>{
    const issues=[],pane=document.querySelector('.journey-expedition'),tabs=document.querySelector('.prep-left-tabs');
    const pr=pane.getBoundingClientRect(),tr=tabs.getBoundingClientRect();
    if((pr.top<tr.bottom-1&&pr.left<tr.right-1)||pr.bottom>innerHeight+1||pr.left<0||pr.right>innerWidth+1)issues.push('pane outside usable area');
    if(pane.scrollWidth>pane.clientWidth+1)issues.push('horizontal pane overflow');
    if(document.documentElement.scrollWidth>innerWidth+1)issues.push('horizontal page overflow');
    const controls=[...document.querySelectorAll('#journeyHome,#journeyNext,.prep-left-toggle'),...tabs.querySelectorAll('button'),...pane.querySelectorAll('button')];
    for(const button of controls){
      if(!button.getClientRects().length)continue;
      button.scrollIntoView({block:'nearest'});
      const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      if(!hit||!button.contains(hit))issues.push('covered: '+button.textContent.trim());
      if(button.scrollWidth>button.clientWidth+1||button.scrollHeight>button.clientHeight+1)issues.push('clipped: '+button.textContent.trim());
      if(button.closest('.expedition-card')&&r.height<44)issues.push('small event target');
      const range=document.createRange();range.selectNodeContents(button);
      for(const t of range.getClientRects())if(t.left<r.left-1||t.right>r.right+1||t.top<r.top-1||t.bottom>r.bottom+1)issues.push('text outside button');
    }
    return {issues,controls:controls.length,pane:{width:pr.width,height:pr.height}};
  });
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  server=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p==='/')p='/index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.env.EXPEDITION_LAYOUT_URL||`http://127.0.0.1:${server.address().port}/`;
  for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      const context=await browser.newContext({viewport:{width:844,height:390},serviceWorkers:'block',hasTouch:true});
      const page=await context.newPage();page.on('pageerror',err=>report.errors.push(err.message));
      await page.goto(url);await page.waitForFunction(()=>MahjongStartScreen?.state==='home'&&!document.querySelector('#startGameBtn').disabled);
      await fixture(page);
      await page.locator('[data-tab="loot"]').click();
      await page.locator('#journeyNext').click();
      const prompted=await state(page);
      const eventVisible=await page.locator('.expedition-event h3').evaluate(el=>{const r=el.getBoundingClientRect(),pane=el.closest('.journey-expedition').getBoundingClientRect();return r.top>=pane.top&&r.bottom<=pane.bottom;});
      record(name+' pending event opens at choices',{...prompted,eventVisible});
      if(!process.env.EXPEDITION_LAYOUT_DIAGNOSTIC)assert.ok(prompted.visible&&prompted.expanded==='true'&&eventVisible,'pending event prompt hides choices');
      // A committed choice rebuilds the dialog: keep the mobile panel open and the boss in view.
      await page.locator('[data-expedition-event="leave"]').click();
      await page.waitForFunction(()=>!S.cultivation.expedition.pendingEvent);
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      const afterEvent=await state(page);record(name+' event panel state',afterEvent);
      if(!process.env.EXPEDITION_LAYOUT_DIAGNOSTIC)assert.ok(afterEvent.visible&&afterEvent.expanded==='true','event commit hid panel');
      await openTab(page);
      const boss=page.locator('[data-expedition-boss]').last();await boss.scrollIntoViewIfNeeded();const before=await state(page);
      await boss.click();await page.waitForFunction(()=>!!S.cultivation.expedition.bossChoice);await page.evaluate(()=>new Promise(requestAnimationFrame));
      const afterBoss=await state(page);record(name+' boss panel state',{before,after:afterBoss});
      if(!process.env.EXPEDITION_LAYOUT_DIAGNOSTIC){assert.ok(afterBoss.visible&&afterBoss.expanded==='true','boss commit hid panel');assert.ok(Math.abs(afterBoss.scroll-before.scroll)<2,'boss commit reset scroll');}
      await page.screenshot({path:path.join(out,`expedition-layout-${name}-boss-after.png`)});
      await openTab(page);
      for(const [width,height]of [[568,320],[667,375],[844,390],[942,435],[1440,900]]){
        await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,180)));await openTab(page);
        for(let i=0;i<20;i++){
          await page.evaluate(i=>{
            const c=JSON.parse(JSON.stringify(S.cultivation)),X=MahjongCultivationExpedition;
            c.expedition.pendingEvent={id:'layout-'+i,eventId:X.events[i].id};
            c.expedition.pendingEffect={damage:.1,taken:.05,heal:.1,shield:.1,aggro:.08,basic:.1,active:.08};
            c.players[0].economy.gold=i%2?0:999;
            const profile=X.createProfile();Object.values(profile.regions).forEach(r=>{r.highest=100;r.rare=r.advanced=true;});
            MahjongExpeditionUI.preparation(document.querySelector('.journey-expedition'),c,{expeditionProfile:profile});
          },i);
          const m=await measure(page);assert.deepEqual(m.issues,[],`${name} ${width} event ${i}: ${JSON.stringify(m)}`);
          record(`${name} ${width}x${height} event ${i}`,m);
          if(i===3){await page.locator('[data-expedition-event]').last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`expedition-layout-${name}-${width}-event.png`)});}
        }
      }
      await page.setViewportSize({width:390,height:844});await page.getByText('本遊戲僅支援橫式',{exact:true}).waitFor({state:'visible'});record(name+' portrait reminder');
      await context.close();
    }finally{await browser.close();}
  }
  assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(err=>{report.errors.push(err.stack);console.error(err);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'expedition-layout-report.json'),JSON.stringify(report,null,2));if(server)await new Promise(resolve=>server.close(resolve));});
