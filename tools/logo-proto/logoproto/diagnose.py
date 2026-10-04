"""Say, in plain words and from measurements, why a photo is likely to have gone wrong.

Never "looks fine": every sentence here comes from a number, and a photo that
passed everything gets an empty list rather than reassurance. The report prints
these next to the result, so a failure is explained where it is seen.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage as ndi


def mask_facts(mask: np.ndarray, full_size: tuple[int, int]) -> dict:
    """What the cutout mask looks like: how much of the picture, and how many separate objects."""
    m = np.asarray(mask) > 127
    h, w = m.shape
    lab, n = ndi.label(m)
    sizes = sorted((int(s) for s in ndi.sum(m, lab, range(1, n + 1))), reverse=True) if n else []
    big = [s for s in sizes if s >= 0.15 * max(sizes, default=1)]
    return {
        "mask_fraction": float(m.mean()),
        "objects": len(big),
        "object_sizes": sizes[:6],
        "source_px": full_size,
    }


def diagnose(facts: dict, analysis: dict, variants: list[dict], long_edge: int = 768) -> list[str]:
    out: list[str] = []
    w, h = facts.get("source_px", (0, 0))
    if w and max(w, h) < long_edge:
        out.append(
            f"The source is small ({w}x{h}) and the redraw is generated at {long_edge} px on the long edge, "
            f"so the edge guide was enlarged {long_edge / max(w, h):.1f}x and any detail beyond what the photo "
            "holds was invented by the model."
        )
    if facts.get("objects", 1) > 1:
        out.append(
            f"The cutout contains {facts['objects']} separate objects (areas {facts['object_sizes'][:facts['objects']]} px). "
            "A logo is one mark; the redraw has to make one picture out of several subjects."
        )
    mf = facts.get("mask_fraction", 0.5)
    if mf < 0.04:
        out.append(f"The cutout is only {mf:.1%} of the picture: BiRefNet found a very small subject, or the wrong one.")
    if mf > 0.9:
        out.append(f"The cutout is {mf:.0%} of the picture: it kept almost everything, so there is no real subject outline to follow.")
    if analysis.get("error"):
        out.append(f"The analysis step failed: {analysis['error']}")
    elif analysis and len(analysis.get("features", [])) < 4:
        out.append(f"Only {len(analysis.get('features', []))} drawable features survived the filter, so the redraw prompt had little to go on.")
    for v in variants:
        c = v["check"]
        if not c["passed"]:
            out.append(f"Variation {v['n']} FAILED: " + "; ".join(c["reasons"]) + ".")
        elif v.get("attempt1"):
            a = v["attempt1"]
            if a["check"].get("passed"):
                out.append(f"Variation {v['n']} was retried (first seed {a['seed']}) by the earlier check, but that first attempt "
                           "passes the current one: the retry was not needed.")
            else:
                out.append(f"Variation {v['n']} needed a retry (first seed {a['seed']}: " + "; ".join(a["check"]["reasons"]) + ").")
        r = (v.get("stats") or {}).get("rungs")
        if r and r["thinner"] > 0.25:
            out.append(f"Variation {v['n']}: {r['thinner']:.0%} of the ink is thinner than the thinnest weight, so the three weights are loose.")
        for s in v.get("sizes", []):
            if not s["passed"]:
                out.append(f"Variation {v['n']} does not hold up at {s['size']} px (silhouette IoU {s['iou']:.2f}).")
    return out


def busyness(raw_ink: np.ndarray, mask: np.ndarray, inset_px: int = 8, min_len: int = 15) -> dict:
    """How many separate strokes are drawn INSIDE the outline of the subject.

    The outline itself is not counted, and neither are the pixels within `inset_px` of it. What is left
    of the skeleton is cut at its junctions and the pieces at least `min_len` px long are counted. A
    clean mark has about ten; a burger drawn with every seed and lettuce frill has hundreds.
    """
    from .strokes import _neighbours, thin

    m = ndi.binary_fill_holes(np.asarray(mask) > 127)
    interior = ndi.binary_erosion(m, iterations=inset_px)
    skel = thin(np.asarray(raw_ink).astype(bool)) & interior
    if not skel.any():
        return {"interior_strokes": 0, "interior_len": 0, "interior_ink": 0.0}
    junction = skel & (_neighbours(skel) * skel >= 3)
    pieces, n = ndi.label(skel & ~ndi.binary_dilation(junction, iterations=1), structure=np.ones((3, 3)))
    sizes = ndi.sum(np.ones_like(pieces), pieces, range(1, n + 1)) if n else []
    return {
        "interior_strokes": int(sum(1 for s in sizes if s >= min_len)),
        "interior_len": int(skel.sum()),
        "interior_ink": float((np.asarray(raw_ink).astype(bool) & interior).sum() / max(1, interior.sum())),
    }
