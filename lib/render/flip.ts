/**
 * The page turn.
 *
 * A real sheet of paper does not pivot flat about the spine: it lifts, bows
 * away from the gutter, and lands. So the turning leaf is cut into two dozen
 * vertical strips and each is given its own angle, sampled from a curve. The
 * strips share a `preserve-3d` context, so the browser reassembles them into
 * one curved surface.
 *
 * Each strip carries both faces of the leaf — the recto slice and the matching
 * verso slice, mirrored, because a leaf's two sides are hinged on opposite
 * edges. `backface-visibility: hidden` does the swap at the halfway point on
 * its own, so the back of the sheet shows the right page without any bookkeeping.
 *
 * The module is injected into the preview document as a raw string. It must
 * therefore contain no backtick and no dollar-brace, and it talks to the view
 * controller through a small handover object rather than sharing globals.
 */

export const FLIP_SCRIPT = String.raw`
window.__VC_FLIP__ = (function () {
  'use strict';

  var STYLE_ID = 'vc-flip-style';

  /** Vertical strips the turning sheet is cut into. */
  var N = 26;
  /**
   * Adjacent strips meet exactly, but each is composited on its own, so the
   * antialiased edges leave a hairline of background between them. Every face
   * therefore paints this far past its strip on both sides — the same content
   * the neighbour is drawing, at very nearly the same place. Sheet pixels, so
   * it has to be generous: the middle of the sheet can be foreshortened to a
   * sixth of its width, and the seam has to be covered there too.
   */
  var BLEED = 10;
  /**
   * Extra tangent angle, in radians, at the middle of the sheet. Kept at or
   * below 1 so the tangent angle stays monotonic in the progress value, which
   * is what lets a drag be solved for by bisection.
   */
  var MAX_BEND = 0.62;
  var TURN_MS = 500;
  /** A grab nearer the spine than this is treated as being this far out. */
  var GRAB_MIN = 0.35;
  var COMMIT_AT = 0.34;
  /**
   * Progress per millisecond. A flick faster than this completes the turn
   * however little of it was travelled. A quarter of the page in a tenth of a
   * second is roughly what a person means by a flick, and lands near 0.0015.
   */
  var COMMIT_SPEED = 0.0011;
  var SLOP = 6;

  var host = null;
  var leaf = null;
  var strips = [];
  var casts = { left: null, right: null };
  var geom = null;
  var live = null;
  var drag = null;
  var raf = 0;

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function styleSheet() {
    var el = document.getElementById(STYLE_ID);
    if (el) return el;
    el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = [
      '.pagedjs_pages { position: relative; }',
      '.vc-leaf { position: absolute; transform-style: preserve-3d; pointer-events: none; z-index: 6; }',
      '.vc-strip { position: absolute; top: 0; height: 100%; transform-style: preserve-3d; will-change: transform; }',
      '.vc-face { position: absolute; top: 0; bottom: 0; overflow: hidden;',
      '  left: calc(-1 * var(--vc-bleed)); right: calc(-1 * var(--vc-bleed));',
      '  backface-visibility: hidden; -webkit-backface-visibility: hidden; }',
      '.vc-leaf .pagedjs_page { display: block !important; position: absolute !important;',
      '  top: 0 !important; margin: 0 !important; box-shadow: none !important; }',
      '.vc-shade { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }',
      '.vc-flip-fwd .vc-face-back { transform-origin: left center; transform: translateX(100%) rotateY(180deg); }',
      '.vc-flip-back .vc-face-back { transform-origin: right center; transform: translateX(-100%) rotateY(180deg); }',
      '.vc-cast { position: absolute; top: 0; pointer-events: none; z-index: 5; }',
      'html.vc-grab .pagedjs_pages { cursor: grab; }',
      'html.vc-dragging, html.vc-dragging * { cursor: grabbing !important; user-select: none !important; }',
    ].join('\n');
    document.head.appendChild(el);
    return el;
  }

  /* ---------------------------------------------------------------- geometry */

  /**
   * The tangent angle of the sheet at arc-length s, for progress t.
   *
   * The base term takes the whole sheet from flat to flat again. The bend term
   * adds angle in the middle and none at either edge, which is what makes the
   * surface bulge toward the reader instead of staying a plane. Because
   * MAX_BEND is at most 1 and sin(x) <= x, phi never overshoots pi, so the
   * sheet's reach along the page falls monotonically as t grows.
   */
  function angle(t, s, W) {
    return Math.PI * t + MAX_BEND * Math.sin(Math.PI * t) * Math.sin((Math.PI * s) / W);
  }

  /** How far along the page the material point at arc-length s has got to. */
  function reachAt(t, s) {
    var W = geom.W;
    var w = geom.w;
    var u = 0;
    var left = s;
    for (var i = 0; i < N && left > 0; i++) {
      var seg = left < w ? left : w;
      u += seg * Math.cos(angle(t, (i + 0.5) * w, W));
      left -= seg;
    }
    return u;
  }

  /**
   * The progress at which the grabbed point sits under the cursor.
   *
   * Solved rather than approximated so the paper stays pinned to the pointer
   * for the whole drag, however far from the spine it was picked up.
   */
  function progressFor(grab, target) {
    var lo = 0;
    var hi = 1;
    for (var k = 0; k < 18; k++) {
      var mid = (lo + hi) / 2;
      if (reachAt(mid, grab) > target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function rgba(a) {
    return 'rgba(0,0,0,' + (a < 0 ? 0 : a > 0.85 ? 0.85 : a).toFixed(3) + ')';
  }

  /**
   * How dark the sheet is at arc-length s.
   *
   * Two things darken it: the surface turning away from the light, and the
   * crease, which is tightest at the spine and only exists while the leaf is
   * up. Both vanish at either end of the turn, so a sheet that has landed is
   * clean paper again.
   *
   * Front and back share one curve deliberately. Giving the verso its own,
   * darker one puts a visible step between the strip that has just passed
   * edge-on and the one that has not — and a page lying face up at the end of
   * the turn is lit exactly like the one it replaced.
   */
  function shadeAt(t, s, W) {
    var lit = Math.sin(angle(t, s, W));
    if (lit < 0) lit = 0;
    return 0.42 * Math.pow(lit, 1.3) + 0.22 * Math.exp((-3.2 * s) / W) * Math.sin(Math.PI * t);
  }

  /**
   * One wash per strip would read as twenty-six bands, so each strip is shaded
   * from the value at one edge to the value at the other. Adjacent strips agree
   * at the edge they share, which makes the whole sheet one smooth gradient.
   *
   * The shade lives inside the face and bleeds with it. It has to: a face is
   * opaque, so where two strips overlap the one on top hides everything of the
   * one beneath, its shading included. A shade clipped to the strip would leave
   * an unshaded sliver of the neighbour's bleed showing as a pale seam.
   */
  function paintShade(el, a0, a1, lowFirst) {
    el.style.background =
      'linear-gradient(to right, ' + rgba(lowFirst ? a0 : a1) + ' 0%, ' +
      rgba(lowFirst ? a1 : a0) + ' 100%)';
  }

  /* -------------------------------------------------------------------- paint */

  function paintCast(el, cover, toward, t) {
    if (!el) return;
    var a = 0.5 * Math.sin(Math.PI * t) * (0.22 + 0.78 * cover);
    var stop = (8 + 62 * cover).toFixed(1);
    el.style.background =
      'linear-gradient(to ' + toward + ', ' + rgba(a) + ' 0%, rgba(0,0,0,0) ' + stop + '%)';
  }

  function frame(t) {
    if (!geom) return;
    var W = geom.W;
    var w = geom.w;
    var sign = geom.dir;
    var u = 0;
    var z = 0;

    for (var i = 0; i < N; i++) {
      var sMid = (i + 0.5) * w;
      var phi = angle(t, sMid, W);
      var strip = strips[i];
      strip.el.style.transform =
        'translate3d(' + (sign * u).toFixed(2) + 'px,0,' + z.toFixed(2) + 'px) rotateY(' +
        ((-sign * phi * 180) / Math.PI).toFixed(2) + 'deg)';

      // The back face is mirrored inside its strip, so its gradient runs the
      // other way to land on the same paper.
      var a0 = shadeAt(t, i * w, W);
      var a1 = shadeAt(t, (i + 1) * w, W);
      paintShade(strip.near, a0, a1, sign > 0);
      paintShade(strip.far, a0, a1, sign < 0);

      u += w * Math.cos(phi);
      z += w * Math.sin(phi);
    }

    // The leaf's shadow falls on whichever page it is currently over, and the
    // fold's own reach decides how far across that page it stretches.
    var overHome = u > 0 ? u / W : 0;
    var overAway = u < 0 ? -u / W : 0;
    var homeIsRight = sign > 0;
    paintCast(casts.right, homeIsRight ? overHome : overAway, 'right', t);
    paintCast(casts.left, homeIsRight ? overAway : overHome, 'left', t);
  }

  /* -------------------------------------------------------------------- build */

  function stripIds(node) {
    node.removeAttribute('id');
    var withId = node.querySelectorAll('[id]');
    for (var i = 0; i < withId.length; i++) withId[i].removeAttribute('id');
    return node;
  }

  function faceTemplate(pageEl) {
    if (!pageEl) return null;
    return stripIds(pageEl.cloneNode(true));
  }

  function makeFace(template, offset, back, paper) {
    var face = document.createElement('div');
    face.className = back ? 'vc-face vc-face-back' : 'vc-face';
    face.style.backgroundColor = paper;
    if (template) {
      var clone = template.cloneNode(true);
      // The face starts a bleed's width to the left of its strip, so the page
      // inside it has to move the same distance to stay put on the sheet.
      clone.style.left = (offset + BLEED).toFixed(2) + 'px';
      face.appendChild(clone);
    }
    var shade = document.createElement('div');
    shade.className = 'vc-shade';
    face.appendChild(shade);
    return { face: face, shade: shade };
  }

  function slot(left, top, w, h) {
    var el = document.createElement('div');
    el.className = 'vc-cast';
    el.style.left = left.toFixed(2) + 'px';
    el.style.top = top.toFixed(2) + 'px';
    el.style.width = w.toFixed(2) + 'px';
    el.style.height = h.toFixed(2) + 'px';
    return el;
  }

  /**
   * Sets the turn up: measures the leaf where it currently lies, swaps the
   * stationary pages for the ones that will be underneath it, and cuts the
   * strips. Returns false when the turn is not available.
   */
  function start(dir, from, to) {
    var container = host.container();
    if (!container) return false;

    var cur = host.spreadPages(from);
    var next = host.spreadPages(to);
    var nearNum;
    var stationary;
    if (dir === 'forward') {
      nearNum = cur[1];
      stationary = [cur[0], next[1]];
    } else {
      nearNum = cur[0];
      stationary = [next[0], cur[1]];
    }
    if (!nearNum) return false;
    var farNum = dir === 'forward' ? nearNum + 1 : nearNum - 1;

    var homeEl = host.pageEl(nearNum);
    if (!homeEl) return false;

    var pr = homeEl.getBoundingClientRect();
    var cr = container.getBoundingClientRect();
    var zoom = pr.width / homeEl.offsetWidth || 1;
    var W = homeEl.offsetWidth;
    var H = homeEl.offsetHeight;
    var paper = window.getComputedStyle(homeEl).backgroundColor || '#fff';

    geom = {
      W: W,
      H: H,
      w: W / N,
      dir: dir === 'forward' ? 1 : -1,
      zoom: zoom,
      left: (pr.left - cr.left) / zoom,
      top: (pr.top - cr.top) / zoom,
      hinge: dir === 'forward' ? pr.left : pr.right,
    };

    var nearTemplate = faceTemplate(homeEl);
    var farTemplate = faceTemplate(host.pageEl(farNum));

    // Hide the two pages the leaf is carrying and reveal what is behind it,
    // before anything is drawn, so no frame shows the swap.
    host.override(stationary);

    leaf = document.createElement('aside');
    leaf.className = 'vc-leaf ' + (dir === 'forward' ? 'vc-flip-fwd' : 'vc-flip-back');
    leaf.style.left = geom.left.toFixed(2) + 'px';
    leaf.style.top = geom.top.toFixed(2) + 'px';
    leaf.style.width = W.toFixed(2) + 'px';
    leaf.style.height = H.toFixed(2) + 'px';
    leaf.style.setProperty('--vc-bleed', BLEED + 'px');

    strips = [];
    var w = geom.w;
    for (var i = 0; i < N; i++) {
      // A leaf is hinged on opposite edges front and back, so the slice of the
      // verso that backs strip i is counted in from the other side of the page.
      var fromSpine = -i * w;
      var fromEdge = -(W - (i + 1) * w);
      var el = document.createElement('div');
      el.className = 'vc-strip';
      el.style.width = w.toFixed(2) + 'px';
      if (geom.dir > 0) {
        el.style.left = '0px';
        el.style.transformOrigin = 'left center';
      } else {
        el.style.right = '0px';
        el.style.transformOrigin = 'right center';
      }
      var near = makeFace(nearTemplate, geom.dir > 0 ? fromSpine : fromEdge, false, paper);
      var far = makeFace(farTemplate, geom.dir > 0 ? fromEdge : fromSpine, true, paper);
      el.appendChild(near.face);
      el.appendChild(far.face);
      leaf.appendChild(el);
      strips.push({ el: el, near: near.shade, far: far.shade });
    }
    container.appendChild(leaf);

    var leftLeft = geom.dir > 0 ? geom.left - W : geom.left;
    var rightLeft = geom.dir > 0 ? geom.left : geom.left + W;
    casts.left = stationary[0] ? slot(leftLeft, geom.top, W, H) : null;
    casts.right = stationary[1] ? slot(rightLeft, geom.top, W, H) : null;
    if (casts.left) container.appendChild(casts.left);
    if (casts.right) container.appendChild(casts.right);

    live = { dir: dir, from: from, to: to };
    frame(0);
    return true;
  }

  function teardown() {
    if (leaf && leaf.parentNode) leaf.parentNode.removeChild(leaf);
    if (casts.left && casts.left.parentNode) casts.left.parentNode.removeChild(casts.left);
    if (casts.right && casts.right.parentNode) casts.right.parentNode.removeChild(casts.right);
    leaf = null;
    casts = { left: null, right: null };
    strips = [];
    geom = null;
  }

  function finish(committed) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (!live) return;
    var landed = committed ? live.to : live.from;
    live = null;
    teardown();
    host.settle(landed);
    if (committed) host.post(landed);
  }

  /** Fast off the table, slow into the landing — the way a dropped leaf falls. */
  function ease(p) {
    return 1 - Math.pow(1 - p, 2.4);
  }

  function animate(from, to, ms, done) {
    if (raf) cancelAnimationFrame(raf);
    var t0 = 0;
    var step = function (now) {
      if (!t0) t0 = now;
      var p = (now - t0) / ms;
      if (p > 1) p = 1;
      frame(from + (to - from) * ease(p));
      if (p < 1) raf = requestAnimationFrame(step);
      else {
        raf = 0;
        done();
      }
    };
    raf = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ driving */

  function turn(dir) {
    if (!host || !host.ready()) return false;
    if (live) finish(true);
    var st = host.state();
    if (st.mode !== 'spread') return false;
    var target = dir === 'forward' ? st.spread + 1 : st.spread - 1;
    if (target < 0 || target > host.maxSpread()) return false;
    if (!start(dir, st.spread, target)) return false;
    if (reduceMotion()) {
      finish(true);
      return true;
    }
    animate(0, 1, TURN_MS, function () {
      finish(true);
    });
    return true;
  }

  function onDown(event) {
    if (!host || !host.ready()) return;
    if (host.state().mode !== 'spread') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!host.container() || !host.container().contains(event.target)) return;
    if (live) finish(true);
    drag = {
      id: event.pointerId,
      x0: event.clientX,
      started: false,
      dead: false,
      t: 0,
      v: 0,
      lastAt: performance.now(),
      lastT: 0,
      grab: 0,
    };
    try {
      document.documentElement.setPointerCapture(event.pointerId);
    } catch (err) {
      /* capture is a convenience; the drag still works without it */
    }
  }

  function onMove(event) {
    if (!drag || drag.dead || event.pointerId !== drag.id) return;
    var dx = event.clientX - drag.x0;

    if (!drag.started) {
      if (Math.abs(dx) < SLOP) return;
      var st = host.state();
      var dir = dx < 0 ? 'forward' : 'back';
      var target = dir === 'forward' ? st.spread + 1 : st.spread - 1;
      if (target < 0 || target > host.maxSpread() || !start(dir, st.spread, target)) {
        drag.dead = true;
        return;
      }
      // Where the paper was picked up, as a distance from the spine. Grabbing
      // right against the gutter would otherwise make the turn hair-trigger.
      var raw =
        geom.dir > 0 ? (drag.x0 - geom.hinge) / geom.zoom : (geom.hinge - drag.x0) / geom.zoom;
      drag.grab = Math.max(GRAB_MIN * geom.W, Math.min(geom.W, raw));
      drag.started = true;
      document.documentElement.classList.add('vc-dragging');
    }

    var reach =
      geom.dir > 0
        ? (event.clientX - geom.hinge) / geom.zoom
        : (geom.hinge - event.clientX) / geom.zoom;
    if (reach > drag.grab) reach = drag.grab;
    if (reach < -drag.grab) reach = -drag.grab;

    var t = progressFor(drag.grab, reach);
    var now = performance.now();
    var dt = Math.max(1, now - drag.lastAt);
    // Smoothed, but only lightly: a flick is over in three or four moves, and
    // a heavier filter would still be catching up when the button comes up.
    drag.v = drag.v * 0.5 + ((t - drag.lastT) / dt) * 0.5;
    drag.lastAt = now;
    drag.lastT = t;
    drag.t = t;
    frame(t);
  }

  function onUp(event, cancelled) {
    if (!drag || event.pointerId !== drag.id) return;
    var d = drag;
    drag = null;
    document.documentElement.classList.remove('vc-dragging');
    try {
      document.documentElement.releasePointerCapture(d.id);
    } catch (err) {
      /* nothing to release */
    }
    if (d.dead) return;

    if (!d.started) {
      // A press with no drag is still a page turn: which side decides which way.
      if (cancelled) return;
      var rect = host.container().getBoundingClientRect();
      turn(event.clientX < rect.left + rect.width / 2 ? 'back' : 'forward');
      return;
    }

    // Let go fast enough and the leaf carries on whatever the distance says;
    // otherwise how far it travelled decides whether it lands or falls back.
    var commit;
    if (cancelled) commit = false;
    else if (d.v > COMMIT_SPEED) commit = true;
    else if (d.v < -COMMIT_SPEED) commit = false;
    else commit = d.t >= COMMIT_AT;

    var to = commit ? 1 : 0;
    if (reduceMotion()) {
      finish(commit);
      return;
    }
    var ms = Math.max(150, Math.abs(to - d.t) * TURN_MS);
    animate(d.t, to, ms, function () {
      finish(commit);
    });
  }

  function install(api) {
    host = api;
    styleSheet();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', function (e) {
      onUp(e, false);
    });
    document.addEventListener('pointercancel', function (e) {
      onUp(e, true);
    });
  }

  return {
    install: install,
    turn: turn,
    busy: function () {
      return Boolean(live) || Boolean(drag && drag.started);
    },
    /** Test hook: drive the turn to a fixed progress and hold it there. */
    hold: function (dir, t) {
      if (live) finish(false);
      var st = host.state();
      var target = dir === 'forward' ? st.spread + 1 : st.spread - 1;
      if (target < 0 || target > host.maxSpread()) return false;
      if (!start(dir, st.spread, target)) return false;
      frame(t);
      return true;
    },
    /** Test hook: move an already-held turn to a new progress. */
    at: function (t) {
      frame(t);
    },
    release: function (committed) {
      finish(committed);
    },
  };
})();
`;
