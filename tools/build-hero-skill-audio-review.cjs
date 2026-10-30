/* Build an offline listening page from the current production contract and
 * verified manifest files. This does not generate audio or mark listening done.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'art-source/audio/voice-hero-skills-v1');
const contractPath = path.join(source, 'contract.json');
const previewPath = path.join(root, 'artifacts/hero-skill-audio-review.html');
const progressPath = path.join(root, 'artifacts/hero-skill-audio-progress.json');
const skills = new Map(require('../cultivation-skills.js').all.map(skill => [skill.id, skill]));
const actions = { call: '基本喊聲', chow: '引氣', pong: '聚靈', exposed: '開陣', concealed: '藏陣', added: '續陣', flower: '補花', formation: '普通花陣', finish: '終式' };
const cues = { chow: '引氣', pong: '聚靈', exposed: '開陣', concealed: '藏陣', added: '續陣', win: '決勝', 'self-draw': '天成', 'rob-kong': '截陣' };
const forbiddenTerms = /吃|碰|槓|胡|自摸|副露/u;

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function actionFor(id) {
  if (id.startsWith('call:')) {
    assert.ok(cues[id.slice(5)], 'Unknown basic call: ' + id);
    return 'call';
  }
  if (id.startsWith('finisher:')) return 'finish';
  const skill = skills.get(id);
  assert.ok(skill && actions[skill.action], 'Unknown skill: ' + id);
  return skill.action;
}

function collect() {
  const contractBytes = fs.readFileSync(contractPath);
  const contract = JSON.parse(contractBytes);
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.heroes.length, 10);
  assert.equal(new Set(contract.heroes.map(hero => hero.heroId)).size, 10);
  const rows = [];
  const heroes = [];
  for (const hero of contract.heroes) {
    const lines = hero.batches.flatMap(batch => batch.lines.map(line => ({ ...line, batchId: batch.id })));
    const byId = new Map(lines.map(line => [line.id, line]));
    assert.equal(lines.length, 213, hero.heroId + ' expected line count');
    assert.equal(byId.size, 213, hero.heroId + ' duplicate line IDs');
    assert.match(hero.heroId, /^[a-z0-9-]+$/u);
    const manifestPath = path.join(source, hero.heroId, 'manifest.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
    const clips = new Map();
    if (manifest) {
      assert.equal(manifest.heroId, hero.heroId);
      assert.equal(manifest.voiceId, hero.voiceId, hero.heroId + ' voice differs from contract');
      assert.equal(manifest.expected_count, lines.length);
      assert.equal(manifest.processed_count, manifest.clips.length);
      for (const clip of manifest.clips) {
        const expected = byId.get(clip.id);
        assert.ok(expected, hero.heroId + ' unexpected clip: ' + clip.id);
        assert.ok(!clips.has(clip.id), hero.heroId + ' duplicate clip: ' + clip.id);
        for (const key of ['text', 'direction', 'taggedText', 'batchId']) {
          assert.equal(clip[key], expected[key], hero.heroId + '/' + clip.id + ' outdated ' + key);
        }
        const assetFolder = path.resolve(root, 'assets/audio/voice-hero-skills-v1', hero.heroId);
        const assetPath = path.resolve(root, clip.file);
        assert.ok(assetPath.startsWith(assetFolder + path.sep) && path.extname(assetPath) === '.mp3', 'Invalid audio path: ' + clip.id);
        assert.equal(clip.file, path.relative(root, assetPath).split(path.sep).join('/'), 'Audio path must be project-relative');
        assert.equal(digest(fs.readFileSync(assetPath)), clip.sha256, hero.heroId + '/' + clip.id + ' audio hash mismatch');
        assert.ok(Number.isFinite(clip.levels.duration_seconds) && clip.levels.duration_seconds > 0, clip.id + ' invalid duration');
        clips.set(clip.id, clip);
      }
    }
    let textVerifiedCount = 0;
    let listeningVerifiedCount = 0;
    for (const line of lines) {
      const clip = clips.get(line.id);
      const action = actionFor(line.id);
      const textVerified = !!clip && (clip.text_content_verified ?? manifest.text_content_verified) === true;
      const listeningVerified = !!clip && (clip.human_listening_verified ?? manifest.human_listening_verified) === true;
      textVerifiedCount += Number(textVerified);
      listeningVerifiedCount += Number(listeningVerified);
      const row = {
        heroId: hero.heroId, hero: hero.name, role: hero.role, voice: hero.voice,
        id: line.id, batchId: line.batchId, action, category: actions[action],
        cue: action === 'call' ? cues[line.id.slice(5)] : '',
        name: line.text.replace(/[。！？]+$/u, ''), text: line.text, direction: line.direction,
        completed: !!clip, audio: clip ? '../' + clip.file : null,
        durationSeconds: clip ? clip.levels.duration_seconds : null,
        textContentVerified: textVerified, humanListeningVerified: listeningVerified,
      };
      assert.ok(!forbiddenTerms.test(JSON.stringify(row)), hero.heroId + '/' + line.id + ' contains non-cultivation terms');
      rows.push(row);
    }
    const summary = {
      heroId: hero.heroId, name: hero.name, role: hero.role, voice: hero.voice,
      voiceId: hero.voiceId, delivery: hero.delivery, expected: lines.length,
      completed: clips.size, pending: lines.length - clips.size,
      textVerifiedCount, listeningVerifiedCount,
    };
    assert.ok(!forbiddenTerms.test(JSON.stringify(summary)), hero.heroId + ' profile contains non-cultivation terms');
    heroes.push(summary);
  }
  assert.equal(rows.length, 2130);
  const completed = rows.filter(row => row.completed).length;
  const progress = {
    schemaVersion: 1, generatedUtc: new Date().toISOString(),
    contractSha256: digest(contractBytes), expected: rows.length, completed, pending: rows.length - completed,
    textVerifiedCount: heroes.reduce((sum, hero) => sum + hero.textVerifiedCount, 0),
    listeningVerifiedCount: heroes.reduce((sum, hero) => sum + hero.listeningVerifiedCount, 0),
    completionMeaning: 'Audio files exist and match the current contract and recorded hashes; production completion is not listening approval.',
    heroes,
  };
  return { progress, rows, actions };
}

function html(data) {
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>修仙角色語音・試聽與進度</title>
<style>
:root{font-family:system-ui,"Microsoft JhengHei",sans-serif;color:#223b34;background:#f4f5ef;line-height:1.6}*{box-sizing:border-box}body{margin:0}header,main,.filter-inner{max-width:1160px;margin:auto;padding:24px}h1{font-size:clamp(25px,4vw,38px);line-height:1.25;margin:10px 0 16px}h2,h3,p{margin:0 0 10px}.eyebrow{color:#39796c;letter-spacing:.12em;font-weight:700;font-size:13px}.notice{padding:12px 16px;border-left:3px solid #ae8c43;background:#fff8e7;color:#6c572b}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}.stat{background:#fff;border:1px solid #dae3da;border-radius:12px;padding:14px 18px}.stat strong{display:block;color:#205d4d;font-size:30px;line-height:1.2}.stat span{font-size:14px;color:#587067}progress{display:block;width:100%;height:10px;accent-color:#2d7864}.progress-caption{font-size:13px;color:#587067;margin:7px 0 0}.filters{position:sticky;top:0;z-index:2;background:#f4f5eff5;border-block:1px solid #dae3da}.filter-inner{padding-top:12px;padding-bottom:12px;display:grid;grid-template-columns:1fr 1fr 2fr;gap:10px 14px}label{font-size:14px;font-weight:650;min-width:0}select,input[type=search]{display:block;width:100%;min-width:0;padding:10px;margin-top:4px;border:1px solid #b5c8be;border-radius:8px;background:#fff;color:#223b34;font:inherit}.check{grid-column:1/-1;display:flex;gap:8px;align-items:center;font-weight:500}.check input{width:17px;height:17px;accent-color:#2d7864}.summary{color:#587067;margin-bottom:16px}.profile{border:1px solid #cddcd2;border-radius:12px;padding:18px;background:#eaf1e9;margin-bottom:18px}.profile h2{font-size:20px}.profile p:last-child{margin-bottom:0}.voices{margin-bottom:22px}.voices summary{cursor:pointer;color:#2b6756;font-weight:650;padding:8px 0}.voice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:8px}.voice-card{background:#fff;border:1px solid #dce5dc;border-radius:10px;padding:14px}.voice-card h3{font-size:17px}.voice-card p{font-size:14px}.voice-card p:last-child{margin-bottom:0;color:#587067}.lines{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.line{min-width:0;background:#fff;border:1px solid #dbe4db;border-radius:12px;padding:18px}.line.pending{background:#fafbf7}.line-head{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.line h2{font-size:22px;line-height:1.35;overflow-wrap:anywhere;margin-bottom:6px}.badge{font-size:12px;white-space:nowrap;padding:3px 9px;border-radius:20px;background:#e6f1e9;color:#25634f}.pending .badge{background:#ecefe8;color:#69746b}.meta{font-size:13px;color:#587067}.reading{font-size:18px;font-weight:650}.direction{font-size:14px}.status{font-size:13px;color:#79622c;margin-top:8px}.empty{grid-column:1/-1;text-align:center;padding:40px 16px;border:1px dashed #bacbbf;border-radius:12px}.id{display:block;font-size:12px;color:#6c8075;overflow-wrap:anywhere;margin-top:10px}audio{display:block;width:100%;max-width:100%;height:40px;margin-top:14px}footer{font-size:13px;color:#63796d;margin-top:24px}@media(max-width:650px){header,main,.filter-inner{padding-left:16px;padding-right:16px}header{padding-top:20px}.filter-inner{grid-template-columns:repeat(2,minmax(0,1fr))}.search{grid-column:1/-1}.stats{gap:8px}.stat{padding:12px 10px}.stat strong{font-size:25px}.stat span{font-size:12px}.lines,.voice-grid{grid-template-columns:minmax(0,1fr)}.line{padding:16px}.notice{font-size:14px}.profile{padding:14px}}
</style></head><body>
<header><div class="eyebrow">修仙模式 · 角色語音</div><h1>十位道友・語音試聽</h1><p>各自的聲線、各自的招式。完成的音檔可在下方逐句試聽。</p><p class="notice">製作完成代表音檔已建立，並已核對檔案與台詞版本。字音、情緒、重音和停頓仍須聽感核對；此頁不會自動播放。</p><div class="stats"><div class="stat"><strong id="completed"></strong><span>已製作，可試聽</span></div><div class="stat"><strong id="pending"></strong><span>尚未製作</span></div><div class="stat"><strong id="expected"></strong><span>完整台詞</span></div></div><progress id="progress" aria-label="語音製作進度"></progress><p class="progress-caption" id="progress-caption"></p></header>
<section class="filters" aria-label="試聽篩選"><div class="filter-inner"><label>角色<select id="hero"><option value="all">全部角色</option></select></label><label>類別<select id="action"><option value="all">全部類別</option></select></label><label class="search">搜尋招式、角色或技能 ID<input id="search" type="search" placeholder="例如：劍火留燼、赤綾、W.chow.123"></label><label class="check"><input id="completed-only" type="checkbox" checked>只看已完成、可試聽的音檔</label></div></section>
<main><section id="profile" class="profile" aria-label="角色演出"></section><details class="voices"><summary>查看十位角色的聲線與演出</summary><div id="voices" class="voice-grid"></div></details><p id="summary" class="summary" aria-live="polite"></p><div id="list" class="lines"></div><footer id="footer"></footer></main>
<script id="payload" type="application/json">${payload}</script><script>
'use strict';
const data=JSON.parse(document.getElementById('payload').textContent),info=data.progress;
const hero=document.getElementById('hero'),action=document.getElementById('action'),search=document.getElementById('search'),completedOnly=document.getElementById('completed-only'),list=document.getElementById('list'),profile=document.getElementById('profile');
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
document.getElementById('completed').textContent=info.completed.toLocaleString();document.getElementById('pending').textContent=info.pending.toLocaleString();document.getElementById('expected').textContent=info.expected.toLocaleString();
const progress=document.getElementById('progress');progress.max=info.expected;progress.value=info.completed;document.getElementById('progress-caption').textContent='製作進度 '+(info.completed/info.expected*100).toFixed(1)+'% · 人工字音核對 '+info.textVerifiedCount+' 項 · 人工聽感核對 '+info.listeningVerifiedCount+' 項';
for(const h of info.heroes){const option=el('option',h.name+'・'+h.role+'（'+h.completed+'/'+h.expected+'）');option.value=h.heroId;hero.append(option);const card=el('article',undefined,'voice-card');card.append(el('h3',h.name+'・'+h.role),el('p','聲線：'+h.voice+'｜已製作 '+h.completed+'/'+h.expected),el('p',h.delivery));document.getElementById('voices').append(card);}
for(const [value,label]of Object.entries(data.actions)){const option=el('option',label);option.value=value;action.append(option);}
function render(){const query=search.value.trim().toLowerCase(),selected=info.heroes.find(h=>h.heroId===hero.value);profile.replaceChildren();if(selected){profile.append(el('h2',selected.name+'・'+selected.role),el('p','聲線：'+selected.voice+'｜已製作 '+selected.completed+'/'+selected.expected),el('p',selected.delivery));}else{profile.append(el('h2','十位角色，十種演出'),el('p','選擇角色可查看專屬聲線與念法；也可展開下方完整角色資料。'));}
const rows=data.rows.filter(row=>(hero.value==='all'||row.heroId===hero.value)&&(action.value==='all'||row.action===action.value)&&(!completedOnly.checked||row.completed)&&(!query||[row.hero,row.role,row.voice,row.id,row.name,row.category,row.cue].join(' ').toLowerCase().includes(query)));
document.getElementById('summary').textContent='顯示 '+rows.length+' 項，其中 '+rows.filter(row=>row.completed).length+' 項可試聽。';const fragment=document.createDocumentFragment();
for(const row of rows){const card=el('article',undefined,'line'+(row.completed?'':' pending'));const head=el('div',undefined,'line-head');head.append(el('h2',row.name),el('span',row.completed?'製作完成':'尚未製作','badge'));card.append(head,el('p',row.hero+'・'+row.role+'｜'+row.voice+'｜'+row.category+(row.cue?'・'+row.cue:''),'meta'),el('p','朗讀：'+row.text,'reading'),el('p','念法：'+row.direction,'direction'));if(row.completed){const audio=el('audio');audio.controls=true;audio.preload='none';audio.src=row.audio;audio.setAttribute('aria-label',row.hero+'・'+row.name+' 試聽');card.append(audio,el('p',(row.textContentVerified?'內容已核對':'字音待核對')+' · '+(row.humanListeningVerified?'聽感已核對':'待聽感核對')+' · '+row.durationSeconds.toFixed(2)+' 秒','status'));}else{card.append(el('p','此句尚未製作，完成後可於此試聽。','status'));}card.append(el('code',row.heroId+' / '+row.id,'id'));fragment.append(card);}
if(!rows.length)fragment.append(el('p',completedOnly.checked?'目前篩選沒有可試聽音檔。可取消「只看已完成」查看待製作台詞。':'沒有符合的台詞，請調整篩選條件。','empty'));list.replaceChildren(fragment);}
hero.addEventListener('change',render);action.addEventListener('change',render);search.addEventListener('input',render);completedOnly.addEventListener('change',render);document.addEventListener('play',event=>{if(event.target.tagName==='AUDIO'){for(const audio of document.querySelectorAll('audio'))if(audio!==event.target)audio.pause();}},true);
document.getElementById('footer').textContent='進度快照：'+new Date(info.generatedUtc).toLocaleString('zh-TW')+'。本頁隨製作紀錄重新建立；不以音檔存在代替聽感驗收。';render();
</script></body></html>\n`;
}

function save(target, contents, stamp) {
  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, 'utf8') === contents) return;
    const backupDir = path.join(root, '.local-backups/hero-skill-audio-review');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(target, path.join(backupDir, path.basename(target) + '.bak.' + stamp), fs.constants.COPYFILE_EXCL);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = target + '.tmp.' + process.pid;
  fs.writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(temporary, target);
}

const mode = process.argv[2] || '--write';
assert.ok(['--write', '--check'].includes(mode), 'Usage: node tools/build-hero-skill-audio-review.cjs [--write|--check]');
const data = collect();
const page = html(data);
assert.ok(!forbiddenTerms.test(page), 'Listening page contains non-cultivation terms');
assert.ok(!/\sautoplay(?:[\s=>]|$)/iu.test(page), 'Autoplay must remain disabled');
if (mode === '--write') {
  const stamp = data.progress.generatedUtc.replace(/[:.]/g, '-') + '-' + process.pid;
  save(previewPath, page, stamp);
  save(progressPath, JSON.stringify(data.progress, null, 2) + '\n', stamp);
} else {
  const saved = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.ok(Number.isFinite(Date.parse(saved.generatedUtc)), 'Invalid progress timestamp');
  data.progress.generatedUtc = saved.generatedUtc;
  assert.deepEqual(saved, data.progress, 'Audio progress changed; rebuild with --write');
  assert.equal(fs.readFileSync(previewPath, 'utf8'), html(data), 'Listening page is out of date; rebuild with --write');
}
console.log(JSON.stringify({ status: 'passed', mode, expected: data.progress.expected, completed: data.progress.completed, pending: data.progress.pending, textVerifiedCount: data.progress.textVerifiedCount, listeningVerifiedCount: data.progress.listeningVerifiedCount, preview: path.relative(root, previewPath), progress: path.relative(root, progressPath) }));
