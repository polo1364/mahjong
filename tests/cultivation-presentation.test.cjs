const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const P=require('../cultivation-presentation.js');
const C=require('../cultivation-combat.js');
const S=require('../cultivation-skills.js');
const F=require('../cultivation-finishers.js');
function loadPreviewAPI(){
  const window={MahjongCultivationPresentation:P,MahjongCultivationCombat:{...C,apply:(state,event)=>C.apply(JSON.parse(JSON.stringify(state)),JSON.parse(JSON.stringify(event)))},MahjongCultivationSkills:S,MahjongCultivationFinishers:F,addEventListener(){}};
  const context={window,URL,localStorage:{getItem(){}},matchMedia:()=>({matches:false}),Image:class{},document:{currentScript:{src:'http://localhost/cultivation-effects.js'},addEventListener(){}},console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cultivation-effects.js'),'utf8'),context);
  return window.MahjongCultivationEffects;
}
const API=loadPreviewAPI();
test('all 169 skills and 38 finishers have distinct recipe IDs and raster sprites',()=>{
  assert.equal(P.all.length,207);assert.equal(new Set(P.all.map(p=>p.id)).size,207);
  for(const p of P.all){assert.ok(p.name);assert.ok(p.motion);if(p.projectile)assert.ok(P.sprites[p.projectile]);}
  for(const [atlas,cell] of Object.values(P.sprites)){assert.ok(fs.existsSync(path.join(__dirname,'../assets/cultivation-vfx',atlas+'.png')));assert.ok(cell>=0&&cell<8);}
});
for(const profile of P.all)test('actual combat presentation '+profile.id,()=>{
  const {plan,effects}=API.previewEvents(profile.id);
  assert.ok(plan.items.length,profile.id);assert.ok(plan.duration<=4400);
  assert.equal(plan.damage,effects.filter(e=>e.type==='damage').reduce((n,e)=>n+e.amount,0));
  for(const item of plan.items){assert.ok(P.sprites[item.art.projectile]);assert.ok(P.sprites[item.art.impact]);assert.ok(Number.isFinite(item.at));assert.ok(item.duration>0);}
});
test('full-health healing never invents an outgoing hit or a heal number',()=>{
  const {plan,effects}=API.previewEvents('T.chow.234',true);
  assert.equal(plan.items.filter(e=>e.type==='damage').length,effects.filter(e=>e.type==='damage').length);
  assert.equal(plan.items.filter(e=>e.type==='heal').length,0);
});
test('secret profiles contain no concealed identity, including geometry and pitch variant',()=>{
  const a=P.plan([{type:'skill',secret:true,pid:1,name:'秘術',skillId:null},{type:'damage',secret:true,pid:1,amount:100,element:'fire'}]);
  const b=P.plan([{type:'skill',secret:true,pid:1,name:'秘術',skillId:'W.concealed.1111'},{type:'damage',secret:true,pid:1,amount:100,element:'fire'}]);
  assert.deepEqual(a.items.map(x=>x.profile),b.items.map(x=>x.profile));assert.equal(a.items[0].profile.id,'secret');
});
test('chow pong exposed concealed and added have separate motion recipes',()=>{
  const motions=['chow','pong','exposed','concealed','added'].map(action=>P.profile(S.all.find(s=>s.family==='W'&&s.action===action).id).motion);
  assert.equal(new Set(motions).size,5);
});
test('counter, DoT, healing, shield, control and aggro are separate actual-result effects',()=>{
  const plan=P.plan([{type:'damage',source:'counter',pid:0,amount:20,element:'metal'}, {type:'damage',source:'dot',pid:0,amount:30,element:'wood'}, {type:'heal',pid:0,amount:70},{type:'shield',pid:0,amount:90},{type:'control',pid:0,kind:'interrupt'},{type:'aura',pid:0,op:'aggro',mode:'reduce'}]);
  assert.equal(plan.damage,50);assert.deepEqual(plan.items.map(x=>x.art.sound),['shatter','poison','bless','shield','seal','stealth']);
});
test('approved distinct attacks have authored silhouettes, not an ID hash recolor',()=>{
  const ids=['B.chow.789','B.concealed.1111','DF.exposed','W.exposed.5555','T.chow.234','finisher:all-pungs'];
  assert.deepEqual(ids.map(id=>P.profile(id).form),['rain','lance','roots','firewall','fountain','mountain']);
  assert.ok(new Set(P.all.map(p=>p.form)).size>=50);
  assert.ok(P.all.every(p=>p.form&&p.label));
});
module.exports={loadPreviewAPI};
