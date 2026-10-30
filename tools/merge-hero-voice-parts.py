"""Verify and join split downloads into one canonical hero-voice batch.

Each receipt must contain heroId, voiceId, canonical batchId, lineIds, text and
files [{variant, file}]. The parts must cover the batch exactly and in order.
This tool preserves every original and records receipt/audio hashes. It does
not certify pronunciation or performance; run raw ASR on the merged source.

Explicit pronunciationOverrides may replace only 籙 with its lu4 homophone 錄.
Canonical text, actual TTS input and every affected line must be recorded.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/audio/voice-hero-skills-v1'
spec = importlib.util.spec_from_file_location('processor', ROOT / 'tools/prepare-hero-skill-voices.py')
processor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(processor)


def receipt_texts(contract, lines_by_id, ids, receipt):
    canonical = contract['separator'].join(lines_by_id[line_id]['taggedText'] for line_id in ids)
    overrides = receipt.get('pronunciationOverrides')
    if overrides is None:
        editor = receipt.get('editorText', receipt.get('uiText', canonical))
        if receipt.get('text') != canonical or editor != canonical:
            raise ValueError('Receipt text does not exactly match its canonical lines')
        return {'canonicalText': canonical, 'actualTtsText': canonical, 'pronunciationOverrides': []}
    expected = [{'lineId': line_id, 'from': '籙', 'to': '錄', 'mandarin': 'lu4'}
                for line_id in ids if '籙' in lines_by_id[line_id]['text']]
    if overrides != expected:
        raise ValueError('Only explicit, complete per-line 籙 to 錄 lu4 overrides are allowed')
    affected = {item['lineId'] for item in expected}
    actual = contract['separator'].join(lines_by_id[line_id]['taggedText'].replace('籙', '錄')
                                       if line_id in affected else lines_by_id[line_id]['taggedText'] for line_id in ids)
    if receipt.get('canonicalText') != canonical:
        raise ValueError('Pronunciation receipt must preserve exact canonical tagged text')
    if any(receipt.get(key) != actual for key in ['text', 'editorText', 'actualTtsText']):
        raise ValueError('Actual TTS input must differ only by the declared 籙 to 錄 overrides')
    return {'canonicalText': canonical, 'actualTtsText': actual, 'pronunciationOverrides': overrides}


def check_parts(contract, hero, batch, receipts, variants):
    if len(receipts) != len(variants) or len(receipts) < 2:
        raise ValueError('Supply one variant number for each of at least two receipts')
    parts, covered = [], []
    lines_by_id = {line['id']: line for line in batch['lines']}
    for receipt_path, variant in zip(receipts, variants):
        receipt = json.loads(receipt_path.read_text('utf-8-sig'))
        if (receipt.get('heroId'), receipt.get('voiceId'), receipt.get('batchId')) != (hero['heroId'], hero['voiceId'], batch['id']):
            raise ValueError(f'Receipt hero, voice or batch mismatch: {receipt_path}')
        ids = receipt.get('lineIds')
        if not isinstance(ids, list) or not ids or any(line_id not in lines_by_id for line_id in ids):
            raise ValueError(f'Missing or invalid receipt lineIds: {receipt_path}')
        texts = receipt_texts(contract, lines_by_id, ids, receipt)
        files = [entry for entry in receipt.get('files', []) if entry.get('variant') == variant]
        if len(files) != 1:
            raise ValueError(f'Expected exactly one variant {variant}: {receipt_path}')
        audio = Path(files[0]['file']).resolve()
        if not audio.is_relative_to((SOURCE / 'downloads').resolve()) or not audio.is_file():
            raise ValueError(f'Audio must be a real file in the task download directory: {audio}')
        inspection = processor.inspect_batch(audio, len(ids))
        if not inspection['can_process']:
            raise ValueError(f'Part phrase count mismatch ({len(ids)} expected): {audio}')
        covered.extend(ids)
        parts.append({'receipt': str(receipt_path.resolve()), 'receipt_sha256': processor.voice.digest(receipt_path),
                      'file': str(audio), 'source_sha256': processor.voice.digest(audio), 'variant': variant,
                      'lineIds': ids, 'inspection': inspection, **texts})
    if covered != [line['id'] for line in batch['lines']]:
        raise ValueError('Part lineIds must cover the canonical batch exactly once and in order')
    return parts


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hero', required=True)
    parser.add_argument('--batch', required=True)
    parser.add_argument('--receipts', type=Path, nargs='+', required=True)
    parser.add_argument('--variants', type=int, nargs='+', required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    contract = json.loads((SOURCE / 'contract.json').read_text('utf-8'))
    hero, batch = processor.select_batch(contract, args.hero, args.batch)
    parts = check_parts(contract, hero, batch, args.receipts, args.variants)
    identity = {'heroId': hero['heroId'], 'batchId': batch['id'],
                'contract_sha256': processor.contract_hash(hero, batch),
                'parts': [{key: part[key] for key in ['receipt_sha256', 'source_sha256', 'variant', 'lineIds']} for part in parts]}
    folder = SOURCE / 'merged' / hero['heroId']
    output = folder / (batch['id'] + '-parts.mp3')
    record_path = folder / (batch['id'] + '-parts-merge.json')
    if output.exists() or record_path.exists():
        if not (output.is_file() and record_path.is_file()):
            raise FileExistsError('Incomplete merge already exists; inspect it instead of overwriting')
        record = json.loads(record_path.read_text('utf-8'))
        if record.get('identity') != identity or record.get('output_sha256') != processor.voice.digest(output):
            raise FileExistsError('Refusing to overwrite a different merged source')
        print(json.dumps({'status': 'reused', 'output': str(output), 'record': str(record_path)}))
        return
    if args.check:
        print(json.dumps({'status': 'validated', 'heroId': hero['heroId'], 'batchId': batch['id'],
                          'parts': len(parts), 'lines': sum(len(part['lineIds']) for part in parts)}))
        return
    folder.mkdir(parents=True, exist_ok=True)
    candidate = folder / (batch['id'] + '-candidate-' + uuid.uuid4().hex + '.mp3')
    command = ['ffmpeg', '-v', 'error']
    for part in parts:
        command.extend(['-i', part['file']])
    filters, labels = [], []
    for index in range(len(parts)):
        filters.append(f'[{index}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=mono[a{index}]')
        labels.append(f'[a{index}]')
        if index + 1 < len(parts):
            filters.append(f'anullsrc=r=44100:cl=mono,atrim=duration=0.65[s{index}]')
            labels.append(f'[s{index}]')
    filters.append(''.join(labels) + f'concat=n={len(labels)}:v=0:a=1[out]')
    command.extend(['-filter_complex', ';'.join(filters), '-map', '[out]', '-ac', '1', '-ar', '44100',
                    '-codec:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', str(candidate)])
    processor.voice.command(command)
    inspection = processor.inspect_batch(candidate, len(batch['lines']))
    if not inspection['can_process']:
        raise ValueError(f'Merged phrase count mismatch; preserved candidate for inspection: {candidate}')
    candidate.rename(output)
    record = {'schemaVersion': 1, 'identity': identity, 'created_utc': datetime.now(timezone.utc).isoformat(),
              'parts': parts, 'output': str(output), 'output_sha256': processor.voice.digest(output),
              'between_parts_silence_seconds': 0.65, 'format': 'MP3 44100 Hz mono 128 kbps',
              'segmentation': inspection, 'text_content_verified': False, 'human_listening_verified': False}
    with record_path.open('x', encoding='utf-8') as target:
        json.dump(record, target, ensure_ascii=False, indent=2)
        target.write('\n')
    print(json.dumps({'status': 'merged', 'heroId': hero['heroId'], 'batchId': batch['id'],
                      'lines': len(batch['lines']), 'output': str(output), 'record': str(record_path)}))


if __name__ == '__main__':
    main()
