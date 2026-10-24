/* Paired economy simulation: identical kill income and forge RNG, one retained weapon. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../cultivation-combat.js'),I=require('../cultivation-items.js'),M=require('../cultivation-monsters.js');
const sandbox={module:{exports:{}},require:p=>require(path.resolve(__dirname,'..',p))};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cultivation-economy.js'),'utf8').replace('prices,rates,goldCosts','perform,prices,rates,goldCosts'),sandbox);
const E=sandbox.module.exports;
const cycle=[...Array(3).fill('small'),'elite',...Array(3).fill('small'),'elite','miniboss'];
function run(seed,enabled){
 const s=C.create(seed,null,{heroId:'shen-gufeng',equipment:true,itemRulesVersion:enabled?1:0}),p=s.players[0],e=p.economy;
 const item={uid:'p0-1',catId:'chi-xiao-sword',grade:1,level:0,locked:false};e.inventory=[item];e.serial=1;
 let attempts=0,gold=0,sand=0;const consumed={};
 for(let kills=1;kills<=4000;kills++){
  const tier=kills%28===0?'boss':cycle[((kills-1)%28)%9],pool=M.all.filter(x=>x.tier===tier),spec=pool[(kills+seed)%pool.length];
  const m={...spec,speciesId:spec.id,id:kills};E.creditKill(s,m,0);
  // One preparation after every four kills; no shop purchases, crafts or gear switching.
  if(kills%4)continue;
  e.gold+=30;
  for(let n=0;n<3&&item.level<10;n++){
   const choice=enabled?I.aiForge(p,'weapon',item.level,E.sandCosts):{};
   const q=I.forgeQuote(p,'weapon',item.level,choice,E.rates,E.sandCosts);
   if(e.gold-E.goldCosts[item.level]<30||e.sand<q.sand)break;
   const r=E.perform(p,{type:'forge',uid:item.uid,...choice},s);attempts++;gold+=r.gold;sand+=r.sand;
   for(const id of r.consumed||[])consumed[id]=(consumed[id]||0)+1;
  }
  if(item.level===10)return{kills,attempts,gold,sand,consumed};
 }
 throw Error('No +10 by 4000 kills: '+seed);
}
const pairs=Array.from({length:1000},(_,i)=>({seed:110001+i,baseline:run(110001+i,false),items:run(110001+i,true)}));
const median=a=>{a.sort((x,y)=>x-y);return(a[499]+a[500])/2;};
const summary={};for(const v of ['baseline','items'])summary[v]=Object.fromEntries(['kills','attempts','gold','sand'].map(k=>[k,median(pairs.map(p=>p[v][k]))]));
summary.accelerationPercent=100*(1-summary.items.kills/summary.baseline.kills);summary.pass=summary.accelerationPercent<=15;
fs.writeFileSync('artifacts/items-economy-balance.json',JSON.stringify({scope:'1000 paired fixed-seed economy journeys; one weapon, max 3 forges/4 kills, 30 gold reserve, no crafts or purchases; economy pacing model, not live Mahjong.',summary,pairs},null,2));
console.log(JSON.stringify(summary,null,2));assert.ok(summary.pass,'Median progression acceleration exceeds 15%');
