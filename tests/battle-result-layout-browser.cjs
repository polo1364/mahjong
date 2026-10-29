// Real UI in fresh browsers. Named stress fixtures are display-only, not combat balance tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts');
const report={passed:false,checks:[],errors:[],boundary:'Actual new hand/draw plus explicit long counters, status and result fixtures; no physical phone.'};
let server;
function check(label,issues=[],extra={}){report.checks.push({label,issues,...extra});console.log(issues.length?'ISSUE':'PASS',label,JSON.stringify(issues));}
async function frame(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function shot(page,name){await page.screenshot({path:path.join(out,'battle-result-'+name+'.png')});}
async function controls(page,selector){return page.locator(selector).evaluate(host=>{
  const issues=[];
  for(const el of host.querySelectorAll('button,[role="button"]')){
    if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
    for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement)if(/auto|scroll/.test(getComputedStyle(p).overflowY)){const r=el.getBoundingClientRect(),b=p.getBoundingClientRect();if(r.bottom>b.bottom)p.scrollTop+=r.bottom-b.bottom+4;if(r.top<b.top)p.scrollTop-=b.top-r.top+4;}
    const r=el.getBoundingClientRect(),text=el.getAttribute('aria-label')||el.textContent.trim().slice(0,60),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    if(!el.contains(hit))issues.push('covered '+text);
    if(r.x<0||r.right>innerWidth+1||r.y<0||r.bottom>innerHeight+1)issues.push('outside '+text);
    for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const b=p.getBoundingClientRect(),css=getComputedStyle(p);if(/hidden|auto|scroll/.test(css.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))issues.push('clipped '+text);}
  }
  return [...new Set(issues)];
});}
async function battle(page,label){
  const result=await page.evaluate(()=>{
    const issues=[],box=sel=>document.querySelector(sel)?.getBoundingClientRect(),overlap=(a,b)=>a&&b&&a.width&&b.width&&a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
    // Compare visible content, not empty padding in the hand or monster containers.
    for(const node of document.querySelectorAll('.cult-monster-top,.cult-boss-hp,.cult-boss-tags,.cult-boss-intent,.cult-boss-turn'))for(const tile of document.querySelectorAll('#yourHand button,#handBack1 .tile-back'))if(overlap(node.getBoundingClientRect(),tile.getBoundingClientRect()))issues.push('monster content overlaps hand tile: '+node.className+' / '+tile.parentElement.id);
    for(const tile of document.querySelectorAll('#yourHand button')){const r=tile.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!tile.contains(hit))issues.push('hand tile covered');if(r.x<0||r.right>innerWidth+1||r.bottom>innerHeight+1)issues.push('hand outside');}
    for(const node of document.querySelectorAll('#playerInfo0 .seat-name,#playerInfo1 .seat-name,#playerInfo2 .seat-name,#playerInfo3 .seat-name,.cult-monster-lookup,.cult-expedition-title')){const r=node.getBoundingClientRect();if(!r.width||r.x<0||r.right>innerWidth+1||r.y<0||r.bottom>innerHeight+1)issues.push('HUD outside '+node.textContent);}
    return {issues:[...new Set(issues)],tiles:document.querySelectorAll('#yourHand button').length,monster:box('#cultivationMonster').toJSON(),top:box('.cult-monster-top').toJSON(),topHand:box('#handBack1 .tile-back').toJSON()};
  });check(label+' table',result.issues,result);await shot(page,label+'-table');
  await page.locator('.cult-feed-toggle').click();await frame(page);
  const feed=await page.locator('.cult-feed-body').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));
  const feedIssues=await page.locator('.cult-feed-body').evaluate(el=>{
    const issues=[],r=el.getBoundingClientRect();if(r.bottom>innerHeight+1)issues.push('feed outside viewport');if(el.scrollWidth>el.clientWidth+1)issues.push('horizontal feed overflow');
    if(innerWidth<900||innerHeight<600){
      for(const row of el.querySelectorAll('.cft-row')){const cells=[...row.children];for(let i=1;i<cells.length;i++)if(cells[i-1].getBoundingClientRect().right>cells[i].getBoundingClientRect().left+1)issues.push('battle counters overlap');}
      for(const p of el.querySelectorAll('#cultivationStatusReference p'))if(p.scrollHeight>p.clientHeight+1)issues.push('status text clipped');
      el.scrollTop=el.scrollHeight;const last=el.querySelector('#cultivationStatusReference p:last-child');if(last&&last.getBoundingClientRect().bottom>r.bottom+1)issues.push('last status unreachable');
    }
    el.scrollTop=0;return [...new Set(issues)];
  });if(feed.scroll>feed.height+1&&!/auto|scroll/.test(feed.overflow))feedIssues.push('expanded feed clips content without scrolling');
  check(label+' battle feed',feedIssues,feed);await shot(page,label+'-feed');await page.locator('.cult-feed-toggle').click();
  await page.locator('#playerInfo0 .seat-name').click();await page.locator('.cult-role-sheet').waitFor();check(label+' character details',await controls(page,'.cult-role-sheet'));await page.locator('.cult-role-sheet > header button').click();
  await page.locator('.cult-monster-lookup').click();await page.locator('#cultivationCodex[open]').waitFor();check(label+' monster details',await controls(page,'#cultivationCodex'));await page.locator('#cultivationCodexClose').click();
}
async function result(page,label){
  await frame(page);check(label+' controls',await controls(page,'.result-panel'));
  const measured=await page.locator('.result-panel').evaluate(panel=>{
    const issues=[];
    if(panel.scrollWidth>panel.clientWidth+1)issues.push('horizontal result overflow');
    const head=panel.querySelector('.rs-head').getBoundingClientRect(),rows=panel.querySelector('.rs-rows').getBoundingClientRect(),footer=panel.querySelector('.result-footer').getBoundingClientRect();
    if(head.bottom>rows.top+1)issues.push('heading overlaps player rows');if(rows.bottom>footer.top+1)issues.push('rows overlap next hand');
    for(const row of panel.querySelectorAll('.result-player')){const r=row.getBoundingClientRect(),rail=row.querySelector('.rs-tiles').getBoundingClientRect();for(const tile of row.querySelectorAll('.tile')){const t=tile.getBoundingClientRect();if(t.left<rail.left-1||t.right>rail.right+1||t.bottom>r.bottom+1)issues.push('tile outside player row');}}
    return {issues:[...new Set(issues)],players:panel.querySelectorAll('.result-player').length,progression:!!panel.querySelector('.progression-result'),expedition:!!panel.querySelector('.expedition-result')};
  });check(label+' rows',measured.issues,measured);await page.locator('.result-panel').evaluate(el=>el.scrollTop=0);await shot(page,label+'-top');await page.locator('#btnContinueNext').scrollIntoViewIfNeeded();await shot(page,label+'-bottom');
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});server=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p==='/')p='/index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.env.BATTLE_RESULT_URL||`http://127.0.0.1:${server.address().port}/`;
  for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});try{
      const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
      await page.goto(url);await page.waitForFunction(()=>MahjongStartScreen?.state==='home'&&!document.querySelector('#startGameBtn').disabled);await page.locator('#startGameBtn').click();await page.locator('#cultivationModeBtn').click();await page.locator('#journeyChooseConfirm').click();await page.locator('.opening-skip').click({timeout:10000}).catch(()=>{});await page.waitForFunction(()=>S?.phase==='play'&&S.cultivation);
      await page.waitForFunction(()=>!MahjongImages.isLoading());await page.getByRole('button',{name:'知道了',exact:true}).click();
      await page.evaluate(()=>{cancelGameTimers();window.layoutBattleOriginal=JSON.parse(JSON.stringify(S));S.turn=0;S.waitReact=null;renderAll();cancelGameTimers(true);});
      for(const [width,height]of [[568,320],[667,375],[844,390],[942,435],[1440,900]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(160);await battle(page,`${engineName}-${width}x${height}`);
        await page.evaluate(()=>showReactionPanel(['hu','chow','pong','kong'].map(type=>({type,pid:0}))));await page.waitForTimeout(320);const reactionIssues=await controls(page,'#controls');
        reactionIssues.push(...await page.evaluate(()=>{const issues=[];for(const button of document.querySelectorAll('#controls button:not(:disabled)'))for(const node of document.querySelectorAll('.cult-monster-top small,.cult-monster-top strong,.cult-boss-hp,.cult-monster-lookup,.cult-monster-status span,.cult-intent-damage,.cult-attack,.cult-monster-extra,.cult-target,.cult-countdown')){const a=button.getBoundingClientRect(),b=node.getBoundingClientRect();if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)issues.push('reaction covers '+node.className);}return [...new Set(issues)];}));
        check(`${engineName}-${width} reaction buttons`,reactionIssues);await shot(page,`${engineName}-${width}x${height}-reactions`);await page.evaluate(()=>{clearReactionButtons();S.currentReactions=[];});
      }
      await page.setViewportSize({width:844,height:390});await page.waitForTimeout(160);
      await page.evaluate(()=>{S.cultivation.players.forEach(p=>{p.damage=1234567;p.aggro=234567;p.shield=99999;p.statuses=[{kind:'fragile',label:'下次承傷增加',remaining:3},{kind:'healingDown',label:'治療降低',remaining:2}];});renderAll();cancelGameTimers();});await battle(page,engineName+'-stress');
      await page.evaluate(()=>{S=JSON.parse(JSON.stringify(window.layoutBattleOriginal));cancelGameTimers();endDraw();});await page.locator('.expedition-result').waitFor();await frame(page);
      await page.evaluate(()=>{window.layoutResultProfileNode=document.querySelector('.progression-result');window.layoutResultProfileText=window.layoutResultProfileNode.textContent;window.layoutDrawOriginal=JSON.parse(JSON.stringify(S));});
      for(const [width,height]of [[568,320],[667,375],[844,390],[942,435],[1440,900]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(160);const retained=await page.evaluate(()=>document.querySelector('.progression-result')===window.layoutResultProfileNode&&window.layoutResultProfileNode.textContent===window.layoutResultProfileText&&!!document.querySelector('.expedition-result'));check(`${engineName}-${width} result resize rewards`,retained?[]:['resize replaced or removed cultivation/expedition rewards']);
        await result(page,`${engineName}-${width}x${height}-draw`);
      }
      await page.setViewportSize({width:390,height:844});await page.getByText('本遊戲僅支援橫式',{exact:true}).waitFor();await page.setViewportSize({width:844,height:390});await page.waitForTimeout(160);
      check(engineName+' result rotation rewards',await page.evaluate(()=>document.querySelector('.progression-result')===window.layoutResultProfileNode&&window.layoutResultProfileNode.textContent===window.layoutResultProfileText)?[]:['rotation changed settlement rewards']);
      await page.setViewportSize({width:844,height:390});await page.evaluate(()=>{S.winner=0;S.fromPlayer=-1;S.resultDetail={fan:12,categories:['自摸','門清','莊家']};S.cultivation.players.forEach(p=>{p.damage=1234567;p.economy.handLoot.gold=12345;p.economy.handLoot.sand=123;});S.cultivation.finisher={pid:0,method:'selfDraw',total:12345,parts:Array.from({length:8},(_,i)=>({label:'終式段落 '+(i+1),name:'五行連招與花陣加成',damage:1500+i}))};showHandsAndContinue();});await page.locator('.expedition-result').waitFor();await result(page,engineName+'-stress-win');
      for(const [width,height]of [[568,320],[667,375],[844,390],[942,435],[1440,900]]){await page.setViewportSize({width,height});await page.waitForTimeout(160);await result(page,`${engineName}-${width}x${height}-stress-win`);await page.locator('.cult-finish-detail').click();await page.locator('.cult-finish-sheet').waitFor();check(`${engineName}-${width} finisher details`,await controls(page,'.cult-finish-sheet'));await page.locator('.cult-finish-sheet > header button').click();}
      // Return to the real settled draw before following the actual preparation action.
      await page.evaluate(()=>{S=JSON.parse(JSON.stringify(window.layoutDrawOriginal));showHandsAndContinue();});await page.locator('.expedition-result').waitFor();await page.locator('#btnContinueNext').click();await page.locator('.journey-preparation-screen').waitFor();check(engineName+' next preparation');
      await page.setViewportSize({width:390,height:844});await page.getByText('本遊戲僅支援橫式',{exact:true}).waitFor();check(engineName+' portrait reminder');await context.close();
    }finally{await browser.close();}
  }
  assert.deepEqual(report.errors,[]);const failures=report.checks.filter(c=>c.issues.length);if(!process.env.BATTLE_RESULT_DIAGNOSTIC)assert.deepEqual(failures,[]);report.passed=!failures.length;
})().catch(e=>{report.errors.push(e.stack);console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'battle-result-layout-report.json'),JSON.stringify(report,null,2));if(server)await new Promise(resolve=>server.close(resolve));});
