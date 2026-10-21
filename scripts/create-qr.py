"""Create versioned print QRs: python scripts/create-qr.py --version v1|v2|both.

Dependencies: python -m pip install qrcode pillow
V1 retains its original address and byte-for-byte files for existing printed pieces.
"""
import argparse
from io import BytesIO
from pathlib import Path

import qrcode
import qrcode.image.svg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'qr'
TARGETS = {
    'v1': ('https://phellipe.github.io/fotocordel/', 'fotocordel-qr'),
    'v2': ('https://phellipe.eti.br/fotocordel/v2/', 'fotocordel-v2-qr'),
}


def generate(version: str) -> None:
    url, stem = TARGETS[version]
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=30, border=4
    )
    qr.add_data(url)
    qr.make(fit=True)
    images = {
        'png': qr.make_image(fill_color='#193b88', back_color='white'),
        'svg': qr.make_image(
            image_factory=qrcode.image.svg.SvgPathImage, attrib={'fill': '#193b88'}
        ),
    }
    generated = {}
    for extension, image in images.items():
        buffer = BytesIO()
        image.save(buffer)
        destination = OUT / f'{stem}.{extension}'
        generated[destination] = buffer.getvalue()

    # Do not silently replace an already-issued V1 asset after a library change.
    if version == 'v1':
        for destination, content in generated.items():
            if destination.exists() and destination.read_bytes() != content:
                raise RuntimeError(f'V1 reproduction differs; preserved {destination.name}.')

    OUT.mkdir(parents=True, exist_ok=True)
    for destination, content in generated.items():
        if not destination.exists() or destination.read_bytes() != content:
            destination.write_bytes(content)
    print(f'{version}: {url}; {qr.modules_count} modules plus 4-module quiet zone.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', choices=('v1', 'v2', 'both'), default='both')
    selected = parser.parse_args().version
    for version in TARGETS if selected == 'both' else (selected,):
        generate(version)
