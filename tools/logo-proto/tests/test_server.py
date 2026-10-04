"""The Smart-redraw helper's promises, tested over real HTTP with a fake worker (no models)."""
import http.client
import io
import json
import os
import sys
import tempfile
import textwrap
import threading
import time
from pathlib import Path

import pytest
from PIL import Image

import server as helper

ORIGIN = "http://localhost:3000"

FAKE = textwrap.dedent('''
    import json, os, sys, time
    path, mode = sys.argv[1], os.environ.get("FAKE", "ok")
    def emit(**o): sys.stdout.write(json.dumps(o) + "\\n"); sys.stdout.flush()
    emit(stage="start", state="done", pid=os.getpid(), path=path, offline=os.environ.get("HF_HUB_OFFLINE"),
         style=sys.argv[sys.argv.index("--style") + 1], mode=sys.argv[sys.argv.index("--mode") + 1])
    if mode == "crash":
        sys.stderr.write("boom: out of memory\\n"); sys.exit(1)
    if mode == "hang":
        time.sleep(60)
    emit(stage="redraw", state="progress", step=2, of=4, pct=0.5)
    emit(done=True, svg="<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>", stats={"nodes": 7, "path": path})
''')


def png(w=40, h=30) -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (w, h), (200, 100, 50)).save(b, "PNG")
    return b.getvalue()


@pytest.fixture
def make(tmp_path):
    started = []

    def build(fake="ok", **kw):
        script = tmp_path / "fake_worker.py"
        script.write_text(FAKE)
        os.environ["FAKE"] = fake
        root = tempfile.mkdtemp(prefix="test-helper-")
        httpd = helper.make_server(0, kw.pop("origins", (ORIGIN,)), worker_cmd=[sys.executable, str(script)],
                                   temp_root=root, beat=0.2, **kw)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        started.append((httpd, root))
        return httpd, root

    yield build
    for httpd, root in started:
        httpd.shutdown()
        httpd.server_close()
    os.environ.pop("FAKE", None)


def request(httpd, method, path, body=None, headers=None, host=None):
    port = httpd.server_address[1]
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=20)
    h = dict(headers or {})
    if host:
        h["Host"] = host
    c.request(method, path, body=body, headers=h)
    return c, c.getresponse()


def lines(resp):
    out = []
    for raw in resp.read().split(b"\n"):
        if raw.strip():
            out.append(json.loads(raw))
    return out


def post(httpd, style="minimal", mode="standard", body=None, ctype="image/png", origin=ORIGIN):
    h = {"Content-Type": ctype}
    if origin:
        h["Origin"] = origin
    return request(httpd, "POST", f"/redraw?style={style}&mode={mode}", body if body is not None else png(), h)


# ---------------------------------------------------------------- binding and origin

def test_it_binds_to_loopback_only(make):
    httpd, _ = make()
    assert httpd.server_address[0] == "127.0.0.1"


def test_health_answers_and_says_what_it_offers(make):
    httpd, _ = make()
    c, r = request(httpd, "GET", "/health", headers={"Origin": ORIGIN})
    j = json.loads(r.read())
    assert r.status == 200 and j["ok"] is True and j["busy"] is False
    assert j["styles"] == ["minimal", "hand-drawn", "bold logo", "elegant", "cute", "technical"]
    assert j["modes"] == ["standard", "artist"] and set(j["models"]) == {"birefnet", "qwen2.5-vl", "flux.2 klein 4b"}
    assert r.getheader("Access-Control-Allow-Origin") == ORIGIN


def test_a_foreign_origin_gets_no_cors_header_and_cannot_post(make):
    httpd, _ = make()
    c, r = request(httpd, "GET", "/health", headers={"Origin": "http://evil.example"})
    assert r.status == 403 and r.getheader("Access-Control-Allow-Origin") is None
    c, r = post(httpd, origin="http://evil.example")
    assert r.status == 403


