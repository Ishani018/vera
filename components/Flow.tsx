'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** Long enough to cover --motion-base, short enough never to be in the way. */
const FADE = 260;

/**
 * The fade between one page and the next.
 *
 * **Why this and not View Transitions.** A real cross-fade between two pages,
 * where a thing on both of them slides from where it was to where it is, is what
 * the View Transition API is for, and this app asks for it: `app/globals.css`
 * declares `@view-transition { navigation: auto }`, so a browser that supports
 * it gives exactly that for a full page load — following a bookmark, a refresh,
 * a link from outside.
 *
 * Inside the app, navigation is client-side, and `document.startViewTransition`
 * needs the new DOM to exist by the time its callback returns. `router.push`
 * does not work that way: it starts a navigation and resolves later, so the
 * transition captures the old page twice and shows nothing. The fix React and
 * Next have for this is `<ViewTransition>` behind `experimental.viewTransition`,
 * which needs a React experimental build — a dependency swap this work is not
 * allowed to make, and a poor trade overnight in any case.
 *
 * So: the real thing where the browser can do it unaided, and this plain fade
 * for the rest. When a stable React ships `<ViewTransition>`, this component is
 * the one place that changes.
 *
 * It renders nothing and wraps nothing. An element that wrapped the page would
 * be a box in every page's layout, and the editors measure their own panes
 * against their parents — they would measure this instead. A flag on `<html>`
 * and a rule on `body` costs no box at all.
 */
export function Flow() {
  const path = usePathname();
  const first = useRef(true);

  useEffect(() => {
    // Not on the first paint: there is nothing to fade from, and a page that
    // fades in as it arrives is a page that looked broken for a moment.
    if (first.current) {
      first.current = false;
      return;
    }
    const root = document.documentElement;
    // Off and on again, because re-adding the attribute is what restarts the
    // animation; setting an attribute that is already set does nothing.
    delete root.dataset.arriving;
    const frame = requestAnimationFrame(() => (root.dataset.arriving = 'yes'));
    const clear = setTimeout(() => delete root.dataset.arriving, FADE);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(clear);
      delete root.dataset.arriving;
    };
  }, [path]);

  return null;
}
