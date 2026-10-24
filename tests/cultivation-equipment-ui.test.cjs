const {test}=require('node:test');
const assert=require('node:assert/strict');
const Combat=require('../cultivation-combat.js');
global.MahjongCultivationEquipment=require('../cultivation-equipment.js');
global.MahjongCultivationEconomy=require('../cultivation-economy.js');
const UI=require('../cultivation-equipment-ui.js');
function prepared() {const c=Combat.create(71,null,{heroId:'shen-gufeng',equipment:true});return {cultivation:Combat.prepare(Combat.apply(c,{type:'finish',reason:'draw',id:1}).state)};}
test('transaction publishes only after save resolves true and blocks other commands',async()=>{
  let state=prepared(),resolveSave,saved,changed=0;const before=JSON.stringify(state);
  const session=UI.transactionSession({getState:()=>state,save(next){saved=next;return new Promise(resolve=>resolveSave=resolve);},publish(next){state=next;},onChange(){changed++;}});
  const command={commandId:'purchase',pid:0,type:'buy',stockId:state.cultivation.players[0].economy.shop.stock[0].id};
  const operation=session.run(command);
  assert.equal(session.busy,true);assert.equal(session.pending,true);assert.equal(JSON.stringify(state),before);
  assert.equal((await session.run({...command,commandId:'other'})).code,'busy');
  assert.equal(saved.cultivation.players[0].economy.inventory.length,1);resolveSave(true);
  assert.equal((await operation).ok,true);assert.equal(session.pending,false);assert.equal(state,saved);assert.equal(changed,2);
});
test('false/throw saves retain original state and retry exactly the same candidate and command',async()=>{
  let state=prepared(),attempts=0;const original=state,candidates=[];
  const session=UI.transactionSession({getState:()=>state,async save(next){candidates.push(next);if(++attempts===1)return false;if(attempts===2)throw Error('disk full');return true;},publish(next){state=next;}});
  const command={commandId:'same-id',pid:0,type:'buy',stockId:state.cultivation.players[0].economy.shop.stock[0].id};
  assert.equal((await session.run(command)).code,'save-failed');assert.equal(state,original);assert.deepEqual(session.command,command);assert.equal(session.pending,true);
  assert.equal((await session.retry()).code,'save-failed');assert.equal(state,original);
  assert.equal((await session.retry()).ok,true);assert.equal(candidates[0],candidates[1]);assert.equal(candidates[1],candidates[2]);
  assert.equal(state.cultivation.players[0].economy.inventory.length,1);assert.equal(state.cultivation.players[0].economy.receipts.length,1);
  assert.equal(global.MahjongCultivationEconomy.transact(state.cultivation,command).result.duplicate,true);
});
test('failed forge is committed, including full payment and level loss',async()=>{
  let state=prepared();const p=state.cultivation.players[0];p.economy.gold=1000;p.economy.sand=100;p.economy.serial=1;p.economy.inventory=[{uid:'p0-1',catId:'chi-xiao-sword',grade:3,level:7,locked:false}];p.economy.rng.forge=0x12345678;
  Combat.validate(state.cultivation);
  let saves=0;const session=UI.transactionSession({getState:()=>state,async save(){saves++;return true;},publish(next){state=next;}});
  const result=await session.run({commandId:'forge-failure',pid:0,type:'forge',uid:'p0-1'});
  assert.equal(result.ok,true);assert.equal(result.success,false);assert.equal(result.after,6);assert.equal(saves,1);
  assert.equal(state.cultivation.players[0].economy.gold,925);assert.equal(state.cultivation.players[0].economy.sand,95);
});
test('rejected transactions never invoke save; changed source cannot publish stale state',async()=>{
  let state=prepared(),saves=0;const session=UI.transactionSession({getState:()=>state,async save(){saves++;state=prepared();return true;},publish(){assert.fail('stale publish');}});
  assert.equal((await session.run({commandId:'missing',pid:0,type:'equip',uid:'absent'})).ok,false);assert.equal(saves,0);
  const result=await session.run({commandId:'stale',pid:0,type:'material'});assert.equal(result.code,'save-failed');assert.equal(saves,1);
});
test('role and loot descriptions expose equipment, set effects, passive quotas and escaped values',()=>{
  const state=prepared(),p=state.cultivation.players[0];p.economy.serial=3;p.economy.inventory=['weapon','armor','accessory'].map((slot,i)=>({uid:`p0-${i+1}`,catId:`set-zhenyue-${slot}`,grade:4,level:0,locked:false}));p.equipment={weapon:'p0-1',armor:'p0-2',accessory:'p0-3'};p.equipmentState.zhenyueUses=1;
  const html=UI.roleInfo(p);assert.match(html,/鎮岳重戟/);assert.match(html,/剩餘 2\/3/);assert.match(html,/護盾\+2%/);
  p.economy.handLoot={gold:30,sand:6,items:['p0-1'],seals:{zhenyue:1}};assert.match(UI.loot(p),/金幣 30/);assert.match(UI.loot(p),/鎮岳玄甲王印 1/);
});

