/**
 * The script injected into the rendered document, alongside the Paged.js
 * polyfill. It runs in both the preview iframe and the headless export, so
 * anything it does — page tagging, "(continued)" markers, guides — is
 * guaranteed to be identical in the PDF and on screen.
 *
 * Kept as a source string rather than a module because it has to execute inside
 * the rendered document, which has no bundler.
 */

export type RuntimeConfig = {
  continuedMarker: string;
  showContinuedMarker: boolean;
  guides: { margins: boolean; bleed: boolean; safe: boolean; gutter: boolean };
  geometry: {
    contentTop: number;
    contentBottom: number;
    contentInside: number;
    contentOutside: number;
    bleed: number;
  };
  /** Preview posts pagination results to the parent; export does not. */
  postToParent: boolean;
  /** Raise the browser print dialog once the book has been laid out. */
  autoPrint: boolean;
};

export const RUNTIME_SCRIPT = String.raw`
(function () {
  var CONFIG = window.__VC_CONFIG__;

  function roman(n) {
    var table = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],
                 [50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
    var out = '';
    for (var i = 0; i < table.length; i++) {
      while (n >= table[i][0]) { out += table[i][1]; n -= table[i][0]; }
    }
    return out;
  }

  function inches(v) { return v + 'in'; }

  function drawGuides(pageEl) {
    var g = CONFIG.guides;
    if (!g.margins && !g.bleed && !g.safe && !g.gutter) return;
    var box = pageEl.querySelector('.pagedjs_pagebox');
    if (!box || box.querySelector('.vc-guides')) return;

    var geo = CONFIG.geometry;
    var isLeft = pageEl.classList.contains('pagedjs_left_page');
    var inside = isLeft ? 'right' : 'left';
    var outside = isLeft ? 'left' : 'right';

    var layer = document.createElement('div');
    layer.className = 'vc-guides';

    function add(cls, style) {
      var el = document.createElement('div');
      el.className = cls;
      for (var k in style) el.style[k] = style[k];
      layer.appendChild(el);
    }

    if (g.margins) {
      var m = { top: inches(geo.contentTop), bottom: inches(geo.contentBottom) };
      m[inside] = inches(geo.contentInside);
      m[outside] = inches(geo.contentOutside);
      add('vc-guide-margins', m);
    }
    if (g.bleed && geo.bleed > 0) {
      var b = { top: inches(geo.bleed), bottom: inches(geo.bleed) };
      b[inside] = '0';
      b[outside] = inches(geo.bleed);
      add('vc-guide-bleed', b);
    }
    if (g.safe) {
      var pad = 0.125;
      var s = { top: inches(geo.contentTop - pad), bottom: inches(geo.contentBottom - pad) };
      s[inside] = inches(Math.max(0, geo.contentInside - pad));
      s[outside] = inches(Math.max(0, geo.contentOutside - pad));
      add('vc-guide-safe', s);
    }
    if (g.gutter) {
      var gut = { top: '0', bottom: '0', width: inches(geo.contentInside) };
      gut[inside] = '0';
      add('vc-guide-gutter', gut);
    }
    box.appendChild(layer);
  }

  function tagPage(pageEl) {
    var content = pageEl.querySelector('.pagedjs_page_content');
    if (!content) return;

    var text = (content.textContent || '').trim();
    var hasBlankMarker = !!content.querySelector('.vc-blank-page');
    if (!text || hasBlankMarker) pageEl.classList.add('vc-blank');

    if (content.querySelector('.poem > .poem-title')) pageEl.classList.add('vc-poem-open');
    if (content.querySelector('.section-open h1')) pageEl.classList.add('vc-section-open');

    var matter = content.querySelector('.matter-page');
    if (matter) {
      pageEl.classList.add('vc-matter-page');
      if (matter.getAttribute('data-display') === 'true') {
        pageEl.classList.add('vc-display-page');
      }
    }
    if (content.querySelector('.toc')) pageEl.classList.add('vc-toc-page');
  }

  /**
   * A poem that carries over appears on the next page without its title —
   * Paged.js has already placed the title on the page before. That absence is
   * exactly the signal that this page is a continuation.
   */
  function markContinuation(pageEl) {
    if (!CONFIG.showContinuedMarker) return;
    var content = pageEl.querySelector('.pagedjs_page_content');
    if (!content) return;
    var poem = content.querySelector('.poem');
    if (!poem) return;
    if (poem.querySelector(':scope > .poem-title')) return;
    if (poem.querySelector(':scope > .vc-continued')) return;

    var title = poem.getAttribute('data-title') || '';
    var note = document.createElement('p');
    note.className = 'vc-continued';
    note.textContent = (title ? title + ' ' : '') + CONFIG.continuedMarker;
    poem.insertBefore(note, poem.firstChild);
  }

  /**
   * Mirrors the folio the reader will see. Paged.js labels each page with the
   * named page it belongs to, and the stylesheet numbers frontmatter pages in
   * roman and the rest in arabic from 1. Blank pages carry no named-page class
   * but still take a number, so they inherit the region they fall in.
   */
  function collectPages() {
    var pages = [];
    var els = document.querySelectorAll('.pagedjs_page');
    var region = 'front';
    var frontCount = 0;
    var bodyCount = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.classList.contains('pagedjs_frontmatter_page')) region = 'front';
      else if (el.classList.contains('pagedjs_bodymatter_page') ||
               el.classList.contains('pagedjs_backmatter_page')) region = 'body';

      var label;
      if (region === 'front') { frontCount += 1; label = roman(frontCount); }
      else { bodyCount += 1; label = String(bodyCount); }

      pages.push({
        pageNumber: i + 1,
        label: label,
        side: el.classList.contains('pagedjs_left_page') ? 'left' : 'right',
        blank: el.classList.contains('vc-blank') || el.classList.contains('pagedjs_blank_page'),
      });
    }
    return pages;
  }


  /**
   * Writes each page's printed folio into --vc-folio, which the @page margin
   * boxes render. Blank pages get nothing, so a padded or forced-blank page
   * takes a number in the sequence without printing one — which is what a
   * printed book does.
   */
  function writeFolios(els, pages) {
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (pages[i].blank) {
        el.style.removeProperty('--vc-folio');
      } else {
        el.style.setProperty('--vc-folio', JSON.stringify(pages[i].label));
      }
    }
  }

  /**
   * Resolves TOC and index entries to the folio printed on the target's page.
   * Paged.js's own target-counter() counts physical sheets, which disagrees
   * with the folio as soon as the front matter is numbered in roman.
   */
  function writeCrossReferences(els, pages) {
    var pageOf = new Map();
    for (var i = 0; i < els.length; i++) pageOf.set(els[i], pages[i]);

    var entries = document.querySelectorAll('.toc-entry, .index-entry');
    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      var href = entry.getAttribute('href') || '';
      if (href.charAt(0) !== '#') continue;
      var id = href.slice(1);
      // Paged.js moves the id attribute to data-id on the ancestors it clones
      // when an element is split, so check both.
      var target =
        document.getElementById(id) ||
        document.querySelector('[data-id="' + id.replace(/"/g, '\\"') + '"]');
      if (!target) continue;
      var pageEl = target.closest('.pagedjs_page');
      var info = pageEl ? pageOf.get(pageEl) : null;
      if (info) entry.style.setProperty('--vc-target', JSON.stringify(info.label));
    }
  }

  // Paged.Handler is an ES class, so this must be class syntax — a prototype
  // subclass throws "cannot be invoked without 'new'".
  class VersecraftHandler extends Paged.Handler {
    afterPageLayout(pageElement) {
      tagPage(pageElement);
      markContinuation(pageElement);
    }
    afterRendered() {
      var els = document.querySelectorAll('.pagedjs_page');
      for (var i = 0; i < els.length; i++) drawGuides(els[i]);
      var pages = collectPages();
      writeFolios(els, pages);
      writeCrossReferences(els, pages);
    }
  }

  Paged.registerHandlers(VersecraftHandler);

  /**
   * Paged.js waits on every stylesheet before it lays anything out, and a
   * webfont request that fails takes the whole pipeline down with it. A book
   * should still typeset when the network is unavailable — in a fallback face,
   * with a note, but typeset. So failed stylesheets are dropped first, and
   * pagination starts either way once they have all settled.
   */
  function settleStylesheets() {
    var links = Array.prototype.slice.call(
      document.querySelectorAll('link[rel="stylesheet"]')
    );
    if (!links.length) return Promise.resolve();

    var pending = links.map(function (link) {
      if (link.sheet) return Promise.resolve();
      return new Promise(function (resolve) {
        link.addEventListener('load', function () { resolve(); });
        link.addEventListener('error', function () {
          window.__VC_FONTS_FAILED__ = true;
          if (link.parentNode) link.parentNode.removeChild(link);
          resolve();
        });
      });
    });

    // A stylesheet that neither loads nor errors must not hold the book up.
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 8000); });
    return Promise.race([Promise.all(pending), timeout]);
  }

  function dropStylesheets() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].parentNode) links[i].parentNode.removeChild(links[i]);
    }
    window.__VC_FONTS_FAILED__ = true;
  }

  window.__VC_READY__ = false;
  settleStylesheets()
    .then(function () {
      return window.PagedPolyfill.preview();
    })
    .catch(function () {
      // Paged.js rejects if a stylesheet it is waiting on has already failed,
      // and a link that errored before this script ran never fires its error
      // event for us to catch. Nothing has been laid out at that point, so
      // dropping the stylesheets and starting again is safe — the book comes
      // out in a fallback face rather than not at all.
      dropStylesheets();
      var pages = document.querySelector('.pagedjs_pages');
      if (pages && pages.parentNode) pages.parentNode.removeChild(pages);
      return window.PagedPolyfill.preview();
    })
    .then(function (flow) {
    var pages = collectPages();
    window.__VC_PAGES__ = pages;
    window.__VC_PAGE_COUNT__ = pages.length;
    window.__VC_READY__ = true;
    document.documentElement.setAttribute('data-vc-ready', 'true');
    if (CONFIG.postToParent && window.parent !== window) {
      window.parent.postMessage(
        { type: 'versecraft:paginated', pageCount: pages.length, pages: pages },
        '*'
      );
    }
    if (CONFIG.autoPrint) {
      // One frame so the folios and cross-references written above are painted
      // before the print dialog snapshots the document.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { window.print(); });
      });
    }
    })
    .catch(function (err) {
    window.__VC_ERROR__ = String((err && err.message) || err);
    document.documentElement.setAttribute('data-vc-ready', 'error');
    if (CONFIG.postToParent && window.parent !== window) {
      window.parent.postMessage({ type: 'versecraft:error', message: window.__VC_ERROR__ }, '*');
      }
    });
})();
`;
