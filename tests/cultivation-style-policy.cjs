// Test-only policies: all decisions use the acting player's hand and public combat state.
function installStylePolicy(rotation) {
  const styles=['burst','sustain','counter','stealth'];
  const styleOf=pid=>styles[(pid+rotation)%styles.length];
  const traits=skill=>{
    const effects=skill.effects.flatMap(e=>[e,...(e.onKill||[])]);
    return {
      burst:effects.some(e=>['damage','dot','mark','convert'].includes(e.op)||['nextDamage','nextFlatDamage','nextFollowup','rampDamage','nextPenetration','execute'].includes(e.kind)),
      sustain:effects.some(e=>['heal','shield','cleanse'].includes(e.op)||e.lifeSteal||['guard','reduceDamage','hot','deathGuard','healToShield'].includes(e.kind)),
      counter:effects.some(e=>['counter','shieldCounter','shieldBreakDamage','guardCounter','shieldAbsorbCounter','absorbedToNext','takenToNext'].includes(e.kind)),
      stealth:effects.some(e=>(e.op==='aggro'&&e.mode==='reduce')||['aggroRate','dotAggroRate','noExtraAggro'].includes(e.kind))
    };
  };
  const catalog=window.MahjongCultivationSkills.all;
  const preferred=Object.fromEntries(styles.map(style=>[style,catalog.filter(s=>['chow','pong'].includes(s.action)&&traits(s)[style])]));
  const potential=(hand,style)=>{
    const counts={};for(const tile of hand){const key=tileKey(tile);counts[key]=(counts[key]||0)+1;}
    let value=0;
    for(const skill of preferred[style]){
      const keys=skill.family==='honor'?Array(3).fill(skill.combo):[...skill.combo].map(n=>skill.family+n);
      const need={};keys.forEach(k=>need[k]=(need[k]||0)+1);
      const held=Object.entries(need).reduce((n,[k,c])=>n+Math.min(c,counts[k]||0),0);
      if(held>=2)value+=held===3?2:1;
    }
    return Math.min(4,value);
  };
  const ordinaryValue=cultivationSkillValue;
  cultivationSkillValue=(pid,action,keys)=>{
    const value=ordinaryValue(pid,action,keys),skill=window.MahjongCultivationSkills.find(action,keys);
    return skill&&value>0?value*(traits(skill)[styleOf(pid)]?2.2:.75):value;
  };
  const ordinaryDiscard=aiChooseDiscard;
  aiChooseDiscard=pid=>{
    if(!S.cultivation)return ordinaryDiscard(pid);
    const pl=S.players[pid],style=styleOf(pid);
    return aiDiscardPlan(pl.hand,pl.melds,aiPublicInfo(pid),tile=>canDiscardTile(pid,tile),tile=>
      50*window.MahjongCultivationCombat.elementMultiplier(window.MahjongCultivationSkills.elementFor(tileKey(tile)),S.cultivation.monster.element)
      +30*potential(pl.hand.filter(t=>t!==tile),style))?.tile;
  };
  window.cultivationTestStyles={styles:styles.map((_,pid)=>styleOf(pid)),traits};
}
module.exports={installStylePolicy};
