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

export const VIEWER_SCRIPT = String.raw`
(function () {
  var STYLE_ID = 'vc-view-style';
  var state = { mode: 'spread', spread: 0, zoom: 1 };

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
    var pair = spreadPages(spread);
    var visible = [];
    if (pair[0]) visible.push(nth(pair[0]));
    if (pair[1] && pair[1] <= pageCount()) visible.push(nth(pair[1]));
    if (!visible.length) visible.push(nth(1));

    return [
      '.pagedjs_pages {',
      '  display: flex; align-items: center; justify-content: center;',
      '  gap: 0; min-height: 100vh; padding: 3vh 2vw;',
      '  perspective: 2600px;',
      '  zoom: ' + state.zoom + ';',
      '}',
      '.pagedjs_page { display: none; margin: 0 !important; }',
      visible.join(',') + ' { display: block; }',
      /* The two leaves meet at the gutter, with a soft fold shadow between. */
      '.pagedjs_left_page { box-shadow: -6px 8px 26px rgba(0,0,0,0.45), inset -18px 0 22px -18px rgba(0,0,0,0.35); }',
      '.pagedjs_right_page { box-shadow: 6px 8px 26px rgba(0,0,0,0.45), inset 18px 0 22px -18px rgba(0,0,0,0.35); }',
      '.vc-turn-out { transform-origin: left center; animation: vc-turn-out 0.24s ease-in forwards; }',
      '.vc-turn-in { transform-origin: left center; animation: vc-turn-in 0.24s ease-out forwards; }',
      '.vc-turn-out-back { transform-origin: right center; animation: vc-turn-out-back 0.24s ease-in forwards; }',
      '.vc-turn-in-back { transform-origin: right center; animation: vc-turn-in-back 0.24s ease-out forwards; }',
      '@keyframes vc-turn-out { to { transform: rotateY(-92deg); } }',
      '@keyframes vc-turn-in { from { transform: rotateY(92deg); } to { transform: rotateY(0); } }',
      '@keyframes vc-turn-out-back { to { transform: rotateY(92deg); } }',
      '@keyframes vc-turn-in-back { from { transform: rotateY(-92deg); } to { transform: rotateY(0); } }',
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
   * A two-phase turn: the leaf that is being turned rotates to edge-on, the
   * spread changes behind it, and the leaf that replaces it rotates back into
   * place. It costs no relayout because both leaves are already paginated.
   */
  function turn(direction, nextSpread) {
    var pair = spreadPages(state.spread);
    var leafNumber = direction === 'forward' ? pair[1] : pair[0];
    var leaf = leafNumber ? document.querySelector(nth(leafNumber)) : null;

    var outClass = direction === 'forward' ? 'vc-turn-out' : 'vc-turn-out-back';
    var inClass = direction === 'forward' ? 'vc-turn-in' : 'vc-turn-in-back';

    var finish = function () {
      if (leaf) leaf.classList.remove(outClass);
      state.spread = nextSpread;
      apply();
      var newPair = spreadPages(state.spread);
      var incomingNumber = direction === 'forward' ? newPair[0] : newPair[1];
      var incoming = incomingNumber ? document.querySelector(nth(incomingNumber)) : null;
      if (incoming) {
        incoming.classList.add(inClass);
        setTimeout(function () { incoming.classList.remove(inClass); }, 260);
      }
    };

    if (!leaf || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      state.spread = nextSpread;
      apply();
      return;
    }
    leaf.classList.add(outClass);
    setTimeout(finish, 230);
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'versecraft:view') return;

    var nextSpread = Math.max(0, Math.min(data.spread, maxSpread()));
    var modeChanged = data.mode !== state.mode;
    state.mode = data.mode;
    if (typeof data.zoom === 'number' && data.zoom > 0) state.zoom = data.zoom;

    if (!modeChanged && data.turn && nextSpread !== state.spread && state.mode === 'spread') {
      turn(data.turn, nextSpread);
      return;
    }
    state.spread = nextSpread;
    apply();
  });

  window.__VC_VIEWER__ = true;
  apply();
})();
`;
