"""Serve only public website files; private originals and credentials stay inaccessible."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import json

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=4173)
parser.add_argument('--shop-api', default='')
args = parser.parse_args()
PUBLIC = {'index.html', 'styles.css', 'app.js', 'sound.js', 'gallery-data.js',
          'shop.js', 'shop.css', 'shop-config.js', 'compra.html'}


class PublicHandler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def send_head(self):
        parts = Path(unquote(urlsplit(self.path).path).lstrip('/')).parts
        if '..' in parts or any(part.startswith('.') for part in parts):
            self.send_error(404)
            return None
        clean = '/'.join(parts)
        if clean in ('', 'v2'):
            clean += ('/' if clean else '') + 'index.html'
        if clean.endswith('/'):
            clean += 'index.html'
        allowed = clean in PUBLIC or (clean.startswith('v2/') and clean[3:] in PUBLIC) or clean.startswith('assets/')
        target = (ROOT / clean).resolve()
        if not allowed or not target.is_relative_to(ROOT) or not target.is_file():
            self.send_error(404)
            return None
        if clean == 'shop-config.js' and args.shop_api:
            payload = ('window.FOTOCORDEL_SHOP_CONFIG = ' + json.dumps({'enabled': True, 'apiBase': args.shop_api}) + ';\n').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            from io import BytesIO
            return BytesIO(payload)
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None


print(f'Prévia pública: http://127.0.0.1:{args.port}/', flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), PublicHandler).serve_forever()
