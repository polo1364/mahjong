/* Bronze raster battle VFX. No game state, timers, scoring or RNG are owned here. */
(function (root) {
  'use strict';
  const P = root.MahjongCultivationPresentation;
  const scriptUrl = document.currentScript.src;
  const asset = new URL('assets/cultivation-vfx/', scriptUrl).href;
  const images = {}, monsterImages = new Map(), voices = new Set(), stages = new Set();
  let main = null, preview = null, active = false, seen = new Set(), enabled = true;
  try { enabled = localStorage.getItem('mahjong.cultivation.vfx') !== 'off'; } catch (_) { /* Optional preference. */ }
  const reducedMedia = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = n => Math.max(0, Math.min(1, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const random = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  let imagePromise;
  function loadAssets() { return imagePromise ||= Promise.all(['bronze', 'weapons', 'nature', 'spirits', 'fire-forms', 'water-forms', 'monster'].map(name => new Promise(resolve => {
    const img = new Image(); img.onload = () => { images[name] = img; resolve(true); };
    img.onerror = () => { console.error('Cultivation VFX image unavailable: ' + name); resolve(false); }; img.src = asset + name + '.png?v=crop-20261023';
  }))); }
  function loadMonster(speciesId) {
    if (!speciesId) return;
    if (monsterImages.has(speciesId)) return monsterImages.get(speciesId).promise;
    const species = root.MahjongCultivationMonsters?.get(speciesId);
    if (!species) return;
    const entry = { image: null, promise: null };
    monsterImages.set(speciesId, entry);
    entry.promise = new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        entry.image = image;
        for (const stage of stages) if (!stage.demo) stage.wake();
        resolve(true);
      };
      image.onerror = () => { console.error('Cultivation monster image unavailable: ' + speciesId); resolve(false); };
      image.src = new URL(species.image, scriptUrl).href;
    });
    return entry.promise;
  }
  function soundPrefs() { return root.MahjongAudio?.getState() || { enabled: false, volume: 0 }; }
  function syncPreferences() {
    const prefs = soundPrefs();
    for (const voice of voices) {
      if (!prefs.enabled || !prefs.volume || document.hidden) { voice.pause(); voices.delete(voice); voice.remove(); }
      else voice.volume = Math.min(1, prefs.volume * (prefs.ducked ? .22 : .48) * voice._gain);
    }
  }
  function stopAudio(owner) {
    for (const voice of voices) if (!owner || voice._owner === owner) { voice.pause(); voices.delete(voice); voice.remove(); }
  }
  function playSound(cue, item, owner) {
    const prefs = soundPrefs();
    if (!prefs.enabled || !prefs.volume || document.hidden) return;
    const now = performance.now();
    // Keep the voice announcement intelligible and coalesce rapid multi-hit transients.
    if (now - owner.lastSound < 85) return;
    owner.lastSound = now;
    if (voices.size >= 4) { const old = voices.values().next().value; old.pause(); old.remove(); voices.delete(old); }
    const voice = new Audio(asset + cue + '.mp3');
    voice.hidden = true; voice.dataset.cultivationSound = cue;
    voice._owner = owner; voice._gain = item.profile.tier ? 1 : .65;
    voice.playbackRate = item.profile.id === 'secret' ? 1 : .96 + (item.profile.variant % 5) * .02;
    voice.volume = Math.min(1, prefs.volume * (prefs.ducked ? .22 : .48) * voice._gain);
    const done = () => { voices.delete(voice); voice.remove(); };
    voice.addEventListener('ended', done, { once: true });
    voice.addEventListener('error', () => { owner.canvas.dataset.audioError = cue; done(); }, { once: true });
    document.body.append(voice); voices.add(voice);
    voice.play().catch(() => { owner.canvas.dataset.audioBlocked = 'true'; done(); });
    owner.canvas.dataset.lastSound = cue;
  }
  function rect(node, origin) {
    if (!node || !node.getClientRects().length) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
  }
  function center(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
  class Stage {
    constructor(canvas, demo = false) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.demo = demo;
      this.runs = []; this.frame = 0; this.lastSound = -Infinity; this.destroyed = false;
      this.observer = new ResizeObserver(() => this.layout()); this.observer.observe(canvas);
      stages.add(this); this.layout();
    }
    layout() {
      const bounds = this.canvas.getBoundingClientRect(); this.w = bounds.width; this.h = bounds.height;
      this.dpr = Math.min(2, root.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(this.w * this.dpr)), height = Math.max(1, Math.round(this.h * this.dpr));
      const resized=this.canvas.width !== width || this.canvas.height !== height;
      if (resized) { this.canvas.width = width; this.canvas.height = height; }
      if (this.demo) {
        this.target = { x: this.w * .72, y: this.h * .48 };
        this.players = Array.from({ length: 4 }, () => ({ x: this.w * .21, y: this.h * .61 })); this.exclusions = [];
      } else {
        const monster = rect(document.getElementById('cultivationMonster'), bounds);
        // Boss layout: the beast stands in the panel's stage slot, framed by its name plate and intent.
        const slot = rect(document.querySelector('#cultivationMonster .cult-monster-stage'), bounds);
        this.inStage = !!(slot && slot.w > 24 && slot.h > 24);
        this.beastSize = this.inStage ? Math.min(slot.w, slot.h * 1.5) : Math.min(190, Math.max(72, this.w * .17));
        const card = monster || { x: this.w / 2 - 60, y: this.h * .4, w: 120, h: 120 };
        if (this.inStage) this.target = center(slot);
        else {
          this.target = { x: card.x + card.w + this.beastSize * .48 + 9, y: card.y + card.h * .46 };
          if (this.target.x + this.beastSize / 2 > this.w - 68)
            this.target = { x: card.x + card.w / 2, y: Math.max(65, card.y - this.beastSize * .4 - 8) };
        }
        const safe = p => ({ x: Math.max(45, Math.min(this.w - 45, p.x)), y: Math.max(45, Math.min(this.h - 85, p.y)) });
        this.players = Array.from({ length: 4 }, (_, pid) => {
          const info = rect(document.getElementById('playerInfo' + pid), bounds);
          if (!info) return safe({ x: this.w / 2, y: this.h * .75 });
          const c = center(info), angle = Math.atan2(this.target.y - c.y, this.target.x - c.x);
          return safe({ x: c.x + Math.cos(angle) * (info.w / 2 + 30), y: c.y + Math.sin(angle) * (info.h / 2 + 32) });
        });
        this.exclusions = [...document.querySelectorAll('#yourHand, [id^="handBack"], [id^="playerInfo"], #cultivationMonster > :not(.cult-monster-top):not(.cult-monster-stage), #cultivationMonster .cult-monster-top > span')]
          .map(node => rect(node, bounds)).filter(Boolean);
      }
      if(resized)this.wake();
    }
    add(plan, snapshot) {
      if (this.destroyed || document.hidden || !plan.items.length) return;
      const now = performance.now();
      // Serialize monster generations without holding up the mahjong engine.
      const prior = this.runs.at(-1);
      const start = prior ? Math.max(now, prior.monsterId !== snapshot.monsterId
        ? Math.max(...this.runs.map(run => run.start + run.plan.duration)) : prior.start) : now;
      const run = { plan, start, monsterId: snapshot.monsterId, speciesId: snapshot.speciesId, element: snapshot.element, name: snapshot.name, sounds: new Set() };
      this.runs.push(run); this.canvas.dataset.events = String(Number(this.canvas.dataset.events || 0) + plan.items.length);
      this.canvas.dataset.damage = String(plan.damage); this.canvas.dataset.monster = String(snapshot.monsterId);
      this.layout(); this.wake();
    }
    wake() { if (!this.frame && !this.destroyed) this.frame = requestAnimationFrame(now => this.draw(now)); }
    texture(name, x, y, size, rotation = 0, alpha = 1, stretch = 1) {
      const sprite = P.sprites[name], image = sprite && images[sprite[0]];
      if (!image || alpha <= 0) return;
      const cw = image.width / 4, ch = image.height / 2, ctx = this.ctx;
      const col = sprite[1] % 4, row = Math.floor(sprite[1] / 4);
      const sx = Math.round(col * cw), sy = Math.round(row * ch);
      const source = [sx, sy, Math.round((col + 1) * cw) - sx, Math.round((row + 1) * ch) - sy];
      // Fit the complete, rotated silhouette inside the stage, including tall falling casts.
      const aspect = source[3] / source[2], height = size * aspect * stretch;
      const c = Math.abs(Math.cos(rotation)), s = Math.abs(Math.sin(rotation));
      let halfW = (size * c + height * s) / 2, halfH = (size * s + height * c) / 2;
      const pad = 8, top = this.demo ? 40 : pad;
      const fit = Math.min(1, (this.w - pad * 2) / (halfW * 2), (this.h - top - pad) / (halfH * 2));
      size *= Math.max(0, fit); halfW *= fit; halfH *= fit;
      x = Math.max(pad + halfW, Math.min(this.w - pad - halfW, x));
      y = Math.max(top + halfH, Math.min(this.h - pad - halfH, y));
      ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha = clamp(alpha);
      ctx.drawImage(image, ...source, -size / 2, -size * aspect * stretch / 2, size, size * aspect * stretch); ctx.restore();
    }
    text(label, x, y, opacity, color = '#ffe3a2', size = 16) {
      const ctx = this.ctx; ctx.save(); ctx.globalAlpha = clamp(opacity); ctx.font = `700 ${size}px "Microsoft JhengHei", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = '#101b20'; ctx.fillStyle = color;
      ctx.strokeText(label, x, y, this.w * .64); ctx.fillText(label, x, y, this.w * .64); ctx.restore();
    }
    fragments(x, y, t, item, size) {
      const ctx = this.ctx, count = this.w < 500 ? 10 : 22;
      ctx.save(); ctx.fillStyle = item.art.color; ctx.globalAlpha = clamp(1 - t);
      for (let n = 0; n < count; n++) {
        const angle = random(n + item.profile.variant) * Math.PI * 2, distance = (20 + random(n + 13) * size) * t;
        const px = x + Math.cos(angle) * distance, py = y + Math.sin(angle) * distance * .6 + t * t * 20;
        ctx.fillRect(px, py, 1.5 + random(n) * 2, 1.5);
      }
      ctx.restore();
    }
    motif(item, origin, destination, progress, size, self = false) {
      const {form,projectile,impact}=item.art, rank=item.profile.rank||1, n=3+(rank%5);
      const p=clamp(progress), t=clamp(p/.62), fade=clamp((1-p)*2.2), a=Math.atan2(destination.y-origin.y,destination.x-origin.x);
      const x=destination.x,y=destination.y, tex=(name,px,py,s,angle=0,alpha=fade,stretch=1)=>this.texture(name,px,py,s,angle,alpha,stretch);
      // Public meld type changes the gathering motion; secret casts use one neutral ritual.
      if(p<.28&&!self){
        const q=p/.28,alpha=Math.sin(q*Math.PI)*.7;
        if(item.profile.motion==='arc')for(let i=0;i<3;i++)tex('spark',origin.x+(i-1)*size*.18,origin.y-q*size*.2,size*.18,0,alpha);
        else if(item.profile.motion==='fall')for(let i=0;i<4;i++)tex('mountain',origin.x+(i-1.5)*size*.14,origin.y,size*.28,0,alpha);
        else if(item.profile.motion==='spiral')tex('shield',origin.x,origin.y,size*(.65-q*.3),q*2,alpha);
        else if(item.profile.motion==='orbit')tex('seal',origin.x,origin.y,size*.6,-q,alpha);
        else tex('light',origin.x,origin.y,size*q*.6,0,alpha);
      }
      switch(form){
        case 'rain': case 'blizzard': {
          for(let i=0;i<n+3;i++){const q=clamp((p-i*.045)/.5), dx=(i-(n+2)/2)*size*.12;
            tex(projectile,x+dx,y-size*1.6*(1-q),size*(form==='rain'?.48:.24),form==='rain'?Math.PI/2:q*4,Math.sin(q*Math.PI)*fade);
            if(q>.8)tex(impact,x+dx,y,size*.35,0,(1-q)*4);
          } break;
        }
        case 'lance': case 'heavenbeam': {
          if(form==='heavenbeam'){tex('pillar',x,y-size*.25,size*(.45+Math.sin(p*Math.PI)),0,fade,1.8);tex('quake',x,y+size*.25,size*(.4+p),0,fade,.35);}
          else {const distance=Math.hypot(x-origin.x,y-origin.y);tex(projectile,lerp(origin.x,x,t),lerp(origin.y,y,t),size*.8,a,fade,.22);if(p>.3)tex('beam',(origin.x+x)/2,(origin.y+y)/2,Math.min(distance,size*2.4),a,fade*.65,.12);}
          break;
        }
        case 'cleave': case 'execute': case 'crescent': {
          const angle=form==='execute'?-Math.PI*.75+p*1.4:form==='crescent'?-p*1.6:-.8+p*2;
          tex(projectile,x+(1-t)*size*.4,y-(1-t)*size*.5,size*(form==='execute'?1.55:1.1),angle,fade);
          if(p>.48)tex('beam',x,y,size*.9,angle+.5,fade*.55,.1);break;
        }
        case 'cross': {
          for(let i=0;i<2;i++){const q=clamp((p-i*.16)/.65);tex(projectile,x+(i?1:-1)*(1-q)*size*.45,y-size*.1,size, (i?1:-1)*(.55+q*.3),Math.sin(q*Math.PI)*fade);}
          break;
        }
        case 'meteor': {
          tex('meteor',x-size*(1-t),y-size*1.4*(1-t),size*(.4+t*.4),Math.PI*.15,fade);
          if(p>.48){tex('crater',x,y+size*.15,size*(.5+p),0,fade);tex('quake',x,y+size*.24,size*(p+.4),0,fade,.3);}break;
        }
        case 'eruption': case 'crater': case 'roots': case 'mountain': case 'bamboo': {
          const count=form==='mountain'?1:form==='crater'?3:n;
          for(let i=0;i<count;i++){const q=clamp((p-i*.045)/.58),dx=form==='mountain'?((item.hitIndex%5)-2)*size*.18:(i-(count-1)/2)*size*.16;
            const name=form==='roots'||form==='bamboo'?'root':form==='mountain'?'mountain':'crater';
            const py=form==='mountain'?y-size*1.5*(1-q):y+size*.38-size*.38*q;
            tex(name,x+dx,py,size*(.45+q*.5),form==='roots'||form==='bamboo'?-Math.PI/2:0,fade,form==='bamboo'?1.7:1);
          }tex('quake',x,y+size*.3,size*(.4+p),0,fade,.4);break;
        }
        case 'vortex': case 'maelstrom': case 'poison': {
          for(let i=0;i<4;i++)tex(projectile,x,y-(i-1)*size*.12,size*(1-i*.16)*(.5+Math.sin(p*Math.PI)*.6),p*(i%2?3:-3)+i,fade*.6);
          if(p>.65)tex(impact,x,y,size*(1-p)*2,0,fade);break;
        }
        case 'waterfall': {
          for(let i=0;i<3;i++){const q=clamp((p-i*.1)/.55);tex('waterfall',x+(i-1)*size*.24,y-size*(1-q),size*.9,0,Math.sin(q*Math.PI)*fade,1.35);}
          tex('wave',x,y+size*.25,size*(.5+p),0,fade,.5);break;
        }
        case 'wave': {
          tex(projectile,lerp(origin.x,x,t),lerp(origin.y,y,t),size*(.7+t*.6),a,fade);
          tex('wave',lerp(origin.x,x,clamp(t-.18)),lerp(origin.y,y,clamp(t-.18)),size*.85,a,fade*.4);break;
        }
        case 'prison': case 'chains': case 'vines': {
          for(let i=0;i<4;i++){const angle=i*Math.PI/2+p*.2, radius=size*.48*(1-t*.65);tex(projectile,x+Math.cos(angle)*radius,y+Math.sin(angle)*radius*.5,size*.65,form==='chains'?angle:form==='vines'?angle+p:0,fade);}
          if(form==='prison')tex('glacier',x,y,size*(.4+t*.6),0,fade*.6);break;
        }
        case 'phoenix': case 'dragon': case 'tiger': case 'roar': {
          if(self){tex(projectile,x+Math.sin(p*4)*size*.16,y-size*.12,size*(.6+p*.4),Math.sin(p*4)*.15,fade);break;}
          const flight=form==='tiger'?-Math.sin(t*Math.PI)*size*.5:Math.sin(t*Math.PI*2)*size*.25;
          tex(projectile,lerp(origin.x,x,t),lerp(origin.y,y,t)+flight,size*(.65+t*.55),a,fade);
          if(form==='roar'||p>.6)for(let i=0;i<3;i++)tex('quake',x,y,size*(p+.1+i*.2),0,fade*.4,.6);break;
        }
        case 'sun': case 'sunburst': case 'beacon': case 'bell': {
          tex(projectile,x,y-size*.2,size*(.35+Math.sin(p*Math.PI)*.85),0,fade);
          for(let i=0;i<3;i++)tex('quake',x,y+size*.2,size*(p*.8+i*.22),0,fade*.55,.35);
          if(form==='sunburst'&&p>.55)tex('blast',x,y,size*(p+.5),0,fade);break;
        }
        case 'fan': {
          for(let i=0;i<n;i++){const spread=(i-(n-1)/2)*size*.23*Math.sin(t*Math.PI);tex(projectile,lerp(origin.x,x,t)+Math.sin(a)*spread,lerp(origin.y,y,t)-Math.cos(a)*spread,size*.42,a,fade);}
          break;
        }
        case 'swordring': case 'orbit': case 'constellation': case 'triangle': {
          const count=form==='triangle'?3:form==='constellation'?7:n, radius=size*(self?.45:.65*(1-t*.6));
          for(let i=0;i<count;i++){const angle=i*Math.PI*2/count+p*2.5;
            const name=form==='constellation'?['phoenix','dragon','tiger','tortoise','bell','lotus','sun'][i]:projectile;
            tex(name,x+Math.cos(angle)*radius,y+Math.sin(angle)*radius*.55,size*(form==='constellation'?.32:.37),angle+Math.PI,fade);}
          break;
        }
        case 'firewall': case 'waterwall': case 'bladegate': case 'armor': case 'dome': case 'tortoise': case 'mirror': {
          if(form==='bladegate')for(let i=0;i<5;i++)tex('sword',x+(i-2)*size*.18,y,size*.8,Math.PI/2,fade);
          else if(form==='armor')for(let i=0;i<3;i++)tex(projectile,x+(i-1)*size*.18,y,size*(.7-i*.05),0,fade*(.65+i*.1));
          else if(form==='mirror'){tex('tortoise',x,y,size,-p*.3,fade);tex('light',x+size*.3,y-size*.22,size*.4,p,fade);}
          else tex(projectile,x,y+size*.15*(1-t),size*(.25+t*.85),0,fade,1.1);
          break;
        }
        case 'fountain': case 'firelotus': case 'lotus': case 'petals': case 'sprout': case 'tree': case 'purify': case 'firering': {
          tex(projectile,x,y+size*.12,size*(.3+t*.7),form==='purify'||form==='firering'?p*3:0,fade);
          for(let i=0;i<n+2;i++){const angle=i*Math.PI*2/(n+2),r=size*(.15+p*.35);tex(form==='firelotus'?'fire':form==='firering'?'fireblade':'leaves',x+Math.cos(angle)*r,y+Math.sin(angle)*r*.45-p*size*.5,size*.15,angle+p,fade*.7);}
          break;
        }
        case 'mist': case 'smokeveil': case 'emberstep': case 'shadowstep': {
          for(let i=0;i<3;i++)tex(projectile,x+(i-1)*size*p*.7,y-size*.12*p,size*(.7+p*.6),i*.5,fade*(i===1?.7:.35));break;
        }
        case 'shatter': {
          if(p<.35)tex('shield',origin.x,origin.y,size*.7,0,1-p*2);
          for(let i=0;i<6;i++){const q=clamp((p-.2)/.5),spread=(i-2.5)*size*.09*Math.sin(q*Math.PI);tex(item.element==='metal'?'sword':item.art.projectile,lerp(origin.x,x,q),lerp(origin.y,y,q)+spread,size*.25,a,fade);}
          break;
        }
        case 'brand': {
          tex('seal',x,y,size*(.3+t*.45),-p,fade);for(let i=0;i<3;i++)tex('spark',x+Math.cos(i*2.1)*size*.35,y+Math.sin(i*2.1)*size*.35,size*.17,0,fade);
          if(p>.7)tex(impact,x,y,size*(p-.5)*2,0,fade);break;
        }
        default: tex(projectile,lerp(origin.x,x,t),lerp(origin.y,y,t),size*.6,a,fade);
      }
    }
    paint(item, progress, reduced) {
      const actor = this.players[item.pid ?? 0], target = this.target;
      const attack = item.type === 'damage' || item.type === 'hurt';
      const enemyAura = ['dot', 'debuff', 'mark', 'removeBuff'].includes(item.op) || ['control', 'interrupted', 'kill', 'spawn'].includes(item.type);
      const from = item.type === 'hurt' ? target : actor;
      const to = item.type === 'hurt' ? actor : attack || enemyAura ? target : actor;
      const size = Math.min(this.w * .32, 125 + item.profile.tier * 22);
      if (item.type === 'skill' || item.type === 'finisherPart') {
        this.text(item.label, this.w / 2, this.demo ? 28 : Math.max(32, target.y - 80), Math.sin(progress * Math.PI), '#ffe3a2', this.w < 450 ? 15 : 19); return;
      }
      if (item.type === 'kill' || item.type === 'spawn') {
        this.texture(item.type === 'kill' ? 'dust' : 'seal', to.x, to.y, size * (1 + progress), 0, (1 - progress) * .7);
        this.text(item.label, to.x, to.y - 35, Math.sin(progress * Math.PI)); return;
      }
      if (!reduced && (item.profile.tier > 0 || item.source === 'counter') && item.source !== 'dot') {
        this.motif(item, from, to, progress, size, !attack);
        if (progress > .6 || !attack) {
          const hit=clamp((progress-.6)/.4);
          if(attack){this.texture(item.art.impact,to.x,to.y,size*(.35+hit*.5),0,(1-hit)*.55);this.fragments(to.x,to.y,hit,item,size*.5);}
          this.text(item.label,to.x,to.y-35-hit*24,Math.min(1,(1-progress)*4),item.art.color,attack?21:14);
        }
        return;
      }
      if (attack && !reduced && progress < .48 && item.source !== 'dot') {
        if (progress < .12) this.texture('seal', from.x, from.y, size * .55, 0, progress / .12);
        const t = clamp((progress - .1) / .38), motion = item.profile.motion;
        let x = lerp(from.x, to.x, t), y = lerp(from.y, to.y, t), angle = Math.atan2(to.y - from.y, to.x - from.x);
        if (motion === 'fall') { x = to.x; y = lerp(to.y - size * 1.5, to.y, t); angle = Math.PI / 2; }
        else if (motion === 'arc') y -= Math.sin(t * Math.PI) * size * .5;
        else if (motion === 'spiral' || motion === 'orbit') { x += Math.sin(t * Math.PI * 4) * (1 - t) * size * .28; y -= Math.sin(t * Math.PI) * size * .4; }
        for (let n = 4; n > 0; n--) this.texture(item.art.projectile, x - Math.cos(angle) * n * 8, y - Math.sin(angle) * n * 8, size * .48, angle, .06 * (5 - n));
        this.texture(item.art.projectile, x, y, size * .6, angle, 1);
      }
      const hit = reduced ? progress : attack ? clamp((progress - .48) / .52) : progress;
      if (!attack || reduced || progress >= .48 || item.source === 'dot') {
        this.texture(item.art.impact, to.x, to.y, size * (reduced ? .64 : .55 + hit * .65), reduced ? 0 : hit * .25, (1 - hit) * .95);
        if (!reduced) this.fragments(to.x, to.y, hit, item, size * .65);
        const label = item.type === 'hurt' && item.absorbed ? `${item.label} · 擋 ${Math.round(item.absorbed)}` : item.label;
        this.text(label, to.x, to.y - 28 - (reduced ? 0 : hit * 30), Math.min(1, (1 - hit) * 2.5), item.type === 'hurt' ? '#ffb5a0' : item.art.color, item.type === 'damage' ? 21 : 14);
      }
    }
    draw(now) {
      this.frame = 0; if (this.destroyed) return;
      const wasRunning = this.runs.length > 0;
      const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
      syncPreferences();
      const reduced = reducedMedia.matches || document.getElementById('reduceEffects')?.checked;
      if (this.demo) {
        ctx.fillStyle = '#071b20'; ctx.fillRect(0, 0, this.w, this.h);
        const monster = images.monster;
        if (monster) {
          const ratio = monster.width / monster.height;
          const width = Math.min(this.w * .34, this.h * .55 * ratio), height = width / ratio;
          ctx.drawImage(monster, this.target.x - width / 2, this.target.y - height / 2, width, height);
        }
        this.texture('seal', this.players[0].x, this.players[0].y, this.w * .15, 0, .65);
        this.text('施術者', this.players[0].x, this.players[0].y + 45, 1, '#c7d6c9', 13);
      }
      ctx.save();
      if (!this.demo) {
        ctx.beginPath(); ctx.rect(0, 0, this.w, this.h);
        for (const r of this.exclusions) ctx.rect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
        ctx.clip('evenodd');
      }
      this.runs = this.runs.filter(run => now < run.start + run.plan.duration);
      if (!this.demo && active) {
        const displayed = this.runs.find(run => now >= run.start) || this.monster;
        const speciesId = displayed?.speciesId;
        const monster = speciesId ? monsterImages.get(speciesId)?.image : images.monster;
        this.canvas.dataset.monsterSpecies = speciesId || 'legacy';
        if (monster) {
          // V2 artwork includes both wide beasts and tall humanoids; fit the full silhouette.
          const scale = Math.min(this.beastSize / monster.width, this.beastSize * 2 / 3 / monster.height);
          const width = speciesId ? monster.width * scale : this.beastSize;
          const height = speciesId ? monster.height * scale : this.beastSize * 2 / 3;
          ctx.drawImage(monster, this.target.x - width / 2, this.target.y - height / 2, width, height);
        }
        if (!this.inStage) this.text(displayed?.name || '', this.target.x, this.target.y + this.beastSize * .36, .85, P.elements[displayed?.element]?.color, 11);
      }
      let painted = 0; const banners = [];
      for (const run of this.runs) for (let i = 0; i < run.plan.items.length; i++) {
        const item = run.plan.items[i], elapsed = now - run.start - item.at;
        if (elapsed < 0 || elapsed > item.duration) continue;
        const p = elapsed / item.duration;
        if (!run.sounds.has(i) && p >= item.soundAt) {
          run.sounds.add(i);
          if (!['skill', 'finisherPart', 'kill', 'spawn', 'ailment'].includes(item.type)) playSound(item.art.sound, item, this);
        }
        if (!(enabled || this.demo) || painted++ >= 32) continue;
        if (item.type === 'skill' || item.type === 'finisherPart') banners.push([item, p]);
        else this.paint(item, p, reduced);
      }
      ctx.restore();
      for (const [item, p] of banners) this.paint(item, p, reduced); this.canvas.dataset.running = String(this.runs.length > 0);
      if (this.runs.length) this.wake();
      else if (this.demo && wasRunning) this.canvas.dispatchEvent(new Event('vfxcomplete'));
    }
    stop() { this.runs = []; cancelAnimationFrame(this.frame); this.frame = 0; stopAudio(this); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.canvas.dataset.running = 'false'; }
    seek(progress) {
      if (!this.demo || !this.runs.length) return;
      cancelAnimationFrame(this.frame);this.frame=0;
      const run=this.runs[0];run.sounds=new Set(run.plan.items.map((_,i)=>i));
      this.draw(run.start+run.plan.duration*Math.min(.95,clamp(progress)));
      cancelAnimationFrame(this.frame);this.frame=0;stopAudio(this);this.canvas.dataset.running='false';
    }
    destroy() { this.stop(); this.destroyed = true; this.observer.disconnect(); stages.delete(this); }
  }
  function sync(state) {
    active = !!state?.cultivation;
    if (!active) { stop(); return; }
    if (!main) {
      const table = document.getElementById('playersGrid'); if (!table) return;
      const canvas = document.createElement('canvas'); canvas.id = 'cultivationBattleEffects'; canvas.className = 'cult-battle-effects'; canvas.setAttribute('aria-hidden', 'true'); table.append(canvas); main = new Stage(canvas);
      loadAssets().then(()=>{if(active)main?.wake();});
    }
    main.layout();
    main.monster = state.cultivation.monster;
    loadMonster(state.cultivation.version >= 2 ? main.monster.speciesId : null);
    main.wake();
  }
  function consume(effects, before) {
    if (document.hidden || !effects?.length) return;
    sync({ cultivation: before }); if (!main) return;
    const key = `${before.handNumber}:${effects[0].seq}`;
    if (seen.has(key)) return; seen.add(key);
    if (seen.size > 1000) seen.delete(seen.values().next().value);
    const snapshot = { monsterId: before.monster.id, speciesId: before.version >= 2 ? before.monster.speciesId : null, element: before.monster.element, name: before.monster.name };
    const plan = P.plan(effects);
    if (before.version < 2) { main.add(plan, snapshot); return; }
    const identities = new Map([[snapshot.monsterId, snapshot]]);
    for (const effect of effects) if (effect.type === 'spawn') {
      // Spawn names are unique catalog identities. No combat event mutation is needed.
      const species = root.MahjongCultivationMonsters.all.find(monster => monster.name === effect.name);
      if (species) {
        identities.set(effect.monsterId, { monsterId: effect.monsterId, speciesId: species.id, element: species.element, name: species.name });
        loadMonster(species.id);
      }
    }
    const groups = [];
    for (const item of plan.items) {
      const monsterId = item.monsterId ?? snapshot.monsterId;
      let group = groups.at(-1);
      if (!group || group.monsterId !== monsterId) {
        group = { monsterId, offset: item.at, items: [] }; groups.push(group);
      }
      // Partition the already-authored plan so skill profiles and secret handling survive.
      group.items.push({ ...item, at: item.at - group.offset });
    }
    for (const group of groups) {
      const identity = identities.get(group.monsterId);
      if (!identity) continue;
      main.add({ items: group.items,
        duration: Math.max(1, ...group.items.map(item => item.at + item.duration)),
        damage: group.items.filter(item => item.type === 'damage').reduce((sum, item) => sum + item.amount, 0)
      }, identity);
    }
  }
  function stop() { main?.stop(); }
  function reset() { stop(); seen.clear(); }
  function resultDelay(pace = 1) {
    if (!enabled) return 1000;
    const end = Math.max(performance.now(), ...(main?.runs || []).map(r => r.start + r.plan.duration));
    return Math.max(1000, (end - performance.now() + 160) / (pace || 1));
  }
  function setEnabled(value) {
    enabled = !!value; try { localStorage.setItem('mahjong.cultivation.vfx', enabled ? 'on' : 'off'); } catch (_) { /* Optional preference. */ }
  }
  function mountPreview(canvas) { return new Stage(canvas, true); }
  function previewEvents(id, healthy = false) {
    const C = root.MahjongCultivationCombat, F = root.MahjongCultivationFinishers, S = root.MahjongCultivationSkills;
    const state = C.create(21023), p = state.players[0];
    state.monster.hp = state.monster.maxHp = 20000; p.hp = healthy ? 1000 : 380; p.shield = 160; p.shieldTurns = 4; p.aggro = 600; p.damageTaken = 350;
    p.statuses = [{ kind: 'burn', negative: true, duration: 3, value: 30 }];
    state.monster.nextAttack.charged = true;
    state.monster.statuses = [{ op: 'dot', kind: 'burn', owner: 0, element: 'fire', amount: 40, ticks: 3 }, { kind: 'defenseUp', value: .2, duration: 3 }];
    let event;
    if (id.startsWith('finisher:')) {
      const row = F.get(id.slice(9));
      if (!row) throw Error('Unknown finisher');
      if (row.special) event = { type: 'finish', pid: 0, flowerKind: row.id, from: 1 };
      else {
        const item = { id: row.id, fan: 2 };
        if (row.source === 'mixed' || row.source === 'suit') item.suit = 'W';
        if (row.source === 'keys') item.keys = row.id === 'flower' ? ['H1', 'H2'] : row.id === 'dragons' ? ['DC', 'DF'] : ['FE'];
        if (row.source === 'streak') item.streak = 2;
        event = { type: 'finish', pid: 0, from: row.selfOnly ? -1 : 1, method: row.selfOnly ? 'selfDraw' : row.id === 'rob-kong' ? 'robKong' : 'discard', fan: row.id === 'base' ? 0 : 2, items: row.id === 'base' ? [] : [item] };
      }
    } else {
      const s = S.get(id); if (!s) throw Error('Unknown skill');
      if (s.action === 'formation') {
        const kind = s.id.split('.')[1];
        if (['seven', 'eight'].includes(kind)) event = { type: 'finish', pid: 0, flowerKind: kind, from: 1 };
        else { p.flowers = kind === 'seasons' ? ['H1', 'H2', 'H3'] : ['H5', 'H6', 'H7']; event = { type: 'flower', pid: 0, key: kind === 'seasons' ? 'H4' : 'H8' }; }
      } else if (s.action === 'flower') event = { type: 'flower', pid: 0, key: s.combo };
      else event = { type: 'meld', pid: 0, action: s.action, ...(['W', 'T', 'B'].includes(s.family) ? { keys: [...s.combo].map(n => s.family + n) } : { key: s.combo }) };
    }
    const result = C.apply(state, { ...event, id: 1, monsterId: state.monster.id });
    return { plan: P.plan(result.effects), state, effects: result.effects };
  }
  function showPreview(id) {
    preview?.close();
    const previous = document.activeElement, dialog = document.createElement('dialog'); dialog.className = 'cult-vfx-preview';
    const header = document.createElement('header'), title = document.createElement('h2'), closeButton = document.createElement('button');
    title.textContent = P.profile(id).name; closeButton.textContent = '關閉 ×'; header.append(title, closeButton);
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', '上古神兵技能施放預覽');
    const info = document.createElement('p'); info.textContent = '獨立演武：受傷、持盾與帶印記的測試角色；不影響本局。音量沿用設定。';
    const play = document.createElement('button'); play.textContent = '重播招式與音效';
    const full = document.createElement('button'); full.textContent = '滿血情境';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    dialog.append(header, canvas, info, play, full, status); document.body.append(dialog); dialog.showModal();
    const stage = mountPreview(canvas);
    const run = healthy => {
      stage.stop(); const data = previewEvents(id, healthy);
      status.textContent = `演武結算傷害 ${data.plan.damage} · ${healthy ? '滿血' : '受傷'}情境`;
      stage.add(data.plan, { monsterId: data.state.monster.id, element: data.state.monster.element });
    };
    const close = () => {
      stage.destroy(); dialog.close(); dialog.remove(); preview = null;
      const target = previous?.isConnected && previous.getClientRects().length ? previous : document.getElementById('tableMenuBtn');
      target?.focus({ preventScroll: true });
    };
    preview = { close }; closeButton.onclick = close; dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    play.onclick = () => run(false); full.onclick = () => run(true);
    loadAssets().then(() => { if (dialog.isConnected) run(false); }); closeButton.focus();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stages.forEach(stage => stage.stop()); stopAudio(); } else stages.forEach(stage=>stage.wake()); });
  document.addEventListener('input', syncPreferences);
  root.addEventListener('resize', () => stages.forEach(stage => stage.layout()));
  const closePreview = () => preview?.close();
  root.MahjongCultivationEffects = Object.freeze({ sync, consume, stop, reset, resultDelay, syncPreferences, setEnabled, closePreview,
    showPreview, previewEvents, mountPreview, get loaded() { return loadAssets(); }, get enabled() { return enabled; } });
})(window);
