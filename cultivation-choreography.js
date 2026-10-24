/* Authored spell silhouettes, not random recolors of one projectile. */
(function(root){
  'use strict';
  const order=['chow','pong','exposed','concealed','added'];
  // Every entry follows the catalogue's numeric rank order. Attack and self effects
  // share a motif, while the combat output still decides which effects actually occur.
  const families={
    W:[
      ['fan','eruption','sun','firelotus','firewall','emberstep','meteor'],
      ['brand','lance','sun','vortex','armor','emberstep','beacon','purify','execute'],
      ['eruption','crater','sunburst','vortex','firewall','smokeveil','phoenix','firering','execute'],
      ['brand','eruption','orbit','firelotus','mirror','smokeveil','beacon','firering','sun'],
      ['fan','lance','brand','firelotus','shatter','emberstep','meteor','mirror','execute']
    ],
    T:[
      ['wave','fountain','orbit','mist','waterwall','prison','waterfall'],
      ['lance','fountain','prison','mist','dome','purify','vortex','beacon','crescent'],
      ['waterfall','dragon','prison','wave','waterwall','purify','vortex','beacon','blizzard'],
      ['orbit','fountain','prison','mirror','dome','purify','lance','dragon','lotus'],
      ['wave','lance','chains','mist','shatter','fountain','vortex','maelstrom','waterfall']
    ],
    B:[
      ['lance','cleave','swordring','cross','cross','shadowstep','rain'],
      ['cross','cleave','bladegate','vortex','lance','purify','bell','execute','swordring'],
      ['cross','lance','bladegate','cross','cleave','rain','mountain','execute','swordring'],
      ['lance','brand','bladegate','lotus','chains','shadowstep','bell','brand','swordring'],
      ['fan','lance','shatter','vortex','chains','shadowstep','cleave','execute','rain']
    ]
  };
  const honors={
    FE:['dragon','fountain','dome','petals'],FS:['sun','sunburst','mirror','orbit'],
    FW:['tiger','roar','tiger','execute'],FN:['tortoise','prison','mist','shatter'],
    DC:['phoenix','phoenix','firelotus','phoenix'],DF:['vines','roots','tree','poison'],
    DB:['armor','mountain','bell','shatter']
  };
  const flowers=['sprout','lotus','fan','blizzard','purify','mist','bamboo','petals'];
  const finishers={base:'lance','all-chows':'wave','all-pungs':'mountain',closed:'brand','self-draw':'sun',
    'closed-self-draw':'sunburst','single-wait':'lance','concealed-3':'cross','concealed-4':'swordring','concealed-5':'rain',
    'half-flush':'orbit','pure-flush':'meteor','all-honors':'constellation',dragons:'phoenix','small-dragons':'triangle',
    'big-dragons':'phoenix','small-winds':'constellation','big-winds':'constellation','seat-wind':'brand','round-wind':'orbit',
    'full-beg':'lance','half-beg':'lotus','rob-kong':'chains',rinshan:'eruption',haitei:'crescent','last-discard':'maelstrom',
    heaven:'heavenbeam',earth:'eruption',human:'cleave','heaven-ready':'cross','earth-ready':'roots',flower:'petals',
    seasons:'orbit',gentlemen:'bamboo',dealer:'bell',streak:'mountain',seven:'constellation',eight:'constellation'};
  const motionNames={fan:'散射合擊',eruption:'地火噴湧',sun:'日輪聚靈',firelotus:'丹蓮回生',firewall:'炎壁展開',emberstep:'灰燼移形',meteor:'天火墜落',brand:'烙印潛伏',lance:'直線貫穿',vortex:'旋渦吞噬',armor:'層甲凝結',beacon:'烽火引妖',purify:'光輪淨化',execute:'巨刃斬落',crater:'地裂崩城',sunburst:'日冕爆發',smokeveil:'煙幕遮身',phoenix:'鳳凰掠擊',firering:'炎輪環身',orbit:'環繞蓄力',mirror:'鏡面反照',shatter:'碎盾反噬',wave:'橫浪推進',fountain:'靈泉湧生',mist:'霧散斂息',waterwall:'水幕擋擊',prison:'冰牢鎖敵',waterfall:'瀑布連落',dome:'穹罩守護',dragon:'游龍穿行',crescent:'月弧切割',blizzard:'冰晶風暴',lotus:'蓮華盛放',chains:'鎖鏈束縛',maelstrom:'漩渦收束',cleave:'橫斬破甲',swordring:'劍陣環繞',cross:'交錯斬擊',shadowstep:'殘影換位',rain:'高空劍雨',bladegate:'巨劍屏障',bell:'古鐘震盪',mountain:'山岳鎮落',tiger:'白虎撲擊',roar:'虎嘯震波',tortoise:'玄武甲陣',petals:'花刃綻放',vines:'藤蔓纏繞',roots:'地根穿刺',tree:'靈木生長',poison:'毒霧吞噬',sprout:'春芽生長',bamboo:'竹節反擊',constellation:'星宿連陣',triangle:'三靈結界',heavenbeam:'天門光柱'};
  function forSkill(s){
    let form,rank=1;
    if(families[s.family]){rank=Number(s.combo[0]);form=families[s.family][order.indexOf(s.action)][rank-1];}
    else if(honors[s.combo])form=honors[s.combo][order.indexOf(s.action)-1];
    else if(s.action==='flower'){rank=Number(s.combo.slice(1));form=flowers[rank-1];}
    else form=({seasons:'orbit',gentlemen:'bamboo',seven:'constellation',eight:'constellation'})[s.id.split('.')[1]]||'heavenbeam';
    return {form,rank,formation:s.action==='formation',beats:Math.max(1,Math.min(7,rank)),label:motionNames[form]};
  }
  function forFinisher(id){const form=finishers[id];return {form,rank:4,beats:5,formation:true,label:motionNames[form]};}
  const api=Object.freeze({forSkill,forFinisher,motionNames});
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.MahjongCultivationChoreography=api;
})(typeof window==='object'?window:globalThis);
