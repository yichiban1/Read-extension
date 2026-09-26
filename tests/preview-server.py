"""Loopback QA server with an explicit allowlist; never serves local config."""
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
FILES = {
    '/': ('tests/reading-layer.html', 'text/html; charset=utf-8'),
    '/narrow': ('tests/narrow.html', 'text/html; charset=utf-8'),
    '/qa.js': ('tests/reading-layer.js', 'text/javascript; charset=utf-8'),
    '/content.js': ('content.js', 'text/javascript; charset=utf-8'),
    '/content.css': ('content.css', 'text/css; charset=utf-8'),
    '/source-mapping.js': ('source-mapping.js', 'text/javascript; charset=utf-8'),
}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        entry = FILES.get(urlsplit(self.path).path)
        if not entry:
            self.send_error(404)
            return
        body = (ROOT / entry[0]).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', entry[1])
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    print('Mocked reading-layer preview: http://127.0.0.1:8765', flush=True)
    HTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
