// Controlled browser fixtures for the new restoration effects; not legal-play balance samples.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {enterGame}=require('./start-screen-helper.cjs');
const report={method:'Three viewport catalog and save/restore fixtures, isolated browser storage',checks:[],errors:[]};
const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]){
      const context=await browser.newContext({viewport}),page=await context.newPage();
      page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.goto('http://127.0.0.1:8765');await enterGame(page,{mode:'cultivation'});
      await page.evaluate(()=>{
        cancelGameTimers();S.turn=0;S.waitReact=null;S.currentReactions=null;
        const C=MahjongCultivationCombat;let s=S.cultivation;
        s.monster.hp=s.monster.maxHp=10000;s.monster.element='earth';s.monster.armor=0;s.monster.shield=0;s.monster.statuses=[];
        s.players.forEach(p=>{p.aggro=0;p.statuses=[];});
        Object.assign(s.players[0],{aggro:1000,damage:0,hp:1000,shield:0,statuses:[],weak:false});
        s=C.apply(s,{id:s.seq+1,type:'meld',pid:0,action:'pong',key:'DB'}).state;
        s.enemyDue=s.monster.id;s.discardCount=4;
        s.monster.nextAttack={type:'single',damage:80,charged:false,ailment:null,cancelled:false,controlUsed:false,sealAilment:false};
        S.cultivation=C.apply(s,{id:s.seq+1,type:'enemy',monsterId:s.monster.id}).state;
        renderAll();
      });
      await page.evaluate(()=>saveGame());await page.evaluate(()=>autoSaveGame());
      const saved=await page.evaluate(()=>JSON.stringify(S.cultivation));
      await page.reload();await page.locator('#continueCultivationBtn').click();await page.waitForFunction(()=>S!==null);await page.evaluate(()=>cancelGameTimers());
      check(await page.evaluate(s=>JSON.stringify(S.cultivation)===s,saved),`${viewport.width}: auto restore preserves partial ward, damage and remaining charge without replay`);
      await page.evaluate(()=>loadGame());await page.evaluate(()=>cancelGameTimers());
      check(await page.evaluate(s=>JSON.stringify(S.cultivation)===s,saved),`${viewport.width}: manual restore preserves partial ward without replay`);
      const reaction=await page.evaluate(()=>{
        const C=MahjongCultivationCombat,s=S.cultivation;
        s.monster.statuses=[];
        s.enemyDue=s.monster.id;s.discardCount=4;
        s.monster.nextAttack={type:'single',damage:80,charged:false,ailment:null,cancelled:false,controlUsed:false,sealAilment:false};
        S.cultivation=C.apply(s,{id:s.seq+1,type:'enemy',monsterId:s.monster.id}).state;renderAll();
        return {damage:S.cultivation.players[0].damage,shield:S.cultivation.players[0].shield,wards:S.cultivation.players[0].statuses.filter(s=>s.kind==='shieldCounter').length};
      });
      check(reaction.damage===120&&reaction.shield===120&&reaction.wards===0,`${viewport.width}: restored ward releases exactly its last charge ${JSON.stringify(reaction)}`);
      await page.locator('#tableMenuBtn').click();await page.locator('#tmTab-cult').click();await page.locator('#cultivationCatalogOpen').click();
      for(const [name,ratio,cap] of [['甘霖回脈','本招實際回復×0.6',105],['活泉潤脈','本招實際回復×0.75',200],['龍息回元','本招實際回復×0.75',175],['玉璧生輝','本次護盾吸收×0.75',90],['玉潭護心','本次護盾吸收×0.65',70]]){
        await page.locator('#cultivationSkillSearch').fill(name);
        const cards=page.locator('#cultivationSkillList .cult-skill-card');
        const text=await cards.innerText();
        check(await cards.count()===1&&text.includes(ratio)&&text.includes('上限 '+cap)&&!text.includes('undefined'),`${viewport.width}: ${name} displays the final ratio and cap`);
      }
      await page.locator('#cultivationSkillList .cult-skill-card').scrollIntoViewIfNeeded();
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('#cultivationSkillList .cult-skill-card')].every(card=>card.scrollWidth<=card.clientWidth)),`${viewport.width}: new skill descriptions do not overflow page or card width`);
      await page.screenshot({path:`artifacts/restoration-catalog-${viewport.width}.png`});
      await context.close();
    }
    assert.deepEqual(report.errors,[]);report.passed=true;
  }finally{fs.writeFileSync('artifacts/restoration-browser-report.json',JSON.stringify(report,null,2));await browser.close();}
  console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
