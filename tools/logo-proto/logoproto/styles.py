"""The six style presets. A preset is words for the redraw plus tracing/cleanup tuning."""
from __future__ import annotations

from dataclasses import dataclass

from .cleanup import CleanupParams
from .strokes import StrokeParams


@dataclass(frozen=True)
class Style:
    name: str
    prompt: str
    speckle: int
    corner: int
    cleanup: CleanupParams
    #: weights as fractions of the picture's long edge, thin to heavy, so a style
    #: means the same thing at any working size. Odd-pixel quantised at use.
    ladder_frac: tuple[float, float, float] = (0.004, 0.0065, 0.009)
    min_stroke_frac: float = 0.05    # loose strokes shorter than this share of the long edge are dropped
    min_spur_frac: float = 0.012
    hole_frac: float = 0.0           # enclosed white areas smaller than this share of the picture are filled
    crowd_factor: float = 2.0        # lines closer than this many stroke widths are not thickened (0 = off)


def stroke_params(style: "Style", long_edge: int) -> StrokeParams:
    odd = lambda v: max(1, int(round((v - 1) / 2)) * 2 + 1)
    return StrokeParams(
        ladder=tuple(float(odd(f * long_edge)) for f in style.ladder_frac),
        min_spur_px=max(3, int(style.min_spur_frac * long_edge)),
        min_stroke_px=max(8, int(style.min_stroke_frac * long_edge)),
        hole_frac=style.hole_frac,
        crowd_factor=style.crowd_factor,
    )


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
        6, 60, CleanupParams(min_area_frac=0.0004, simplify_eps=1.0, node_budget=300, snap_vector=False,
                      presimplify_eps=0.8),  # 0.35->0.8 cut nodes ~25% for ~3 points of weight accuracy; see sweep in PROGRESS.md
        # hole_frac was 0.002 (tuned on the pancake). On a dense subject it turns the small white cells between
        # spokes and hatching into solid black wedges (bicycle: 2.5% of the frame), so it is off by default now,
        # and the crowd rule keeps close lines apart. Cost: about twice the nodes. compact() restores the old settings.
        # Measured on the pancake, not guessed. Weights of 0.4/0.65/0.9% of the long edge (3/5/7 px at 768)
        # broke the outline as soon as any detail was removed; 0.6/1.0/1.4% (5/7/11 px) did not, and passes
        # at 32 px. Hole filling above 0.2% turns small gaps into solid black lumps, so it stops there.
        ladder_frac=(0.006, 0.010, 0.014), min_stroke_frac=0.07, hole_frac=0.0, crowd_factor=2.0,
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


def compact(style: "Style") -> "Style":
    """The earlier vector settings: fill small holes, thicken everything. About half the nodes, but on a
    dense subject (spokes, fur, hatching) it fuses close lines into solid blobs."""
    import dataclasses
    return dataclasses.replace(style, hole_frac=0.002, crowd_factor=0.0)
