/* Validate the voice script and render its Markdown/local browsing copy.
 * Never generates audio or loads the script into the game.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const skills = require('../cultivation-skills.js');
const finishers = require('../cultivation-finishers.js');
const heroes = require('../cultivation-heroes.js');
const inputPath = path.join(root, 'docs/CULTIVATION_HERO_VOICE_SCRIPT.json');
const markdownPath = path.join(root, 'docs/CULTIVATION_HERO_VOICE_SCRIPT.md');
const previewPath = path.join(root, 'artifacts/hero-voice-review.html');
const actions = { chow: '引氣', pong: '聚靈', exposed: '開陣', concealed: '藏陣', added: '續陣', flower: '補花', formation: '普通花陣', finish: '終式' };
const cues = ['chow', 'pong', 'exposed', 'concealed', 'added', 'win', 'self-draw', 'rob-kong'];
const cueNames = { ...actions, win: '決勝', 'self-draw': '天成', 'rob-kong': '截陣' };
const families = { W: '赤晶', T: '靈珠', B: '飛劍', honor: '字牌', flower: '花牌', formation: '花陣' };
const excluded = new Set(['finish.hu', 'formation.seven', 'formation.eight']);
const catalog = [
  ...skills.all.filter(s => !excluded.has(s.id)),
  ...finishers.all.map(s => ({ ...s, id: 'finisher:' + s.id, action: 'finish', family: 'finish', combo: s.label }))
];
const byId = new Map(catalog.map(s => [s.id, s]));
const counts = Object.fromEntries(Object.keys(actions).map(action => [action, catalog.filter(s => s.action === action).length]));
const expectedCounts = { chow: 21, pong: 34, exposed: 34, concealed: 34, added: 34, flower: 8, formation: 2, finish: 38 };

function check(data) {
  assert.deepEqual(counts, expectedCounts, '技能目錄已變動，請重新確認審稿範圍');
  assert.equal(catalog.length, 205);
  assert.equal(data.schemaVersion, 1);
  assert.ok(['draft-awaiting-text-review', 'text-approved'].includes(data.status), '未知文字審閱狀態');
  if (data.status === 'text-approved') {
    assert.equal(data.approval?.source, 'user', '已核准文字須附使用者核准紀錄');
    assert.match(data.approval.date, /^\d{4}-\d{2}-\d{2}$/u, '缺少核准日期');
    assert.ok(typeof data.approval.statement === 'string' && data.approval.statement.trim(), '缺少核准原句');
    assert.equal(data.approval.heroesSha256, createHash('sha256').update(JSON.stringify(data.heroes)).digest('hex'), '已核准台詞內容已變動，請重新確認核准範圍');
  }
  assert.equal(data.locale, 'zh-TW');
  assert.equal(data.heroes.length, 10);
  assert.deepEqual(data.heroes.map(h => h.heroId), heroes.all.map(h => h.id));
  for (const hero of data.heroes) {
    const source = heroes.get(hero.heroId);
    assert.equal(hero.name, source.name);
    assert.equal(hero.role, source.role);
    assert.ok(typeof hero.delivery === 'string' && hero.delivery.trim());
    assert.ok(!/吃|碰|槓|胡|自摸|副露/u.test(hero.delivery), hero.name + ' 演出方向須使用修仙用語');
    assert.equal(hero.lines.length, 205, hero.name + ' 技能數');
    assert.deepEqual(hero.lines.map(l => l.skillId), catalog.map(s => s.id), hero.name + ' ID 覆蓋與順序');
    assert.equal(new Set(hero.lines.map(l => l.name)).size, 205, hero.name + ' 角色內重名');
    assert.deepEqual(hero.calls.map(c => c.cue), cues, hero.name + ' 基本動作');
    for (const line of hero.lines) {
      const label = hero.name + '/' + line.skillId;
      assert.match(line.name, /^\p{Script=Han}{4,6}$/u, label + ' 四至六字名稱');
      assert.notEqual(line.name, byId.get(line.skillId).name, label + ' 不照抄原名');
      assert.equal(line.reading.replace(/[，。！？、…\s—]/gu, ''), line.name, label + ' 朗讀與名稱不符');
      assert.ok(typeof line.direction === 'string' && line.direction.trim(), label + ' 缺念法');
      for (const text of [line.name, line.reading, line.direction]) {
        assert.ok(!/吃|碰|槓|胡|自摸|副露/u.test(text), label + ' 台詞與念法須使用修仙用語');
        assert.ok(!/[\r\n|<>]/u.test(text), label + ' 非預期標記');
        assert.ok(!/TODO|TBD|待填|\{.*\}|undefined/u.test(text), label + ' 未完成內容');
      }
    }
    for (const call of hero.calls) {
      assert.ok(typeof call.text === 'string' && call.text.trim(), hero.name + ' 空白喊聲');
      assert.ok(typeof call.direction === 'string' && call.direction.trim(), hero.name + ' 空白喊聲念法');
      assert.ok(!/[\r\n|<>]/u.test(call.text + call.direction));
      assert.ok(!/吃|碰|槓|胡|自摸|副露/u.test(call.text + call.direction), hero.name + ' 基本喊聲須使用修仙用語');
    }
    assert.ok(!/[一二三四五六七八九十\d]|赤晶|靈珠|飛劍|青龍|曜陽|白虎|玄武|赤鳳|神木|玄玉/u.test(hero.calls.find(c => c.cue === 'concealed').text), hero.name + ' 藏陣通用喊聲不可透露牌面');
  }
  for (const skill of catalog) assert.equal(new Set(data.heroes.map(h => h.lines.find(l => l.skillId === skill.id).name)).size, 10, skill.id + ' 同招跨角色重名');
  for (const cue of cues) assert.equal(new Set(data.heroes.map(h => h.calls.find(c => c.cue === cue).text)).size, 10, cue + ' 同動作跨角色喊聲重複');
  const representatives = {
    'shen-gufeng': ['B.chow.123', '孤鋒三疊'], 'chi-ling': ['W.chow.123', '赤蓮焚野'],
    'mu-canglan': ['T.chow.123', '滄瀾疊浪'], 'su-lingheng': ['T.chow.234', '靈雨續脈'],
    'yue-zhenshan': ['B.chow.234', '金罡撼岳'], 'luo-xuanyu': ['T.chow.567', '滄玉護元'],
    'tie-wujiu': ['W.chow.567', '熾甲回鋒'], 'ye-shuying': ['B.chow.678', '無聲掠影'],
    'yun-zhiwei': ['T.chow.678', '寒符截咒'], 'hua-jianlu': ['W.chow.456', '丹華回元']
  };
  for (const hero of data.heroes) {
    const [id, name] = representatives[hero.heroId];
    assert.equal(hero.lines.find(l => l.skillId === id).name, name, hero.name + ' 已確認代表方向');
  }
}

function condition(skill) {
  if (skill.action === 'concealed') return '限自身藏陣或結算公開後；對手局中改用本角色通用藏陣喊聲，名稱／字幕／紀錄同樣保密。';
  if (skill.id === 'finisher:seven' || skill.id === 'finisher:eight') return '花陣決勝成立時；與 formation.' + (skill.id.endsWith('seven') ? 'seven' : 'eight') + ' 共用本行，不重複播報。';
  if (skill.action === 'finish') return '本台型終式段落實際發動時；依遊戲原有成立條件，不因台詞另加效果。';
  if (skill.action === 'flower' || skill.action === 'formation') return '支援於實際生效時、攻擊於持有者回合實際施放時；不因摸花或查閱而重播。';
  if (skill.action === 'added') return '續陣成功且未被截陣決勝時；不重播先前聚靈招式。';
  return '合法' + actions[skill.action] + '成功、技能實際發動時；查閱已施法印不重播。';
}
function sourceLabel(skill) {
  return skill.action === 'finish' ? skill.label : (families[skill.family] || skill.family) + '／' + skill.combo;
}
function scriptRows(hero) {
  return [
    ...hero.calls.map(call => ({ heroId: hero.heroId, hero: hero.name, role: hero.role, action: 'call', category: '基本喊聲', id: 'call:' + call.cue, source: cueNames[call.cue], name: call.text.replace(/[。！]/g, ''), reading: call.text, direction: call.direction, condition: call.cue === 'concealed' ? '對手藏陣保密或通用動作播報；不報牌面，不新增技能。' : '基本動作／未取得具體招式時的通用稿；不與同次具體招式重複喊。', description: '此句為角色動作喊聲，沒有獨立傷害或技能效果。' })),
    ...hero.lines.map(line => {
      const skill = byId.get(line.skillId);
      return { heroId: hero.heroId, hero: hero.name, role: hero.role, action: skill.action, category: actions[skill.action], id: skill.id, source: skill.name, name: line.name, reading: line.reading, direction: line.direction, condition: condition(skill), description: skill.description, recipe: sourceLabel(skill) };
    })
  ];
}
function markdown(data) {
  const approved = data.status === 'text-approved';
  const revision = data.approval?.revisionAuthorization;
  const revisedCalls = revision?.modifiedCallsNotSeparatelyReviewed === true;
  const out = [
    '# 修仙模式・十角色專屬招式台詞審閱稿', '',
    approved ? '> 狀態：文字已於 ' + data.approval.date + ' 經使用者核准。音檔與遊戲整合狀態請見[驗證紀錄](verification/HERO_SKILL_VOICE_VERIFICATION.md)；本工具僅更新文字文件與預覽。' : '> 狀態：完整文字草案，等待使用者審閱。尚未生成音效，尚未接入遊戲名稱、字幕或播放流程。', '',
    '本稿共 **2,130 項**：205 種正式技能 × 10 位角色＝2,050 組，加上每人 8 句基本喊聲＝80 句。每位角色都有全部技能；名稱改編不改變技能屬性、數值、效果或成立條件。', '',
    ...(revisedCalls ? [`核准後修訂：依使用者最新修正要求，80 句基本喊聲中有 ${revision.changedCalls} 句改用仙術用語；修改句未另行逐句審閱。2,050 招式台詞維持原核准版本。`, ''] : []),
    '## 如何審閱', '',
    '- 先看角色的演出方向，再按「基本喊聲 → 引氣 → 聚靈 → 開陣 → 藏陣 → 續陣 → 補花 → 普通花陣 → 終式」查閱。',
    '- 「朗讀全文」才是實際要念的內容；「念法」與「觸發／保密」為製作指示，不念出。',
    '- 每行以角色 ID＋技能 ID 唯一對應。回覆角色、原名或技能 ID，以及想改的名稱即可精確修訂。',
    '- 角色名字中的劍、針、花、甲等是演出意象；原招式屬性與下方效果核對表才是實際機制。名稱不承諾額外復活、秒殺、群補或控制效果。',
    '- 對手局中藏陣只用該角色的通用藏陣喊聲；精確招式名、字幕及紀錄都要保密。自身藏陣與結算公開後才可使用具體名稱。',
    '- 已施法印查閱不觸發語音或技能。補花攻擊待實際施放才播報；決勝按實際終式段落對應，不把所有台型一次播放。',
    approved ? '- 音效依已核准招式與最新修正要求製作；沿用既有角色聲線，依各流派特色與逐句念法演出。製作證據與遊戲整合結果另見驗證紀錄。' : '- 全文確認後才進行音效製作與遊戲整合；預設沿用既有角色聲線，另依本稿演出。', '',
    '## 覆蓋範圍與來源', '',
    '| 類別 | 每位角色 | 十位合計 |', '|---|---:|---:|',
    ...Object.entries(counts).map(([a,n]) => `| ${actions[a]} | ${n} | ${n * 10} |`),
    '| 基本喊聲 | 8 | 80 |', '| 合計 | 213 | 2,130 |', '',
    '正式資料來源：`cultivation-heroes.js`、`cultivation-skills.js`、`cultivation-finishers.js`。`finish.hu`（舊五行歸一）不列正式稿；`formation.seven/eight` 分別對應 `finisher:seven/eight`，花陣決勝各只計一次。普通花陣與決勝終式中的四季／四君子台型仍是不同技能。技術識別碼及末尾原技能效果核對表保留來源用語；玩家預覽使用修仙稱呼。', '',
    '文字來源是同目錄的 `CULTIVATION_HERO_VOICE_SCRIPT.json`。修改 JSON 後執行 `node tools/build-hero-voice-script.cjs --write` 更新此文件；執行 `--check` 可核對覆蓋、重名、字數、朗讀內容與文件同步。', '',
    '## 角色目錄', '',
    '| 角色 | 流派 | 演出方向 |', '|---|---|---|',
    ...data.heroes.map(h => `| [${h.name}](#${h.heroId}) | ${h.role} | ${h.delivery} |`), ''
  ];
  for (const hero of data.heroes) {
    out.push(`<a id="${hero.heroId}"></a>`, '', `## ${hero.name}｜${hero.role}`, '', `角色 ID：\`${hero.heroId}\`。${hero.delivery}`, '', revisedCalls ? '本角色包含 205 招已核准招式＋8 句基本喊聲；喊聲依最新修正要求使用仙術用語。' : approved ? '本角色文字已核准，共 205 招＋8 句基本喊聲。' : '每句皆為待審草案；本角色共 205 招＋8 句基本喊聲。', '');
    for (const [action, title] of [['call', '基本喊聲'], ...Object.entries(actions)]) {
      const rows = scriptRows(hero).filter(r => r.action === action);
      out.push(`### ${hero.name}・${title}（${rows.length}）`, '', '| 技能／動作 ID | 原名／動作 | 專屬名稱 | 朗讀全文 | 念法 | 觸發／保密 |', '|---|---|---|---|---|---|');
      for (const row of rows) out.push(`| \`${row.id}\` | ${row.source} | ${row.name} | ${row.reading} | ${row.direction} | ${row.condition} |`);
      out.push('');
    }
  }
  out.push('## 原技能效果核對表（205 招）', '', '本表直接取自目前遊戲資料，只供審稿核對；角色專屬命名不得擴張這些效果。', '', '| 技能 ID | 分類／牌組或台型 | 原名 | 原效果 |', '|---|---|---|---|');
  for (const skill of catalog) out.push(`| \`${skill.id}\` | ${actions[skill.action]}／${sourceLabel(skill)} | ${skill.name} | ${skill.description} |`);
  out.push('');
  return out.join('\n');
}

function preview(data) {
  const approved = data.status === 'text-approved';
  const revision = data.approval?.revisionAuthorization;
  const rows = data.heroes.flatMap(scriptRows).map(row => ({
    ...row,
    description: row.description.replace(/花胡/g, '花陣決勝').replace(/胡牌/g, '決勝').replace(/自摸/g, '天成').replace(/槓/g, '開陣'),
    recipe: row.action === 'finish' ? row.source : row.recipe
  }));
  for (const row of rows) assert.ok(!/吃|碰|槓|胡|自摸|副露/u.test(JSON.stringify(row)), row.id + ' 玩家預覽須使用修仙用語');
  const payload = JSON.stringify({ heroes: data.heroes.map(({heroId,name,role,delivery}) => ({heroId,name,role,delivery})), rows, actions }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>修仙角色台詞・全文審閱</title>
<style>
:root{font-family:system-ui,"Microsoft JhengHei",sans-serif;color:#23302e;background:#f5f5ef;font-size:16px;line-height:1.65}*{box-sizing:border-box}body{margin:0}header,main{max-width:1160px;margin:auto;padding:24px}header{padding-bottom:12px}h1{font-size:clamp(24px,4vw,36px);margin:8px 0}p{margin:8px 0}.eyebrow{color:#347366;font-weight:700;letter-spacing:.12em}.notice{border-left:4px solid #9b762b;padding:10px 16px;background:#fff9e9}.filters{position:sticky;top:0;z-index:1;background:#f5f5eff5;border-bottom:1px solid #d5ded7;padding:12px 24px}.controls{max-width:1112px;margin:auto;display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px}label{font-size:14px;font-weight:650}input,select{display:block;width:100%;min-width:0;margin-top:4px;padding:10px;border:1px solid #b2c4bc;border-radius:8px;background:white;color:#23302e;font:inherit}.summary{margin:0 0 20px;color:#47625b}article{background:white;border:1px solid #dce4dd;border-radius:12px;padding:18px 20px;margin-bottom:12px}.line-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.line-head h2{margin:0;font-size:22px;color:#215b4f}.badge{white-space:nowrap;font-size:13px;background:#eaf2ee;border-radius:18px;padding:3px 10px}.original{color:#536c63;font-size:14px}.reading{font-weight:650;font-size:19px}.direction{margin-bottom:8px}.privacy{color:#7b5d20;font-size:14px}details{border-top:1px solid #edf0eb;margin-top:10px;padding-top:8px}summary{cursor:pointer;color:#47625b}code{font-size:13px;overflow-wrap:anywhere}.empty{padding:40px;text-align:center}footer{color:#536c63;padding:20px 0}@media(max-width:650px){header,main{padding:16px}.filters{padding:10px 16px}.controls{grid-template-columns:1fr 1fr;gap:8px}.search{grid-column:1/-1}article{padding:14px}.line-head h2{font-size:21px}.badge{font-size:12px}.notice{font-size:14px}}
</style><header><div class="eyebrow">修仙模式 · ${approved ? '文字已核准' : '文字草案'}</div><h1>十位道友，各有其聲</h1><p>完整 2,130 項台詞：2,050 組招式＋80 句基本喊聲。</p><p class="notice">${approved ? '文字已核准；音檔與遊戲整合狀態以驗證紀錄為準。念法與保密說明不會被朗讀。' : '等待你審閱文字。尚未生成音效；念法與保密說明不會被朗讀。'}${revision?.modifiedCallsNotSeparatelyReviewed === true ? ` 其中 ${revision.changedCalls} 句基本喊聲依最新要求改用仙術用語，未另行逐句審閱；2,050 招式台詞維持原核准版本。` : ''}</p></header>
<div class="filters"><div class="controls"><label>角色<select id="hero" aria-label="角色"></select></label><label>類別<select id="action" aria-label="類別"><option value="all">全部類別</option><option value="call">基本喊聲</option></select></label><label class="search">搜尋原名、專屬名或技能 ID<input id="search" type="search" placeholder="例如：星火燎原、藏陣、B.chow.123"></label></div></div>
<main><p id="summary" class="summary" aria-live="polite"></p><p id="delivery"></p><div id="list"></div><footer>以角色＋技能 ID 回覆修改意見，即可精確對應。所有技能保留原效果；對手藏陣僅播通用喊聲。</footer></main>
<script id="payload" type="application/json">${payload}</script><script>
'use strict';const data=JSON.parse(document.getElementById('payload').textContent);const hero=document.getElementById('hero'),action=document.getElementById('action'),search=document.getElementById('search'),list=document.getElementById('list');
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
for(const h of data.heroes){const o=el('option',h.name+'・'+h.role);o.value=h.heroId;hero.append(o);}const all=el('option','全部角色');all.value='all';hero.append(all);
for(const [value,label]of Object.entries(data.actions)){const o=el('option',label);o.value=value;action.append(o);}
function render(){const q=search.value.trim().toLowerCase();const rows=data.rows.filter(r=>(hero.value==='all'||r.heroId===hero.value)&&(action.value==='all'||r.action===action.value)&&(!q||[r.hero,r.role,r.id,r.category,r.source,r.name,r.reading,r.recipe||''].join(' ').toLowerCase().includes(q)));document.getElementById('summary').textContent='顯示 '+rows.length+' 項／完整稿 2,130 項';const h=data.heroes.find(x=>x.heroId===hero.value);document.getElementById('delivery').textContent=h?h.delivery:'比較不同角色的同一招式：可搜尋原名或完整技能 ID。';const frag=document.createDocumentFragment();for(const r of rows){const card=el('article');const head=el('div',undefined,'line-head');head.append(el('h2',r.name),el('span',r.category,'badge'));card.append(head,el('p',r.hero+'・'+r.role+'｜原名：'+r.source,'original'),el('p','朗讀：'+r.reading,'reading'),el('p','念法：'+r.direction,'direction'),el('p',r.condition,'privacy'));const more=el('details');more.append(el('summary','核對原技能與識別碼'),el('p',r.description),el('code',r.heroId+' / '+r.id+(r.recipe?' / '+r.recipe:'')));card.append(more);frag.append(card);}if(!rows.length)frag.append(el('p','沒有符合的台詞，請調整角色、類別或搜尋文字。','empty'));list.replaceChildren(frag);}
hero.addEventListener('change',render);action.addEventListener('change',render);search.addEventListener('input',render);render();
</script></html>\n`;
}

const mode = process.argv[2] || '--check';
assert.ok(['--write', '--check'].includes(mode), '用法：node tools/build-hero-voice-script.cjs [--write|--check]');
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
check(data);
const md = markdown(data);
if (mode === '--write') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(root, '.local-backups/hero-voice-script');
  fs.mkdirSync(backupDir, {recursive:true});
  for (const [target, content] of [[markdownPath, md], [previewPath, preview(data)]]) {
    if (fs.existsSync(target)) {
      if (fs.readFileSync(target, 'utf8') === content) continue;
      fs.copyFileSync(target, path.join(backupDir, path.basename(target) + '.bak.' + stamp), fs.constants.COPYFILE_EXCL);
    }
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.writeFileSync(target, content, 'utf8');
  }
} else {
  assert.equal(fs.readFileSync(markdownPath, 'utf8'), md, '審閱文件與來源不同步，請執行 --write');
  if (fs.existsSync(previewPath)) assert.equal(fs.readFileSync(previewPath, 'utf8'), preview(data), '本機審閱頁與來源不同步，請執行 --write');
}
console.log(JSON.stringify({status:'passed',mode,heroes:10,skillsPerHero:205,skillLines:2050,basicCalls:80,total:2130,categories:counts,reviewStatus:data.status,audioGeneration:'not-performed-by-this-tool',gameIntegration:'not-performed-by-this-tool'}));
