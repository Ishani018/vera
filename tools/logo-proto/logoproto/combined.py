"""One report.html for a whole run: a contact sheet of every photo, and what went wrong.

Reads <root>/<name>/variants.json (a photo that ran) or <root>/<name>/FAILED.json
(a photo that did not). Every photo appears, in the same order as the folder; a
photo that failed is a card that says so, never a gap. Every variation's node count
is flagged against the style's target in red when it is over, which at the moment is all of them.
"""
from __future__ import annotations

import html
import json
from pathlib import Path

from .report import CSS, esc

EXTRA_CSS = """
.sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(520px,1fr));gap:16px}
.card{background:#fff;border:1px solid #e4dcc8;padding:12px}
.card h3{margin:0 0 8px;font-size:15px}
.card.failed{border-color:#a8321d;background:#fdf3f0}
.strip{display:flex;gap:8px;align-items:flex-start}
.strip figure{margin:0;flex:1;min-width:0;font-size:11px}
.strip img{width:100%;height:150px;object-fit:contain;background:#fff;display:block;border:1px solid #efe8d6}
.strip .chequer img{background-color:#fff;background-image:linear-gradient(45deg,#e8e0cb 25%,transparent 25%),linear-gradient(-45deg,#e8e0cb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e8e0cb 75%),linear-gradient(-45deg,transparent 75%,#e8e0cb 75%);background-size:14px 14px;background-position:0 0,0 7px,7px -7px,-7px 0}
.tags span{margin-right:4px}
.over{display:inline-block;padding:0 6px;border-radius:3px;background:#f6d9d1;color:#a8321d;font-weight:700;font-size:11px}
.met{display:inline-block;padding:0 6px;border-radius:3px;background:#d3e8e4;color:#084f49;font-weight:700;font-size:11px}
.hard{border-left:4px solid #a8321d;padding-left:10px;margin:14px 0}
table.t td,table.t th{font-size:13px}
"""

# Named in the brief as the ones likely to go wrong; they get their section whether or not they did.
HARD = ("cats", "vishansoudha", "kitten", "puppy")


def _badge(ok: bool) -> str:
    return f'<span class="{"pass" if ok else "fail"}">{"PASS" if ok else "FAIL"}</span>'


def _node_flag(nodes: int, budget: int | None) -> str:
    if not budget:
        return ""
    return ('<span class="over">OVER ' + str(budget) + "</span>") if nodes > budget else f'<span class="met">&le;{budget}</span>'


def _card(name: str, d: dict) -> str:
    if d.get("failed"):
        f = d["failed"]
        return (f'<div class="card failed"><h3>{esc(name)} &mdash; <span class="fail">FAILED</span></h3>'
                f'<p class="mono">stage: {esc(f["stage"])}<br>{esc(f["error"])}</p></div>')
    v = d["data"]
    figs = [f'<figure><img src="{esc(name)}/original.jpg" alt="original">original<br>'
            f'<span class="mono">{v["facts"]["source_px"][0]}x{v["facts"]["source_px"][1]}</span></figure>',
            f'<figure><img src="{esc(name)}/cutout.png" alt="cutout">cutout<br>'
            f'<span class="mono">{v["facts"]["objects"]} object(s), {v["facts"]["mask_fraction"]:.0%}</span></figure>']
    for x in v["variants"]:
        c, st = x["check"], x.get("stats") or {}
        sizes = " ".join(f'{s["size"]}px {"ok" if s["passed"] else "FAIL"}' for s in x.get("sizes", []))
        r = (st.get("rungs") or {}).get("on_rung")
        figs.append(
            f'<figure class="chequer"><img src="{esc(name)}/{esc(x["svg"])}" alt="final SVG {x["n"]}">'
            f'#{x["n"]} {_badge(c["passed"])}{" retried" if x.get("attempt1") else ""}<br>'
            f'<span class="mono">{c["nodes"]} nodes {_node_flag(c["nodes"], st.get("budget"))}<br>IoU {c["iou"]:.2f}'
            f'{f" &middot; weights {r:.0%}" if r is not None else ""}<br>{esc(sizes)}</span></figure>')
    t = v.get("totals", {})
    return (f'<div class="card"><h3><a href="{esc(name)}/report.html">{esc(name)}</a> &mdash; '
            f'{esc(v["analysis"].get("subject", "?"))}</h3><div class="strip">{"".join(figs)}</div>'
            f'<p class="mono" style="margin:6px 0 0">peak {t.get("peak_gb", 0):.1f} GB</p></div>')


