"""Focused safety and resume checks for the offline hero-skill voice processor."""

from array import array
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch


PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('hero_skill_voices', PROJECT / 'tools/prepare-hero-skill-voices.py')
processor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(processor)


def make_contract():
    return {'heroes': [{'heroId': 'test-hero', 'voiceId': 'test-voice', 'voice': 'Test voice', 'batches': [
        {'id': 'pilot', 'lines': [{'id': 'call:chow', 'text': '疾風', 'direction': '清楚', 'taggedText': '疾風！'},
                                  {'id': 'W.chow.123', 'text': '御劍', 'direction': '短收', 'taggedText': '御劍！'}]},
        {'id': 'skills-01', 'lines': [{'id': 'W.pong.111', 'text': '破山', 'direction': '穩定', 'taggedText': '破山！'}]}
    ]}]}


class ProcessorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='mahjong-hero-skill-tests-')
        self.root = Path(self.temporary.name)
        self.source = self.root / 'art-source/audio/voice-hero-skills-v1'
        self.output = self.root / 'assets/audio/voice-hero-skills-v1'
        self.patches = [patch.object(processor, 'ROOT', self.root), patch.object(processor, 'SOURCE', self.source),
                        patch.object(processor, 'OUTPUT', self.output), patch.object(processor.voice, 'SOURCE', self.source)]
        for item in self.patches:
            item.start()
        self.addCleanup(self.temporary.cleanup)
        for item in self.patches:
            self.addCleanup(item.stop)
        self.hero, self.batch = processor.select_batch(make_contract(), 'test-hero', 'pilot')
        self.input = self.root / 'download.mp3'
        self.input.write_bytes(b'original audio')
        self.regions = self.root / 'regions.json'
        self.regions.write_text(json.dumps([[.1, .4], [.6, .9]]), encoding='utf-8')

    def fake_normalize(self, raw, target):
        target.write_bytes(raw.name.encode())
        return {'sha256': processor.voice.digest(target), 'after': {'input_i': -20, 'input_tp': -2},
                'levels': {'clipped_samples': 0, 'duration_seconds': .4}}

    def media_mocks(self):
        return (patch.object(processor.voice, 'decode', return_value=array('f', [.1] * processor.voice.RATE)),
                patch.object(processor.voice, 'command', side_effect=lambda args: Path(args[-1]).write_bytes(b'raw audio')),
                patch.object(processor.helpers, 'normalize', side_effect=self.fake_normalize))

    def test_ids_preserve_dots_and_reject_filename_collisions(self):
        self.assertEqual(processor.safe_id('call:chow'), 'call--chow')
        self.assertEqual(processor.safe_id('W.chow.123'), 'W.chow.123')
        for identifier in ['../outside', 'a/b', 'a\\b', 'CON', 'AUX.mp3', 'x.', '']:
            with self.assertRaises(ValueError):
                processor.safe_id(identifier)
        contract = make_contract()
        contract['heroes'][0]['batches'][1]['lines'][0]['id'] = 'call--chow'
        with self.assertRaisesRegex(ValueError, 'colliding'):
            processor.select_batch(contract, 'test-hero', 'pilot')

    def test_reject_invalid_regions(self):
        for regions in [[[0, .4]], [[0, .6], [.5, .8]], [[.1, .1], [.6, .9]],
                        [[-.1, .4], [.6, .9]], [[0, .4], [.6, 1.1]],
                        [[0, float('nan')], [.6, .9]], [[False, .4], [.6, .9]]]:
            with self.subTest(regions=regions), self.assertRaises(ValueError):
                processor.validate_regions(regions, 2, 1)

    def test_same_named_checkpoints_have_unique_backups(self):
        paths = [self.root / name / 'processing.json' for name in ['hero-one', 'hero-two']]
        for index, path in enumerate(paths):
            path.parent.mkdir()
            path.write_text(str(index), encoding='utf-8')
            for _ in range(2):
                processor.backup(path)
        backups = list((self.source / 'backups').iterdir())
        self.assertEqual(len(backups), 4)
        self.assertEqual(sorted(path.read_text('utf-8') for path in backups), ['0', '0', '1', '1'])

    def test_inspection_does_not_write_source_or_assets(self):
        with patch.object(processor.voice, 'decode', return_value=array('f', [.1] * processor.voice.RATE)):
            result = processor.inspect_batch(self.input, 2, self.regions)
        self.assertTrue(result['can_process'])
        self.assertFalse(self.source.exists())
        self.assertFalse(self.output.exists())

    def test_regions_with_wrong_source_hash_fail(self):
        self.regions.write_text(json.dumps({'source_sha256': 'wrong', 'regions': [[.1, .4], [.6, .9]]}), encoding='utf-8')
        with patch.object(processor.voice, 'decode', return_value=array('f', [.1] * processor.voice.RATE)):
            with self.assertRaisesRegex(ValueError, 'different source hash'):
                processor.inspect_batch(self.input, 2, self.regions)

    def test_count_mismatch_does_not_create_outputs(self):
        with patch.object(processor.voice, 'decode', return_value=array('f', [.1] * processor.voice.RATE)), \
                patch.object(processor.voice, 'phrase_regions', return_value=([[.1, .9]], '')):
            with self.assertRaisesRegex(ValueError, 'Phrase count mismatch'):
                processor.process_batch(self.hero, self.batch, self.input)
        self.assertFalse(self.source.exists())
        self.assertFalse(self.output.exists())

    def test_completed_batch_skips_normalization_and_checks_hashes(self):
        decode, command, normalize = self.media_mocks()
        with decode, command, normalize as call:
            result = processor.process_batch(self.hero, self.batch, self.input, self.regions, 'generation-1', 'test evidence')
            self.assertEqual(result['batch_clips'], 2)
            self.assertEqual(call.call_count, 2)
            result = processor.process_batch(self.hero, self.batch, self.input)
            self.assertEqual(result['status'], 'skipped-complete')
            self.assertEqual(call.call_count, 2)
        report = json.loads((self.source / 'source/test-hero/pilot/processing.json').read_text('utf-8'))
        self.assertEqual(report['generation_notes'], 'test evidence')
        self.assertEqual(report['generation_id'], 'generation-1')
        (self.output / 'test-hero/call--chow.mp3').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'differs from its record'):
            processor.process_batch(self.hero, self.batch, self.input)

    def test_different_source_or_contract_does_not_overwrite(self):
        decode, command, normalize = self.media_mocks()
        with decode, command, normalize:
            processor.process_batch(self.hero, self.batch, self.input, self.regions)
        self.input.write_bytes(b'different audio')
        with self.assertRaisesRegex(ValueError, 'different source or contract'):
            processor.process_batch(self.hero, self.batch, self.input)
        self.input.write_bytes(b'original audio')
        self.batch['lines'][0]['text'] = 'different text'
        with self.assertRaisesRegex(ValueError, 'different source or contract'):
            processor.process_batch(self.hero, self.batch, self.input)

    def test_partial_batch_resumes_without_reencoding_completed_clip(self):
        decode, command, _ = self.media_mocks()
        calls = []

        def interrupted(raw, target):
            calls.append(raw.name)
            if len(calls) == 2:
                raise RuntimeError('simulated interruption')
            return self.fake_normalize(raw, target)

        with decode, command, patch.object(processor.helpers, 'normalize', side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError, 'simulated interruption'):
                processor.process_batch(self.hero, self.batch, self.input, self.regions)
        decode, command, normalize = self.media_mocks()
        with decode, command, normalize as call:
            result = processor.process_batch(self.hero, self.batch, self.input, self.regions)
        self.assertEqual(result['batch_clips'], 2)
        self.assertEqual(call.call_count, 1)

    def test_manifest_merges_completed_batches(self):
        decode, command, normalize = self.media_mocks()
        with decode, command, normalize:
            processor.process_batch(self.hero, self.batch, self.input, self.regions)
            self.regions.write_text(json.dumps([[.1, .9]]), encoding='utf-8')
            result = processor.process_batch(self.hero, self.hero['batches'][1], self.input, self.regions)
        self.assertEqual(result['hero_clips'], 3)
        manifest = json.loads((self.source / 'test-hero/manifest.json').read_text('utf-8'))
        self.assertEqual([clip['id'] for clip in manifest['clips']], ['call:chow', 'W.chow.123', 'W.pong.111'])

    def test_corrupt_checkpoint_does_not_resume_in_the_wrong_order(self):
        decode, command, normalize = self.media_mocks()
        with decode, command, normalize:
            processor.process_batch(self.hero, self.batch, self.input, self.regions)
        path = self.source / 'source/test-hero/pilot/processing.json'
        report = json.loads(path.read_text('utf-8'))
        report['status'] = 'processing'
        report['clips'].reverse()
        path.write_text(json.dumps(report), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'not a prefix'):
            processor.process_batch(self.hero, self.batch, self.input, self.regions)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required for real audio integration')
    def test_real_old_audio_is_processed_only_in_temporary_directory(self):
        old = PROJECT / 'assets/audio/voice-heroes-v1/shen-gufeng'
        before = {name: processor.voice.digest(old / name) for name in ['chow-1.mp3', 'chow-2.mp3']}
        processor.voice.command(['ffmpeg', '-v', 'error', '-i', str(old / 'chow-1.mp3'), '-i', str(old / 'chow-2.mp3'),
                                 '-filter_complex', '[0:a]apad=pad_dur=1[a];[a][1:a]concat=n=2:v=0:a=1[out]',
                                 '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k', '-y', str(self.input)])
        inspection = processor.inspect_batch(self.input, 2)
        self.assertTrue(inspection['can_process'])
        result = processor.process_batch(self.hero, self.batch, self.input)
        self.assertEqual(result['status'], 'processed')
        for name in before:
            self.assertEqual(processor.voice.digest(old / name), before[name])
        manifest = json.loads((self.source / 'test-hero/manifest.json').read_text('utf-8'))
        for clip in manifest['clips']:
            self.assertEqual(clip['levels']['clipped_samples'], 0)
            self.assertLessEqual(clip['after']['input_tp'], -1)
            probe = processor.voice.probe(self.root / clip['file'])['streams'][0]
            self.assertEqual((probe['codec_name'], probe['sample_rate'], probe['channels']), ('mp3', '44100', 1))


if __name__ == '__main__':
    unittest.main()
