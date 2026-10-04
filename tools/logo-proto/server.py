#!/usr/bin/env python3
"""The Smart-redraw helper: a small LOCAL server the Isnaevy Lab can ask to run the logo pipeline.

    .venv/bin/python server.py                      # http://127.0.0.1:8765
    .venv/bin/python server.py --origin http://localhost:3002

  GET  /health   -> {"ok": true, "ready": ..., "busy": ..., "styles": [...], "modes": [...], ...}
  POST /redraw?style=minimal&mode=standard    body: the image bytes (Content-Type: image/*)
                 -> a stream of JSON lines: progress events, then {"done": true, "svg": ..., "stats": ...}
                    or {"error": ...}. Closing the connection cancels the job.

What it promises, and how:
  * Loopback only. It binds 127.0.0.1 and has no option to bind anything else.
  * Only the app may call it from a browser. CORS allows the listed origins and nothing else, POSTs
    from any other origin are refused outright, and the Host header must be this machine (so a
    web page cannot reach it by pointing its own domain name at 127.0.0.1).
  * No network calls. The worker runs with the Hugging Face offline flags set; it uses the models
    already on this Mac and fails clearly if one is missing.
  * It keeps nothing. Each job gets a private temp folder that is deleted when the job ends, however
    it ends (done, error, cancel, timeout, crash), and the folder root is removed on exit. It does
    not log file names or contents.
  * One job at a time; a second gets 429. Uploads are capped (default 25 MB, 60 megapixels).
  * Each job is a separate process, so cancel and timeout genuinely stop the work and free the memory.
"""
from __future__ import annotations

import argparse
import atexit
import io
import json
import os
import select
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from PIL import Image

HERE = Path(__file__).resolve().parent
VERSION = "1"
HOST = "127.0.0.1"                                  # not configurable, on purpose
DEFAULT_PORT = 8765
DEFAULT_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")
STYLES = ("minimal", "hand-drawn", "bold logo", "elegant", "cute", "technical")
MODES = ("standard", "artist")
MODELS = {"birefnet": "ZhengPeng7/BiRefNet", "qwen2.5-vl": "mlx-community/Qwen2.5-VL-7B-Instruct-4bit",
          "flux.2 klein 4b": "black-forest-labs/FLUX.2-klein-4B"}
MAX_PIXELS = 60_000_000


def models_present() -> dict[str, bool]:
    """Which of the three models are already in the Hugging Face cache. Presence only: nothing is loaded."""
    root = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub"
    return {name: (root / ("models--" + repo.replace("/", "--"))).exists() for name, repo in MODELS.items()}


class Config:
    def __init__(self, origins, max_bytes, timeout, worker_cmd, temp_root, port, beat=2.0):
        self.origins = tuple(origins)
        self.max_bytes = max_bytes
        self.timeout = timeout
        self.worker_cmd = worker_cmd
        self.temp_root = temp_root
        self.port = port
        self.beat = beat
        self.lock = threading.Lock()
        self.jobs_done = 0


def _is_final(line: bytes) -> bool:
    """A line that ends the protocol: the result, or an error the worker reported itself."""
    try:
        obj = json.loads(line)
    except ValueError:
        return False
    return bool(obj.get("done")) or "error" in obj


class ClientGone(Exception):
    pass


