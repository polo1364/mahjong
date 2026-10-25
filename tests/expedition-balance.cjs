/* Legal Mahjong expedition calibration; no fixture gear or forced wins. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {game} = require('./game-harness.cjs');
const H = require('../cultivation-heroes.js');
const M = require('../cultivation-monsters.js');
const P = require('../cultivation-progression.js');
const E = require('../cultivation-equipment.js');
const Economy = require('../cultivation-economy.js');
const SCORING = require('../cultivation-expedition.js').scoring;
const root = path.join(__dirname,'..');
const scriptFiles=['cultivation-skills.js','cultivation-finishers.js','cultivation-heroes.js','cultivation-monster-skills.js','cultivation-monsters.js','cultivation-progression.js','cultivation-expedition.js','cultivation-equipment.js','cultivation-items.js','cultivation-economy.js','cultivation-combat.js'];
const frozenScripts=Object.fromEntries(scriptFiles.map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
const snap = (run, expression) => JSON.parse(run(`JSON.stringify(${expression})`));
function legalHand(run,timers) {
  let steps=0;
  const advance=run(`(()=>{cancelGameTimers();if(S.waitReact)handleAIReaction(S.waitReact);else stepAI();return S.phase!=='end';})`);
  while(run(`S.phase!=='end'`) && steps++<650) {
    if(advance()) { const timer=timers.entries().next().value; if(timer){timers.delete(timer[0]);timer[1]();} }
  }
  assert.ok(steps<650,'Legal hand stalled');
  assert.equal(run(`{const a=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])];if(S.lastDiscard&&!a.some(t=>t.id===S.lastDiscard.tile.id))a.push(S.lastDiscard.tile);a.length===144&&new Set(a.map(t=>t.id)).size===144}`),true,'144 unique legal tiles');
  return steps;
}
function ai(run){run(`stepAI=eval('('+stepAI.toString().replace(' || S.turn === 0','')+')');`);}
function write(name,data){fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts',name),JSON.stringify(data,null,2));}
function baseline(){
  const file=path.join(root,'cultivation-combat.js');
  const original=fs.readFileSync(file,'utf8');

  const rows=[];
  for(let i=0;i<H.all.length;i++){
    const seed=410001+i*101,heroId=H.all[i].id;
    const {run,timers}=game(seed,{cultivation:true,heroId,equipment:true,scriptOverrides:frozenScripts});
    ai(run); run(`startNewHand(true,null,${JSON.stringify({heroId,equipment:true})});`);
    assert.equal(run('S.cultivation.players.every(p=>Object.values(p.equipment).every(v=>v===null))'),true,'Baseline has no equipped items');
    const first=snap(run,'S.cultivation.monster'); if(!M.get(first.speciesId)) throw Error(JSON.stringify({first,heroId,version:run('S.cultivation.version')})); const baseHp=M.get(first.speciesId).hp;
    legalHand(run,timers);
    const damage=run('S.cultivation.expedition.metrics.reduce((n,m)=>n+m.damage,0)');
    rows.push({heroId,seed,firstSpeciesId:first.speciesId,baseHp,effectiveDamage:damage,index:damage/baseHp*100});
  }
  const values=rows.map(r=>r.index).sort((a,b)=>a-b),A=(values[4]+values[5])/2,B=A*1.6;
  const report={scope:'Ten unequipped fresh hero teams; one legal AI hand per hero. Production metrics of actual monster HP and shield loss, with overkill excluded. Fresh journey and no progression grants.',sourceHashes:Object.fromEntries(Object.entries(frozenScripts).map(([f,s])=>[f,crypto.createHash('sha256').update(s).digest('hex')])),combatSourceHash:crypto.createHash('sha256').update(original).digest('hex'),A,B,rows};
  write('expedition-baseline.json',report);console.log(JSON.stringify(report));
}
if(require.main===module&&process.argv[2]==='baseline') baseline();
module.exports={legalHand,ai,snap,baseline};




function command(run, state, type, extra = {}) {
  const cmd = {commandId:`balance-${++state.command}`, pid:0, type, ...extra};
  const result = snap(run, `(()=>{const x=window.MahjongCultivationEconomy.transact(S.cultivation,${JSON.stringify(cmd)});if(x.result.ok)S.cultivation=x.state;return x.result})()`);
  assert.equal(result.ok, true, `${type}: ${result.code}`);
  state.transactions++;
}
function gearPolicy(run, state) {
  // Every item here comes from the actual journey economy. Commands use production transactions.
  let p = snap(run, 'S.cultivation.players[0]');
  for (const set of E.sets) {
    while (p.economy.seals[set.id] >= 2) {
      const missing = E.slots.find(slot => !p.economy.inventory.some(item => item.catId === `set-${set.id}-${slot}`));
      if (!missing) break;
      command(run, state, 'redeem', {setId:set.id, slot:missing});
      p = snap(run, 'S.cultivation.players[0]');
    }
  }
  const empty = E.slots.filter(slot => !p.equipment[slot]);
  for (const slot of empty) {
    const stock = p.economy.shop.stock.filter(item => !item.sold && E.get(item.catId).slot === slot && p.economy.gold - item.price >= 30).sort((a,b) => b.grade-a.grade)[0];
    if (stock) { command(run, state, 'buy', {stockId:stock.id}); p = snap(run, 'S.cultivation.players[0]'); }
  }
  const planned = structuredClone(p);
  Economy.selectGear(planned);
  for (const slot of E.slots) if (planned.equipment[slot] && planned.equipment[slot] !== p.equipment[slot]) {
    command(run, state, 'equip', {uid:planned.equipment[slot]});
    p = snap(run, 'S.cultivation.players[0]');
  }
  for (let n=0;n<3;n++) {
    const items = E.slots.map(slot => p.economy.inventory.find(item => item.uid === p.equipment[slot])).filter(Boolean).sort((a,b) => a.level-b.level);
    const item = items[0];
    if (!item || item.level >= 10) break;
    // Public costs live on Economy rather than Equipment.
    const costs = snap(run, `[window.MahjongCultivationEconomy.goldCosts[${item.level}],window.MahjongCultivationEconomy.sandCosts[${item.level}]]`);
    if (p.economy.gold-costs[0] < 30 || p.economy.sand < costs[1]) break;
    command(run, state, 'forge', {uid:item.uid});
    p = snap(run, 'S.cultivation.players[0]');
  }
}

function journey(cohort,index,replicate,hands=80){
  const seed=(cohort==='calibration'?1510001:1610001)+index*1009+replicate*100003,heroId=H.all[index].id,journeyId=`expedition-${seed}`;
  const {run,timers}=game(seed,{cultivation:true,heroId,equipment:true,scriptOverrides:frozenScripts}); ai(run);
  let profile=P.fresh(),previous=null;
  run(`startNewHand(true,null,${JSON.stringify({heroId,equipment:true,progression:profile,progressionId:journeyId})});`);
  const row={cohort,heroId,seed,replicate,hands:[],trials:[],command:0,transactions:0,maxRecentFirst32:0};
  for(let n=1;n<=hands;n++){
    if(previous){
      const before=snap(run,'({dealer:S.dealer,initialDealer:S.initialDealer,round:S.round,winner:S.winner,names:S.names})');
      const order=[0,3,1,2],rotate=before.winner!==null&&before.winner!==before.dealer;
      const dealer=rotate?order[(order.indexOf(before.dealer)+1)%4]:before.dealer;
      const round=rotate&&dealer===before.initialDealer?before.round%4+1:before.round;
      run(`startNewHand(false,${JSON.stringify(previous)},${JSON.stringify({heroId,equipment:true,progression:profile,progressionId:journeyId})});`);
      assert.equal(run('S.dealer'),dealer,'Actual winner-dependent dealer rotation');
      assert.equal(run('S.round'),round,'Actual prevailing wind cycle including north to east');
      assert.deepEqual(snap(run,'S.names'),before.names,'Normal hand preserves player names');
      if(before.round===4&&round===1)row.northWraps=(row.northWraps||0)+1;
    }
    legalHand(run,timers);
    try { run(`if(!S.cultivation.expedition.lastResult||S.cultivation.expedition.lastResult.completed<S.cultivation.handNumber){const out=window.MahjongCultivationCombat.finalizeExpedition(S.cultivation,{winner:S.winner,discarder:S.fromPlayer>=0?S.fromPlayer:null,declaredListen:S.players.map(p=>p.declaredListen)});S.cultivation=out.state;}`); } catch(error) { console.error(n,snap(run,"S.cultivation.expedition")); throw error; }
    const completed=snap(run,'S.cultivation'),result=completed.expedition.lastResult;
    assert.equal(completed.handNumber,n);assert.equal(completed.expedition.completed,n);
    row.hands.push({n,...result,metrics:completed.expedition.metrics,actions:completed.expedition.actions,firstMonsterHp:completed.expedition.firstMonsterHp,table:snap(run,'({dealer:S.dealer,round:S.round,initialDealer:S.initialDealer,winner:S.winner,fromPlayer:S.fromPlayer,seatNames})'),realm:profile.realm,kills:completed.kills.length});
    if(n<=32)row.maxRecentFirst32=Math.max(row.maxRecentFirst32,result.recentScore);
    profile={...profile,xp:profile.xp+completed.progression.earned[0]};
    run(`S.cultivation=window.MahjongCultivationCombat.prepare(S.cultivation,{equipment:true})`);gearPolicy(run,row);
    profile=P.configure(profile,P.aiAllocation(heroId,profile));run(`S.cultivation.players[0].progression=${JSON.stringify(profile)}`);
    let parent=snap(run,'S.cultivation');
    if(parent.expedition.pendingEvent){run(`S.cultivation=window.MahjongCultivationExpedition.chooseEvent(S.cultivation,'leave')`);parent=snap(run,'S.cultivation');}
    if(profile.realm<4&&profile.xp>=P.realms[profile.realm+1].xp){
      const parentTable=snap(run,'({S,seatNames,randomNames,customPlayerName,dealerStreak})');
      const targetRealm=profile.realm+1,spec=P.trialSpec(targetRealm),trial={id:`trial-${seed}-${n}`,parentJourneyId:journeyId,...spec};
      run(`startNewHand(true,${JSON.stringify(parent)},${JSON.stringify({trial,progression:profile,progressionId:journeyId})});`);
      const start=snap(run,'S.cultivation');legalHand(run,timers);const end=snap(run,'S.cultivation');
      assert.equal(start.monster.maxHp,Math.round(M.get(spec.targetSpeciesId).hp*spec.lifeScale));assert.equal(end.expedition,undefined);assert.deepEqual(end.progression.earned,[0,0,0,0]);
      assert.deepEqual(end.players.map(p=>p.economy.inventory),start.players.map(p=>p.economy.inventory));
      const passed=end.result.reason==='trial';row.trials.push({n,targetRealm,passed,lifeScale:spec.lifeScale});
      if(passed){const b=P.breakthrough(profile,targetRealm);profile=P.configure(b.profile,P.aiAllocation(heroId,b.profile));parent.players[0].economy.gold+=b.reward.gold;parent.players[0].economy.sand+=b.reward.sand;parent.players[0].progression=structuredClone(profile);}
      run(`S=${JSON.stringify(parentTable.S)};seatNames=${JSON.stringify(parentTable.seatNames)};randomNames=${JSON.stringify(parentTable.randomNames)};customPlayerName=${JSON.stringify(parentTable.customPlayerName)};dealerStreak=${parentTable.dealerStreak};S.cultivation=${JSON.stringify(parent)};`);
      assert.deepEqual(snap(run,'({S,seatNames,randomNames,customPlayerName,dealerStreak})'),{...parentTable,S:{...parentTable.S,cultivation:parent}},'Trial restores full parent table and globals before next rotation');
    }
    previous=parent;
  }
  row.endRealm=profile.realm;row.aiRealms=previous.players.slice(1).map(p=>p.progression.realm);row.ownedItems=previous.players[0].economy.inventory.length;delete row.command;
  return row;
}
if(require.main===module&&['run','suite'].includes(process.argv[2])){
  const suite=process.argv[2]==='suite';
  const cohort=process.argv[3]||'calibration',start=Number(process.argv[4]||0),end=Number(process.argv[5]||10),replicate=Number(process.argv[6]||0),hands=Number(process.argv[7]||80);
  const repeats=suite?5:Number(process.argv[8]||1);
  assert.ok(['calibration','holdout'].includes(cohort));
  const files=['index.html',...scriptFiles,'tests/game-harness.cjs','tests/expedition-balance.cjs'];
  const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
  const sourceHashes=hashes(),rows=[],began=Date.now(),name=`expedition-balance-${cohort}-${start}-${end}-${replicate}-${suite?'suite':hands+(repeats>1?'-x'+repeats:'')}.json`;
  for(let r=replicate;r<replicate+repeats;r++)for(let i=start;i<end;i++){rows.push(journey(cohort,i,r,suite&&r>0?32:hands));write(name,{status:'partial',scoring:SCORING,sourceHashes,rows});console.log(`${cohort} ${H.all[i].id} ${rows.at(-1).hands.length}hands ${Math.round((Date.now()-began)/1000)}s score ${rows.at(-1).maxRecentFirst32}`);}
  const finalHashes=hashes(),sourceDrift=files.filter(f=>sourceHashes[f]!==finalHashes[f]);write(name,{status:sourceDrift.length?'source-drift':'complete',scoring:SCORING,sourceHashes,finalHashes,sourceDrift,elapsedMs:Date.now()-began,rows});
}





function summarize(){
  const names=fs.readdirSync(path.join(root,'artifacts')).filter(f=>/^expedition-balance-(calibration|holdout)-.*\.json$/.test(f));
  const reports=names.map(name=>({name,...JSON.parse(fs.readFileSync(path.join(root,'artifacts',name),'utf8'))}));
  const rows=reports.flatMap(report=>report.rows.map(row=>({...row,file:report.name}))),keys=rows.map(r=>`${r.cohort}:${r.seed}`);
  assert.equal(new Set(keys).size,keys.length,'Duplicate journey seed in summary');
  function fairness(heal=SCORING.heal,shield=SCORING.shield,combatCoefficient=SCORING.combat){return H.all.map(hero=>{
    const groups={};
    for(const cohort of ['calibration','holdout','combined']){
      const group=rows.filter(r=>r.heroId===hero.id&&(cohort==='combined'||r.cohort===cohort));
      const peaks=group.map(r=>{const history=[];let peak=0;for(const hand of r.hands.slice(0,32)){const c=hand.metrics.map(m=>m.damage+heal*m.heal+shield*m.shield),average=c.reduce((a,b)=>a+b,0)/4;history.push(Math.min(70,average?Math.round(combatCoefficient*c[0]/average):0)+hand.scores[0].operation+hand.scores[0].winning);peak=Math.max(peak,history.slice(-3).reduce((a,b)=>a+b,0)/Math.min(3,history.length));}return {seed:r.seed,peak};});
      const n=group.length,sixty=peaks.filter(x=>x.peak>=60).length,seventyFive=peaks.filter(x=>x.peak>=75).length;
      groups[cohort]={n,sixty,seventyFive,rate60:n?sixty/n:0,rate75:n?seventyFive/n:0,pass:n>0&&sixty/n>=.7&&seventyFive/n>=.4,peaks};
    }
    return {heroId:hero.id,name:hero.name,role:hero.role,...groups};
  });}
  const observed=fairness(),candidates=[];
  for(const row of rows){
    const replay=observed.find(hero=>hero.heroId===row.heroId)[row.cohort].peaks.find(p=>p.seed===row.seed);
    assert.ok(Math.abs(replay.peak-row.maxRecentFirst32)<1e-9,'Score replay must match production recent score');
  }
  // A ratio of weighted sums cannot exceed the largest component share.
  // Allowing every hand its own optimal weights is deliberately a loose upper bound.
  const weightUpperBounds=rows.map(row=>{
    const history=[];let peak=0;
    for(const hand of row.hands.slice(0,32)){
      const shares=['damage','heal','shield'].map(key=>{const total=hand.metrics.reduce((n,m)=>n+m[key],0);return total?hand.metrics[0][key]/total:0;});
      history.push(Math.min(70,Math.round(4*SCORING.combat*Math.max(...shares)))+hand.scores[0].operation+hand.scores[0].winning);
      peak=Math.max(peak,history.slice(-3).reduce((a,b)=>a+b,0)/Math.min(3,history.length));
    }
    return {heroId:row.heroId,cohort:row.cohort,seed:row.seed,peak,impossible75ForAnyNonnegativeWeights:peak<75};
  });
  for(const heal of [0,.25,.5,.75,1,1.5,2,3,4,6,8,12,20,40,80,160])for(const shield of [0,.25,.5,.75,1,1.5,2,3,4,6,8,12,20,40,80,160]){
    const heroes=fairness(heal,shield),passing=heroes.filter(h=>h.combined.pass).length,cohortPassing=heroes.reduce((n,h)=>n+Number(h.calibration.pass)+Number(h.holdout.pass),0);
    candidates.push({heal,shield,passing,cohortPassing,heroes});
  }
  candidates.sort((a,b)=>b.heroes.filter(h=>h.calibration.pass).length-a.heroes.filter(h=>h.calibration.pass).length||a.heal+a.shield-b.heal-b.shield);
  const report={scope:'Production legal Mahjong AI; continuous 80-hand journeys cover all five regions. Additional independent 32-hand journeys measure first-two-region unlock fairness. Every item acquired through actual economy; XP and trials follow normal eligibility. Events deliberately choose leave. Weight search is counterfactual score-only replay of recorded real metrics, not new simulation, and cannot certify changed unlock-dependent policies.',
    scoring:SCORING,seedBases:{calibration:1510001,holdout:1610001},reports:reports.map(({name,status,sourceDrift,sourceHashes,finalHashes})=>({name,status,sourceDrift,sourceHashes,finalHashes})),totalNormalHands:rows.reduce((n,r)=>n+r.hands.length,0),fullJourneys:rows.filter(r=>r.hands.length===80).length,totalJourneys:rows.length,trialAttempts:rows.reduce((n,r)=>n+r.trials.length,0),observed,bestWeightSearch:candidates.slice(0,5),allHeroesCombinedPass:observed.every(h=>h.combined.pass),allHeroesEachCohortPass:observed.every(h=>h.calibration.pass&&h.holdout.pass)};
  report.weightUpperBounds=weightUpperBounds;
  report.upperBoundImpossibleByHero=H.all.map(hero=>({heroId:hero.id,name:hero.name,...Object.fromEntries(['calibration','holdout','combined'].map(cohort=>{const group=weightUpperBounds.filter(r=>r.heroId===hero.id&&(cohort==='combined'||r.cohort===cohort));return [cohort,{n:group.length,impossible75:group.filter(r=>r.impossible75ForAnyNonnegativeWeights).length}];}))}));
  report.maxGridCombinedPassing=Math.max(...candidates.map(c=>c.passing));
  report.maxGridCalibrationPassing=Math.max(...candidates.map(c=>c.heroes.filter(h=>h.calibration.pass).length));
  report.maxGridEachCohortPassing=Math.max(...candidates.map(c=>c.cohortPassing));
  report.weightGrid={heal:[0,.25,.5,.75,1,1.5,2,3,4,6,8,12,20,40,80,160],shield:[0,.25,.5,.75,1,1.5,2,3,4,6,8,12,20,40,80,160],selection:'Maximize calibration heroes passing both point targets, then minimize weight sum. Holdout outcomes do not select weights.',results:candidates.map(c=>({heal:c.heal,shield:c.shield,calibrationPassing:c.heroes.filter(h=>h.calibration.pass).length,holdoutPassing:c.heroes.filter(h=>h.holdout.pass).length,combinedPassing:c.passing}))};
  report.coefficientExploration={scope:'Counterfactual only. Production formula and cap70 remain unchanged. Both cohorts inspected to suggest options; not independent validation of a chosen new rule.',rows:[40,45,50,55,60,70,80,100].map(coefficient=>{
    const trials=[];
    for(const heal of report.weightGrid.heal)for(const shield of report.weightGrid.shield){const heroes=fairness(heal,shield,coefficient);trials.push({heal,shield,combinedPassing:heroes.filter(h=>h.combined.pass).length,eachCohortPassing:heroes.filter(h=>h.calibration.pass&&h.holdout.pass).length,calibrationPassing:heroes.filter(h=>h.calibration.pass).length,holdoutPassing:heroes.filter(h=>h.holdout.pass).length});}
    const base=fairness(1.5,1.5,coefficient);
    trials.sort((a,b)=>b.eachCohortPassing-a.eachCohortPassing||b.combinedPassing-a.combinedPassing||a.heal+a.shield-b.heal-b.shield);
    return {coefficient,baseWeights:{heal:1.5,shield:1.5,combinedPassing:base.filter(h=>h.combined.pass).length,eachCohortPassing:base.filter(h=>h.calibration.pass&&h.holdout.pass).length},bestExploratory:trials[0]};
  })};
  report.coefficientExploration.baseIntegerScan=Array.from({length:26},(_,i)=>{
    const coefficient=35+i,heroes=fairness(1.5,1.5,coefficient);
    return {coefficient,calibrationPassing:heroes.filter(h=>h.calibration.pass).length,holdoutPassing:heroes.filter(h=>h.holdout.pass).length,combinedPassing:heroes.filter(h=>h.combined.pass).length,eachCohortPassing:heroes.filter(h=>h.calibration.pass&&h.holdout.pass).length};
  });
  write('expedition-balance-summary.json',report);
  const lines=['# 巡歷合法對局校準','',`正常局 ${report.totalNormalHands}，完整80局旅程 ${report.fullJourneys}，總旅程 ${report.totalJourneys}，獨立渡劫 ${report.trialAttempts}。`,'','| 角色 | 校準60/75 | 保留60/75 | 合計60/75 |','|---|---|---|---|',...observed.map(h=>`| ${h.name}（${h.role}） | ${h.calibration.sixty}/${h.calibration.n}；${h.calibration.seventyFive}/${h.calibration.n} | ${h.holdout.sixty}/${h.holdout.n}；${h.holdout.seventyFive}/${h.holdout.n} | ${h.combined.sixty}/${h.combined.n}；${h.combined.seventyFive}/${h.combined.n} |`),'',`正式係數${SCORING.combat}、支援權重${SCORING.heal}/${SCORING.shield}達成全英雄合計門檻：${report.allHeroesCombinedPass}；各組門檻：${report.allHeroesEachCohortPass}。`,`校準組選出權重：治療 ${candidates[0].heal}、護盾 ${candidates[0].shield}，合計通過 ${candidates[0].passing}/10、分組通過 ${candidates[0].cohortPassing}/20。`,'','樣本為點估，不能保證母體率。完整種子、逐局原始metrics、來源SHA-256與漂移列於JSON；權重重播只改評分，不改已發生對局，不可宣稱重測完成。'];
  lines.push('',`256組非負支援權重網格：最多合計通過 ${report.maxGridCombinedPassing}/10 角色；此為已測範圍結果，不代表所有實數權重的全域證明。`,'','## 公式改動的離線探索（未實作，非新驗收）','','維持支援權重1.5、戰鬥上限70及60/75門檻，只更動戰鬥係數：','','| 係數 | 合計兩門檻均過角色 | 校準、保留兩組均過角色 |','|---:|---:|---:|',...report.coefficientExploration.rows.map(r=>`| ${r.coefficient} | ${r.baseWeights.combinedPassing}/10 | ${r.baseWeights.eachCohortPassing}/10 |`),'','## 任何非負支援權重都無法達到75的已測旅程上界','','| 角色 | 不可能75旅程 / 全部旅程 |','|---|---:|',...report.upperBoundImpossibleByHero.map(h=>`| ${h.name} | ${h.combined.impossible75}/${h.combined.n} |`),'','上界讓每一局各自採用最佳傷害、治療或護盾占比，已比單一固定權重更寬鬆。僅證明所列旅程不可能75，不能單獨推論全部角色40%達標率不可能。');
  fs.writeFileSync(path.join(root,'artifacts','expedition-balance-summary.md'),lines.join('\n'));console.log(JSON.stringify({totalNormalHands:report.totalNormalHands,fullJourneys:report.fullJourneys,totalJourneys:report.totalJourneys,allHeroesCombinedPass:report.allHeroesCombinedPass,best:{heal:candidates[0].heal,shield:candidates[0].shield,passing:candidates[0].passing,cohortPassing:candidates[0].cohortPassing}}));
}
if(require.main===module&&process.argv[2]==='summarize')summarize();
