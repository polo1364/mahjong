"""Shrink game images to the size they are shown at, keeping file names, formats and aspect ratios.

Originals are copied once to ../mahjong-original-assets/ before anything is rewritten.
Run again after adding art:  python tools/optimize-assets.py
"""
import os, shutil, sys, time, io
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP = os.path.join(os.path.dirname(ROOT), 'mahjong-original-assets')
# Longest side in pixels for each folder (None keeps the size, 0.5 halves it); first match wins.
RULES = [
    ('assets/pwa', 'skip'), ('assets/cultivation-preview', 'skip'), ('assets/audio', 'skip'),
    # 2026-10-28 art requests (docs/ART_REQUESTS_2026-10-28.md).
    ('assets/cultivation-expedition/regions', 1536), ('assets/cultivation-expedition/events', 768),
    ('assets/cultivation-progression/realms', 256), ('assets/cultivation-progression/skills', 256),
    ('assets/cultivation-progression/trial', 1280), ('assets/cultivation-equipment/seals', 256),
    ('assets/cultivation-journey/monsters', 768), ('assets/cultivation-journey/heroes', 768),
    ('assets/cultivation-journey/npcs', 384), ('assets/cultivation-journey/slots', 256),
    ('assets/cultivation-journey', 1600),
    ('assets/cultivation-equipment/items', 256), ('assets/cultivation-equipment/sets', 768),
    ('assets/cultivation-items', 256),
    ('assets/tiles-crystal', 0.5), ('assets/cultivation-vfx', 0.5), ('assets/monster-skills', 0.5),
    ('assets/start-screen', 1600), ('assets', 1600),
]
SMOOTH = ('assets/start-screen', 'assets/cultivation-journey/preparation', 'assets/moon-salon', 'assets/xianxia')


def write(image, path, fmt, **options):
    # Encode in memory, then retry briefly if another process (server, antivirus) holds the file.
    data = io.BytesIO(); image.save(data, fmt, **options)
    for attempt in range(20):
        try:
            with open(path, 'wb') as f: f.write(data.getvalue())
            return
        except OSError:
            time.sleep(0.25)
    raise OSError('cannot write ' + path)


def rule(rel):
    for prefix, value in RULES:
        if rel == prefix or rel.startswith(prefix + '/'):
            return value
    return None


def main():
    before = after = 0
    for folder, _, files in os.walk(os.path.join(ROOT, 'assets')):
        for name in files:
            if not name.lower().endswith(('.png', '.jpg', '.jpeg')):
                continue
            path = os.path.join(folder, name)
            rel = os.path.relpath(path, ROOT).replace('\\', '/')
            limit = rule(os.path.dirname(rel)) if rule(rel) is None else rule(rel)
            if limit == 'skip' or limit is None:
                continue
            size = os.path.getsize(path)
            backup = os.path.join(BACKUP, rel)
            if not os.path.exists(backup):
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                shutil.copy2(path, backup)
            image = Image.open(backup)
            image.load()
            w, h = image.size
            scale = limit if isinstance(limit, float) else min(1.0, limit / max(w, h))
            if scale < 1:
                image = image.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
            if name.lower().endswith(('.jpg', '.jpeg')):
                write(image.convert('RGB'), path, 'JPEG', quality=84, optimize=True, progressive=True)
            else:
                smooth = rel.startswith(SMOOTH)
                if image.mode not in ('RGB', 'RGBA'):
                    image = image.convert('RGBA')
                if smooth or image.mode == 'RGB':
                    # Painted opaque art: median-cut palette with dithering is visually identical at a third of the size.
                    write(image.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG), path, 'PNG', optimize=True)
                else:
                    # Cut-out art: 256-colour palette with alpha keeps edges and shrinks files ~4x.
                    write(image.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG), path, 'PNG', optimize=True)
            before += size
            after += os.path.getsize(path)
    print(f'images: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')


if __name__ == '__main__':
    sys.exit(main())
