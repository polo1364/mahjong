/* Controlled combat and economy diagnostics. No claim of legal Mahjong frequency or browser validation. */
const C=require('../cultivation-combat.js'),E=require('../cultivation-equipment.js'),N=require('../cultivation-economy.js'),H=require('../cultivation-heroes.js'),S=require('../cultivation-skills.js');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const styles={mixed:['W.chow.123','W.chow.234','T.chow.234','B.chow.123','W.pong.777','T.pong.666','B.pong.333'],burst:['W.chow.789','W.chow.234','B.pong.999','W.pong.999','W.exposed.7777','B.concealed.1111','W.added.9999'],sustain:['W.chow.123','W.chow.456','T.pong.222','DF.pong','W.exposed.4444','T.concealed.2222','DF.added'],counter:['W.chow.567','B.chow.345','W.pong.777','B.pong.333','B.exposed.7777','B.concealed.3333','W.added.7777'],stealth:['W.chow.678','B.chow.678','W.pong.666','T.pong.444','T.exposed.4444','B.concealed.1111','W.added.6666']};
const clone=x=>JSON.parse(JSON.stringify(x));
function rng(seed){let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
function give(p,id,grade,level){const item={uid:`p${p.pid}-${++p.economy.serial}`,catId:id,grade,level,locked:false};p.economy.inventory.push(item);p.equipment[E.get(id).slot]=item.uid;}
function loadout(p,build,level){if(build==='none')return;if(build==='ordinary'){const ids={'su-lingheng':['qingheng-whisk','huichun-robe','qingheng-pendant'],'luo-xuanyu':['ningyu-ringblade','xuanyu-robe','ningyu-jade'],'tie-wujiu':['huifeng-halberd','zhenyue-armor','huifeng-seal'],'ye-shuying':['xuanfu-staff','yexing-robe','yinxi-bell']};for(const id of ids[p.heroId]||['chi-xiao-sword','liuyun-robe','chiyao-pendant'])give(p,id,5,level);}else for(const slot of E.slots)give(p,'set-'+build+'-'+slot,build==='wuxiang'?5:4,level);}
function run(seed,style,build,level){
  const index=seed%H.all.length,seat=Math.floor(seed/H.all.length)%4,random=rng(seed*7919);
  let s=C.create(seed*7919,null,{heroId:H.all[index].id,equipment:true});[s.players[0].heroId,s.players[seat].heroId]=[s.players[seat].heroId,s.players[0].heroId];
  loadout(s.players[seat],build,level);const stats={damage:0,heal:0,shield:0,hurt:0,weak:0,kills:0};
  function send(e){const r=C.apply(s,{id:s.seq+1,...e});s=r.state;for(const x of r.effects)if(x.pid===seat&&['heal','shield','hurt'].includes(x.type))stats[x.type]+=x.amount;}
  for(let pid=0;pid<4;pid++)for(let n=0;n<2;n++)send({type:'flower',pid,key:'H'+(pid*2+n+1)});
  for(let turn=0;turn<64&&!s.ended;turn++){const pid=turn%4;send({type:'discard',pid,key:['W','T','B'][Math.floor(random()*3)]+(1+Math.floor(random()*9))});if(random()<.5){const sk=S.get(styles[style][Math.floor(random()*styles[style].length)]);send({type:'meld',pid,action:sk.action,...(sk.family==='honor'?{key:sk.combo}:{keys:[...sk.combo].map(n=>sk.family+n)})});}if(s.enemyDue&&!s.ended)send({type:'enemy'});}
  if(!s.ended)send({type:'finish',pid:(seed>>>2)%4,fan:4});stats.damage=s.players[seat].damage;stats.weak=s.players[seat].weakCount;stats.kills=s.kills.length;return stats;
}
const sources=['cultivation-combat.js','cultivation-equipment.js','cultivation-economy.js'];
const hashes=()=>Object.fromEntries(sources.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]));
function balance(count=250){
  const initial=hashes(),rows=[],started=Date.now();
  for(const style of Object.keys(styles)){
    const sums=new Map();
    for(const split of ['train','holdout']){
      const n=split==='train'?Math.min(200,count):Math.max(0,count-200),start=split==='train'?1:10001;
      for(let k=0;k<n;k++){
        const seed=start+k,baseline=run(seed,style,'none',0);
        for(const build of ['ordinary','zhenyue','jiuyou','chixiao','wuxiang'])for(const level of [0,6,10]){
          const result=run(seed,style,build,level),key=[split,build,level].join('/');let row=sums.get(key);if(!row){row={split,style,build,level,samples:0,baselineDamage:0,damage:0,heal:0,shield:0,hurt:0,weak:0,kills:0};sums.set(key,row);}row.samples++;row.baselineDamage+=baseline.damage;for(const field of Object.keys(result))row[field]+=result[field];
        }
      }
    }
    for(const row of sums.values()){row.damageGainPercent=Number(((row.damage/row.baselineDamage-1)*100).toFixed(3));for(const field of ['baselineDamage','damage','heal','shield','hurt','weak','kills'])row[field]=Number((row[field]/row.samples).toFixed(3));rows.push(row);}
    console.log('balance style complete '+style+' '+(Date.now()-started)+'ms');
  }
  assert.deepEqual(hashes(),initial);
  const maxGear=rows.filter(r=>r.level===10),sameLevelSpread=[];
  for(const style of Object.keys(styles))for(const split of ['train','holdout'])for(const level of [0,6,10]){const a=rows.filter(r=>r.style===style&&r.split===split&&r.level===level);if(a.length)sameLevelSpread.push({style,split,level,spreadPercent:Number(((Math.max(...a.map(r=>r.damage))/Math.min(...a.map(r=>r.damage))-1)*100).toFixed(3))});}
  return {scope:'synthetic 64-discard combat diagnostics; 200 train + 50 independent holdout seeds per style, hero/seat rotated; same hero/style/seed baseline. Ordinary has grade5 and sets grade4 except wuxiang grade5; same-level spread is not strictly same-grade.',sourceHashes:initial,elapsedMs:Date.now()-started,targets:{maxGear15Percent:Math.max(...maxGear.map(r=>r.damageGainPercent))<=15,buildSpread10Percent:Math.max(...sameLevelSpread.map(r=>r.spreadPercent))<=10},rows,sameLevelSpread};
}
function economy(count=1000){
  const initial=hashes(),started=Date.now(),rows=[];
  for(let n=0;n<count;n++){
    let s=C.create((n+1)*7919,null,{heroId:H.all[n%10].id,equipment:true}),first6=null,first10=null;
    const stats={seed:n+1,hands:0,goldIncome:0,sandIncome:0,goldSpent:0,sandSpent:0,downgrades:0,forgeAttempts:0,setPieces:0,setComplete:0,first6:null,first10:null};
    // One complete 28-encounter journey cycle, one controlled kill per hand. This is an economy pacing diagnostic.
    for(let hand=1;hand<=28;hand++){
      s.monster.hp=1;s.monster.shield=0;s=C.apply(s,{id:s.seq+1,type:'finish',pid:0,reason:'hu',fan:4}).state;
      stats.goldIncome+=s.players[0].economy.handLoot.gold;stats.sandIncome+=s.players[0].economy.handLoot.sand;stats.hands++;
      s=C.prepare(s);let p=s.players[0],e=p.economy;N.selectGear(p);
      function transaction(type,extra={}){const before={gold:e.gold,sand:e.sand};const r=N.transact(s,{commandId:`sim-${hand}-${type}-${stats.forgeAttempts}`,pid:0,type,...extra});if(r.result.ok){s=r.state;p=s.players[0];e=p.economy;stats.goldSpent+=before.gold-e.gold;stats.sandSpent+=before.sand-e.sand;}return r.result;}
      const stock=e.shop.stock.filter(i=>!i.sold&&e.gold-i.price>=30).sort((a,b)=>b.grade-a.grade||a.id.localeCompare(b.id));
      if(stock.length&&E.slots.some(slot=>p.equipment[slot]===null)){transaction('buy',{stockId:stock[0].id});N.selectGear(p);}
      for(let k=0;k<3;k++){const items=E.equipped(p).sort((a,b)=>a.level-b.level||E.slots.indexOf(E.get(a.catId).slot)-E.slots.indexOf(E.get(b.catId).slot));const i=items[0];if(!i||i.level===10||e.gold-N.goldCosts[i.level]<30||e.sand<N.sandCosts[i.level])break;stats.forgeAttempts++;const r=transaction('forge',{uid:i.uid});if(r.after<r.before)stats.downgrades++;if(r.after>=6&&first6===null)first6=hand;if(r.after===10&&first10===null)first10=hand;}
      const counts={};for(const i of e.inventory){const id=E.get(i.catId).setId;if(id)counts[id]=(counts[id]||new Set()).add(E.get(i.catId).slot);}stats.setPieces=e.inventory.filter(i=>E.get(i.catId).setId).length;stats.setComplete=Object.values(counts).filter(v=>v.size===3).length;
      if(hand<28)s=C.create(0,s);
    }
    const e=s.players[0].economy;assert.equal(e.gold,120+stats.goldIncome-stats.goldSpent);assert.equal(e.sand,stats.sandIncome-stats.sandSpent);stats.first6=first6;stats.first10=first10;stats.goldEnd=e.gold;stats.sandEnd=e.sand;rows.push(stats);
    if((n+1)%100===0)console.log('economy '+(n+1)+'/'+count+' '+(Date.now()-started)+'ms');
  }
  assert.deepEqual(hashes(),initial);
  const sum=field=>rows.reduce((n,r)=>n+r[field],0),mean=field=>Number((sum(field)/count).toFixed(3));
  return {scope:'1000 independent controlled complete 28-kill journey cycles; one controlled finisher kill per hand (prevents unintended retreat of a newly spawned miniboss), legal core transitions but not Mahjong legal kill frequency. Player0 buys at most one when slots empty and forges at most3 with reserve30; NPCs use actual AI. First+10 absence is observed, not extrapolated time-to+10.',sourceHashes:initial,elapsedMs:Date.now()-started,count,means:Object.fromEntries(['goldIncome','sandIncome','goldSpent','sandSpent','downgrades','forgeAttempts','setPieces','setComplete','goldEnd','sandEnd'].map(k=>[k,mean(k)])),reached6:rows.filter(r=>r.first6!==null).length,reached10:rows.filter(r=>r.first10!==null).length,rows};
}
if(require.main===module){const mode=process.argv[2]||'balance',count=Number(process.argv[3]||(mode==='balance'?250:1000)),report=mode==='balance'?balance(count):economy(count),out=path.join(__dirname,'..','artifacts',`equipment-v3-${mode}.json`);fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(out);}
module.exports={balance,economy,run};
