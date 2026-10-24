/* Deterministic visual recipes: position paths and timing never alter combat. */
(function(root){'use strict';
// layer: raster, trajectory, start/end seconds, scale, count, spread/rotation.
const L=(sprite,path,start,end,size,count=1,spread=0)=>({sprite,path,start,end,size,count,spread});
const rows={
 'fang':[L('sword','jaw',.12,.8,.8,2,.65),L('impact','burst',.65,1.2,.7)],
 'feathers':[L('sword','fan',.08,.8,.55,7,.85),L('slash','sweep',.65,1.2,1.1)],
 'roots':[L('root','crawl',0,1,.8,5,.35),L('leaves','return',.8,1.65,.35,7,.5)],
 'pollen':[L('lotus','source',0,.65,1),L('poison','fan',.3,1.5,.5,9,1.3)],
 'water-ring':[L('wave','orbit',0,.7,1,3,1),L('ice','burst',.7,1.25,.7,5,.8)],
 'ice-fangs':[L('ice-fangs','flight',0,.6,1.15),L('icelance','jaw',.48,.95,1.1,2,.75),L('ice','burst',.85,1.5,.65,5,.8)],
 'fox-tail':[L('fireblade','arc',0,.8,1.1,3,.7),L('seal','stamp',.7,1.6,.8)],
 'shell':[L('meteor','flight',.15,.85,1),L('crater','burst',.8,1.4,1.2),L('shield','source',.9,1.7,.9)],
 'rush':[L('dust','source',0,.55,1.2),L('beast','flight',.4,.9,1.2),L('quake','burst',.85,1.6,1.4)],
 'sand':[L('dust','crawl',0,.8,.65,8,.7),L('mountain','slam',.5,1.05,.8),L('dust','return',1,1.7,.5,6,.7)],
 'tiger':[L('beast','leap',.15,.85,1.5),L('slash','claw',.65,1.3,.9,3,.6)],
 'roar':[L('tiger','source',0,.55,1),L('wave','shockwave',.35,1.5,1.5,3,.7)],
 'tree':[L('root','slam',.12,.85,1.3,3,.7),L('leaves','return',.75,1.6,.6,9,1.1)],
 'bind':[L('vines','crawl',0,.8,1,4,.65),L('root','orbit',.7,1.65,.8,4,.75)],
 'dragon-wave':[L('dragon-wave','leap',0,1.1,1.8),L('tidalwave','fan',.5,1.5,1.2,3,.6),L('wave','burst',1,1.8,1.1)],
 'ice-spear':[L('icelance','flight',.12,.75,1.3),L('ice','burst',.7,1.5,.8,7,.8)],
 'lion-flame':[L('beast','source',0,.6,1.2),L('firewall','fan',.35,1.35,1.2,5,.7),L('embers','burst',1.1,1.8,.8)],
 'flame-claw':[L('fireblade','claw',.15,.85,1.1,3,.7),L('fire','stamp',.7,1.7,.7)],
 'stone-fist':[L('mountain','slam',.2,.9,1.6),L('dust','burst',.8,1.6,.9,8,1.2)],
 'stone-wall':[L('quake','shockwave',0,1.1,1.2,2,.6),L('mountain','source-rise',.6,1.7,1.2,3,.8)],
 'halberd':[L('sword','windup',0,.5,1.6),L('sword','slam',.45,1,1.7),L('slash','sweep',.9,1.65,1.5)],
 'bronze-array':[L('seal','source',0,.6,1.5),L('quake','shockwave',.4,1.55,1.7,4,.6)],
 'gate':[L('mountain','flight',.1,.85,1.1),L('pillar','source-rise',.7,1.75,1.1,2,1.1)],
 'ghost-flower':[L('lotus','source-rise',0,.8,1.4),L('leaves','fan',.25,1,.65,6,1),L('orbs','return',.9,1.7,.5,6,.7)],
 'flower-seal':[L('leaves','orbit',0,.8,.6,8,1),L('seal','stamp',.6,1.7,1.2)],
 'lotus-blades':[L('lotus','source-rise',0,.65,1.7),L('sword','rain',.5,1.6,.8,10,1.3)],
 'sword-rain':[L('sword','rain',.25,1.4,1.15,9,1.5),L('impact','burst',1.15,1.8,1)],
 'cross-slash':[L('slash','cross',.1,.75,1.65,2,1),L('light','sweep',.6,1.3,1.3)],
 'sword-guard':[L('sword','flight',0,.65,1.1),L('sword','source-orbit',.6,1.8,1,5,1)],
 'twin-weapons':[L('sword','jaw',.15,.85,1.7,2,1),L('impact','burst',.7,1.5,1.25)],
 'tree-avatar':[L('beast','source-rise',0,.6,1.5),L('root','crawl',.35,1.1,1.5,3,.6),L('orbs','return',1,1.8,.6,5,.7)],
 'sea-wheel':[L('waterwall','source-orbit',0,.75,1.4,4,1),L('tidalwave','flight',.6,1.3,1.5),L('ice','burst',1.2,1.8,.7,4,.7)],
 'fire-core':[L('sun','source',0,.6,.9),L('fire','flight',.5,1,1),L('firewall','orbit',.9,1.8,1.3,4,.8)],
 'mountain-seal':[L('seal','windup',0,.6,1.4),L('mountain','slam',.5,1.15,1.7),L('dome','source',1,1.9,1.2)],
 'five-thunder':[L('five-thunder','source-rise',0,.85,1.8),L('thunder','rain',.75,1.5,1.5,3,.7),L('light','burst',1.15,1.9,1.5)]
};
// Original ElevenLabs material is layered into separately authored charge/strike/tail mixes.
const sounds={
 fang:['metal','shatter','shield'],feathers:['stealth','metal','sword-rain'],roots:['wood','poison','bless'],pollen:['bell','poison','wood'],
 'water-ring':['water','shatter','fountain'],'ice-fangs':['water','shatter','metal'],'fox-tail':['tornado','fire','seal'],shell:['fire','earth','shield'],rush:['earth','meteor','shatter'],sand:['earth','wood','shield'],
 tiger:['dragon','metal','earth'],roar:['dragon','bell','tornado'],tree:['wood','earth','bless'],bind:['poison','wood','seal'],
 'dragon-wave':['dragon','water','fountain'],'ice-spear':['water','metal','shatter'],'lion-flame':['dragon','eruption','fire'],'flame-claw':['fire','metal','tornado'],
 'stone-fist':['earth','meteor','shatter'],'stone-wall':['earth','shield','seal'],halberd:['metal','meteor','sword-rain'],'bronze-array':['bell','earth','seal'],gate:['earth','shield','bell'],
 'ghost-flower':['poison','bell','bless'],'flower-seal':['wood','seal','poison'],'lotus-blades':['bell','sword-rain','wood'],'sword-rain':['metal','sword-rain','shatter'],
 'cross-slash':['stealth','metal','thunder'],'sword-guard':['metal','shield','seal'],'twin-weapons':['bell','metal','earth'],'tree-avatar':['wood','dragon','bless'],
 'sea-wheel':['water','tornado','shatter'],'fire-core':['fire','eruption','thunder'],'mountain-seal':['seal','meteor','earth'],'five-thunder':['seal','thunder','bell']
};
const recipes=Object.freeze(Object.fromEntries(Object.entries(rows).map(([id,layers])=>[id,Object.freeze({layers:Object.freeze(layers.map(Object.freeze)),sounds:Object.freeze(sounds[id]),duration:2.1})])));
const api=Object.freeze({recipes});root.MahjongMonsterPresentation=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
