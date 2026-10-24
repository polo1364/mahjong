"""Limit isolated transients only on loudness outliers, keeping original voice/pitch."""
import importlib.util
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('hero_voice',ROOT/'tools/prepare-hero-voices.py')
hero=importlib.util.module_from_spec(spec);spec.loader.exec_module(hero)

for folder in sorted(hero.SOURCE.iterdir()):
    manifest=folder/'manifest.json'
    if not manifest.is_file():continue
    data=json.loads(manifest.read_text('utf-8'))
    changed=False
    for clip in data['clips']:
        if abs(clip['after']['input_i']+20.5)<=.4:continue
        target=ROOT/clip['file']
        original=folder/(clip['id']+'-before-level-polish.mp3')
        if original.exists():raise ValueError('Already polished: '+str(original))
        original.write_bytes(target.read_bytes())
        gain=-20.5-clip['after']['input_i']
        for attempt in range(3):
            hero.voice.command(['ffmpeg','-v','error','-i',str(original),'-af',
                f'volume={gain}dB,alimiter=limit=0.707945784:attack=5:release=60:level=0:latency=1',
                '-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','128k','-map_metadata','-1','-y',str(target)])
            after=hero.measure(target)
            if abs(after['input_i']+20.5)<=.4:break
            gain+=-20.5-after['input_i']
        if abs(after['input_i']+20.5)>.4 or after['input_tp']>-1.5:raise ValueError('Loudness polish failed: '+str(target))
        clip.update({'after':after,'levels':hero.voice.levels(hero.voice.decode(target)),
            'sha256':hero.voice.digest(target),'transient_limited_gain_db':gain})
        print(folder.name,clip['id'],after['input_i'],after['input_tp'],flush=True)
        changed=True
    if changed:hero.voice.write_json(manifest,data)
