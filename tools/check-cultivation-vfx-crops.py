"""Read-only alpha-edge audit. Does not modify image pixels."""
from pathlib import Path
import json
from PIL import Image

root = Path(__file__).resolve().parents[1]
report = []
images = []
for path in sorted((root / 'assets/cultivation-vfx').glob('*.png')):
    image = Image.open(path)
    assert image.mode == 'RGBA'
    alpha = image.getchannel('A')
    images.append({'name': path.name, 'size': list(image.size), 'mode': image.mode,
                   'alpha': list(alpha.getextrema()), 'bytes': path.stat().st_size})
    if path.stem == 'monster':
        continue
    width, height = image.size
    for cell in range(8):
        # Match JS Math.round (all dimensions are positive).
        x0, x1 = [int(n * width / 4 + .5) for n in (cell % 4, cell % 4 + 1)]
        y0, y1 = [int(n * height / 2 + .5) for n in (cell // 4, cell // 4 + 1)]
        edge = ([alpha.getpixel((x, y)) for y in (y0, y1 - 1) for x in range(x0, x1)] +
                [alpha.getpixel((x, y)) for x in (x0, x1 - 1) for y in range(y0, y1)])
        visible = sum(v > 32 for v in edge)
        assert visible == 0, f'{path.name} cell {cell}: visible pixels touch crop boundary'
        report.append({'atlas': path.name, 'cell': cell, 'source': [x0, y0, x1-x0, y1-y0],
                       'boundaryAlphaMax': max(edge), 'boundaryPixelsAbove32': visible})
assert len(report) == 48
(root / 'artifacts/cultivation-vfx-crop-checks.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
(root / 'artifacts/cultivation-vfx-image-checks.json').write_text(json.dumps(images, indent=2), encoding='utf-8')
print(json.dumps({'cells': len(report), 'visibleBoundaryPixels': 0,
                  'boundaryAlphaMax': max(r['boundaryAlphaMax'] for r in report),
                  'pngBytes': sum(r['bytes'] for r in images)}))
