// UI fixtures test layout and committed-event rendering, not combat balance.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts');
const report={passed:false,cases:[],errors:[]};let server;
(async()=>{
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+(req.url==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});try{
   const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/`);
   await page.waitForFunction(()=>MahjongStartScreen?.state==='home'&&!document.querySelector('#startGameBtn').disabled);
   await page.locator('#startGameBtn').click();await page.locator('#cultivationModeBtn').click();await page.locator('#journeyChooseConfirm').click();
   await page.locator('.opening-skip').click({timeout:10000}).catch(()=>{});
   await page.waitForFunction(()=>S?.phase==='play'&&!MahjongImages.isLoading());await page.getByRole('button',{name:'知道了',exact:true}).click();
   await page.evaluate(async()=>{cancelGameTimers();await Promise.all([MahjongCultivationEffects.loaded,MahjongMonsterEffects.loaded]);window.arenaTexts=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){window.arenaTexts.push({canvas:this.canvas.id,text:String(text),x,y});return original.call(this,text,x,y,...rest);};});
   for(const [width,height]of [[1440,900],[1366,768],[844,390],[942,435],[667,375],[568,320]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>{cancelGameTimers();S.turn=0;S.cultivation.players[1].shield=80;S.cultivation.players[3].hp=0;S.cultivation.players[3].weak=true;renderAll();});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const layout=await page.evaluate(()=>{
     const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
     const icons=[...document.querySelectorAll('.cult-arena-player')].map(box),body=box(document.querySelector('.cult-monster-body'));
     const obstacles=[...document.querySelectorAll('#yourHand button,[id^="handBack"] .tile-back,.cult-boss-hp,.cult-boss-intent')].filter(e=>e.getClientRects().length).map(box);
     const overlap=(a,b)=>a.x<b.x+b.w-1&&a.x+a.w>b.x+1&&a.y<b.y+b.h-1&&a.y+a.h>b.y+1;
     return {icons,body,inside:icons.every(a=>a.x>=0&&a.y>=0&&a.x+a.w<=innerWidth&&a.y+a.h<=innerHeight),overlaps:icons.some((a,i)=>icons.slice(i+1).some(b=>overlap(a,b))||overlap(a,body)||obstacles.some(b=>overlap(a,b))),active:document.querySelectorAll('.cult-arena-player.is-turn').length,shield:document.querySelector('[data-pid="1"].cult-arena-player').classList.contains('has-shield'),weak:document.querySelector('[data-pid="3"].cult-arena-player').classList.contains('is-weak')};
    });
    await page.screenshot({path:path.join(out,`arena-${engineName}-${width}.png`)});
    assert.equal(layout.icons.length,4);assert.ok(layout.inside);assert.equal(layout.overlaps,false,JSON.stringify(layout));assert.equal(layout.active,1);assert.ok(layout.shield&&layout.weak);
    for(const [pid,skill]of [[2,'W.chow.234'],[0,'T.chow.234']]){
     const expected=await page.evaluate(({pid,skill})=>{
      const before=JSON.parse(JSON.stringify(S.cultivation));before.players[pid].hp=500;
      const k=MahjongCultivationSkills.get(skill),result=MahjongCultivationCombat.apply(before,{id:before.seq+1,type:'meld',pid,action:k.action,keys:[...k.combo].map(n=>k.family+n)});
      const plan=MahjongCultivationPresentation.plan(result.effects,before),label=plan.items.find(e=>e.type==='skill')?.label;
      MahjongCultivationEffects.reset();window.arenaTexts=[];MahjongCultivationEffects.consume(result.effects,before);
      const r=document.getElementById('cultArenaPlayer'+pid).getBoundingClientRect(),b=document.getElementById('cultivationBattleEffects').getBoundingClientRect();
      const monster=document.querySelector('.cult-monster-body').getBoundingClientRect();
      return {label,x:r.x+r.width/2-b.x,y:r.y+r.height/2-b.y,damage:plan.items.find(e=>e.type==='damage')?.label,heal:plan.items.find(e=>e.type==='heal')?.label,monsterX:monster.x+monster.width/2-b.x,monsterY:monster.y+monster.height/2-b.y};
     },{pid,skill});
     await page.waitForFunction(e=>window.arenaTexts.some(t=>t.text===e.label&&Math.abs(t.x-e.x)<1&&Math.abs(t.y-e.y)<1),expected);
     await page.screenshot({path:path.join(out,`arena-${engineName}-${width}-${pid}-cast.png`)});
     await page.waitForFunction(e=>window.arenaTexts.some(t=>t.text===e.damage&&Math.abs(t.x-e.monsterX)<1&&t.y<e.monsterY),expected);
     if(expected.heal)await page.waitForFunction(e=>window.arenaTexts.some(t=>t.text===e.heal&&Math.abs(t.x-e.x)<1&&t.y<e.y),expected);
    }
    // A committed visual fixture targets all four players; no game state is changed.
    const hitTargets=await page.evaluate(()=>{
     MahjongCultivationEffects.reset();MahjongMonsterEffects.reset();window.arenaTexts=[];
     const skill=MahjongMonsterSkills.all.find(s=>s.type==='all');
     const hits=[0,1,2,3].map(pid=>({type:'hurt',monsterSkillId:skill.id,pid,amount:71+pid}));
     MahjongMonsterEffects.consume([{type:'monsterSkill',skillId:skill.id,monsterId:S.cultivation.monster.id,seq:900,actionNumber:1,targets:[0,1,2,3]},...hits],S.cultivation);
     const b=document.getElementById('monsterBattleEffects').getBoundingClientRect();
     return hits.map(h=>{const r=document.getElementById('cultArenaPlayer'+h.pid).getBoundingClientRect();return{text:'−'+h.amount,x:r.x+r.width/2-b.x,y:r.y+r.height/2-b.y};});
    });
    await page.waitForFunction(expected=>expected.every(e=>window.arenaTexts.some(t=>t.canvas==='monsterBattleEffects'&&t.text===e.text&&Math.abs(t.x-e.x)<1&&Math.abs(t.y-e.y)<20)),hitTargets);
    await page.screenshot({path:path.join(out,`arena-${engineName}-${width}-hurt.png`)});
    await page.evaluate(()=>{MahjongMonsterEffects.reset();MahjongCultivationEffects.sync(S);showReactionPanel(['hu','chow','pong','kong'].map(type=>({type,pid:0})));});
    await page.waitForTimeout(250);
    const claims=await page.evaluate(()=>{
     const body=document.querySelector('.cult-monster-body').getBoundingClientRect(),icons=[...document.querySelectorAll('.cult-arena-player,#cultivationMonster > :not(.cult-monster-stage)')].map(e=>e.getBoundingClientRect());
     return [...document.querySelectorAll('#controls button:not(:disabled)')].map(el=>{const r=el.getBoundingClientRect();return{id:el.id,box:r.toJSON(),visible:r.width>0&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),overlap:[body,...icons].some(b=>r.x<b.right&&r.right>b.x&&r.y<b.bottom&&r.bottom>b.y),collisions:[body,...icons].filter(b=>r.x<b.right&&r.right>b.x&&r.y<b.bottom&&r.bottom>b.y).map(b=>b.toJSON())};});
    });
    await page.screenshot({path:path.join(out,`arena-${engineName}-${width}-claims.png`)});
    assert.ok(claims.every(c=>c.visible&&c.hit&&!c.overlap),JSON.stringify(claims));
    await page.evaluate(()=>renderAll());
    report.cases.push({engineName,width,height,...layout});
   }
   await page.evaluate(()=>{S.cultivation=null;renderAll();});assert.equal(await page.locator('.cult-arena-player').count(),0);
  }finally{await browser.close();}
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(e=>{report.errors.push(e.stack);console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'arena-browser.json'),JSON.stringify(report,null,2));if(server)await new Promise(r=>server.close(r));});
