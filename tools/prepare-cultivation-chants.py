"""Prepare the isolated 24 short cultivation calls from the approved voice batch.

The source includes an accidentally typed trailing phrase, explicitly excluded.
Reuses the existing clip normalizer without changing any original voice assets.
"""
import importlib.util
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('voice_helpers', ROOT / 'tools/prepare-crystal-voice.py')
voice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(voice)
voice.SOURCE = ROOT / 'art-source/audio/voice-cultivation-v1'
voice.OUTPUT = ROOT / 'assets/audio/voice-cultivation-v1'
GROUPS = {
    'chow': ['疾風', '御劍', '引雷', '逐月'],
    'pong': ['破山', '震岳', '穿雲', '裂空'],
    'kong': ['天罡', '雷動', '龍吟', '破陣'],
    'concealed-kong': ['藏鋒', '潛龍', '無影', '伏雷'],
    'win': ['誅邪', '天誅', '歸元', '斬妖'],
    'self-draw': ['天啟', '凌霄', '化神', '飛昇'],
}

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    source = Path(sys.argv[1])
    voice.SOURCE.mkdir(parents=True, exist_ok=True)
    original = voice.SOURCE / 'original-with-accidental-tail.mp3'
    voice.backup(original)
    shutil.copy2(source, original)
    samples = voice.decode(original)
    regions, _ = voice.phrase_regions(original, len(samples) / voice.RATE, -48, .15)
    if len(regions) != 25:
        raise ValueError(f'Expected 24 calls and one accidental tail, found {len(regions)}')
    clips = []
    for cue, names in GROUPS.items():
        for variant, text in enumerate(names, 1):
            clip_id = f'{cue}-{variant}'
            clips.append(voice.prepare_clip(samples, regions[len(clips)], {
                'id': clip_id, 'cue': cue, 'variant': variant, 'text': text,
                'file': clip_id + '.mp3',
            }, 'cultivation-chants'))
    manifest = {
        'provider': 'ElevenLabs', 'voice_name': 'Kevin Tu - Natural, Steady and Calm',
        'model': 'Eleven v4', 'revision': 'voice-cultivation-v1',
        'source': original.relative_to(ROOT).as_posix(), 'source_sha256': voice.digest(original),
        'download_filename': source.name,
        'credits_before': 115225, 'credits_after': 115105,
        'ui_settings': {'stability': .18, 'similarity': 1, 'language': 'Chinese'},
        'text': '\n<break time="1.5s" />\n'.join(t + '！' for n in GROUPS.values() for t in n),
        'accidental_tail': {'text': '每類', 'excluded_region_seconds': regions[-1]},
        'human_listening_verified': False, 'clips': clips,
    }
    voice.write_json(voice.SOURCE / 'manifest.json', manifest)
    # Concise listening reel in documented category/variant order.
    from array import array
    reel = array('f')
    for clip in clips:
        reel.extend(voice.decode(ROOT / clip['output']))
        reel.extend(array('f', [0]) * round(.25 * voice.RATE))
    voice.backup(voice.OUTPUT / 'preview.mp3')
    voice.encode(reel, voice.OUTPUT / 'preview.mp3')
    print(json.dumps({'clips':len(clips), 'peak_max_dbfs':max(c['levels']['sample_peak_dbfs'] for c in clips),
        'duration_range': [min(c['levels']['duration_seconds'] for c in clips), max(c['levels']['duration_seconds'] for c in clips)],
        'excluded_tail':regions[-1]}, ensure_ascii=False))

if __name__ == '__main__':
    main()
