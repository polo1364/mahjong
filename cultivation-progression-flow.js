/* Connect committed progression transactions to the existing game lifecycle. */
(function(root){'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const P=()=>root.MahjongCultivationProgression;
  let bridge,store,profile=null,expeditionProfile=null,trial=null,starting=false,revision=0,trialRevision=0;
  let writes=Promise.resolve();
  const settlements=new Map();
  const uid=()=>root.crypto.randomUUID();
  function init(api){bridge=api;store=root.MahjongProgressionStore.create({openDB:api.openDB,storeName:api.storeName,progression:P(),validateSave:api.validateSave});}
  async function refresh(){[profile,trial,expeditionProfile]=await Promise.all([store.readProfile(),store.readTrial(),root.MahjongCultivationExpedition?store.readExpeditionProfile():null]);trialRevision=trial?.trialRevision||0;return {profile:clone(profile),trial};}
  function message(error){bridge.status(error?.message||String(error));}
  function observe(envelope){
    if(envelope.gameState?.cultivation?.trial)trialRevision=envelope.trialRevision||0;
    else revision=envelope.progressionRevision||0;
  }
  function serializeWrite(action){
    const pending=writes.then(action);
    writes=pending.catch(()=>{});return pending;
  }
  async function persistParent(envelope){
    const saved=await store.saveAutoGuarded(envelope,revision);
    if(saved===false)throw Error('另一個分頁已更新旅程，請重新整理頁面讀取最新進度。');
    revision=saved;return true;
  }
  function saveParent(envelope){return serializeWrite(()=>persistParent(envelope));}
  async function persistTrial(envelope){
    const saved=await store.saveTrial(envelope,trialRevision);
    trialRevision=saved.trialRevision;trial=saved;return true;
  }
  function guardStart(mode,options){
    if(starting)return false;
    starting=true;
    refresh().then(async()=>{
      if(trial){await resumeTrial();return;}
      const carry=!options.freshJourney&&bridge.getState()?.cultivation;
      await writes;
      if(!carry)revision=await store.readAutoRevision();
      bridge.startSession(mode,{...options,progressionReady:true,progression:clone(profile),progressionId:carry?.progression?.journeyId||carry?.economy?.journeyId||uid()});
    }).catch(error=>{options.onCancelled?.();message(error);}).finally(()=>{starting=false;});
    return false;
  }
  async function settleNow(state){
    const combat=state?.cultivation;
    if(!combat||combat.trial||!combat.ended)return {profile,earned:0};
    const key=(combat.progression?.journeyId||'legacy')+':'+combat.handNumber;
    const apply=result=>{profile=result.profile;if(result.expedition&&!state.cultivation.expedition?.settled.includes(combat.handNumber)){state.cultivation.expedition=clone(result.expedition);delete state.cultivation.players[0].expeditionEffect;}if(result.expeditionProfile)expeditionProfile=clone(result.expeditionProfile);return result;};
    if(settlements.has(key))return apply(await settlements.get(key));
    const pending=store.settle(bridge.pack(state),revision).then(apply);
    settlements.set(key,pending);
    try{return await pending;}catch(error){settlements.delete(key);throw error;}
  }
  const settle=state=>serializeWrite(()=>settleNow(state));
  async function prepare(state){
    await settle(state);await refresh();
    if(trial)throw Error('尚有渡劫存檔，請先繼續或放棄渡劫。');
    const next={...state,cultivation:root.MahjongCultivationCombat.prepare(state.cultivation,{equipment:true,progression:clone(profile),progressionId:state.cultivation.progression?.journeyId||state.cultivation.economy?.journeyId})};
    if(root.MahjongCultivationExpedition)next.cultivation.expedition=await serializeWrite(()=>store.initializeExpedition(bridge.pack(next)));
    return next;
  }
  async function restorePreparation(source){
    const next=clone(source);
    next.cultivation.expedition=await serializeWrite(()=>store.initializeExpedition(bridge.pack(next)));
    await refresh();
    if(bridge.getState()!==source)return false;
    bridge.publish(next);return true;
  }
  async function configure(allocation){
    return serializeWrite(async()=>{
    const source=bridge.getState();
    if(source?.cultivation?.journey?.phase!=='preparation'||source.cultivation.trial)throw Error('只能在整備配置功法。');
    profile=await store.configure(allocation);
    if(bridge.getState()!==source)throw Error('牌局已變更，請重新開啟整備。');
    const next=clone(source);next.cultivation.players[0].progression=clone(profile);
    await persistParent(bridge.pack(next));
    bridge.publish(next);return clone(profile);
    });
  }
  async function chooseEvent(choiceId){
    return serializeWrite(async()=>{
      const source=bridge.getState();
      const result=await store.chooseEvent(bridge.pack(source),choiceId,revision);
      revision=result.revision;
      if(bridge.getState()!==source)throw Error('牌局已變更，請讀取最新旅程。');
      bridge.publish(result.envelope.gameState);return result.envelope.gameState;
    });
  }
  async function chooseBoss(choice){
    return serializeWrite(async()=>{
      const source=bridge.getState(),combat=source?.cultivation,X=root.MahjongCultivationExpedition;
      if(!combat?.expedition||combat.trial||combat.journey?.phase!=='preparation'||combat.journey.nextTier!=='miniboss'||combat.journey.pendingMinibossId||combat.journey.retrySpeciesId)throw Error('目前不能選擇首領。');
      expeditionProfile=await store.readExpeditionProfile();
      const next=clone(source);next.cultivation=X.selectBoss(combat,choice,expeditionProfile,root.MahjongCultivationMonsters.all);
      await persistParent(bridge.pack(next));bridge.publish(next);return next;
    });
  }
  function preparationOptions(){return {profile:profile&&clone(profile),expeditionProfile:expeditionProfile&&clone(expeditionProfile),onConfigure:configure,onTrial:beginTrial,onEvent:chooseEvent,onBoss:chooseBoss};}
  async function beginTrial(){
    return serializeWrite(async()=>{
    const source=bridge.getState();
    if(source?.cultivation?.journey?.phase!=='preparation')throw Error('請先進入整備。');
    await refresh();
    if(trial)throw Error('已有未完成的渡劫。');
    const parent=clone(source);parent.cultivation.players[0].progression=clone(profile);
    trial=await store.beginTrial(bridge.pack(parent),{id:uid(),parentJourneyId:parent.cultivation.progression.journeyId,...P().trialSpec(profile.realm+1)},revision);
    observe(trial.parentEnvelope);
    trialRevision=trial.trialRevision||0;
    launchTrial(trial);
    });
  }
  function launchTrial(entry){
    const parent=entry.parentEnvelope;
    bridge.launchTrial(parent,{id:entry.id,parentJourneyId:entry.parentJourneyId,...P().trialSpec(entry.targetRealm)},clone(profile));
  }
  async function resumeTrial(){
    await refresh();if(!trial)throw Error('沒有待續的渡劫。');
    bridge.reveal();
    if(trial.save)bridge.restore(trial.save,'cultivation');else launchTrial(trial);
  }
  async function finishTrial(abandon=false){
    const state=bridge.getState();
    await writes;
    if(!abandon&&state?.cultivation?.trial){await save(bridge.pack(state));}
    if(!trial)throw Error('渡劫已結束，請重新整理頁面讀取最新整備。');
    const result=await store.finishTrial({id:trial.id,abandon,expectedTrialRevision:trialRevision});
    profile=result.profile;trial=null;
    bridge.unlock();bridge.reveal();bridge.restore(result.parentEnvelope,'cultivation');
    message(result.success?`突破${P().realms[profile.realm].name}！獲得金幣 ${100*profile.realm}、靈砂 ${5*profile.realm}。`:abandon?'已放棄渡劫，原旅程完整保留。':'渡劫未成，修為及原旅程完整保留。');
    return result;
  }
  function save(envelope){
    return serializeWrite(async()=>{
      const combat=envelope.gameState.cultivation;
      if(combat.trial)return persistTrial(envelope);
      if(combat.ended)await settleNow(envelope.gameState);
      return persistParent(envelope);
    });
  }
  function home(host){root.MahjongProgressionUI.home(host,profile,trial,{onResume:resumeTrial,onAbandon:()=>finishTrial(true)});}
  function result(host,state){
    const paint=(result={},error,pending=false)=>{root.MahjongProgressionUI.result(host,state.cultivation,{profile:result.profile||profile,earned:P().award(state.cultivation,0),pending,error,onRetry:()=>run()});if(!pending&&!error)root.MahjongExpeditionUI?.result(host,state.cultivation);};
    const run=async()=>{try{const value=await settle(state);if(bridge.getState()===state&&host.isConnected)paint(value);}catch(error){if(host.isConnected)paint({},error);}};
    paint({},null,true);run();
  }
  function trialResult(panel,state){
    const success=state.cultivation.result?.reason==='trial';
    panel.innerHTML=`<div class="reaction-panel result-panel"><div class="eyebrow">渡劫試煉</div><h3>${success?'渡劫成功':'渡劫未成'}</h3><p>${success?'返回整備時保存突破與獎勵。':'修為不扣除，道具與原旅程保留。'}</p><p role="status" data-trial-status></p><div class="result-footer"><button id="btnContinueNext" class="primary">返回整備</button></div></div>`;
    const button=panel.querySelector('#btnContinueNext');
    button.onclick=async()=>{button.disabled=true;bridge.lock();try{await finishTrial();}catch(error){panel.querySelector('[data-trial-status]').textContent='保存失敗：'+error.message+'，請重試。';}finally{bridge.unlock();button.disabled=false;}};
    save(bridge.pack(state)).catch(error=>{const status=panel.querySelector('[data-trial-status]');if(status)status.textContent='試煉暫存失敗：'+error.message;});
  }
  root.MahjongProgressionFlow=Object.freeze({init,refresh,observe,readAutoRevision:()=>store.readAutoRevision(),guardStart,prepare,restorePreparation,preparationOptions,save,home,result,trialResult,resumeTrial,finishTrial,get profile(){return profile&&clone(profile);},get hasTrial(){return !!trial;}});
})(window);
