/* Deterministic combat-only balance scenarios; does not assert Mahjong legal-hand frequency. */
let C=require('../cultivation-combat.js');
const H=require('../cultivation-heroes.js');
const M=require('../cultivation-monsters.js');
const Skills=require('../cultivation-skills.js');
const assert=require('node:assert/strict');
const chiDamage=process.argv.includes('--chi-105')?105:process.argv.includes('--chi-106')?106:null;
const sourceHashes=Object.fromEntries(['cultivation-combat.js','cultivation-heroes.js','cultivation-monsters.js'].map(file=>[file,require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(require('node:path').join(__dirname,'..',file))).digest('hex')]));
if(chiDamage){
  const fs=require('node:fs'),path=require('node:path'),catalog=JSON.parse(JSON.stringify(H.all));
  catalog.find(h=>h.id==='chi-ling').stats.damage=chiDamage;
  const moduleObject={exports:{}},source=fs.readFileSync(path.join(__dirname,'../cultivation-combat.js'),'utf8');
  new Function('module','require',source)(moduleObject,file=>file==='./cultivation-heroes.js'?{all:catalog,get:id=>catalog.find(h=>h.id===id)}:require(path.join(__dirname,'..',file)));
  C=moduleObject.exports;
}
function random(seed){let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
const ids=['W.chow.123','W.chow.234','W.chow.456','W.chow.567','W.chow.789','W.pong.777','T.chow.234','T.pong.555','T.pong.666','T.exposed.1111','B.chow.123','B.chow.234','B.chow.456','B.pong.333','B.exposed.1111','B.concealed.1111','B.added.2222'];
const styles={mixed:ids,burst:['W.chow.789','W.chow.234','B.pong.999','W.pong.999','W.exposed.7777','B.concealed.1111','W.added.9999'],sustain:['W.chow.123','W.chow.456','T.pong.222','DF.pong','W.exposed.4444','T.concealed.2222','DF.added'],counter:['W.chow.567','B.chow.345','W.pong.777','B.pong.333','B.exposed.7777','B.concealed.3333','W.added.7777'],stealth:['W.chow.678','B.chow.678','W.pong.666','T.pong.444','T.exposed.4444','B.concealed.1111','W.added.6666']};
function run(seed,hero,style='mixed'){
  const available=styles[style];
  const rng=random(seed),seat=seed%4;
  let state=C.create(seed,null,{heroId:hero.id});
  [state.players[0].heroId,state.players[seat].heroId]=[state.players[seat].heroId,state.players[0].heroId];
  const stats={damage:0,healing:0,shield:0,taken:0,targeted:0,weak:0,hp:1000,aggro:0,kills:0,partyKills:0};
  function send(event){const r=C.apply(state,{id:state.seq+1,...event});state=r.state;for(const e of r.effects){if(e.pid===seat){if(e.type==='heal')stats.healing+=e.amount;if(e.type==='shield')stats.shield+=e.amount;if(e.type==='hurt')stats.taken+=e.amount;}if(e.type==='enemy'&&e.targets.includes(seat))stats.targeted++;}}
  for(let pid=0;pid<4;pid++)for(let flower=0;flower<2;flower++)send({type:'flower',pid,key:'H'+(pid*2+flower+1)});
  for(let turn=0;turn<64&&!state.ended;turn++){
    const pid=turn%4,key=['W','T','B'][Math.floor(rng()*3)]+(1+Math.floor(rng()*9));
    send({type:'discard',pid,key});
    if(rng()<.5){const skill=Skills.get(available[Math.floor(rng()*available.length)]);send({type:'meld',pid,action:skill.action,...(skill.family==='honor'?{key:skill.combo}:{keys:[...skill.combo].map(n=>skill.family+n)})});}
    if(state.enemyDue&&!state.ended)send({type:'enemy'});
  }
  if(!state.ended)send({type:'finish',pid:(seed>>>2)%4,fan:4});
  stats.damage=state.players[seat].damage;stats.weak=state.players[seat].weakCount;stats.hp=state.players[seat].hp;stats.aggro=state.players[seat].aggro;stats.kills=state.kills.filter(k=>k.pid===seat).length;stats.partyKills=state.kills.length;
  C.validate(state);return stats;
}
function evaluate(start,count,style='mixed'){
  const rows=H.all.map(h=>({id:h.id,name:h.name,samples:count,damage:0,healing:0,shield:0,taken:0,targeted:0,weak:0,hp:0,aggro:0,kills:0,partyKills:0}));
  for(let n=0;n<count;n++){const seed=(start+n)*7919;for(let h=0;h<H.all.length;h++){const stats=run(seed,H.all[h],style);for(const key of Object.keys(stats))rows[h][key]+=stats[key];}}
  for(const row of rows)for(const key of ['damage','healing','shield','taken','targeted','weak','hp','aggro','kills','partyKills'])row[key]=Number((row[key]/count).toFixed(2));
  const values=rows.map(r=>r.damage),spreadPercent=Number(((Math.max(...values)/Math.min(...values)-1)*100).toFixed(2));
  return{style,start,count,spreadPercent,rows};
}
function bossCheck(){const meldCounts=[0,0,0,0];let s=C.create(321,null,{heroId:'shen-gufeng'}),turns=0;const m=M.get('five-phase-sovereign');Object.assign(s.monster,{speciesId:m.id,tier:m.tier,name:m.name,element:m.element,hp:m.hp,maxHp:m.hp,shield:m.shield,armor:m.armor,attacks:0,heals:0,shields:0,statuses:[]});while(!s.kills.length&&turns<120){const pid=turns%4;s=C.apply(s,{id:s.seq+1,type:'discard',pid,key:['W1','T1','B1'][turns%3]}).state;if(turns%2===0&&meldCounts[pid]<5){meldCounts[pid]++;s=C.apply(s,{id:s.seq+1,type:'meld',pid,action:'chow',keys:['W2','W3','W4']}).state;}if(s.enemyDue)s=C.apply(s,{id:s.seq+1,type:'enemy'}).state;turns++;if(s.ended)break;}return{scope:'bounded synthetic combat diagnostic, not legal Mahjong evidence',meldCounts,discards:turns,players:s.players.map(p=>({heroId:p.heroId,hp:p.hp,weakCount:p.weakCount})),bossKilled:s.kills.some(k=>k.tier==='boss')};}
if(require.main===module)console.log(JSON.stringify({scope:'pure combat scenarios, not live Mahjong match telemetry',sourceHashes,candidate:chiDamage?'chi damage'+chiDamage+' in isolated module only':'production hero stats',training:evaluate(1,200),holdout:evaluate(10001,50),byStyle:Object.keys(styles).filter(s=>s!=='mixed').map(style=>({training:evaluate(1,200,style),holdout:evaluate(10001,50,style)})),unarmedBoss:bossCheck()},null,2));
module.exports={evaluate,run,bossCheck};
