#!/usr/bin/env python3
"""Mini-proxy die een camera-snapshot met Digest-auth ophaalt en inlogvrij teruggeeft.

De camera vereist Digest-authenticatie, wat nginx niet kan injecteren. Deze proxy
doet de Digest-handshake server-side (pure stdlib, geen dependencies) en levert het
JPEG aan het dashboard via een inlogvrij pad. De credentials blijven in deze
container (uit .env) en belanden nooit in de browser of de cast-stream.
"""
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def load_env_file(path):
    """Lees KEY=VALUE-regels letterlijk in (geen shell/compose-interpretatie).

    Zo blijven $-tekens in een wachtwoord intact, anders dan bij compose-substitutie.
    """
    values = {}
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    except FileNotFoundError:
        pass
    return values


_FILE = load_env_file(os.environ.get("CAMERA_ENV_FILE", "/app/camera.env"))


def cfg(key, default=None):
    # Expliciete environment-variabele wint; anders het gemounte .env-bestand.
    return os.environ.get(key) or _FILE.get(key) or default


SNAPSHOT_URL = cfg("CAMERA_SNAPSHOT_URL")
USER = cfg("CAMERA_USER")
PASSWORD = cfg("CAMERA_PASS")
PORT = int(cfg("CAMERA_PROXY_PORT", "8088"))
TIMEOUT = float(cfg("CAMERA_TIMEOUT", "8"))


def build_opener():
    # HTTPPasswordMgrWithDefaultRealm + DigestAuthHandler regelt de challenge/response.
    mgr = urllib.request.HTTPPasswordMgrWithDefaultRealm()
    mgr.add_password(None, SNAPSHOT_URL, USER, PASSWORD)
    return urllib.request.build_opener(urllib.request.HTTPDigestAuthHandler(mgr))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Query (cache-buster ?ts=) negeren; altijd een verse snapshot ophalen.
        try:
            with build_opener().open(SNAPSHOT_URL, timeout=TIMEOUT) as resp:
                body = resp.read()
                ctype = resp.headers.get("Content-Type", "image/jpeg")
        except Exception as exc:
            self.send_error(502, "Camera unavailable")
            self.log_error("snapshot fetch failed: %s", exc)
            return

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # geen toegangslog-ruis


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
