// Display fixtures for all seats; game rules are not changed by this test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts');
const report={passed:false,checks:[],errors:[]};let server;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});try{
   for(const mode of ['normal','cultivation']){
    const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>MahjongStartScreen?.state==='home'&&!document.querySelector('#startGameBtn').disabled);
    await page.locator('#startGameBtn').click();await page.locator(mode==='normal'?'#normalModeBtn':'#cultivationModeBtn').click();
    if(mode==='cultivation')await page.locator('#journeyChooseConfirm').click();
    await page.locator('.opening-skip').click({timeout:10000}).catch(()=>{});
    await page.waitForFunction(()=>S?.phase==='play'&&!MahjongImages.isLoading());
    if(mode==='cultivation')await page.getByRole('button',{name:'知道了',exact:true}).click();
    await page.evaluate(()=>{cancelGameTimers();document.documentElement.dataset.centerStyle='board';});
    for(const [width,height]of [[1440,900],[844,390],[942,435]]){
     await page.setViewportSize({width,height});
     for(let pid=0;pid<4;pid++){
      await page.evaluate(pid=>{cancelGameTimers();S.turn=pid;S.waitReact=null;renderAll();},pid);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const check=await page.evaluate(({pid,mode})=>{
       const el=document.getElementById('playerInfo'+pid),r=el.getBoundingClientRect(),css=getComputedStyle(el),arrow=getComputedStyle(el,'::after');
       const panel=document.querySelector('.center-info-panel'),panelArrow=getComputedStyle(panel,'::after');
       const controls=[...document.querySelectorAll('#controls button')].map(b=>b.textContent.trim());
       const names=[...document.querySelectorAll('.player-info-inline .seat-name')].filter(n=>n.getClientRects().length).map(n=>{const b=n.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth+1&&b.y>=0&&b.bottom<=innerHeight+1;});
       return {pid,mode,active:document.querySelectorAll('.player-info-inline.active-turn').length,outline:css.outlineWidth,scale:css.scale,arrow:arrow.content,pointer:arrow.pointerEvents,arrowOnscreen:r.y+parseFloat(arrow.top)>=0&&r.x+r.width/2-9>=0&&r.right<=innerWidth+1,controls,names,centerArrow:panelArrow.content,rotation:panelArrow.rotate,direction:document.getElementById('playersGrid').dataset.turn};
      },{pid,mode});
      assert.equal(check.active,1);assert.equal(check.outline,'2px');assert.equal(check.scale,'1');assert.equal(check.arrow,'""');assert.equal(check.pointer,'none');assert.ok(check.arrowOnscreen);assert.ok(check.names.every(Boolean));assert.deepEqual(check.controls,['胡牌','吃','碰','槓','聽','過']);assert.equal(check.direction,['bottom','top','left','right'][pid]);
      if(mode==='normal'){assert.equal(check.centerArrow,'""');assert.equal(check.rotation,['0deg','180deg','90deg','-90deg'][pid]);}
      report.checks.push({engineName,width,height,...check});
      if(pid===0&&mode==='cultivation'){
       await page.evaluate(()=>{for(const b of document.querySelectorAll('#controls button')){b.disabled=!['btnPong','btnPass'].includes(b.id);b.classList.toggle('active',!b.disabled);}});
       for(const id of ['btnPong','btnPass'])assert.ok(await page.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
      }
      if(pid===0||pid===2)await page.screenshot({path:path.join(out,`turn-cue-${engineName}-${mode}-${width}-${pid}.png`)});
     }
    }
    await page.evaluate(()=>{S.phase='end';renderAll();});assert.equal(await page.locator('.player-info-inline.active-turn').count(),0);
    await page.close();
   }
  }finally{await browser.close();}
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(e=>{report.errors.push(e.stack);console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'turn-cue-browser.json'),JSON.stringify(report,null,2));if(server)await new Promise(r=>server.close(r));});
