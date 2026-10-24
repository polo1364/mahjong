/* Monster actions replace one attack. Data is shared by combat, forecast and bestiary. */
(function(root){'use strict';
const rows = [
 ['whetgold-rat','gnaw','齧金破甲','single',145,'metal','fang',{kind:'fragile',value:.05,duration:1}],
 ['bladefeather-crow','dive','掠空先擊','single',160,'metal','feathers'],
 ['binding-vine','drain','纏根汲靈','single',140,'wood','roots',null,{heal:60}],
 ['moss-flower','pollen','迷香蝕息','all',70,'wood','pollen',{kind:'healingDown',value:.05,duration:1}],
 ['coldpool-spirit','erode','寒潮蝕盾','single',140,'water','water-ring',null,{strip:20}],
 ['frostfang-wolf','bite','霜牙雙噬','single',150,'water','ice-fangs',null,{hits:2}],
 ['embertail-fox','brand','狐焰烙印','single',150,'fire','fox-tail',{kind:'burn',value:10,duration:2}],
 ['molten-shell-beetle','shell','熔殼震擊','single',145,'fire','shell',null,{shield:40}],
 ['stoneback-boar','charge','崩岩衝撞','single',160,'earth','rush',null,{charged:true}],
 ['sand-construct','gather','聚砂成甲','single',140,'earth','sand',null,{shield:60}],
 ['golden-tiger','pounce','裂岳撲殺','single',200,'metal','tiger',null,{charged:true}],
 ['golden-tiger','roar','震魄虎嘯','all',80,'metal','roar',{kind:'monsterAggroUp',value:.1,duration:1,topOnly:true}],
 ['forest-vine-demon','regrow','古木回生','single',150,'wood','tree',null,{heal:100}],
 ['forest-vine-demon','bind','萬藤封息','all',72,'wood','bind',{kind:'healingDown',value:.08,duration:1}],
 ['abyss-jiaolong','tide','玄潮壓境','all',80,'water','dragon-wave',{kind:'shieldGainDown',value:.08,duration:2}],
 ['abyss-jiaolong','spear','碎玉寒矛','single',140,'water','ice-spear',null,{strip:40}],
 ['blazing-lion','inferno','焚天獅吼','all',106,'fire','lion-flame',null,{charged:true}],
 ['blazing-lion','claw','赤鬃焰爪','single',153,'fire','flame-claw',{kind:'burn',value:15,duration:2}],
 ['mountain-colossus','fist','鎮岳重拳','single',194,'earth','stone-fist',null,{charged:true}],
 ['mountain-colossus','ward','地脈護身','all',75,'earth','stone-wall',null,{shield:100}],
 ['blackarmor-general','cleave','鎮岳斷軍','single',225,'earth','halberd',null,{charged:true}],
 ['blackarmor-general','quake','玄甲震陣','all',81,'earth','bronze-array',{kind:'fragile',value:.08,duration:1}],
 ['blackarmor-general','gate','不動山關','single',162,'earth','gate',null,{shield:100}],
 ['nether-vine-queen','bloom','九幽回春','all',90,'wood','ghost-flower',null,{heal:120}],
 ['nether-vine-queen','curse','蝕心花咒','single',158,'wood','flower-seal',{kind:'healingDown',value:.1,duration:2}],
 ['nether-vine-queen','burial','幽庭葬花','all',113,'wood','lotus-blades',null,{charged:true}],
 ['crimson-sword-demon','rain','赤霄劍雨','all',119,'metal','sword-rain',null,{charged:true}],
 ['crimson-sword-demon','cross','雙極斷空','single',185,'metal','cross-slash',null,{hits:2}],
 ['crimson-sword-demon','riposte','逆刃劍罡','single',167,'metal','sword-guard',null,{riposte:30}],
 ['five-phase-sovereign','metal','裂天兵劫','single',195,'metal','twin-weapons',null,{hits:2}],
 ['five-phase-sovereign','wood','萬藤歸命','single',176,'wood','tree-avatar',null,{heal:80}],
 ['five-phase-sovereign','water','玄淵覆海','all',86,'water','sea-wheel',null,{strip:20}],
 ['five-phase-sovereign','fire','焚界真炎','single',176,'fire','fire-core',{kind:'burn',value:10,duration:2}],
 ['five-phase-sovereign','earth','鎮獄山印','single',176,'earth','mountain-seal',null,{shield:60}],
 ['five-phase-sovereign','thunder','五相劫雷','all',119,'neutral','five-thunder',null,{charged:true}]
];
const all=rows.map(([speciesId,key,name,type,damage,element,motion,ailment,extra])=>Object.freeze({
 id:speciesId+'.'+key,speciesId,name,type,damage,element,motion,
 hits:1,charged:false,heal:0,shield:0,strip:0,riposte:0,...extra,
 ailment:ailment?Object.freeze(ailment):null,audio:'assets/monster-skills/'+speciesId+'.'+key+'.mp3'
}));
const get=id=>all.find(s=>s.id===id)||null;
const forSpecies=id=>all.filter(s=>s.speciesId===id);
function select(species,actionNumber,element){
 const list=forSpecies(species.id),n=actionNumber-1;
 if(species.tier==='boss')return get(species.id+'.'+(actionNumber%3===0?'thunder':element));
 if(species.id==='bladefeather-crow')return n===0?list[0]:null;
 if(species.tier==='small')return n%3===0?list[0]:null;
 if(species.tier==='elite')return n%2===0?list[(n%4)/2]:null;
 return n%4<3?list[n%4]:null;
}
const labels={fragile:'承傷增加',healingDown:'治療降低',shieldGainDown:'護盾取得降低',monsterAggroUp:'新增仇恨增加',burn:'灼傷'};
function describe(skill){
 if(!skill)return '一般攻擊';
 const parts=[`${skill.type==='all'?'全體各':'單體'} ${skill.damage} 基礎傷害`];
 if(skill.hits>1)parts.push(`${skill.hits}段共用總傷害，受擊觸發一次`);
 if(skill.strip)parts.push(`攻擊前削除最多 ${skill.strip} 護盾，不觸發吸收轉傷`);
 if(skill.heal)parts.push(`自身回復最多 ${skill.heal}，每次遭遇最多2次`);
 if(skill.shield)parts.push(`自身獲得 ${skill.shield} 護盾，每次遭遇最多2次`);
 if(skill.riposte)parts.push(`劍罡：下一個直接攻擊技能結算後反震${skill.riposte}，下次怪物行動前到期`);
 const a=skill.ailment;if(a)parts.push(`${a.topOnly?'當次最高仇恨者：':''}${labels[a.kind]}${a.kind==='burn'?a.value:Math.round(a.value*100)+'%'}，持續自身${a.duration}次出牌`);
 parts.push(skill.charged?'蓄力可打斷；封印可降為普攻':'不可打斷；可用防禦、護盾與降仇應對');
 return parts.join('；');
}
const api=Object.freeze({all:Object.freeze(all),get,forSpecies,select,describe,labels:Object.freeze(labels)});
root.MahjongMonsterSkills=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