// Minimal DOM surface exercises the real button handlers without a browser engine.
function hostFixture() {
  let html='',nodes=[];
  return {set innerHTML(value){html=value;nodes=[];for(const match of value.matchAll(/<(button|select)\b([^>]*)>([\s\S]*?)<\/\1>/g)){
    const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(m=>[m[1],m[2]??'']));
    const node={id:attrs.id,dataset:{},value:match[3].match(/<option value="([^"]*)"/)?.[1],focus(){},disabled:'disabled'in attrs};
    for(const [key,value]of Object.entries(attrs))if(key.startsWith('data-'))node.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
    nodes.push(node);
  }},get innerHTML(){return html;},querySelectorAll(selector){const key=selector.match(/^\[data-([\w-]+)\]$/)?.[1];return key?nodes.filter(n=>key in n.dataset):[];},querySelector(selector){return nodes.find(n=>n.id===selector.slice(1))||null;}};
}
test('HTML transfer confirmation shows both before/after values; Cancel does not save and Confirm commits once',async()=>{
  let state=prepared(),saves=0,locked=false;const p=state.cultivation.players[0];p.economy.gold=1000;p.economy.sand=100;p.economy.serial=2;p.economy.inventory=[{uid:'p0-1',catId:'chi-xiao-sword',grade:3,level:7,locked:false},{uid:'p0-2',catId:'xuanfu-staff',grade:2,level:1,locked:false}];
  const host=hostFixture();UI.mount(host,state,{getState:()=>state,async save(){saves++;return true;},publish(next){state=next;},onLock(value){locked=value;}});
  host.querySelectorAll('[data-tab]').find(n=>n.dataset.tab==='forge').onclick();
  host.querySelectorAll('[data-action]').find(n=>n.dataset.action==='transfer').onclick();
  assert.match(host.innerHTML,/role="alertdialog"/);assert.match(host.innerHTML,/來源：赤霄劍 · 玄品 \+7 → <b>\+0/);assert.match(host.innerHTML,/目標：玄符杖 · 靈品 \+1 → <b>\+7/);assert.match(host.innerHTML,/30 金幣、2 靈砂/);assert.equal(locked,true);assert.equal(saves,0);
  host.querySelector('#equipConfirmCancel').onclick();assert.equal(locked,false);assert.equal(saves,0);
  host.querySelectorAll('[data-action]').find(n=>n.dataset.action==='transfer').onclick();await host.querySelector('#equipConfirmAccept').onclick();
  assert.equal(saves,1);assert.equal(state.cultivation.players[0].economy.inventory[0].level,0);assert.equal(state.cultivation.players[0].economy.inventory[1].level,7);assert.equal(locked,false);
});
test('HTML dismantle confirmation supports Escape cancellation and requires explicit confirmation before saving',async()=>{
  let state=prepared(),saves=0;const p=state.cultivation.players[0];p.economy.serial=1;p.economy.inventory=[{uid:'p0-1',catId:'set-zhenyue-weapon',grade:4,level:3,locked:false}];
  const host=hostFixture();UI.mount(host,state,{getState:()=>state,async save(){saves++;return true;},publish(next){state=next;}});
  host.querySelectorAll('[data-select]').find(n=>n.dataset.select==='p0-1').onclick();
  host.querySelectorAll('[data-action]').find(n=>n.dataset.action==='dismantle').onclick();assert.match(host.innerHTML,/永久失去此裝備/);assert.match(host.innerHTML,/4 靈砂/);assert.equal(saves,0);
  host.onkeydown({key:'Escape',preventDefault(){}});assert.equal(host.querySelector('#equipConfirmAccept'),null);assert.equal(saves,0);
  host.querySelectorAll('[data-action]').find(n=>n.dataset.action==='dismantle').onclick();await host.querySelector('#equipConfirmAccept').onclick();assert.equal(saves,1);assert.equal(state.cultivation.players[0].economy.inventory.length,0);
});
test('confirmed HTML transfer with failed save stays locked and retries the original candidate without another confirmation',async()=>{
  let state=prepared(),locked=false;const p=state.cultivation.players[0],candidates=[];p.economy.gold=1000;p.economy.sand=100;p.economy.serial=2;p.economy.inventory=[{uid:'p0-1',catId:'chi-xiao-sword',grade:3,level:7,locked:false},{uid:'p0-2',catId:'xuanfu-staff',grade:2,level:1,locked:false}];
  const original=state,host=hostFixture();UI.mount(host,state,{getState:()=>state,async save(next){candidates.push(next);return candidates.length>1;},publish(next){state=next;},onLock(value){locked=value;}});
  host.querySelectorAll('[data-tab]').find(n=>n.dataset.tab==='forge').onclick();host.querySelectorAll('[data-action]').find(n=>n.dataset.action==='transfer').onclick();await host.querySelector('#equipConfirmAccept').onclick();
  assert.equal(state,original);assert.equal(locked,true);assert.equal(host.querySelector('#equipConfirmCancel'),null);assert.match(host.innerHTML,/交易尚未套用/);
  await host.querySelector('#equipRetry').onclick();assert.equal(candidates[0],candidates[1]);assert.equal(locked,false);assert.equal(state.cultivation.players[0].economy.inventory[1].level,7);assert.equal(state.cultivation.players[0].economy.receipts.length,1);
});

 test('item-assisted forge save failure and retry preserves exact candidate and consumes only once',async()=>{
 let state=prepared();const p=state.cultivation.players[0];p.economy.gold=1000;p.economy.sand=100;p.economy.serial=1;p.economy.inventory=[{uid:'p0-1',catId:'chi-xiao-sword',grade:1,level:7,locked:false}];p.economy.rng.forge=0x12345678;p.economy.items.counts={'weapon-stone':1,preserve:1};
 let saves=0;const candidates=[],original=state,session=UI.transactionSession({getState:()=>state,async save(next){candidates.push(next);return ++saves>1;},publish(next){state=next;}});
 assert.equal((await session.run({commandId:'item-forge',pid:0,type:'forge',uid:'p0-1',stone:true,charm:'preserve'})).code,'save-failed');assert.equal(state,original);assert.equal(state.cultivation.players[0].economy.items.counts.preserve,1);
 assert.equal((await session.retry()).ok,true);assert.equal(candidates[0],candidates[1]);assert.equal(state.cultivation.players[0].economy.gold,925);assert.equal(state.cultivation.players[0].economy.sand,97);assert.equal(state.cultivation.players[0].economy.inventory[0].level,7);assert.equal(state.cultivation.players[0].economy.items.counts.preserve,0);assert.equal(state.cultivation.players[0].economy.items.counts['weapon-stone'],0);assert.equal(state.cultivation.players[0].economy.receipts.length,1);
 });
