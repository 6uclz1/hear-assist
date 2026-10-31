"""ビルド済みの dist を /hear-assist/ 配下として HTTPS で配信する（iPhone 実機での確認用）。

iOS Safari は http で開いたページの WASM が極端に遅く、マイクも使えないため HTTPS で確認する。

使い方: python3 scripts/haas/serve_https.py CERT_DIR [PORT]
CERT_DIR には cert.pem と key.pem を置く（自己署名でよい）。
"""

import functools
import http.server
import ssl
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "dist"
PREFIX = "/hear-assist"


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        if path.startswith(PREFIX):
            path = path[len(PREFIX):] or "/"
        return super().translate_path(path)


def main(cert_dir: str, port: int) -> None:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(f"{cert_dir}/cert.pem", f"{cert_dir}/key.pem")
    handler = functools.partial(Handler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f"serving {ROOT} at https://0.0.0.0:{port}{PREFIX}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 4443)
