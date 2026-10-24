/* Permanent cultivation rules. Profiles and transitions are plain JSON. */
(function (root) { 'use strict';
  const realms = Object.freeze([
    {name:'煉氣',xp:0,points:1,slots:1,title:'煉氣修士'},
    {name:'築基',xp:100,points:2,slots:1,title:'築基真人'},
    {name:'金丹',xp:400,points:4,slots:2,title:'金丹宗師'},
    {name:'元嬰',xp:1000,points:5,slots:2,title:'元嬰真君'},
    {name:'化神',xp:2200,points:6,slots:2,title:'化神道尊'}
  ].map(r=>Object.freeze(r)));
  const skills = Object.freeze([
    {id:'sword',name:'御劍訣',kind:'basic',values:[.04,.06,.08]},
    {id:'spell',name:'御法訣',kind:'active',values:[.04,.06,.08]},
    {id:'riposte',name:'回鋒訣',kind:'counter',values:[.08,.12,.16]},
    {id:'recovery',name:'回春訣',kind:'heal',values:[.05,.07,.09]},
    {id:'guard',name:'凝盾訣',kind:'shield',values:[.05,.07,.09]},
    {id:'quiet',name:'斂息訣',kind:'aggro',values:[.06,.08,.10]}
  ].map(s=>Object.freeze({...s,values:Object.freeze(s.values)})));
  const aiPriorities=Object.freeze(Object.fromEntries(Object.entries({
    'shen-gufeng':['sword','spell','riposte','guard','recovery','quiet'],
    'chi-ling':['spell','sword','riposte','guard','recovery','quiet'],
    'mu-canglan':['spell','recovery','guard','sword','riposte','quiet'],
    'su-lingheng':['recovery','guard','spell','sword','quiet','riposte'],
    'yue-zhenshan':['guard','riposte','sword','recovery','spell','quiet'],
    'luo-xuanyu':['guard','recovery','riposte','sword','spell','quiet'],
    'tie-wujiu':['riposte','sword','guard','spell','recovery','quiet'],
    'ye-shuying':['quiet','sword','spell','riposte','guard','recovery'],
    'yun-zhiwei':['spell','sword','guard','recovery','riposte','quiet'],
    'hua-jianlu':['recovery','spell','guard','sword','riposte','quiet']
  }).map(([id,order])=>[id,Object.freeze(order)])));
  const spec = Object.freeze([
    null,
    {targetRealm:1,targetSpeciesId:'golden-tiger',lifeScale:1},
    {targetRealm:2,targetSpeciesId:'blackarmor-general',lifeScale:.85},
    {targetRealm:3,targetSpeciesId:'five-phase-sovereign',lifeScale:.85},
    {targetRealm:4,targetSpeciesId:'five-phase-sovereign',lifeScale:.95}
  ]);
  function fresh() { return {version:1,xp:0,realm:0,allocation:{}}; }
  function validate(profile) {
    const integer=(n,max=1000000000)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
    if (!profile || profile.version!==1 || !integer(profile.xp) || !integer(profile.realm,4) ||
        !profile.allocation || Object.getPrototypeOf(profile.allocation)!==Object.prototype ||
        (profile.realm>0 && profile.xp<realms[profile.realm].xp)) throw Error('Invalid progression profile');
    const entries=Object.entries(profile.allocation), cap=profile.realm===0?1:profile.realm===1?2:3;
    if (entries.some(([id,n])=>!skills.some(s=>s.id===id)||!integer(n,cap)||n===0) ||
        entries.length>realms[profile.realm].slots ||
        entries.reduce((sum,[,n])=>sum+n,0)>(profile.xp>=20?realms[profile.realm].points:0)) throw Error('Invalid progression allocation');
    if (profile.killStart!==undefined && !integer(profile.killStart,1000000)) throw Error('Invalid progression killStart');
    if (profile.eligibleHand!==undefined && (!integer(profile.eligibleHand,1000000) || profile.eligibleHand<1 ||
        profile.realm===4 || profile.xp<realms[profile.realm+1].xp)) throw Error('Invalid progression eligibleHand');
    return true;
  }
  function configure(profile,allocation) {
    validate(profile);
    if (!allocation || Object.getPrototypeOf(allocation)!==Object.prototype) throw Error('Invalid progression allocation');
    const next={...profile,allocation:{...allocation}};
    validate(next); return next;
  }
  function bonuses(profile) {
    const result={damage:0,taken:0,heal:0,shield:0,basic:0,active:0,counter:0,aggro:0};
    if (!profile) return result;
    validate(profile);
    const realm=profile.realm*.01;
    result.damage=realm; result.taken=realm; result.heal=realm; result.shield=realm;
    for (const skill of skills) {
      const level=profile.allocation[skill.id]||0;
      if (level) result[skill.kind]+=skill.values[level-1];
    }
    return result;
  }
  function realmInfo(profile) { validate(profile); return realms[profile.realm]; }
  function trialSpec(targetRealm) {
    if (!Number.isInteger(targetRealm) || targetRealm<1 || targetRealm>4) throw Error('Invalid trial realm');
    return {...spec[targetRealm]};
  }
  function breakthrough(profile,targetRealm) {
    validate(profile);
    if (targetRealm!==profile.realm+1 || targetRealm>4 || profile.xp<realms[targetRealm].xp) throw Error('Progression breakthrough unavailable');
    const next={...profile,realm:targetRealm,allocation:{...profile.allocation}};
    delete next.eligibleHand;
    return {profile:next,
      reward:{realm:targetRealm,title:realms[targetRealm].title,gold:100*targetRealm,sand:5*targetRealm}};
  }
  function award(combat,pid) {
    if (!combat?.progression || combat.trial || !combat.ended || !Number.isInteger(pid) || pid<0 || pid>3) return 0;
    return combat.progression.earned?.[pid]||0;
  }
  function eligible(profile,kills,handNumber) {
    validate(profile);
    const target=profile.realm+1;
    if (target>4 || profile.xp<realms[target].xp) return false;
    const after=Array.isArray(kills)?kills.slice(profile.killStart||0):[];
    const count=tier=>after.filter(k=>k.tier===tier).length;
    const victory=target===1 ? count('elite')+count('miniboss')+count('boss')>=1 :
      target===2 ? count('miniboss')+count('boss')>=1 : count('boss')>=(target===4?2:1);
    return victory || (profile.eligibleHand!==undefined && Number.isSafeInteger(handNumber) && handNumber>=profile.eligibleHand+10);
  }
  function aiAllocation(heroId,profile) {
    validate(profile);
    if (profile.xp<20) return {};
    const priority=aiPriorities[heroId];
    if (!priority) throw Error('Unknown progression AI hero');
    const cap=profile.realm===0?1:profile.realm===1?2:3;
    let points=realms[profile.realm].points;
    const allocation={};
    for (const id of priority) {
      if (!points || Object.keys(allocation).length>=realms[profile.realm].slots) break;
      allocation[id]=Math.min(points,cap); points-=allocation[id];
    }
    return allocation;
  }
  function advanceAI(profile,kills,heroId,handNumber) {
    validate(profile);
    if (handNumber!==undefined && (!Number.isSafeInteger(handNumber) || handNumber<1 || handNumber>1000000 ||
        (profile.eligibleHand!==undefined && profile.eligibleHand>handNumber))) throw Error('Invalid progression hand number');
    const pending={...profile,allocation:{...profile.allocation}};
    if (profile.realm<4 && profile.xp>=realms[profile.realm+1].xp && pending.eligibleHand===undefined && handNumber!==undefined)
      pending.eligibleHand=handNumber;
    if (!eligible(pending,kills,handNumber)) return {profile:pending,reward:null};
    const realm=profile.realm+1;
    const next={...pending,realm,killStart:kills.length,allocation:{}};
    delete next.eligibleHand;
    if (handNumber!==undefined && realm<4 && next.xp>=realms[realm+1].xp) next.eligibleHand=handNumber;
    next.allocation=aiAllocation(heroId,next);
    return {profile:next,reward:{realm,title:realms[realm].title,gold:100*realm,sand:5*realm}};
  }
  const api=Object.freeze({fresh,validate,configure,bonuses,realmInfo,realms,skills,aiPriorities,trialSpec,breakthrough,award,eligible,aiAllocation,advanceAI});
  root.MahjongCultivationProgression=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
