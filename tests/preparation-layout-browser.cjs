// Layout fixtures use real preparation UI and isolated IDB; seeded gear is not balance evidence.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts');
const report={passed:false,checks:[],errors:[],boundary:'Seeded progression, gear and materials in isolated browser contexts; no physical phone.'};
let server;
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function shot(page,name){await page.screenshot({path:path.join(out,'preparation-layout-'+name+'.png')});}
async function audit(page,label,selector){
  const result=await page.locator(selector).evaluate(host=>{
    const issues=[],visible=el=>!!el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
    const controls=[...host.querySelectorAll('button,select,input,summary')].filter(visible);
    for(const el of controls){
      // Only scroll containers that the user can actually scroll. overflow:hidden is not a fallback.
      for(let p=el.parentElement;p;p=p.parentElement){const css=getComputedStyle(p);if(/auto|scroll/.test(css.overflowY)&&p.scrollHeight>p.clientHeight){const r=el.getBoundingClientRect(),b=p.getBoundingClientRect();if(r.bottom>b.bottom)p.scrollTop+=r.bottom-b.bottom+4;if(r.top<b.top)p.scrollTop-=b.top-r.top+4;}}
      const r=el.getBoundingClientRect(),name=el.getAttribute('aria-label')||el.textContent.trim().slice(0,70)||el.id;
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      if(!hit||!el.contains(hit))issues.push('covered '+name);
      if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)issues.push('outside screen '+name);
      for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const css=getComputedStyle(p),b=p.getBoundingClientRect();if(/hidden|auto|scroll/.test(css.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))issues.push('clipped vertically '+name);if(/hidden|auto|scroll/.test(css.overflowX)&&(r.left<b.left-1||r.right>b.right+1))issues.push('clipped horizontally '+name);}
      if(el.tagName==='BUTTON'&&!el.classList.contains('equip-item')&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1))issues.push('button overflow '+name);
    }
    return {issues:[...new Set(issues)],controls:controls.length};
  });
  report.checks.push({label,...result});console.log(result.issues.length?'ISSUE':'PASS',label,JSON.stringify(result.issues));
}
async function fixture(page,url){
  await page.goto(url);await page.waitForFunction(()=>MahjongStartScreen?.state==='home'&&!document.querySelector('#startGameBtn').disabled);
  await page.evaluate(async()=>{const profile={...MahjongCultivationProgression.fresh(),realm:3,xp:2200},db=await initDB();await new Promise((resolve,reject)=>{const tx=db.transaction(['gameSaves'],'readwrite');tx.objectStore('gameSaves').put(profile,'cultivationProgressionV1');tx.oncomplete=resolve;tx.onerror=reject;});db.close();await MahjongStartScreen.showHome();});
  await page.locator('#startGameBtn').click();await page.locator('#cultivationModeBtn').click();await page.locator('#journeyChooseConfirm').click();await page.locator('.opening-skip').click({timeout:10000}).catch(()=>{});await page.waitForFunction(()=>S?.phase==='play'&&S.cultivation);
  await page.evaluate(()=>{cancelGameTimers();endDraw();});await page.waitForFunction(()=>MahjongProgressionFlow.profile.xp>2200);
  await page.evaluate(()=>{
    cancelGameTimers();const p=S.cultivation.players[0];p.economy.gold=50000;p.economy.sand=5000;
    Object.keys(p.economy.seals).forEach(id=>p.economy.seals[id]=8);
    const ids=['chi-xiao-sword','xuanfu-staff','huifeng-halberd','zhenyue-armor','huichun-robe','xuanyu-robe','ningyu-jade','huifeng-seal','set-zhenyue-weapon','set-zhenyue-armor','set-zhenyue-accessory','set-wuxiang-weapon','set-wuxiang-armor','set-wuxiang-accessory'];
    p.economy.inventory=ids.map((catId,i)=>({uid:`p0-${i+1}`,catId,grade:catId.startsWith('set-wuxiang')?5:catId.startsWith('set-')?4:(i%5)+1,level:i===0?7:i===1?1:i===3?6:0,locked:i===2}));
    p.economy.serial=ids.length;p.equipment={weapon:'p0-1',armor:'p0-4',accessory:'p0-7'};
    for(const item of MahjongCultivationItems.all)p.economy.items.counts[item.id]=99;
    p.economy.items.prepared=['heal','barrier'];showHandsAndContinue();
  });
  await page.locator('#btnContinueNext').click();await page.locator('.prep-left-toggle').waitFor();await settle(page);
}
async function left(page){if(!await page.locator('[data-left="progression"]').isVisible())await page.locator('.prep-left-toggle').click();await page.locator('[data-left="progression"]').click();await settle(page);}
async function tab(page,id){await page.locator(`[data-tab="${id}"]`).click();try{await page.waitForFunction(id=>document.querySelector('.equip-tabs [aria-selected="true"]')?.dataset.tab===id&&!document.querySelector('.equip-tabs button').disabled,id);}catch(error){await shot(page,'tab-failure');throw Error(error.message+' '+JSON.stringify(await page.evaluate(()=>({tab:document.querySelector('.equip-tabs [aria-selected="true"]')?.dataset.tab,notice:document.querySelector('.equip-notice')?.textContent,confirmation:!!document.querySelector('.equip-confirm'),stateTab:S.cultivation.players[0].economy.items.tab}))));}await settle(page);}
(async()=>{
  fs.mkdirSync(out,{recursive:true});server=http.createServer((req,res)=>{let p=decodeURIComponent(new URL(req.url,'http://local').pathname);if(p==='/')p='/index.html';const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.env.PREPARATION_LAYOUT_URL||`http://127.0.0.1:${server.address().port}/`;
  for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});try{
      const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await fixture(page,url);
      for(const [width,height]of [[568,320],[667,375],[844,390],[942,435],[1440,900]]){
        const name=`${engineName}-${width}x${height}`;await page.setViewportSize({width,height});await page.waitForTimeout(200);await left(page);
        if(!await page.locator('.progression-ai').evaluate(el=>el.open))await page.locator('.progression-ai summary').click();await audit(page,name+' progression','.journey-progression');await shot(page,name+'-progression');
        await page.locator('[data-progression-edit]').click();await page.locator('.progression-dialog').waitFor();await audit(page,name+' techniques','.progression-dialog');await shot(page,name+'-techniques');
        const skill=await page.locator('[data-skill]').first().getAttribute('data-skill'),before=Number(await page.locator('.progression-stepper b').first().innerText());
        await page.locator(`[data-skill="${skill}"][data-delta="1"]`).click();await page.locator(`[data-skill="${skill}"][data-delta="-1"]`).click();
        await page.locator(`[data-skill="${skill}"][data-delta="${before?'-1':'1'}"]`).click();await page.locator('[data-progression-save]').click();await page.locator('.progression-dialog').waitFor({state:'detached'});
        const saved=await page.evaluate(async id=>{const db=await initDB();try{return await new Promise((resolve,reject)=>{const request=db.transaction(['gameSaves'],'readonly').objectStore('gameSaves').get('cultivationProgressionV1');request.onsuccess=()=>resolve(request.result.allocation[id]||0);request.onerror=reject;});}finally{db.close();}},skill);
        assert.equal(saved,before?0:1);await audit(page,name+' saved techniques','.journey-progression');
        if(await page.locator('.prep-left-close').isVisible())await page.locator('.prep-left-close').click();
        for(const id of ['loot','items','inventory','shop','forge']){
          await tab(page,id);
          if(id==='inventory') {
            const item=page.locator('.equip-item').first();
            try{await item.click({timeout:1500});}catch(error){if(!process.env.PREPARATION_LAYOUT_DIAGNOSTIC)throw error;report.checks.push({label:name+' inventory click blocked',issues:['real click blocked; diagnostic DOM click only to inspect remaining UI']});await item.evaluate(el=>el.click());}
            await settle(page);
          }
          if(id==='forge') {await page.locator('#equipForgeItem').selectOption('p0-1');await settle(page);await page.locator('#supplyForgeCharm').selectOption('preserve');await settle(page);}
          let number=0;
          do{await audit(page,`${name} ${id} page ${number}`,'.equip-ui');if(number===0)await shot(page,name+'-'+id);const next=page.locator('#equipPanel > .prep-pager [data-step="1"]');if(!await next.count()||await next.isDisabled())break;await next.click();await settle(page);number++;}while(number<50);
          if(id==='forge'){try{await page.locator('[data-action="transfer"]').click({timeout:3000});}catch(error){if(!process.env.PREPARATION_LAYOUT_DIAGNOSTIC)throw error;}if(await page.locator('.equip-confirm').count()){await audit(page,name+' transfer confirmation','.equip-confirm');await shot(page,name+'-transfer');await page.locator('#equipConfirmCancel').click();}}
        }
      }
      // Real touch-capable browser clicks and production transactions, not DOM-dispatched actions.
      await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);
      if(await page.locator('.prep-left-close').isVisible())await page.locator('.prep-left-close').click();
      await tab(page,'inventory');await page.locator('.equip-item[data-select="p0-2"]').click();await settle(page);await page.locator('[data-action="equip"]').click();await page.waitForFunction(()=>S.cultivation.players[0].equipment.weapon==='p0-2');await settle(page);await audit(page,engineName+' equipped item','.equip-ui');
      await tab(page,'items');const heal=await page.evaluate(()=>S.cultivation.players[0].economy.items.counts.heal);await page.locator('[data-action="item-craft"][data-item="heal"]').click();await page.waitForFunction(n=>S.cultivation.players[0].economy.items.counts.heal===n+1,heal);await settle(page);await audit(page,engineName+' crafted item','.equip-ui');
      await tab(page,'shop');await page.locator('[data-action="buy"]').first().click();await page.waitForFunction(()=>S.cultivation.players[0].economy.shop.stock[0].sold);await settle(page);await audit(page,engineName+' purchased item','.equip-ui');
      await tab(page,'forge');assert.equal(await page.locator('#supplyForgeCharm').inputValue(),'none');await page.locator('#equipForgeItem').selectOption('p0-1');await settle(page);await page.locator('#supplyForgeCharm').selectOption('preserve');await settle(page);await page.locator('#equipTransferTarget').selectOption('p0-2');await page.locator('[data-action="transfer"]').click();await page.locator('#equipConfirmAccept').click();await page.waitForFunction(()=>S.cultivation.players[0].economy.inventory.find(i=>i.uid==='p0-2').level===7);await settle(page);assert.equal(await page.locator('#supplyForgeCharm').inputValue(),'none');await audit(page,engineName+' transferred upgrade','.equip-ui');
      await page.locator('[data-action="forge"]').click();await page.waitForFunction(()=>S.cultivation.players[0].economy.inventory.find(i=>i.uid==='p0-1').level===1);await settle(page);await audit(page,engineName+' forged item','.equip-ui');
      await page.evaluate(()=>{const p=S.cultivation.players[0];p.economy.inventory=[];p.equipment={weapon:null,armor:null,accessory:null};p.economy.gold=p.economy.sand=0;for(const id of Object.keys(p.economy.items.counts))p.economy.items.counts[id]=0;p.economy.items.prepared=[];});
      for(const id of ['inventory','items','shop','forge']){await tab(page,id);await audit(page,engineName+' empty '+id,'.equip-ui');}
      await page.setViewportSize({width:390,height:844});await page.getByText('本遊戲僅支援橫式',{exact:true}).waitFor();await context.close();
    }finally{await browser.close();}
  }
  assert.deepEqual(report.errors,[]);const issues=report.checks.filter(c=>c.issues.length);if(!process.env.PREPARATION_LAYOUT_DIAGNOSTIC)assert.deepEqual(issues,[]);report.passed=issues.length===0;
})().catch(e=>{report.errors.push(e.stack);console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'preparation-layout-report.json'),JSON.stringify(report,null,2));if(server)await new Promise(resolve=>server.close(resolve));});
