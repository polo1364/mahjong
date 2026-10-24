/* Reproducible legal-hand cultivation pacing and first-attempt trial benchmark. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {game} = require('./game-harness.cjs');
const P = require('../cultivation-progression.js');
const E = require('../cultivation-equipment.js');
const Economy = require('../cultivation-economy.js');
const H = require('../cultivation-heroes.js');

const replayMode = process.argv[2] === 'replay';
const finalSummaryMode = process.argv[2] === 'summarize-final';
const round2ReplayMode = process.argv[2] === 'replay-round2';
const round3SummaryMode = process.argv[2] === 'summarize-round3';
const round2CalibrationOnlyMode = process.argv[2] === 'calibrate-round2';
const cohorts = Number(process.argv[2] || 2);
const maxHands = Number(process.argv[3] || 210);
const cohortStart = Number(process.argv[4] || 0);
const heroStart = Number(process.argv[5] || 0);
const heroEnd = Number(process.argv[6] || H.all.length);
const runLabel = process.argv[7] || '';
if (!replayMode && !finalSummaryMode && !round2ReplayMode && !round3SummaryMode && !round2CalibrationOnlyMode && (![1, 2].includes(cohorts) || !Number.isInteger(maxHands) || maxHands < 9 ||
    ![0,1].includes(cohortStart) || cohortStart+cohorts>2 ||
    !Number.isInteger(heroStart) || !Number.isInteger(heroEnd) || heroStart<0 || heroEnd>H.all.length || heroStart>=heroEnd || !['','final','round2','round2-extra','round3','round3-extra'].includes(runLabel)))
  throw Error('Usage: node tests/progression-balance.cjs [cohorts:1|2] [maxHands>=9] [cohortStart:0|1] [heroStart] [heroEnd] [final|round2|round2-extra|round3|round3-extra]');
const root = path.join(__dirname, '..');
const suffix = cohortStart===0&&cohorts===2&&heroStart===0&&heroEnd===H.all.length?'':`-${cohortStart}-${cohortStart+cohorts-1}-${heroStart}-${heroEnd-1}`;
const artifactPrefix = `progression-balance${runLabel?'-'+runLabel:''}`;
const output = path.join(root, 'artifacts', `${artifactPrefix}${suffix}.json`);
const parentsOutput = path.join(root, 'artifacts', `${artifactPrefix}-parents${suffix}.json`);
const legacyFiles = ['index.html', 'cultivation-progression.js', 'cultivation-combat.js', 'cultivation-economy.js', 'cultivation-equipment.js', 'cultivation-heroes.js', 'tests/game-harness.cjs'];
const completeFiles = ['index.html','tile-names.js','crystal-tiles.js','cultivation-skills.js','cultivation-finishers.js',
  'cultivation-heroes.js','cultivation-monster-skills.js','cultivation-monsters.js','cultivation-progression.js',
  'cultivation-equipment.js','cultivation-items.js','cultivation-economy.js','cultivation-combat.js',
  'tests/game-harness.cjs','tests/progression-balance.cjs'];
const files = ['round3','round3-extra'].includes(runLabel)||round3SummaryMode?completeFiles:legacyFiles;
const hashes = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
const targets = [.60, .40, .30, .20];
const milestones = [0, 100, 400, 1000, 2200];
const started = Date.now();
const rows = [];
const parents = [];
function snapshot(run, expression) { return JSON.parse(run(`JSON.stringify(${expression})`)); }
function nextTimer(timers) { const entry = timers.entries().next().value; if (entry) { timers.delete(entry[0]); entry[1](); } }
function checkTiles(run, label) {
  assert.equal(run(`{const all=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])];if(S.lastDiscard&&!all.some(t=>t.id===S.lastDiscard.tile.id))all.push(S.lastDiscard.tile);all.length===144&&new Set(all.map(t=>t.id)).size===144&&window.MahjongCultivationCombat.validate(S.cultivation);}`), true, label);
}
function hand(run, timers, label) {
  let steps = 0;
  checkTiles(run, label + ' start');
  while (run(`S.phase!=='end'`) && steps++ < 650) {
    run('cancelGameTimers(); if(S.waitReact) handleAIReaction(S.waitReact); else stepAI();');
    if (run(`S.phase!=='end'`)) nextTimer(timers);
    if (steps % 32 === 0) checkTiles(run, label + ' step ' + steps);
  }
  assert.ok(steps < 650, label + ' stalled');
  checkTiles(run, label + ' end');
  return steps;
}
function command(run, state, type, extra = {}) {
  const cmd = {commandId:`balance-${++state.command}`, pid:0, type, ...extra};
  const result = snapshot(run, `(()=>{const x=window.MahjongCultivationEconomy.transact(S.cultivation,${JSON.stringify(cmd)});if(x.result.ok)S.cultivation=x.state;return x.result})()`);
  assert.equal(result.ok, true, `${type}: ${result.code}`);
  state.transactions++;
}
function gearPolicy(run, state) {
  // Every item here comes from the actual journey economy. Commands use production transactions.
  let p = snapshot(run, 'S.cultivation.players[0]');
  for (const set of E.sets) {
    while (p.economy.seals[set.id] >= 2) {
      const missing = E.slots.find(slot => !p.economy.inventory.some(item => item.catId === `set-${set.id}-${slot}`));
      if (!missing) break;
      command(run, state, 'redeem', {setId:set.id, slot:missing});
      p = snapshot(run, 'S.cultivation.players[0]');
    }
  }
  const empty = E.slots.filter(slot => !p.equipment[slot]);
  for (const slot of empty) {
    const stock = p.economy.shop.stock.filter(item => !item.sold && E.get(item.catId).slot === slot && p.economy.gold - item.price >= 30).sort((a,b) => b.grade-a.grade)[0];
    if (stock) { command(run, state, 'buy', {stockId:stock.id}); p = snapshot(run, 'S.cultivation.players[0]'); }
  }
  const planned = structuredClone(p);
  Economy.selectGear(planned);
  for (const slot of E.slots) if (planned.equipment[slot] && planned.equipment[slot] !== p.equipment[slot]) {
    command(run, state, 'equip', {uid:planned.equipment[slot]});
    p = snapshot(run, 'S.cultivation.players[0]');
  }
  for (let n=0;n<3;n++) {
    const items = E.slots.map(slot => p.economy.inventory.find(item => item.uid === p.equipment[slot])).filter(Boolean).sort((a,b) => a.level-b.level);
    const item = items[0];
    if (!item || item.level >= 10) break;
    // Public costs live on Economy rather than Equipment.
    const costs = snapshot(run, `[window.MahjongCultivationEconomy.goldCosts[${item.level}],window.MahjongCultivationEconomy.sandCosts[${item.level}]]`);
    if (p.economy.gold-costs[0] < 30 || p.economy.sand < costs[1]) break;
    command(run, state, 'forge', {uid:item.uid});
    p = snapshot(run, 'S.cultivation.players[0]');
  }
}
function wilson(successes, n) {
  if (!n) return null;
  const z=1.96, q=successes/n, d=1+z*z/n, c=(q+z*z/(2*n))/d, h=z*Math.sqrt(q*(1-q)/n+z*z/(4*n*n))/d;
  return [Math.max(0,c-h),Math.min(1,c+h)];
}
if (replayMode) {
  const allowEquivalentAiDrift=process.argv[3]==='--equivalent-ai-next-threshold';
  const fragments = [[0,0,4],[0,5,9],[1,0,4],[1,5,9]];
  const readFragment=([cohort,first,last],parents=false)=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',`progression-balance-${parents?'parents-':''}${cohort}-${cohort}-${first}-${last}.json`),'utf8'));
  const reports=fragments.slice(0,2).map(f=>readFragment(f));
  const parentFiles=fragments.slice(0,2).map(f=>readFragment(f,true));
  assert.ok(reports.every((r,i)=>['complete','core-source-drift'].includes(r.status)&&r.rows.length===fragments[i][2]-fragments[i][1]+1),'Full calibration journeys required');
  const sourceHashes=reports[0].sourceHashes;
  for (let n=0;n<reports.length;n++) {
    assert.deepEqual(parentFiles[n].sourceHashes,reports[n].sourceHashes,'Parent/report source mismatch');
    for (const file of files.filter(file=>!['index.html','tests/game-harness.cjs'].includes(file)))
      assert.equal(reports[n].sourceHashes[file],sourceHashes[file],`Mixed core revision ${file}`);
  }
  let mixedHarnessOrPage=files.filter(file=>reports.some(r=>r.sourceHashes[file]!==sourceHashes[file]));
  const allRows=reports.flatMap(r=>r.rows),allParents=parentFiles.flatMap(r=>r.parents);
  assert.equal(allRows.length,10);
  assert.equal(new Set(allRows.map(r=>r.seed)).size,10);
  const progressionSource=fs.readFileSync(path.join(root,'cultivation-progression.js'),'utf8');
  const addedLine='    if (handNumber!==undefined && realm<4 && next.xp>=realms[realm+1].xp) next.eligibleHand=handNumber;\n';
  const stripped=progressionSource.replace(addedLine,'');
  const strippedHash=crypto.createHash('sha256').update(stripped).digest('hex');
  const equivalentAiDrift=allowEquivalentAiDrift && stripped!==progressionSource &&
    strippedHash===sourceHashes['cultivation-progression.js'] &&
    reports.every(r=>r.sourceDrift.every(file=>['index.html','tests/game-harness.cjs','cultivation-progression.js'].includes(file)));
  assert.ok(reports.every(r=>r.status==='complete')||equivalentAiDrift,'Unreviewed core source drift');
  for (const file of files.filter(file=>!['index.html','tests/game-harness.cjs'].includes(file)))
    if (file!=='cultivation-progression.js'||!equivalentAiDrift)
      assert.equal(hashes[file],sourceHashes[file],`Current core differs from journey source: ${file}`);
  const baseHp=realm=>require('../cultivation-monsters.js').get(P.trialSpec(realm).targetSpeciesId).hp;
  const stages=[1,2,3,4].map(realm=>{
    const calibration=allRows.map(r=>r.trials.find(t=>t.targetRealm===realm)).filter(Boolean);
    const nominal=P.trialSpec(realm).lifeScale, needed=Math.ceil(targets[realm-1]*calibration.length);
    const damage=calibration.map(t=>t.observedTargetDamage).sort((a,b)=>b-a);
    const proposal=calibration.length===10 && calibration.filter(t=>t.passed).length<needed
      ? Math.max(.05,Math.min(nominal,Math.floor((damage[needed-1]/baseHp(realm))*20)/20)) : nominal;
    return {realm,target:targets[realm-1],nominal,proposal,calibrationFirstAttempts:calibration.length,calibrationNominalPasses:calibration.filter(t=>t.passed).length,calibrationSearch:[],replay:[]};
  });
  function replayTrial(record,scale) {
    const pattern=new RegExp(`\\{targetRealm:${record.targetRealm},targetSpeciesId:'[^']+',lifeScale:[0-9.]+\\}`);
    const original=progressionSource.match(pattern)?.[0];
    assert.ok(original,'Trial spec source shape changed');
    const override=progressionSource.replace(original,original.replace(/lifeScale:[0-9.]+/,`lifeScale:${scale}`));
    const {run,timers}=game(record.seed,{cultivation:true,heroId:record.heroId,equipment:true,scriptOverrides:{'cultivation-progression.js':override}});
    run(`stepAI=eval('('+stepAI.toString().replace(' || S.turn === 0','')+')');seed=${record.mahjongRng};`);
    const trial={id:`balance-replay-${record.seed}-${record.targetRealm}`,parentJourneyId:record.parent.progression.journeyId,
      ...P.trialSpec(record.targetRealm),lifeScale:scale};
    run(`startNewHand(true,${JSON.stringify(record.parent)},${JSON.stringify({trial,progression:record.profile,progressionId:trial.parentJourneyId})});`);
    hand(run,timers,`replay ${record.cohort} ${record.heroId} realm ${record.targetRealm}`);
    const result=snapshot(run,'S.cultivation');
    return {passed:result.result.reason==='trial',reason:result.result.reason,monsterHp:result.monster.hp};
  }
  const nominalCalibration=new Map();
  for (const record of allParents) {
    assert.equal(record.cohort,'calibration');
    const original=allRows.find(r=>r.seed===record.seed).trials.find(t=>t.targetRealm===record.targetRealm);
    const nominal=replayTrial(record,stages[record.targetRealm-1].nominal);
    assert.ok(nominal.passed===original.passed&&nominal.monsterHp===original.monsterHp,`Nominal calibration replay differed: ${record.seed} realm ${record.targetRealm}`);
    nominalCalibration.set(`${record.seed}:${record.targetRealm}`,nominal);
  }
  for (const stage of stages) {
    const candidates=allParents.filter(record=>record.targetRealm===stage.realm);
    assert.equal(candidates.length,10,`Calibration parents missing realm ${stage.realm}`);
    const needed=Math.ceil(stage.target*candidates.length);
    const runAt=scale=>candidates.map(record=>{
      const nominal=nominalCalibration.get(`${record.seed}:${record.targetRealm}`);
      const proposed=scale===stage.nominal?nominal:replayTrial(record,scale);
      return {cohort:'calibration',seed:record.seed,heroId:record.heroId,hand:record.hand,scale,nominalMatchesOriginal:true,...proposed};
    });
    let scale=stage.proposal;
    while (true) {
      stage.replay=runAt(scale);
      const successes=stage.replay.filter(result=>result.passed).length;
      stage.calibrationSearch.push({scale,successes,n:candidates.length});
      if(successes>=needed)break;
      if(scale<=.05)throw Error(`Calibration target unreachable at minimum tested scale: realm ${stage.realm}`);
      scale=Math.max(.05,Number((scale-.05).toFixed(2)));
    }
    // Keep the largest tested scale that passes, so the suggested trial changes as little as possible.
    while (scale<stage.nominal) {
      const nextScale=Math.min(stage.nominal,Number((scale+.05).toFixed(2)));
      const next=runAt(nextScale),successes=next.filter(result=>result.passed).length;
      stage.calibrationSearch.push({scale:nextScale,successes,n:candidates.length});
      if(successes<needed)break;
      stage.replay=next;scale=nextScale;
    }
    stage.proposal=scale;
  }
  const calibrationPath=path.join(root,'artifacts','progression-balance-calibration.json');
  fs.writeFileSync(calibrationPath,JSON.stringify({status:'frozen-before-holdout',sourceHashes,finalHashes:hashes,
    scope:'Only ten calibration heroes and their first-eligible legal-journey parents were inspected. Frozen scales are selected before loading holdout files.',
    stages:stages.map(({realm,target,nominal,proposal,calibrationFirstAttempts,calibrationNominalPasses,calibrationSearch})=>({realm,target,nominal,proposal,calibrationFirstAttempts,calibrationNominalPasses,calibrationSearch}))},null,2));
  const holdoutReports=fragments.slice(2).map(f=>readFragment(f));
  const holdoutParentFiles=fragments.slice(2).map(f=>readFragment(f,true));
  assert.ok(holdoutReports.every((r,i)=>['complete','core-source-drift'].includes(r.status)&&r.rows.length===fragments[i+2][2]-fragments[i+2][1]+1),'Full holdout journeys required');
  for(let i=0;i<holdoutReports.length;i++) {
    const result=holdoutReports[i];
    assert.deepEqual(holdoutParentFiles[i].sourceHashes,result.sourceHashes,'Holdout parent/report source mismatch');
    for (const file of files.filter(file=>!['index.html','tests/game-harness.cjs'].includes(file)))
      assert.equal(result.sourceHashes[file],sourceHashes[file],`Mixed holdout core revision ${file}`);
    assert.ok(result.status==='complete'||equivalentAiDrift&&result.sourceDrift.every(file=>['index.html','tests/game-harness.cjs','cultivation-progression.js'].includes(file)),'Unreviewed holdout source drift');
  }
  reports.push(...holdoutReports);parentFiles.push(...holdoutParentFiles);
  allRows.push(...holdoutReports.flatMap(r=>r.rows));allParents.push(...holdoutParentFiles.flatMap(r=>r.parents));
  assert.equal(allRows.length,20);assert.equal(new Set(allRows.map(r=>r.seed)).size,20);
  mixedHarnessOrPage=files.filter(file=>reports.some(r=>r.sourceHashes[file]!==sourceHashes[file]));
  for (const record of holdoutParentFiles.flatMap(r=>r.parents)) {
    assert.equal(record.cohort,'holdout');
    const stage=stages[record.targetRealm-1],scale=stage.proposal;
    const proposed=replayTrial(record,scale);
    const original=allRows.find(r=>r.seed===record.seed).trials.find(t=>t.targetRealm===record.targetRealm);
    stage.replay.push({cohort:'holdout',seed:record.seed,heroId:record.heroId,hand:record.hand,scale,
      nominalMatchesOriginal:scale===stage.nominal?proposed.passed===original.passed&&proposed.monsterHp===original.monsterHp:null,...proposed});
  }
  for (const stage of stages) {
    for (const cohort of ['calibration','holdout']) {
      const rows=stage.replay.filter(x=>x.cohort===cohort),successes=rows.filter(x=>x.passed).length;
      stage[`${cohort}Proposed`]={n:rows.length,successes,rate:rows.length?successes/rows.length:null,wilson95:wilson(successes,rows.length),meetsPointTarget:rows.length===10&&successes/rows.length>=stage.target};
      const journeys=allRows.filter(row=>row.cohort===cohort),gaps=[],censored=[];
      let missingPlayer=0;
      for (const journey of journeys) {
        const playerHand=journey.playerRealmHands[stage.realm];
        if (playerHand===undefined) { missingPlayer++; continue; }
        for (let pid=1;pid<=3;pid++) {
          const aiHand=journey.aiRealmHands[`${pid}:${stage.realm}`];
          if (aiHand===undefined) censored.push(journey.hands+1-playerHand);
          else gaps.push(Math.abs(aiHand-playerHand));
        }
      }
      const lowerBoundMeanAll30=(gaps.reduce((a,b)=>a+b,0)+censored.reduce((a,b)=>a+b,0))/30;
      stage[`${cohort}AiGap`]={completePairs:gaps.length,censoredPairs:censored.length,missingPlayerJourneys:missingPlayer,
        meanAbsoluteCompletePairs:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null,
        lowerBoundMeanAll30,meetsTenHands:missingPlayer===0&&censored.length===0&&lowerBoundMeanAll30<=10,
        conclusivelyExceedsTenHands:lowerBoundMeanAll30>10};
    }
  }
  const replayReport={scope:'Calibration parents are replayed at nominal and candidate lifeScale until targets pass, then frozen before holdout files are opened. Each holdout parent is replayed once at its frozen scale. Parents and gear originate from continuous legal journeys; no fixture gear. Original source is not edited.',sourceHashes,finalHashes:hashes,mixedHarnessOrPage,
    equivalentAiDrift:equivalentAiDrift?{strippedHash,reason:'Only the immediate next-threshold eligibleHand marker was added. In a fresh journey, threshold overshoot is at most 14 XP and ten more hands grant at most 150 XP: 100+14+150<400, 400+14+150<1000, 1000+14+150<2200. The added branch cannot run.'}:null,
    nominalReplayCheck:'Passed and final monster HP only; no full journey suffix or RNG equivalence claim.',
    journeys:20,parents:allParents.length,nominalReplayMatchesOriginal:stages.every(s=>s.replay.filter(r=>r.cohort==='calibration'||r.scale===s.nominal).every(r=>r.nominalMatchesOriginal)),
    trialPointTargetsMet:stages.every(s=>s.holdoutProposed.meetsPointTarget),aiGapMet:stages.every(s=>s.calibrationAiGap.meetsTenHands&&s.holdoutAiGap.meetsTenHands),
    aiGapScope:'Original nominal-scale continuous journeys only; candidate-scale single-trial replays do not update journey breakthrough hands.',stages,elapsedMs:Date.now()-started};
  const replayPath=path.join(root,'artifacts','progression-balance-replay.json');
  fs.writeFileSync(replayPath,JSON.stringify(replayReport,null,2));
  assert.equal(replayReport.nominalReplayMatchesOriginal,true,'Nominal replay differed from original trial; proposed rates are not certified');
  const pct=x=>x===null?'—':`${Math.round(x*100)}%`;
  const lines=['# 修仙養成合法牌局平衡驗收','',`固定種子 20 段連續旅程：校準與保留組各 10 位角色。每次試煉都從首次達標時的真實父狀態重播，裝備來自實際掉落、商店、兌換與強化。`,``,`| 境界 | 目標 | 原倍率 | 校準原通過 | 建議倍率 | 校準重播 | 保留組重播 |`,`|---|---:|---:|---:|---:|---:|---:|`,...stages.map(s=>`| ${P.realms[s.realm].name} | ${pct(s.target)} | ${s.nominal} | ${s.calibrationNominalPasses}/${s.calibrationFirstAttempts} | ${s.proposal} | ${s.calibrationProposed.successes}/${s.calibrationProposed.n} | ${s.holdoutProposed.successes}/${s.holdoutProposed.n} |`),'',`各階每組僅 10 次首次試煉；95% Wilson 信賴區間詳見 JSON，通過率仍有顯著抽樣不確定性。建議倍率未修改正式數值。`,``,`| 境界 | 校準 AI 絕對局差下界 | 保留組 AI 絕對局差下界 | 未觀測突破（校準／保留） |`,`|---|---:|---:|---:|`,...stages.map(s=>`| ${P.realms[s.realm].name} | ${s.calibrationAiGap.lowerBoundMeanAll30.toFixed(1)} | ${s.holdoutAiGap.lowerBoundMeanAll30.toFixed(1)} | ${s.calibrationAiGap.censoredPairs}/${s.holdoutAiGap.censoredPairs} |`),'',`局差下界把未突破的 AI 視為最快在第 211 局突破，且仍以每組 30 組玩家／AI 配對作分母；玩家未突破的旅程也沒有從分母移除。完整配對的實測平均與缺失數詳見 JSON。`,``,`逐旅程證據見四個 progression-balance 分片 JSON。測試為 VM 合法麻將 AI 自動操作，尚非瀏覽器、真人或實體手機驗證。`];
  lines.splice(3,0,equivalentAiDrift
    ? '執行中 progression.js 增加一行高修為舊檔補正；移除該行後 SHA-256 與起始來源完全相同。新旅程達標超額至多14修為，後續十局至多150：100+14+150<400、400+14+150<1000、1000+14+150<2200，本樣本不會走到新增分支。校準組原倍率試煉以最終來源重播後，僅結局與目標剩餘生命相同；沒有驗證完整後綴等價。'
    : '執行期間核心來源雜湊未變。');
  lines.splice(5,0,`凍結倍率的保留組單局重播四階首次試煉點估目標：${replayReport.trialPointTargetsMet?'達成':'未達成'}；原倍率連續旅程的 AI 與玩家四階平均絕對突破局差 ≤10：${replayReport.aiGapMet?'達成':'未達成或仍有截尾樣本'}。新倍率連續旅程另見正式重跑報告。`, '');
  for(let i=0;i<lines.length;i++)lines[i]=lines[i]
    .replace('建議倍率未修改正式數值。','本次先校準並凍結建議倍率，正式套用後的完整連續旅程另行驗證。')
    .replace('校準 AI 絕對局差下界','原倍率校準 AI 絕對局差下界')
    .replace('保留組 AI 絕對局差下界','原倍率保留組 AI 絕對局差下界');
  fs.writeFileSync(path.join(root,'artifacts','progression-balance.md'),lines.join('\n'));
  console.log(JSON.stringify({replayPath,elapsedMs:replayReport.elapsedMs,stages:stages.map(({realm,proposal,calibrationProposed,holdoutProposed})=>({realm,proposal,calibrationProposed,holdoutProposed}))}));
  process.exit(0);
}
if (finalSummaryMode) {
  const calibration=JSON.parse(fs.readFileSync(path.join(root,'artifacts','progression-balance-calibration.json'),'utf8'));
  assert.equal(calibration.status,'frozen-before-holdout');
  const appliedScales=[1,2,3,4].map(realm=>P.trialSpec(realm).lifeScale);
  assert.deepEqual(appliedScales,calibration.stages.map(stage=>stage.proposal),'Final trial scales differ from frozen calibration');
  const fragments=[];
  for(const cohort of [0,1])for(let first=0;first<10;first+=2)fragments.push({cohort,first,last:first+1});
  const reports=fragments.map(({cohort,first,last})=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',`progression-balance-final-${cohort}-${cohort}-${first}-${last}.json`),'utf8')));
  assert.ok(reports.every(report=>report.status==='complete'&&report.rows.length===2),'Ten complete final fragments required');
  const sourceHashes=reports[0].sourceHashes;
  const sourceDrift=[...new Set(reports.flatMap(report=>report.sourceDrift))];
  for(const report of reports)for(const file of files.filter(file=>!['index.html','tests/game-harness.cjs'].includes(file)))
    assert.equal(report.sourceHashes[file],sourceHashes[file],`Mixed final core revision ${file}`);
  for(const file of files.filter(file=>!['index.html','tests/game-harness.cjs'].includes(file)))
    assert.equal(hashes[file],sourceHashes[file],`Current core differs from final journeys ${file}`);
  const finalRows=reports.flatMap(report=>report.rows);
  assert.equal(finalRows.length,20);assert.equal(new Set(finalRows.map(row=>row.seed)).size,20);
  const byCohort={};
  for(const cohort of ['calibration','holdout']) {
    const journeyRows=finalRows.filter(row=>row.cohort===cohort);
    assert.equal(journeyRows.length,10);
    const stageStats=[1,2,3,4].map(realm=>{
      const attempts=journeyRows.map(row=>row.trials.find(t=>t.targetRealm===realm)).filter(Boolean);
      const successes=attempts.filter(t=>t.passed).length;
      const gaps=[],censored=[];let missingPlayerJourneys=0;
      for(const row of journeyRows) {
        const playerHand=row.playerRealmHands[realm];
        if(playerHand===undefined){missingPlayerJourneys++;continue;}
        for(let pid=1;pid<=3;pid++){
          const aiHand=row.aiRealmHands[`${pid}:${realm}`];
          if(aiHand===undefined)censored.push(row.hands+1-playerHand);
          else gaps.push(Math.abs(aiHand-playerHand));
        }
      }
      const lowerBoundMeanAll30=(gaps.reduce((a,b)=>a+b,0)+censored.reduce((a,b)=>a+b,0))/30;
      return {realm,scale:appliedScales[realm-1],target:targets[realm-1],firstAttempts:attempts.length,firstSuccesses:successes,
        firstRate:attempts.length?successes/attempts.length:null,wilson95:wilson(successes,attempts.length),
        unreached:journeyRows.length-attempts.length,completeAiPairs:gaps.length,censoredAiPairs:censored.length,
        missingPlayerJourneys,meanAbsoluteGapComplete:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null,
        lowerBoundMeanAll30,trialPointTargetMet:attempts.length===10&&successes/attempts.length>=targets[realm-1],
        aiGapTargetMet:missingPlayerJourneys===0&&censored.length===0&&lowerBoundMeanAll30<=10};
    });
    byCohort[cohort]={journeys:journeyRows.length,normalHands:journeyRows.reduce((n,row)=>n+row.hands,0),
      trialAttempts:journeyRows.reduce((n,row)=>n+row.trials.length,0),seeds:journeyRows.map(row=>row.seed),heroes:journeyRows.map(row=>row.heroId),stages:stageStats};
  }
  const report={scope:'Final production trial scales from frozen calibration; 20 uninterrupted legal Mahjong journeys, ten heroes in each cohort, actual loot/shop/seal/forge transactions and fixed legal human skill allocation. Each first trial is attempted immediately at XP threshold. No browser, human-policy or device claim.',
    sourceHashes,finalHashes:hashes,sourceDrift,appliedScales,cohorts:byCohort,
    totalNormalHands:finalRows.reduce((n,row)=>n+row.hands,0),totalTrialAttempts:finalRows.reduce((n,row)=>n+row.trials.length,0),
    trialPointTargetsMet:Object.values(byCohort).every(c=>c.stages.every(stage=>stage.trialPointTargetMet)),
    aiGapTargetsMet:Object.values(byCohort).every(c=>c.stages.every(stage=>stage.aiGapTargetMet))};
  const out=path.join(root,'artifacts','progression-balance-final-summary.json');
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  const lines=['# 正式倍率連續旅程驗收','',`固定種子20段、兩組各10位角色，總計 ${report.totalNormalHands} 局正常合法麻將與 ${report.totalTrialAttempts} 次獨立試煉。正式倍率：${appliedScales.join(' / ')}。`,``,`| 境界 | 目標 | 校準首次通過 | 保留組首次通過 | 校準AI平均絕對局差 | 保留組AI平均絕對局差 |`,`|---|---:|---:|---:|---:|---:|`,...[0,1,2,3].map(i=>{const a=byCohort.calibration.stages[i],b=byCohort.holdout.stages[i];return `| ${P.realms[i+1].name} | ${Math.round(a.target*100)}% | ${a.firstSuccesses}/${a.firstAttempts} | ${b.firstSuccesses}/${b.firstAttempts} | ${a.lowerBoundMeanAll30.toFixed(2)} | ${b.lowerBoundMeanAll30.toFixed(2)} |`;}),'',`四階首次通過點估目標：${report.trialPointTargetsMet?'達成':'未達成'}。AI／玩家平均絕對突破局差≤10：${report.aiGapTargetsMet?'達成':'未達成或有截尾'}。`,``,`每組每階只有10次首次試煉；95% Wilson區間見JSON，不能把點估當真實母體保證。三位AI共享同一旅程怪物，30個局差配對不獨立。玩家使用固定AI牌策；瀏覽器、真人與實體手機驗證另列。來源變動：${sourceDrift.length?sourceDrift.join(', '):'無'}。`];
  fs.writeFileSync(path.join(root,'artifacts','progression-balance-final-summary.md'),lines.join('\n'));
  console.log(JSON.stringify({out,totalNormalHands:report.totalNormalHands,totalTrialAttempts:report.totalTrialAttempts,appliedScales,trialPointTargetsMet:report.trialPointTargetsMet,aiGapTargetsMet:report.aiGapTargetsMet}));
  process.exit(0);
}
if (round2ReplayMode || round2CalibrationOnlyMode) {
  const ranges=[0,2,4,6,8];
  const read=(label,cohort,first,parents=false)=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',
    `progression-balance-${label}-${parents?'parents-':''}${cohort}-${cohort}-${first}-${first+1}.json`),'utf8'));
  // Keep holdout files unopened until the calibration scale is written to disk.
  const calibrationReports=ranges.map(first=>read('round2',0,first));
  const calibrationParentFiles=ranges.map(first=>read('round2',0,first,true));
  assert.ok(calibrationReports.every(report=>report.status==='complete'&&report.rows.length===2),'Complete round2 calibration required');
  const sourceHashes=calibrationReports[0].sourceHashes;
  for(let i=0;i<ranges.length;i++) {
    assert.deepEqual(calibrationParentFiles[i].sourceHashes,calibrationReports[i].sourceHashes);
    for(const file of files.filter(file=>!['index.html','tests/game-harness.cjs'].includes(file)))
      assert.equal(calibrationReports[i].sourceHashes[file],sourceHashes[file],`Mixed round2 calibration source ${file}`);
  }
  for(const file of files.filter(file=>!['index.html','tests/game-harness.cjs'].includes(file)))
    assert.equal(hashes[file],sourceHashes[file],`Current core differs from round2 calibration ${file}`);
  const calibrationRows=calibrationReports.flatMap(report=>report.rows);
  const calibrationParents=calibrationParentFiles.flatMap(report=>report.parents).filter(parent=>parent.targetRealm===4);
  assert.equal(calibrationRows.length,10);assert.equal(calibrationParents.length,10);
  const progressionSource=fs.readFileSync(path.join(root,'cultivation-progression.js'),'utf8');
  const nominalScale=P.trialSpec(4).lifeScale;
  assert.equal(nominalScale,1.1);
  function replayStage4(record,scale) {
    const pattern=/\{targetRealm:4,targetSpeciesId:'[^']+',lifeScale:[0-9.]+\}/;
    const original=progressionSource.match(pattern)?.[0];
    assert.ok(original,'Stage4 source shape changed');
    const override=progressionSource.replace(original,original.replace(/lifeScale:[0-9.]+/,`lifeScale:${scale}`));
    const {run,timers}=game(record.seed,{cultivation:true,heroId:record.heroId,equipment:true,scriptOverrides:{'cultivation-progression.js':override}});
    run(`stepAI=eval('('+stepAI.toString().replace(' || S.turn === 0','')+')');seed=${record.mahjongRng};`);
    const trial={id:`round2-replay-${record.seed}`,parentJourneyId:record.parent.progression.journeyId,
      ...P.trialSpec(4),lifeScale:scale};
    run(`startNewHand(true,${JSON.stringify(record.parent)},${JSON.stringify({trial,progression:record.profile,progressionId:trial.parentJourneyId})});`);
    hand(run,timers,`round2 ${record.cohort} ${record.heroId} stage4`);
    const result=snapshot(run,'S.cultivation');
    return {seed:record.seed,heroId:record.heroId,scale,passed:result.result.reason==='trial',reason:result.result.reason,monsterHp:result.monster.hp};
  }
  const nominal=calibrationParents.map(parent=>replayStage4(parent,nominalScale));
  for(const result of nominal) {
    const original=calibrationRows.find(row=>row.seed===result.seed).trials.find(trial=>trial.targetRealm===4);
    assert.ok(result.passed===original.passed&&result.monsterHp===original.monsterHp,`Round2 nominal replay mismatch ${result.seed}`);
  }
  const candidates=[];let frozenScale=null,frozenResults=null;
  for(let step=0;step<=21;step++) {
    const scale=Number((1.1-step*.05).toFixed(2));
    if(scale<.05)break;
    const results=scale===nominalScale?nominal:calibrationParents.map(parent=>replayStage4(parent,scale));
    const successes=results.filter(result=>result.passed).length;
    candidates.push({scale,successes,n:10});
    if(successes>=4){frozenScale=scale;frozenResults=results;break;}
  }
  const calibrationOut=path.join(root,'artifacts','progression-balance-round2-calibration.json');
  const calibrationRecord={status:frozenScale===null?'target-unreachable':'frozen-before-holdout',
    protocolHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'artifacts','progression-balance-round2-protocol.md'))).digest('hex'),
    scope:'Only new calibration seeds 91001+101*i inspected. Stage4 safety margin 4/10 was precommitted; stages1-3 remain fixed. Holdout files not opened before this record.',
    sourceHashes,scales:[1,.85,.85,frozenScale],calibrationSeeds:calibrationRows.map(row=>row.seed),candidates,results:frozenResults};
  if(fs.existsSync(calibrationOut))assert.deepEqual(JSON.parse(fs.readFileSync(calibrationOut,'utf8')),calibrationRecord,'Frozen calibration changed');
  else fs.writeFileSync(calibrationOut,JSON.stringify(calibrationRecord,null,2));
  assert.ok(frozenScale!==null,'Round2 stage4 calibration target unreachable');
  if(round2CalibrationOnlyMode){console.log(JSON.stringify({calibrationOut,frozenScale,candidates}));process.exit(0);}
  const holdoutReports=[...ranges.map(first=>read('round2',1,first)),...ranges.map(first=>read('round2-extra',1,first))];
  const holdoutParentFiles=[...ranges.map(first=>read('round2',1,first,true)),...ranges.map(first=>read('round2-extra',1,first,true))];
  assert.ok(holdoutReports.every(report=>report.status==='complete'&&report.rows.length===2),'Complete round2 holdout required');
  for(let i=0;i<holdoutReports.length;i++) {
    assert.deepEqual(holdoutParentFiles[i].sourceHashes,holdoutReports[i].sourceHashes);
    for(const file of files.filter(file=>!['index.html','tests/game-harness.cjs'].includes(file)))
      assert.equal(holdoutReports[i].sourceHashes[file],sourceHashes[file],`Mixed round2 holdout core ${file}`);
  }
  const holdoutRows=holdoutReports.flatMap(report=>report.rows);
  const holdoutParents=holdoutParentFiles.flatMap(report=>report.parents).filter(parent=>parent.targetRealm===4);
  assert.equal(holdoutRows.length,20);assert.equal(holdoutParents.length,20);
  assert.equal(new Set([...calibrationRows,...holdoutRows].map(row=>row.seed)).size,30);
  const holdoutResults=holdoutParents.map(parent=>replayStage4(parent,frozenScale));
  const holdoutSuccesses=holdoutResults.filter(result=>result.passed).length;
  const stages=[1,2,3].map(realm=>{
    const first=holdoutRows.map(row=>row.trials.find(trial=>trial.targetRealm===realm)).filter(Boolean);
    const successes=first.filter(trial=>trial.passed).length;
    return {realm,scale:P.trialSpec(realm).lifeScale,firstAttempts:first.length,firstSuccesses:successes,rate:successes/first.length,wilson95:wilson(successes,first.length),target:targets[realm-1]};
  });
  stages.push({realm:4,scale:frozenScale,firstAttempts:holdoutResults.length,firstSuccesses:holdoutSuccesses,
    rate:holdoutSuccesses/holdoutResults.length,wilson95:wilson(holdoutSuccesses,holdoutResults.length),target:.2});
  const report={scope:'Round2 stage4 calibration uses only ten new calibration heroes, a precommitted 4/10 safety margin, and the highest passing 0.05 lifeScale. The twenty precommitted holdout journeys use two distinct seed groups and each first-eligible parent is replayed once after scale freeze. Stages1-3 stay fixed. This is single-trial replay, not adjusted-scale continuous journey evidence.',
    nominalReplayCheck:'Original and replayed calibration trial agree on passed and final monster HP only; no complete journey suffix or RNG equivalence claim.',
    provenanceLimit:'Round2 journey hashes predate the full-dependency manifest. Monster/monster-skills/items/skills/finishers/tile catalogs and this benchmark script were not individually hashed by those runs; do not infer historical hashes.',
    sourceHashes,finalHashes:hashes,calibrationPath:calibrationOut,calibrationSeeds:calibrationRows.map(row=>row.seed),
    holdoutSeeds:holdoutRows.map(row=>row.seed),frozenScale,calibrationResults:frozenResults,holdoutResults,stages,
    stage4HoldoutTargetMet:holdoutSuccesses>=4,allHoldoutPointTargetsMet:stages.every(stage=>stage.firstAttempts===(stage.realm===4?20:20)&&stage.rate>=stage.target)};
  const out=path.join(root,'artifacts','progression-balance-round2-replay.json');
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  const lines=['# 第二輪獨立試煉驗證','',`預先承諾的化神校準門檻4/10；只讀校準組後凍結倍率 ${frozenScale}，再讀兩組合計20個新保留種子，每個父狀態只重播一次。`,``,`| 境界 | 倍率 | 保留組首次通過 | 目標 |`,`|---|---:|---:|---:|`,...stages.map(stage=>`| ${P.realms[stage.realm].name} | ${stage.scale} | ${stage.firstSuccesses}/${stage.firstAttempts} | ${Math.round(stage.target*100)}% |`),'',`化神保留組目標：${report.stage4HoldoutTargetMet?'達成':'未達成'}。95% Wilson區間與逐種子結果見JSON；20次首試仍是小樣本。若化神倍率有變，這些單局重播不能代表新倍率的完整連續旅程與AI局差，須另行全程重跑。`];
  fs.writeFileSync(path.join(root,'artifacts','progression-balance-round2-replay.md'),lines.join('\n'));
  console.log(JSON.stringify({out,frozenScale,calibration:candidates,holdoutSuccesses,n:holdoutResults.length,stage4HoldoutTargetMet:report.stage4HoldoutTargetMet}));
  process.exit(0);
}
if (round3SummaryMode) {
  const frozen=JSON.parse(fs.readFileSync(path.join(root,'artifacts','progression-balance-round2-calibration.json'),'utf8'));
  assert.equal(frozen.status,'frozen-before-holdout');
  const scales=[1,2,3,4].map(realm=>P.trialSpec(realm).lifeScale);
  assert.deepEqual(scales,frozen.scales,'Applied trial scales differ from frozen calibration');
  const fragments=[];
  for(const label of ['round3','round3-extra'])for(const cohort of (label==='round3'?[0,1]:[1]))
    for(let first=0;first<10;first+=2)fragments.push({label,cohort,first});
  const reports=fragments.map(({label,cohort,first})=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',
    `progression-balance-${label}-${cohort}-${cohort}-${first}-${first+1}.json`),'utf8')));
  assert.ok(reports.every(report=>report.status==='complete'&&report.rows.length===2&&report.sourceDrift.length===0),'Fifteen stable final fragments required');
  const sourceHashes=reports[0].sourceHashes;
  assert.deepEqual(Object.keys(sourceHashes).sort(),completeFiles.slice().sort(),'Incomplete final provenance');
  for(const report of reports)assert.deepEqual(report.sourceHashes,sourceHashes,'Mixed final source revisions');
  assert.deepEqual(hashes,sourceHashes,'Current source differs from final run');
  const finalRows=reports.flatMap(report=>report.rows);
  assert.equal(finalRows.length,30);assert.equal(new Set(finalRows.map(row=>row.seed)).size,30);
  const cohortsOut={};
  for(const cohort of ['calibration','holdout']) {
    const group=finalRows.filter(row=>row.cohort===cohort),n=group.length;
    assert.equal(n,cohort==='calibration'?10:20);
    const stages=[1,2,3,4].map(realm=>{
      const attempts=group.map(row=>row.trials.find(trial=>trial.targetRealm===realm)).filter(Boolean);
      const successes=attempts.filter(trial=>trial.passed).length;
      const gaps=[],censored=[];let missingPlayerJourneys=0;
      for(const row of group){
        const playerHand=row.playerRealmHands[realm];
        if(playerHand===undefined){missingPlayerJourneys++;continue;}
        for(let pid=1;pid<=3;pid++){
          const aiHand=row.aiRealmHands[`${pid}:${realm}`];
          if(aiHand===undefined)censored.push(row.hands+1-playerHand);
          else gaps.push(Math.abs(aiHand-playerHand));
        }
      }
      const lowerBound=(gaps.reduce((a,b)=>a+b,0)+censored.reduce((a,b)=>a+b,0))/(3*n);
      return {realm,scale:scales[realm-1],target:targets[realm-1],journeys:n,firstAttempts:attempts.length,
        firstSuccesses:successes,firstRate:successes/n,wilson95:wilson(successes,n),unreached:n-attempts.length,
        completeAiPairs:gaps.length,censoredAiPairs:censored.length,missingPlayerJourneys,
        meanAbsoluteCompletePairs:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null,
        lowerBoundMeanAllPairs:lowerBound,trialPointTargetMet:successes/n>=targets[realm-1],
        aiGapTargetMet:missingPlayerJourneys===0&&censored.length===0&&lowerBound<=10};
    });
    cohortsOut[cohort]={journeys:n,normalHands:group.reduce((sum,row)=>sum+row.hands,0),
      trialAttempts:group.reduce((sum,row)=>sum+row.trials.length,0),seeds:group.map(row=>row.seed),heroes:group.map(row=>row.heroId),stages};
  }
  const report={scope:'Thirty legal continuous Mahjong journeys at final applied scales: ten calibration and twenty preregistered holdout seeds. Gear is acquired by actual economy transactions. AI gap is a mean over three AI per journey, not a bound for every pairing. Full harness/game/script SHA-256 provenance is stable.',
    sourceHashes,finalHashes:hashes,appliedScales:scales,cohorts:cohortsOut,
    totalNormalHands:finalRows.reduce((sum,row)=>sum+row.hands,0),totalTrialAttempts:finalRows.reduce((sum,row)=>sum+row.trials.length,0),
    trialPointTargetsMet:Object.values(cohortsOut).every(c=>c.stages.every(s=>s.trialPointTargetMet)),
    aiGapTargetsMet:Object.values(cohortsOut).every(c=>c.stages.every(s=>s.aiGapTargetMet))};
  const out=path.join(root,'artifacts','progression-balance-round3-summary.json');
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  const lines=['# 最終倍率連續旅程驗收','',`固定30段旅程：${report.totalNormalHands}正常合法局、${report.totalTrialAttempts}獨立試煉；正式倍率${scales.join(' / ')}。`,``,`| 境界 | 目標 | 校準首次通過 | 保留組首次通過 | 校準AI平均絕對局差 | 保留組AI平均絕對局差 |`,`|---|---:|---:|---:|---:|---:|`,...[0,1,2,3].map(i=>{const a=cohortsOut.calibration.stages[i],b=cohortsOut.holdout.stages[i];return `| ${P.realms[i+1].name} | ${Math.round(a.target*100)}% | ${a.firstSuccesses}/${a.journeys} | ${b.firstSuccesses}/${b.journeys} | ${a.lowerBoundMeanAllPairs.toFixed(2)} | ${b.lowerBoundMeanAllPairs.toFixed(2)} |`;}),'',`四階首試點估目標：${report.trialPointTargetsMet?'達成':'未達成'}；四階AI／玩家平均絕對突破局差≤10：${report.aiGapTargetsMet?'達成':'未達成或有截尾'}。`,``,`每階校準10、保留20次首試仍屬小樣本；95% Wilson區間見JSON，點估不能保證真實母體率。三位AI共用旅程，局差配對不獨立。VM自動合法牌局已驗，真人/瀏覽器/實體手機另列。`];
  fs.writeFileSync(path.join(root,'artifacts','progression-balance-round3-summary.md'),lines.join('\n'));
  console.log(JSON.stringify({out,totalNormalHands:report.totalNormalHands,totalTrialAttempts:report.totalTrialAttempts,appliedScales:scales,trialPointTargetsMet:report.trialPointTargetsMet,aiGapTargetsMet:report.aiGapTargetsMet}));
  process.exit(0);
}
for (let cohort=cohortStart;cohort<cohortStart+cohorts;cohort++) for (let index=heroStart;index<heroEnd;index++) {
  const seed=(runLabel==='round2-extra'||runLabel==='round3-extra'?111001:['round2','round3'].includes(runLabel)?(cohort?101001:91001):(cohort?81001:71001))+index*101, heroId=H.all[index].id, journeyId=`balance-${seed}-${heroId}`;
  const {run,timers}=game(seed,{cultivation:true,heroId,equipment:true});
  run(`stepAI=eval('('+stepAI.toString().replace(' || S.turn === 0','')+')'); startNewHand(true,null,${JSON.stringify({heroId,equipment:true,progression:P.fresh(),progressionId:journeyId})});`);
  const row={cohort:cohort?'holdout':'calibration',seed,heroId,journeyId,hands:0,steps:0,transactions:0,command:0,playerRealmHands:{},aiRealmHands:{},trials:[],earned:0,kills:[],endRealm:null,aiEndRealms:[],ownedItems:0,equipped:[]};
  let profile=P.fresh(), previous=null;
  for (let number=1;number<=maxHands;number++) {
    if (previous) run(`startNewHand(true,${JSON.stringify(previous)},${JSON.stringify({heroId,equipment:true,progression:profile,progressionId:journeyId})});`);
    row.steps+=hand(run,timers,`${row.cohort} ${heroId} hand ${number}`);
    const completed=snapshot(run,'S.cultivation');
    assert.equal(completed.handNumber,number);
    assert.equal(completed.ended,true);
    const gained=completed.progression.earned[0];
    assert.ok(gained>=12&&gained<=15);
    row.hands=number;row.earned+=gained;profile={...profile,xp:profile.xp+gained};
    run(`S.cultivation=window.MahjongCultivationCombat.prepare(S.cultivation,{equipment:true})`);
    gearPolicy(run,row);
    // Fixed human preparation policy; only allocate points granted by actual XP/realm.
    profile=P.configure(profile,P.aiAllocation(heroId,profile));
    // Mirror the already-committed permanent profile supplied by ProgressionStore.
    run(`S.cultivation.players[0].progression=${JSON.stringify(profile)}`);
    const parent=snapshot(run,'S.cultivation');
    for (let pid=1;pid<4;pid++) {
      const realm=parent.players[pid].progression.realm;
      for (let target=1;target<=realm;target++) row.aiRealmHands[`${pid}:${target}`] ??= number;
    }
    if (profile.realm<4 && profile.xp>=milestones[profile.realm+1]) {
      const targetRealm=profile.realm+1, spec=P.trialSpec(targetRealm);
      const trial={id:`trial-${seed}-${targetRealm}-${number}`,parentJourneyId:journeyId,...spec};
      if (!row.trials.some(t=>t.targetRealm===targetRealm))
        parents.push({cohort:row.cohort,seed,heroId,hand:number,targetRealm,mahjongRng:run('seed'),profile:structuredClone(profile),parent:structuredClone(parent)});
      const before=crypto.createHash('sha256').update(JSON.stringify(parent)).digest('hex');
      run(`startNewHand(true,${JSON.stringify(parent)},${JSON.stringify({trial,progression:profile,progressionId:journeyId})});`);
      const trialStart=snapshot(run,'S.cultivation');
      assert.equal(trialStart.monster.speciesId,spec.targetSpeciesId);
      assert.equal(trialStart.monster.maxHp,Math.round(require('../cultivation-monsters.js').get(spec.targetSpeciesId).hp*spec.lifeScale));
      row.steps+=hand(run,timers,`${row.cohort} ${heroId} trial ${targetRealm} hand ${number}`);
      const trialEnd=snapshot(run,'S.cultivation');
      const passed=trialEnd.result.reason==='trial';
      assert.equal(trialEnd.trial.targetRealm,targetRealm);
      assert.deepEqual(trialEnd.players.map(p=>p.economy.inventory),trialStart.players.map(p=>p.economy.inventory),'trial produced gear');
      assert.deepEqual(trialEnd.progression.earned,[0,0,0,0],'trial produced XP');
      assert.equal(crypto.createHash('sha256').update(JSON.stringify(parent)).digest('hex'),before,'trial mutated parent');
      row.trials.push({hand:number,targetRealm,lifeScale:spec.lifeScale,passed,reason:trialEnd.result.reason,monsterHp:trialEnd.monster.hp,monsterMaxHp:trialEnd.monster.maxHp,observedTargetDamage:trialEnd.monster.maxHp-trialEnd.monster.hp,playerGear:parent.players[0].equipment,ownedItems:parent.players[0].economy.inventory.length,killsBefore:parent.kills.length});
      if (passed) {
        const breakthrough=P.breakthrough(profile,targetRealm);
        profile=P.configure(breakthrough.profile,P.aiAllocation(heroId,breakthrough.profile));
        parent.players[0].economy.gold+=breakthrough.reward.gold;
        parent.players[0].economy.sand+=breakthrough.reward.sand;
        parent.players[0].progression=structuredClone(profile);
        Economy.validate(parent);
        row.playerRealmHands[targetRealm]=number;
      }
    }
    previous=parent;
    row.kills=parent.kills.map(k=>k.tier);
    row.ownedItems=parent.players[0].economy.inventory.length;
    row.equipped=E.slots.map(slot=>parent.players[0].economy.inventory.find(i=>i.uid===parent.players[0].equipment[slot])||null);
    if (profile.realm===4 && parent.players.slice(1).every(p=>p.progression.realm===4)) break;
  }
  row.endRealm=profile.realm;
  row.aiEndRealms=previous.players.slice(1).map(p=>p.progression.realm);
  delete row.command;
  rows.push(row);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({status:'partial',sourceHashes:hashes,rows},null,2));
  if (parents.length) fs.writeFileSync(parentsOutput,JSON.stringify({status:'partial',sourceHashes:hashes,scope:'First eligible trial parents saved from uninterrupted legal Mahjong journeys. No fixture gear.',parents}));
  console.log(`${row.cohort} ${heroId}: hands=${row.hands} player=${row.endRealm} AI=${row.aiEndRealms.join('/')} trials=${row.trials.length} elapsed=${Math.round((Date.now()-started)/1000)}s`);
}
const summary={};
for (const cohort of ['calibration','holdout']) {
  const group=rows.filter(r=>r.cohort===cohort);if (!group.length) continue;
  summary[cohort]=[1,2,3,4].map(targetRealm=>{
    const attempts=group.map(row=>row.trials.find(t=>t.targetRealm===targetRealm)).filter(Boolean);
    const successes=attempts.filter(t=>t.passed).length;
    const gaps=group.flatMap(row=>[1,2,3].map(pid=>row.aiRealmHands[`${pid}:${targetRealm}`]!==undefined&&row.playerRealmHands[targetRealm]!==undefined?row.aiRealmHands[`${pid}:${targetRealm}`]-row.playerRealmHands[targetRealm]:null).filter(v=>v!==null));
    return {targetRealm,target:targets[targetRealm-1],firstAttempts:attempts.length,firstSuccesses:successes,firstRate:attempts.length?successes/attempts.length:null,wilson95:wilson(successes,attempts.length),unreached:group.length-attempts.length,gapSamples:gaps.length,meanAiMinusPlayerHands:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null,meanAbsoluteGapHands:gaps.length?gaps.reduce((a,b)=>a+Math.abs(b),0)/gaps.length:null};
  });
}
const finalHashes=Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const sourceDrift=files.filter(file=>hashes[file]!==finalHashes[file]);
const coreDrift=sourceDrift.filter(file=>!['index.html','tests/game-harness.cjs'].includes(file));
const report={scope:'VM legal Mahjong hand actions and production combat/economy transactions; continuous journey per seed, all ten heroes in each cohort. Player automated with the existing AI decision routine. Player gear comes only from actual kills, shop, seals and forge; no equipped fixture. Each trial is a one-hand attempt at the first eligible preparation, with later retries after each normal hand until passed. Calibration and independent holdout differ by seed. No browser, human-policy or device claim.',status:coreDrift.length?'core-source-drift':'complete',cohorts,maxHands,sourceHashes:hashes,finalHashes,sourceDrift,elapsedMs:Date.now()-started,summary,rows};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2));
if (parents.length) fs.writeFileSync(parentsOutput,JSON.stringify({status:report.status,sourceHashes:hashes,scope:'First eligible trial parents saved from uninterrupted legal Mahjong journeys. No fixture gear.',parents}));
console.log(JSON.stringify({output,elapsedMs:report.elapsedMs,summary}));
if (coreDrift.length) process.exitCode=2;
