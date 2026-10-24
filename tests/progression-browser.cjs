// End-to-end progression coverage. Fixtures are isolated in fresh browser contexts.
// The normal settlement fixture ends a playable hand through endDraw(); the trial
// success fixture lowers only monster HP, then clicks a legal hand tile.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium, webkit} = require('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'artifacts');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const report = {passed:false, fixtures:['isolated IDB profile xp=100',
  'normal hand ended through endDraw()', 'trial monster HP=1 followed by a real tile click'],
  boundary:'Browser workflow, save integrity and UI reachability; low-HP fixture does not establish combat balance; no physical phone.',
  checks:[], screenshots:[], errors:[]};
let server;
let activeBrowser = '';
function check(label, data) { report.checks.push({label, ...data}); console.log('PASS', label); }
function captureErrors(page,browser) { page.on('pageerror',error => report.errors.push({browser,message:error.message})); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function serve() {
  server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname === '/') pathname = '/index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.end(bytes);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () =>
    resolve(`http://127.0.0.1:${server.address().port}/`)));
}
async function db(page, mode, key, value) {
  return page.evaluate(async ({mode,key,value}) => {
    const database = await initDB();
    try { return await new Promise((resolve,reject) => {
      const transaction = database.transaction(['gameSaves'], mode === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('gameSaves');
      const request = mode === 'get' ? store.get(key) : store.put(value,key);
      transaction.oncomplete = () => resolve(mode === 'get' ? request.result : true);
      transaction.onabort = () => reject(transaction.error || Error('IDB aborted'));
    }); } finally { database.close(); }
  }, {mode,key,value});
}
async function ready(page,url) {
  await page.goto(url);
  await page.waitForFunction(() => window.MahjongStartScreen?.state === 'home' &&
    !document.getElementById('startGameBtn').disabled);
}
async function snapshot(page,name) {
  const file = path.join(out, `progression-browser-${activeBrowser}-${name}.png`);
  await page.screenshot({path:file,fullPage:false});
  report.screenshots.push(path.relative(root,file));
  return path.relative(root,file);
}
async function liveText(page,selector,pattern) {
  const text = await page.locator(selector).innerText();
  assert.match(text,pattern,`${selector} text`);
  return text;
}
async function getState(page) { return page.evaluate(() => ({phase:S?.phase,
  combat:S?.cultivation && {version:S.cultivation.version,handNumber:S.cultivation.handNumber,
    journey:S.cultivation.journey,trial:S.cultivation.trial,progression:S.cultivation.progression,
    result:S.cultivation.result}, home:window.MahjongStartScreen.state})); }
async function openProgressionTab(page) {
  const tab = page.locator('[data-left="progression"]');
  await tab.waitFor({state:'attached'});
  if (!await tab.isVisible()) await page.locator('.prep-left-toggle').click();
  await tab.click();
  await page.locator('[data-progression-edit]').waitFor({state:'visible'});
}
async function seedProfile(page) {
  const profile = await page.evaluate(() => ({...window.MahjongCultivationProgression.fresh(),xp:100}));
  await db(page,'put','cultivationProgressionV1',profile);
  await page.evaluate(() => window.MahjongStartScreen.showHome());
  await liveText(page,'#cultivationProgressionHome',/100 \/ 100 修為/);
}
async function begin(page) {
  await page.locator('#startGameBtn').click();
  await page.locator('#cultivationModeBtn').click();
  await page.locator('.journey-selection-screen').waitFor();
  assert.equal(await page.locator('[data-hero]').count(),10);
  await page.locator('[data-hero]').nth(1).click();
  await page.locator('#journeyChooseConfirm').click();
  await page.locator('.opening-skip').click({timeout:10000}).catch(() => {});
  await page.waitForFunction(() => S?.phase === 'play' && !!S.cultivation,{timeout:15000});
  const state = await getState(page);
  assert.equal(state.combat.version,3);
  assert.ok(state.combat.progression?.journeyId);
  assert.equal(await page.locator('#playerInfo0 .seat-name').count(),1);
  check('new journey through hero selection',{hero:await page.evaluate(() => S.cultivation.players[0].heroId)});
}
async function settleNormal(page) {
  await page.evaluate(() => { cancelGameTimers(); endDraw(); });
  await page.locator('#btnContinueNext').waitFor({timeout:10000});
  await page.waitForFunction(() => window.MahjongProgressionFlow.profile?.xp >= 112);
  const award = await page.evaluate(() => window.MahjongCultivationProgression.award(S.cultivation,0));
  assert.ok(award >= 12 && award <= 15,`award=${award}`);
  await liveText(page,'.progression-result',new RegExp(`\\+${award} 修為`));
  const profile = await db(page,'get','cultivationProgressionV1');
  assert.equal(profile.xp,100+award);
  await page.evaluate(() => window.MahjongProgressionFlow.result(document.querySelector('.progression-result'),S));
  await page.waitForTimeout(100);
  assert.equal((await db(page,'get','cultivationProgressionV1')).xp,profile.xp);
  check('12+ XP credited once through result re-entry',{award,xp:profile.xp});
  await snapshot(page,'result');
  await page.locator('#btnContinueNext').click();
  await page.locator('.journey-preparation-screen').waitFor({timeout:10000});
  await liveText(page,'.journey-progression',/配置功法/);
  return profile;
}
async function configure(page) {
  await openProgressionTab(page);
  await inspectAiSummary(page);
  const visibility = await page.locator('[data-progression-edit]').evaluate(button => {
    const nodes=[];for(let el=button;el&&el!==document.body;el=el.parentElement){
      const style=getComputedStyle(el),r=el.getBoundingClientRect();
      nodes.push({tag:el.tagName,className:el.className,display:style.display,visibility:style.visibility,
        position:style.position,width:r.width,height:r.height,hidden:el.hidden});
    }return nodes;
  });
  if (!await page.locator('[data-progression-edit]').isVisible())
    throw Error('Progression card invisible: '+JSON.stringify(visibility));
  await page.locator('[data-progression-edit]').click();
  await page.locator('.progression-dialog').waitFor();
  await page.locator('[data-skill="recovery"][data-delta="1"]').click();
  await page.locator('[data-progression-save]').click();
  await page.locator('.progression-dialog').waitFor({state:'detached'});
  await page.waitForFunction(() => {
    const hero=MahjongCultivationHeroes.get(S.cultivation.players[0].heroId);
    const expected=Number(MahjongCultivationJourneyUI.statValues(hero,S.cultivation.players[0]).healing.toFixed(1));
    const row=[...document.querySelectorAll('.supply-character .journey-stats > div')]
      .find(node => node.querySelector('dt')?.textContent === '治療');
    return row && Number(row.querySelector('dd').firstChild.textContent) === expected;
  });
  const healing=await page.evaluate(() => {
    const hero=MahjongCultivationHeroes.get(S.cultivation.players[0].heroId);
    const expected=Number(MahjongCultivationJourneyUI.statValues(hero,S.cultivation.players[0]).healing.toFixed(1));
    const row=[...document.querySelectorAll('.supply-character .journey-stats > div')]
      .find(node => node.querySelector('dt')?.textContent === '治療');
    return {expected,shown:Number(row.querySelector('dd').firstChild.textContent)};
  });
  assert.equal(healing.shown,healing.expected);
  check('equipment character stats refresh after skill save',{healing});
  await page.locator('[data-progression-edit]').click();
  await page.locator('.progression-dialog').waitFor();
  await page.locator('[data-skill="recovery"][data-delta="-1"]').click();
  await page.locator('[data-skill="sword"][data-delta="1"]').click();
  await page.locator('[data-progression-save]').click();
  await page.locator('.progression-dialog').waitFor({state:'detached'});
  const profile = await db(page,'get','cultivationProgressionV1');
  assert.equal(profile.allocation.sword,1);
  const save = await db(page,'get','cultivationAutoSaveV1');
  assert.equal(save.gameState.cultivation.players[0].progression.allocation.sword,1);
  check('preparation skill persisted',{allocation:profile.allocation});
  await snapshot(page,'preparation');
  return save;
}
async function inspectAiSummary(page) {
  const summary = page.locator('.progression-ai > summary');
  await summary.click();
  const rows = await page.locator('.progression-ai li').evaluateAll(nodes => nodes.map(node => ({
    text:node.textContent,overflow:node.scrollWidth>node.clientWidth+1
  })));
  assert.equal(rows.length,3);
  for (const row of rows) { assert.match(row.text,/整備：裝備 \d\/3 件.*備妥道具 \d\/2/); assert.equal(row.overflow,false); }
  await page.locator('.progression-ai li').last().scrollIntoViewIfNeeded();
  const lastBounds = await page.locator('.progression-ai li').last().boundingBox();
  assert.ok(lastBounds.y>=0 && lastBounds.y+lastBounds.height<=page.viewportSize().height);
  check('AI preparation summary fits viewport',{viewport:page.viewportSize()});
  await snapshot(page,`${page.viewportSize().width}x${page.viewportSize().height}-ai-summary`);
  await summary.click();
}
async function launchTrial(page) {
  await openProgressionTab(page);
  await page.locator('[data-progression-trial]').click();
  await page.waitForFunction(() => S?.cultivation?.trial && S?.phase === 'play',{timeout:15000});
  await page.waitForFunction(async () => {
    const db = await initDB();
    const found = await new Promise(resolve => {
      const tx=db.transaction(['gameSaves'],'readonly');
      const req=tx.objectStore('gameSaves').get('cultivationTrialSaveV1');
      req.onsuccess=()=>resolve(!!req.result?.save);req.onerror=()=>resolve(false);
      tx.oncomplete=()=>db.close();
    });return found;
  },{timeout:15000});
  assert.equal(await page.locator('#saveGameBtn').isDisabled(),true);
  const trial = await db(page,'get','cultivationTrialSaveV1');
  assert.ok(trial.save);
  check('trial starts and auto saves separately',{id:trial.id});
  await snapshot(page,'trial');
  return trial;
}
async function goHome(page) {
  const result = await page.evaluate(() => document.getElementById('returnHomeBtn').onclick());
  assert.equal(result,true);
  await page.waitForFunction(() => window.MahjongStartScreen.state === 'home');
}
async function abandon(page) {
  const parent = await db(page,'get','cultivationAutoSaveV1');
  const before = digest(parent.gameState);
  await goHome(page);
  await liveText(page,'#cultivationProgressionHome',/繼續渡劫/);
  await page.locator('[data-progression-resume]').click();
  await page.waitForFunction(() => S?.cultivation?.trial && window.MahjongStartScreen.state === 'game');
  await goHome(page);
  await page.locator('[data-progression-abandon]').click();
  await page.waitForFunction(() => !window.MahjongProgressionFlow.hasTrial && S?.cultivation?.journey?.phase === 'preparation');
  const after = digest((await db(page,'get','cultivationAutoSaveV1')).gameState);
  assert.equal(after,before);
  assert.equal(await db(page,'get','cultivationTrialSaveV1'),undefined);
  check('home resume and abandon restore exact parent',{parentHash:before});
  await snapshot(page,'abandoned');
}
async function success(page) {
  if (!await page.locator('.journey-preparation-screen').isVisible()) {
    await page.locator('#btnContinueNext').click();
    await page.locator('.journey-preparation-screen').waitFor();
  }
  const parent = await db(page,'get','cultivationAutoSaveV1');
  const oldGold = parent.gameState.cultivation.players[0].economy.gold;
  const oldSand = parent.gameState.cultivation.players[0].economy.sand;
  const oldXP = (await db(page,'get','cultivationProgressionV1')).xp;
  await launchTrial(page);
  await page.evaluate(() => {
    cancelGameTimers();
    S.cultivation.monster.hp=1;S.cultivation.monster.shield=0;
    S.turn=0;S.waitReact=null;S.currentReactions=null;
    if(S.players[0].hand.length===16) drawTile(0);
    renderAll();
  });
  await page.locator('#yourHand button.tile:enabled').first().click();
  await page.waitForFunction(() => S?.cultivation?.result?.reason === 'trial' && S?.phase === 'end',{timeout:10000});
  await page.locator('#btnContinueNext').waitFor({timeout:10000});
  await liveText(page,'#reactionPanel',/渡劫成功/);
  await snapshot(page,'trial-success');
  await page.locator('#btnContinueNext').click();
  await page.waitForFunction(() => !window.MahjongProgressionFlow.hasTrial && S?.cultivation?.journey?.phase === 'preparation');
  const profile = await db(page,'get','cultivationProgressionV1');
  const reward = await db(page,'get','cultivationAutoSaveV1');
  assert.equal(profile.realm,1);assert.equal(profile.xp,oldXP);
  assert.equal(reward.gameState.cultivation.players[0].economy.gold,oldGold+100);
  assert.equal(reward.gameState.cultivation.players[0].economy.sand,oldSand+5);
  check('trial success reward committed once',{realm:profile.realm,xp:profile.xp,gold:100,sand:5});
  await snapshot(page,'breakthrough');
}
async function migration(browser,url,prepared) {
  const context = await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
  const page = await context.newPage();
  captureErrors(page,activeBrowser);
  try {
    await ready(page,url);
    const old = structuredClone(prepared);
    delete old.progressionRevision; // Legacy V3 envelopes predate guarded auto revisions.
    delete old.gameState.cultivation.progression;
    old.gameState.cultivation.players.forEach(player => { delete player.progression; });
    await db(page,'put','cultivationAutoSaveV1',old);
    await page.reload();
    await page.waitForFunction(() => window.MahjongStartScreen?.state === 'home');
    await page.locator('#continueCultivationBtn').click();
    await page.waitForFunction(() => S?.cultivation?.journey?.phase === 'preparation');
    await page.locator('.journey-preparation-screen').waitFor({timeout:10000});
    const migrated = await db(page,'get','cultivationAutoSaveV1');
    assert.ok(migrated.gameState.cultivation.progression?.journeyId);
    assert.equal(await page.evaluate(() => window.MahjongProgressionFlow.profile.xp),0);
    assert.equal(await db(page,'get','cultivationProgressionV1'),undefined);
    check('old V3 prepared save migration',{journeyId:migrated.gameState.cultivation.progression.journeyId});
    await snapshot(page,'old-v3-migration');
  } catch (error) {
    const state = await page.evaluate(() => ({phase:S?.phase,journey:S?.cultivation?.journey?.phase,
      progression:S?.cultivation?.progression,saveStatus:document.getElementById('saveStatus')?.textContent,
      reaction:document.getElementById('reactionPanel')?.textContent?.slice(-500),
      dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.className)}));
    throw Error(`old V3 migration: ${error.message}; state=${JSON.stringify(state)}`);
  } finally { await context.close(); }
}
async function twoTabStale(browser,url,prepared) {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
  const first=await context.newPage(),second=await context.newPage();
  captureErrors(first,activeBrowser);captureErrors(second,activeBrowser);
  try {
    await ready(first,url);
    await db(first,'put','cultivationProgressionV1',prepared.gameState.cultivation.players[0].progression);
    await db(first,'put','cultivationAutoSaveV1',prepared);
    await db(first,'put','cultivationAutoRevisionV1',prepared.progressionRevision);
    await Promise.all([ready(second,url),first.reload()]);
    await first.waitForFunction(() => window.MahjongStartScreen?.state === 'home');
    for(const page of [first,second]) {
      await page.locator('#continueCultivationBtn').click();
      await page.locator('.journey-preparation-screen').waitFor({timeout:10000});
    }
    await openProgressionTab(first);
    await first.locator('[data-progression-edit]').click();
    await first.locator('[data-skill="sword"][data-delta="-1"]').click();
    await first.locator('[data-skill="quiet"][data-delta="1"]').click();
    await first.locator('[data-progression-save]').click();
    await first.locator('.progression-dialog').waitFor({state:'detached'});
    const updated=await db(first,'get','cultivationAutoSaveV1');
    assert.equal(updated.gameState.cultivation.players[0].progression.allocation.quiet,1);
    const expected=digest(updated);
    const stale=await second.evaluate(async () => {
      try { await writeGameSave('cultivationAutoSaveV1');return 'accepted'; }
      catch(error) { return error.message; }
    });
    assert.match(stale,/另一個分頁已更新旅程/);
    assert.equal(digest(await db(second,'get','cultivationAutoSaveV1')),expected);
    check('two tabs reject stale auto save',{message:stale});
  } finally { await context.close(); }
}
async function twoTabTrialStale(browser,url,prepared) {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
  const first=await context.newPage();captureErrors(first,activeBrowser);
  try {
    await ready(first,url);
    await db(first,'put','cultivationProgressionV1',prepared.gameState.cultivation.players[0].progression);
    await db(first,'put','cultivationAutoSaveV1',prepared);
    await db(first,'put','cultivationAutoRevisionV1',prepared.progressionRevision);
    await first.reload();
    await first.waitForFunction(() => window.MahjongStartScreen?.state === 'home');
    await first.locator('#continueCultivationBtn').click();
    await first.locator('.journey-preparation-screen').waitFor();
    await launchTrial(first);
    const second=await context.newPage();captureErrors(second,activeBrowser);
    await ready(second,url);
    await second.locator('[data-progression-resume]').click();
    await second.waitForFunction(() => S?.cultivation?.trial && S?.phase === 'play');
    const before=await db(first,'get','cultivationTrialSaveV1');
    const saved=await first.evaluate(() => writeGameSave('cultivationTrialSaveV1'));
    assert.equal(saved,true);
    const latest=await db(first,'get','cultivationTrialSaveV1');
    assert.equal(latest.trialRevision,before.trialRevision+1);
    const latestHash=digest(latest);
    const rejectedSave=await second.evaluate(async () => {
      try { await writeGameSave('cultivationTrialSaveV1');return 'accepted'; }
      catch(error) { return error.message; }
    });
    assert.match(rejectedSave,/Trial save is stale/);
    const rejectedAbandon=await second.evaluate(async () => {
      try { await window.MahjongProgressionFlow.finishTrial(true);return 'accepted'; }
      catch(error) { return error.message; }
    });
    assert.match(rejectedAbandon,/Trial completion is stale/);
    const after=await db(first,'get','cultivationTrialSaveV1');
    assert.equal(digest(after),latestHash);
    assert.equal(after.id,before.id);
    check('two tabs reject stale trial save and abandon',{revision:after.trialRevision});
  } finally { await context.close(); }
}
async function responsive(browser,url,prepared) {
  for (const [width,height] of [[844,390],[942,435],[390,844]]) {
    const context = await browser.newContext({serviceWorkers:'block',viewport:{width,height}});
    const page = await context.newPage();
    captureErrors(page,activeBrowser);
    try {
      await ready(page,url);
      await db(page,'put','cultivationProgressionV1',prepared.gameState.cultivation.players[0].progression);
      await db(page,'put','cultivationAutoSaveV1',prepared);
      await db(page,'put','cultivationAutoRevisionV1',prepared.progressionRevision);
      await page.reload();
      await page.waitForFunction(() => window.MahjongStartScreen?.state === 'home');
      await snapshot(page,`${width}x${height}-home`);
      if(width<height) {
        assert.equal(await page.locator('#landscapeNotice').isVisible(),true);
        await liveText(page,'#landscapeNotice',/本遊戲僅支援橫式/);
        check(`portrait ${width}x${height} orientation prompt`,{});
        continue;
      }
      await page.locator('#continueCultivationBtn').click();
      await page.locator('.journey-preparation-screen').waitFor({timeout:10000});
      await openProgressionTab(page);
      await liveText(page,'.journey-progression',/修為 · 功法/);
      await inspectAiSummary(page);
      const reachable = await page.locator('[data-progression-edit]').evaluate(button => {
        const r=button.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth;
      });
      assert.equal(reachable,true);
      await page.locator('[data-progression-edit]').click();
      await page.locator('.progression-dialog').waitFor();
      await snapshot(page,`${width}x${height}-skills`);
      const editorBounds = await page.locator('.progression-dialog').evaluate(dialog => {
        const r=dialog.getBoundingClientRect();
        const heading=dialog.querySelector('#progressionEditorTitle').getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,headingTop:heading.top,viewportHeight:innerHeight};
      });
      assert.ok(editorBounds.top>=0 && editorBounds.bottom<=height && editorBounds.headingTop>=0,
        `skill editor clipped at ${width}x${height}: ${JSON.stringify(editorBounds)}`);
      await page.locator('[data-progression-save]').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('[data-progression-save]').isVisible(),true);
      await page.locator('[data-progression-cancel]').click();
      await page.locator('#journeyNext').click();
      await page.locator('.opening-skip').click({timeout:10000}).catch(() => {});
      await page.waitForFunction(() => S?.phase === 'play' && !!S.cultivation,{timeout:15000});
      await snapshot(page,`${width}x${height}-table`);
      const seats = await page.locator('.player-info-inline').evaluateAll(cards => cards.map(card => {
        const r=card.getBoundingClientRect(), name=card.querySelector('.seat-name')?.getBoundingClientRect();
        return {width:r.width,height:r.height,nameWidth:name?.width,nameHeight:name?.height};
      }));
      assert.equal(seats.length,4);
      assert.ok(seats.every(seat => seat.width>0 && seat.height>0 && seat.nameWidth>0 && seat.nameHeight>0),
        `seat text missing at ${width}x${height}: ${JSON.stringify(seats)}`);
      const startingXP=(await db(page,'get','cultivationProgressionV1')).xp;
      await page.evaluate(() => { cancelGameTimers(); endDraw(); });
      await page.locator('#btnContinueNext').waitFor({timeout:10000});
      await page.waitForFunction(xp => window.MahjongProgressionFlow.profile?.xp >= xp+12,startingXP);
      await liveText(page,'.progression-result',/本局修為/);
      await page.locator('.rs-head').scrollIntoViewIfNeeded();
      const resultHeading=await page.locator('.rs-head').boundingBox();
      assert.ok(resultHeading && resultHeading.y>=0 && resultHeading.y<height,
        `result heading unreachable at ${width}x${height}`);
      await snapshot(page,`${width}x${height}-mobile-result-top`);
      await page.locator('.progression-result').scrollIntoViewIfNeeded();
      await snapshot(page,`${width}x${height}-mobile-result`);
      await page.locator('#btnContinueNext').scrollIntoViewIfNeeded();
      assert.equal(await page.locator('#btnContinueNext').isVisible(),true);
      await page.locator('#btnContinueNext').click();
      await page.locator('.journey-preparation-screen').waitFor({timeout:10000});
      const parentBeforeTrial=digest((await db(page,'get','cultivationAutoSaveV1')).gameState);
      await launchTrial(page);
      await snapshot(page,`${width}x${height}-mobile-trial`);
      await goHome(page);
      await page.locator('[data-progression-abandon]').click();
      await page.waitForFunction(() => !window.MahjongProgressionFlow.hasTrial &&
        S?.cultivation?.journey?.phase === 'preparation');
      assert.equal(digest((await db(page,'get','cultivationAutoSaveV1')).gameState),parentBeforeTrial);
      check(`landscape ${width}x${height} controls reachable`,{});
    } finally { await context.close(); }
  }
}
(async () => {
  fs.mkdirSync(out,{recursive:true});
  const url = await serve();
  for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
    activeBrowser = name;
    const browser = await engine.launch({headless:true});
    const context = await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:900}});
    const page = await context.newPage();
    captureErrors(page,name);
    try {
      await ready(page,url);
      await liveText(page,'#cultivationProgressionHome',/0 \/ 100 修為/);
      check(`${name} cold home`,{});
      await seedProfile(page);
      await begin(page);
      await snapshot(page,'table');
      await settleNormal(page);
      const prepared = await configure(page);
      await launchTrial(page);
      await abandon(page);
      await success(page);
      await migration(browser,url,prepared);
      await twoTabStale(browser,url,prepared);
      await twoTabTrialStale(browser,url,prepared);
      await responsive(browser,url,prepared);
      check(`${name} complete flow`,{});
    } catch(error) {
      report.errors.push({browser:name,message:error.stack || String(error),state:await getState(page).catch(()=>null)});
      await snapshot(page,'failure').catch(()=>{});
      throw error;
    } finally { await context.close(); await browser.close(); }
  }
  assert.deepEqual(report.errors,[]);
  report.passed=true;
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
  fs.writeFileSync(path.join(out,'progression-browser-report.json'),JSON.stringify(report,null,2));
  if(server) await new Promise(resolve => server.close(resolve));
});
