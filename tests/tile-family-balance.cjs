// Paired legal journeys and replay of first-eligible trial parents from the accepted benchmark.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {game} = require('./game-harness.cjs');
const {legalHand, ai, snap, gearPolicy} = require('./expedition-balance.cjs');
const H = require('../cultivation-heroes.js');
const P = require('../cultivation-progression.js');
const root = path.join(__dirname, '..'), mode = process.argv[2] || 'calibration';
assert.ok(['calibration', 'holdout', 'trials'].includes(mode));
const baseline = 'f89696fe2a64d66cd3a0cc63f0b1bbb101abdd67';
const files = ['index.html', 'cultivation-skills.js', 'cultivation-finishers.js', 'cultivation-heroes.js',
  'cultivation-monster-skills.js', 'cultivation-monsters.js', 'cultivation-progression.js',
  'cultivation-expedition.js', 'cultivation-equipment.js', 'cultivation-items.js', 'cultivation-economy.js', 'cultivation-combat.js'];
const sources = {
  before: Object.fromEntries(files.map(file => [file, execFileSync('git', ['show', `${baseline}:${file}`], {cwd:root, encoding:'utf8', maxBuffer:4e6})])),
  after: Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(root,file), 'utf8')]))
};
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const report = {passed:false, baseline, mode, normalHandsPerJourney:8, scope:'Ten heroes, four initial dealer positions, eight uninterrupted legal hands; neutral event choice and legal earned gear. Healing excludes natural revival using production expedition metrics. Trials replay saved first-eligible legal parents, not new long journeys.', sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([f,s])=>[f,hash(s)]))])), rows:[]};
const output = path.join(root, 'artifacts', `tile-family-${mode}.json`);
function write() { fs.writeFileSync(output, JSON.stringify(report,null,2)); }
function journey(variant, heroId, seed, dealer) {
  // Override only the opening dice's resulting seat, before dealing; later dealer rotation is production code.
  const scripts = {...sources[variant], 'index.html':sources[variant]['index.html'].replace('newDealer = (diceSum - 1) % 4;', `newDealer = ${dealer};`)};
  const {run,timers} = game(seed, {cultivation:true,heroId,equipment:true,scriptOverrides:scripts});
  ai(run);
  const journeyId = `family-${seed}-${dealer}`;
  let profile = P.fresh(), previous = null;
  const row = {variant,heroId,seed,dealer,hands:[],command:0,transactions:0};
  run(`startNewHand(true,null,${JSON.stringify({heroId,equipment:true,progression:profile,progressionId:journeyId})});`);
  const metrics = {heal:0,absorbed:0};
  run('window.familyMetrics={heal:0,absorbed:0};const familyApply=window.MahjongCultivationCombat.apply;window.MahjongCultivationCombat={...window.MahjongCultivationCombat,apply(...args){const result=familyApply(...args);for(const e of result.effects){if(e.type==="heal")window.familyMetrics.heal+=e.amount;if(e.type==="hurt")window.familyMetrics.absorbed+=e.absorbed||0;}return result;}};');
  for (let n=1;n<=report.normalHandsPerJourney;n++) {
    if (previous) run(`startNewHand(false,${JSON.stringify(previous)},${JSON.stringify({heroId,equipment:true,progression:profile,progressionId:journeyId})});`);
    legalHand(run,timers);
    // The VM harness omits the IndexedDB UI flow, so explicitly perform its production settlement step.
    run('if(!S.cultivation.expedition.lastResult||S.cultivation.expedition.lastResult.completed<S.cultivation.handNumber){S.cultivation=window.MahjongCultivationCombat.finalizeExpedition(S.cultivation,{winner:S.winner,discarder:S.fromPlayer>=0?S.fromPlayer:null,declaredListen:S.players.map(p=>p.declaredListen)}).state;}');
    const completed = snap(run,'S.cultivation'), now = snap(run,'window.familyMetrics');
    assert.equal(completed.expedition.completed,n);assert.equal(completed.handNumber,n);
    assert.equal(run('window.MahjongCultivationCombat.validate(S.cultivation)'),true);
    row.hands.push({n,damage:completed.players.reduce((s,p)=>s+p.damage,0),effectiveDamage:completed.expedition.metrics.reduce((s,p)=>s+p.damage,0),
      heal:completed.expedition.metrics.reduce((s,p)=>s+p.heal,0),recoveryIncludingRevival:now.heal-metrics.heal,absorbed:now.absorbed-metrics.absorbed,weak:completed.players.reduce((s,p)=>s+p.weakCount,0),kills:completed.kills.length,
      players:completed.players.map(p=>({heroId:p.heroId,damage:p.damage,weak:p.weakCount}))});
    Object.assign(metrics,now);
    profile={...profile,xp:profile.xp+completed.progression.earned[0]};
    run('S.cultivation=window.MahjongCultivationCombat.prepare(S.cultivation,{equipment:true});');gearPolicy(run,row);
    profile=P.configure(profile,P.aiAllocation(heroId,profile));
    run(`S.cultivation.players[0].progression=${JSON.stringify(profile)};if(S.cultivation.expedition.pendingEvent)S.cultivation=window.MahjongCultivationExpedition.chooseEvent(S.cultivation,'leave');`);
    previous=snap(run,'S.cultivation');
  }
  row.aiRealms=previous.players.slice(1).map(p=>p.progression.realm);row.ownedItems=previous.players[0].economy.inventory.length;
  delete row.command;return row;
}
try {
  if (mode === 'trials') {
    for (const cohort of [0,1]) for (const first of [0,2,4,6,8]) {
      const file=path.join(root,'artifacts',`progression-balance-round3-parents-${cohort}-${cohort}-${first}-${first+1}.json`);
      const data=JSON.parse(fs.readFileSync(file));
      for (const record of data.parents) for (const variant of ['before','after']) {
        const {run,timers}=game(record.seed,{cultivation:true,heroId:record.heroId,equipment:true,scriptOverrides:sources[variant]});ai(run);
        const trial={id:`family-trial-${record.seed}-${record.targetRealm}`,parentJourneyId:record.parent.progression.journeyId,...P.trialSpec(record.targetRealm)};
        const parentHash=hash(record.parent);
        run(`seed=${record.mahjongRng};startNewHand(true,${JSON.stringify(record.parent)},${JSON.stringify({trial,progression:record.profile,progressionId:trial.parentJourneyId})});`);
        const start=snap(run,'S.cultivation');legalHand(run,timers);const end=snap(run,'S.cultivation');
        assert.equal(hash(record.parent),parentHash);assert.deepEqual(end.progression.earned,[0,0,0,0]);
        assert.deepEqual(end.players.map(p=>p.economy.inventory),start.players.map(p=>p.economy.inventory));
        report.rows.push({variant,cohort,heroId:record.heroId,realm:record.targetRealm,seed:record.seed,lifeScale:trial.lifeScale,passed:end.result.reason==='trial',remainingHp:end.monster.hp,parentHash});
      }
      write();console.log('trial parents',cohort,first);
    }
  } else {
    for(let hero=0;hero<H.all.length;hero++)for(let dealer=0;dealer<4;dealer++) {
      const seed=(mode==='calibration'?2510001:2610001)+hero*1009+dealer*100003;
      for (const variant of ['before','after']) report.rows.push(journey(variant,H.all[hero].id,seed,dealer));
      write();console.log(mode,H.all[hero].id,dealer);
    }
  }
  report.passed=true;
} finally { write(); }
