"""Transcribe one hero-skill source batch without an expected-text prompt.

ASR is evidence for manual comparison, never automatic text or listening
approval. Existing evidence is reused only for the same audio and batch;
different inputs require a new output path.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "art-source/audio/voice-hero-skills-v1/contract.json"
SETTINGS = {
    "model": "small", "device": "cpu", "compute_type": "int8", "cpu_threads": 4,
    "local_files_only": True, "language": "zh", "beam_size": 5, "temperature": 0,
    "condition_on_previous_text": False, "word_timestamps": True, "initial_prompt": None,
}


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def digest_json(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":")).encode("utf-8")).hexdigest()


def load_batch(contract_path, hero_id, batch_id):
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    heroes = [hero for hero in contract["heroes"] if hero["heroId"] == hero_id]
    if len(heroes) != 1:
        raise ValueError(f"Expected one hero in contract: {hero_id}")
    batches = [batch for batch in heroes[0]["batches"] if batch["id"] == batch_id]
    if len(batches) != 1:
        raise ValueError(f"Expected one batch for {hero_id}: {batch_id}")
    lines = batches[0]["lines"]
    if not lines:
        raise ValueError("Cannot transcribe an empty contract batch")
    for line in lines:
        for field in ("id", "text", "direction", "taggedText"):
            if not isinstance(line.get(field), str) or not line[field].strip():
                raise ValueError(f"Batch line requires non-empty {field}")
    if len({line["id"] for line in lines}) != len(lines):
        raise ValueError("Duplicate line IDs in contract batch")
    return [{key: line[key] for key in ("id", "text", "direction", "taggedText")}
            for line in lines]


def existing_report(output, identity):
    if not output.exists():
        return None
    report = json.loads(output.read_text(encoding="utf-8"))
    if (report.get("schemaVersion") != 1 or report.get("status") != "completed"
            or report.get("identity") != identity
            or digest_json(report.get("expected")) != identity["batchSha256"]
            or not isinstance(report.get("segments"), list)
            or not isinstance(report.get("text"), str)
            or report.get("expectedPromptUsed") is not False
            or report.get("humanListeningVerified") is not False
            or report.get("textContentVerified") is not False):
        raise FileExistsError(f"Refusing to overwrite different or incomplete ASR evidence: {output}")
    return report


def transcribe(audio, model_cache):
    # FFmpeg avoids the PyAV 19 metadata_errors incompatibility in the existing
    # faster-whisper environment. The expected contract is never passed here.
    os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    import numpy as np
    from faster_whisper import WhisperModel

    pcm = subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-i", str(audio), "-ac", "1",
        "-ar", "16000", "-f", "f32le", "pipe:1",
    ], capture_output=True, check=True).stdout
    samples = np.frombuffer(pcm, dtype="<f4")
    if not len(samples) or not np.isfinite(samples).all():
        raise ValueError("Decoded audio is empty or contains non-finite samples")
    model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4,
                         local_files_only=True, download_root=str(model_cache))
    segments, info = model.transcribe(
        samples, language="zh", beam_size=5, temperature=0,
        condition_on_previous_text=False, word_timestamps=True, initial_prompt=None,
    )
    result = [{
        "start": segment.start, "end": segment.end, "text": segment.text,
        "avgLogprob": segment.avg_logprob, "noSpeechProb": segment.no_speech_prob,
        "words": [{"start": word.start, "end": word.end, "text": word.word,
                   "probability": word.probability} for word in segment.words or []],
    } for segment in segments]
    return result, len(samples) / 16000, info.language_probability


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hero", required=True)
    parser.add_argument("--batch", required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model-cache", type=Path, required=True)
    args = parser.parse_args()
    audio, output, cache = args.input.resolve(), args.output.resolve(), args.model_cache.resolve()
    if cache.is_relative_to(ROOT):
        raise ValueError("Keep the ASR model cache outside the game project")
    if not cache.is_dir():
        raise FileNotFoundError(f"Local model cache does not exist: {cache}")
    if not audio.is_file():
        raise FileNotFoundError(f"Input audio does not exist: {audio}")
    expected = load_batch(CONTRACT, args.hero, args.batch)
    identity = {
        "heroId": args.hero, "batchId": args.batch, "inputSha256": digest_file(audio),
        "batchSha256": digest_json(expected), "settings": SETTINGS,
    }
    if existing_report(output, identity) is not None:
        print(json.dumps({"status": "reused", "heroId": args.hero, "batchId": args.batch,
                          "output": str(output), "inputSha256": identity["inputSha256"]}))
        return
    segments, duration, language_probability = transcribe(audio, cache)
    if digest_file(audio) != identity["inputSha256"]:
        raise ValueError("Input audio changed during transcription; evidence was not saved")
    report = {
        "schemaVersion": 1, "status": "completed",
        "createdUtc": datetime.now(timezone.utc).isoformat(), "identity": identity,
        "input": str(audio), "contract": str(CONTRACT),
        "engine": "faster-whisper", "engineVersion": importlib.metadata.version("faster-whisper"),
        "expectedPromptUsed": False, "humanListeningVerified": False, "textContentVerified": False,
        "boundary": "Raw ASR only. Homophones, omissions, pronunciation and performance require review; no automatic corrections applied.",
        "expected": expected, "durationSeconds": duration, "languageProbability": language_probability,
        "text": "".join(segment["text"] for segment in segments), "segments": segments,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation also protects evidence if another process writes while
    # transcription is running. A partial file is refused on the next run.
    with output.open("x", encoding="utf-8") as target:
        target.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": "completed", "heroId": args.hero, "batchId": args.batch,
                      "expectedLines": len(expected), "segments": len(segments),
                      "durationSeconds": duration, "output": str(output),
                      "inputSha256": identity["inputSha256"]}))


if __name__ == "__main__":
    main()