class Handler(BaseHTTPRequestHandler):
    server_version = "IsnaevyHelper/" + VERSION
    protocol_version = "HTTP/1.0"                   # the stream ends when the connection closes

    cfg: Config

    # ------------------------------------------------------------------ plumbing
    def log_message(self, fmt, *args):             # method, path and status only: no bodies, no names
        sys.stderr.write("[helper] " + (fmt % args).split("?")[0] + "\n")

    def _origin_ok(self) -> bool:
        o = self.headers.get("Origin")
        return o is None or o in self.cfg.origins

    def _host_ok(self) -> bool:
        return (self.headers.get("Host") or "") in (f"127.0.0.1:{self.cfg.port}", f"localhost:{self.cfg.port}")

    def _cors(self) -> None:
        o = self.headers.get("Origin")
        if o and o in self.cfg.origins:
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")

    def _json(self, status: int, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _guard(self) -> bool:
        if not self._host_ok():
            self._json(403, {"error": "This helper only answers requests addressed to 127.0.0.1 or localhost."})
            return False
        if not self._origin_ok():
            self._json(403, {"error": "That origin is not allowed to use this helper."})
            return False
        return True

    # ------------------------------------------------------------------- routes
    def do_OPTIONS(self):
        if not self._guard():
            return
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        if not self._guard():
            return
        if urlparse(self.path).path != "/health":
            return self._json(404, {"error": "not found"})
        have = models_present()
        self._json(200, {"ok": True, "version": VERSION, "ready": all(have.values()), "models": have,
                         "busy": self.cfg.lock.locked(), "styles": list(STYLES), "modes": list(MODES),
                         "maxUploadMB": self.cfg.max_bytes // (1024 * 1024), "timeoutSeconds": self.cfg.timeout})

    def do_POST(self):
        if not self._guard():
            return
        url = urlparse(self.path)
        if url.path != "/redraw":
            return self._json(404, {"error": "not found"})
        q = parse_qs(url.query)
        style = (q.get("style", ["minimal"])[0] or "minimal").lower().strip()
        mode = (q.get("mode", ["standard"])[0] or "standard").lower().strip()
        if style not in STYLES:
            return self._json(400, {"error": f"Unknown style. Choose one of: {', '.join(STYLES)}."})
        if mode not in MODES:
            return self._json(400, {"error": f"Unknown mode. Choose one of: {', '.join(MODES)}."})
        length = self.headers.get("Content-Length")
        if not length or not length.isdigit():
            return self._json(411, {"error": "Send the image with a Content-Length."})
        if int(length) > self.cfg.max_bytes:
            return self._json(413, {"error": f"That picture is over {self.cfg.max_bytes // (1024 * 1024)} MB."})
        if not (self.headers.get("Content-Type") or "").lower().startswith("image/"):
            return self._json(415, {"error": "Send an image (Content-Type: image/...)."})
        body = self.rfile.read(int(length))
        try:
            with Image.open(io.BytesIO(body)) as im:
                if im.width * im.height > MAX_PIXELS:
                    return self._json(413, {"error": "That picture is over 60 megapixels."})
                im.verify()
        except Exception:
            return self._json(400, {"error": "That file is not a picture this helper can read."})
        if not self.cfg.lock.acquire(blocking=False):
            return self._json(429, {"error": "The helper is busy with another picture."})
        try:
            self._run_job(body, style, mode)
        finally:
            self.cfg.lock.release()

    # --------------------------------------------------------------------- the job
    def _peer_open(self) -> bool:
        try:
            return bool(self.connection.recv(1, socket.MSG_PEEK))
        except (BlockingIOError, InterruptedError):
            return True
        except OSError:
            return False

    def _write(self, data: bytes) -> None:
        try:
            self.wfile.write(data)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError) as e:
            raise ClientGone() from e

    def _run_job(self, body: bytes, style: str, mode: str) -> None:
        work = Path(tempfile.mkdtemp(prefix="job-", dir=self.cfg.temp_root))
        proc = None
        try:
            image = work / "in.bin"
            image.write_bytes(body)
            del body
            env = {**os.environ, "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HUB_DISABLE_TELEMETRY": "1",
                   "PYTHONUNBUFFERED": "1", "TOKENIZERS_PARALLELISM": "false"}
            cmd = [*self.cfg.worker_cmd, str(image), "--style", style, "--mode", mode]
            err = open(work / "stderr.txt", "wb")
            proc = subprocess.Popen(cmd, cwd=HERE, env=env, stdout=subprocess.PIPE, stderr=err, stdin=subprocess.DEVNULL)
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self._cors()
            self.end_headers()
            self._write(json.dumps({"stage": "queued", "state": "done", "pct": 0.0}).encode() + b"\n")

            fd, buf, deadline, finished = proc.stdout.fileno(), b"", time.monotonic() + self.cfg.timeout, False
            while True:
                if time.monotonic() > deadline:
                    self._write(json.dumps({"error": "timeout", "message": f"It took longer than {self.cfg.timeout} s, so it was stopped."}).encode() + b"\n")
                    return
                # Watch the browser's socket as well as the worker's output: a closed tab or a Cancel shows up as
                # EOF on it straight away, rather than as a failed write at the next heartbeat.
                ready, _, _ = select.select([fd, self.connection], [], [], self.cfg.beat)
                if self.connection in ready and not self._peer_open():
                    raise ClientGone()
                if fd not in ready:
                    # A quiet stretch (the redraw is one long call). The heartbeat keeps the page's timer honest and is
                    # also how a closed browser tab is noticed: the write fails and the job is stopped.
                    self._write(b'{"heartbeat":true}\n')
                    continue
                chunk = os.read(fd, 1 << 16)
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    if line.strip():
                        self._write(line + b"\n")
                        finished = finished or _is_final(line)
            if buf.strip():
                self._write(buf + b"\n")
                finished = finished or _is_final(buf)
            code = proc.wait()
            if not finished:
                last = ""
                try:
                    last = (work / "stderr.txt").read_text(errors="replace").strip().splitlines()[-1][:200]
                except Exception:
                    pass
                self._write(json.dumps({"error": "worker-failed", "message": f"The redraw stopped unexpectedly (exit {code}). {last}".strip()}).encode() + b"\n")
            self.cfg.jobs_done += 1
        except ClientGone:
            pass                                    # the page closed or cancelled: nothing to tell it
        finally:
            if proc is not None and proc.poll() is None:
                proc.kill()
                try:
                    proc.wait(timeout=10)
                except Exception:
                    pass
            if proc is not None and proc.stdout:
                proc.stdout.close()
            shutil.rmtree(work, ignore_errors=True)


def make_server(port: int = DEFAULT_PORT, origins=DEFAULT_ORIGINS, max_mb: int = 25, timeout: int = 900,
                worker_cmd: list[str] | None = None, temp_root: str | None = None, beat: float = 2.0) -> ThreadingHTTPServer:
    root = temp_root or tempfile.mkdtemp(prefix="isnaevy-helper-")
    os.chmod(root, 0o700)
    cmd = worker_cmd or [sys.executable, "-m", "logoproto.worker"]
    httpd = ThreadingHTTPServer((HOST, port), Handler)
    httpd.daemon_threads = True
    actual = httpd.server_address[1]
    Handler.cfg = Config(origins, max_mb * 1024 * 1024, timeout, cmd, root, actual, beat)
    httpd.cfg = Handler.cfg
    httpd.temp_root = root
    if temp_root is None:
        atexit.register(shutil.rmtree, root, True)
    return httpd


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--origin", action="append", help="an app origin allowed to call the helper (repeatable); default http://localhost:3000 and http://127.0.0.1:3000")
    ap.add_argument("--max-mb", type=int, default=25)
    ap.add_argument("--timeout", type=int, default=900, help="seconds before a job is stopped")
    args = ap.parse_args()
    httpd = make_server(args.port, args.origin or DEFAULT_ORIGINS, args.max_mb, args.timeout)
    have = models_present()
    print(f"Smart-redraw helper on http://{HOST}:{httpd.server_address[1]}  (loopback only)")
    print("allowed origins:", ", ".join(httpd.cfg.origins))
    missing = [k for k, v in have.items() if not v]
    print("models:", "all present" if not missing else "MISSING " + ", ".join(missing) + " (see tools/logo-proto/README or docs/SMART-REDRAW.md)")
    print("Ctrl-C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping")
    finally:
        httpd.server_close()
        shutil.rmtree(httpd.temp_root, ignore_errors=True)


if __name__ == "__main__":
    main()
