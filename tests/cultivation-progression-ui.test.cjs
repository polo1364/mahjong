const {test} = require('node:test');
const assert = require('node:assert/strict');
const P = require('../cultivation-progression.js');
global.MahjongCultivationProgression = P;
global.MahjongCultivationEquipment = require('../cultivation-equipment.js');
const UI = require('../cultivation-progression-ui.js');
require('../cultivation-journey-ui.js');
const JourneyUI = global.MahjongCultivationJourneyUI;

function host() {
  const listeners = {};
  const nodes = {};
  return {
    innerHTML: '',
    querySelector(selector) {
      const token = selector.startsWith('.') ? selector.slice(1) : selector.slice(1, -1);
      if (!this.innerHTML.includes(token)) return null;
      return nodes[selector] ||= {disabled:this.innerHTML.includes(`${token} disabled`),isConnected:true,textContent:'',addEventListener(type, callback){listeners[selector + ':' + type] = callback;}};
    },
    querySelectorAll(selector) { return selector === '.progression-actions button' ? ['[data-progression-resume]','[data-progression-abandon]'].map(key => this.querySelector(key)).filter(Boolean) : []; },
    async click(selector) {
      const button = this.querySelector(selector);
      if (!button || button.disabled) return false;
      await listeners[selector + ':click']?.({currentTarget:button});
      return true;
    }
  };
}

test('home shows saved realm and only offers trial controls for a pending trial', async () => {
  const node = host(), profile = {...P.fresh(),xp:401,realm:2};
  let resumed = 0, abandoned = 0;
  UI.home(node,profile,null);
  assert.match(node.innerHTML,/金丹宗師/);
  assert.match(node.innerHTML,/401 \/ 1000 修為/);
  assert.doesNotMatch(node.innerHTML,/繼續渡劫/);
  UI.home(node,profile,{targetRealm:3},{onResume(){resumed++;},onAbandon(){abandoned++;}});
  await node.click('[data-progression-resume]');
  await node.click('[data-progression-abandon]');
  assert.equal(resumed,1); assert.equal(abandoned,1);
});

test('preparation gates trial by next threshold and reports failed start for retry', async () => {
  const node = host(), profile = {...P.fresh(),xp:100};
  let attempts = 0, locked = [];
  UI.preparation(node,{players:[{progression:profile}]},{profile,onTrial:async()=>{attempts++;throw Error('磁碟忙碌');},onBusy:value=>locked.push(value)});
  assert.match(node.innerHTML,/挑戰築基渡劫/);
  await node.click('[data-progression-trial]');
  assert.equal(attempts,1);
  assert.deepEqual(locked,[true,false]);
  assert.match(node.querySelector('.progression-error').textContent,/磁碟忙碌/);
  UI.preparation(node,{players:[{progression:P.fresh()}]},{profile:P.fresh(),onTrial(){attempts++;}});
  assert.match(node.innerHTML,/data-progression-trial disabled/);
  assert.match(node.innerHTML,/累積 20 修為/);
});

test('result distinguishes normal reward, trial and save failure; details expose safe allocation', () => {
  const node = host(), profile = P.configure({...P.fresh(),xp:401,realm:2},{sword:2,guard:1});
  UI.result(node,{ended:true,progression:{earned:[15,12,12,12]}},{profile,earned:15,error:'<失敗>',onRetry(){}});
  assert.match(node.innerHTML,/修為尚未入帳/);
  assert.doesNotMatch(node.innerHTML,/\+15 修為/);
  assert.match(node.innerHTML,/操作加成 3 點/);
  assert.match(node.innerHTML,/&lt;失敗&gt;/);
  assert.match(node.innerHTML,/重試保存/);
  UI.result(node,{}, {profile,earned:15,pending:true});
  assert.match(node.innerHTML,/正在保存修為/);
  assert.doesNotMatch(node.innerHTML,/\+15 修為/);
  UI.result(node,{}, {profile,earned:15});
  assert.match(node.innerHTML,/\+15 修為/);
  UI.result(node,{trial:{targetRealm:3}},{profile,earned:0});
  assert.match(node.innerHTML,/試煉不產出修為/);
  assert.match(UI.details({progression:profile}),/御劍訣 2 級（普攻傷害 \+6%）/);
  assert.match(UI.details({progression:profile}),/凝盾訣 1 級（護盾取得量 \+5%）/);
  assert.match(UI.details({progression:profile}),/境界常駐（與裝備相加）：傷害 \+2%、治療 \+2%、護盾 \+2%；承傷降低 2%/);
});

