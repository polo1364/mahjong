"""A pronunciation receipt may change only the explicitly authorized homophone."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('voice_parts', ROOT / 'tools/merge-hero-voice-parts.py')
parts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parts)


class ReceiptTextTests(unittest.TestCase):
    def setUp(self):
        self.contract = {'separator': '\n[pause]\n'}
        self.lines = {
            'one': {'text': '熔甲火籙！', 'taggedText': '[refined] 熔甲火籙！'},
            'two': {'text': '星符引燎！', 'taggedText': '[steady] 星符引燎！'},
            'three': {'text': '寒籙封勢！', 'taggedText': '[firm] 寒籙封勢！'},
        }
        self.ids = list(self.lines)
        self.canonical = self.contract['separator'].join(self.lines[key]['taggedText'] for key in self.ids)
        self.actual = self.canonical.replace('籙', '錄')
        self.receipt = {'canonicalText': self.canonical, 'actualTtsText': self.actual,
                        'text': self.actual, 'editorText': self.actual,
                        'pronunciationOverrides': [{'lineId': key, 'from': '籙', 'to': '錄', 'mandarin': 'lu4'}
                                                   for key in ['one', 'three']]}

    def check(self, receipt):
        return parts.receipt_texts(self.contract, self.lines, self.ids, receipt)

    def test_legacy_receipt_still_requires_exact_canonical_text(self):
        self.assertEqual(self.check({'text': self.canonical})['actualTtsText'], self.canonical)
        with self.assertRaises(ValueError):
            self.check({'text': self.actual})

    def test_explicit_alias_preserves_canonical_and_actual_text_separately(self):
        before = copy.deepcopy(self.lines)
        checked = self.check(self.receipt)
        self.assertEqual(checked['canonicalText'], self.canonical)
        self.assertEqual(checked['actualTtsText'], self.actual)
        self.assertEqual(checked['pronunciationOverrides'], self.receipt['pronunciationOverrides'])
        self.assertEqual(self.lines, before)

    def test_missing_duplicate_and_unlisted_aliases_fail(self):
        for overrides in [[], self.receipt['pronunciationOverrides'][:1],
                          self.receipt['pronunciationOverrides'] * 2,
                          self.receipt['pronunciationOverrides'] + [{'lineId': 'two', 'from': '籙', 'to': '錄', 'mandarin': 'lu4'}]]:
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                self.check({**self.receipt, 'pronunciationOverrides': overrides})

    def test_other_homophones_and_tones_are_not_implicitly_authorized(self):
        for key, value in [('from', '火'), ('to', '路'), ('mandarin', 'lu2'), ('lineId', 'unknown')]:
            changed = copy.deepcopy(self.receipt)
            changed['pronunciationOverrides'][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.check(changed)

    def test_any_unrelated_edit_or_omission_in_input_fields_fails(self):
        for key in ['text', 'editorText', 'actualTtsText', 'canonicalText']:
            for value in [None, self.actual.replace('星符', '雷符'), self.actual.replace('[pause]', '')]:
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    self.check({**self.receipt, key: value})

    def test_empty_override_only_works_when_no_lines_need_the_alias(self):
        text = self.lines['two']['taggedText']
        receipt = {'text': text, 'editorText': text, 'actualTtsText': text,
                   'canonicalText': text, 'pronunciationOverrides': []}
        self.assertEqual(parts.receipt_texts(self.contract, self.lines, ['two'], receipt)['actualTtsText'], text)


if __name__ == '__main__':
    unittest.main()
