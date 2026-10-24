const { game } = require('./game-harness.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const count = Number(process.argv[2] || 60);
const output = process.argv[3] || 'artifacts/ai-benchmark-after.json';
const results = [];
const started = Date.now();
for (let seed = 1; seed <= count; seed++) {
  const {run,timers} = game(seed);
  // Use the real AI at all four seats; the only changed guard normally reserves seat 0 for the human.
  run(`stepAI=eval('('+stepAI.toString().replace(' || S.turn === 0','')+')'); startNewHand(true);`);
  const dealHash=crypto.createHash('sha256').update(run(`JSON.stringify([S.dealer,S.wall,S.deadWall,S.players.map(p=>[p.hand,p.flowers])])`)).digest('hex');
  let steps=0;
  for(;steps<600 && run(`S.phase!=='end'`);steps++) {
    run('cancelGameTimers(); if(S.waitReact) handleAIReaction(S.waitReact); else stepAI();');
    if(run(`S.phase!=='end'`)) {
      const next=timers.entries().next().value;
      if(next) {timers.delete(next[0]);next[1]();}
    }
    assert.equal(run(`{const all=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])];if(S.lastDiscard&&!all.some(t=>t.id===S.lastDiscard.tile.id))all.push(S.lastDiscard.tile);all.length===144&&new Set(all.map(t=>t.id)).size===144&&S.players.reduce((n,p)=>n+p.points,0)===400000;}`),true,`invariants seed ${seed}`);
  }
  assert.ok(steps<600,`stalled seed ${seed}`);
  results.push({seed,dealHash,steps,...JSON.parse(run(`JSON.stringify({winner:S.winner,fan:S.resultDetail?.fan??null,remaining:S.wall.length})`))});
  if(seed%10===0) console.log(`${seed}/${count}: ${results.filter(g=>g.winner!==null).length} wins`);
}
const wins=results.filter(g=>g.winner!==null).length;
const report={games:count,wins,draws:count-wins,winRate:wins/count,elapsedMs:Date.now()-started,results};
fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({games:count,wins,draws:count-wins,elapsedMs:report.elapsedMs}));
