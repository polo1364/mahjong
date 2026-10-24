const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const catalog = require('../hero-voices.js');

test('680 hero clips match the approved voices, complete contracts and uniform loudness', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root,'art-source/audio/voice-heroes-v1/contract.json'),'utf8'));
  const expected = contract.lines.map(l=>l.id).sort();
  const hashes = new Set();
  assert.equal(expected.length,68);
  assert.equal(contract.lines.find(l=>l.id==='ready').text,'凝神');
  assert.equal(contract.lines.find(l=>l.id==='flower').text,'靈華');
  for(const hero of catalog.all){
    const manifest=JSON.parse(fs.readFileSync(path.join(root,`art-source/audio/voice-heroes-v1/${hero.id}/manifest.json`),'utf8'));
    assert.equal(manifest.voiceId,hero.voiceId);
    assert.deepEqual(manifest.clips.map(c=>c.id).sort(),expected);
    for(const clip of manifest.clips){
      assert.equal(clip.text,contract.lines.find(l=>l.id===clip.id).text);
      const filename=path.join(root,clip.file);
      const hash=crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
      assert.equal(hash,clip.sha256);
      assert.ok(!hashes.has(hash),'No substituted or duplicate audio: '+clip.file);hashes.add(hash);
      assert.equal(clip.levels.clipped_samples,0);
      assert.ok(clip.after.input_tp<=-1.5,clip.file+' peak');
      assert.ok(Math.abs(clip.after.input_i+20.5)<=.4,clip.file+' loudness');
      assert.ok(clip.levels.duration_seconds>.15&&clip.levels.duration_seconds<5,clip.file+' duration');
    }
  }
  assert.equal(hashes.size,680);
});
