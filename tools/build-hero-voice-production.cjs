/* Prepare approved spoken text for ElevenLabs. This tool never submits generation. */
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const voices = require('../hero-voices.js');
const skills = require('../cultivation-skills.js');
const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'docs/CULTIVATION_HERO_VOICE_SCRIPT.json');
const outputPath = path.join(root, 'art-source/audio/voice-hero-skills-v1');
const contractPath = path.join(outputPath, 'contract.json');
const separator = '\n[pause]\n';

// Each row keeps its character's timbre while varying the delivery with the skill.
// These short tags direct the voice; the Chinese production notes are never spoken.
const profiles = {
  'shen-gufeng': { base: 'steady, crisp', soft: 'steady, gentle', guard: 'steady, grounded', charge: 'steady, restrained', attack: 'steady, firm', finish: 'steady, decisive', secret: 'low, crisp' },
  'chi-ling': { base: 'bright, confident', soft: 'bright, warm', guard: 'bright, firm', charge: 'bright, building', attack: 'bright, bold', finish: 'bright, triumphant', secret: 'soft, confident' },
  'mu-canglan': { base: 'warm, flowing', soft: 'warm, soothing', guard: 'warm, grounded', charge: 'warm, building', attack: 'flowing, firm', finish: 'flowing, decisive', secret: 'soft, flowing' },
  'su-lingheng': { base: 'gentle, precise', soft: 'gentle, soothing', guard: 'gentle, assured', charge: 'gentle, restrained', attack: 'precise, firm', finish: 'gentle, resolute', secret: 'soft, precise' },
  'yue-zhenshan': { base: 'deep, weighty', soft: 'deep, relaxed', guard: 'deep, grounded', charge: 'deep, restrained', attack: 'deep, forceful', finish: 'deep, emphatic', secret: 'low, weighty' },
  'luo-xuanyu': { base: 'calm, clear', soft: 'calm, gentle', guard: 'calm, firm', charge: 'calm, measured', attack: 'calm, commanding', finish: 'calm, decisive', secret: 'low, composed' },
  'tie-wujiu': { base: 'rich, grounded', soft: 'rich, relaxed', guard: 'rich, firm', charge: 'rich, restrained', attack: 'rich, forceful', finish: 'rich, decisive', secret: 'low, grounded' },
  'ye-shuying': { base: 'hushed, clear', soft: 'hushed, gentle', guard: 'hushed, firm', charge: 'hushed, restrained', attack: 'hushed, crisp', finish: 'hushed, decisive', secret: 'hushed, close' },
  'yun-zhiwei': { base: 'refined, measured', soft: 'refined, gentle', guard: 'refined, assured', charge: 'refined, restrained', attack: 'refined, commanding', finish: 'refined, decisive', secret: 'soft, measured' },
  'hua-jianlu': { base: 'sweet, light', soft: 'sweet, gentle', guard: 'sweet, assured', charge: 'sweet, restrained', attack: 'sweet, crisp', finish: 'sweet, resolute', secret: 'soft, airy' }
};

