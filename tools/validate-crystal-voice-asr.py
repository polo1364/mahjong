"""Transcribe the five crystal-name source batches with local Whisper small.

Run with the isolated ASR virtual environment. Model downloads remain outside
the project. The default run never passes expected text to the model. The
separate --vocabulary-prompt run explicitly supplies all 42 names for comparison.
ASR output is supporting evidence, not a substitute for human listening.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import numpy as np

os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source" / "audio" / "voice-crystal-v1"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-cache", type=Path, required=True)
    parser.add_argument("--vocabulary-prompt", action="store_true")
    args = parser.parse_args()
    if args.model_cache.resolve().is_relative_to(ROOT):
        raise ValueError("Keep the ASR model cache outside the game project")
    contract = json.loads((SOURCE / "lines.json").read_text(encoding="utf-8"))
    vocabulary = sorted(line["text"].rstrip("。") for batch in contract["batches"] for line in batch["lines"])
    initial_prompt = "牌名詞彙：" + "、".join(vocabulary) if args.vocabulary_prompt else None
    output = SOURCE / ("asr-vocabulary-transcript.json" if args.vocabulary_prompt else "asr-transcript.json")
    if output.exists():
        backups = SOURCE / "backups"
        backups.mkdir(parents=True, exist_ok=True)
        shutil.copy2(output, backups / (output.name + ".bak." + datetime.now().strftime("%Y%m%d-%H%M%S-%f")))
    report = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "engine": "faster-whisper", "engine_version": importlib.metadata.version("faster-whisper"),
        "model": "Systran/faster-whisper-small", "model_origin": "https://huggingface.co/Systran/faster-whisper-small",
        "settings": {"device": "cpu", "compute_type": "int8", "language": "zh", "beam_size": 5,
                     "temperature": 0, "condition_on_previous_text": False, "initial_prompt": initial_prompt},
        "expected_vocabulary_prompt": args.vocabulary_prompt,
        "human_listening_verified": False, "text_content_verified": False,
        "boundary": ("ASR with all 42 expected names as vocabulary context; may bias recognition and is not independent content verification."
                     if args.vocabulary_prompt else "Raw ASR without expected text prompts; homophones and omissions need review."),
        "batches": [],
    }
    model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4,
                         download_root=str(args.model_cache))
    for batch in contract["batches"]:
        record = json.loads((SOURCE / "processing" / (batch["id"] + ".json")).read_text(encoding="utf-8"))
        audio = ROOT / record["source"]
        if digest(audio) != record["source_sha256"]:
            raise ValueError(f"Source hash changed: {batch['id']}")
        # Decode with the already validated FFmpeg path; PyAV 19 removed the
        # metadata_errors argument still used by faster-whisper 1.2.1.
        pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-ac", "1", "-ar", "16000",
            "-f", "f32le", "pipe:1"], capture_output=True, check=True).stdout
        segments, info = model.transcribe(np.frombuffer(pcm, dtype="<f4"), language="zh", beam_size=5,
            temperature=0, condition_on_previous_text=False, word_timestamps=True, initial_prompt=initial_prompt)
        transcript = [{"start": s.start, "end": s.end, "text": s.text,
            "avg_logprob": s.avg_logprob, "no_speech_prob": s.no_speech_prob,
            "words": [{"start": w.start, "end": w.end, "word": w.word, "probability": w.probability}
                      for w in s.words or []]} for s in segments]
        report["batches"].append({
            "id": batch["id"], "source": record["source"], "source_sha256": record["source_sha256"],
            "expected": [{"id": line["id"], "text": line["text"]} for line in batch["lines"]],
            "duration_seconds": info.duration, "language_probability": info.language_probability,
            "text": "".join(s["text"] for s in transcript), "segments": transcript,
        })
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(batch["id"], report["batches"][-1]["text"], flush=True)
    print(f"ASR complete: {len(report['batches'])} batches; review required", flush=True)


if __name__ == "__main__":
    main()
