"""Split a downloaded ElevenLabs batch into the isolated crystal-name voice clips.

Example:
  python tools/prepare-crystal-voice.py --batch crystal-w --input DOWNLOAD.mp3

Only long silent gaps separate phrases. A count mismatch stops processing.
Matching the expected count is technical evidence, not a speech transcript check.
"""

import argparse
from array import array
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source" / "audio" / "voice-crystal-v1"
OUTPUT = ROOT / "assets" / "audio" / "voice-crystal-v1"
RATE = 44100


def command(args, payload=None):
    result = subprocess.run(
        args, input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
    )
    return result


def backup(path):
    if path.exists():
        folder = SOURCE / "backups"
        folder.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        shutil.copy2(path, folder / (path.name + ".bak." + stamp))


def write_json(path, value):
    backup(path)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode(path):
    data = command([
        "ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE),
        "-f", "f32le", "pipe:1",
    ]).stdout
    samples = array("f")
    samples.frombytes(data)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples or not all(math.isfinite(x) for x in samples):
        raise ValueError(f"Invalid audio: {path}")
    return samples


def db(value):
    return 20 * math.log10(max(value, 1e-12))


def levels(samples):
    return {
        "duration_seconds": round(len(samples) / RATE, 6),
        "sample_peak_dbfs": round(db(max(abs(x) for x in samples)), 3),
        "rms_dbfs": round(db(math.sqrt(sum(x * x for x in samples) / len(samples))), 3),
        "clipped_samples": sum(abs(x) >= 1 for x in samples),
    }


def probe(path):
    return json.loads(command([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration,size:stream=codec_name,sample_rate,channels", "-of", "json", str(path),
    ]).stdout)


def encode(samples, path):
    values = array("f", samples)
    if sys.byteorder != "little":
        values.byteswap()
    command([
        "ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "1",
        "-i", "pipe:0", "-af",
        "alimiter=limit=0.446683592:attack=5:release=60:level=0:latency=1",
        "-codec:a", "libmp3lame", "-b:a", "128k",
        "-map_metadata", "-1", "-y", str(path),
    ], values.tobytes())


def phrase_regions(path, duration, silence_db, min_silence):
    log = command([
        "ffmpeg", "-hide_banner", "-i", str(path), "-af",
        f"silencedetect=noise={silence_db}dB:d={min_silence}",
        "-f", "null", "-",
    ]).stderr.decode("utf-8", errors="replace")
    events = re.findall(r"silence_(start|end):\s*([0-9.]+)", log)
    regions = []
    current_start = 0.0
    for kind, raw in events:
        value = min(duration, float(raw))
        if kind == "start" and value - current_start >= 0.08:
            regions.append((current_start, value))
        elif kind == "end":
            current_start = value
    if not events or events[-1][0] == "end":
        if duration - current_start >= 0.08:
            regions.append((current_start, duration))
    return regions, log


def prepare_clip(samples, region, line, batch_id):
    # Preserve 80 ms before and 120 ms after detected speech boundaries.
    start = max(0, round((region[0] - 0.08) * RATE))
    end = min(len(samples), round((region[1] + 0.12) * RATE))
    clip = array("f", samples[start:end])
    if len(clip) < round(RATE * 0.12):
        raise ValueError(f"Clip too short: {line['id']}")
    fade_in = round(RATE * 0.003)
    fade_out = round(RATE * 0.02)
    for index in range(len(clip)):
        gain = min(1.0, index / fade_in, (len(clip) - 1 - index) / fade_out)
        clip[index] *= max(0, gain)
    before = levels(clip)
    if before["sample_peak_dbfs"] < -55:
        raise ValueError(f"Nearly silent phrase: {line['id']}")
    target_rms = line.get("pre_limiter_target_rms_dbfs", -20)
    gain_db = target_rms - before["rms_dbfs"]
    clip = array("f", (x * 10 ** (gain_db / 20) for x in clip))
    target_folder = OUTPUT if line.get("runtime", True) else SOURCE / "candidates" / batch_id
    target_folder.mkdir(parents=True, exist_ok=True)
    target = target_folder / line["file"]
    backup(target)
    encode(clip, target)
    measured = levels(decode(target))
    if measured["sample_peak_dbfs"] > -6:
        adjustment = -6.2 - measured["sample_peak_dbfs"]
        clip = array("f", (x * 10 ** (adjustment / 20) for x in clip))
        gain_db += adjustment
        encode(clip, target)
        measured = levels(decode(target))
    if measured["sample_peak_dbfs"] > -6 or measured["clipped_samples"]:
        raise ValueError(f"Output peak check failed: {line['id']}")
    return {
        **line,
        "batch_id": batch_id,
        "source_region_seconds": [round(start / RATE, 6), round(end / RATE, 6)],
        "speech_region_seconds": [round(region[0], 6), round(region[1], 6)],
        "gain_db": round(gain_db, 3),
        "pre_limiter_target_rms_dbfs": target_rms,
        "fade_in_ms": 3,
        "fade_out_ms": 20,
        "limiter": {"ceiling_dbfs": -7, "attack_ms": 5, "release_ms": 60, "latency_compensated": True},
        "output": target.relative_to(ROOT).as_posix(),
        "sha256": digest(target),
        "levels": measured,
        "probe": probe(target),
        "text_validation": line.get(
            "text_validation", "expected order only; ASR or human transcript validation pending"
        ),
    }


