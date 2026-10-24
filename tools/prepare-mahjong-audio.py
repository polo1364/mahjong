"""Prepare the downloaded ElevenLabs cues without synthesizing replacement sounds."""

from array import array
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-source" / "audio"
OUTPUT = ROOT / "assets" / "audio"
SAMPLE_RATE = 44100
CHANNELS = 2
CUES = (
    "draw", "discard", "chow", "pong", "kong", "concealed-kong",
    "flower", "ready", "win", "self-draw", "draw-game", "ui",
    "shuffle", "dice", "wall", "turn", "session-end", "ambience",
)
# The room-tone loop keeps its full length and edges so it repeats without a gap.
LOOP_CUES = ("ambience",)


def run(args, data=None):
    return subprocess.run(
        args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
    ).stdout


def backup(path):
    if path.exists():
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        backup_dir = SOURCE / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        path.rename(backup_dir / (path.name + ".bak." + stamp))


def decode(path):
    samples = array("f")
    samples.frombytes(run([
        "ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le",
        "-ac", str(CHANNELS), "-ar", str(SAMPLE_RATE), "pipe:1",
    ]))
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples or not all(math.isfinite(x) for x in samples):
        raise ValueError(f"Invalid decoded audio: {path}")
    return samples


def db(value):
    return 20 * math.log10(max(value, 1e-12))


def levels(samples):
    peak = max(abs(x) for x in samples)
    rms = math.sqrt(sum(x * x for x in samples) / len(samples))
    return {
        "decoded_duration_seconds": round(len(samples) / CHANNELS / SAMPLE_RATE, 6),
        "sample_peak_dbfs": round(db(peak), 3),
        "rms_dbfs": round(db(rms), 3),
        "clipped_samples": sum(abs(x) >= 1 for x in samples),
    }


def probe(path):
    return json.loads(run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration,size:stream=codec_name,sample_rate,channels", "-of", "json",
        str(path),
    ]))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(samples, path):
    payload = array("f", samples)
    if sys.byteorder != "little":
        payload.byteswap()
    run([
        "ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SAMPLE_RATE),
        "-ac", str(CHANNELS), "-i", "pipe:0", "-codec:a", "libmp3lame",
        "-b:a", "128k", "-map_metadata", "-1", "-y", str(path),
    ], payload.tobytes())


