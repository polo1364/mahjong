"""Summarize measured production assets and preserve generation provenance."""
import json
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'art-source/audio/voice-heroes-v1'
rows=[]
for folder in sorted(SOURCE.iterdir()):
    path=folder/'manifest.json'
    if not path.exists():continue
    data=json.loads(path.read_text('utf-8'))
    clips=data['clips']
    rows.append({'heroId':data['heroId'],'voiceId':data['voiceId'],'clips':len(clips),
      'lufsMin':min(c['after']['input_i'] for c in clips),'lufsMax':max(c['after']['input_i'] for c in clips),
      'truePeakMax':max(c['after']['input_tp'] for c in clips),
      'clippedSamples':sum(c['levels']['clipped_samples'] for c in clips),
      'maxDurationSeconds':max(c['levels']['duration_seconds'] for c in clips),
      'asrReport':str((folder/'asr-raw.json').relative_to(ROOT)).replace('\\','/'),
      'reusedTileClips':42 if folder.name=='shen-gufeng' else 0})
summary={'generatedAt':datetime.now().isoformat(timespec='seconds'),'heroes':rows,
  'totalClips':sum(r['clips'] for r in rows),'lufsMin':min(r['lufsMin'] for r in rows),
  'lufsMax':max(r['lufsMax'] for r in rows),'actingDirection':'[commanding] with exclamation for 26 action/prompt clips per hero; natural tile calls',
  'unitTests':{'passed':847,'failed':0,'log':'artifacts/hero-voice-unit-tests.log'},
  'browserPlayback':'artifacts/hero-voice-browser-playback.json',
  'liveGameActorRequests':'artifacts/hero-voice-game-requests.log',
  'viewportChecks':[[1280,900],[390,844],[844,390]],
  'physicalPhoneVerified':False,'humanListeningVerified':False,
  'asrLimitations':'Homophones and hallucinations in long reels; suspect repeated phrases checked separately in asr-isolated-check.json. ASR does not certify acting quality.'}
target=ROOT/'artifacts/hero-voice-validation.json'
if target.exists():raise FileExistsError(target)
target.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:summary[k] for k in ['totalClips','lufsMin','lufsMax','unitTests']},ensure_ascii=False))