def rebuild_manifest(contract):
    records_by_id = {}
    order = [line["id"] for batch in contract["batches"] for line in batch["lines"]]
    batches = []
    for batch in contract["batches"]:
        path = SOURCE / "processing" / (batch["id"] + ".json")
        if path.exists():
            result = json.loads(path.read_text(encoding="utf-8"))
            batches.append({key: value for key, value in result.items() if key != "clips"})
            for clip in result["clips"]:
                if not clip.get("runtime", True):
                    continue
                if clip["id"] not in order:
                    raise ValueError(f"Clip is outside the crystal voice contract: {clip['id']}")
                if clip["id"] in records_by_id:
                    raise ValueError(f"Duplicate crystal clip: {clip['id']}")
                target = ROOT / clip["output"]
                if target.parent.resolve() != OUTPUT.resolve() or digest(target) != clip["sha256"]:
                    raise ValueError(f"Clip path or hash does not match its record: {clip['id']}")
                records_by_id[clip["id"]] = clip
    records = [records_by_id[clip_id] for clip_id in order if clip_id in records_by_id]
    voice_path = ROOT / contract["voice_info_source"]
    voice = None
    if voice_path.exists():
        original_voice = json.loads(voice_path.read_text(encoding="utf-8"))
        voice = {key: original_voice[key] for key in [
            "provider", "voice_name", "official_accent_label", "official_language_label",
            "model",
        ] if key in original_voice}
        voice["historical_selection"] = original_voice.get("selection")
        voice["source_path"] = voice_path.relative_to(ROOT).as_posix()
        voice["source_sha256"] = digest(voice_path)
    manifest = {
        "provider": "ElevenLabs",
        "revision": "voice-crystal-v1",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "expected_count": contract["clip_count"],
        "processed_count": len(records),
        "all_clips_processed": len(records) == contract["clip_count"],
        "voice": voice,
        "generation_evidence": contract.get("generation_evidence"),
        "human_listening_verified": False,
        "text_content_verified": False,
        "batches": batches,
        "clips": records,
        "preview_gap_seconds": 0.3,
        "preview_order": [record["id"] for record in records],
        "verification_reports": {
            name: (SOURCE / filename).relative_to(ROOT).as_posix()
            for name, filename in [
                ("technical", "technical-validation.json"),
                ("content", "content-validation.json"),
                ("credits", "credit-ledger.json"),
            ]
            if (SOURCE / filename).exists()
        },
    }
    preview = array("f")
    timeline = []
    for index, record in enumerate(records):
        if preview:
            preview.extend([0.0] * round(RATE * 0.3))
        start = len(preview) / RATE
        preview.extend(decode(ROOT / record["output"]))
        timeline.append({
            "index": index + 1, "id": record["id"], "text": record["text"],
            "start_seconds": round(start, 6),
            "end_seconds": round(len(preview) / RATE, 6),
        })
    if preview:
        path = OUTPUT / "preview.mp3"
        backup(path)
        encode(preview, path)
        manifest["preview"] = {
            "path": path.relative_to(ROOT).as_posix(),
            "sha256": digest(path), "levels": levels(decode(path)),
        }
        write_json(SOURCE / "preview-timeline.json", {
            "preview": path.relative_to(ROOT).as_posix(),
            "preview_sha256": digest(path),
            "duration_seconds": len(preview) / RATE, "clips": timeline,
        })
    write_json(SOURCE / "manifest.json", manifest)
    return manifest


