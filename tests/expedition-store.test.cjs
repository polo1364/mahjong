const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {playwright,skipReason}=require('./optional-playwright.cjs');
const {chromium}=playwright||{};
test('expedition IndexedDB settlements, events, aborts, stale tabs and old saves',{skip:skipReason},async()=>{
  const server=http.createServer((req,res)=>res.end('<title>isolated expedition storage</title>'));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
    for(const file of ['cultivation-skills.js','cultivation-finishers.js','cultivation-heroes.js','cultivation-monster-skills.js','cultivation-monsters.js','cultivation-progression.js','cultivation-expedition.js','cultivation-equipment.js','cultivation-items.js','cultivation-economy.js','cultivation-combat.js','cultivation-progression-store.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..',file),'utf8')});
    const checks=await page.evaluate(async()=>{
      const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
      const P=MahjongCultivationProgression,C=MahjongCultivationCombat,X=MahjongCultivationExpedition;
      const openDB=()=>new Promise((resolve,reject)=>{const req=indexedDB.open('expedition-transactions',1);req.onupgradeneeded=()=>req.result.createObjectStore('gameSaves');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      const make=open=>MahjongProgressionStore.create({openDB:open,progression:P,validateSave:s=>C.validate(s.gameState.cultivation)});
      const store=make(openDB),tab=make(openDB);
      const pack=c=>({gameState:{phase:'end',winner:null,fromPlayer:null,players:Array.from({length:4},()=>({declaredListen:false})),cultivation:c}});
      const end=c=>C.apply(c,{id:c.seq+1,type:'finish',reason:'draw'}).state;
      let combat=C.create(51,null,{heroId:'shen-gufeng',equipment:true,progression:P.fresh(),progressionId:'transaction-journey'});
      let profile=P.fresh();
      for(let h=1;h<=4;h++){
        combat=end(combat);const envelope=pack(combat);
        const results=await Promise.all([store.settle(envelope,0),tab.settle(envelope,0)]);
        check(results.filter(x=>!x.duplicate).length===1,`hand ${h} exactly one XP and expedition receipt`);
        profile=results[0].profile;combat.expedition=results[0].expedition;
        check(combat.expedition.completed===h,`hand ${h} no double region advancement`);
        combat=C.prepare(combat,{progression:profile,equipment:true});
        if(h<4)combat=C.create(51+h,combat,{progression:profile});
      }
      const pending=pack(combat),original=JSON.stringify(pending),eventId=combat.expedition.pendingEvent.id;
      check(!!eventId,'fourth hand creates stable event');
      const revision=await store.saveAutoGuarded(pending,0);
      const abortOpen=async()=>{const db=await openDB();return {transaction(...args){const tx=db.transaction(...args);queueMicrotask(()=>tx.abort());return tx;},close(){db.close();}};};
      let aborted=false;try{await make(abortOpen).chooseEvent(pending,'2',revision);}catch(_){aborted=true;}
      check(aborted&&(await store.readAutoRevision())===revision,'aborted event writes no wallet or receipt');
      const outcomes=await Promise.allSettled([store.chooseEvent(pending,'2',revision),tab.chooseEvent(pending,'2',revision)]);
      check(outcomes.filter(x=>x.status==='fulfilled').length===1,'concurrent event choice commits exactly once');
      const saved=outcomes.find(x=>x.status==='fulfilled').value;
      check(saved.envelope.gameState.cultivation.expedition.pendingEvent===null,'event cleared only after committed choice');
      check(JSON.stringify(pending)===original,'transaction leaves caller state unchanged');
      let replay=false;try{await tab.chooseEvent(pending,'1',saved.revision);}catch(_){replay=true;}
      check(replay,'old manual event cannot replay with current revision');
      const migrated=structuredClone(combat);delete migrated.expedition;delete migrated.players[0].expeditionEffect;
      const anchor=await store.initializeExpedition(pack(migrated));
      check(anchor.completed===4&&anchor.pendingEvent===null,'old manual save reuses committed activation and event state');
      const duplicate=await store.settle(pending,saved.revision);
      check(duplicate.duplicate&&(await store.readProfile()).xp===profile.xp,'old settled hand never mints XP');
      check(X.validateProfile(await store.readExpeditionProfile()),'permanent expedition profile remains separate and valid');
      const differentJourney=structuredClone(pending);
      differentJourney.gameState.cultivation.progression.journeyId='other-journey-same-seed';
      await store.initializeExpedition(differentJourney);
      const otherRevision=await store.saveAutoGuarded(differentJourney,saved.revision);
      const otherEvent=await store.chooseEvent(differentJourney,'leave',otherRevision);
      check(otherEvent.envelope.gameState.cultivation.expedition.pendingEvent===null,
        'distinct journey UUIDs isolate event receipts even when their seeded event IDs collide');
      return checks;
    });
    assert.ok(checks.length>=16);console.log(checks);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
