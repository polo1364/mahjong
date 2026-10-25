/* IndexedDB transactions for permanent cultivation and isolated trials. */
(function (root) { 'use strict';
  const PROFILE_KEY = 'cultivationProgressionV1';
  const AUTO_KEY = 'cultivationAutoSaveV1';
  const AUTO_REVISION_KEY = 'cultivationAutoRevisionV1';
  const TRIAL_KEY = 'cultivationTrialSaveV1';
  const EXPEDITION_KEY = 'cultivationExpeditionProfileV1';
  const expeditionKey = id => `cultivationExpeditionJourneyV1:${id}`;
  const eventKey = (journeyId, id) => `cultivationExpeditionEventV1:${journeyId}:${id}`;
  const receiptKey = (journeyId, handNumber) =>
    `cultivationProgressionReceiptV1:${journeyId}:${handNumber}`;
  const breakthroughKey = (journeyId, realm) =>
    `cultivationProgressionBreakthroughV1:${journeyId}:${realm}`;
  const copy = value => structuredClone(value);

  function create({openDB, storeName = 'gameSaves', progression: P, validateSave} = {}) {
    const X = root.MahjongCultivationExpedition;
    const C = root.MahjongCultivationCombat;
    if (typeof openDB !== 'function' || typeof storeName !== 'string' || !storeName ||
        !P || typeof P.fresh !== 'function' || typeof P.validate !== 'function' ||
        typeof P.configure !== 'function' || typeof P.award !== 'function' ||
        typeof P.trialSpec !== 'function') throw Error('Invalid progression store dependencies');

    function validEnvelope(envelope) {
      if (!envelope || typeof envelope !== 'object' || !envelope.gameState ||
          !envelope.gameState.cultivation) throw Error('Invalid cultivation save');
      if (validateSave && validateSave(envelope) === false) throw Error('Invalid cultivation save');
      return envelope.gameState.cultivation;
    }
    function identity(combat) {
      const journeyId = combat?.progression?.journeyId;
      const handNumber = combat?.handNumber;
      if (typeof journeyId !== 'string' || !journeyId || journeyId.length > 128 ||
          journeyId.includes(':') || !Number.isSafeInteger(handNumber) || handNumber < 1)
        throw Error('Invalid progression hand identity');
      return {journeyId, handNumber};
    }
    function profileFrom(value) {
      const profile = value === undefined ? P.fresh() : value;
      P.validate(profile);
      return profile;
    }
    function revisionFrom(value) {
      if (value === undefined) return 0;
      if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid auto save revision');
      return value;
    }
    function expectedRevisionIsValid(value) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
        throw Error('Invalid expected auto save revision');
    }
    function nextRevision(value) {
      if (value >= Number.MAX_SAFE_INTEGER) throw Error('Auto save revision exhausted');
      return value + 1;
    }
    function validTrial(entry) {
      if (entry === undefined) return null;
      if (!entry || typeof entry.id !== 'string' || !entry.id ||
          !Number.isInteger(entry.targetRealm) || entry.targetRealm < 1 || entry.targetRealm > 4 ||
          !['pending', 'active'].includes(entry.status) ||
          typeof entry.parentJourneyId !== 'string' ||
          !Number.isSafeInteger(entry.parentHandNumber) || entry.parentHandNumber < 1 ||
          (entry.trialRevision !== undefined &&
           (!Number.isSafeInteger(entry.trialRevision) || entry.trialRevision < 0)) ||
          !entry.parentEnvelope || (entry.save !== null && !entry.save))
        throw Error('Invalid trial save');
      return entry;
    }
    function trialMatches(entry, envelope) {
      const combat = validEnvelope(envelope);
      const spec = P.trialSpec(entry.targetRealm);
      if (!combat.trial || combat.trial.targetSpeciesId !== spec.targetSpeciesId ||
          combat.trial.lifeScale !== spec.lifeScale || combat.trial.id !== entry.id ||
          combat.trial.parentJourneyId !== entry.parentJourneyId)
        throw Error('Trial save does not match active trial');
      return combat;
    }
    async function transaction(mode, work) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        let tx, result, failure;
        try { tx = db.transaction([storeName], mode); }
        catch (error) { db.close(); reject(error); return; }
        const store = tx.objectStore(storeName);
        const fail = error => {
          failure = error;
          try { tx.abort(); } catch (_) { /* Already aborted. */ }
        };
        const get = (key, next) => {
          const request = store.get(key);
          request.onsuccess = () => {
            try { next(request.result); } catch (error) { fail(error); }
          };
        };
        const put = (key, value) => store.put(value, key);
        const del = key => store.delete(key);
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onerror = () => { /* onabort owns the final rejection. */ };
        tx.onabort = () => { db.close(); reject(failure || tx.error || Error('Progression transaction aborted')); };
        try { work({get, put, del, fail, done: value => { result = value; }}); }
        catch (error) { fail(error); }
      });
    }

    const readProfile = () => transaction('readonly', ({get, done}) =>
      get(PROFILE_KEY, value => done(copy(profileFrom(value)))));
    const readAutoRevision = () => transaction('readonly', ({get, done}) =>
      get(AUTO_REVISION_KEY, value => done(revisionFrom(value))));
    function expeditionProfile(value) {
      const profile = value === undefined ? X.createProfile() : value;
      X.validateProfile(profile); return profile;
    }
    const readExpeditionProfile = () => transaction('readonly', ({get, done}) =>
      get(EXPEDITION_KEY, value => done(copy(expeditionProfile(value)))));
    const readTrial = () => transaction('readonly', ({get, done}) =>
      get(TRIAL_KEY, value => done(copy(validTrial(value)))));
    const readParent = () => transaction('readonly', ({get, done}) =>
      get(TRIAL_KEY, value => {
        const entry = validTrial(value);
        if (entry) validEnvelope(entry.parentEnvelope);
        done(entry ? copy(entry.parentEnvelope) : null);
      }));

    async function settle(envelope, expectedRevision) {
      const combat = validEnvelope(envelope);
      if (envelope.gameState.phase !== 'end' || !combat.ended || combat.trial)
        throw Error('Only completed normal cultivation hands can settle');
      const earned = P.award(combat, 0);
      if (!Number.isSafeInteger(earned) || earned < 0) throw Error('Invalid cultivation award');
      if (earned === 0) return {profile: await readProfile(), earned: 0, duplicate: false};
      const {journeyId, handNumber} = identity(combat);
      return transaction('readwrite', ({get, put, done}) => {
        const work = () => {
        get(PROFILE_KEY, value => {
          const profile = profileFrom(value);
          get(receiptKey(journeyId, handNumber), receipt => {
            if (receipt !== undefined) {
              done({profile: copy(profile), earned: 0, duplicate: true, expedition: receipt.expedition && copy(receipt.expedition)});
              return;
            }
            const next = {...profile, xp: profile.xp + earned, allocation: {...profile.allocation}};
            P.validate(next);
            const commit = extra => {
              put(PROFILE_KEY, next);
              put(receiptKey(journeyId, handNumber), {journeyId, handNumber, earned, ...extra});
              done({profile: copy(next), earned, duplicate: false, ...copy(extra)});
            };
            if (!X || !combat.expedition) { commit({}); return; }
            get(EXPEDITION_KEY, stored => {
              get(expeditionKey(journeyId), anchor => {
                if (anchor && (anchor.startHand !== combat.expedition.startHand || anchor.completed > combat.expedition.completed))
                  throw Error('巡歷進度已更新，請讀取最新旅程。');
                const out = C.finalizeExpedition(combat, {profile: expeditionProfile(stored),
                  winner: envelope.gameState.winner, discarder: envelope.gameState.fromPlayer,
                  declaredListen: envelope.gameState.players.map(player => player.declaredListen)});
                put(EXPEDITION_KEY, out.profile);
                put(expeditionKey(journeyId), out.state.expedition);
                commit({expedition: out.state.expedition, expeditionProfile: out.profile});
              });
            });
          });
        });
        };
        if (expectedRevision === undefined) work();
        else get(AUTO_REVISION_KEY, value => {
          if (revisionFrom(value) !== expectedRevision) throw Error('另一個分頁已更新旅程，請讀取最新存檔。');
          work();
        });
      });
    }

    function initializeExpedition(envelope) {
      const combat = validEnvelope(envelope);
      if (!X || combat.trial || combat.journey?.phase !== 'preparation') throw Error('巡歷只能在安全整備啟用。');
      const {journeyId, handNumber} = identity(combat);
      return transaction('readwrite', ({get, put, done}) => get(expeditionKey(journeyId), stored => {
        const expedition = stored ? copy(stored) : combat.expedition || X.create(journeyId, combat.rng || 1, handNumber + 1);
        if (stored && combat.expedition?.completed === stored.completed &&
            JSON.stringify(combat.expedition.receipts) === JSON.stringify(stored.receipts))
          expedition.bossChoice = copy(combat.expedition.bossChoice);
        X.validate(expedition);
        if (!stored) put(expeditionKey(journeyId), expedition);
        done(copy(expedition));
      }));
    }

    function chooseEvent(envelope, choiceId, expectedRevision) {
      expectedRevisionIsValid(expectedRevision);
      const combat = validEnvelope(envelope);
      if (!X || combat.trial || combat.journey?.phase !== 'preparation' || !combat.expedition?.pendingEvent)
        throw Error('目前沒有可處理的奇遇。');
      const {journeyId} = identity(combat), pendingId = combat.expedition.pendingEvent.id;
      return transaction('readwrite', ({get, put, done}) => get(AUTO_REVISION_KEY, value => {
        if (revisionFrom(value) !== expectedRevision) throw Error('另一個分頁已更新旅程，請讀取最新存檔。');
        get(TRIAL_KEY, active => {
          if (validTrial(active)) throw Error('渡劫期間不能處理奇遇。');
          get(eventKey(journeyId, pendingId), receipt => {
            if (receipt !== undefined) throw Error('此奇遇已處理，請讀取最新旅程。');
            get(expeditionKey(journeyId), stored => {
              if (!stored || stored.pendingEvent?.id !== pendingId) throw Error('奇遇資料已更新，請讀取最新旅程。');
              const saved = copy(envelope);
              saved.gameState.cultivation = X.chooseEvent(combat, choiceId);
              validEnvelope(saved);
              const revision = nextRevision(revisionFrom(value));
              saved.progressionRevision = revision;
              put(eventKey(journeyId, pendingId), {journeyId, choiceId});
              put(expeditionKey(journeyId), saved.gameState.cultivation.expedition);
              put(AUTO_KEY, saved); put(AUTO_REVISION_KEY, revision);
              done({envelope: saved, revision});
            });
          });
        });
      }));
    }

    const configure = allocation => transaction('readwrite', ({get, put, done}) => {
      get(PROFILE_KEY, value => {
        const next = P.configure(profileFrom(value), allocation);
        P.validate(next);
        put(PROFILE_KEY, next);
        done(copy(next));
      });
    });

    function beginTrial(parentEnvelope, descriptor, expectedRevision) {
      expectedRevisionIsValid(expectedRevision);
      const parent = validEnvelope(parentEnvelope);
      if (parentEnvelope.gameState.phase !== 'end' || parent.journey?.phase !== 'preparation' ||
          parent.trial || !descriptor || typeof descriptor.id !== 'string' || !descriptor.id ||
          descriptor.id.length > 128) throw Error('Trial requires a prepared parent save');
      const {journeyId, handNumber} = identity(parent);
      const spec = P.trialSpec(descriptor.targetRealm);
      return transaction('readwrite', ({get, put, done}) => {
        get(AUTO_REVISION_KEY, storedRevision => {
          const revision = revisionFrom(storedRevision);
          if (expectedRevision !== undefined && revision !== expectedRevision)
            throw Error('Trial parent auto save is stale');
          get(TRIAL_KEY, active => {
            if (validTrial(active)) throw Error('A trial is already active');
            get(PROFILE_KEY, value => {
              const profile = profileFrom(value);
              if (profile.realm + 1 !== descriptor.targetRealm || profile.xp < P.realms[descriptor.targetRealm].xp)
                throw Error('Trial realm is not unlocked');
              if (parent.players?.[0]?.progression?.realm !== profile.realm ||
                  (descriptor.parentJourneyId && descriptor.parentJourneyId !== journeyId))
                throw Error('Trial parent is stale');
              const autoRevision = nextRevision(revision);
              const savedParent = copy(parentEnvelope);
              savedParent.progressionRevision = autoRevision;
              const entry = {
                id: descriptor.id, targetRealm: descriptor.targetRealm,
                targetSpeciesId: spec.targetSpeciesId, lifeScale: spec.lifeScale,
                parentJourneyId: journeyId, parentHandNumber: handNumber,
                parentEnvelope: savedParent, save: null, status: 'pending', autoRevision,
                trialRevision: 0
              };
              put(AUTO_KEY, savedParent);
              put(AUTO_REVISION_KEY, autoRevision);
              put(TRIAL_KEY, entry);
              done(copy(entry));
            });
          });
        });
      });
    }

    function saveTrial(envelope, expectedTrialRevision) {
      expectedRevisionIsValid(expectedTrialRevision);
      return transaction('readwrite', ({get, put, done}) => {
        get(TRIAL_KEY, value => {
          const entry = validTrial(value);
          if (!entry) throw Error('No active trial');
          const revision = revisionFrom(entry.trialRevision);
          if (expectedTrialRevision !== undefined && revision !== expectedTrialRevision)
            throw Error('Trial save is stale');
          trialMatches(entry, envelope);
          const trialRevision = nextRevision(revision);
          const saved = copy(envelope);
          saved.trialRevision = trialRevision;
          const next = {...entry, save: saved, status: 'active', trialRevision};
          put(TRIAL_KEY, next);
          done(copy(next));
        });
      });
    }

    function saveAutoGuarded(envelope, expectedRevision) {
      expectedRevisionIsValid(expectedRevision);
      const combat = validEnvelope(envelope);
      if (combat.trial) throw Error('Trial save must use saveTrial');
      return transaction('readwrite', ({get, put, done}) => {
        get(AUTO_REVISION_KEY, storedRevision => {
          const revision = revisionFrom(storedRevision);
          if (expectedRevision !== undefined && revision !== expectedRevision) { done(false); return; }
          get(TRIAL_KEY, value => {
            if (validTrial(value)) { done(false); return; }
            get(PROFILE_KEY, value => {
              const profile = profileFrom(value);
              if (combat.progression &&
                  (!Number.isInteger(combat.players?.[0]?.progression?.realm) ||
                   combat.players[0].progression.realm > profile.realm)) {
                done(false);
                return;
              }
              const savedRevision = nextRevision(revision);
              const saved = copy(envelope);
              saved.progressionRevision = savedRevision;
              put(AUTO_KEY, saved);
              put(AUTO_REVISION_KEY, savedRevision);
              done(savedRevision);
            });
          });
        });
      });
    }

    function finishTrial({id, abandon = false, expectedTrialRevision} = {}) {
      if (typeof id !== 'string' || !id || typeof abandon !== 'boolean')
        throw Error('Invalid trial completion request');
      expectedRevisionIsValid(expectedTrialRevision);
      return transaction('readwrite', ({get, put, del, done}) => {
        get(TRIAL_KEY, value => {
          const entry = validTrial(value);
          if (!entry || entry.id !== id) throw Error('Active trial does not match');
          if (expectedTrialRevision !== undefined &&
              revisionFrom(entry.trialRevision) !== expectedTrialRevision)
            throw Error('Trial completion is stale');
          const parent = copy(entry.parentEnvelope);
          validEnvelope(parent);
          const trial = entry.save && trialMatches(entry, entry.save);
          if (!abandon && (!trial || !trial.ended || entry.save.gameState.phase !== 'end'))
            throw Error('Trial has not ended');
          const success = !abandon && trial.result?.reason === 'trial';
          get(AUTO_REVISION_KEY, storedRevision => {
            const revision = nextRevision(revisionFrom(storedRevision));
            parent.progressionRevision = revision;
            get(PROFILE_KEY, value => {
              const profile = profileFrom(value);
              if (profile.realm + 1 !== entry.targetRealm) throw Error('Trial realm is stale');
              if (!success) {
                put(AUTO_KEY, parent);
                put(AUTO_REVISION_KEY, revision);
                del(TRIAL_KEY);
                done({profile: copy(profile), parentEnvelope: parent, success: false, abandoned: abandon, autoRevision: revision});
                return;
              }
              get(breakthroughKey(entry.parentJourneyId, entry.targetRealm), receipt => {
                if (receipt !== undefined) throw Error('Breakthrough already credited');
                const next = {...profile, realm: entry.targetRealm, allocation: {...profile.allocation}};
                P.validate(next);
                const player = parent.gameState.cultivation.players?.[0];
                const wallet = player?.economy;
                if (!wallet || !Number.isSafeInteger(wallet.gold) || !Number.isSafeInteger(wallet.sand))
                  throw Error('Invalid parent wallet');
                wallet.gold += 100 * next.realm;
                wallet.sand += 5 * next.realm;
                if (!Number.isSafeInteger(wallet.gold) || !Number.isSafeInteger(wallet.sand))
                  throw Error('Invalid breakthrough wallet');
                parent.gameState.cultivation.players[0].progression = copy(next);
                validEnvelope(parent);
                put(PROFILE_KEY, next);
                put(breakthroughKey(entry.parentJourneyId, next.realm),
                  {trialId: id, journeyId: entry.parentJourneyId, realm: next.realm});
                put(AUTO_KEY, parent);
                put(AUTO_REVISION_KEY, revision);
                del(TRIAL_KEY);
                done({profile: copy(next), parentEnvelope: parent, success: true, abandoned: false, autoRevision: revision});
              });
            });
          });
        });
      });
    }

    return Object.freeze({readProfile, readAutoRevision, readTrial, readParent, readExpeditionProfile, initializeExpedition, chooseEvent, settle, configure,
      beginTrial, saveTrial, finishTrial, saveAutoGuarded});
  }
  const api = Object.freeze({create});
  root.MahjongProgressionStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
