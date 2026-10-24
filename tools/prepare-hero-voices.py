"""Build isolated, level-matched hero voices from official ElevenLabs downloads.

init writes the exact spoken contract. process rejects ambiguous segmentation;
existing Kevin Tu clips may be reused without regenerating or altering originals.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/audio/voice-heroes-v1'
OUTPUT = ROOT / 'assets/audio/voice-heroes-v1'
spec = importlib.util.spec_from_file_location('voice_helpers', ROOT / 'tools/prepare-crystal-voice.py')
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)
voice.SOURCE = SOURCE
GROUPS = {
    'chow': ['疾風', '御劍', '引雷', '逐月'],
    'pong': ['破山', '震岳', '穿雲', '裂空'],
    'kong': ['天罡', '雷動', '龍吟', '破陣'],
    'concealed-kong': ['藏鋒', '潛龍', '無影', '伏雷'],
    'win': ['誅邪', '天誅', '歸元', '斬妖'],
    'self-draw': ['天啟', '凌霄', '化神', '飛昇'],
}

def contract():
    old = json.loads((ROOT / 'art-source/audio/voice-crystal-v1/lines.json').read_text('utf-8'))
    lines = [{'id': line['id'], 'text': line['text'].rstrip('。！')} for b in old['batches'] for line in b['lines']]
    lines += [{'id': f'{cue}-{i}', 'text': text} for cue, names in GROUPS.items() for i, text in enumerate(names, 1)]
    lines += [{'id': 'ready', 'text': '凝神'}, {'id': 'flower', 'text': '靈華'}]
    assert len(lines) == 68 and len({l['id'] for l in lines}) == 68
    return lines

def measure(path):
    log = voice.command(['ffmpeg','-hide_banner','-i',str(path),'-af',
        'loudnorm=I=-20:TP=-2:LRA=11:print_format=json','-f','null','-']).stderr.decode()
    result = json.loads(log[log.rfind('{'):log.rfind('}')+1])
    return {k: float(result[k]) for k in ['input_i','input_tp','input_lra','input_thresh','target_offset']}

def normalize(source, target):
    # Measure short clips with ebur128, then use measured two-pass loudness control.
    m = measure(source)
    filt = ('loudnorm=I=-20:TP=-2:LRA=11:linear=true:'
            f"measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
            f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}")
    voice.backup(target)
    voice.command(['ffmpeg','-v','error','-i',str(source),'-af',filt,'-ar','44100','-ac','1',
        '-codec:a','libmp3lame','-b:a','128k','-map_metadata','-1','-y',str(target)])
    after = measure(target)
    levels = voice.levels(voice.decode(target))
    if levels['clipped_samples'] or after['input_tp'] > -1:
        raise ValueError(f'Peak validation failed: {target}')
    return {'before':m,'after':after,'levels':levels,'sha256':voice.digest(target)}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['init','process','reuse-kevin'])
    parser.add_argument('--hero')
    parser.add_argument('--input',type=Path)
    parser.add_argument('--calls-only',action='store_true')
    parser.add_argument('--actions-only',action='store_true')
    args=parser.parse_args()
    SOURCE.mkdir(parents=True,exist_ok=True)
    candidates=json.loads((ROOT/'artifacts/hero-voice-candidates.json').read_text('utf-8-sig'))['voices']
    lines=contract()[-26:] if args.actions_only else contract()[-2:] if args.calls_only else contract()
    if args.action=='init':
        voice.write_json(SOURCE/'contract.json',{'lines':lines,'count':len(lines),'heroes':candidates,'target_lufs':-20,'true_peak_limit_dbtp':-2})
        def spoken(line):
            return line['text']+'。' if line['id'].startswith('tile-') else '[commanding] '+line['text']+'！'
        (SOURCE/'batch-text.txt').write_text('\n<break time="1.5s" />\n'.join(spoken(l) for l in lines),encoding='utf-8')
        (SOURCE/'actions-text.txt').write_text('\n<break time="1.5s" />\n'.join(spoken(l) for l in lines[-26:]),encoding='utf-8')
        return
    hero=next(v for v in candidates if v['heroId']==args.hero)
    folder=OUTPUT/args.hero
    folder.mkdir(parents=True,exist_ok=True)
    source_folder=SOURCE/args.hero
    source_folder.mkdir(parents=True,exist_ok=True)
    inputs=[]
    if args.action=='reuse-kevin':
        assert args.hero=='shen-gufeng'
        for line in lines:
            name=line['id']
            old='voice-crystal-v1' if name.startswith('tile-') else 'voice-cultivation-v1' if re.search(r'-[1-4]$',name) else 'voice'
            inputs.append(ROOT/'assets/audio'/old/(name+'.mp3'))
    else:
        original=source_folder/('source-actions.mp3' if args.actions_only else 'source-calls.mp3' if args.calls_only else 'source.mp3')
        if args.input.resolve()!=original.resolve():
            voice.backup(original);shutil.copy2(args.input,original)
        samples=voice.decode(original)
        attempts=[]
        regions=None
        for silence_db in [-48,-42,-36,-54]:
            for gap in [.35,.25,.15,.55,.75]:
                found,_=voice.phrase_regions(original,len(samples)/voice.RATE,silence_db,gap)
                attempts.append({'threshold_db':silence_db,'gap':gap,'count':len(found)})
                if len(found)==len(lines):
                    regions=found;break
            if regions:break
        voice.write_json(source_folder/('segmentation-actions.json' if args.actions_only else 'segmentation-calls.json' if args.calls_only else 'segmentation.json'),{'attempts':attempts,'regions':regions})
        if regions is None:raise ValueError(f'Expected {len(lines)} phrases: {attempts}')
        for line,(start,end) in zip(lines,regions):
            raw=source_folder/(line['id']+'.wav')
            voice.backup(raw)
            voice.command(['ffmpeg','-v','error','-i',str(original),'-ss',str(max(0,start-.06)),
                '-t',str(end-start+.16),'-c:a','pcm_s24le','-y',str(raw)])
            inputs.append(raw)
    clips=[]
    for line,source in zip(lines,inputs):
        target=folder/(line['id']+'.mp3')
        report=normalize(source,target)
        clips.append({**line,**report,'file':target.relative_to(ROOT).as_posix()})
    if args.calls_only or args.actions_only:
        old=json.loads((source_folder/'manifest.json').read_text('utf-8'))
        replace={l['id'] for l in lines}
        clips=[c for c in old['clips'] if c['id'] not in replace]+clips
    voice.write_json(source_folder/'manifest.json',{'heroId':args.hero,'voiceId':hero['voiceId'],
        'voice':hero['voice'],'provider':'ElevenLabs','reused_existing_voice':args.action=='reuse-kevin',
        'text_content_verified':False,'human_listening_verified':False,'clips':clips})
    print(json.dumps({'hero':args.hero,'count':len(clips),'lufsRange':[min(c['after']['input_i'] for c in clips),max(c['after']['input_i'] for c in clips)],
        'maxTruePeak':max(c['after']['input_tp'] for c in clips)},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
