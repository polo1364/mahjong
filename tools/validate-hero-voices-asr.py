"""Independent raw ASR of level-matched hero reels; no expected-text prompt."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import numpy as np
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
from faster_whisper import WhisperModel

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'art-source/audio/voice-heroes-v1'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-cache',required=True)
    parser.add_argument('--heroes',nargs='+',required=True)
    args=parser.parse_args()
    model=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=4,download_root=args.model_cache)
    for hero in args.heroes:
        manifest=json.loads((SOURCE/hero/'manifest.json').read_text('utf-8'))
        chunks=[];timing=[];offset=0
        for clip in manifest['clips']:
            data=subprocess.run(['ffmpeg','-v','error','-i',str(ROOT/clip['file']),'-ac','1','-ar','16000','-f','f32le','pipe:1'],capture_output=True,check=True).stdout
            samples=np.frombuffer(data,dtype='<f4');chunks.extend([samples,np.zeros(6400,dtype=np.float32)])
            timing.append({'id':clip['id'],'expected':clip['text'],'start':offset,'end':offset+len(samples)/16000})
            offset+=(len(samples)+6400)/16000
        segments,info=model.transcribe(np.concatenate(chunks),language='zh',beam_size=5,temperature=0,condition_on_previous_text=False,word_timestamps=True)
        result=[{'start':s.start,'end':s.end,'text':s.text,'words':[{'start':w.start,'end':w.end,'text':w.word} for w in s.words or []]} for s in segments]
        report={'heroId':hero,'expectedPromptUsed':False,'humanListeningVerified':False,'timing':timing,'segments':result,'text':''.join(s['text'] for s in result)}
        target=SOURCE/hero/'asr-raw.json'
        if target.exists():raise ValueError('Refusing to overwrite ASR evidence')
        target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'heroId':hero,'transcript':report['text']},ensure_ascii=True),flush=True)

if __name__=='__main__':main()
