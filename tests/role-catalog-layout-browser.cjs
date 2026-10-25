// Real dialogs and controls; advanced gear/progression are explicit display fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts');
const report={passed:false,checks:[],errors:[],networkErrors:[],boundary:'Real new journey and dialog interactions; advanced role fixtures are display-only, no physical phone.'};
let server;
function check(label,issues=[],extra={}){report.checks.push({label,issues,...extra});console.log(issues.length?'ISSUE':'PASS',label,JSON.stringify(issues));}
async function frame(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function shot(page,name){await page.screenshot({path:path.join(out,'role-catalog-'+name+'.png')});}
async function closeCatalog(page){await page.locator('#cultivationCodexClose').click();await page.locator('#cultivationCodex').waitFor({state:'detached'});}
async function audit(page,label,selector,scanOnly=false){
  await frame(page);
  const result=await page.locator(selector).evaluate((host,scanOnly)=>{
    const issues=[],visible=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
    if(host.scrollWidth>host.clientWidth+2)issues.push('dialog horizontal overflow');
    for(const el of host.querySelectorAll('.role-main,.journey-stats dd,.equip-role-info,.supply-carried,.codex-scroll,.codex-card,.codex-card-actions,.codex-footer')){
      if(visible(el)&&el.scrollWidth>el.clientWidth+2)issues.push('content overflow '+el.className);
    }
    for(const el of host.querySelectorAll('.journey-stat-gain')){const range=document.createRange();range.selectNodeContents(el);if(range.getClientRects().length>1)issues.push('split bonus '+el.textContent);}
    const carried=host.querySelector('.role-main .supply-carried');if(carried&&carried.getBoundingClientRect().width<carried.parentElement.clientWidth-3)issues.push('carried items squeezed into equipment column');
    const controls=[...host.querySelectorAll('button,input,select,summary')].filter(visible);
    for(const el of controls){
      if(scanOnly){if(el.tagName==='BUTTON'&&(el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2))issues.push('button text overflow '+el.textContent);continue;}
      for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement)if(/auto|scroll/.test(getComputedStyle(p).overflowY)&&p.scrollHeight>p.clientHeight){const r=el.getBoundingClientRect(),b=p.getBoundingClientRect();p.scrollTop+=r.y-b.y-b.height/2+r.height/2;}
      const r=el.getBoundingClientRect(),name=el.getAttribute('aria-label')||el.textContent.trim().slice(0,50)||el.id,hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      if(!el.contains(hit))issues.push('covered '+name);
      if(r.x<0||r.right>innerWidth+1||r.y<0||r.bottom>innerHeight+1)issues.push('outside '+name);
      for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const b=p.getBoundingClientRect(),css=getComputedStyle(p);if(/hidden|auto|scroll/.test(css.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))issues.push('clipped '+name);}
      if(el.tagName==='BUTTON'&&(el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2))issues.push('button text overflow '+name);
    }
    const scroller=host.querySelector('.codex-scroll');if(scroller){scroller.scrollTop=scroller.scrollHeight;const last=scroller.querySelector('.codex-card:last-child');if(last&&last.getBoundingClientRect().bottom>scroller.getBoundingClientRect().bottom+1)issues.push('last card unreachable');}
    return {issues:[...new Set(issues)],controls:scanOnly?0:controls.length};
  },scanOnly);check(label,result.issues,result);
}
async function role(page,label,pid){
  await page.locator(`#playerInfo${pid} .seat-name`).click();await page.locator('.cult-role-sheet').waitFor();await audit(page,label,'.cult-role-sheet');
  await page.locator('.cult-role-sheet').evaluate(el=>el.scrollTop=0);await shot(page,label+'-top');await page.locator('.cult-role-sheet').evaluate(el=>el.scrollTop=el.scrollHeight);await shot(page,label+'-bottom');
  await page.locator('.cult-role-sheet > header button').click();
}
async function catalog(page,label){
  // Enter through the real settings control.
  await page.locator('#tableMenuBtn').click();await page.locator('#tmTab-cult').click();await page.locator('#cultivationCatalogOpen').click();await page.locator('#cultivationCodex[open]').waitFor();
  check(label+' catalog totals',await page.evaluate(()=>['.codex-header p','#cultivationCatalog'].every(selector=>document.querySelector(selector).textContent.includes(`${MahjongMonsterSkills.all.length} 招怪物技能`)))?[]:['monster skill count differs from catalog']);
  await audit(page,label+' catalog','#cultivationCodex');await page.locator('.codex-scroll').evaluate(el=>el.scrollTop=0);await shot(page,label+'-catalog-top');
  await page.locator('#cultivationNext').click();check(label+' next page',(await page.locator('#cultivationPage').innerText()).startsWith('2 /')?[]:['page did not advance']);
  await page.locator('#cultivationPrev').click();
  while(!await page.locator('#cultivationNext').isDisabled()){await page.locator('#cultivationNext').click();await audit(page,label+' catalog page '+await page.locator('#cultivationPage').innerText(),'#cultivationCodex',true);}
  await page.locator('#cultivationFilterReset').click();
  await page.locator('#cultivationFamily').selectOption('finish');await audit(page,label+' finishers','#cultivationCodex');
  await page.locator('#cultivationFilterReset').click();await page.locator('#cultivationPurpose').selectOption('heal');await audit(page,label+' heal filter','#cultivationCodex');
  await page.locator('#cultivationFilterReset').click();await page.locator('#cultivationAction').selectOption('monster');await audit(page,label+' monster filter','#cultivationCodex');
  await page.locator('#cultivationFilterReset').click();await page.locator('#cultivationSkillSearch').fill('no-such-skill-xyz');await audit(page,label+' empty search','#cultivationCodex');await page.locator('[data-reset]').click();
  for(let i=0;i<3;i++)await page.locator('[data-compare]').nth(i).check();await page.locator('#cultivationCompare').click();
  check(label+' compare count',await page.locator('.codex-card').count()===3?[]:['comparison count']);await audit(page,label+' comparison','#cultivationCodex');await page.locator('.codex-scroll').evaluate(el=>el.scrollTop=0);await shot(page,label+'-compare');
  await page.locator('#cultivationCompare').click();await page.locator('#cultivationClearCompare').click();
  await page.locator('.codex-guide summary').click();await audit(page,label+' guide','#cultivationCodex');
  await closeCatalog(page);
  await page.keyboard.press('Escape');
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});server=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p==='/')p='/index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=process.env.ROLE_CATALOG_URL||`http://127.0.0.1:${server.address().port}/`;
  for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});try{
      const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
      page.on('response',response=>{if(response.status()>=400)report.networkErrors.push({status:response.status(),url:response.url()});});
      await page.goto(url);await page.waitForFunction(()=>MahjongStartScreen?.state==='home'&&!document.querySelector('#startGameBtn').disabled);await page.locator('#startGameBtn').click();await page.locator('#cultivationModeBtn').click();await page.locator('#journeyChooseConfirm').click();await page.locator('.opening-skip').click({timeout:10000}).catch(()=>{});await page.waitForFunction(()=>S?.phase==='play'&&S.cultivation);await page.evaluate(()=>{cancelGameTimers();window.roleOriginal=JSON.parse(JSON.stringify(S));});
      for(const [width,height]of [[568,320],[667,375],[844,390],[942,435],[1440,900]]){
        const label=`${engineName}-${width}x${height}`;await page.setViewportSize({width,height});await page.waitForTimeout(160);
        await page.evaluate(()=>{S=JSON.parse(JSON.stringify(window.roleOriginal));renderAll();cancelGameTimers();});await role(page,label+'-basic',0);
        await page.evaluate(()=>{const p=S.cultivation.players[0],E=MahjongCultivationEquipment;p.progression={...MahjongCultivationProgression.fresh(),realm:4,xp:2200,allocation:{spell:3,recovery:3}};p.economy.inventory=E.all.filter(x=>x.setId==='wuxiang').map((cat,i)=>({uid:'layout-'+i,catId:cat.id,grade:5,level:10,locked:false}));p.equipment=Object.fromEntries(p.economy.inventory.map(i=>[E.get(i.catId).slot,i.uid]));p.economy.items.carried=[{id:'heal',used:false},{id:'barrier',used:false}];renderAll();cancelGameTimers();});
        await role(page,label+'-advanced',0);await role(page,label+'-ally',1);await catalog(page,label);
        await page.evaluate(()=>MahjongCultivationCatalog.open({skillId:'formation.eight',related:[{skillId:'formation.seasons',status:'已成陣'},{skillId:'formation.gentlemen',status:'已成陣'}]}));await audit(page,label+' flower lookup','#cultivationCodex');await page.locator('.codex-scroll').evaluate(el=>el.scrollTop=0);await shot(page,label+'-flower');await closeCatalog(page);
      }
      await page.setViewportSize({width:844,height:390});
      const heroes=await page.evaluate(()=>MahjongCultivationHeroes.all.map(h=>h.id));
      for(const id of heroes){await page.evaluate(id=>{S.cultivation.players[0].heroId=id;renderAll();cancelGameTimers();},id);await role(page,engineName+'-'+id,0);}
      await page.evaluate(()=>MahjongCultivationCatalog.open({secret:true}));await audit(page,engineName+' secret lookup','#cultivationCodex');await closeCatalog(page);
      await page.evaluate(()=>MahjongCultivationCatalog.open());await page.locator('[data-demo]').first().click();await page.locator('.cult-vfx-preview').waitFor();await audit(page,engineName+' skill preview','.cult-vfx-preview');await page.locator('.cult-vfx-preview header button').click();await closeCatalog(page);
      await page.evaluate(()=>MahjongCultivationCatalog.open());await page.locator('#cultivationSkillSearch').fill('反擊');await page.setViewportSize({width:844,height:220});await audit(page,engineName+' reduced viewport','#cultivationCodex');
      await page.setViewportSize({width:390,height:844});await page.getByText('本遊戲僅支援橫式',{exact:true}).waitFor();await page.setViewportSize({width:844,height:390});await frame(page);check(engineName+' catalog rotation',await page.locator('#cultivationSkillSearch').inputValue()==='反擊'?[]:['search lost after rotation']);await closeCatalog(page);
      await page.setViewportSize({width:390,height:844});await page.getByText('本遊戲僅支援橫式',{exact:true}).waitFor();check(engineName+' portrait reminder');await context.close();
    }finally{await browser.close();}
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.networkErrors,[]);const failures=report.checks.filter(c=>c.issues.length);report.passed=!failures.length;if(!process.env.ROLE_CATALOG_DIAGNOSTIC)assert.deepEqual(failures,[]);
})().catch(e=>{report.errors.push(e.stack);console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'role-catalog-layout-report.json'),JSON.stringify(report,null,2));if(server)await new Promise(r=>server.close(r));});
