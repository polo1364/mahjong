/* Legal Mahjong VM diagnostic; initial BOSS and equipment loadout are controlled fixtures. */
const {game,source}=require('./game-harness.cjs'),H=require('../cultivation-heroes.js');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const count=Number(process.argv[2]||80),started=Date.now(),results=[];
const builds=[{build:'none',level:0},...['ordinary','zhenyue','jiuyou','chixiao','wuxiang'].flatMap(build=>[0,6,10].map(level=>({build,level})))];
const files=['cultivation-equipment.js','cultivation-economy.js','cultivation-combat.js'];
const scripts=Object.fromEntries(files.map(f=>[f,fs.readFileSync(path.join(__dirname,'..',f),'utf8')]));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
for(let i=0;i<count;i++){
  const seed=60001+i,heroId=H.all[i%10].id,{build,level}=builds[i%builds.length],{run,timers}=game(seed,{cultivation:true,heroId});
  for(const file of files)run(scripts[file]);
  run(`stepAI=eval('('+stepAI.toString().replace(' || S.turn === 0','')+')');
    startNewHand(true,null,{heroId:${JSON.stringify(heroId)}});
    {const c=window.MahjongCultivationCombat.create(${seed},null,{heroId:${JSON.stringify(heroId)},equipment:true}),m=window.MahjongCultivationMonsters.get('five-phase-sovereign');
    Object.assign(c.monster,{speciesId:m.id,tier:m.tier,name:m.name,element:m.element,hp:m.hp,maxHp:m.hp,shield:m.shield,armor:m.armor,attacks:0,heals:0,shields:0,statuses:[]});
    c.monster.nextAttack={type:'single',charged:false,damage:m.single,ailment:null,cancelled:false,controlUsed:false,sealAilment:false};
    c.journey.nextTier='boss';c.journey.minibossKills=3;
    const p=c.players[0],build=${JSON.stringify(build)},level=${level};
    const ids=build==='none'?[]:build==='ordinary'?['chi-xiao-sword','liuyun-robe','chiyao-pendant']:['weapon','armor','accessory'].map(slot=>'set-'+build+'-'+slot);
    for(const catId of ids){const item={uid:'p0-'+(++p.economy.serial),catId,grade:build==='ordinary'||build==='wuxiang'?5:4,level,locked:false};p.economy.inventory.push(item);p.equipment[window.MahjongCultivationEquipment.get(catId).slot]=item.uid;}
    S.cultivation=c;for(let pid=0;pid<4;pid++)for(const tile of S.players[pid].flowers)cultivationEvent({type:'flower',pid,key:tileKey(tile)});}`);
  let steps=0;
  for(;steps<600&&run(`S.phase!=='end'`);steps++){
    run('cancelGameTimers();if(S.waitReact)handleAIReaction(S.waitReact);else stepAI();');
    if(run(`S.phase!=='end'`)){const next=timers.entries().next().value;if(next){timers.delete(next[0]);next[1]();}}
    if(steps%10===0)assert.equal(run(`{const all=[...S.wall,...S.deadWall,...S.players.flatMap(p=>[...p.hand,...p.flowers,...p.discards,...p.melds.flatMap(m=>m.tiles)])];if(S.lastDiscard&&!all.some(t=>t.id===S.lastDiscard.tile.id))all.push(S.lastDiscard.tile);all.length===144&&new Set(all.map(t=>t.id)).size===144&&window.MahjongCultivationCombat.validate(S.cultivation);}`),true,'tile/state invariant seed '+seed);
  }
  assert.ok(steps<600,'stalled '+seed);
  results.push({seed,heroId,build,level,steps,...JSON.parse(run(`JSON.stringify({reason:S.cultivation.result.reason,bossKilled:S.cultivation.kills.some(k=>k.tier==='boss'),bossHp:S.cultivation.monster.speciesId==='five-phase-sovereign'?S.cultivation.monster.hp:0,players:S.cultivation.players.map(p=>({heroId:p.heroId,damage:p.damage,hp:p.hp,weak:p.weakCount,gold:p.economy.gold,sand:p.economy.sand}))})`))});
  if((i+1)%10===0)console.log(`${i+1}/${count} ${Date.now()-started}ms`);
}
for(const file of files)assert.equal(hash(fs.readFileSync(path.join(__dirname,'..',file),'utf8')),hash(scripts[file]),'source changed '+file);
const report={scope:'VM actual legal Mahjong AI actions, 144 unique tile invariants; controlled initial full-HP BOSS and player0 loadout. 80 total hands rotates 16 build/level variants (5 each); no browser, human or device claim.',sourceHashes:{indexInline:hash(source),...Object.fromEntries(files.map(f=>[f,hash(scripts[f])]))},count,bossKilled:results.filter(r=>r.bossKilled).length,elapsedMs:Date.now()-started,results};
fs.writeFileSync(path.join(__dirname,'..','artifacts','equipment-v3-legal-boss.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({count:report.count,bossKilled:report.bossKilled,elapsedMs:report.elapsedMs}));
