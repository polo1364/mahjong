/* Equipment screens only publish a transaction after its save commits. */
(function (root) {
  'use strict';
  const imageURL = root.MahjongImageURL || (value => value);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slotNames = {weapon:'武器',armor:'防具',accessory:'飾品'};
  const errors = {'locked':'裝備已鎖定。','equipped':'請先卸下裝備。','insufficient-funds':'金幣或靈砂不足。','insufficient-seals':'王印不足。','sold':'此商品已售出。','material-limit':'本次整備的靈砂已售完。','maximum-level':'已達強化上限。','invalid-transfer':'請選擇同部位、強化較低的目標。','preparation-required':'只能在整備庭院操作。','confirmation-required':'此操作需要確認。','unknown-item':'裝備不存在。','insufficient-items':'所需道具或合成材料不足。','invalid-preparation':'最多準備兩種不同且持有的道具。','invalid-forge-item':'此強化等級不能使用所選道具。'};
  let serial = 0;
  function transactionSession(options) {
    let busy = false, pending = null;
    const changed = () => options.onChange?.();
    async function persist() {
      if (busy || !pending) return {ok:false,code:'busy'};
      busy = true; changed();
      try {
        if (options.getState() !== pending.source) throw new Error('目前旅程已改變，請重新開啟庭院。');
        const saved = await options.save(pending.next);
        if (saved !== true) throw new Error('儲存未完成');
        if (options.getState() !== pending.source) throw new Error('目前旅程已改變，未套用交易。');
        const result = pending.result;
        options.publish(pending.next); pending = null;
        return result;
      } catch (error) { return {ok:false,code:'save-failed',message:error.message}; }
      finally { busy = false; changed(); }
    }
    return Object.freeze({
      get busy() { return busy; }, get pending() { return !!pending; },
      get command() { return pending?.command; },
      async run(command) {
        if (busy || pending) return {ok:false,code:'busy'};
        const source = options.getState();
        const response = root.MahjongCultivationEconomy.transact(source.cultivation, command);
        if (!response.result.ok) return response.result;
        pending = {source,next:{...source,cultivation:response.state},command:{...command},result:response.result};
        return persist();
      }, retry: persist
    });
  }
  function label(item) {
    if (!item) return '空欄';
    const E = root.MahjongCultivationEquipment, cat = E.get(item.catId);
    return `${cat.name} · ${E.grades[item.grade-1]}品 +${item.level}`;
  }
  function baseText(item) {
    const E = root.MahjongCultivationEquipment, cat = E.get(item.catId), value = +(E.base[item.grade-1]+item.level*.2).toFixed(1);
    return `${cat.slot==='weapon'?'所有傷害':cat.slot==='armor'?'承受傷害降低':'治療與護盾'} ${value}%`;
  }
  function abilityText(cat) {
    return ['counter','aggro'].includes(cat.ability) ? `${cat.description} ${Math.round(cat.value*100)}%` : cat.description;
  }
  function card(item, extra = '') {
    const E = root.MahjongCultivationEquipment, cat = E.get(item.catId);
    return `<article class="equip-card grade-${item.grade}"><img src="${esc(imageURL(cat.image))}" alt="" width="128" height="128"><div><strong>${esc(cat.name)}</strong><span class="equip-grade">${E.grades[item.grade-1]}品 · ${slotNames[cat.slot]} · +${item.level}${item.locked?' · 已鎖定':''}</span><p>${esc(baseText(item))}</p><small>${esc(abilityText(cat))}</small>${cat.setId?`<small class="equip-set-name">${esc(E.sets.find(s=>s.id===cat.setId).name)}</small>`:''}${extra}</div></article>`;
  }
  function setsMarkup(player) {
    const E = root.MahjongCultivationEquipment, counts = E.bonuses(player).sets;
    return `<div class="equip-sets">${E.sets.map(set=>`<details${counts[set.id]?' open':''}><summary><img src="assets/cultivation-equipment/sets/${set.id}.webp" alt="" width="42" height="42">${esc(set.name)} <b>${counts[set.id]||0}/3</b></summary><img class="equip-set-showcase" src="assets/cultivation-equipment/sets/${set.id}.webp" alt="${esc(set.name)}套裝全景" width="480" height="320"><p>${esc(set.description)}</p><small>以不同部位計件；3件同時保留2件效果。</small></details>`).join('')}</div>`;
  }
  function roleInfo(player) {
    if (!player.economy) return '';
    const E = root.MahjongCultivationEquipment, state = player.equipmentState || {}, b = E.bonuses(player);
    const counters = [];
    if (b.healStore || b.shieldStore) counters.push(`儲傷 ${+(state.stored||0).toFixed(1)}/10 · 本局產生 ${+(state.generated||0).toFixed(1)}/20`);
    if (b.discardHeal) counters.push(`回春衣剩餘 ${Math.max(0,5-(state.discardHeals||0))}/5 次`);
    if (b.discardShield) counters.push(`玄玉衣剩餘 ${Math.max(0,5-(state.discardShields||0))}/5 次`);
    for (const id of ['zhenyue','jiuyou']) if (b.sets[id]===3) counters.push(`${E.sets.find(s=>s.id===id).name}：計量 ${+(state[id+'Meter']||0).toFixed(1)} · 剩餘 ${3-(state[id+'Uses']||0)}/3 次`);
    if (b.sets.chixiao===3) counters.push(`三疊劍意 ${state.chixiaoCount||0}/3 · 剩餘 ${2-(state.chixiaoUses||0)}/2 次`);
    if (b.sets.wuxiang===3) counters.push(`五行輪轉 ${state.wuxiangCount||0}/3 · 剩餘 ${2-(state.wuxiangUses||0)}/2 次`);
    return `<section class="equip-role-info"><h3>行囊配裝</h3>${E.slots.map(slot=>`<p>${slotNames[slot]}：${esc(label(E.equipped(player).find(i=>E.get(i.catId).slot===slot)))}</p>`).join('')}${E.equipped(player).map(i=>`<p class="journey-muted">${esc(baseText(i))} · ${esc(abilityText(E.get(i.catId)))}</p>`).join('')}${counters.map(text=>`<p>${esc(text)}</p>`).join('')}${setsMarkup(player)}${root.MahjongCultivationItemsUI?.carried(player)||''}</section>`;
  }
  function loot(player) {
    const value = player.economy?.handLoot;
    if (!value) return '';
    return `<div class="equip-loot">本局獲得：金幣 ${value.gold} · 靈砂 ${value.sand}${Object.entries(value.seals).filter(([,n])=>n).map(([id,n])=>` · ${esc(root.MahjongCultivationEquipment.sets.find(s=>s.id===id)?.name||id)}王印 ${n}`).join('')}<span>${value.items.length?value.items.map(uid=>esc(label(player.economy.inventory.find(i=>i.uid===uid)))).join('、'):'未獲得裝備'}</span></div>`;
  }
  function mount(host, initial, callbacks) {
    const E = root.MahjongCultivationEquipment, M = root.MahjongCultivationEconomy, U=root.MahjongCultivationItemsUI;
    let itemFilter='all',lootPid=0,forgeOptions={stone:false,charm:'none'},focusKey=null;
    let state = initial, tab = initial.cultivation.players[0].economy.items?.tab||'inventory', selected = null, note = '', navigating = false, confirmation = null, filters = {slot:'',grade:'',set:'',level:''};
    const session = transactionSession({getState:()=>callbacks.getState?.()||state,save:callbacks.save,publish(next){state=next;callbacks.publish(next);},onChange(){render();}});
    const player = () => state.cultivation.players[0];
    function command(type, args={}) { return {commandId:`ui-${Date.now().toString(36)}-${++serial}`,pid:0,type,...args}; }
    async function act(type,args={}) {
      note=''; const request=command(type,args);if(type==='forge'||type==='transfer')forgeOptions={stone:false,charm:'none'};const result=await session.run(request); showResult(result);
    }
    function showResult(result) {
      note = result.code==='save-failed' ? `儲存失敗：${result.message}。交易尚未套用；請重試原交易。` : !result.ok ? errors[result.code]||`操作未完成（${result.code}）。` : result.target ? `強化${result.success?'成功':'失敗'}：+${result.before} → +${result.after}；已扣 ${result.gold} 金幣、${result.sand} 靈砂並保存。` : '交易已保存。';
      render();
    }
    function inventoryMarkup() {
      const p=player(), inventory=p.economy.inventory, item=inventory.find(i=>i.uid===selected), cat=item&&E.get(item.catId), worn=cat&&inventory.find(i=>i.uid===p.equipment[cat.slot]);
      const visible=inventory.filter(i=>(!filters.slot||E.get(i.catId).slot===filters.slot)&&(!filters.grade||i.grade===Number(filters.grade))&&(!filters.set||(filters.set==='ordinary'?!E.get(i.catId).setId:E.get(i.catId).setId===filters.set))&&(!filters.level||(filters.level==='zero'?i.level===0:i.level>0)));
      return `<div class="equip-worn">${E.slots.map(slot=>{const gear=inventory.find(i=>i.uid===p.equipment[slot]);return `<button type="button" data-select="${esc(gear?.uid||'')}"${gear?'':' disabled'}><img src="${imageURL(gear?E.get(gear.catId).image:`assets/cultivation-journey/slots/${slot}.png`)}" alt="" width="74" height="74"><span>${slotNames[slot]}</span><strong>${esc(label(gear))}</strong></button>`;}).join('')}</div><div class="equip-filters"><label>部位<select data-filter="slot"><option value="">全部</option>${E.slots.map(s=>`<option value="${s}"${filters.slot===s?' selected':''}>${slotNames[s]}</option>`).join('')}</select></label><label>品階<select data-filter="grade"><option value="">全部</option>${E.grades.map((g,i)=>`<option value="${i+1}"${filters.grade==i+1?' selected':''}>${g}品</option>`).join('')}</select></label><label>套裝<select data-filter="set"><option value="">全部</option>${[{id:'ordinary',name:'普通裝備'},...E.sets].map(s=>`<option value="${s.id}"${filters.set===s.id?' selected':''}>${s.name}</option>`).join('')}</select></label><label>強化<select data-filter="level"><option value="">全部</option><option value="zero"${filters.level==='zero'?' selected':''}>+0</option><option value="upgraded"${filters.level==='upgraded'?' selected':''}>已強化</option></select></label></div><div class="equip-inventory-layout"><div class="equip-item-list" aria-label="背包裝備">${visible.length?visible.map(i=>`<button type="button" class="equip-item${i.uid===selected?' is-selected':''}" data-select="${esc(i.uid)}" aria-pressed="${i.uid===selected}">${card(i,`<small>${Object.values(p.equipment).includes(i.uid)?'已穿戴':'背包'}</small>`)}</button>`).join(''):'<p class="equip-empty">沒有符合條件的裝備。擊敗妖獸，或向商人購買。</p>'}</div><section class="equip-comparison">${item?`<h3>選擇裝備</h3>${card(item)}<h3>目前穿戴 · ${slotNames[cat.slot]}</h3>${worn?card(worn):'<p>空欄</p>'}<p class="equip-delta">部位基礎 ${worn?((E.base[item.grade-1]+item.level*.2)-(E.base[worn.grade-1]+worn.level*.2)).toFixed(1):+(E.base[item.grade-1]+item.level*.2).toFixed(1)} 百分點；特色與套裝條件請一併比較。</p><div class="equip-actions">${p.equipment[cat.slot]===item.uid?`<button data-action="unequip" data-slot="${cat.slot}">卸下</button>`:`<button data-action="equip" data-uid="${esc(item.uid)}">穿戴</button>`}<button data-action="lock" data-uid="${esc(item.uid)}">${item.locked?'解除鎖定':'鎖定'}</button><button data-action="dismantle" data-uid="${esc(item.uid)}"${item.locked||worn?.uid===item.uid?' disabled':''}>分解 · 靈砂 +${item.grade}</button></div>`:'<p class="equip-empty">選一件裝備，與目前穿戴比較。</p>'}${item?'<h3>換裝後套裝</h3>':''}${setsMarkup(item?{...p,equipment:{...p.equipment,[cat.slot]:item.uid}}:p)}</section></div>`;
    }
    function shopMarkup() {
      const shop=player().economy.shop;
      return `<div class="equip-npc-intro"><img src="assets/cultivation-journey/npcs/merchant.webp" alt="" width="94" height="104"><div><h2>雲遊商人</h2><p>每次整備六件商品，各限購一件；返回庭院與讀檔不刷新。</p></div></div><div class="equip-shop-grid">${(shop?.stock||[]).map(stock=>card({...stock,level:0},`<button data-action="buy" data-stock="${esc(stock.id)}"${stock.sold?' disabled':''}>${stock.sold?'已售出':`${stock.price} 金幣 · 購買`}</button>`)).join('')}</div><section class="equip-material"><div><h3>靈砂補給 · 3 份靈砂</h3><p>30 金幣，每次整備限 3 包。已購 ${shop?.materialBought||0}/3 包。</p></div><button data-action="material"${!shop||shop.materialBought>=3?' disabled':''}>30 金幣 · 購買</button></section><h3>王印兌換</h3><div class="equip-redemptions">${E.sets.map(set=>`<section><img src="assets/cultivation-equipment/sets/${set.id}.webp" alt="" width="64" height="64"><div><h3>${esc(set.name)}</h3><p>每件 2 王印 · ${E.grades[set.grade-1]}品 +0 · 持有 ${player().economy.seals[set.id]}</p><div class="equip-actions">${E.slots.map(slot=>`<button data-action="redeem" data-set="${set.id}" data-slot="${slot}">${slotNames[slot]} · 2 王印</button>`).join('')}</div></div></section>`).join('')}</div>`;
    }
    function forgeMarkup() {
      const p=player();
      const inventory=player().economy.inventory, item=inventory.find(i=>i.uid===selected)||inventory[0];
      if(item) selected=item.uid;
      const target=(item?.level||0)+1, destinations=item?inventory.filter(i=>i.uid!==item.uid&&E.get(i.catId).slot===E.get(item.catId).slot&&i.level<item.level):[];
      return `<div class="equip-npc-intro"><img src="assets/cultivation-journey/npcs/blacksmith.webp" alt="" width="94" height="104"><div><h2>鑄器師</h2><p>強化失敗仍扣全部費用；裝備不會碎裂。請先確認成功率與退階規則。</p></div></div>${inventory.length?`<label class="equip-forge-select">選擇裝備<select id="equipForgeItem">${inventory.map(i=>`<option value="${esc(i.uid)}"${i.uid===selected?' selected':''}>${esc(label(i))}</option>`).join('')}</select></label><div class="equip-forge-grid"><section>${card(item)}${target<=10?`<div class="equip-forge-rate"${p.economy.items?' hidden':''}><span>目標 +${target}</span><strong>${Math.round(M.rates[target-1]*100)}<small>% 成功率</small></strong><p>費用：${M.goldCosts[target-1]} 金幣 + ${M.sandCosts[target-1]} 靈砂</p><p>失敗後：+${target<=7?item.level:item.level-1}（${target<=7?'保留原等級':'退 1 級'}）</p></div>${p.economy.items&&U?U.forge(p,item,forgeOptions):''}<button class="primary" data-action="forge" data-uid="${esc(item.uid)}">強化至 +${target}</button>`:'<p>已達 +10 強化上限。</p>'}</section><section class="equip-transfer"><h3>強化移轉</h3><p>同部位，由高等級移到低等級。消耗 30 金幣、2 靈砂；來源歸 +0，目標繼承來源等級。</p>${item.locked?'<p>來源已鎖定，請先解除鎖定。</p>':destinations.length?`<label>移轉目標<select id="equipTransferTarget">${destinations.map(i=>`<option value="${esc(i.uid)}">${esc(label(i))}</option>`).join('')}</select></label><button data-action="transfer" data-uid="${esc(item.uid)}">檢視移轉並確認</button>`:'<p>沒有同部位、強化較低的目標。</p>'}</section></div>`:'<p class="equip-empty">行囊尚無裝備。先擊敗妖獸或到商人處選購。</p>'}<details class="equip-rules"><summary>完整強化機率與費用</summary><table><thead><tr><th>目標</th><th>成功率</th><th>金幣</th><th>靈砂</th><th>失敗</th></tr></thead><tbody>${M.rates.map((r,i)=>`<tr><td>+${i+1}</td><td>${Math.round(r*100)}%</td><td>${M.goldCosts[i]}</td><td>${M.sandCosts[i]}</td><td>${i<7?'保留原級':'退1級'}</td></tr>`).join('')}</tbody></table></details>`;
    }
    function confirmationMarkup() {
      if (!confirmation) return '';
      const source=player().economy.inventory.find(i=>i.uid===confirmation.sourceUid);
      const target=player().economy.inventory.find(i=>i.uid===confirmation.targetUid);
      return `<section class="equip-confirm" role="alertdialog" aria-modal="true" aria-labelledby="equipConfirmTitle"><h3 id="equipConfirmTitle">${confirmation.type==='transfer'?'確認強化移轉':'確認分解裝備'}</h3>${confirmation.type==='transfer'?`<p>來源：${esc(label(source))} → <b>+0</b></p><p>目標：${esc(label(target))} → <b>+${source.level}</b></p><p>費用：<b>30 金幣、2 靈砂</b>；不改變品階，強化等級不相加。</p>`:`<p>${esc(label(source))}</p><p>將永久失去此裝備，返還 <b>${source.grade} 靈砂</b>；不返還強化費、王印或金幣。</p>`}<div class="equip-actions"><button type="button" id="equipConfirmCancel">取消</button><button type="button" class="primary" id="equipConfirmAccept">${confirmation.type==='transfer'?'確認移轉':'確認分解'}</button></div></section>`;
    }
    function render() {
      state=callbacks.getState?.()||state;
      const active=host.ownerDocument?.activeElement;
      if(host.contains?.(active)){const attrs=['id','data-tab','data-action','data-uid','data-item','data-select','data-filter'];const key=attrs.filter(a=>active.hasAttribute?.(a)).map(a=>[a,active.getAttribute(a)]);if(key.length)focusKey=key;}
      const p=player(), itemsOn=!!p.economy.items&&!!U;tab=itemsOn?p.economy.items.tab:['loot','items'].includes(tab)?'inventory':tab;
      if(itemsOn){const hero=host.closest('.journey-screen')?.querySelector('.journey-prepared-hero');if(hero){let summary=hero.querySelector('.supply-character');if(!summary){summary=document.createElement('div');summary.className='supply-character';hero.querySelector('.journey-stats')?.replaceWith(summary);}summary.innerHTML=U.character(state.cultivation.expedition ? {...p,expeditionEffect:state.cultivation.expedition.pendingEffect||{}} : p);}}
      const locked=session.busy||session.pending||navigating||!!confirmation;
      callbacks.onLock?.(session.busy||session.pending||!!confirmation);
      host.innerHTML=`<div class="equip-wallet" aria-label="目前資源"><b>金幣 <span>${p.economy.gold}</span></b><b>靈砂 <span>${p.economy.sand}</span></b><span>${E.sets.filter(s=>p.economy.seals[s.id]).map(s=>`${esc(s.name)}王印 ${p.economy.seals[s.id]}`).join(' · ')}</span></div><div class="equip-tabs" role="tablist" aria-label="整備用途">${[...(itemsOn?[['loot','本局收穫'],['items','道具行囊']]:[]),['inventory','行囊配裝'],['shop','雲遊商人'],['forge','鑄器師']].map(([id,name])=>`<button role="tab" type="button" data-tab="${id}" aria-selected="${tab===id}" aria-controls="equipPanel"${locked?' disabled':''}>${name}</button>`).join('')}</div><div class="equip-notice" role="status" aria-live="polite">${session.busy?'正在儲存交易，請稍候…':esc(note)}${session.pending&&!session.busy?'<button type="button" id="equipRetry">重試原交易</button>':''}</div>${confirmationMarkup()}<div id="equipPanel" role="tabpanel" aria-label="${{loot:'本局收穫',items:'道具行囊',inventory:'行囊配裝',shop:'雲遊商人',forge:'鑄器師'}[tab]}"${locked?' inert':''}>${tab==='loot'?U.loot(state.cultivation,lootPid):tab==='items'?U.inventory(p,itemFilter):tab==='inventory'?inventoryMarkup():tab==='shop'?shopMarkup()+(itemsOn?U.shop(p):''):forgeMarkup()}</div>${itemsOn?U.prepared(p):''}`;
      host.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{if(button.dataset.tab==='forge')forgeOptions={stone:false,charm:'none'};if(itemsOn)return act('item-tab',{tab:button.dataset.tab});tab=button.dataset.tab;note='';render();});
      const category=host.querySelector('#supplyCategory');if(category)category.onchange=()=>{itemFilter=category.value;render();};
      const lootPlayer=host.querySelector('#supplyLootPlayer');if(lootPlayer)lootPlayer.onchange=()=>{lootPid=Number(lootPlayer.value);render();};
      const fs=host.querySelector('#supplyForgeStone'),fc=host.querySelector('#supplyForgeCharm');
      if(fs)fs.onchange=()=>{forgeOptions.stone=fs.checked;render();};if(fc)fc.onchange=()=>{forgeOptions.charm=fc.value;render();};
      host.querySelectorAll('[data-select]').forEach(button=>button.onclick=()=>{selected=button.dataset.select;render();});
      host.querySelectorAll('[data-filter]').forEach(select=>select.onchange=()=>{filters[select.dataset.filter]=select.value;render();});
      const forgeItem=host.querySelector('#equipForgeItem'); if(forgeItem) forgeItem.onchange=()=>{selected=forgeItem.value;forgeOptions={stone:false,charm:'none'};render();};
      const retry=host.querySelector('#equipRetry'); if(retry) retry.onclick=async()=>showResult(await session.retry());
      const cancel=host.querySelector('#equipConfirmCancel'), accept=host.querySelector('#equipConfirmAccept');
      if(cancel) cancel.onclick=()=>{confirmation=null;render();};
      if(accept) accept.onclick=()=>{
        const choice=confirmation;confirmation=null;
        return act(choice.type,choice.type==='transfer'?{sourceUid:choice.sourceUid,targetUid:choice.targetUid,confirm:true}:{uid:choice.sourceUid,confirm:true});
      };
      host.onkeydown=event=>{
        if(!confirmation)return;
        if(event.key==='Escape'){event.preventDefault();confirmation=null;render();}
        if(event.key==='Tab'){event.preventDefault();(document.activeElement===cancel?accept:cancel)?.focus();}
      };
      host.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{
        if(locked) return;
        const {action,uid,slot,stock,set}=button.dataset, item=p.economy.inventory.find(i=>i.uid===uid);
        if(action.startsWith('item-')){const itemId=button.dataset.item;return act(action,action==='item-prepare'?{ids:p.economy.items.prepared.includes(itemId)?p.economy.items.prepared.filter(id=>id!==itemId):[...p.economy.items.prepared,itemId]}:{itemId});}
        if(action==='forge')return act(action,{uid,...forgeOptions});
        if(action==='dismantle') {
          confirmation={type:action,sourceUid:uid};render();host.querySelector('#equipConfirmCancel')?.focus();return;
        }
        if(action==='transfer') {
          const target=p.economy.inventory.find(i=>i.uid===host.querySelector('#equipTransferTarget').value);
          confirmation={type:action,sourceUid:uid,targetUid:target.uid};render();host.querySelector('#equipConfirmCancel')?.focus();return;
        }
        act(action,action==='buy'?{stockId:stock}:action==='redeem'?{setId:set,slot}:action==='unequip'?{slot}:action==='material'?{}:{uid,...(action==='lock'?{locked:!item.locked}:{}),...(action==='dismantle'?{confirm:true}:{})});
      });
      if(locked)host.querySelectorAll('.supply-prepared button').forEach(button=>button.disabled=true);
      if(!locked&&focusKey){const control=Array.from(host.querySelectorAll('button,select,input')).find(el=>focusKey.every(([key,value])=>el.getAttribute(key)===value));control?.focus({preventScroll:true});}
    }
    render();
    return Object.freeze({get busy(){return session.busy;},get pending(){return session.pending||!!confirmation;},setNavigationLocked(value){navigating=value;render();}});
  }
  let lootTimer = null;
  function notifyLoot(before, after) {
    const previous=before.players[0].economy?.handLoot, next=after.players[0].economy?.handLoot;
    if (!previous || !next || (previous.gold===next.gold && previous.sand===next.sand && previous.items.length===next.items.length)) return;
    let node=document.getElementById('equipBattleNotice');
    if(!node){node=document.createElement('div');node.id='equipBattleNotice';node.className='equip-battle-notice';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.append(node);}
    node.textContent=`獲得 金幣 +${next.gold-previous.gold} · 靈砂 +${next.sand-previous.sand}${next.items.length>previous.items.length?` · 裝備 +${next.items.length-previous.items.length}`:''}`;
    node.hidden=false;root.clearTimeout(lootTimer);lootTimer=root.setTimeout(()=>{node.hidden=true;},3200);
  }
  const api=Object.freeze({mount,transactionSession,roleInfo,loot,label,notifyLoot});
  root.MahjongCultivationEquipmentUI=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
