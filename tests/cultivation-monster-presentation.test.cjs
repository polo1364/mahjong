const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const K=require('../cultivation-monster-skills.js'),P=require('../cultivation-monster-presentation.js'),Player=require('../cultivation-presentation.js'),M=require('../cultivation-monsters.js');
test('35 authored recipes have distinct complete paths and real sound assets',()=>{
 const signatures=new Set();
 for(const s of K.all){const r=P.recipes[s.motion];assert.ok(r,s.id);signatures.add(JSON.stringify(r.layers));assert.ok(r.layers.length>=2);assert.equal(r.sounds.length,3);
  assert.ok(fs.statSync(path.join(__dirname,'..',s.audio)).size>1000);
  for(const l of r.layers){assert.ok(l.end>l.start&&l.end<=r.duration);assert.ok(l.count>=1);assert.ok(Player.sprites[l.sprite]||['beast','ice-fangs','dragon-wave','five-thunder'].includes(l.sprite));}
 }
 assert.equal(signatures.size,35);
});
test('new monster damage is not also rendered through generic player effects',()=>{
 assert.equal(Player.plan([{type:'hurt',pid:0,amount:150,monsterSkillId:'frostfang-wolf.bite'}]).items.length,0);
 assert.equal(Player.plan([{type:'hurt',pid:0,amount:150}]).items.length,1);
});
function harness(){
 const listeners={},frames=new Map(),nodes=new Map(),voices=[],context2d=new Proxy({},{get:()=>()=>{}});let frameId=0;
 const node=()=>({dataset:{},style:{},getContext:()=>context2d,getBoundingClientRect:()=>({left:0,top:0,width:800,height:500}),getClientRects:()=>[{}],setAttribute(){},append(){},remove(){}});
 nodes.set('playersGrid',node());
 const document={currentScript:{src:'http://localhost/cultivation-monster-effects.js'},hidden:false,body:node(),querySelectorAll:()=>[],getElementById:id=>nodes.get(id),createElement:()=>node(),addEventListener:(name,fn)=>listeners[name]=fn};
 const prefs={enabled:true,volume:.5};
 const root={MahjongMonsterSkills:K,MahjongMonsterPresentation:P,MahjongCultivationPresentation:Player,MahjongCultivationMonsters:M,MahjongAudio:{getState:()=>prefs},addEventListener(){}};
 class Audio{constructor(src){this.src=src;this.dataset={};this.paused=true;voices.push(this);}addEventListener(){}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}remove(){}}
 class Image{set src(value){this.width=400;this.height=200;queueMicrotask(()=>this.onload());}}
 const sandbox={window:root,document,Audio,Image,URL,console,performance:{now:()=>0},matchMedia:()=>({matches:false}),ResizeObserver:class{observe(){}disconnect(){}},devicePixelRatio:1,requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cultivation-monster-effects.js'),'utf8'),sandbox);
 const tick=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(200));};
 return{api:root.MahjongMonsterEffects,document,listeners,prefs,voices,tick};
}
test('presentation de-duplicates committed attacks and obeys mute/background/reset',async()=>{
 const h=harness();await h.api.loaded;
 const before={monster:{speciesId:'frostfang-wolf',id:4}},event={type:'monsterSkill',skillId:'frostfang-wolf.bite',monsterId:4,seq:10,actionNumber:1,targets:[2]};
 h.api.sync({cultivation:before});h.api.consume([event],before);h.api.consume([event],before);h.tick();assert.equal(h.voices.length,1);assert.equal(h.voices[0].paused,false);
 h.prefs.enabled=false;h.api.syncPreferences();assert.equal(h.voices[0].paused,true);
 h.api.consume([{...event,seq:11,actionNumber:2}],before);h.tick();assert.equal(h.voices.length,1);
 h.prefs.enabled=true;h.api.reset();h.api.consume([event],before);h.tick();assert.equal(h.voices.length,2);
 h.document.hidden=true;h.listeners.visibilitychange();assert.ok(h.voices.every(a=>a.paused));
 h.api.consume([{...event,seq:12}],before);h.tick();assert.equal(h.voices.length,2);
 h.document.hidden=false;h.api.sync(null);h.api.consume([{...event,seq:13}],before);h.tick();assert.equal(h.voices.length,2);
});