def load(root: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        if (d / "variants.json").exists():
            out[d.name] = {"data": json.loads((d / "variants.json").read_text())}
        elif (d / "FAILED.json").exists():
            out[d.name] = {"failed": json.loads((d / "FAILED.json").read_text())}
    return out


def build(root: Path, style: str = "minimal", node_target: int | None = 300, expected: list[str] | None = None) -> Path:
    photos = load(root)
    missing = [n for n in (expected or []) if n not in photos]
    allv = [(n, x) for n, d in photos.items() if "data" in d for x in d["data"]["variants"]]
    n_pass = sum(1 for _, x in allv if x["check"]["passed"])
    retried = sum(1 for _, x in allv if x.get("attempt1"))
    nodes = [x["check"]["nodes"] for _, x in allv]
    over = sum(1 for k in nodes if node_target and k > node_target)
    failed = [n for n, d in photos.items() if "failed" in d]
    peaks = [d["data"]["totals"].get("peak_gb", 0) for d in photos.values() if "data" in d]
    secs = sum(sum(r["seconds"] for r in d["data"].get("stages", [])) for d in photos.values() if "data" in d)

    summary = (
        f"<p><b>{len(photos)}</b> photos: <b>{len(photos) - len(failed)}</b> ran, <b>{len(failed)}</b> failed outright"
        + (f", <b>{len(missing)}</b> not run ({esc(', '.join(missing))})" if missing else "") + ".<br>"
        f"<b>{len(allv)}</b> variations: <b>{n_pass}</b> PASS, <b>{len(allv) - n_pass}</b> FAIL, <b>{retried}</b> needed a retry.<br>"
        + (f"Nodes {min(nodes)} to {max(nodes)}; <b>{over} of {len(nodes)}</b> are OVER the {node_target}-node target. "
           "The 150 to 300 target is not met and was agreed to be accepted for now.<br>" if nodes else "")
        + f"Peak memory <b>{max(peaks, default=0):.1f} GB</b> (limit 28). Pipeline time {secs / 60:.0f} min "
        "(model loads and cutout/analyse included).</p>")

    hard_names = [n for n in photos if any(h in n.lower() for h in HARD)]
    hard = ""
    for n in hard_names:
        d = photos[n]
        if "failed" in d:
            items = [f"FAILED at {d['failed']['stage']}: {d['failed']['error']}"]
        else:
            items = d["data"].get("diagnosis") or ["The checks found nothing wrong with this one."]
        hard += (f'<div class="hard"><b>{esc(n)}</b><ul>' + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ul></div>")

    rest = ""
    for n, d in photos.items():
        if n in hard_names:
            continue
        items = [f"FAILED at {d['failed']['stage']}: {d['failed']['error']}"] if "failed" in d else d["data"].get("diagnosis", [])
        if items:
            rest += f'<div class="hard"><b>{esc(n)}</b><ul>' + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ul></div>"

    timing = "".join(
        f"<tr><td>{esc(n)}</td><td class=mono>{sum(r['seconds'] for r in d['data'].get('stages', []))/60:.1f} min</td>"
        f"<td class=mono>{d['data']['totals'].get('peak_gb', 0):.1f}</td></tr>"
        for n, d in photos.items() if "data" in d)

    path = root / "report.html"
    path.write_text(
        f"<!doctype html><meta charset=utf-8><title>logo prototype - all photos</title>"
        f"<style>{CSS}{EXTRA_CSS}</style><h1>All photos, style {esc(style)}</h1>"
        f"<p class=meta>FLUX.2 klein 4B 8-bit, edge-map guide. Every variation is shown, passing or not.</p>{summary}"
        f"<h2>Contact sheet</h2><div class=sheet>{''.join(_card(n, d) for n, d in photos.items())}</div>"
        f"<h2>The hard ones</h2><p class=meta>Named in advance as likely to go wrong. Shown whether or not they did.</p>{hard or '<p>None in this run.</p>'}"
        f"<h2>Everything else the checks flagged</h2>{rest or '<p>Nothing.</p>'}"
        f"<h2>Time and memory per photo</h2><table class=t><tr><th>Photo</th><th>Pipeline time</th><th>Peak GB</th></tr>{timing}</table>",
        encoding="utf-8")
    return path


if __name__ == "__main__":
    import sys
    print(build(Path(sys.argv[1])))
