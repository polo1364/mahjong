"""Read-only image inspection. Writes a report; never modifies source images."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def catalog(filename):
    source = (ROOT / filename).read_text(encoding="utf-8")
    match = re.search(r"const all\s*=\s*(\[.*?\]);", source, re.S)
    if not match:
        raise ValueError(f"Cannot locate JSON catalog: {filename}")
    return json.loads(match.group(1))


def expected_assets():
    assets = []
    for kind, module in (("hero", "cultivation-heroes.js"), ("monster", "cultivation-monsters.js")):
        for item in catalog(module):
            assets.append({"id": item["id"], "name": item["name"], "kind": kind, "path": item["image"]})
    for kind, filename, name in (
        ("npc", "npcs/merchant", "雲遊商人"), ("npc", "npcs/blacksmith", "鑄器師"),
        ("scene", "preparation-courtyard", "整備庭院"),
        ("slot", "slots/weapon", "武器欄"), ("slot", "slots/armor", "防具欄"),
        ("slot", "slots/accessory", "飾品欄"),
    ):
        assets.append({"id": filename, "name": name, "kind": kind,
                       "path": f"assets/cultivation-journey/{filename}.png"})
    if len(assets) != 35 or len({item["path"] for item in assets}) != 35:
        raise ValueError("Expected 35 unique asset paths")
    return assets


def inspect(item):
    result = dict(item, errors=[], warnings=[])
    path = ROOT / item["path"]
    if not path.is_file():
        result["errors"].append("missing")
        return result
    result["bytes"] = path.stat().st_size
    result["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    try:
        with Image.open(path) as original:
            original.load()
            width, height = original.size
            result.update(width=width, height=height, mode=original.mode, format=original.format)
            if original.format != "PNG":
                result["errors"].append("not_png")
            alpha = original.convert("RGBA").getchannel("A")
            histogram = alpha.histogram()
            nonzero = alpha.getbbox()
            opaque = alpha.point(lambda value: 255 if value > 240 else 0).getbbox()
            edges = {"top": (0, 0, width, 1), "bottom": (0, height - 1, width, height),
                     "left": (0, 0, 1, height), "right": (width - 1, 0, width, height)}
            edge_data = {}
            for side, box in edges.items():
                counts = alpha.crop(box).histogram()
                edge_data[side] = {"opaque_gt240": sum(counts[241:]),
                                   "soft_alpha1_to240": sum(counts[1:241])}
            result["alpha"] = {"extrema": list(alpha.getextrema()),
                               "transparent_pixels": histogram[0],
                               "partial_pixels": sum(histogram[1:255]),
                               "nonzero_bbox": nonzero, "opaque_gt240_bbox": opaque,
                               "opaque_gt240_margins": ([opaque[0], opaque[1], width - opaque[2], height - opaque[3]] if opaque else None),
                               "edge_pixels": edge_data}
            if item["kind"] != "scene":
                if histogram[0] == 0:
                    result["errors"].append("no_fully_transparent_pixels")
                if not opaque:
                    result["warnings"].append("no_opaque_subject_pixels")
                if any(value["opaque_gt240"] for value in edge_data.values()):
                    result["warnings"].append("opaque_subject_touches_edge_visual_review_required")
                if any(value["soft_alpha1_to240"] for value in edge_data.values()):
                    result["warnings"].append("soft_glow_touches_edge")
            if item["kind"] in ("hero", "monster"):
                result["resolution_requirement"] = "long_side_at_least_1536"
                if max(width, height) < 1536:
                    result["errors"].append("long_side_below_1536")
            elif item["kind"] == "scene":
                result["resolution_requirement"] = "at_least_2048x1152"
                if width < 2048 or height < 1152:
                    result["errors"].append("scene_below_2048x1152")
            else:
                result["resolution_requirement"] = "actual_size_reported_no_minimum_specified"
    except (OSError, ValueError) as error:
        result["errors"].append(f"decode_failed: {error}")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/cultivation-journey-art-validation.json")
    args = parser.parse_args()
    assets = [inspect(item) for item in expected_assets()]
    summary = {"expected": len(assets), "decoded": sum("width" in item for item in assets),
               "missing": sum("missing" in item["errors"] for item in assets),
               "error_assets": sum(bool(item["errors"]) for item in assets),
               "warning_assets": sum(bool(item["warnings"]) for item in assets)}
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "read_only_sources": True,
              "status": "FAIL" if summary["error_assets"] else "PASS_WITH_VISUAL_REVIEW" if summary["warning_assets"] else "PASS",
              "summary": summary,
              "limitations": ["Pixel inspection cannot certify anatomical completeness or art quality.",
                              "Opaque edge contact is a clipping warning; soft glow is counted separately.",
                              "Decoded dimensions do not prove native generation resolution or exclude prior upscaling.",
                              "No browser, game runtime, or device validation is performed."],
              "assets": assets}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], **summary}, ensure_ascii=False))
    return 1 if summary["error_assets"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
