const fs=require('node:fs');
const assert=require('node:assert/strict');
const Skills=require('../cultivation-skills.js');
const prefix=process.argv.find(x=>x.startsWith('--prefix='))?.slice(9)||'styles-before';
assert.match(prefix,/^[a-z0-9-]+$/);
const rows=[],skills={};
const top=players=>players.filter(p=>p.hp>0).map((p,pid)=>({...p,pid:players.indexOf(p)})).sort((a,b)=>b.aggro-a.aggro||a.pid-b.pid)[0]?.pid;
for(let rotation=0;rotation<4;rotation++){
  const report=JSON.parse(fs.readFileSync(`artifacts/cultivation-playthrough-${prefix}-r${rotation}.json`));
  assert.equal(report.passed,true);assert.equal(report.errors.length,0);
  for(const g of report.games){
    assert.equal(g.errors.length,0);
    const s=JSON.parse(fs.readFileSync(`artifacts/${g.eventFile}`));
    for(let pid=0;pid<4;pid++){
      const style=g.styles[pid];
      const row={seed:g.seed,hand:g.hand,rotation,pid,style,damage:s.players[pid].damage,rank:g.ranking.find(p=>p.pid===pid).rank,
        hu:g.hu===pid,weak:s.players[pid].weakCount,heal:0,shield:0,hurt:0,absorbed:0,singleTargets:0,allTargets:0,casts:0,aggroDrops:0,targetDrops:0,emptyRecovery:0};
      for(const e of s.audit.events){
        for(const fx of e.fx){
          if(fx.type==='enemy'&&fx.targets.includes(pid))row[fx.attackType==='single'?'singleTargets':'allTargets']++;
          if(fx.pid!==pid)continue;
          if(fx.type==='heal')row.heal+=fx.amount;
          if(fx.type==='shield')row.shield+=fx.amount;
          if(fx.type==='hurt'){row.hurt+=fx.amount;row.absorbed+=fx.absorbed;}
        }
        if(e.event.type==='meld'&&e.event.pid===pid){
          row.casts++;
          const skill=Skills.find(e.event.action,e.event.keys||e.event.key);
          const key=style+'/'+skill.id;skills[key]=(skills[key]||0)+1;
          if(skill.effects.some(f=>f.op==='aggro'&&f.mode==='reduce')){
            if(e.after[pid].aggro<e.before[pid].aggro)row.aggroDrops++;
            if(top(e.before)===pid&&top(e.after)!==pid)row.targetDrops++;
          }
          if(skill.effects.some(f=>f.op==='heal')&&!e.fx.some(f=>f.pid===pid&&['heal','shield'].includes(f.type)))row.emptyRecovery++;
        }
      }
      rows.push(row);
    }
  }
}
const summary=['burst','sustain','counter','stealth'].map(style=>{
  const rs=rows.filter(r=>r.style===style),mean=k=>+(rs.reduce((n,r)=>n+r[k],0)/rs.length).toFixed(2);
  return {style,samples:rs.length,wins:rs.filter(r=>r.rank===1).length,hu:rs.filter(r=>r.hu).length,
    ...Object.fromEntries(['damage','weak','heal','shield','hurt','absorbed','singleTargets','allTargets','casts','aggroDrops','targetDrops','emptyRecovery'].map(k=>['mean'+k[0].toUpperCase()+k.slice(1),mean(k)]))};
});
const output={prefix,games:rows.length/4,method:'Four test-only preference policies rotate through all seats on identical initial seeds. Legal browser play; later draws diverge with decisions. Heal includes natural revival.',summary,skills,rows};
fs.writeFileSync(`artifacts/cultivation-style-analysis-${prefix}.json`,JSON.stringify(output,null,2));
console.log(JSON.stringify({games:output.games,summary},null,2));