def validate_contract(contract):
    expected_keys = {f"{suit}{n}" for suit in "WTB" for n in range(1, 10)}
    expected_keys.update(["FE", "FS", "FW", "FN", "DC", "DF", "DB"])
    expected_keys.update(f"H{n}" for n in range(1, 9))
    lines = [line for batch in contract["batches"] for line in batch["lines"]]
    if contract.get("revision") != "voice-crystal-v1" or contract["clip_count"] != 42:
        raise ValueError("Expected the isolated 42-name crystal contract")
    if "replacement_batches" in contract or len(lines) != 42:
        raise ValueError("The crystal contract cannot use old replacement batches")
    if {line["tile_key"] for line in lines} != expected_keys:
        raise ValueError("Crystal contract must contain each of the 42 physical tile kinds once")
    for line in lines:
        cue = "tile-" + line["tile_key"].lower()
        if line["id"] != cue or line["file"] != cue + ".mp3":
            raise ValueError(f"Invalid crystal cue or filename: {line['id']}")
    for batch in contract["batches"]:
        if batch["expected_count"] != len(batch["lines"]):
            raise ValueError(f"Batch count mismatch: {batch['id']}")
        expected_text = '\n<break time="1.5s" />\n'.join(line["text"] for line in batch["lines"])
        if batch["generation_text"] != expected_text:
            raise ValueError(f"Batch pause contract mismatch: {batch['id']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--generation-id")
    parser.add_argument("--silence-db", type=float, default=-65)
    parser.add_argument("--min-silence", type=float, default=0.65)
    parser.add_argument("--inspect-only", action="store_true")
    args = parser.parse_args()
    contract = json.loads((SOURCE / "lines.json").read_text(encoding="utf-8"))
    validate_contract(contract)
    all_batches = contract["batches"]
    batch = next((batch for batch in all_batches if batch["id"] == args.batch), None)
    if batch is None:
        raise ValueError(f"Unknown batch: {args.batch}")
    samples = decode(args.input)
    regions, log = phrase_regions(
        args.input, len(samples) / RATE, args.silence_db, args.min_silence
    )
    print(json.dumps({"batch": args.batch, "expected": batch["expected_count"], "detected": len(regions),
                      "regions": regions, "source_levels": levels(samples)}, ensure_ascii=True, indent=2))
    if len(regions) != batch["expected_count"]:
        raise ValueError("Phrase count mismatch; inspect source audio before changing boundaries")
    if args.inspect_only:
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    originals = SOURCE / "originals"
    originals.mkdir(parents=True, exist_ok=True)
    destination = originals / (args.batch + "-elevenlabs.mp3")
    if destination.exists() and digest(destination) != digest(args.input):
        backup(destination)
    if args.input.resolve() != destination.resolve():
        shutil.copy2(args.input, destination)
    processing = SOURCE / "processing"
    processing.mkdir(parents=True, exist_ok=True)
    record_path = processing / (args.batch + ".json")
    previous = json.loads(record_path.read_text(encoding="utf-8")) if record_path.exists() else {}
    source_hash = digest(destination)
    same_source = previous.get("source_sha256") == source_hash
    record = {
        "batch_id": args.batch,
        "generation_id": args.generation_id or (previous.get("generation_id") if same_source else None),
        "source": destination.relative_to(ROOT).as_posix(),
        "download_filename": previous.get("download_filename", args.input.name)
            if same_source else args.input.name,
        "source_sha256": source_hash,
        "source_probe": probe(destination),
        "source_levels": levels(samples),
        "silence_threshold_db": args.silence_db,
        "minimum_gap_seconds": args.min_silence,
        "generation_text": batch["generation_text"],
        "clips": [prepare_clip(samples, region, line, args.batch)
                  for region, line in zip(regions, batch["lines"])],
    }
    if same_source and "credits_used" in previous:
        record["credits_used"] = previous["credits_used"]
    if same_source and "history_export" in previous:
        record["history_export"] = previous["history_export"]
    if "generation_metadata" in batch:
        record["generation_metadata"] = batch["generation_metadata"]
    settings = re.search(r"_sp(\d+)_s(\d+)_sb(\d+)_v(\d+)(?:\D|$)", args.input.name)
    if settings:
        record["generation_metadata"] = {
            **record.get("generation_metadata", {}),
            "voice_name": contract["voice_name"],
            "model": "Eleven v" + settings[4],
            "download_setting_tokens": {"sp": int(settings[1]), "s": int(settings[2]), "sb": int(settings[3])},
            "evidence": "Official downloaded filename; setting tokens preserved without further interpretation.",
        }
    write_json(record_path, record)
    log_path = processing / (args.batch + "-silence.log")
    backup(log_path)
    log_path.write_text(log, encoding="utf-8")
    manifest = rebuild_manifest(contract)
    print(f"PASS: {len(record['clips'])} clips processed; {manifest['processed_count']}/{contract['clip_count']} available")


if __name__ == "__main__":
    main()
