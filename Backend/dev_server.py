"""Run the API locally for development: `python dev_server.py` (see README).

Wraps the Lambda handler in a tiny HTTP server so the app can talk to it from a phone on the
same Wi-Fi. No daily caps are applied (no RATE_TABLE). Never expose this to the internet.

Reads OPENAI_API_KEY (or LLM_API_KEY) from the environment or from ../.env.
"""

import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))


def _load_env_file() -> None:
    path = Path(__file__).parent.parent / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_env_file()
if "OPENAI_API_KEY" in os.environ:
    os.environ.setdefault("LLM_API_KEY", os.environ["OPENAI_API_KEY"])

from foodfolio.handler import lambda_handler  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", 0))
        event = {
            "requestContext": {
                "http": {"method": "POST", "path": self.path, "sourceIp": "127.0.0.1"}
            },
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": self.rfile.read(length).decode("utf-8"),
        }
        result = lambda_handler(event, None)
        body = result["body"].encode("utf-8")
        self.send_response(result["statusCode"])
        for key, value in result["headers"].items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # health check: open http://<pc-ip>:8787/ in the phone's browser
        body = b"FoodFolio dev API is running"
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8787))
    model = os.environ.get("LLM_MODEL", "gpt-6-luna")
    print(f"FoodFolio dev API on http://0.0.0.0:{port} (model: {model})")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
