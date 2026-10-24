"""Normalize three isolated delivery auditions; never writes runtime game assets."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/chant-delivery-preview-20261023'
spec=importlib.util.spec_from_file_location('voice_helpers',ROOT/'tools/prepare-crystal-voice.py')
voice=importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)
voice.SOURCE=OUT/'originals'
voice.OUTPUT=OUT
voice.SOURCE.mkdir(parents=True,exist_ok=True)
request=json.loads((OUT/'requests.json').read_text(encoding='utf-8'))
records=[]
for sample in request['samples']:
    source=voice.SOURCE/(sample['id']+'.mp3')
    voice.backup(source)
    shutil.copy2(sample['source'],source)
    samples=voice.decode(source)
    region=(0,len(samples)/voice.RATE)
    result=voice.prepare_clip(samples,region,{'id':sample['id'],'file':sample['id']+'.mp3',
        'text':'御劍、誅邪','name':sample['name']},'delivery-audition')
    records.append({**sample,**result,'source_original':source.relative_to(ROOT).as_posix(),
        'source_sha256':voice.digest(source)})
voice.write_json(OUT/'manifest.json',{'voice':request['voice'],'model':request['model'],
    'production_applied':False,'human_listening_accepted':False,'samples':records})
sys.stdout.reconfigure(encoding='utf-8')
print(json.dumps([{k:r[k] for k in ['id','name','output','levels']} for r in records],ensure_ascii=False))
