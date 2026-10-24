const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
  const name = decodeURIComponent(request.url.split('?')[0]).slice(1);
  if (!['cultivation-progression.js', 'cultivation-progression-store.js'].includes(name)) {
    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end('<!doctype html><title>Progression store test</title>');
    return;
  }
  response.writeHead(200, {'Content-Type': 'text/javascript'});
  response.end(fs.readFileSync(path.join(root, name)));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addScriptTag({url: '/cultivation-progression.js'});
    await page.addScriptTag({url: '/cultivation-progression-store.js'});
    const result = await page.evaluate(async () => {
      const checks = [];
      const check = (condition, message) => {
        if (!condition) throw Error(message);
        checks.push(message);
      };
      const dbName = 'ProgressionStoreTest-' + crypto.randomUUID();
      function openDB() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(dbName, 1);
          request.onupgradeneeded = () => request.result.createObjectStore('gameSaves');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      const P = MahjongCultivationProgression;
      const make = open => MahjongProgressionStore.create({openDB: open, progression: P,
        validateSave: value => !!value.gameState?.cultivation});
      const first = make(openDB), second = make(openDB);
      const journeyId = crypto.randomUUID();
      const hand = (handNumber, earned = 12, profile = P.fresh()) => ({
        gameState: {phase: 'end', cultivation: {ended: true, handNumber,
          journey: {phase: 'preparation'}, progression: {journeyId, earned: [earned, 0, 0, 0]},
          players: [{progression: structuredClone(profile), economy: {gold: 250, sand: 12}}]}},
        rules: {}, seatNames: [], randomNames: null, customPlayerName: null,
        dealerStreak: 0, timestamp: '2026-10-25T00:00:00.000Z'
      });
      check((await first.readProfile()).xp === 0, 'missing profile reads as fresh');
      const initial = hand(1);
      const concurrent = await Promise.all([first.settle(initial), second.settle(initial)]);
      check(concurrent.filter(value => value.earned === 12).length === 1 &&
        concurrent.filter(value => value.duplicate).length === 1,
        'two tab settlement credits one receipt');
      check((await first.readProfile()).xp === 12, 'concurrent settlement does not lose xp');
      check((await first.settle(initial)).duplicate, 'old restored hand cannot earn again');
      const legacy = hand(1);
      delete legacy.gameState.cultivation.progression;
      check((await first.settle(legacy)).earned === 0 && (await first.readProfile()).xp === 12,
        'legacy completed save does not mint retroactive xp');
      const sameRevision = await first.readAutoRevision();
      const autoWrites = await Promise.all([
        first.saveAutoGuarded(legacy, sameRevision),
        second.saveAutoGuarded(legacy, sameRevision)
      ]);
      check(autoWrites.filter(value => value === sameRevision + 1).length === 1 &&
        autoWrites.filter(value => value === false).length === 1,
        'two clients with the same auto revision cannot overwrite each other');
      check((await first.readAutoRevision()) === 1,
        'legacy save also advances auto revision');
      await first.settle(hand(2));
      const configured = await first.configure({sword: 1});
      check(configured.xp === 24 && configured.allocation.sword === 1,
        'configure uses latest committed profile');
      let aborted = false;
      const abortOpen = async () => {
        const db = await openDB();
        return {transaction(...args) {
          const tx = db.transaction(...args);
          queueMicrotask(() => tx.abort());
          return tx;
        }, close() { db.close(); }};
      };
      try { await make(abortOpen).settle(hand(3)); }
      catch (_) { aborted = true; }
      check(aborted && (await first.readProfile()).xp === 24,
        'aborted transaction leaves profile unchanged');
      check((await first.settle(hand(3))).earned === 12 &&
        (await first.settle(hand(3))).duplicate,
        'aborted settlement can retry exactly once');
      for (let n = 4; n <= 9; n++) await first.settle(hand(n));
      const profile = await first.readProfile();
      check(profile.xp === 108, 'threshold earned from nine real receipts');
      const parent = hand(9, 12, profile);
      const original = JSON.stringify(parent);
      const id = crypto.randomUUID();
      const descriptor = {id, ...P.trialSpec(1), parentJourneyId: journeyId};
      let staleBegin = false;
      try { await first.beginTrial(parent, descriptor, 0); } catch (_) { staleBegin = true; }
      check(staleBegin && (await first.readTrial()) === null,
        'trial cannot start from a stale auto revision');
      const entry = await first.beginTrial(parent, descriptor, 1);
      check(entry.status === 'pending' && (await second.readTrial()).id === id,
        'pending trial survives another tab read');
      const heldParent = await second.readParent();
      check(heldParent.progressionRevision === 2 &&
        JSON.stringify(heldParent.gameState) === JSON.stringify(parent.gameState),
        'trial keeps exact parent envelope snapshot');
      check(await second.saveAutoGuarded(parent) === false,
        'active trial guards parent autosave');
      let duplicateTrial = false;
      try { await second.beginTrial(parent, {...descriptor, id: crypto.randomUUID()}); }
      catch (_) { duplicateTrial = true; }
      check(duplicateTrial, 'concurrent trial cannot replace active trial');
      const trial = hand(1, 0, profile);
      trial.gameState.cultivation.trial = {...descriptor};
      trial.gameState.cultivation.seq = 77;
      trial.gameState.cultivation.result = {reason: 'trial'};
      let wrongTrial = false;
      try { await first.saveTrial({...trial, gameState: {...trial.gameState,
        cultivation: {...trial.gameState.cultivation, trial: {...descriptor, id: crypto.randomUUID()}}}}); }
      catch (_) { wrongTrial = true; }
      check(wrongTrial, 'late save from different trial id is rejected');
      const firstTrialSave = await first.saveTrial(trial, 0);
      check(firstTrialSave.trialRevision === 1 &&
        firstTrialSave.save.trialRevision === 1,
        'trial save advances entry and envelope revision together');
      const staleTrial = structuredClone(trial);
      staleTrial.gameState.cultivation.result = {reason: 'draw'};
      let staleTrialSave = false;
      try { await second.saveTrial(staleTrial, 0); }
      catch (_) { staleTrialSave = true; }
      const latestTrial = await first.readTrial();
      check(staleTrialSave && latestTrial.save.gameState.cultivation.seq === 77 &&
        latestTrial.save.gameState.cultivation.result.reason === 'trial' &&
        latestTrial.trialRevision === 1,
        'same combat seq with stale revision cannot overwrite other tab trial result');
      let staleAbandon = false;
      try { await second.finishTrial({id, abandon: true, expectedTrialRevision: 0}); }
      catch (_) { staleAbandon = true; }
      check(staleAbandon && (await first.readTrial()).trialRevision === 1,
        'stale tab cannot abandon a newer successful trial');
      const success = await second.finishTrial({id, expectedTrialRevision: 1});
      check(success.success && success.profile.realm === 1 &&
        success.parentEnvelope.gameState.cultivation.players[0].economy.gold === 350 &&
        success.parentEnvelope.gameState.cultivation.players[0].economy.sand === 17,
        'successful trial credits realm and wallet exactly once');
      check(success.autoRevision === 3 && success.parentEnvelope.progressionRevision === 3 &&
        (await first.readAutoRevision()) === 3,
        'successful trial advances parent auto revision');
      check((await first.readTrial()) === null && (await first.readParent()) === null,
        'finished trial is removed');
      check(JSON.stringify(parent) === original,
        'caller parent envelope remains unchanged');
      check(await first.saveAutoGuarded(parent, 2) === false,
        'stale old tab revision cannot erase breakthrough wallet');
      let replay = false;
      try { await first.finishTrial({id}); } catch (_) { replay = true; }
      check(replay && (await first.readProfile()).realm === 1,
        'finished trial cannot replay breakthrough');
      let oldManual = false;
      try { await first.beginTrial(parent, descriptor); } catch (_) { oldManual = true; }
      check(oldManual, 'old manual parent cannot repeat same breakthrough');
      const nextParent = structuredClone(success.parentEnvelope);
      nextParent.gameState.cultivation.players[0].progression = structuredClone(success.profile);
      nextParent.gameState.cultivation.handNumber = 10;
      nextParent.gameState.cultivation.progression.earned = [0, 0, 0, 0];
      nextParent.gameState.cultivation.players[0].economy.gold = 310;
      const nextId = crypto.randomUUID();
      const nextDesc = {id: nextId, ...P.trialSpec(2), parentJourneyId: journeyId};
      // The second realm needs 400 xp. Give the profile more legitimate hand receipts.
      for (let n = 10; n <= 34; n++) await first.settle(hand(n, 12, success.profile));
      nextParent.gameState.cultivation.players[0].progression = await first.readProfile();
      await first.beginTrial(nextParent, nextDesc, 3);
      const abandoned = await first.finishTrial({id: nextId, abandon: true, expectedTrialRevision: 0});
      check(abandoned.abandoned && !abandoned.success && abandoned.profile.realm === 1 &&
        JSON.stringify(abandoned.parentEnvelope.gameState) === JSON.stringify(nextParent.gameState) &&
        abandoned.autoRevision === 5 && (await first.readAutoRevision()) === 5,
        'abandon restores parent resources and rng exactly');
      check((await first.readTrial()) === null, 'abandon removes trial');
      await first.beginTrial(nextParent, {...nextDesc, id: crypto.randomUUID()}, 5);
      const failureEntry = await first.readTrial();
      const failed = structuredClone(nextParent);
      failed.gameState.cultivation.trial = {...nextDesc, id: failureEntry.id};
      failed.gameState.cultivation.result = {reason: 'draw'};
      await first.saveTrial(failed, 0);
      const failure = await first.finishTrial({id: failureEntry.id, success: true,
        expectedTrialRevision: 1});
      check(!failure.success && !failure.abandoned && failure.profile.realm === 1 &&
        JSON.stringify(failure.parentEnvelope.gameState) === JSON.stringify(nextParent.gameState) &&
        failure.autoRevision === 7 && (await first.readAutoRevision()) === 7,
        'failed trial ignores caller success claim and restores exact parent');
      const permanentBeforeRollback = await first.readProfile();
      check((await first.saveAutoGuarded(parent, 7)) === 8,
        'explicit old manual restore may autosave a lower realm snapshot');
      const savedOldParent = await new Promise(async (resolve, reject) => {
        const db = await openDB();
        const tx = db.transaction(['gameSaves'], 'readonly');
        const request = tx.objectStore('gameSaves').get('cultivationAutoSaveV1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      });
      check(savedOldParent.progressionRevision === 8 &&
        savedOldParent.gameState.cultivation.players[0].progression.realm === 0 &&
        (await first.readProfile()).realm === permanentBeforeRollback.realm &&
        (await first.readProfile()).xp === permanentBeforeRollback.xp,
        'manual rollback changes auto snapshot but never rolls back permanent profile');
      let oldRealmTrial = false;
      try { await first.beginTrial(parent, descriptor, 8); }
      catch (_) { oldRealmTrial = true; }
      check(oldRealmTrial, 'old manual realm cannot start another trial before safe refresh');
      const goodProfile = await first.readProfile();
      await new Promise(async (resolve, reject) => {
        const db = await openDB();
        const tx = db.transaction(['gameSaves'], 'readwrite');
        tx.objectStore('gameSaves').put({version: 1, xp: -1, realm: 0, allocation: {}},
          'cultivationProgressionV1');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      });
      let corruptRejected = false;
      try { await first.readProfile(); } catch (_) { corruptRejected = true; }
      check(corruptRejected, 'corrupt permanent profile is rejected, not reset');
      let corruptSettlement = false;
      try { await first.settle(hand(35, 12, goodProfile)); }
      catch (_) { corruptSettlement = true; }
      check(corruptSettlement, 'corrupt profile prevents receipt commit');
      await new Promise(async (resolve, reject) => {
        const db = await openDB();
        const tx = db.transaction(['gameSaves'], 'readwrite');
        tx.objectStore('gameSaves').put(goodProfile, 'cultivationProgressionV1');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      });
      check((await first.settle(hand(35, 12, goodProfile))).earned === 12,
        'settlement after profile repair can retry');
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = resolve; request.onerror = () => reject(request.error);
      });
      return checks;
    });
    assert.ok(result.length >= 20);
    console.log(`Progression store: ${result.length} browser IndexedDB checks passed`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
