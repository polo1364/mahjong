/* Equipment V3 catalog and pure ability queries. */
(function(root) { 'use strict';
  const Progression=typeof module!=='undefined'&&module.exports?require('./cultivation-progression.js'):root.MahjongCultivationProgression;
  const slots = Object.freeze(['weapon', 'armor', 'accessory']);
  const grades = Object.freeze(['凡', '靈', '玄', '地', '天']);
  const base = Object.freeze([2, 2.5, 3, 3.5, 4]);
  const ordinary = [
    ['chi-xiao-sword','赤霄劍','weapon','basic',.02], ['xuanfu-staff','玄符杖','weapon','active',.02],
    ['huifeng-halberd','回鋒戟','weapon','counter',.04], ['qingheng-whisk','青蘅拂塵','weapon','healStore',.05],
    ['ningyu-ringblade','凝玉環刃','weapon','shieldStore',.05],
    ['zhenyue-armor','鎮岳甲','armor','topTaken',.01], ['liuyun-robe','流雲袍','armor','aoeTaken',.02],
    ['huichun-robe','回春衣','armor','discardHeal',5], ['xuanyu-robe','玄玉衣','armor','discardShield',5],
    ['yexing-robe','夜行衣','armor','aggro',.03],
    ['chiyao-pendant','赤曜佩','accessory','damage',.01], ['qingheng-pendant','青蘅墜','accessory','heal',.02],
    ['ningyu-jade','凝玉璧','accessory','shield',.02], ['yinxi-bell','隱息鈴','accessory','aggro',.04],
    ['huifeng-seal','回鋒印','accessory','counter',.03]
  ];
  const sets = [
    {id:'zhenyue',name:'鎮岳玄甲',source:'blackarmor-general',grade:4,names:['鎮岳重戟','玄甲戰衣','山魄印'],description:'2件：護盾+2%；3件：實際吸收每100，下次普攻追加10土傷，每局3次。'},
    {id:'jiuyou',name:'九幽靈藤',source:'nether-vine-queen',grade:4,names:['靈藤杖','幽蘅衣','返生墜'],description:'2件：治療+2%；3件：有效治療每100，下次普攻追加10木傷，每局3次。'},
    {id:'chixiao',name:'赤霄劍意',source:'crimson-sword-demon',grade:4,names:['赤霄古劍','劍紋袍','破霄佩'],description:'2件：傷害+1%；3件：每3次直接傷害組牌追加15金傷，每局2次。'},
    {id:'wuxiang',name:'五相歸元',source:'five-phase-sovereign',grade:5,names:['五相神兵','歸元法衣','輪轉璧'],description:'2件：治療及護盾各+1%；3件：相鄰不同五行的3次攻擊技能追加15無屬傷，每局2次。'}
  ].map(s=>Object.freeze({...s,names:Object.freeze(s.names)}));
  const descriptions = {basic:'普攻傷害+2%',active:'主動組牌、花技、終式傷害+2%',counter:'反擊傷害提升',healStore:'有效治療5%儲至下次普攻，上限10／每局20',shieldStore:'實際護盾吸收5%儲至下次普攻，上限10／每局20',topTaken:'最高有效仇恨時怪物傷害-1%',aoeTaken:'怪物全體傷害-2%',discardHeal:'自己出牌後治療5，每局5次',discardShield:'自己出牌後護盾5，持續2次自己出牌，每局5次',aggro:'新增仇恨降低',damage:'所有傷害+1%',heal:'治療+2%',shield:'護盾+2%'};
  const all = ordinary.map(([id,name,slot,ability,value])=>Object.freeze({id,name,slot,setId:null,ability,value,description:descriptions[ability],image:`assets/cultivation-equipment/items/${id}.png`}));
  for(const set of sets) for(let i=0;i<3;i++) { const id='set-'+set.id+'-'+slots[i]; all.push(Object.freeze({id,name:set.names[i],slot:slots[i],setId:set.id,ability:null,value:0,description:'套裝單件：只有部位基礎加成',image:`assets/cultivation-equipment/items/${id}.png`})); }
  const get = id=>all.find(item=>item.id===id)||null;
  function equipped(player) { return slots.map(slot=>(player.economy?.inventory||[]).find(item=>item.uid===player.equipment?.[slot])).filter(Boolean); }
  function bonuses(player) {
    const b={damage:0,taken:0,heal:0,shield:0,basic:0,active:0,counter:0,topTaken:0,aoeTaken:0,aggro:0,healStore:0,shieldStore:0,discardHeal:0,discardShield:0,sets:{}};
    for(const item of equipped(player)) {
      const cat=get(item.catId), value=(base[item.grade-1]+item.level*.2)/100;
      if(cat.slot==='weapon') b.damage+=value;
      if(cat.slot==='armor') b.taken+=value;
      if(cat.slot==='accessory') {b.heal+=value;b.shield+=value;}
      if(cat.ability) b[cat.ability]+=cat.value;
      if(cat.setId) b.sets[cat.setId]=(b.sets[cat.setId]||0)+1;
    }
    if(b.sets.zhenyue>=2) b.shield+=.02;
    if(b.sets.jiuyou>=2) b.heal+=.02;
    if(b.sets.chixiao>=2) b.damage+=.01;
    if(b.sets.wuxiang>=2) {b.heal+=.01;b.shield+=.01;}
    return b;
  }
  function factor(player,kind,ctx={}) {
    const b=bonuses(player);
    const p=player.progression&&Progression?Progression.bonuses(player.progression):{};
    if(kind==='damage') return 1+b.damage+(p.damage||0)+(ctx.basic?b.basic+(p.basic||0):0)+(ctx.counter?b.counter+(p.counter||0):0)+(ctx.active?b.active+(p.active||0):0);
    if(kind==='taken') return 1-b.taken-(p.taken||0)-(ctx.top?b.topTaken:0)-(ctx.aoe?b.aoeTaken:0);
    if(kind==='aggro') return 1-b.aggro-(p.aggro||0);
    return 1+(b[kind]||0)+(p[kind]||0);
  }
  function passiveState() { return {stored:0,generated:0,extraDamage:0,extraHits:0,discardHeals:0,discardShields:0,zhenyueMeter:0,zhenyueUses:0,jiuyouMeter:0,jiuyouUses:0,chixiaoCount:0,chixiaoUses:0,wuxiangCount:0,wuxiangElement:null,wuxiangUses:0}; }
  function record(player,kind,amount) {
    const b=bonuses(player), ps=player.equipmentState;
    const ratio=kind==='heal'?b.healStore:b.shieldStore;
    const stored=Math.max(0,Math.min(amount*ratio,10-ps.stored,20-ps.generated)); ps.stored+=stored;ps.generated+=stored;
    const set=kind==='heal'?'jiuyou':'zhenyue';
    if(b.sets[set]===3) ps[set+'Meter']=Math.min(ps[set+'Meter']+amount,(3-ps[set+'Uses'])*100);
  }
  const api=Object.freeze({all:Object.freeze(all),sets:Object.freeze(sets),slots,grades,base,get,equipped,bonuses,factor,passiveState,record});
  root.MahjongCultivationEquipment=api; if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