function digest(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function styleFor(line) {
  if (line.id === 'call:concealed') return 'secret';
  if (line.id.startsWith('finisher:') || ['call:win', 'call:self-draw'].includes(line.id)) return 'finish';
  if (line.id === 'call:rob-kong' || line.id === 'call:exposed') return 'attack';
  const skill = skills.get(line.id);
  const effects = skill?.effects || [];
  // Self recovery and defensive skills retain their softer/steadier instruction,
  // including mixed attack-and-heal skills. No element or gameplay effect changes.
  if (effects.some(e => e.op === 'heal') || /回復|回落|暖收|柔緩收回|順氣|柔和|舒展氣息/.test(line.direction)) return 'soft';
  if (effects.some(e => e.op === 'shield') || /守穩|守住|護持|沉穩不動/.test(line.direction)) return 'guard';
  if (/蓄勢|蓄住|凝神|留下可再發力|下一擊|蓄氣|內斂|不泄力/.test(line.direction)) return 'charge';
  if (effects.some(e => ['damage', 'dot', 'mark', 'control', 'debuff'].includes(e.op)) || /發力|加壓|咬實|俐落|乾脆/.test(line.direction)) return 'attack';
  return 'base';
}

function build(sourceText) {
  const source = JSON.parse(sourceText);
  assert.equal(source.schemaVersion, 1);
  assert.equal(source.locale, 'zh-TW');
  assert.equal(source.status, 'text-approved', '必須先由使用者核准台詞');
  assert.equal(source.approval?.heroesSha256, digest(JSON.stringify(source.heroes)), '已核准台詞內容已變動');
  assert.equal(source.heroes.length, 10);
  const heroes = source.heroes.map(hero => {
    const voice = voices.get(hero.heroId);
    assert.ok(voice && profiles[hero.heroId], '缺少已核准聲線：' + hero.heroId);
    assert.equal(voice.name, hero.name);
    const lines = [
      ...hero.calls.map(call => ({ id: 'call:' + call.cue, text: call.text, direction: call.direction })),
      ...hero.lines.map(line => ({ id: line.skillId, text: line.reading, direction: line.direction }))
    ].map(line => ({ ...line, taggedText: '[' + profiles[hero.heroId][styleFor(line)] + ' voice] ' + line.text }));
    assert.equal(lines.length, 213, hero.name + ' 項數');
    assert.equal(new Set(lines.map(line => line.id)).size, 213, hero.name + ' ID 重複');
    for (const line of lines) {
      assert.ok(!/[吃碰槓杠胡]|自摸/u.test(line.text), hero.name + '/' + line.id + ' 修仙朗讀不得使用傳統麻將動作詞');
      assert.equal(line.taggedText.replace(/\[[a-z, ]+\] /g, ''), line.text, '標記剝除後必須完全等於原朗讀全文');
      assert.ok(!/[\r\n<>]/.test(line.taggedText), '禁止 SSML 或意外換行');
    }
    const batch = (id, rows) => ({ id, lines: rows, text: rows.map(line => line.taggedText).join(separator) });
    const batches = [batch('pilot', lines.slice(0, 10))];
    for (let start = 10, index = 1; start < lines.length; start += 50, index++) {
      batches.push(batch('skills-' + String(index).padStart(2, '0'), lines.slice(start, start + 50)));
    }
    for (const item of batches) assert.ok(item.text.length < 10000, hero.name + '/' + item.id + ' 超過 UI 字數上限');
    return { heroId: hero.heroId, name: hero.name, role: hero.role, voiceId: voice.voiceId, voice: voice.voice, delivery: hero.delivery, batches };
  });
  const contract = {
    schemaVersion: 1,
    sourceScriptSha256: digest(sourceText),
    sourceContentSha256: digest(JSON.stringify(source.heroes)),
    provider: 'ElevenLabs',
    model: 'eleven_v4',
    language: 'zh',
    separator,
    note: 'Voice tags guide delivery but require audio verification. Directions are silent production notes. Pilot lines are part of the final 2,130 items, never duplicate them in later batches.',
    heroes
  };
  const rows = heroes.flatMap(hero => hero.batches.flatMap(batch => batch.lines.map(line => hero.heroId + '/' + line.id)));
  assert.equal(rows.length, 2130);
  assert.equal(new Set(rows).size, 2130);
  assert.ok(heroes.reduce((total, hero) => total + hero.batches.reduce((n, batch) => n + batch.text.length, 0), 0) < 100000, '預估提交文字超過 100,000 字元');
  return contract;
}

function writeWithBackup(target, content) {
  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, 'utf8') === content) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(root, '.local-backups/hero-voice-production');
    fs.mkdirSync(backupDir, { recursive: true });
    const label = path.relative(outputPath, target).replace(/[\\/]/g, '--');
    fs.copyFileSync(target, path.join(backupDir, label + '.bak.' + stamp), fs.constants.COPYFILE_EXCL);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

const mode = process.argv[2] || '--check';
assert.ok(['--write', '--check'].includes(mode), '用法：node tools/build-hero-voice-production.cjs [--write|--check]');
const contract = build(fs.readFileSync(sourcePath, 'utf8'));
const outputs = [[contractPath, JSON.stringify(contract, null, 2) + '\n']];
for (const hero of contract.heroes) {
  for (const batch of hero.batches) outputs.push([path.join(outputPath, hero.heroId, 'batch-text-' + batch.id + '.txt'), batch.text]);
}
for (const [target, content] of outputs) {
  if (mode === '--write') writeWithBackup(target, content);
  else assert.equal(fs.readFileSync(target, 'utf8'), content, '製作契約不同步：' + path.relative(root, target));
}
console.log(JSON.stringify({
  status: 'passed', mode, totalLines: 2130, batchCount: 60,
  submissionCharacters: contract.heroes.reduce((sum, hero) => sum + hero.batches.reduce((n, batch) => n + batch.text.length, 0), 0),
  heroes: contract.heroes.map(hero => ({ heroId: hero.heroId, voice: hero.voice, lines: hero.batches.flatMap(batch => batch.lines).length, characters: hero.batches.reduce((n, batch) => n + batch.text.length, 0) })),
  audioGenerated: false
}));
