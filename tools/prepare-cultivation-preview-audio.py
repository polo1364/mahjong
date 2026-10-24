"""Normalize preview-only ElevenLabs SFX. Preserve source downloads separately."""
from pathlib import Path
import json
import subprocess
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/cultivation-preview/audio'
DEST = ROOT / 'assets/cultivation-preview'
report = []
for style in ['jade', 'ink', 'bronze']:
    for skill in ['fire', 'heal', 'ward', 'mountain']:
        asset = f'{style}-{skill}'
        source = SOURCE / f'{asset}.mp3'
        target = DEST / f'{asset}.mp3'
        if not source.exists():
            raise FileNotFoundError(source)
        # Gentle normalization, short end fade; originals remain untouched.
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', '-i', str(source),
                        '-af', 'loudnorm=I=-18:TP=-3:LRA=7,afade=t=in:st=0:d=0.008,afade=t=out:st=1.86:d=0.14',
                        '-ar', '44100', '-ac', '2', '-b:a', '192k', str(target)], check=True)
        variants = [target]
        if skill == 'heal':
            # Full-health casting has no outgoing water strike. Keep the gathering cue only.
            short = DEST / f'{asset}-full.mp3'
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', '-i', str(target),
                            '-t', '0.72', '-af', 'afade=t=out:st=0.52:d=0.2', '-b:a', '192k', str(short)], check=True)
            variants.append(short)
        for output in variants:
            meta = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                              'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', str(output)]))
            decode = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(output), '-af', 'volumedetect',
                                     '-f', 'null', '-'], capture_output=True, text=True, check=True)
            peak = re.search(r'max_volume: ([\-\d.]+) dB', decode.stderr)
            maximum = float(peak.group(1)) if peak else None
            assert maximum is not None and maximum <= -2.0, (output.name, maximum)
            assert float(meta['format']['duration']) > .65
            report.append({'file': output.name, 'decoded': True, 'duration': float(meta['format']['duration']),
                           'peak_dbfs': maximum, 'stream': meta['streams'][0]})
(ROOT / 'artifacts/cultivation-style-audio-checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'decoded_files': len(report), 'peak_max_dbfs': max(x['peak_dbfs'] for x in report)}, indent=2))
