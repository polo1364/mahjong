const {test}=require('node:test');
const A=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const M=require('../cultivation-monsters.js'),K=require('../cultivation-monster-skills.js');
const E=require('../cultivation-equipment.js'),N=require('../cultivation-economy.js'),C=require('../cultivation-combat.js');
const regional=M.all.filter(m=>m.region);
test('15 regional species preserve all prototype combat values and original catalog',()=>{
 A.equal(regional.length,15);A.equal(M.all.length,34);A.equal(new Set(M.all.map(m=>m.id)).size,34);
 for(const region of ['metal','wood','water','fire','earth'])A.deepEqual(regional.filter(m=>m.region===region).map(m=>m.tier),['small','elite','miniboss']);
 for(const m of regional){const source=M.get(m.archetype);for(const key of ['hp','legacyHp','single','all','armor','shield','behavior','tier'])A.equal(m[key],source[key],m.id+':'+key);A.equal(m.element,m.region);A.ok(Object.isFrozen(m));}
});
test('regional skills preserve prototype effects, media and 16-action cadence',()=>{
 A.equal(K.all.length,65);
 for(const m of regional){const source=M.get(m.archetype);A.equal(m.skillIds.length,source.skillIds.length);
  for(let i=0;i<m.skillIds.length;i++){const skill=K.get(m.skillIds[i]),original=K.get(source.skillIds[i]);
   A.equal(skill.element,m.element);A.equal(skill.archetype,original.id);
   for(const key of ['damage','type','hits','charged','heal','shield','strip','riposte','ailment','motion','audio'])A.deepEqual(skill[key],original[key],m.id+':'+key);
   A.ok(fs.existsSync(path.resolve(__dirname,'..',skill.audio)),skill.audio);
  }
  for(let n=1;n<=16;n++){const actual=K.select(m,n,m.element),original=K.select(source,n,source.element);A.equal(actual?.archetype,original?.id,m.id+' action '+n);}
 }
});
test('regional minibosses preserve prototype seals, gear pool and team loot; advanced adds exactly one shard',()=>{
 for(const m of regional.filter(m=>m.tier==='miniboss'))for(let seed=1;seed<=12;seed++){
  const s=C.create(seed,null,{heroId:'yun-zhiwei',equipment:true}),base=JSON.parse(JSON.stringify(s)),advanced=JSON.parse(JSON.stringify(s));
  const monster={id:100,speciesId:m.id,tier:m.tier};N.creditKill(base,monster,0);N.creditKill(advanced,{...monster,advanced:true},0);
  const set=E.sets.find(x=>x.source===m.archetype);A.ok(set);
  for(let pid=0;pid<4;pid++){const p=base.players[pid].economy,q=advanced.players[pid].economy;
   A.equal(p.seals[set.id],1);A.equal(p.handLoot.seals[set.id],1);A.equal(p.items.handLoot[0].resources.seal,set.id);
   A.equal((q.items.counts.shard||0)-(p.items.counts.shard||0),1);A.equal(q.items.rng,p.items.rng);A.deepEqual(q.inventory,p.inventory);
   A.ok(p.inventory.every(i=>!E.get(i.catId).setId||E.get(i.catId).setId===set.id));
  }
  const after=JSON.stringify(advanced);N.creditKill(advanced,{...monster,advanced:true},0);A.equal(JSON.stringify(advanced),after);
 }
});
test('all regional portraits and WebP derivatives exist',()=>{
 for(const m of regional){for(const ext of ['png','webp'])A.ok(fs.existsSync(path.resolve(__dirname,'..',m.image.replace(/png$/,ext))),m.id+'.'+ext);A.ok(fs.existsSync(path.resolve(__dirname,'..',m.thumbnail)),m.thumbnail);}
});