test('preparation folds three AI profiles and marks only current breakthroughs', () => {
  global.MahjongCultivationHeroes = {get:id=>({name:{a:'道友甲',b:'道友乙',c:'道友丙'}[id]})};
  const player = {...P.fresh(),xp:401,realm:2};
  const ai = [{...P.fresh(),xp:103,realm:1,allocation:{sword:1}},{...P.fresh(),xp:24,allocation:{quiet:1}},{...P.fresh(),xp:0}];
  const combat = {players:[{progression:player},...ai.map((progression,i)=>({heroId:['a','b','c'][i],progression}))],progression:{aiBreakthroughs:[{pid:1,realm:1,title:'築基真人',gold:100,sand:5}]}};
  const node = host(); UI.preparation(node,combat,{profile:player});
  assert.match(node.innerHTML,/<details class="progression-ai"><summary>同行道友養成 · 3 人<\/summary>/);
  assert.match(node.innerHTML,/道友甲<\/strong><span>築基 · 103 修為 · 御劍訣 1 級/);
  assert.match(node.innerHTML,/道友乙<\/strong><span>煉氣 · 24 修為 · 斂息訣 1 級/);
  assert.match(node.innerHTML,/道友丙<\/strong><span>煉氣 · 0 修為 · 未配置功法/);
  assert.equal((node.innerHTML.match(/本次突破/g)||[]).length,1);
  assert.doesNotMatch(node.innerHTML,/100 金幣/);
  combat.players[1].economy = {gold:80,sand:12,inventory:[{uid:'owned',level:3},{uid:'spare',level:9}],items:{prepared:['heal']}};
  combat.players[1].equipment = {weapon:'owned',robe:null,accessory:null};
  UI.preparation(node,combat,{profile:player});
  assert.match(node.innerHTML,/整備：裝備 1\/3 件 · 最高強化 \+3 · 備妥道具 1\/2 · 金幣 80 · 靈砂 12/);
  delete global.MahjongCultivationHeroes;
});

test('skill editor describes every effect and shows negative aggro percentage', async () => {
  let dialog;
  global.document = {activeElement:{isConnected:false},body:{append(node){dialog=node;}},createElement(){
    const nodes = {};
    return {dataset:{},firstElementChild:{innerHTML:''},setAttribute(){},addEventListener(){},showModal(){},close(){},remove(){},querySelectorAll(){return [];},querySelector(selector){return nodes[selector] ||= {focus(){},setAttribute(){},textContent:'',onclick:null};}};
  }};
  const profile = {...P.fresh(),xp:20}, node = host();
  UI.preparation(node,{players:[{progression:profile}]},{profile,onConfigure:async()=>profile});
  await node.click('[data-progression-edit]');
  const html = dialog.firstElementChild.innerHTML;
  for (const effect of ['普攻傷害 +4%','組牌、花技與終式傷害 +4%','反擊傷害 +8%','治療量 +5%','護盾取得量 +5%','新增仇恨降低 6%']) assert.ok(html.includes(effect), effect);
  UI.close(); delete global.document;
});

test('shared hero stat values include additive progression factor and role details', () => {
  const hero = {name:'測試',role:'劍修',hp:1000,stats:{damage:100,defense:100,healing:100,shield:100},passive:{name:'無',description:'測試'}};
  const profile = P.configure({...P.fresh(),xp:100,realm:1},{sword:2});
  const player = {hp:1000,maxHp:1000,economy:{inventory:[]},equipment:{},progression:profile};
  assert.equal(JourneyUI.statValues(hero,player).damage,101);
  assert.equal(global.MahjongCultivationEquipment.factor(player,'damage',{basic:true}),1.07);
  const html = JourneyUI.heroDetails(hero,player);
  assert.match(html,/含裝備、境界、功法與奇遇常駐加成/);
  assert.match(html,/築基真人/);
  assert.match(html,/御劍訣/);
});

test('AI summary explains the remaining normal hands before guaranteed breakthrough',()=>{
  const profile={...P.fresh(),xp:100,eligibleHand:10};
  const node=host();
  UI.preparation(node,{handNumber:15,players:[{progression:P.fresh()},{progression:profile}]},{profile:P.fresh()});
  assert.match(node.innerHTML,/最多再 5 局保底突破；戰績達標可提早/);
});
