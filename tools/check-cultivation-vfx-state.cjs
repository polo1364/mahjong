/* Compare presentation-only combat edits with the exact pre-change backup. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../cultivation-combat.js'),S=require('../cultivation-skills.js');
const root=path.join(__dirname,'..'),baseline='cultivation-combat.js.bak.20261023-122945-559',Old=require(path.join(root,baseline));
let checks=0;
for(const skill of S.all){
  const state=C.create(9941);state.monster.hp=state.monster.maxHp=20000;state.players[0].hp=300;state.players[0].shield=180;state.players[0].shieldTurns=4;state.players[0].aggro=500;
  let event;
  if(skill.action==='finish')event={type:'finish',pid:0,fan:5};
  else if(skill.action==='formation'){
    if(['seven','eight'].includes(skill.combo))event={type:'finish',pid:0,flowerKind:skill.combo};
    else{state.players[0].flowers=skill.combo==='seasons'?['H1','H2','H3']:['H5','H6','H7'];event={type:'flower',pid:0,key:skill.combo==='seasons'?'H4':'H8'};}
  }else if(skill.action==='flower')event={type:'flower',pid:0,key:skill.combo};
  else event={type:'meld',pid:0,action:skill.action,...(['W','T','B'].includes(skill.family)?{keys:[...skill.combo].map(n=>skill.family+n)}:{key:skill.combo})};
  event.id=1;assert.deepEqual(C.apply(state,event).state,Old.apply(state,event).state,skill.id);checks++;
}
let a=C.create(99),b=Old.create(99);
for(let n=0;n<120&&!a.ended;n++){
  const event={id:a.seq+1,type:a.enemyDue?'enemy':'discard',pid:n%4,key:['W3','T5','B7','DF'][n%4],monsterId:a.monster.id};
  a=C.apply(a,event).state;b=Old.apply(b,event).state;assert.deepEqual(a,b);checks++;
}
const report={baseline,checks,stateAndPersistentLogIdentical:true,saveFormatChanged:false};fs.writeFileSync(path.join(root,'artifacts/cultivation-vfx-state-equivalence.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
