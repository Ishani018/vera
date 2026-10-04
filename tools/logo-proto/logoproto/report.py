"""report.html: contact sheets. Plain HTML with relative image paths and no scripts."""
from __future__ import annotations

import html
from pathlib import Path

CSS = """
body{font:14px/1.45 -apple-system,Helvetica,Arial,sans-serif;margin:24px;color:#1b1815;background:#faf7ee}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}h3{font-size:15px;margin:22px 0 6px}
.meta{color:#6b6256;margin:0 0 16px}
table{border-collapse:collapse;width:100%;background:#fff}
th,td{border:1px solid #e4dcc8;padding:8px;vertical-align:top;text-align:left}
th{background:#f3ecd9;font-weight:600}
.cell{width:210px}.cell img{display:block;width:210px;height:auto;max-height:230px;object-fit:contain;background:#fff}
.chequer img.svg,.chequer img.px{background-color:#fff;background-image:linear-gradient(45deg,#e8e0cb 25%,transparent 25%),linear-gradient(-45deg,#e8e0cb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e8e0cb 75%),linear-gradient(-45deg,transparent 75%,#e8e0cb 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
.pass{display:inline-block;padding:2px 10px;border-radius:3px;background:#d3e8e4;color:#084f49;font-weight:700}
.fail{display:inline-block;padding:2px 10px;border-radius:3px;background:#f6d9d1;color:#a8321d;font-weight:700}
.small{display:inline-block;padding:0 6px;border-radius:3px;font-size:11px;font-weight:700}
.small.pass{background:#d3e8e4}.small.fail{background:#f6d9d1}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
ul{margin:4px 0 0 18px;padding:0}
.sizes{display:flex;gap:14px;align-items:flex-end}
.sizes figure{margin:0;text-align:center;font-size:11px}
.sizes img.px{display:block;margin:0 auto 4px;image-rendering:auto;border:1px solid #e4dcc8}
.sizes img.big{image-rendering:pixelated;border:1px solid #e4dcc8;margin:0 auto 4px;display:block}
.legend{font-size:12px;color:#6b6256}
.sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.tile{background:#fff;border:1px solid #e4dcc8;padding:8px}.tile img{width:100%;height:190px;object-fit:contain;background:#fff;display:block}
.tile .chequer img{background-color:#fff}
"""


def esc(x) -> str:
    return html.escape(str(x))


def img(src, alt="", cls="", style="") -> str:
    if not src:
        return "<em>none</em>"
    return f'<img class="{cls}" src="{esc(src)}" alt="{esc(alt)}" style="{style}">'


def badge(ok: bool, label=None) -> str:
    return f'<span class="{"pass" if ok else "fail"}">{label or ("PASS" if ok else "FAIL")}</span>'


def timings_table(rows: list[dict]) -> str:
    body = "".join(
        f"<tr><td>{esc(r['stage'])}</td><td class=mono>{r['seconds']:.1f}s</td>"
        f"<td class=mono>{r['peak_rss_gb']:.2f}</td><td class=mono>{r['peak_mlx_gb']:.2f}</td>"
        f"<td>{esc(r.get('note', ''))}</td></tr>" for r in rows)
    return ("<table><tr><th>Stage</th><th>Time</th><th>Peak RSS (GB)</th><th>Peak MLX (GB)</th><th>Note</th></tr>"
            + body + "</table>")


def analysis_block(a: dict) -> str:
    if a.get("error"):
        return f'<p class=fail>Analysis failed: {esc(a["error"])}</p>'
    if not a:
        return ""
    feats = "".join(f"<li>{esc(f)}</li>" for f in a.get("features", []))
    return f"<p><b>{esc(a.get('subject', ''))}</b> &mdash; {esc(a.get('style_prompt', ''))}</p><ul>{feats}</ul>"


def sizes_cell(v: dict) -> str:
    out = []
    for s in v.get("sizes", []):
        px = s["size"]
        out.append(
            f'<figure>{img(s["png"], f"{px}px", "px")}'
            f'{img(s["png"], f"{px}px enlarged", "big", f"width:{px*3}px")}'
            f'<div class=mono>{px}px {badge(s["passed"]).replace("class=", "class=small ", 1) if False else ""}</div>'
            f'<span class="small {"pass" if s["passed"] else "fail"}">{"PASS" if s["passed"] else "FAIL"}</span>'
            f'<div class=mono>IoU {s["iou"]:.2f}<br>thin {s["thinnest_px"]:.2f}px<br>ink {s["ink_alpha"]:.2f}</div></figure>')
    return f'<div class="sizes chequer">{"".join(out)}</div>'


