const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const H=require('../cultivation-heroes.js');
const root=path.join(__dirname,'..'),out=path.join(root,'artifacts');
const reports=Object.fromEntries(['calibration','holdout','trials'].map(k=>[k,JSON.parse(fs.readFileSync(path.join(out,`tile-family-${k}.json`)))]));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
for(const r of Object.values(reports)) {
  assert.equal(r.passed,true,`${r.mode} incomplete`);
  assert.deepEqual(r.sourceHashes,reports.calibration.sourceHashes,'Mixed production source revisions');
  for(const [file,hash]of Object.entries(r.sourceHashes.after)) {
    const content=fs.readFileSync(path.join(root,file),'utf8'),lf=content.replace(/\r\n/g,'\n');
    // Git autocrlf may rewrite the checkout after a merge; accept only equivalent line endings.
    assert.ok([content,lf,lf.replace(/\n/g,'\r\n')].some(text=>sha(text)===hash),`Source changed: ${file}`);
  }
}
function summarize(rows) {
  const hands=rows.flatMap(r=>r.hands),mean=k=>+(hands.reduce((n,h)=>n+h[k],0)/hands.length).toFixed(2);
  return {journeys:rows.length,hands:hands.length,effectiveDamage:mean('effectiveDamage'),heal:mean('heal'),absorbed:mean('absorbed'),weak:mean('weak'),weakTotal:hands.reduce((n,h)=>n+h.weak,0),
    killsPerJourney:+(rows.reduce((n,r)=>n+r.hands.at(-1).kills,0)/rows.length).toFixed(2)};
}
const summary={passed:true,normal:{},heroes:[],trials:[],boundaries:reports.calibration.scope};
for(const group of ['calibration','holdout']) {
  const r=reports[group];assert.equal(r.rows.length,80);
  for(const variant of ['before','after']){
    const rows=r.rows.filter(r=>r.variant===variant);assert.equal(rows.length,40);
    assert.equal(new Set(rows.map(r=>`${r.heroId}:${r.dealer}`)).size,40);
    for(const row of rows)assert.equal(row.hands.length,8);
    summary.normal[`${group}-${variant}`]=summarize(rows);
  }
  for(const before of r.rows.filter(r=>r.variant==='before'))assert.ok(r.rows.some(r=>r.variant==='after'&&r.heroId===before.heroId&&r.dealer===before.dealer&&r.seed===before.seed));
}
for(const h of H.all) {
  const row={heroId:h.id,name:h.name};
  for(const variant of ['before','after']){
    const hands=['calibration','holdout'].flatMap(g=>reports[g].rows.filter(r=>r.heroId===h.id&&r.variant===variant).flatMap(r=>r.hands));
    assert.equal(hands.length,64);
    row[variant]={damage:+(hands.reduce((n,h)=>n+h.players[0].damage,0)/hands.length).toFixed(2),weak:+(hands.reduce((n,h)=>n+h.players[0].weak,0)/hands.length).toFixed(3)};
  }
  summary.heroes.push(row);
}
assert.equal(reports.trials.rows.length,160);
for(let realm=1;realm<=4;realm++){
  const row={realm};for(const variant of ['before','after']){
    const runs=reports.trials.rows.filter(r=>r.variant===variant&&r.realm===realm);assert.equal(runs.length,20);
    row[variant]={successes:runs.filter(r=>r.passed).length,n:runs.length};
    for(const run of runs)assert.ok(reports.trials.rows.some(r=>r.variant!==variant&&r.seed===run.seed&&r.realm===realm&&r.parentHash===run.parentHash));
  }summary.trials.push(row);
}
fs.writeFileSync(path.join(out,'tile-family-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
