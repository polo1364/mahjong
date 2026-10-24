// Full legal browser games: observe combat, select only our legal actions, click real controls.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const label = process.argv.find(x=>x.startsWith('--label='))?.slice(8) || 'current';
assert.match(label,/^[a-z0-9-]+$/);
const count = Number(process.argv.find(x=>x.startsWith('--games='))?.slice(8) || 6);
const firstSeed = Number(process.argv.find(x=>x.startsWith('--seed='))?.slice(7) || 23001);
const out = path.join(__dirname,'../artifacts');
const report = {date:'2026-10-23',label,method:'Complete legal browser games; UI clicks, seeded shuffle/combat, faster presentation only; isolated browser storage',games:[],errors:[]};

(async()=>{
  const browser = await chromium.launch({headless:true});
  try {
    for(let game=0;game<count;game++) {
      const seed=firstSeed+game;
      const [width,height]=[[1440,900],[390,844],[844,390]][game%3];
      const context=await browser.newContext({viewport:{width,height}});
      await context.addInitScript(seed=>{
        let rng=seed;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
        crypto.getRandomValues=values=>{values[0]=seed;return values;};
        localStorage.setItem('qinghe_feedback_v1',JSON.stringify({sound:false,voice:false,ambience:false,reduced:true,style:'off'}));
      },seed);
      const page=await context.newPage();
      page.on('pageerror',e=>report.errors.push({seed,message:e.message}));
      await page.goto(process.env.MAHJONG_URL||'http://127.0.0.1:8765');
      await page.evaluate(()=>{
        window.playAudit={events:[],errors:[]};
        const original=MahjongCultivationCombat;
        window.MahjongCultivationCombat={...original,apply(before,event){
          const result=original.apply(before,event),after=result.state,fx=result.effects;
          const check=(condition,message)=>{if(!condition)playAudit.errors.push({seq:event.id,message});};
          for(let pid=0;pid<4;pid++) {
            const scored=fx.filter(e=>e.type==='damage'&&e.pid===pid).reduce((n,e)=>n+e.amount,0);
            check(after.players[pid].damage-before.players[pid].damage===scored,`score ownership ${pid}`);
            check(after.players[pid].hp>=0&&after.players[pid].hp<=1000,`HP range ${pid}`);
          }
          const enemy=fx.find(e=>e.type==='enemy');
          if(enemy) {
            const active=before.players.filter(p=>p.hp>0);
            const targets=enemy.attackType==='all'?active.map(p=>p.pid):active.sort((a,b)=>b.aggro-a.aggro||a.pid-b.pid).slice(0,1).map(p=>p.pid);
            check(JSON.stringify(enemy.targets)===JSON.stringify(targets),'highest aggro/weak targeting');
            check(event.type==='enemy'&&before.discardCount>=4,'attack clock');
          }
          if(event.type==='meld') {
            const skill=MahjongCultivationSkills.find(event.action,event.keys||event.key);
            check(fx.filter(e=>e.type==='skill').length===1,'one committed meld = one cast');
            check(fx.find(e=>e.type==='skill')?.name===(event.pid!==0&&event.action==='concealed'?'秘術':skill.name),'correct meld skill');
          }
          if(after.ended) {
            const expected=after.players.map(p=>({pid:p.pid,damage:p.damage,rank:1+after.players.filter(q=>q.damage>p.damage).length})).sort((a,b)=>b.damage-a.damage||a.pid-b.pid);
            check(JSON.stringify(after.result.ranking)===JSON.stringify(expected),'damage ranking and ties');
          }
          playAudit.events.push({event,monster:before.monster.id,element:before.monster.element,
            before:before.players.map(p=>({hp:p.hp,shield:p.shield,damage:p.damage,aggro:p.aggro})),fx,
            after:after.players.map(p=>({hp:p.hp,shield:p.shield,damage:p.damage,aggro:p.aggro}))});
          return result;
        }};
        MahjongPrefs.pace=.025;
      });
      await page.locator('#startGameBtn').click();await page.locator('#cultivationModeBtn').click();
      await page.evaluate(()=>MahjongOpening.finish('playtest-skip'));
      await page.waitForFunction(()=>S.phase!=='deal');
      let clicks=0,choiceIndex=0,steps=0;
      for(;steps<1500;steps++) {
        if(steps===10 && game<3)await page.screenshot({path:path.join(out,`cultivation-table-${label}-${seed}.png`)});
        const action=await page.evaluate(()=>{
          if(S.phase==='end')return {end:true};
          const physical=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])];
          if(S.lastDiscard&&!physical.some(t=>t.id===S.lastDiscard.tile.id))physical.push(S.lastDiscard.tile);
          if(physical.length!==144||new Set(physical.map(t=>t.id)).size!==144)throw Error('physical tile loss/duplication');
          if(document.getElementById('cultivationChoice'))return {choice:true};
          const enabled=id=>!document.getElementById(id).disabled;
          if(enabled('btnHu'))return {selector:'#btnHu'};
          if(S.waitReact) {
            if(!S.currentReactions)return null;
            const plans=S.currentReactions.filter(r=>r.type!=='hu').map(chooseAIReaction).filter(Boolean).sort(compareAIPlans);
            const plan=plans[0];
            if(plan){const type=plan.reaction.type;return {selector:'#btn'+({chow:'Chow',pong:'Pong',kong:'Kong'}[type]),choice:type==='chow'?plan.reaction.patterns.findIndex(p=>p.join()===plan.pattern.join()):0};}
            return enabled('btnPass')?{selector:'#btnPass'}:null;
          }
          if(S.turn!==0)return null;
          if(enabled('btnKong')) {
            const options=[...canAddedKong(0).map(k=>({action:'added',key:k.key,index:k.meldIndex})),...canConcealedKong(0).map(key=>({action:'concealed',key}))];
            const usable=options.map((o,index)=>({...o,indexInDialog:index})).filter(o=>aiKongKeepsShape(0,o.key,o.action==='added'?o.index:-1)).sort((a,b)=>cultivationSkillValue(0,b.action,b.key)-cultivationSkillValue(0,a.action,a.key));
            if(usable.length)return {selector:'#btnKong',choice:usable[0].indexInDialog};
          }
          const tile=aiChooseDiscard(0);
          return tile?{selector:`#yourHand button[onclick="onClickYourTile(${S.players[0].hand.indexOf(tile)})"]`}:null;
        });
        if(action?.end)break;
        if(action?.choice===true) {
          await page.locator('#cultivationChoice .cult-choice-option').nth(choiceIndex).click();clicks++;
        } else if(action?.selector) {
          choiceIndex=action.choice||0;
          await page.locator(action.selector).click({timeout:3000});clicks++;
        } else await page.waitForTimeout(15);
      }
      assert.ok(steps<1500,`seed ${seed} stalled`);
      await page.waitForSelector('.cult-result');
      const snapshot=await page.evaluate(()=>{
        const c=S.cultivation;
        return {phase:S.phase,hu:S.winner,result:c.result,players:c.players,kills:c.kills,seq:c.seq,
          uiRanks:[...document.querySelectorAll('.cult-result .result-player')].map(row=>row.getAttribute('aria-label')),
          audit:playAudit};
      });
      assert.equal(snapshot.phase,'end');
      for(const row of snapshot.result.ranking)assert.ok(snapshot.uiRanks[row.pid].includes(`第 ${row.rank} 名`)&&snapshot.uiRanks[row.pid].includes(row.damage.toLocaleString('zh-TW')),'visible result rank/score');
      await page.screenshot({path:path.join(out,`cultivation-play-${label}-${seed}.png`)});
      const eventFile=`cultivation-play-${label}-${seed}.json`;
      fs.writeFileSync(path.join(out,eventFile),JSON.stringify(snapshot,null,2));
      const events=snapshot.audit.events;
      const row={seed,viewport:[width,height],clicks,reason:snapshot.result.reason,hu:snapshot.hu,
        huWon:snapshot.hu!==null&&snapshot.result.ranking.find(p=>p.pid===snapshot.hu).rank===1,
        ranking:snapshot.result.ranking,damage:snapshot.players.map(p=>p.damage),weak:snapshot.players.map(p=>p.weakCount),kills:snapshot.kills.length,
        casts:events.filter(e=>e.event.type==='meld').length,enemy:events.filter(e=>e.event.type==='enemy').length,events:events.length,errors:snapshot.audit.errors,eventFile};
      report.games.push(row);console.log(JSON.stringify(row));
      fs.writeFileSync(path.join(out,`cultivation-playthrough-${label}.json`),JSON.stringify(report,null,2));
      await context.close();
    }
    report.passed=report.errors.length===0&&report.games.every(g=>g.errors.length===0);
    fs.writeFileSync(path.join(out,`cultivation-playthrough-${label}.json`),JSON.stringify(report,null,2));
    assert.ok(report.passed,JSON.stringify(report.games.flatMap(g=>g.errors)));
  } finally {await browser.close();}
})().catch(error=>{fs.writeFileSync(path.join(out,`cultivation-playthrough-${label}-failure.json`),JSON.stringify({...report,failure:error.stack},null,2));console.error(error);process.exitCode=1;});
