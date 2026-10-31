const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts');
const report={passed:false,checks:[],errors:[],networkErrors:[],boundary:'Browser emulation; hero/gear display fixtures and isolated combat previews, not physical phone performance.'};
let server;
function check(label,condition,details){report.checks.push({label,passed:condition,details});assert.ok(condition,label+': '+JSON.stringify(details));}
async function bounds(page,selector,label){const box=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight,overflow:el.scrollWidth-el.clientWidth};});check(label,box.x>=0&&box.y>=0&&box.right<=box.w+1&&box.bottom<=box.h+1&&box.overflow<=2,box);}
(async()=>{
  server=http.createServer((req,res)=>{const p=new URL(req.url,'http://local').pathname;const file=path.resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=process.env.TILE_FAMILY_URL||`http://127.0.0.1:${server.address().port}/`;
  report.url=url;
  for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});try{
      const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
      page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.networkErrors.push({status:r.status(),url:r.url()});});
      await page.goto(url);await page.waitForFunction(()=>MahjongStartScreen?.state==='home'&&!document.querySelector('#startGameBtn').disabled);
      await page.locator('#startGameBtn').click();await page.locator('#cultivationModeBtn').click();await page.locator('#journeyChooseConfirm').click();await page.locator('.opening-skip').click({timeout:10000}).catch(()=>{});
      await page.waitForFunction(()=>S?.phase==='play'&&S.cultivation);await page.evaluate(()=>{cancelGameTimers();window.familyOriginal=JSON.stringify(S);});
      for(const [w,h]of [[844,390],[942,435],[1440,900]]){
        const label=`${name}-${w}x${h}`;await page.setViewportSize({width:w,height:h});
        await page.evaluate(()=>{S=JSON.parse(window.familyOriginal);cancelGameTimers();S.waitReact=null;S.turn=0;if(S.players[0].hand.length===16-S.players[0].melds.length*3)drawTile(0);renderAll();});
        for(const [key,title,base]of [['W1','赤晶',55],['T1','靈珠',40],['B1','飛劍',50],['FE','字牌',60]]){
          await page.evaluate(key=>{const t=generateTiles().find(t=>tileKey(t)===key);S.players[0].hand[0]=t;renderAll();},key);
          // Image-ready redraws replace hand buttons; focus only after that redraw completes.
          await page.waitForFunction(()=>!MahjongImages.isLoading());
          // A later redraw can still replace the button and drop its focus, so focus whichever button is current.
          await page.waitForFunction(()=>{const el=document.querySelector('#yourHand button[onclick="onClickYourTile(0)"]');if(el&&document.activeElement!==el)el.focus({preventScroll:true});return document.querySelector('#cultInsight')?.hidden===false;},null,{timeout:8000});
          const text=await page.locator('#cultInsight').innerText();check(label+' '+key+' base',text.includes(title+'普攻')&&text.includes(String(base)),text);
          await bounds(page,'#cultInsight',label+' '+key+' tooltip');
          const result=await page.evaluate(key=>{
            const before=JSON.stringify(S.cultivation),estimate=MahjongCultivationInsight.simulate(0,{type:'discard',pid:0,key});
            const [lo,hi]=MahjongCultivationCombat.damageRollRange;
            const damage=roll=>MahjongCultivationCombat.withDamageRoll(roll,()=>MahjongCultivationCombat.apply(S.cultivation,{id:S.cultivation.seq+1,type:'discard',pid:0,key}).effects.filter(e=>e.source==='basic').reduce((n,e)=>n+e.amount,0));
            return {unchanged:before===JSON.stringify(S.cultivation),estimate:estimate.basic,lo:damage(lo),hi:damage(hi)};
          },key);
          check(label+' '+key+' preview parity',result.unchanged&&result.estimate.lo===result.lo&&result.estimate.hi===result.hi,result);
        }
        await page.screenshot({path:path.join(out,`tile-family-${label}-insight.png`)});
        await page.evaluate(()=>{MahjongCultivationInsight.hide();MahjongCultivationCatalog.open();});
        await page.locator('.codex-guide summary').click();await page.locator('.codex-guide').scrollIntoViewIfNeeded();
        const guide=await page.locator('.codex-guide').innerText();check(label+' five roles',['赤晶','靈珠','飛劍','字牌','花牌','自己的回合'].every(t=>guide.includes(t)));
        await bounds(page,'#cultivationCodex',label+' catalog');
        check(label+' guide wrapping',await page.locator('.codex-guide').evaluate(el=>el.scrollWidth<=el.clientWidth+2));
        await page.screenshot({path:path.join(out,`tile-family-${label}-guide.png`)});
        await page.locator('#cultivationCodexClose').click();
        const pending=await page.evaluate(()=>{
          const C=MahjongCultivationCombat;S.cultivation=C.create(77,null,{heroId:'yun-zhiwei',equipment:true});
          S.cultivation=C.apply(S.cultivation,{id:1,type:'flower',pid:1,key:'H8'}).state;
          S.players[1].flowers=[generateTiles().find(t=>tileKey(t)==='H8')];renderAll();
          const before=JSON.stringify(S.cultivation),sim=MahjongCultivationInsight.simulate(1,{type:'flower',pid:1,key:'H8'});
          return {pending:S.cultivation.players[1].pendingFlowerSkills,damage:S.cultivation.players[1].damage,preview:sim?.damage,unchanged:before===JSON.stringify(S.cultivation)};
        });
        check(label+' pending flower preview',pending.damage===0&&pending.pending.includes('H8.flower')&&(pending.preview.hi??pending.preview)>0&&pending.unchanged,pending);
        await page.waitForFunction(()=>!MahjongImages.isLoading());
        await page.locator('[data-flower-key="H8"][data-flower-player="1"]').evaluate(el=>{el.setAttribute('tabindex','0');el.focus({preventScroll:true});});
        await page.locator('#cultInsight:not([hidden])').waitFor();check(label+' pending label',(await page.locator('#cultInsight').innerText()).includes('待自己的回合'));
        await bounds(page,'#cultInsight',label+' flower tooltip');await page.screenshot({path:path.join(out,`tile-family-${label}-pending.png`)});
      }
      await page.setViewportSize({width:390,height:844});await page.getByText('本遊戲僅支援橫式',{exact:true}).waitFor();check(name+' portrait reminder',true);
      await context.close();
    }finally{await browser.close();}
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.networkErrors,[]);report.passed=true;
})().catch(e=>{report.errors.push(e.stack);console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'tile-family-browser.json'),JSON.stringify(report,null,2));if(server)await new Promise(r=>server.close(r));});
