const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const P=require('../cultivation-presentation.js');const C=require('../cultivation-combat.js');
const Monsters=require('../cultivation-monsters.js');
function harness({monsterSize=[1774,887]}={}){
  const callbacks=new Map(),listeners={},nodes=new Map(),audio=[],images=[];let clock=100,id=0;
  const preferences={enabled:true,volume:.8,ducked:false};
  const ctx=new Proxy({}, {get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const node=()=>({dataset:{},style:{},setAttribute(){},getContext:()=>ctx,getClientRects:()=>[1],getBoundingClientRect:()=>({left:0,top:0,width:1000,height:700}),append(n){nodes.set(n.id,n);},remove(){},addEventListener(){},dispatchEvent(){}});
  const table=node();nodes.set('playersGrid',table);
  const document={hidden:false,currentScript:{src:'http://localhost/cultivation-effects.js'},body:node(),getElementById:id=>nodes.get(id),querySelector:()=>null,querySelectorAll:()=>[],createElement:node,addEventListener:(event,fn)=>listeners[event]=fn};
  const window={MahjongCultivationPresentation:P,MahjongCultivationMonsters:Monsters,MahjongAudio:{getState:()=>preferences},devicePixelRatio:2,addEventListener(){}};
  class Audio { constructor(src){this.src=src;this.dataset={};this.paused=false;audio.push(this);}addEventListener(){}play(){return Promise.resolve();}pause(){this.paused=true;}remove(){} }
  const scope={window,document,console,URL,Audio,Image:class{width=1774;height=887;constructor(){images.push(this);}set src(value){this.url=value;if(value.includes('/cultivation-journey/monsters/'))[this.width,this.height]=monsterSize;this.onload?.();}},localStorage:{getItem(){},setItem(){}},matchMedia:()=>({matches:false}),ResizeObserver:class{observe(){}disconnect(){}},performance:{now:()=>clock},requestAnimationFrame:fn=>{callbacks.set(++id,fn);return id;},cancelAnimationFrame:id=>callbacks.delete(id),Event:class{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cultivation-effects.js'),'utf8'),scope);
  return {api:window.MahjongCultivationEffects,ctx,document,nodes,listeners,audio,preferences,images,advance(ms){clock+=ms;const next=[...callbacks];callbacks.clear();next.forEach(([,fn])=>fn(clock));}};
}
test('render/restore do not replay logs; duplicate committed events play once',()=>{
  const h=harness(),state=C.create(77),result=C.apply(state,{id:1,type:'discard',pid:0,key:'W1'});
  h.api.sync({cultivation:result.state});const canvas=h.nodes.get('cultivationBattleEffects');assert.equal(canvas.dataset.events,undefined);
  h.api.consume(result.effects,state);const count=canvas.dataset.events;h.api.consume(result.effects,state);assert.equal(canvas.dataset.events,count);
  h.advance(5000);assert.equal(canvas.dataset.running,'false');h.api.sync({cultivation:result.state});assert.equal(canvas.dataset.events,count);
});
test('hidden page clears in-flight effects, drops incoming effects, and never catches up',()=>{
  const h=harness(),state=C.create(77),result=C.apply(state,{id:1,type:'discard',pid:0,key:'W1'});
  h.api.consume(result.effects,state);h.document.hidden=true;h.listeners.visibilitychange();const canvas=h.nodes.get('cultivationBattleEffects');assert.equal(canvas.dataset.running,'false');
  const count=canvas.dataset.events;h.api.consume(result.effects,state);assert.equal(canvas.dataset.events,count);h.document.hidden=false;h.listeners.visibilitychange();h.advance(1000);assert.equal(canvas.dataset.running,'false');
});
test('new/load reset permits a new session sequence; normal mode has no canvas',()=>{
  const h=harness();h.api.sync({});assert.equal(h.nodes.has('cultivationBattleEffects'),false);
  const s=C.create(1),r=C.apply(s,{id:1,type:'discard',pid:0,key:'B1'});h.api.consume(r.effects,s);const canvas=h.nodes.get('cultivationBattleEffects'),n=Number(canvas.dataset.events);
  h.api.reset();h.api.consume(r.effects,s);assert.equal(Number(canvas.dataset.events),n*2);
  h.api.sync(null);assert.equal(canvas.dataset.running,'false');
});
test('finisher result delay covers presentation even with fast game pace',()=>{
  const h=harness(),s=C.create(1),r=C.apply(s,{id:1,type:'finish',pid:0,from:1,method:'discard',items:[{id:'all-pungs',fan:4},{id:'pure-flush',fan:8,suit:'W'}],fan:12});
  h.api.consume(r.effects,s);assert.ok(h.api.resultDelay(.5)*.5>=P.plan(r.effects).duration);
});
test('skill sounds obey master volume, voice ducking and immediate mute',()=>{
  const h=harness(),s=C.create(1),r=C.apply(s,{id:1,type:'discard',pid:0,key:'W1'});h.api.consume(r.effects,s);h.advance(700);
  assert.ok(h.audio.length>0);const voice=h.audio[0],normal=voice.volume;assert.ok(normal>0&&normal<.8);
  h.preferences.ducked=true;h.api.syncPreferences();assert.ok(voice.volume<normal);
  h.preferences.enabled=false;h.api.syncPreferences();assert.equal(voice.paused,true);
});

test('every authored form retains complete rotated sprite bounds at desktop, portrait and short heights',async()=>{
  const h=harness();await h.api.loaded;let draws=0,tx=0,ty=0,angle=0,label='';
  h.ctx.translate=(x,y)=>{tx=x;ty=y;};h.ctx.rotate=r=>{angle=r;};
  for(const [width,height] of [[1000,470],[360,240],[720,220]]){
    const canvas=h.document.createElement('canvas');canvas.getBoundingClientRect=()=>({left:0,top:0,width,height});
    const stage=h.api.mountPreview(canvas);
    h.ctx.drawImage=(image,sx,sy,sw,sh,x,y,w,hh)=>{
      assert.ok(Number.isInteger(sx)&&Number.isInteger(sy)&&Number.isInteger(sw)&&Number.isInteger(sh),label+' integer crop');
      assert.ok(sx>=0&&sy>=0&&sx+sw<=image.width&&sy+sh<=image.height,label+' source bounds');
      for(const [px,py] of [[x,y],[x+w,y],[x,y+hh],[x+w,y+hh]]){
        const xx=tx+px*Math.cos(angle)-py*Math.sin(angle),yy=ty+px*Math.sin(angle)+py*Math.cos(angle);
        assert.ok(xx>=8-1e-8&&xx<=width-8+1e-8&&yy>=40-1e-8&&yy<=height-8+1e-8,label+' full rotated silhouette');
      }draws++;
    };
    for(const profile of P.all){
      label=profile.id+' '+width+'x'+height;
      const item={type:'damage',pid:0,source:'skill',element:profile.element,profile,hitIndex:0,amount:100,label:'100'};item.art=P.appearance(item);
      for(let i=0;i<=20;i++)stage.paint(item,i/20,false);
    }
    stage.destroy();
  }
  assert.ok(draws>10000);
});

test('preview monster preserves the source aspect ratio on a tall phone canvas',async()=>{
  const h=harness();await h.api.loaded;const canvas=h.document.createElement('canvas');
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:315,height:350});
  const stage=h.api.mountPreview(canvas);let checked=false;
  h.ctx.drawImage=(image,...args)=>{if(args.length===4){assert.equal(args[2]/args[3],image.width/image.height);checked=true;}};
  stage.draw(100);assert.equal(checked,true);stage.destroy();
});

test('V2 table draws its catalog species, caches its image, and reports the displayed species',async()=>{
  const h=harness(),state=C.create(77,null,{heroId:'shen-gufeng'});await h.api.loaded;
  const painted=[];h.ctx.drawImage=(image,...args)=>{if(args.length===4)painted.push(image.url);};
  h.api.sync({cultivation:state});h.advance(0);
  const canvas=h.nodes.get('cultivationBattleEffects'),species=Monsters.get(state.monster.speciesId);
  assert.equal(canvas.dataset.monsterSpecies,species.id);
  assert.deepEqual(painted,[new URL(species.image,'http://localhost/cultivation-effects.js').href]);
  h.api.sync({cultivation:state});h.advance(0);
  assert.equal(h.images.filter(image=>image.url?.endsWith(species.image)).length,1);
});

test('V2 portrait and wide monsters fit the existing battle art box without stretching',async()=>{
  for(const monsterSize of [[900,1800],[1800,900]]){
    const h=harness({monsterSize});await h.api.loaded;
    const species=Monsters.get('nether-vine-queen');let checked=false;
    h.ctx.drawImage=(image,...args)=>{
      if(args.length!==4)return;
      const [, ,width,height]=args;
      assert.ok(Math.abs(width/height-image.width/image.height)<1e-9);
      assert.ok(width<=170&&height<=170*2/3);
      checked=true;
    };
    h.api.sync({cultivation:{version:2,monster:{...species,id:1,speciesId:species.id}}});h.advance(0);
    assert.equal(checked,true);
  }
});

test('queued damage retains the previous species after the engine advances to the next monster',async()=>{
  const h=harness();await h.api.loaded;
  const before=C.create(77,null,{heroId:'shen-gufeng'});
  const attack=C.apply(before,{id:1,type:'discard',pid:0,key:'W1'});
  const next=structuredClone(attack.state),species=Monsters.all.find(monster=>monster.id!==before.monster.speciesId);
  Object.assign(next.monster,{id:before.monster.id+1,speciesId:species.id,name:species.name,element:species.element});
  h.api.consume(attack.effects,before);h.api.sync({cultivation:next});
  const painted=[];h.ctx.drawImage=(image,...args)=>{if(args.length===4)painted.push(image.url);};
  h.advance(50);
  const canvas=h.nodes.get('cultivationBattleEffects');
  assert.equal(canvas.dataset.monsterSpecies,before.monster.speciesId);
  assert.ok(painted[0].endsWith(Monsters.get(before.monster.speciesId).image));
  h.advance(5000);
  assert.equal(canvas.dataset.monsterSpecies,species.id);
  assert.ok(painted.at(-1).endsWith(species.image));
});

test('one own-turn H8 batch switches artwork between its first kill and the following flower formation',async()=>{
  const h=harness();await h.api.loaded;
  let before=C.create(77,null,{heroId:'shen-gufeng'});
  for(const key of ['H5','H6','H7'])before=C.apply(before,{type:'flower',pid:0,key,id:before.seq+1}).state;
  before.monster.hp=1;before.monster.shield=0;
  before=C.apply(before,{type:'flower',pid:0,key:'H8',id:before.seq+1}).state;
  const result=C.apply(before,{type:'turn',pid:0,id:before.seq+1});
  const firstHit=result.effects.find(effect=>effect.type==='damage'&&effect.monsterId===before.monster.id);
  const formationHit=result.effects.find(effect=>effect.type==='damage'&&effect.skillId==='formation.gentlemen');
  assert.notEqual(formationHit.monsterId,before.monster.id);
  assert.notEqual(result.state.monster.speciesId,before.monster.speciesId);
  h.api.consume(result.effects,before);h.api.sync({cultivation:result.state});
  const canvas=h.nodes.get('cultivationBattleEffects'),labels=[];let imageUrl;
  h.ctx.drawImage=(image,...args)=>{if(args.length===4)imageUrl=image.url;};
  h.ctx.fillText=label=>{
    if(label===String(Math.round(firstHit.amount))||label===String(Math.round(formationHit.amount)))
      labels.push({label,speciesId:canvas.dataset.monsterSpecies,imageUrl});
  };
  for(let frame=0;frame<80;frame++)h.advance(100);
  const first=labels.filter(item=>item.label===String(Math.round(firstHit.amount)));
  const formation=labels.filter(item=>item.label===String(Math.round(formationHit.amount)));
  assert.ok(first.length>0);assert.ok(formation.length>0);
  assert.ok(first.every(item=>item.speciesId===before.monster.speciesId&&item.imageUrl.endsWith(Monsters.get(before.monster.speciesId).image)));
  assert.ok(formation.every(item=>item.speciesId===result.state.monster.speciesId&&item.imageUrl.endsWith(Monsters.get(result.state.monster.speciesId).image)));
  assert.equal(Number(canvas.dataset.events),P.plan(result.effects).items.length);
});

test('a new monster waits for every older overlapping cast, including a longer first run',async()=>{
  const h=harness();await h.api.loaded;
  const before=C.create(77,null,{heroId:'shen-gufeng'});
  const long=C.apply(before,{type:'meld',pid:0,action:'exposed',key:'T1',id:1});
  h.api.consume(long.effects,before);h.advance(100);
  const beforeKill=structuredClone(long.state);beforeKill.monster.hp=1;beforeKill.monster.shield=0;
  const killed=C.apply(beforeKill,{type:'discard',pid:0,key:'W1',id:2});
  h.api.consume(killed.effects,beforeKill);h.advance(100);
  const next=C.apply(killed.state,{type:'discard',pid:0,key:'W1',id:3});
  const nextDamage=String(Math.round(next.effects.find(effect=>effect.type==='damage').amount));
  h.api.consume(next.effects,killed.state);h.api.sync({cultivation:next.state});
  const canvas=h.nodes.get('cultivationBattleEffects'),nextHits=[];
  h.ctx.fillText=label=>{if(label===nextDamage)nextHits.push(canvas.dataset.monsterSpecies);};
  h.advance(1500); // t=1800: the original 2260ms cast is still playing.
  assert.equal(canvas.dataset.monsterSpecies,before.monster.speciesId);
  assert.equal(nextHits.length,0);
  for(let frame=0;frame<25;frame++)h.advance(100);
  assert.ok(nextHits.length>0);
  assert.ok(nextHits.every(speciesId=>speciesId===killed.state.monster.speciesId));
});

test('V1 table retains the legacy monster asset and battle geometry',async()=>{
  const h=harness();await h.api.loaded;let legacy;
  h.ctx.drawImage=(image,...args)=>{if(args.length===4)legacy={url:image.url,args};};
  h.api.sync({cultivation:C.create(77)});h.advance(0);
  assert.match(legacy.url,/cultivation-vfx\/monster\.png/);
  assert.equal(legacy.args[2],170);assert.equal(legacy.args[3],170*2/3);
  assert.equal(h.nodes.get('cultivationBattleEffects').dataset.monsterSpecies,'legacy');
});
