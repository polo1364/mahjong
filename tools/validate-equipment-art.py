"""Read-only validation of generated equipment raster assets."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
base = root / 'assets/cultivation-equipment'
rows = []
for folder, count in [('items', 27), ('sets', 4)]:
    paths = sorted((base / folder).glob('*.png'))
    assert len(paths) == count, (folder, len(paths))
    for path in paths:
        with Image.open(path) as im:
            im.load()
            row = {'path': path.relative_to(root).as_posix(), 'size': im.size, 'mode': im.mode}
            assert min(im.size) >= 1024, row
            if folder == 'items':
                assert 'A' in im.getbands(), row
                alpha = im.getchannel('A')
                assert alpha.getextrema() == (0, 255), row
                box = alpha.point(lambda v: 255 if v > 240 else 0).getbbox()
                row['opaqueBounds'] = box
                assert box and box[0] > 0 and box[1] > 0 and box[2] < im.width and box[3] < im.height, row
            rows.append(row)
report = {'status': 'pass', 'count': len(rows), 'note': 'Read-only decode, resolution and opaque-edge checks; visual silhouette reviewed separately.', 'assets': rows}
(root / 'artifacts/equipment-v3/art-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS: 27 alpha equipment PNGs and 4 set showcases decoded; no opaque item silhouette touches an edge.')
