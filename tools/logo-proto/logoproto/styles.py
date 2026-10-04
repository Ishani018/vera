"""The six style presets. A preset is words for the redraw plus tracing/cleanup tuning."""
from __future__ import annotations

from dataclasses import dataclass

from .cleanup import CleanupParams


@dataclass(frozen=True)
class Style:
    name: str
    prompt: str
    speckle: int
    corner: int
    cleanup: CleanupParams


COMMON = (
    "Redraw this as flat black line art on a pure white background. "
    "Keep exactly the same silhouette, outline and pose as the reference. "
    "Solid black lines only: no colour, no grey, no shading, no gradients, no texture, no background."
)

STYLES: dict[str, Style] = {
    "minimal": Style(
        "minimal",
        COMMON + " Minimal: a single clean outline plus only the few inner lines needed to recognise it. "
        "Uniform thin line weight, lots of white space.",
        6, 60, CleanupParams(min_area_frac=0.0004, simplify_eps=1.0),
    ),
    "bold": Style(
        "bold",
        COMMON + " Bold logo mark: thick confident outlines, simplified shapes, very few inner details, "
        "reads clearly when tiny.",
        8, 50, CleanupParams(min_area_frac=0.0006, simplify_eps=1.2, fill_frac=0.09),
    ),
    "hand-drawn": Style(
        "hand-drawn",
        COMMON + " Hand-drawn: ink pen sketch, slightly irregular wobbly strokes, a few hatch marks.",
        4, 70, CleanupParams(min_area_frac=0.0002, simplify_eps=0.9),
    ),
    "elegant": Style(
        "elegant",
        COMMON + " Elegant: refined fine lines with graceful curves, delicate and balanced, like an engraving.",
        4, 60, CleanupParams(min_area_frac=0.0003, simplify_eps=0.8),
    ),
    "cute": Style(
        "cute",
        COMMON + " Cute: rounded friendly sticker style, soft round shapes, medium line weight, simple.",
        6, 50, CleanupParams(min_area_frac=0.0004, simplify_eps=1.1),
    ),
    "technical": Style(
        "technical",
        COMMON + " Technical illustration: precise even-weight lines, exact geometry, clean engineering drawing.",
        4, 80, CleanupParams(min_area_frac=0.0002, simplify_eps=0.7),
    ),
}
ALIASES = {"bold-logo": "bold", "bold logo": "bold", "hand drawn": "hand-drawn", "handdrawn": "hand-drawn"}


def get_style(name: str) -> Style:
    key = ALIASES.get(name.lower().strip(), name.lower().strip())
    if key not in STYLES:
        raise SystemExit(f"unknown style {name!r}; choose from {', '.join(STYLES)}")
    return STYLES[key]
