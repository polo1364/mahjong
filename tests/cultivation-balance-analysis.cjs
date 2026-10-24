// Matched end-state finisher comparison; never presented as a full old/new AI win-rate experiment.
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const Skills=require('../cultivation-skills.js');
const label=process.argv.find(x=>x.startsWith('--label='))?.slice(8)||'balance-baseline';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid artifact label');
const report=JSON.parse(fs.readFileSync(`artifacts/cultivation-playthrough-${label}.json`));
if(!report.passed)throw Error('Only completed, passing journeys can be analyzed');
const records=report.games.map(g=>({g,s:JSON.parse(fs.readFileSync(path.join('artifacts',g.eventFile)))}));
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)]:0;
function combatWithBase(base) {
  const context=vm.createContext({module:{exports:{}},require:name=>name==='./cultivation-skills.js'?Skills:context.F});
  vm.runInContext(fs.readFileSync('cultivation-finishers.js','utf8').replaceAll(/\d+ \+ 60 \* fan/g,`${base} + 60 * fan`).replace(/item.id === 'base' \? \d+/,`item.id === 'base' ? ${base}`),context);
  context.F=context.module.exports;context.module={exports:{}};
  vm.runInContext(fs.readFileSync('cultivation-combat.js','utf8'),context);
  return {apply(before,event){context.inputState=JSON.stringify(before);context.inputEvent=JSON.stringify(event);return JSON.parse(vm.runInContext('JSON.stringify(module.exports.apply(JSON.parse(inputState),JSON.parse(inputEvent)))',context));}};
}
const candidates=[300,270,240,210].map(base=>{
  const combat=combatWithBase(base),rows=records.filter(r=>r.s.audit.beforeFinish).map(({g,s})=>{
    const before=s.audit.beforeFinish,event=s.audit.finishEvent,after=combat.apply(before,event).state;
    const winner=event.pid,damage=after.finisher.total,preRank=1+before.players.filter(p=>p.damage>before.players[winner].damage).length;
    return {seed:g.seed,hand:g.hand,fan:event.fan,damage,share:damage/after.players[winner].damage,preRank,rank:after.result.ranking.find(p=>p.pid===winner).rank};
  });
  return {base,n:rows.length,meanDamage:mean(rows.map(r=>r.damage)),meanShare:mean(rows.map(r=>r.share)),p90Share:percentile(rows.map(r=>r.share),.9),huTop:rows.filter(r=>r.rank===1).length,
    preHuTop:rows.filter(r=>r.preRank===1).length,comebacks:rows.filter(r=>r.rank===1&&r.preRank>1).length,rows};
});
const seals=records.flatMap(({g,s})=>s.players.flatMap((p,pid)=>(p.expiredSeals||[]).length?[{
  seed:g.seed,hand:g.hand,pid,seals:p.expiredSeals,damage:p.damage,weak:p.weakCount,rank:g.ranking.find(r=>r.pid===pid).rank,
  directDamageLoss:(s.audit.sealProbes||[]).flatMap(e=>e.players.filter(p=>p.pid===pid)).reduce((n,p)=>n+p.damageWithout-p.damageWith,0),
  probes:(s.audit.sealProbes||[]).filter(e=>e.players.some(p=>p.pid===pid)).length,
  changedEvents:(s.audit.sealProbes||[]).flatMap(e=>e.players.filter(p=>p.pid===pid).map(p=>({
    seq:e.seq,type:e.type,damageLoss:p.damageWithout-p.damageWith,hpLoss:p.hpWithout-p.hpWith,
    shieldLoss:p.shieldWithout-p.shieldWith,extraAggro:p.aggroWith-p.aggroWithout
  }))).filter(p=>p.damageLoss||p.hpLoss||p.shieldLoss||p.extraAggro)
}]:[]));
const output={label,completed:report.passed===true,gameCount:records.length,errors:report.errors.concat(report.games.flatMap(g=>g.errors)),
  huTop:report.games.filter(g=>g.huWon).length,sealPlayers:seals.length,sealTop:seals.filter(p=>p.rank===1).length,
  meanDirectDamageLoss:mean(seals.map(p=>p.directDamageLoss)),sealRows:seals,candidates,
  methods:{candidate:'Same pre-finisher state and event; other decisions not replayed.',seal:'Single-event no-seal counterfactual summed along the observed trajectory; excludes future healing/threat feedback.'}};
fs.writeFileSync(`artifacts/cultivation-balance-analysis-${label}.json`,JSON.stringify(output,null,2));
console.log(JSON.stringify({...output,sealRows:undefined,candidates:candidates.map(({rows,...r})=>r)},null,2));
