"""Serve the static sandbox UI and local agent API using only Python's standard library."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from agent import LocalAgent

ROOT = Path(__file__).resolve().parent
AGENT = LocalAgent()
STATIC_FILES = {"/": "index.html", "/index.html": "index.html", "/styles.css": "styles.css", "/app.js": "app.js"}
MAX_BODY_BYTES = 16_384


class SandboxHandler(BaseHTTPRequestHandler):
    server_version = "LocalAgentSandbox/0.1"

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json(200, {"ok": True, "agent": "local-demo", "api_keys_required": False})
            return
        filename = STATIC_FILES.get(path)
        if filename is None:
            self.send_error(404, "Not found")
            return
        file_path = ROOT / filename
        try:
            body = file_path.read_bytes()
        except OSError:
            self.send_error(404, "Not found")
            return
        content_type = "text/html; charset=utf-8" if filename.endswith(".html") else ("text/css; charset=utf-8" if filename.endswith(".css") else "text/javascript; charset=utf-8")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if urlparse(self.path).path != "/api/chat":
            self._send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid request length."})
            return
        if length < 1 or length > MAX_BODY_BYTES:
            self._send_json(413, {"error": "Request body must be under 16 KB."})
            return
        try:
            request = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"error": "Send a valid JSON request."})
            return
        if not isinstance(request, dict) or not isinstance(request.get("message"), str):
            self._send_json(400, {"error": "A string 'message' field is required."})
            return
        self._send_json(200, AGENT.handle(request["message"]))

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")


def main() -> None:
    host, port = "127.0.0.1", 8000
    server = ThreadingHTTPServer((host, port), SandboxHandler)
    print(f"AI Training Sandbox running at http://{host}:{port}")
    print("Press Ctrl+C to stop. No API keys or extra packages are needed.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local agent server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
