// Equal-opportunity combat experiment. It does NOT draw a legal Mahjong wall.
const fs=require('node:fs'),assert=require('node:assert/strict');
const C=require('../cultivation-combat.js'),Skills=require('../cultivation-skills.js');
const label=process.argv.find(a=>a.startsWith('--label='))?.slice(8)||'styles';
assert.match(label,/^[a-z0-9-]+$/);
const styles={
  burst:['W.chow.789','W.chow.234','B.pong.999','W.pong.999'],
  sustain:['T.chow.234','B.chow.456','DC.pong','DB.pong'],
  counter:['W.chow.567','B.chow.345','B.pong.777','B.pong.333'],
  stealth:['W.pong.666','B.chow.678','B.pong.111','W.chow.678']
};
const rows=[];
for(const hp of [1000,400])for(let seed=41001;seed<=41040;seed++)for(let rotation=0;rotation<4;rotation++){
  let state=C.create(seed);state.players.forEach(p=>p.hp=hp);
  const metrics=state.players.map((p,pid)=>({seed,hp,rotation,pid,style:Object.keys(styles)[(pid+rotation)%4],heal:0,shield:0,hurt:0,absorbed:0,targets:0,reactiveDamage:0}));
  const send=event=>{
    const result=C.apply(state,{id:state.seq+1,...event});state=result.state;
    for(const e of result.effects){
      if(e.pid===undefined)continue;const m=metrics[e.pid];
      if(['heal','shield'].includes(e.type))m[e.type]+=e.amount;
      if(e.type==='hurt'){m.hurt+=e.amount;m.absorbed+=e.absorbed;}
      if(e.type==='damage'&&event.type==='enemy')m.reactiveDamage+=e.amount;
    }
    const attack=result.effects.find(e=>e.type==='enemy');if(attack)attack.targets.forEach(pid=>metrics[pid].targets++);
  };
  for(let turn=0;turn<64&&!state.ended;turn++){
    const pid=turn%4,own=Math.floor(turn/4),style=metrics[pid].style;
    send({type:'discard',pid,key:['W1','T1','B1'][own%3]});
    if(own%4===1&&!state.ended){
      const s=Skills.get(styles[style][Math.floor(own/4)]);
      send({type:'meld',pid,action:s.action,...(s.family==='honor'?{key:s.combo}:{keys:[...s.combo].map(n=>s.family+n)})});
    }
    if(state.enemyDue&&!state.ended)send({type:'enemy',monsterId:state.monster.id});
  }
  if(!state.ended)send({type:'finish',reason:'draw'});
  assert.equal(C.validate(state),true);
  for(const m of metrics)rows.push({...m,damage:state.players[m.pid].damage,weak:state.players[m.pid].weakCount,rank:state.result.ranking.find(r=>r.pid===m.pid).rank});
}
const summary=[1000,400].flatMap(hp=>Object.keys(styles).map(style=>{
  const rs=rows.filter(r=>r.hp===hp&&r.style===style),avg=k=>+(rs.reduce((n,r)=>n+r[k],0)/rs.length).toFixed(2);
  return {hp,style,samples:rs.length,wins:rs.filter(r=>r.rank===1).length,...Object.fromEntries(['damage','weak','heal','shield','hurt','absorbed','targets','reactiveDamage'].map(k=>[k,avg(k)]))};
}));
fs.writeFileSync(`artifacts/cultivation-style-probe-${label}.json`,JSON.stringify({method:'320 isolated combat runs, equal four melds, no finisher; two starting HP levels, four seat rotations, 40 seeds. Not legal draw probabilities or live win rates.',styles,summary,rows},null,2));
console.log(JSON.stringify(summary,null,2));
