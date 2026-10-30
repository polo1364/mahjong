"""Inspect or process downloaded hero-skill voice batches without generating audio.

Only an exact phrase count permits processing. Explicit --regions may contain a
list of [start, end] seconds, or an object with regions, source_sha256 and evidence.
Segmentation and ASR evidence do not certify the spoken content or performance.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import shutil
import uuid


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/audio/voice-hero-skills-v1'
OUTPUT = ROOT / 'assets/audio/voice-hero-skills-v1'
spec = importlib.util.spec_from_file_location('hero_voice_helpers', ROOT / 'tools/prepare-hero-voices.py')
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
voice = helpers.voice


def backup(path):
    if not path.exists():
        return
    folder = SOURCE / 'backups'
    folder.mkdir(parents=True, exist_ok=True)
    # Different heroes process files named processing.json concurrently. A path
    # fingerprint and random suffix prevent shared-clock backup collisions.
    source_id = hashlib.sha256(str(path.resolve()).encode('utf-8')).hexdigest()[:12]
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    shutil.copy2(path, folder / f'{path.name}.bak.{source_id}.{stamp}.{uuid.uuid4().hex}')


voice.backup = backup


def safe_id(value, directory=False):
    pattern = r'[A-Za-z0-9][A-Za-z0-9_-]*' if directory else r'[A-Za-z0-9][A-Za-z0-9:._-]*'
    if not isinstance(value, str) or not re.fullmatch(pattern, value) or value.endswith('.') or '..' in value:
        raise ValueError(f'Unsafe identifier: {value!r}')
    result = value.replace(':', '--')
    if result.split('.')[0].upper() in {'CON', 'PRN', 'AUX', 'NUL', *[f'COM{i}' for i in range(1, 10)], *[f'LPT{i}' for i in range(1, 10)]}:
        raise ValueError(f'Reserved filename: {value!r}')
    return result


def select_batch(contract, hero_id, batch_id):
    safe_id(hero_id, directory=True)
    safe_id(batch_id, directory=True)
    heroes = [hero for hero in contract['heroes'] if hero['heroId'] == hero_id]
    if len(heroes) != 1:
        raise ValueError(f'Expected one contract hero: {hero_id}')
    hero = heroes[0]
    batch_ids, filenames = set(), set()
    for batch in hero['batches']:
        key = safe_id(batch['id'], directory=True).casefold()
        if key in batch_ids:
            raise ValueError(f'Duplicate batch identifier: {batch["id"]}')
        batch_ids.add(key)
        if not batch['lines']:
            raise ValueError(f'Empty batch: {batch["id"]}')
        for line in batch['lines']:
            filename = safe_id(line['id']).casefold()
            if filename in filenames:
                raise ValueError(f'Duplicate or colliding clip identifier: {line["id"]}')
            filenames.add(filename)
            if not isinstance(line.get('text'), str) or not line['text'].strip():
                raise ValueError(f'Missing spoken text: {line["id"]}')
    batches = [batch for batch in hero['batches'] if batch['id'] == batch_id]
    if len(batches) != 1:
        raise ValueError(f'Unknown batch: {batch_id}')
    return hero, batches[0]


def contract_hash(hero, batch):
    value = {'heroId': hero['heroId'], 'voiceId': hero.get('voiceId'), 'delivery': hero.get('delivery'), 'batch': batch}
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()


def validate_regions(regions, expected, duration):
    if not isinstance(regions, list) or len(regions) != expected:
        raise ValueError(f'Expected exactly {expected} phrase regions')
    result, previous_end = [], 0.0
    for region in regions:
        if not isinstance(region, (list, tuple)) or len(region) != 2:
            raise ValueError('Each region must contain [start, end] seconds')
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in region):
            raise ValueError('Region boundaries must be finite numbers')
        start, end = region
        if start < 0 or start < previous_end or end <= start or end > duration:
            raise ValueError(f'Overlapping, unordered or out-of-range region: {region}')
        result.append([float(start), float(end)])
        previous_end = end
    return result


def inspect_batch(input_path, expected, regions_path=None, silence_db=None, min_silence=None):
    samples = voice.decode(input_path)
    duration = len(samples) / voice.RATE
    source_hash = voice.digest(input_path)
    result = {'expected_count': expected, 'source_sha256': source_hash,
              'duration_seconds': duration, 'source_levels': voice.levels(samples), 'attempts': []}
    if regions_path:
        data = json.loads(regions_path.read_text('utf-8-sig'))
        if isinstance(data, dict) and data.get('source_sha256', source_hash) != source_hash:
            raise ValueError('Explicit regions refer to a different source hash')
        regions = data.get('regions') if isinstance(data, dict) else data
        result['regions'] = validate_regions(regions, expected, duration)
        result['segmentation_method'] = 'explicit-regions'
        result['regions_evidence'] = {'file': str(regions_path.resolve()), 'sha256': voice.digest(regions_path),
                                      'evidence': data.get('evidence') if isinstance(data, dict) else None}
    else:
        thresholds = [silence_db] if silence_db is not None else [-48, -42, -36, -54]
        gaps = [min_silence] if min_silence is not None else [.35, .25, .15, .55, .75]
        result['regions'] = None
        result['segmentation_method'] = 'silence-detection'
        for threshold in thresholds:
            for gap in gaps:
                found, _ = voice.phrase_regions(input_path, duration, threshold, gap)
                result['attempts'].append({'threshold_db': threshold, 'minimum_gap_seconds': gap, 'count': len(found)})
                if len(found) == expected:
                    result['regions'] = validate_regions(found, expected, duration)
                    break
            if result['regions'] is not None:
                break
    result['can_process'] = result['regions'] is not None
    return result


def write_json(path, value):
    text = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    if path.exists() and path.read_text('utf-8') == text:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    voice.SOURCE = SOURCE
    voice.backup(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(text, encoding='utf-8')
    temporary.replace(path)


def file_name(hero_id, line_id):
    return OUTPUT / hero_id / (safe_id(line_id) + '.mp3')


def validate_clip(clip, hero_id):
    target = file_name(hero_id, clip['id'])
    if clip['file'] != target.relative_to(ROOT).as_posix() or not target.is_file() or voice.digest(target) != clip['sha256']:
        raise ValueError(f'Completed clip is missing or differs from its record: {clip["id"]}')


def rebuild_manifest(hero):
    clips, batches = [], []
    for batch in hero['batches']:
        record_path = SOURCE / 'source' / hero['heroId'] / batch['id'] / 'processing.json'
        if not record_path.exists():
            continue
        record = json.loads(record_path.read_text('utf-8'))
        if record['contract_sha256'] != contract_hash(hero, batch):
            raise ValueError(f'Batch contract changed: {batch["id"]}')
        if record['status'] != 'complete':
            continue
        if [clip['id'] for clip in record['clips']] != [line['id'] for line in batch['lines']]:
            raise ValueError(f'Batch clip order differs from contract: {batch["id"]}')
        for clip in record['clips']:
            validate_clip(clip, hero['heroId'])
        clips.extend(record['clips'])
        batches.append({'id': batch['id'], 'source_sha256': record['source_sha256'],
                        'processing': record_path.relative_to(ROOT).as_posix(), 'count': len(record['clips'])})
    result = {'heroId': hero['heroId'], 'voiceId': hero.get('voiceId'), 'voice': hero.get('voice'),
              'provider': 'ElevenLabs', 'expected_count': sum(len(batch['lines']) for batch in hero['batches']),
              'processed_count': len(clips), 'completed_batches': batches,
              'text_content_verified': False, 'human_listening_verified': False, 'clips': clips}
    write_json(SOURCE / hero['heroId'] / 'manifest.json', result)
    return result


def process_batch(hero, batch, input_path, regions_path=None, generation_id=None, generation_notes=None,
                  silence_db=None, min_silence=None):
    voice.SOURCE = SOURCE  # Reused helpers must never back up into the old voice tree.
    source_hash = voice.digest(input_path)
    batch_hash = contract_hash(hero, batch)
    folder = SOURCE / 'source' / hero['heroId'] / batch['id']
    original, report_path = folder / 'source.mp3', folder / 'processing.json'
    previous = json.loads(report_path.read_text('utf-8')) if report_path.exists() else None
    if previous:
        if previous['source_sha256'] != source_hash or previous['contract_sha256'] != batch_hash:
            raise ValueError('Refusing to overwrite a batch with a different source or contract')
        expected_prefix = [line['id'] for line in batch['lines'][:len(previous['clips'])]]
        if [clip['id'] for clip in previous['clips']] != expected_prefix:
            raise ValueError('Existing batch checkpoint is not a prefix of the contract')
        if previous['status'] not in ['processing', 'complete']:
            raise ValueError('Unknown batch checkpoint status')
        if previous['status'] == 'complete':
            if not original.is_file() or voice.digest(original) != source_hash:
                raise ValueError('Completed batch original is missing or changed')
            manifest = rebuild_manifest(hero)
            return {'status': 'skipped-complete', 'heroId': hero['heroId'], 'batchId': batch['id'],
                    'batch_clips': len(previous['clips']), 'hero_clips': manifest['processed_count']}
    if original.exists() and voice.digest(original) != source_hash:
        raise ValueError('Refusing to replace a different preserved original')
    if not previous:
        for line in batch['lines']:
            if file_name(hero['heroId'], line['id']).exists():
                raise ValueError(f'Untracked output already exists: {line["id"]}')
    inspection = inspect_batch(input_path, len(batch['lines']), regions_path, silence_db, min_silence)
    if not inspection['can_process']:
        raise ValueError('Phrase count mismatch; inspect or supply evidence-based --regions: '
                         + json.dumps(inspection['attempts']))
    if previous and previous['segmentation']['regions'] != inspection['regions']:
        raise ValueError('Refusing to change segmentation for a partially processed batch')
    folder.mkdir(parents=True, exist_ok=True)
    (OUTPUT / hero['heroId']).mkdir(parents=True, exist_ok=True)
    if not original.exists():
        shutil.copy2(input_path, original)
    report = previous or {'heroId': hero['heroId'], 'batchId': batch['id'], 'status': 'processing',
              'source': original.relative_to(ROOT).as_posix(), 'source_sha256': source_hash,
              'download_filename': input_path.name, 'contract_sha256': batch_hash,
              'generation_id': generation_id, 'generation_notes': generation_notes,
              'created_utc': datetime.now(timezone.utc).isoformat(), 'segmentation': inspection,
              'text_content_verified': False, 'human_listening_verified': False, 'clips': []}
    write_json(report_path, report)
    done = {clip['id']: clip for clip in report['clips']}
    for index, (line, (start, end)) in enumerate(zip(batch['lines'], inspection['regions'])):
        if line['id'] in done:
            validate_clip(done[line['id']], hero['heroId'])
            continue
        raw = folder / (safe_id(line['id']) + '.wav')
        target = file_name(hero['heroId'], line['id'])
        voice.backup(raw)
        # Clamp padding at the midpoint between adjacent phrases so it cannot
        # include speech from the preceding or following clip.
        previous_end = inspection['regions'][index - 1][1] if index else 0
        next_start = inspection['regions'][index + 1][0] if index + 1 < len(batch['lines']) else inspection['duration_seconds']
        padded_start = max(0, start - .06, (previous_end + start) / 2 if index else 0)
        padded_end = min(inspection['duration_seconds'], end + .1, (end + next_start) / 2)
        voice.command(['ffmpeg', '-v', 'error', '-i', str(original), '-ss', str(padded_start),
                       '-t', str(padded_end - padded_start), '-c:a', 'pcm_s24le', '-y', str(raw)])
        metrics = helpers.normalize(raw, target)
        report['clips'].append({**line, **metrics, 'batchId': batch['id'],
                                'source_region_seconds': [padded_start, padded_end],
                                'file': target.relative_to(ROOT).as_posix()})
        write_json(report_path, report)
    report['status'] = 'complete'
    write_json(report_path, report)
    manifest = rebuild_manifest(hero)
    return {'status': 'processed', 'heroId': hero['heroId'], 'batchId': batch['id'],
            'batch_clips': len(report['clips']), 'hero_clips': manifest['processed_count']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['inspect', 'process'])
    parser.add_argument('--hero', required=True)
    parser.add_argument('--batch', required=True)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--regions', type=Path)
    parser.add_argument('--generation-id')
    parser.add_argument('--generation-notes')
    parser.add_argument('--silence-db', type=float)
    parser.add_argument('--min-silence', type=float)
    args = parser.parse_args()
    if args.min_silence is not None and (not math.isfinite(args.min_silence) or args.min_silence <= 0):
        parser.error('--min-silence must be a positive finite number')
    if args.silence_db is not None and (not math.isfinite(args.silence_db) or args.silence_db >= 0):
        parser.error('--silence-db must be a negative finite number')
    contract = json.loads((SOURCE / 'contract.json').read_text('utf-8-sig'))
    hero, batch = select_batch(contract, args.hero, args.batch)
    if args.action == 'inspect':
        result = inspect_batch(args.input, len(batch['lines']), args.regions, args.silence_db, args.min_silence)
    else:
        result = process_batch(hero, batch, args.input, args.regions, args.generation_id,
                               args.generation_notes, args.silence_db, args.min_silence)
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    if args.action == 'inspect' and not result['can_process']:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
