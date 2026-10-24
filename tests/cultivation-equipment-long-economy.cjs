/* Pure economy pacing model: actual catalog, loot/forge RNG and transaction implementation; no combat/legal Mahjong frequency. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const E=require('../cultivation-equipment.js'),C=require('../cultivation-combat.js'),H=require('../cultivation-heroes.js');
const source=fs.readFileSync(path.join(__dirname,'..','cultivation-economy.js'),'utf8'),moduleObject={exports:{}};
// Expose existing private helpers only inside this test process. Production modules/files remain unchanged.
new Function('module','require',source.replace('const api=Object.freeze({','const api=Object.freeze({perform,openShop,'))(moduleObject,file=>require(path.join(__dirname,'..',file)));
const N=moduleObject.exports,count=Number(process.argv[2]||1000),maxCycles=Number(process.argv[3]||100),started=Date.now(),rows=[];
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex');
const sourceHashes=Object.fromEntries(['cultivation-equipment.js','cultivation-economy.js','cultivation-combat.js'].map(f=>[f,hash(f)]));
const catalog=new Map(E.all.map(c=>[c.id,c]));
function choose(p,verify=false){
  const best=new Map();for(const item of p.economy.inventory){const previous=best.get(item.catId),score=E.base[item.grade-1]+item.level*.2,old=previous?E.base[previous.grade-1]+previous.level*.2:-1;if(score>old||score===old&&item.uid<previous.uid)best.set(item.catId,item);}
  const complete=[];for(const set of E.sets){const items=E.slots.map(slot=>best.get('set-'+set.id+'-'+slot));if(items.every(Boolean))complete.push({items,score:items.reduce((n,i)=>n+(E.base[i.grade-1]+i.level*.2),0),tie:items.map(i=>i.catId+':'+i.uid).join('|')});}
  if(!complete.length)N.selectGear(p);else{complete.sort((a,b)=>b.score-a.score||(a.tie<b.tie?-1:a.tie>b.tie?1:0));E.slots.forEach((slot,i)=>p.equipment[slot]=complete[0].items[i].uid);}
  if(verify){const original=JSON.parse(JSON.stringify(p));N.selectGear(original);assert.deepEqual(p.equipment,original.equipment,'optimized full-set selection must equal production');}
  const byUid=new Map(p.economy.inventory.map(i=>[i.uid,i]));return E.slots.map(slot=>byUid.get(p.equipment[slot])).filter(Boolean);
}
for(let n=0;n<count;n++){
  const full=C.create(Math.imul(n+1,7919),null,{heroId:H.all[n%10].id,equipment:true}),p=full.players[0];
  const state={version:3,economy:full.economy,players:[p],journey:{phase:'preparation'},handNumber:1,ended:true,result:{reason:'hu'}};
  const e=p.economy,stats={seed:n+1,hands:0,cycles:0,goldIncome:0,sandIncome:0,goldSpent:0,sandSpent:0,forgeAttempts:0,forgeSuccesses:0,forgeFailures:0,downgrades:0,redemptions:0,first6:null,first10:null,firstSet:null,firstSetId:null};
  for(let hand=1;hand<=28*maxCycles;hand++){
    state.handNumber=hand;const position=(hand-1)%28,segment=Math.floor(position/9),within=position%9;
    const tier=position===27?'boss':within===8?'miniboss':within===3||within===7?'elite':'small';
    const minis=['blackarmor-general','nether-vine-queen','crimson-sword-demon'];
    const speciesId=tier==='boss'?'five-phase-sovereign':tier==='miniboss'?minis[(segment+n)%3]:tier==='elite'?'golden-tiger':'whetgold-rat';
    N.creditKill(state,{id:hand,tier,speciesId},0);N.settle(state);stats.goldIncome+=e.handLoot.gold;stats.sandIncome+=e.handLoot.sand;stats.hands=hand;stats.cycles=Math.ceil(hand/28);
    N.openShop(p,hand);
    function perform(type,extra={}){const gold=e.gold,sand=e.sand,result=N.perform(p,{type,...extra});stats.goldSpent+=gold-e.gold;stats.sandSpent+=sand-e.sand;return result;}
    // Spend seals on missing parts first; do not buy duplicate set pieces while a part is missing.
    for(const set of E.sets)while(e.seals[set.id]>=2){const missing=E.slots.find(slot=>!e.inventory.some(i=>i.catId==='set-'+set.id+'-'+slot));if(!missing)break;perform('redeem',{setId:set.id,slot:missing});stats.redemptions++;}
    let gear=choose(p,hand%28===0);
    const missing=E.slots.filter(slot=>!p.equipment[slot]);
    const stock=e.shop.stock.filter(i=>missing.includes(catalog.get(i.catId).slot)&&e.gold-i.price>=30).sort((a,b)=>b.grade-a.grade||(a.id<b.id?-1:1));
    if(stock.length){perform('buy',{stockId:stock[0].id});gear=choose(p);}
    if(stats.firstSet===null){const b=E.bonuses(p),set=E.sets.find(s=>b.sets[s.id]===3);if(set){stats.firstSet=hand;stats.firstSetId=set.id;}}
    for(let k=0;k<3;k++){
      gear.sort((a,b)=>a.level-b.level||E.slots.indexOf(catalog.get(a.catId).slot)-E.slots.indexOf(catalog.get(b.catId).slot));const item=gear[0];
      if(!item||item.level===10||e.gold-N.goldCosts[item.level]<30||e.sand<N.sandCosts[item.level])break;
      const result=perform('forge',{uid:item.uid});stats.forgeAttempts++;if(result.success)stats.forgeSuccesses++;else stats.forgeFailures++;if(result.after<result.before)stats.downgrades++;
      if(result.after>=6&&stats.first6===null)stats.first6=hand;if(result.after===10&&stats.first10===null)stats.first10=hand;
    }
    assert.equal(e.gold,120+stats.goldIncome-stats.goldSpent);assert.equal(e.sand,stats.sandIncome-stats.sandSpent);assert.ok(e.gold>=30);
    if(hand%28===0||stats.first10!==null&&stats.firstSet!==null)N.validate(state);
    if(stats.first10!==null&&stats.firstSet!==null)break;
    p.equipmentState=E.passiveState();e.handLoot={gold:0,sand:0,items:[],seals:{}};
  }
  stats.goldEnd=e.gold;stats.sandEnd=e.sand;stats.inventory=e.inventory.length;stats.censored=stats.first10===null||stats.firstSet===null;rows.push(stats);
  if((n+1)%100===0)console.log(`${n+1}/${count}; elapsed ${Date.now()-started}ms`);
}
for(const [file,expected]of Object.entries(sourceHashes))assert.equal(hash(file),expected,'source changed '+file);
function distribution(field){const values=rows.map(r=>r[field]).filter(x=>x!==null).sort((a,b)=>a-b);const quantile=p=>values.length?values[Math.min(values.length-1,Math.floor((values.length-1)*p))]:null;return {observed:values.length,censored:count-values.length,min:values[0]??null,p10:quantile(.1),median:quantile(.5),p90:quantile(.9),max:values.at(-1)??null,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:null};}
const sum=field=>rows.reduce((n,r)=>n+r[field],0),report={scope:'Pure economy quick model; actual source loot RNG, shop RNG, forge RNG, costs and private transaction helpers exposed only in isolated test module. Combat/legal Mahjong frequency and per-command Combat.validate/clone/receipts are omitted. One controlled kill plus legal-core subsidy per hand, repeating exact 18small/6elite/3unique mini/1boss cycle; player0 only, no other actor simulation. Equip policy follows set3/set2/style/base via actual selectGear until first full set, then equivalent best-full-set score optimization. Buys at most1 only to fill empty slots, forges lowest level at most3, reserves30gold, redeems missing pieces whenever2seals. Stop after first+10 and full set; right censor at maxCycles*28 hands. No claim of actual Mahjong hands-to-kill.',sourceHashes,count,maxCycles,maxHands:maxCycles*28,elapsedMs:Date.now()-started,first6:distribution('first6'),first10:distribution('first10'),firstSet:distribution('firstSet'),totals:Object.fromEntries(['hands','goldIncome','sandIncome','goldSpent','sandSpent','forgeAttempts','forgeSuccesses','forgeFailures','downgrades','redemptions'].map(k=>[k,sum(k)])),rows};
fs.writeFileSync(path.join(__dirname,'..','artifacts','equipment-v3-long-economy.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({count,elapsedMs:report.elapsedMs,first10:report.first10,firstSet:report.firstSet}));
