"""Stage 6 (check) tests. Synthetic SVGs and masks only; no models."""
import numpy as np
from PIL import Image, ImageDraw

from logoproto.check import CheckParams, check, iou, rasterise, silhouette

W = H = 200


def disc_mask(r=70, cx=100, cy=100) -> np.ndarray:
    im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(im).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    return np.asarray(im)


def ring_svg(r=70, stroke=6, gap=False) -> str:
    if gap:  # an arc with a big opening: does not enclose anything
        d = f"M {100 - r} 100 A {r} {r} 0 1 1 100 {100 + r}"
        body = f'<path d="{d}" fill="none" stroke="#000" stroke-width="{stroke}"/>'
    else:
        body = f'<circle cx="100" cy="100" r="{r}" fill="none" stroke="#000" stroke-width="{stroke}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{body}</svg>'


def test_rasterise_is_transparent_outside_ink():
    a = rasterise(ring_svg(), W, H)
    assert a.shape == (H, W)
    assert a[0, 0] == 0 and a[100, 100] == 0  # corner and centre are background
    assert a[100, 100 - 70] > 127  # on the ring


def test_iou_basics():
    m = disc_mask() > 127
    assert iou(m, m) == 1.0
    assert iou(m, ~m) == 0.0
    assert iou(np.zeros_like(m), np.zeros_like(m)) == 0.0


def test_closed_outline_fills_to_silhouette():
    sil = silhouette(rasterise(ring_svg(), W, H))
    assert iou(sil, disc_mask() > 127) > 0.9


def test_matching_outline_passes():
    r = check(ring_svg(), shapes=1, nodes=8, mask=disc_mask())
    assert r.passed, r.reasons
    assert r.iou > 0.9
    assert 0 < r.ink_fraction < 0.2


def test_open_outline_fails_on_iou():
    r = check(ring_svg(gap=True), shapes=1, nodes=8, mask=disc_mask())
    assert not r.passed
    assert any("IoU" in x for x in r.reasons)


def test_wrong_size_fails_on_iou():
    r = check(ring_svg(r=35), shapes=1, nodes=8, mask=disc_mask())
    assert not r.passed and r.iou < 0.5


def test_ceilings_are_enforced():
    p = CheckParams(max_shapes=10, max_nodes=100)
    r = check(ring_svg(), shapes=11, nodes=101, mask=disc_mask(), p=p)
    assert not r.passed
    assert any("shapes" in x for x in r.reasons)
    assert any("nodes" in x for x in r.reasons)


def test_no_shapes_fails():
    r = check(ring_svg(), shapes=0, nodes=0, mask=disc_mask())
    assert not r.passed
    assert "no shapes survived" in r.reasons
    assert r.iou == 0.0


def test_as_dict_round_trip():
    d = check(ring_svg(), shapes=1, nodes=8, mask=disc_mask()).as_dict()
    assert set(d) == {"passed", "iou", "shapes", "nodes", "ink_fraction", "reasons"}