def test_the_preflight_is_answered_for_the_app_and_refused_for_anyone_else(make):
    httpd, _ = make()
    c, r = request(httpd, "OPTIONS", "/redraw", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST"})
    assert r.status == 204 and r.getheader("Access-Control-Allow-Origin") == ORIGIN
    assert "POST" in r.getheader("Access-Control-Allow-Methods")
    c, r = request(httpd, "OPTIONS", "/redraw", headers={"Origin": "http://evil.example"})
    assert r.status == 403


def test_a_request_addressed_to_another_host_name_is_refused_dns_rebinding(make):
    httpd, _ = make()
    c, r = request(httpd, "GET", "/health", host="attacker.example:80")
    assert r.status == 403


def test_a_command_line_client_with_no_origin_is_allowed(make):
    httpd, _ = make()
    c, r = post(httpd, origin=None)
    assert r.status == 200


# ------------------------------------------------------------------- input limits

def test_unknown_style_or_mode_is_a_400_that_names_the_choices(make):
    httpd, _ = make()
    c, r = post(httpd, style="neon")
    assert r.status == 400 and "minimal" in json.loads(r.read())["error"]
    c, r = post(httpd, mode="magic")
    assert r.status == 400


def test_every_listed_style_is_accepted(make):
    httpd, _ = make()
    for style in helper.STYLES:
        c, r = post(httpd, style=style.replace(" ", "%20"))
        assert r.status == 200, style
        r.read()


def test_a_non_image_is_refused(make):
    httpd, _ = make()
    c, r = post(httpd, ctype="text/plain")
    assert r.status == 415
    c, r = post(httpd, body=b"this is not a picture")
    assert r.status == 400


def test_an_upload_over_the_limit_is_refused_before_it_is_read(make):
    httpd, _ = make(max_mb=1)
    c = http.client.HTTPConnection("127.0.0.1", httpd.server_address[1], timeout=10)
    c.putrequest("POST", "/redraw?style=minimal")
    c.putheader("Content-Type", "image/png")
    c.putheader("Content-Length", str(2 * 1024 * 1024))
    c.endheaders()
    r = c.getresponse()
    assert r.status == 413


def test_a_missing_content_length_is_a_411(make):
    httpd, _ = make()
    c = http.client.HTTPConnection("127.0.0.1", httpd.server_address[1], timeout=10)
    c.putrequest("POST", "/redraw?style=minimal")
    c.putheader("Content-Type", "image/png")
    c.endheaders()
    assert c.getresponse().status == 411


# ----------------------------------------------------------------------- the job

def test_a_job_streams_progress_then_the_result(make):
    httpd, _ = make("ok")
    c, r = post(httpd, style="bold%20logo", mode="artist")
    assert r.status == 200 and r.getheader("Content-Type") == "application/x-ndjson"
    out = lines(r)
    assert out[0]["stage"] == "queued"
    start = next(x for x in out if x.get("stage") == "start")
    assert start["style"] == "bold logo" and start["mode"] == "artist"
    assert any(x.get("step") == 2 and x.get("of") == 4 for x in out)
    assert out[-1]["done"] is True and out[-1]["svg"].startswith("<svg") and out[-1]["stats"]["nodes"] == 7


def test_the_worker_is_told_to_stay_offline(make):
    httpd, _ = make("ok")
    c, r = post(httpd)
    start = next(x for x in lines(r) if x.get("stage") == "start")
    assert start["offline"] == "1"


def test_a_crashing_worker_ends_the_stream_with_an_error_that_says_what_happened(make):
    httpd, _ = make("crash")
    c, r = post(httpd)
    last = lines(r)[-1]
    assert last["error"] == "worker-failed" and "out of memory" in last["message"]


def test_nothing_is_kept_after_a_job_the_temp_folder_is_empty(make):
    httpd, root = make("ok")
    c, r = post(httpd)
    out = lines(r)
    path = next(x for x in out if x.get("stage") == "start")["path"]
    time.sleep(0.3)
    assert not Path(path).exists()
    assert os.listdir(root) == []


def test_a_second_picture_while_one_is_running_is_told_the_helper_is_busy(make):
    httpd, root = make("hang")
    c1, r1 = post(httpd)
    r1.fp.readline()                                      # the job is running
    c2, r2 = post(httpd)
    assert r2.status == 429
    r1.close(); c1.close()                                # really hang up, so the fake worker does not outlive the test


def test_closing_the_connection_cancels_the_job_kills_the_worker_and_clears_the_folder(make):
    httpd, root = make("hang")
    c, r = post(httpd)
    first = json.loads(r.fp.readline())
    start = json.loads(r.fp.readline())
    pid, path = start["pid"], start["path"]
    r.close(); c.close()                                  # the page cancelled: the response holds the socket too, so close both
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            break
        time.sleep(0.1)
    else:
        pytest.fail("the worker was still alive after the page cancelled")
    time.sleep(0.5)
    assert not Path(path).exists() and os.listdir(root) == []


def test_a_job_that_runs_too_long_is_stopped_and_cleaned_up(make):
    httpd, root = make("hang", timeout=2)
    c, r = post(httpd)
    out = lines(r)
    assert out[-1]["error"] == "timeout"
    pid = next(x for x in out if x.get("stage") == "start")["pid"]
    time.sleep(0.5)
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)
    assert os.listdir(root) == []


def test_the_helper_is_free_again_after_a_job_ends(make):
    httpd, _ = make("ok")
    c, r = post(httpd)
    lines(r)
    time.sleep(0.3)
    c, r = request(httpd, "GET", "/health")
    assert json.loads(r.read())["busy"] is False
    c, r = post(httpd)
    assert r.status == 200
