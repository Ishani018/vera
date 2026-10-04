'use client';

import { useEffect, useState } from 'react';
import { getAssetUrl } from '@/lib/assets';
import type { Thumb } from '@/lib/projects';

/**
 * What is saved, at the size of a thumbnail.
 *
 * The real shape, the real background, the real pictures and the real words,
 * each where it actually sits. It draws rather than describes because a card
 * showing a pale rectangle tells you nothing about which of six pale
 * rectangles you want — which is what this was until it drew anything.
 *
 * Not a render: type is set in whatever face the browser has to hand rather
 * than the book's own, and curved text is drawn straight. It is a likeness at
 * eighty pixels, not a proof.
 */
export function ThumbArt({ thumb }: { thumb: Thumb }) {
  const urls = useAssetUrls(
    thumb.items.flatMap((item) => (item.kind === 'picture' ? [item.assetId] : [])),
  );
  const hairline = Math.max(thumb.width, thumb.height) / 300;

  return (
    <svg
      viewBox={`0 0 ${thumb.width} ${thumb.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-hidden
    >
      <rect width={thumb.width} height={thumb.height} fill={thumb.background} />
      {thumb.items.map((item, index) => {
        if (item.kind === 'picture') {
          const url = urls[item.assetId];
          const spin = item.rotate
            ? `rotate(${item.rotate} ${item.x + item.width / 2} ${item.y + item.height / 2})`
            : undefined;
          // Until the bytes arrive, the space the picture will take, so the
          // card does not jump about as a list of them loads.
          return url ? (
            <image
              key={index}
              href={url}
              x={item.x}
              y={item.y}
              width={item.width}
              height={item.height}
              preserveAspectRatio={item.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}
              transform={spin}
              clipPath={item.radius ? `inset(0 round ${item.radius}px)` : undefined}
            />
          ) : (
            <rect
              key={index}
              x={item.x}
              y={item.y}
              width={item.width}
              height={item.height}
              rx={item.radius || undefined}
              fill="var(--color-ink-400)"
              opacity={0.35}
              transform={spin}
            />
          );
        }
        // Anchored the way the box is aligned, so a centred title is centred.
        const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start';
        const x =
          item.align === 'center'
            ? item.x + item.width / 2
            : item.align === 'right'
              ? item.x + item.width
              : item.x;
        const lines = wrap(item.text, item.width, item.sizePt);
        const step = item.sizePt * (item.lineHeight || 1.2);
        return (
          <text
            key={index}
            x={x}
            y={item.y + item.sizePt}
            textAnchor={anchor}
            fill={item.color}
            fontSize={item.sizePt}
            fontWeight={item.weight}
            fontStyle={item.italic ? 'italic' : undefined}
            fontFamily={`'${item.family}', ${item.fallback}`}
            transform={item.rotate ? `rotate(${item.rotate} ${x} ${item.y})` : undefined}
          >
            {lines.map((line, n) => (
              <tspan key={n} x={x} dy={n === 0 ? 0 : step}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
      <rect
        width={thumb.width}
        height={thumb.height}
        fill="none"
        stroke="var(--color-ink-300)"
        strokeWidth={hairline}
      />
    </svg>
  );
}

/**
 * Object URLs for a set of assets, fetched once each.
 *
 * `getAssetUrl` keeps one URL per asset for the life of the page, so a book
 * and a post that use the same picture ask the database once between them.
 */
export function useAssetUrls(ids: string[]): Record<string, string> {
  const key = ids.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!key) return;
    let live = true;
    void Promise.all(
      [...new Set(key.split('|'))].map(async (id) => [id, await getAssetUrl(id)] as const),
    ).then((pairs) => {
      if (!live) return;
      setUrls(Object.fromEntries(pairs.filter(([, url]) => url) as [string, string][]));
    });
    return () => {
      live = false;
    };
    // `key` is the stable identity of this set of pictures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}

/**
 * Where the lines break, near enough.
 *
 * SVG text does not wrap, so without this a title longer than its box runs
 * straight off the edge and the drawing shows it clipped — which is not what
 * the cover does, and on a preview whose whole job is to be truthful about
 * legibility that is worse than useless.
 *
 * The width of a line is estimated at about half the type size per character,
 * which is roughly true across the proportional faces this app offers. It is
 * an estimate: the real renderer measures the real glyphs and may break a line
 * a word earlier or later. A break in nearly the right place is a fair
 * likeness; no break at all is a lie.
 */
const AVERAGE_GLYPH = 0.5;

function wrap(text: string, width: number, sizePt: number): string[] {
  const perLine = Math.max(1, Math.floor(width / (sizePt * AVERAGE_GLYPH)));
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= perLine || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  // A card is a likeness, not a page: four lines is plenty and keeps one long
  // poem from drawing a hundred of them.
  return lines.slice(0, 4);
}
