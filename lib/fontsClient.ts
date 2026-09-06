'use client';

import { projectFontsHrefs } from './fonts';
import type { Project } from './types';

/**
 * Fetches the Google Fonts stylesheet in the app and hands it to the preview as
 * an inline <style>.
 *
 * A <link> in the preview document would be worse in two ways: Paged.js blocks
 * layout on every stylesheet and rejects outright if one fails, and a failure
 * inside the iframe is invisible to the app. Fetching it here means a network
 * problem degrades to a fallback face and a note in the UI, rather than a book
 * that never paginates.
 */

const cache = new Map<string, string>();

export type FontCssResult = { style: string; failed: boolean };

export async function fetchFontCss(project: Project): Promise<FontCssResult> {
  const hrefs = projectFontsHrefs(project);
  if (!hrefs.length) return { style: '', failed: false };

  const key = hrefs.join('|');
  const cached = cache.get(key);
  if (cached !== undefined) return { style: wrap(cached), failed: false };

  try {
    const sheets = await Promise.all(
      hrefs.map(async (href) => {
        const response = await fetch(href);
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      }),
    );
    const css = sheets.join('\n');
    cache.set(key, css);
    return { style: wrap(css), failed: false };
  } catch {
    return { style: '', failed: true };
  }
}

function wrap(css: string): string {
  // A closing tag inside the payload would end the style element early.
  return `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
}
