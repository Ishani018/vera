import { NextResponse } from 'next/server';
import { BUNDLED_FAMILIES, type FontFamily } from '@/lib/fonts';

export const runtime = 'nodejs';
export const revalidate = 86_400;

type GoogleFont = {
  family: string;
  category: string;
  variants: string[];
};

const CATEGORIES = new Set(['serif', 'sans-serif', 'display', 'handwriting', 'monospace']);

let cached: { families: FontFamily[]; source: string } | null = null;

/**
 * The Google Fonts Developer API needs a key. Without one the app still works —
 * it serves a curated list of book-suitable families instead, and every one of
 * them still loads from Google at render time. Set GOOGLE_FONTS_API_KEY to get
 * the full catalogue in the picker.
 */
export async function GET() {
  if (cached) return NextResponse.json(cached);

  const key = process.env.GOOGLE_FONTS_API_KEY;
  if (!key) {
    cached = { families: BUNDLED_FAMILIES, source: 'bundled' };
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${encodeURIComponent(key)}`,
      { next: { revalidate: 86_400 } },
    );
    if (!res.ok) throw new Error(`Google Fonts API responded ${res.status}`);
    const data = (await res.json()) as { items?: GoogleFont[] };
    const families: FontFamily[] = (data.items ?? [])
      .filter((item) => CATEGORIES.has(item.category))
      .map((item) => ({
        family: item.family,
        category: item.category as FontFamily['category'],
        variants: item.variants,
      }));
    if (!families.length) throw new Error('Google Fonts API returned no families');
    cached = { families, source: 'google' };
    return NextResponse.json(cached);
  } catch (error) {
    // A missing font list should never stop someone typesetting a book.
    return NextResponse.json({
      families: BUNDLED_FAMILIES,
      source: 'bundled',
      warning: error instanceof Error ? error.message : 'Could not reach the Google Fonts API.',
    });
  }
}
