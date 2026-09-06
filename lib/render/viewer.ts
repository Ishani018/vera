/**
 * The preview's view controller, injected into the rendered document after
 * Paged.js has laid the book out.
 *
 * It only ever changes how the already-paginated pages are *displayed* —
 * spread, scroll or grid, and the page-turn animation. Pagination is never
 * redone for a view change, so flipping through a 300-page book costs nothing.
 *
 * It lives inside the document rather than in the React tree because the pages
 * only exist there, and because scaling and the 3D turn need to act on the page
 * elements themselves.
 */

export type ViewMessage = {
  type: 'versecraft:view';
  mode: 'spread' | 'scroll' | 'grid';
  spread: number;
  /** Scale factor so a spread fits the pane; grid view sets its own. */
  zoom: number;
  /** Set when the change should be animated as a page turn. */
  turn?: 'forward' | 'back' | null;
};

/**
 * Sent back when the reader turns a page inside the preview — by dragging the
 * paper or clicking a side — so the app's own idea of where the book is open
 * follows the reader rather than the other way round.
 */
export type SpreadMessage = {
  type: 'versecraft:spread';
  spread: number;
};

/** Flashes everything a just-changed setting affects. */
export type HighlightMessage = {
  type: 'versecraft:highlight';
  selector: string;
};