def variant_row(v: dict) -> str:
    c = v["check"]
    reasons = "".join(f"<li>{esc(r)}</li>" for r in c["reasons"])
    tries = ""
    if v.get("attempt1"):
        a = v["attempt1"]
        tries = (f"<p class=mono>Retried: attempt 1 (seed {a['seed']}) "
                 f"{'PASS' if a['check']['passed'] else 'FAIL'} &mdash; {esc('; '.join(a['check']['reasons']) or 'ok')}</p>")
    f = v.get("fidelity") or {}
    st = v.get("stats") or {}
    extra = ""
    if f:
        extra += f"<br>on redraw {f['on_redraw']*100:.0f}%<br>kept {f['kept']*100:.0f}%"
    if st.get("weights"):
        extra += f"<br>weights {', '.join(str(w) for w in st['weights'])} px"
    if st.get("rungs"):
        r = st["rungs"]
        extra += (f"<br><b>{r['on_rung']*100:.0f}%</b> of ink on those weights"
                  f"<br>{r['thinner']*100:.0f}% thinner, {r['thicker']*100:.0f}% thicker")
    if st.get("eps") is not None:
        extra += f"<br>fit tolerance {st['eps']:.1f}px"
    if st.get("budget"):
        over = c["nodes"] > st["budget"]
        extra += (f"<br>node target &le;{st['budget']}: " + ('<span class="fail">OVER</span>' if over else '<span class="pass">met</span>'))
    return (
        f"<tr><td>#{v['n']}<br>{badge(c['passed'])}<div class=mono>seed {v['seed']}</div></td>"
        f"<td class=cell>{img(v['original'], 'original')}</td>"
        f"<td class=cell>{img(v['cutout'], 'cutout')}</td>"
        f"<td class=cell>{img(v['raw'], 'raw redraw')}</td>"
        f"<td class=cell>{img(v.get('compare'), 'compare')}</td>"
        f"<td class='cell chequer'>{img(v['svg'], 'final SVG', 'svg')}</td>"
        f"<td>{sizes_cell(v)}</td>"
        f"<td class=mono>IoU {c['iou']:.3f}<br>{c['shapes']} shape{'s' if c['shapes'] != 1 else ''}<br>"
        f"<b>{c['nodes']} nodes</b><br>ink {c['ink_fraction']*100:.1f}%{extra}<br>"
        + (f"redraw {v['redraw_s']:.1f}s" if v.get('redraw_s') else "redraw reused") +
        f"<br>vector {v.get('vector_s', 0):.1f}s<ul>{reasons}</ul>{tries}</td></tr>")


HEAD = ("<tr><th>#</th><th>Original</th><th>Cutout</th><th>Raw redraw</th>"
        "<th>Raw vs SVG<div class=legend>line positions, not thickness<br>red: only in redraw<br>blue: only in SVG<br>dark: both</div></th>"
        "<th>Final SVG (transparent)</th><th>Small sizes<div class=legend>1:1, and 3x enlarged<br>PASS = the outline still encloses the shape. Thin inner lines fade: see thin and ink.</div></th><th>Check</th></tr>")


def diagnosis_block(items: list[str]) -> str:
    if not items:
        return ""
    return ("<h2>What went wrong, or is likely to</h2><ul>"
            + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ul>")


def write_report(path: Path, name: str, style: str, analysis: dict, variants: list[dict],
                 stage_rows: list[dict], totals: dict, note: str = "", diagnosis: list[str] | None = None) -> None:
    path.write_text(
        f"<!doctype html><meta charset=utf-8><title>{esc(name)} - logo prototype</title>"
        f"<style>{CSS}</style><h1>{esc(name)}</h1>"
        f"<p class=meta>style <b>{esc(style)}</b> &middot; total {totals['seconds']:.0f}s &middot; "
        + (f"peak memory {totals['peak_gb']:.1f} GB (RSS or MLX, whichever is higher) &middot; "
           f"FLUX.2 klein 4B, {totals['quant']}-bit" if totals['peak_gb'] else "no models loaded")
        + (f" &middot; {esc(note)}" if note else "") + "</p>"
        f"{diagnosis_block(diagnosis or [])}<h2>Analysis</h2>{analysis_block(analysis)}"
        f"<h2>Variations</h2><table>{HEAD}{''.join(variant_row(v) for v in variants)}</table>"
        f"<h2>Stage timings</h2>{timings_table(stage_rows)}", encoding="utf-8")
