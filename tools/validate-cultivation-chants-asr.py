"""Independent local ASR of source and final reel; no vocabulary hints supplied."""
import json
import os
from pathlib import Path
import subprocess
import sys
import numpy as np
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
from faster_whisper import WhisperModel
ROOT = Path(__file__).resolve().parents[1]
model = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=4, download_root=sys.argv[1])
results = []
for relative in ['art-source/audio/voice-cultivation-v1/original-with-accidental-tail.mp3',
                 'assets/audio/voice-cultivation-v1/preview.mp3']:
    pcm = subprocess.run(['ffmpeg','-v','error','-i',str(ROOT/relative),'-ac','1','-ar','16000',
        '-f','f32le','pipe:1'],capture_output=True,check=True).stdout
    segments, info = model.transcribe(np.frombuffer(pcm,dtype='<f4'),language='zh',beam_size=5,
        temperature=0,condition_on_previous_text=False,word_timestamps=True)
    rows = [{'start':s.start,'end':s.end,'text':s.text} for s in segments]
    results.append({'file':relative,'segments':rows,'text':''.join(s['text'] for s in rows)})
    print(relative,results[-1]['text'],flush=True)
(ROOT/'artifacts/cultivation-chants-asr.json').write_text(json.dumps({
    'model':'faster-whisper-small', 'vocabulary_prompt':False,'human_listening_verified':False,
    'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
