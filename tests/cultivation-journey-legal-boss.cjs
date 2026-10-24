/* Real legal Mahjong engine via VM harness. Initial monster is controlled to BOSS; gear is empty. No browser/runtime claim. */
const {game}=require('./game-harness.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sourceFiles=['index.html','cultivation-heroes.js','cultivation-monsters.js','cultivation-combat.js'];
const sourceHashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')]));
const initialHashes=sourceHashes();
const count=Number(process.argv[2]||200),start=Number(process.argv[3]||40001);
const out=process.argv[4]||'tests/cultivation-journey-legal-boss-results.json';
const heroes=require('../cultivation-heroes.js').all;
const results=[],started=Date.now();
for(let i=0;i<count;i++){
  const seed=start+i,heroId=heroes[i%heroes.length].id;
  const {run,timers}=game(seed,{cultivation:true,heroId});
  run(`stepAI=eval('('+stepAI.toString().replace(' || S.turn === 0','')+')');
    startNewHand(true,null,{heroId:${JSON.stringify(heroId)}});
    {const c=window.MahjongCultivationCombat.create(${seed},null,{heroId:${JSON.stringify(heroId)}}),m=window.MahjongCultivationMonsters.get('five-phase-sovereign');
    Object.assign(c.monster,{speciesId:m.id,tier:m.tier,name:m.name,element:m.element,hp:m.hp,maxHp:m.hp,shield:m.shield,armor:m.armor,attacks:0,heals:0,shields:0,statuses:[]});
    c.monster.nextAttack={type:'single',charged:false,damage:m.single,ailment:null,cancelled:false,controlUsed:false,sealAilment:false};
    c.journey.nextTier='boss';c.journey.minibossKills=3;S.cultivation=c;
    for(let pid=0;pid<4;pid++)for(const tile of S.players[pid].flowers)cultivationEvent({type:'flower',pid,key:tileKey(tile)});}`);
  let steps=0;
  for(;steps<600&&run(`S.phase!=='end'`);steps++){
    run('cancelGameTimers(); if(S.waitReact) handleAIReaction(S.waitReact); else stepAI();');
    if(run(`S.phase!=='end'`)){const next=timers.entries().next().value;if(next){timers.delete(next[0]);next[1]();}}
    if(steps%10===0)assert.equal(run(`{const all=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])];if(S.lastDiscard&&!all.some(t=>t.id===S.lastDiscard.tile.id))all.push(S.lastDiscard.tile);all.length===144&&new Set(all.map(t=>t.id)).size===144&&window.MahjongCultivationCombat.validate(S.cultivation);}`),true,`physical/combat seed${seed}`);
  }
  assert.ok(steps<600,`stalled seed${seed}`);
  results.push({seed,steps,...JSON.parse(run(`JSON.stringify({winner:S.winner,reason:S.cultivation.result.reason,remaining:S.wall.length,bossKilled:S.cultivation.kills.some(k=>k.tier==='boss'),bossHp:S.cultivation.monster.speciesId==='five-phase-sovereign'?S.cultivation.monster.hp:0,players:S.cultivation.players.map(p=>({heroId:p.heroId,damage:p.damage,hp:p.hp,weak:p.weakCount,aggro:p.aggro,kills:S.cultivation.kills.filter(k=>k.pid===p.pid).length}))})`))});
  if((i+1)%10===0)console.log(`${i+1}/${count}; boss killed ${results.filter(r=>r.bossKilled).length}; elapsed ${Date.now()-started}ms`);
}
assert.deepEqual(sourceHashes(),initialHashes,'Source changed during benchmark; rerun stable final version');
const killed=results.filter(r=>r.bossKilled).length;
const report={sourceHashes:initialHashes,scope:'VM legal Mahjong actions/144 unique physical tiles; controlled full-HP BOSS at initial hand, empty gear, actual four-seat AI; no browser or live-human verification',count,start,bossKilled:killed,killRate:killed/count,elapsedMs:Date.now()-started,results};
fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({count,bossKilled:killed,killRate:report.killRate,elapsedMs:report.elapsedMs}));
