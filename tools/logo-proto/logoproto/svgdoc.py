"""A tiny SVG model for black ink on transparent: parse VTracer output, write ours.

Shapes are lists of rings (closed polygons, flattened from Beziers). A shape is
filled even-odd, so a ring nested inside another is a hole. Only what VTracer
emits is understood: M, L, C, Z, absolute or relative, plus translate().
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

import numpy as np

_TOKEN = re.compile(r"([MmLlCcHhVvZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)")


@dataclass
class Shape:
    rings: list[np.ndarray]  # each (n, 2) float, implicitly closed
    fill: str = "#000000"

    @property
    def nodes(self) -> int:
        return int(sum(len(r) for r in self.rings))


@dataclass
class Doc:
    width: float
    height: float
    shapes: list[Shape] = field(default_factory=list)

    @property
    def nodes(self) -> int:
        return sum(s.nodes for s in self.shapes)


def _cubic(p0, p1, p2, p3, steps: int = 12) -> np.ndarray:
    t = np.linspace(0, 1, steps + 1)[1:, None]
    return (
        ((1 - t) ** 3) * p0 + 3 * ((1 - t) ** 2) * t * p1 + 3 * (1 - t) * t * t * p2 + t**3 * p3
    )


def parse_path(d: str, curve_steps: int = 12) -> list[np.ndarray]:
    """Flatten one path's `d` into rings."""
    tokens = [(m.group(1), m.group(2)) for m in _TOKEN.finditer(d)]
    rings: list[np.ndarray] = []
    cur: list[np.ndarray] = []
    pos = np.zeros(2)
    start = np.zeros(2)
    cmd = None
    nums: list[float] = []

    def flush():
        nonlocal cur
        if len(cur) >= 3:
            rings.append(np.array(cur))
        cur = []

    def run(command: str, args: list[float]):
        nonlocal pos, start
        rel = command.islower()
        c = command.upper()
        if c == "M":
            flush()
            p = np.array(args[:2]) + (pos if rel else 0)
            pos = start = p
            cur.append(p.copy())
            rest = args[2:]
            for i in range(0, len(rest) - 1, 2):
                q = np.array(rest[i : i + 2]) + (pos if rel else 0)
                pos = q
                cur.append(q.copy())
        elif c == "L":
            for i in range(0, len(args) - 1, 2):
                q = np.array(args[i : i + 2]) + (pos if rel else 0)
                pos = q
                cur.append(q.copy())
        elif c == "H":
            for a in args:
                pos = np.array([a + (pos[0] if rel else 0), pos[1]])
                cur.append(pos.copy())
        elif c == "V":
            for a in args:
                pos = np.array([pos[0], a + (pos[1] if rel else 0)])
                cur.append(pos.copy())
        elif c == "C":
            for i in range(0, len(args) - 5, 6):
                base = pos if rel else 0
                p1, p2, p3 = (np.array(args[i + k : i + k + 2]) + base for k in (0, 2, 4))
                cur.extend(_cubic(pos, p1, p2, p3, curve_steps))
                pos = p3
        elif c == "Z":
            flush()
            pos = start

    for word, number in tokens:
        if word:
            if cmd is not None and (nums or cmd in "Zz"):
                run(cmd, nums)
            cmd, nums = word, []
            if word in "Zz":
                run(word, [])
                cmd = None
        else:
            nums.append(float(number))
    if cmd is not None and nums:
        run(cmd, nums)
    flush()
    # drop the duplicate closing vertex some encoders write
    out = []
    for r in rings:
        if len(r) > 3 and np.allclose(r[0], r[-1], atol=1e-6):
            r = r[:-1]
        out.append(r)
    return out


def _luma(fill: str) -> float:
    fill = fill.strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{6})", fill)
    if m:
        r, g, b = (int(m.group(1)[i : i + 2], 16) for i in (0, 2, 4))
        return 0.299 * r + 0.587 * g + 0.114 * b
    m = re.fullmatch(r"#([0-9a-fA-F]{3})", fill)
    if m:
        r, g, b = (int(c * 2, 16) for c in m.group(1))
        return 0.299 * r + 0.587 * g + 0.114 * b
    m = re.fullmatch(r"rgb\((\d+),\s*(\d+),\s*(\d+)\)", fill)
    if m:
        r, g, b = (int(x) for x in m.groups())
        return 0.299 * r + 0.587 * g + 0.114 * b
    return {"black": 0.0, "white": 255.0}.get(fill.lower(), 128.0)


def parse_svg(text: str, ink_below: float = 128.0) -> Doc:
    """Read VTracer-style SVG. Keeps only dark fills (ink); light ones are background."""
    root = ET.fromstring(text)
    w = float(re.sub(r"[a-z%]+$", "", root.get("width", "0")) or 0)
    h = float(re.sub(r"[a-z%]+$", "", root.get("height", "0")) or 0)
    if (not w or not h) and root.get("viewBox"):
        _, _, w, h = (float(x) for x in root.get("viewBox").replace(",", " ").split())
    doc = Doc(w, h)
    for el in root.iter():
        if not el.tag.endswith("path"):
            continue
        fill = el.get("fill", "#000000")
        if _luma(fill) >= ink_below:
            continue
        rings = parse_path(el.get("d", ""))
        tx = ty = 0.0
        m = re.search(r"translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)", el.get("transform", ""))
        if m:
            tx, ty = float(m.group(1)), float(m.group(2))
        rings = [r + np.array([tx, ty]) for r in rings]
        if rings:
            doc.shapes.append(Shape(rings, fill))
    return doc


def _fmt(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def ring_to_d(ring: np.ndarray, smooth: bool, corner_deg: float = 55.0) -> str:
    n = len(ring)
    if not smooth or n < 4:
        return "M" + " L".join(f"{_fmt(x)},{_fmt(y)}" for x, y in ring) + " Z"
    # Catmull-Rom to cubic Bezier, with corners kept sharp.
    prev = np.roll(ring, 1, axis=0)
    nxt = np.roll(ring, -1, axis=0)
    a, b = ring - prev, nxt - ring
    la, lb = np.linalg.norm(a, axis=1) + 1e-9, np.linalg.norm(b, axis=1) + 1e-9
    cosang = np.clip((a * b).sum(1) / (la * lb), -1, 1)
    corner = np.degrees(np.arccos(cosang)) > corner_deg
    tang = (nxt - prev) / 6.0
    tang[corner] = 0
    parts = [f"M{_fmt(ring[0][0])},{_fmt(ring[0][1])}"]
    for i in range(n):
        j = (i + 1) % n
        c1 = ring[i] + (tang[i] if not corner[i] else (ring[j] - ring[i]) / 3.0)
        c2 = ring[j] - (tang[j] if not corner[j] else (ring[j] - ring[i]) / 3.0)
        parts.append(
            f"C{_fmt(c1[0])},{_fmt(c1[1])} {_fmt(c2[0])},{_fmt(c2[1])} {_fmt(ring[j][0])},{_fmt(ring[j][1])}"
        )
    return " ".join(parts) + " Z"


def write_svg(doc: Doc, smooth: bool = True) -> str:
    """Ink on a transparent background: no <rect>, no white fills."""
    out = [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{_fmt(doc.width)}" height="{_fmt(doc.height)}" viewBox="0 0 {_fmt(doc.width)} {_fmt(doc.height)}">'
    ]
    for s in doc.shapes:
        d = " ".join(ring_to_d(r, smooth) for r in s.rings)
        out.append(f'<path d="{d}" fill="{s.fill}" fill-rule="evenodd"/>')
    out.append("</svg>")
    return "\n".join(out)
