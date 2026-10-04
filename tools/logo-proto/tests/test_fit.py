"""Schneider fitting: few nodes, honest error, corners kept sharp. No models."""
import numpy as np
import pytest
from scipy.spatial import cKDTree

from logoproto.fit import fit_ring, sample


def circle(r=100, n=720, c=(200, 200)):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.stack([c[0] + r * np.cos(t), c[1] + r * np.sin(t)], 1)


def worst_gap(ring, segs):
    """Hausdorff-style: how far is any original point from the fitted curve."""
    # Dense sampling matters: a half-circle segment is ~300 px long, so 60 samples sit ~5 px apart and
    # a point exactly on the curve can read 2-3 px "away" from its nearest sample.
    return float(cKDTree(sample(segs, 600)).query(ring)[0].max())


def test_a_circle_is_a_handful_of_segments_not_hundreds():
    ring = circle()
    segs = fit_ring(ring, tol=1.0)
    assert len(segs) <= 8 < len(ring) / 50
    assert worst_gap(ring, segs) < 1.5


def test_the_fit_stays_inside_the_tolerance_it_was_given():
    t = np.linspace(0, 2 * np.pi, 900, endpoint=False)
    ring = np.stack([200 + (100 + 12 * np.sin(5 * t)) * np.cos(t), 200 + (100 + 12 * np.sin(5 * t)) * np.sin(t)], 1)
    for tol in (0.5, 1.0, 2.0):
        segs = fit_ring(ring, tol)
        assert worst_gap(ring, segs) < tol * 1.6, tol


def test_a_looser_tolerance_never_needs_more_nodes():
    ring = np.vstack([circle(90, 400), circle(90, 400)[:0]])
    counts = [len(fit_ring(ring, t)) for t in (0.4, 1.0, 2.5)]
    assert counts[0] >= counts[1] >= counts[2]


def test_a_square_keeps_its_four_corners_sharp():
    side = np.linspace(0, 100, 60, endpoint=False)
    ring = np.vstack([np.stack([side, np.zeros(60)], 1), np.stack([np.full(60, 100.0), side], 1),
                      np.stack([100 - side, np.full(60, 100.0)], 1), np.stack([np.zeros(60), 100 - side], 1)])
    segs = fit_ring(ring, 1.0)
    assert len(segs) == 4
    # the corner must not be rounded: the curve passes within a pixel of (100, 0)
    assert np.linalg.norm(sample(segs, 60) - np.array([100, 0]), axis=1).min() < 1.0


def test_tiny_rings_do_not_crash():
    assert fit_ring(np.array([[0, 0], [5, 0], [5, 5.0]]), 1.0)


def _noisy_outline(seed=3, n=500, wobble=2.5):
    """A ring of the kind VTracer returns: jagged at the pixel level, with tight little bends."""
    rng = np.random.default_rng(seed)
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    r = 60 + 14 * np.sin(7 * t) + rng.normal(0, wobble, n)
    return np.stack([200 + r * np.cos(t), 200 + r * np.sin(t)], 1)


@pytest.mark.parametrize("seed", range(12))
@pytest.mark.parametrize("tol", [0.8, 2.0])
def test_a_fitted_curve_never_swings_away_from_its_points(seed, tol):
    """Regression: handles of 1,000+ px on tiny segments drew hairlines across the picture."""
    ring = _noisy_outline(seed)
    segs = fit_ring(ring, tol)
    for P in segs:
        arc_chord = np.linalg.norm(P[3] - P[0])
        assert np.linalg.norm(P[1] - P[0]) < 400 and np.linalg.norm(P[2] - P[3]) < 400
    away = cKDTree(ring).query(sample(segs, 300))[0]
    assert away.max() < max(6.0, tol * 4), away.max()


def test_tiny_nearly_closed_runs_do_not_explode():
    t = np.linspace(0, 2 * np.pi * 0.97, 40)  # almost a full loop on a 4 px chord
    ring = np.stack([10 + 3 * np.cos(t), 10 + 3 * np.sin(t)], 1)
    segs = fit_ring(ring, 0.5)
    assert all(np.linalg.norm(P[1] - P[0]) < 60 for P in segs)
