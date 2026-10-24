"""Production SFX: preserve ElevenLabs originals, normalize and verify decoding."""
from pathlib import Path
import json
import re
import subprocess

root = Path(__file__).resolve().parents[1]
source = root / 'art-source/cultivation-vfx/audio'
dest = root / 'assets/cultivation-vfx'
jobs = {name: (source / (name + '.mp3'), None) for name in ['metal', 'wood', 'water', 'poison', 'seal', 'bless', 'stealth', 'thunder', 'meteor', 'sword-rain', 'eruption', 'tornado', 'dragon', 'bell', 'shatter', 'fountain']}
jobs.update({
    'fire': (root / 'art-source/cultivation-preview/audio/bronze-fire.mp3', None),
    'earth': (root / 'art-source/cultivation-preview/audio/bronze-mountain.mp3', None),
    'shield': (root / 'art-source/cultivation-preview/audio/bronze-ward.mp3', .55),
})
report = []
for name, (original, duration) in jobs.items():
    target = dest / (name + '.mp3')
    if not target.exists():
        end = duration or 2
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', '-i', str(original),
                        '-t', str(end), '-af', f'loudnorm=I=-18:TP=-3:LRA=7,afade=t=in:st=0:d=0.008,afade=t=out:st={end-.12}:d=0.12',
                        '-ar', '44100', '-ac', '2', '-b:a', '192k', str(target)], check=True)
    meta = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels', '-of', 'json', str(target)]))
    decode = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(target), '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    peak = float(re.search(r'max_volume: ([\-\d.]+) dB', decode.stderr).group(1))
    assert peak <= -2 and float(meta['format']['duration']) >= .5
    report.append({'name': name, 'source': str(original.relative_to(root)), 'decoded': True, 'peak_dbfs': peak, **meta})
(root / 'artifacts/cultivation-vfx-audio-checks.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'decoded': len(report), 'peak_max_dbfs': max(r['peak_dbfs'] for r in report)}))
