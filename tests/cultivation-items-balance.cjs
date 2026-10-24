/* Paired seeded benchmarks. Synthetic style actions are distinct from legal Mahjong VM matches. */
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../cultivation-combat.js'),H=require('../cultivation-heroes.js'),S=require('../cultivation-skills.js');
const {game}=require('./game-harness.cjs');
const files=['cultivation-combat.js','cultivation-items.js','cultivation-economy.js','cultivation-heroes.js'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]));
const sourceHashes=hashes(),indexHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../index.html'))).digest('hex');
const loadouts={burst:['edge','guard'],sustain:['heal','barrier'],counter:['barrier','heal'],stealth:['stealth','edge']};
const styles={burst:['W.chow.789','W.chow.234','B.pong.999','W.pong.999','W.exposed.7777','B.concealed.1111','W.added.9999'],sustain:['W.chow.123','W.chow.456','T.pong.222','DF.pong','W.exposed.4444','T.concealed.2222','DF.added'],counter:['W.chow.567','B.chow.345','W.pong.777','B.pong.333','B.exposed.7777','B.concealed.3333','W.added.7777'],stealth:['W.chow.678','B.chow.678','W.pong.666','T.pong.444','T.exposed.4444','B.concealed.1111','W.added.6666']};
function synthetic(seed,version,style){
 let n=seed>>>0;const rng=()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};
 let s=C.create(seed,null,{heroId:H.all[seed%10].id,equipment:true,monsterSkillVersion:1}),taken=0;
 if(version)for(const p of s.players)p.economy.items.carried=loadouts[style].map(id=>({id,used:false}));
 function send(e){const r=C.apply(s,{id:s.seq+1,...e});s=r.state;for(const x of r.effects)if(x.type==='hurt')taken+=x.amount;}
 for(let pid=0;pid<4;pid++)for(let i=0;i<2;i++)send({type:'flower',pid,key:'H'+(pid*2+i+1)});
 for(let t=0;t<64&&!s.ended;t++){
  const pid=t%4;send({type:'discard',pid,key:['W','T','B'][Math.floor(rng()*3)]+(1+Math.floor(rng()*9))});
  if(rng()<.5&&!s.ended){const list=styles[style],sk=S.get(list[Math.floor(rng()*list.length)]);send({type:'meld',pid,action:sk.action,...(sk.family==='honor'?{key:sk.combo}:{keys:[...sk.combo].map(x=>sk.family+x)})});}
  if(s.enemyDue&&!s.ended)send({type:'enemy'});
 }
 if(!s.ended)send({type:'finish',pid:seed%4,fan:4});
 return{taken,damage:s.players.reduce((a,p)=>a+p.damage,0),weak:s.players.reduce((a,p)=>a+p.weakCount,0),kills:s.kills.length};
}
function legal(seed,version){
 const heroId=H.all[seed%10].id,{run,timers}=game(seed,{cultivation:true,heroId});
 run(`stepAI=eval('('+stepAI.toString().replace(' || S.turn === 0','')+')');startNewHand(true,null,{heroId:${JSON.stringify(heroId)}});
 {const c=window.MahjongCultivationCombat.create(${seed},null,{heroId:${JSON.stringify(heroId)},equipment:true,monsterSkillVersion:1}),m=window.MahjongCultivationMonsters.get('five-phase-sovereign');
 Object.assign(c.monster,{speciesId:m.id,tier:m.tier,name:m.name,element:m.element,hp:m.hp,maxHp:m.hp,shield:m.shield,armor:m.armor,attacks:0,heals:0,shields:0,statuses:[]});
 c.monster.nextAttack={type:'single',charged:false,damage:195,ailment:null,cancelled:false,controlUsed:false,sealAilment:false,skillId:'five-phase-sovereign.metal',monsterId:c.monster.id,actionNumber:1,sealed:false};
 if(${version})for(const p of c.players)p.economy.items.carried=${JSON.stringify(loadouts[Object.keys(loadouts)[seed%4]])}.map(id=>({id,used:false}));
 c.journey.nextTier='boss';c.journey.minibossKills=3;S.cultivation=c;
 for(let pid=0;pid<4;pid++)for(const tile of S.players[pid].flowers)cultivationEvent({type:'flower',pid,key:tileKey(tile)});}`);
 let steps=0;
 for(;steps<600&&run(`S.phase!=='end'`);steps++){
  run('cancelGameTimers();if(S.waitReact)handleAIReaction(S.waitReact);else stepAI();');
  if(run(`S.phase!=='end'`)){const next=timers.entries().next().value;if(next){timers.delete(next[0]);next[1]();}}
  if(steps%10===0)assert.equal(run(`{const all=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])];if(S.lastDiscard&&!all.some(t=>t.id===S.lastDiscard.tile.id))all.push(S.lastDiscard.tile);all.length===144&&new Set(all.map(t=>t.id)).size===144&&window.MahjongCultivationCombat.validate(S.cultivation);}`),true,`seed ${seed} v${version}`);
 }
 assert.ok(steps<600,'stalled '+seed);
 return{steps,...JSON.parse(run(`JSON.stringify({bossKilled:S.cultivation.kills.some(k=>k.tier==='boss'),reason:S.cultivation.result.reason,winner:S.winner,weak:S.cultivation.players.reduce((a,p)=>a+p.weakCount,0),damage:S.cultivation.players.reduce((a,p)=>a+p.damage,0)})`))};
}
const report={sourceHashes,indexHash,scope:'Paired synthetic 64-discard style scenarios and independent legal 144-tile AI Mahjong VM matches; no browser claim. Existing monsters held constant. Four named two-item loadouts against no consumables, all actors equally equipped; no equipment worn.',training:{},holdout:{}};
const output=process.argv[2]||'artifacts/items-balance.json';
for(const [group,start,count] of [['training',61001,200],['holdout',96001,100]]){
 for(const style of Object.keys(styles)){
  const pairs=Array.from({length:count},(_,i)=>({seed:start+i,old:synthetic(start+i,0,style),new:synthetic(start+i,1,style)}));
  const sum=(version,key)=>pairs.reduce((a,p)=>a+p[version][key],0)/count;
  report[group][style]={count,oldTaken:sum('old','taken'),newTaken:sum('new','taken'),takenChangePercent:100*(sum('new','taken')/sum('old','taken')-1),damageChangePercent:100*(sum('new','damage')/sum('old','damage')-1),oldDamage:sum('old','damage'),newDamage:sum('new','damage'),oldWeak:sum('old','weak'),newWeak:sum('new','weak'),pairs};
  console.log(group,style,report[group][style].takenChangePercent.toFixed(2)+'%');
 }
 const pairs=[];
 for(let i=0;i<count;i++){pairs.push({seed:start+i,old:legal(start+i,0),new:legal(start+i,1)});if((i+1)%20===0)console.log(group,'legal',i+1,'/',count);}
 const rate=v=>pairs.filter(p=>p[v].bossKilled).length/count;
 report[group].legalBoss={count,oldKillRate:rate('old'),newKillRate:rate('new'),changePercentagePoints:100*(rate('new')-rate('old')),pairs};
 fs.writeFileSync(output,JSON.stringify(report,null,2));
}
assert.deepEqual(hashes(),sourceHashes,'Combat sources changed; rerun benchmark');
report.gates={damage:Object.values(report.training).filter(x=>'takenChangePercent'in x).every(x=>x.damageChangePercent<=5)&&Object.values(report.holdout).filter(x=>'takenChangePercent'in x).every(x=>x.damageChangePercent<=5),boss:report.training.legalBoss.changePercentagePoints<=10&&report.holdout.legalBoss.changePercentagePoints<=10};
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report.gates));
