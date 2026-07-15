#!/usr/bin/env python3
"""Dev server for the site: plain static serving, but with caching disabled
so stale pages can never survive a reload."""
import http.server
import os
import sys

os.chdir(os.path.join(os.path.dirname(__file__), ".."))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
http.server.ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
