"""Create the QR printed alongside the macrame; python -m pip install qrcode pillow."""
from pathlib import Path
import qrcode
import qrcode.image.svg

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://phellipe.github.io/fotocordel/'
OUT = ROOT / 'assets' / 'qr'
OUT.mkdir(parents=True, exist_ok=True)
qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=30, border=4)
qr.add_data(URL)
qr.make(fit=True)
qr.make_image(fill_color='#193b88', back_color='white').save(OUT / 'fotocordel-qr.png')
qr.make_image(image_factory=qrcode.image.svg.SvgPathImage, attrib={'fill': '#193b88'}).save(OUT / 'fotocordel-qr.svg')
print(f'QR generated for {URL}; {qr.modules_count} modules plus 4-module quiet zone.')
