#!/usr/bin/env python3
"""
Minimal HTTP server for local development.
Run from the bhtml/ directory:
    python serve.py          # defaults to port 8080
    python serve.py 9000     # custom port
"""
import http.server
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map.update({'.js': 'text/javascript'})
with http.server.HTTPServer(('', port), handler) as httpd:
    print(f'Serving at  http://localhost:{port}/')
    print('Press Ctrl-C to stop.')
    httpd.serve_forever()
