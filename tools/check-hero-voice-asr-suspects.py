"""Recheck isolated clips where long-reel ASR repeated or hallucinated text."""
import json
from pathlib import Path
import numpy as np
import subprocess
from faster_whisper import WhisperModel

ROOT=Path(__file__).resolve().parents[1]
CACHE=Path.home()/'AppData/Local/Temp/mahjong-crystal-asr-20261022/models'
model=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=4,download_root=str(CACHE))
suspects={'yue-zhenshan':['tile-b3','tile-b4','tile-b5'],
          'chi-ling':['tile-t7','tile-t8','tile-t9'],
          'hua-jianlu':['pong-2','pong-3','pong-4','kong-1','kong-2','kong-3','kong-4'],
          'ye-shuying':['ready','flower']}
rows=[]
for hero,clips in suspects.items():
    for cue in clips:
        filename=ROOT/'assets/audio/voice-heroes-v1'/hero/(cue+'.mp3')
        raw=subprocess.run(['ffmpeg','-v','error','-i',str(filename),'-ar','16000','-ac','1','-f','f32le','pipe:1'],capture_output=True,check=True).stdout
        samples=np.frombuffer(raw,dtype='<f4')
        segments,_=model.transcribe(np.pad(samples,(3200,3200)),language='zh',beam_size=5,condition_on_previous_text=False,temperature=0)
        row={'hero':hero,'cue':cue,'text':''.join(s.text for s in segments)}
        rows.append(row);print(json.dumps(row,ensure_ascii=True),flush=True)
target=ROOT/'art-source/audio/voice-heroes-v1/asr-isolated-check.json'
if target.exists():raise FileExistsError(target)
target.write_text(json.dumps({'expectedPromptUsed':False,'results':rows},ensure_ascii=False,indent=2),encoding='utf-8')
