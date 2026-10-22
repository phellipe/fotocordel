"""Prepare local test files or operator-supplied masters; never publish to GitHub.

Test: python commerce/scripts/prepare-private-files.py --test
Masters: python commerce/scripts/prepare-private-files.py --masters D:/private/masters
Master filenames must match catalogue IDs, for example 12-jangada.jpg.
This command does not mark files ready for live sales or upload to cloud storage.
"""
import argparse
import json
import shutil
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
choice = parser.add_mutually_exclusive_group(required=True)
choice.add_argument('--test', action='store_true')
choice.add_argument('--masters', type=Path)
args = parser.parse_args()
catalog = json.loads((ROOT / 'commerce/catalog.json').read_text(encoding='utf-8'))
destination = ROOT / '.commerce-local/files/originals'
destination.mkdir(parents=True, exist_ok=True)
report = []
for photo in catalog:
    source = ROOT / photo['source'] if args.test else args.masters.resolve() / photo['filename']
    if not source.is_file():
        report.append({'id': photo['id'], 'status': 'missing'})
        continue
    with Image.open(source) as image:
        if image.format != 'JPEG':
            raise ValueError(f'{photo["id"]}: arquivo deve ser JPEG real.')
        width, height = ImageOps.exif_transpose(image).size
    shutil.copyfile(source, destination / photo['filename'])
    report.append({'id': photo['id'], 'width': width, 'height': height,
                   'matchesCatalog': width == photo['width'] and height == photo['height'],
                   'status': 'test_fixture' if args.test else 'master_requires_review'})
(ROOT / '.commerce-local/files-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(f'{sum(item["status"] != "missing" for item in report)} arquivos preparados em armazenamento local privado.')
print('Catálogo de produção permanece bloqueado até revisão das dimensões e dos arquivos.')
