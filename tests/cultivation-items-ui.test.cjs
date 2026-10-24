const {test}=require('node:test'),A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../cultivation-combat.js'),I=require('../cultivation-items.js'),M=require('../cultivation-monsters.js'),E=require('../cultivation-equipment.js'),H=require('../cultivation-heroes.js');
const scope={MahjongCultivationItems:I,MahjongCultivationMonsters:M,MahjongCultivationEquipment:E,MahjongCultivationHeroes:H,MahjongCultivationEconomy:require('../cultivation-economy.js')};
vm.runInNewContext(fs.readFileSync(require.resolve('../cultivation-items-ui.js'),'utf8'),scope);
const U=scope.MahjongCultivationItemsUI;
test('17 raster images exist and every item has recipe/source lookup; no placeholders',()=>{
 const s=C.create(3,null,{heroId:'shen-gufeng',equipment:true}),html=U.inventory(s.players[0]);
 for(const i of I.all){A.ok(fs.existsSync(i.image));A.match(html,new RegExp(i.name));}
 A.equal((html.match(/<article/g)||[]).length,17);A.equal((html.match(/<summary>取得來源/g)||[]).length,17);A.doesNotMatch(html,/圖片待樣稿確認|<svg/);A.match(html,/五相劫尊/);A.match(html,/50%.*10%/);
});
test('four actors see independent per-kill resources and drops; carried item details distinguish spent',()=>{
 const s=C.create(4,null,{heroId:'shen-gufeng',equipment:true}),N=scope.MahjongCultivationEconomy;
 N.creditKill(s,{...s.monster,speciesId:'five-phase-sovereign',tier:'boss'},0);
 for(let pid=0;pid<4;pid++){const html=U.loot(s,pid);A.match(html,/五相劫尊/);A.match(html,/劫晶碎片 ×1/);A.match(html,new RegExp('金幣 \\+'+(pid===0?220:200)));}
 const p=s.players[0];p.economy.items.carried=[{id:'heal',used:false},{id:'edge',used:true}];A.match(U.carried(p),/回春丹 · 待觸發/);A.match(U.carried(p),/銳芒符 · 已使用/);
});