def prepare(cue):
    source = SOURCE / f"{cue}-elevenlabs.mp3"
    original = decode(source)
    frames = len(original) // CHANNELS
    frame_peaks = [max(abs(original[n * 2]), abs(original[n * 2 + 1])) for n in range(frames)]
    peak = max(frame_peaks)
    if peak < 0.001:
        raise ValueError(f"Nearly silent source cue: {cue}")
    # Keep 8 ms before and 40 ms after signal above -48 dB relative to peak.
    threshold = max(10 ** (-65 / 20), peak * 10 ** (-48 / 20))
    active = [n for n, value in enumerate(frame_peaks) if value >= threshold]
    looped = cue in LOOP_CUES
    start = 0 if looped else max(0, active[0] - round(SAMPLE_RATE * 0.008))
    end = frames if looped else min(frames, active[-1] + 1 + round(SAMPLE_RATE * 0.04))
    samples = array("f", original[start * CHANNELS:end * CHANNELS])
    count = len(samples) // CHANNELS
    fade_in = 0 if looped else min(round(SAMPLE_RATE * 0.002), count)
    fade_out = 0 if looped else min(round(SAMPLE_RATE * 0.035), count)
    for frame in range(count if not looped else 0):
        gain = min(1.0, frame / max(1, fade_in), (count - 1 - frame) / max(1, fade_out))
        samples[frame * 2] *= gain
        samples[frame * 2 + 1] *= gain
    pre = levels(samples)
    # RMS matching is bounded by peak headroom; quieter UI/tile cues stay subtle.
    target_rms = -30 if looped else -24 if cue in ("ui", "draw", "turn") else -22
    gain_db = min(target_rms - pre["rms_dbfs"], -7 - pre["sample_peak_dbfs"])
    linear = 10 ** (gain_db / 20)
    samples = array("f", (x * linear for x in samples))
    target = OUTPUT / f"{cue}.mp3"
    backup(target)
    encode(samples, target)
    rendered = decode(target)
    measured = levels(rendered)
    if measured["sample_peak_dbfs"] > -6:
        # Account for MP3 intersample reconstruction overshoot.
        correction = 10 ** ((-6.2 - measured["sample_peak_dbfs"]) / 20)
        samples = array("f", (x * correction for x in samples))
        gain_db += db(correction)
        encode(samples, target)
        rendered = decode(target)
        measured = levels(rendered)
    if measured["sample_peak_dbfs"] > -6 or measured["clipped_samples"]:
        raise ValueError(f"Peak verification failed: {cue}: {measured}")
    return {
        "cue": cue,
        "source": str(source.relative_to(ROOT)).replace("\\", "/"),
        "output": str(target.relative_to(ROOT)).replace("\\", "/"),
        "source_sha256": sha256(source),
        "output_sha256": sha256(target),
        "source_probe": probe(source),
        "output_probe": probe(target),
        "source_levels": levels(original),
        "output_levels": measured,
        "trim_start_seconds": round(start / SAMPLE_RATE, 6),
        "trim_end_seconds": round((frames - end) / SAMPLE_RATE, 6),
        "gain_db": round(gain_db, 3),
        "fade_in_ms": 0 if looped else 2,
        "fade_out_ms": 0 if looped else 35,
    }, rendered


def main():
    manifest_path = SOURCE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if tuple(item["cue"] for item in manifest["cues"]) != CUES:
        raise ValueError(f"Source manifest must contain the {len(CUES)} cues in playback order")
    missing = [cue for cue in CUES if not (SOURCE / f"{cue}-elevenlabs.mp3").is_file()]
    if missing:
        raise FileNotFoundError(f"Missing ElevenLabs original files: {missing}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    metrics = []
    preview = array("f")
    silence = array("f", [0.0] * (round(SAMPLE_RATE * 0.25) * CHANNELS))
    for cue in CUES:
        metric, rendered = prepare(cue)
        metrics.append(metric)
        if cue in LOOP_CUES:
            print(f"{cue}: {metric['output_levels']}")
            continue
        if preview:
            preview.extend(silence)
        preview.extend(rendered)
        print(f"{cue}: {metric['output_levels']}")
    preview_path = OUTPUT / "preview.mp3"
    backup(preview_path)
    encode(preview, preview_path)
    for entry, metric in zip(manifest["cues"], metrics):
        entry["source_sha256"] = metric["source_sha256"]
        entry["output_sha256"] = metric["output_sha256"]
        entry["output_duration_seconds"] = metric["output_levels"]["decoded_duration_seconds"]
    manifest["technical_verification"] = f"{len(CUES)}/{len(CUES)} decoded, non-silent, sample peak <= -6 dBFS, no clipped samples"
    manifest["listening_verification"] = "pending human listening; no subjective audio acceptance claimed"
    backup(manifest_path)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "tool": "ffmpeg / ffprobe",
        "processing": "Edge silence trim, 2 ms fade in, 35 ms fade out, RMS gain with -7 dBFS pre-encode peak ceiling",
        "listening_verified": False,
        "metrics": metrics,
        "preview": {"path": "assets/audio/preview.mp3", "gap_seconds": 0.25, "order": [c for c in CUES if c not in LOOP_CUES]},
    }
    metrics_path = SOURCE / "audio-metrics.json"
    backup(metrics_path)
    metrics_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: {len(CUES)}/{len(CUES)} ElevenLabs source files processed and verified")


if __name__ == "__main__":
    main()
