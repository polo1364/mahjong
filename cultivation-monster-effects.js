/* Raster attack choreography driven exclusively by committed combat events. */
(function(root){'use strict';
  const imageURL = root.MahjongImageURL || (value => value);
 const K=root.MahjongMonsterSkills,R=root.MahjongMonsterPresentation.recipes,P=root.MahjongCultivationPresentation;
 const base=document.currentScript.src,images=new Map(),sounds=new Set(),stages=new Set(),seen=new Set();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let main=null,active=false,preview=null;
 const clamp=t=>Math.max(0,Math.min(1,t)),mix=(a,b,t)=>a+(b-a)*t;
 function load(name,path){if(images.has(name))return images.get(name).promise;const entry={image:null};images.set(name,entry);return entry.promise=new Promise(resolve=>{const i=new Image();i.onload=()=>{entry.image=i;resolve(true);};i.onerror=()=>{console.error('Monster effect image unavailable',path);resolve(false);};i.src=new URL(imageURL(path),base).href;});}
 let imagePromise,loadEpoch=0;
 function loadAssets(){return imagePromise ||= Promise.all([...new Set(Object.values(P.sprites).map(s=>s[0]))].map(a=>load(a,'assets/cultivation-vfx/'+a+'.png')).concat(['ice-fangs','dragon-wave','five-thunder'].map(a=>load(a,'assets/monster-skills/'+a+'.png'))));}
 function prefs(){return root.MahjongAudio?.getState()||{enabled:false,volume:0};}
 function stopSounds(owner){for(const a of sounds)if(!owner||a.owner===owner){a.pause();a.remove();sounds.delete(a);}}
 function syncPreferences(){const p=prefs();for(const a of sounds){if(!p.enabled||!p.volume||document.hidden){a.pause();a.remove();sounds.delete(a);}else a.volume=Math.min(1,p.volume*(p.ducked?.22:.48));}}
 function sound(skill,owner){const p=prefs();if(!p.enabled||!p.volume||document.hidden)return;
  if(sounds.size>=2){const old=sounds.values().next().value;old.pause();old.remove();sounds.delete(old);}
  const a=new Audio(new URL(skill.audio,base).href);a.owner=owner;a.hidden=true;a.dataset.monsterSound=skill.id;a.volume=Math.min(1,p.volume*(p.ducked?.22:.48));
  const deadline=performance.now()+300,stopLate=()=>{a.pause();sounds.delete(a);a.remove();};
  const timer=root.setTimeout?.(stopLate,300);
  const done=()=>{root.clearTimeout?.(timer);sounds.delete(a);a.remove();};a.addEventListener('ended',done,{once:true});a.addEventListener('error',()=>{owner.canvas.dataset.audioError=skill.id;done();},{once:true});
  sounds.add(a);document.body.append(a);a.play().then(()=>{root.clearTimeout?.(timer);if(!sounds.has(a)||performance.now()>deadline||document.hidden)stopLate();}).catch(()=>{owner.canvas.dataset.audioBlocked='true';done();});owner.canvas.dataset.lastSound=skill.id;
 }
 class Stage{
  constructor(canvas,demo=false){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.demo=demo;this.runs=[];this.frame=0;stages.add(this);this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(canvas);this.layout();}
  layout(){const b=this.canvas.getBoundingClientRect();this.w=b.width;this.h=b.height;this.dpr=Math.min(2,devicePixelRatio||1);const width=Math.max(1,Math.round(this.w*this.dpr)),height=Math.max(1,Math.round(this.h*this.dpr));if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
   const rect=node=>{if(!node?.getClientRects().length)return null;const r=node.getBoundingClientRect();return{x:r.left-b.left,y:r.top-b.top,w:r.width,h:r.height};};
   if(this.demo){this.source={x:this.w*.5,y:this.h*.24};this.targets=[{x:this.w*.5,y:this.h*.79},{x:this.w*.16,y:this.h*.57},{x:this.w*.84,y:this.h*.57},{x:this.w*.73,y:this.h*.23}];this.exclusions=[];}
   else{const m=rect(document.getElementById('cultivationMonster'))||{x:this.w*.4,y:this.h*.4,w:140,h:100},size=Math.min(190,Math.max(72,this.w*.17));this.source={x:m.x+m.w+size*.48+9,y:m.y+m.h*.46};if(this.source.x+size/2>this.w-68)this.source={x:m.x+m.w/2,y:Math.max(65,m.y-size*.4-8)};
    const body=rect(document.querySelector('#cultivationMonster .cult-monster-body'));this.arenaSize=body?Math.min(75,Math.max(42,body.h)):null;if(body)this.source={x:body.x+body.w/2,y:body.y+body.h/2};
    this.targets=Array.from({length:4},(_,pid)=>{const icon=rect(document.getElementById('cultArenaPlayer'+pid));if(icon)return{x:icon.x+icon.w/2,y:icon.y+icon.h/2};const r=rect(document.getElementById('playerInfo'+pid))||{x:this.w/2,y:this.h*.75,w:0,h:0};const x=r.x+r.w/2,y=r.y+r.h/2,angle=Math.atan2(this.source.y-y,this.source.x-x);return{x:Math.max(40,Math.min(this.w-40,x+Math.cos(angle)*(r.w/2+30))),y:Math.max(40,Math.min(this.h-85,y+Math.sin(angle)*(r.h/2+32)))};});
    this.exclusions=[...document.querySelectorAll('#yourHand,[id^="handBack"],[id^="playerInfo"],#cultivationMonster > :not(.cult-monster-stage),.actions,.reaction-panel,#tableMenuBtn')].map(rect).filter(Boolean);
   }
  }
  texture(name,x,y,size,rotation=0,alpha=1,stretch=1,beast=null){const sprite=P.sprites[name],entry=images.get(name==='beast'?'beast:'+beast:sprite?sprite[0]:name),img=entry?.image;if(!img)return;
   let src=[0,0,img.width,img.height];if(sprite){const cw=img.width/4,ch=img.height/2;const col=sprite[1]%4,row=Math.floor(sprite[1]/4),sx=Math.round(col*cw),sy=Math.round(row*ch);src=[sx,sy,Math.round((col+1)*cw)-sx,Math.round((row+1)*ch)-sy];}
   const aspect=src[3]/src[2];let width=size,height=size*aspect*stretch;
   // Fit the complete rotated silhouette; no texture is cropped to a destination square.
   const co=Math.abs(Math.cos(rotation)),si=Math.abs(Math.sin(rotation)),fit=Math.min(1,(this.w-16)/(co*width+si*height),(this.h-24)/(si*width+co*height));width*=fit;height*=fit;
   const hx=(co*width+si*height)/2,hy=(si*width+co*height)/2;x=Math.max(hx+8,Math.min(this.w-hx-8,x));y=Math.max(hy+8,Math.min(this.h-hy-8,y));
   const c=this.ctx;c.save();c.translate(x,y);c.rotate(rotation);c.globalAlpha=clamp(alpha);c.drawImage(img,...src,-width/2,-height/2,width,height);c.restore();
  }
  text(value,x,y,color='#f6d99d'){const c=this.ctx;c.save();c.font='bold 13px "Microsoft JhengHei",sans-serif';c.textAlign='center';c.lineWidth=4;c.strokeStyle='#06181e';c.strokeText(value,x,y);c.fillStyle=color;c.fillText(value,x,y);c.restore();}
  add(event,hits,monster){if(document.hidden)return;this.layout();const prior=this.runs.at(-1),start=prior?Math.max(performance.now(),prior.start+900):performance.now();
   this.runs.push({event,hits,monster,start,played:false});this.runs=this.runs.slice(-6);this.canvas.dataset.events=String(Number(this.canvas.dataset.events||0)+1);this.canvas.dataset.lastSkill=event.skillId;this.canvas.dataset.targets=event.targets.join(',');this.wake();}
  wake(){if(!this.frame)this.frame=requestAnimationFrame(t=>this.draw(t));}
  layer(l,t,target,beast){const u=(t-l.start)/(l.end-l.start);if(u<0||u>1)return;const from=this.source,to=target,e=1-Math.pow(1-u,3),distance=Math.hypot(to.x-from.x,to.y-from.y),angle=Math.atan2(to.y-from.y,to.x-from.x);
   const baseSize=(this.arenaSize??Math.min(this.demo?130:110,Math.max(55,this.w*.13)))*l.size,fade=Math.min(1,u*8,(1-u)*6);
   for(let i=0;i<l.count;i++){const k=l.count===1?0:(i/(l.count-1)-.5),a=i/l.count*Math.PI*2;let x=to.x,y=to.y,rot=0,size=baseSize,stretch=1;
    switch(l.path){
     case'flight':case'fan':case'leap':case'arc':x=mix(from.x,to.x,e);y=mix(from.y,to.y,e);rot=l.sprite==='ice-fangs'?angle-Math.PI/2:l.sprite==='dragon-wave'?angle:angle+Math.PI/2;
      if(l.path==='fan'){x+=Math.cos(angle+Math.PI/2)*k*l.spread*100*Math.sin(u*Math.PI);y+=Math.sin(angle+Math.PI/2)*k*l.spread*100*Math.sin(u*Math.PI);}
      if(l.path==='leap'||l.path==='arc')y-=Math.sin(u*Math.PI)*Math.min(90,distance*.35)*(1+k*l.spread);
      break;
     case'crawl':{const p=clamp(u*1.5-i*.08);x=mix(from.x,to.x,p)+Math.sin(u*9+i)*14*l.spread;y=mix(from.y,to.y,p);rot=angle+Math.PI/2;size*=.5+u*.5;break;}
     case'return':x=mix(to.x,from.x,u)+Math.cos(a)*Math.sin(u*Math.PI)*50*l.spread;y=mix(to.y,from.y,u)+Math.sin(a)*Math.sin(u*Math.PI)*50*l.spread;size*=.65;break;
     case'jaw':x+=k*(1-e)*110*l.spread;y-=Math.abs(k)*(1-e)*75;rot=k*1.8*l.spread;break;
     case'claw':x+=k*60*l.spread+(1-e)*50;y-=(1-e)*65;rot=-.6;size*=.8;break;
     case'cross':x+=k*90*(1-e);rot=i===0?-.7:.7;break;
     case'sweep':x+=(u-.5)*90;rot=-.8+u*1.6;stretch=.8;break;
     case'slam':case'rain':{const p=clamp(u*1.5-i*.05);x+=k*95*l.spread;y-=(1-p)*Math.min(this.h*.36,150);size*=l.path==='rain'?.65:1;break;}
     case'windup':x=from.x;y=from.y-u*20;rot=-.9+u*.9;size*=.6+u*.4;break;
     case'source':x=from.x;y=from.y;size*=.6+.4*e;break;
     case'source-rise':x=from.x+k*60*l.spread;y=from.y+(1-e)*65;break;
     case'source-orbit':case'orbit':{const center=l.path==='source-orbit'?from:to,r=(1-u*.55)*44*l.spread;x=center.x+Math.cos(a+u*3)*r;y=center.y+Math.sin(a+u*3)*r*.65;size*=.65;rot=a+u*3;break;}
     case'shockwave':x=mix(from.x,to.x,e);y=mix(from.y,to.y,e);size*=.4+u*1.4+i*.15;stretch=.45;break;
     case'burst':x+=Math.cos(a)*u*60*l.spread;y+=Math.sin(a)*u*50*l.spread;size*=.3+u*.7;break;
     case'stamp':size*=1.25-.25*e;rot=(1-e)*.6;break;
    }
    this.texture(l.sprite,x,y,size,rot,fade,stretch,beast);
   }
  }
  draw(now){this.frame=0;const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.w,this.h);
   this.runs=this.runs.filter(r=>now-r.start<2200);if(document.hidden){this.stop();return;}
   if(this.demo){c.fillStyle='#091b22';c.fillRect(0,0,this.w,this.h);this.targets.forEach((p,i)=>this.text('道友 '+(i+1),p.x,p.y+31));const beast=this.runs[0]?.monster.speciesId;if(beast)this.texture('beast',this.source.x,this.source.y,68,0,.7,1,beast);}
   c.save();c.beginPath();c.rect(0,0,this.w,this.h);for(const r of this.exclusions)c.rect(r.x-2,r.y-2,r.w+4,r.h+4);c.clip('evenodd');
   for(const run of this.runs){let t=(now-run.start)/1000;if(t<0)continue;const skill=K.get(run.event.skillId);if(!skill)continue;
    // A delayed first frame starts picture and sound together; stale attacks stay silent.
    if(!run.played){if(t>.25&&t<=.5){run.start=now;t=0;}run.played=true;if(t<.25)sound(skill,this);}const recipe=R[skill.motion];if(root.MahjongCultivationEffects?.enabled===false&&!this.demo)continue;
    const targets=run.event.targets.map(pid=>this.targets[pid]).filter(Boolean);
    for(const target of targets){if(reduced.matches){if(t<.35)this.texture(recipe.layers.at(-1).sprite,target.x,target.y,this.arenaSize??75,0,1,1,run.monster.speciesId);}
     else for(const layer of recipe.layers){if(target!==targets[0]&&['source','source-rise','source-orbit','windup'].includes(layer.path))continue;this.layer(layer,t,target,run.monster.speciesId);}
    }
    if(t>.7&&t<1.8)for(const hit of run.hits){const p=this.targets[hit.pid],y=this.arenaSize?p.y+(p.y<this.source.y?1:-1)*(12+(t-.7)*6):p.y-18-(t-.7)*10;this.text(this.demo?'演出示意':`−${hit.amount}${hit.absorbed?' · 盾 '+hit.absorbed:''}`,p.x,y,'#ffd4b5');}
    if(this.demo&&t<1.85)this.text(run.event.name||skill.name,this.w/2,22);
   }
   c.restore();syncPreferences();this.canvas.dataset.running=String(this.runs.length>0);if(this.runs.length)this.wake();
  }
  stop(){this.runs=[];cancelAnimationFrame(this.frame);this.frame=0;stopSounds(this);this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.canvas.dataset.running='false';}
  destroy(){this.stop();this.observer.disconnect();stages.delete(this);}
 }
 function sync(state){active=!!state?.cultivation;if(!active){stop();return;}loadAssets();if(main&&!main.canvas.isConnected){const host=document.getElementById('playersGrid');if(host)host.append(main.canvas);}if(!main){const host=document.getElementById('playersGrid');if(!host)return;const canvas=document.createElement('canvas');canvas.id='monsterBattleEffects';canvas.className='cult-battle-effects';canvas.setAttribute('aria-hidden','true');host.append(canvas);main=new Stage(canvas);}const species=root.MahjongCultivationMonsters.get(state.cultivation.monster.speciesId);if(species)load('beast:'+species.id,species.image);}
 function consume(effects,before){if(!active||!main||document.hidden)return;
  const required=[...new Set(Object.values(P.sprites).map(s=>s[0])),'ice-fangs','dragon-wave','five-thunder'];
  if(required.some(name=>!images.get(name)?.image)){const epoch=loadEpoch,requested=performance.now();loadAssets().then(loaded=>{if(loaded.every(Boolean)&&epoch===loadEpoch&&!document.hidden&&performance.now()-requested<1000)consume(effects,before);});return;}
  for(const e of effects||[]){if(e.type!=='monsterSkill')continue;const id=[e.monsterId,e.seq,e.actionNumber,e.skillId,!!e.reaction].join(':');if(seen.has(id))continue;seen.add(id);if(seen.size>300)seen.delete(seen.values().next().value);main.add(e,effects.filter(h=>h.type==='hurt'&&h.monsterSkillId===e.skillId),before.monster);}}
 function stop(){loadEpoch++;main?.stop();stopSounds();preview?.close();}function reset(){stop();seen.clear();}
 function showPreview(id){const skill=K.get(id);if(!skill)return;preview?.close();const prior=document.activeElement,d=document.createElement('dialog');d.className='cult-vfx-preview';d.setAttribute('aria-label',skill.name+'攻擊演出');
  const header=document.createElement('header'),title=document.createElement('h2'),close=document.createElement('button'),canvas=document.createElement('canvas'),info=document.createElement('p'),play=document.createElement('button');
  title.textContent=skill.name;close.textContent='關閉 ×';play.textContent='重播招式與音效';info.textContent=K.describe(skill)+'。此處僅預覽演出，不造成遊戲傷害。';header.append(title,close);d.append(header,canvas,info,play);document.body.append(d);d.showModal();const stage=new Stage(canvas,true),species=root.MahjongCultivationMonsters.get(skill.speciesId);
  const run=()=>{stage.stop();stage.add({skillId:id,name:skill.name,targets:skill.type==='all'?[0,1,2,3]:[0]},[{pid:0,amount:skill.damage}],{speciesId:species.id});};
  const finish=()=>{stage.destroy();d.close();d.remove();preview=null;prior?.focus({preventScroll:true});};preview={close:finish};close.onclick=finish;d.addEventListener('cancel',e=>{e.preventDefault();finish();});play.onclick=run;Promise.all([loadAssets(),load('beast:'+species.id,species.image)]).then(()=>{if(d.isConnected)run();});close.focus();
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden){loadEpoch++;stages.forEach(s=>s.stop());stopSounds();}});document.addEventListener('input',syncPreferences);root.addEventListener('resize',()=>stages.forEach(s=>s.layout()));
 root.MahjongMonsterEffects=Object.freeze({sync,consume,stop,reset,showPreview,syncPreferences,get loaded(){return loadAssets();}});
})(window);