export const VIEWER_SCRIPT = String.raw`
(function () {
  var STYLE_ID = 'vc-view-style';
  var state = { mode: 'spread', spread: 0, zoom: 1 };

  /**
   * Page numbers to show instead of the current spread's own.
   *
   * A turn shows neither the spread it is leaving nor the one it is arriving
   * at: the leaf itself carries two of the four pages, and the two that stay
   * put are one from each spread. The flip sets this for the length of the
   * animation and clears it on landing.
   */
  var override = null;

  /**
   * The view stylesheet must not exist while Paged.js is laying the book out.
   * Paged.js polishes every stylesheet in the document first, and its
   * NthOfType handler throws on the :nth-of-type selectors this file relies on
   * to show one spread at a time. So nothing is inserted until pagination has
   * reported ready, and any view change asked for before then is replayed the
   * moment it is.
   */
  function isPaginated() {
    return document.documentElement.getAttribute('data-vc-ready') === 'true';
  }

  function styleEl() {
    var el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    return el;
  }

  function pageCount() {
    return document.querySelectorAll('.pagedjs_page').length;
  }

  // Page 1 is a recto, so it stands alone opposite the inside front cover.
  // Every spread after that is an even verso facing the next odd recto.
  function spreadPages(spread) {
    if (spread <= 0) return [null, 1];
    return [spread * 2, spread * 2 + 1];
  }

  function maxSpread() {
    var total = pageCount();
    return total <= 1 ? 0 : Math.floor(total / 2);
  }

  function nth(n) {
    return '.pagedjs_page:nth-of-type(' + n + ')';
  }

  function spreadCss(spread) {
    var pair = override || spreadPages(spread);
    var visible = [];
    if (pair[0]) visible.push(nth(pair[0]));
    if (pair[1] && pair[1] <= pageCount()) visible.push(nth(pair[1]));
    if (!visible.length) visible.push(nth(1));

    return [
      '.pagedjs_pages {',
      '  display: flex; align-items: center; justify-content: center;',
      '  gap: 0; min-height: 100vh; padding: 3vh 2vw;',
      '  perspective: 4200px;',
      '  zoom: ' + state.zoom + ';',
      '}',
      '.pagedjs_page { display: none; margin: 0 !important; }',
      visible.join(',') + ' { display: block; }',
      /* The two leaves meet at the gutter, with a soft fold shadow between. */
      '.pagedjs_left_page { box-shadow: -6px 8px 26px rgba(0,0,0,0.45), inset -18px 0 22px -18px rgba(0,0,0,0.35); }',
      '.pagedjs_right_page { box-shadow: 6px 8px 26px rgba(0,0,0,0.45), inset 18px 0 22px -18px rgba(0,0,0,0.35); }',
    ].join('\n');
  }

  function scrollCss() {
    return [
      '.pagedjs_pages { display: block; padding: 24px 0 48px; zoom: ' + state.zoom + '; }',
      '.pagedjs_page { display: block; margin: 0 auto 22px !important; }',
    ].join('\n');
  }

  function gridCss() {
    return [
      '.pagedjs_pages {',
      '  display: flex; flex-wrap: wrap; align-content: flex-start;',
      '  gap: 18px; padding: 20px; justify-content: center;',
      '}',
      '.pagedjs_page { display: block; margin: 0 !important; zoom: 0.26; }',
      '.pagedjs_page { outline: 1px solid rgba(0,0,0,0.25); }',
    ].join('\n');
  }

  var pendingApply = false;

  function apply() {
    if (!isPaginated()) {
      pendingApply = true;
      return;
    }
    var css =
      state.mode === 'scroll' ? scrollCss() :
      state.mode === 'grid' ? gridCss() :
      spreadCss(state.spread);
    styleEl().textContent = css;
    document.documentElement.classList.toggle('vc-grab', state.mode === 'spread');
  }

  new MutationObserver(function () {
    if (pendingApply && isPaginated()) {
      pendingApply = false;
      apply();
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-vc-ready'],
  });

  /**
   * The turn itself lives in its own module, injected just before this one. It
   * needs to reach into the paginated document — measure a page, hide the two
   * pages it is carrying, put the spread back when the leaf lands — so it is
   * handed exactly those operations rather than sharing this file's state.
   */
  var flip = window.__VC_FLIP__ || null;

  function apiForFlip() {
    return {
      ready: isPaginated,
      container: function () {
        return document.querySelector('.pagedjs_pages');
      },
      pageEl: function (n) {
        return n && n >= 1 && n <= pageCount() ? document.querySelector(nth(n)) : null;
      },
      spreadPages: function (spread) {
        var pair = spreadPages(spread);
        return [pair[0], pair[1] && pair[1] <= pageCount() ? pair[1] : null];
      },
      maxSpread: maxSpread,
      state: function () {
        return state;
      },
      override: function (pair) {
        override = pair;
        apply();
      },
      settle: function (spread) {
        override = null;
        state.spread = spread;
        apply();
      },
      post: postSpread,
    };
  }

  function postSpread(spread) {
    if (window.parent === window) return;
    window.parent.postMessage({ type: 'versecraft:spread', spread: spread }, '*');
  }

  if (flip) flip.install(apiForFlip());

  /**
   * Navigation exists on both sides of the frame.
   *
   * Turning a page by clicking or dragging puts the focus inside this document,
   * and from then on the app's own arrow-key handler hears nothing — the keys
   * go to whichever document has focus. Only one of the two ever fires for a
   * given press, so there is no risk of turning twice.
   */
  document.addEventListener('keydown', function (event) {
    if (state.mode !== 'spread' || !isPaginated()) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    var jump = null;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      if (flip) flip.turn('forward');
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      if (flip) flip.turn('back');
    } else if (event.key === 'Home') {
      jump = 0;
    } else if (event.key === 'End') {
      jump = maxSpread();
    } else {
      return;
    }
    event.preventDefault();
    if (jump !== null && jump !== state.spread) {
      state.spread = jump;
      apply();
      postSpread(jump);
    }
  });

  /**
   * Flashes every element a setting touches.
   *
   * The preview re-paginates wholesale on each edit, so there is nothing to
   * diff — what can be shown is the category of thing the control governs. A
   * change to the poem-title font flashes all poem titles, which is enough to
   * answer "what did that do?".
   */
  var highlightTimer = null;
  function highlight(selector) {
    if (!selector) return;
    var previous = document.querySelectorAll('.vc-flash');
    for (var i = 0; i < previous.length; i++) previous[i].classList.remove('vc-flash');
    if (highlightTimer) clearTimeout(highlightTimer);

    var targets;
    try {
      targets = document.querySelectorAll(selector);
    } catch (e) {
      return;
    }
    if (!targets.length) return;
    for (var j = 0; j < targets.length; j++) targets[j].classList.add('vc-flash');
    highlightTimer = setTimeout(function () {
      for (var k = 0; k < targets.length; k++) targets[k].classList.remove('vc-flash');
    }, 1100);
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (data && data.type === 'versecraft:highlight') {
      highlight(data.selector);
      return;
    }
    if (!data || data.type !== 'versecraft:view') return;

    var nextSpread = Math.max(0, Math.min(data.spread, maxSpread()));
    var modeChanged = data.mode !== state.mode;
    state.mode = data.mode;
    if (typeof data.zoom === 'number' && data.zoom > 0) state.zoom = data.zoom;

    if (!modeChanged && data.turn && Math.abs(nextSpread - state.spread) === 1 && state.mode === 'spread' && flip) {
      if (flip.turn(data.turn)) return;
    }

    // The app updates its own spread as soon as it asks for a turn, so the
    // follow-up message arrives while the leaf is still in the air. Record it,
    // but leave the pages alone until the flip has landed.
    if (flip && flip.busy() && !modeChanged && nextSpread === state.spread) return;

    state.spread = nextSpread;
    apply();
  });

  window.__VC_VIEWER__ = true;
  apply();
})();
`;
