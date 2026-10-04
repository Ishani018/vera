"""report.html: one contact sheet per photo. Plain HTML, relative image paths, no scripts."""
from __future__ import annotations

import html
from pathlib import Path

CSS = """
body{font:14px/1.45 -apple-system,Helvetica,Arial,sans-serif;margin:24px;color:#1b1815;background:#faf7ee}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
.meta{color:#6b6256;margin:0 0 16px}
table{border-collapse:collapse;width:100%;background:#fff}
th,td{border:1px solid #e4dcc8;padding:8px;vertical-align:top;text-align:left}
th{background:#f3ecd9;font-weight:600}
.cell{width:230px}
.cell img{display:block;width:230px;height:auto;max-height:230px;object-fit:contain;background:#fff}
.chequer img.svg{background-color:#fff;background-image:linear-gradient(45deg,#e8e0cb 25%,transparent 25%),linear-gradient(-45deg,#e8e0cb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e8e0cb 75%),linear-gradient(-45deg,transparent 75%,#e8e0cb 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.pass{display:inline-block;padding:2px 10px;border-radius:3px;background:#d3e8e4;color:#084f49;font-weight:700}
.fail{display:inline-block;padding:2px 10px;border-radius:3px;background:#f6d9d1;color:#a8321d;font-weight:700}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
ul{margin:4px 0 0 18px;padding:0}
"""


def _img(src: str | None, alt: str, cls: str = "") -> str:
    return f'<img class="{cls}" src="{html.escape(src)}" alt="{html.escape(alt)}">' if src else "<em>none</em>"


def _timings(rows: list[dict]) -> str:
    body = "".join(
        f"<tr><td>{html.escape(str(r['stage']))}</td><td class=mono>{r['seconds']:.1f}s</td>"
        f"<td class=mono>{r['peak_rss_gb']:.2f}</td><td class=mono>{r['peak_mlx_gb']:.2f}</td>"
        f"<td>{html.escape(str(r.get('note', '')))}</td></tr>"
        for r in rows
    )
    return ("<table><tr><th>Stage</th><th>Time</th><th>Peak RSS (GB)</th><th>Peak MLX (GB)</th><th>Note</th></tr>"
            + body + "</table>")


def write_report(path: Path, name: str, style: str, analysis: dict, variants: list[dict],
                 stage_rows: list[dict], totals: dict) -> None:
    ana = ""
    if analysis.get("error"):
        ana = f"<p class=fail>Analysis failed: {html.escape(analysis['error'])}</p>"
    elif analysis:
        feats = "".join(f"<li>{html.escape(f)}</li>" for f in analysis.get("features", []))
        ana = (f"<p><b>{html.escape(analysis.get('subject', ''))}</b> &mdash; "
               f"{html.escape(analysis.get('style_prompt', ''))}</p><ul>{feats}</ul>")
    rows = []
    for v in variants:
        c = v["check"]
        badge = '<span class="pass">PASS</span>' if c["passed"] else '<span class="fail">FAIL</span>'
        reasons = "".join(f"<li>{html.escape(r)}</li>" for r in c["reasons"])
        tries = ""
        if v.get("attempt1"):
            a = v["attempt1"]
            tries = ("<p class=mono>Retried: attempt 1 (seed %d) %s &mdash; %s</p>"
                     % (a["seed"], "PASS" if a["check"]["passed"] else "FAIL",
                        "; ".join(a["check"]["reasons"]) or "ok"))
        rows.append(
            f"<tr><td>#{v['n']}<br>{badge}<div class=mono>seed {v['seed']}</div></td>"
            f"<td class=cell>{_img('photo.jpg' if False else v['original'], 'original')}</td>"
            f"<td class=cell>{_img(v['cutout'], 'cutout')}</td>"
            f"<td class=cell>{_img(v['raw'], 'raw redraw')}</td>"
            f"<td class='cell chequer'>{_img(v['svg'], 'final SVG', 'svg')}</td>"
            f"<td class=mono>IoU {c['iou']:.3f}<br>{c['shapes']} shapes<br>{c['nodes']} nodes<br>"
            f"ink {c['ink_fraction']*100:.1f}%<br>redraw {v['redraw_s']:.1f}s<br>trace+clean {v['vector_s']:.1f}s"
            f"<ul>{reasons}</ul>{tries}</td></tr>"
        )
    path.write_text(
        f"<!doctype html><meta charset=utf-8><title>{html.escape(name)} - logo prototype</title>"
        f"<style>{CSS}</style><h1>{html.escape(name)}</h1>"
        f"<p class=meta>style <b>{html.escape(style)}</b> &middot; total {totals['seconds']:.0f}s "
        f"&middot; peak memory {totals['peak_gb']:.1f} GB (RSS or MLX, whichever is higher) "
        f"&middot; FLUX.2 klein 4B, {totals['quant']}-bit</p>"
        f"<h2>Analysis</h2>{ana}"
        "<h2>Variations</h2><table><tr><th>#</th><th>Original</th><th>Cutout</th><th>Raw redraw</th>"
        "<th>Final SVG (transparent)</th><th>Check</th></tr>" + "".join(rows) + "</table>"
        f"<h2>Stage timings</h2>{_timings(stage_rows)}",
        encoding="utf-8",
    )
