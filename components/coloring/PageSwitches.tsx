'use client';

import { usesLineArt } from '@/lib/coloring/picture';
import { useColoring } from '@/lib/coloring/store';
import { PanelSection } from '../panel/Panel';
import { Toggle } from '../ui';

/**
 * The two switches that decide how a colouring book's pages are made.
 *
 * One component, at the top of the Pages tab: where pictures are added, so where
 * somebody making an activity book first needs them. It is its own component so
 * that wherever it is shown it says the same thing.
 */
export function PageSwitches() {
  const book = useColoring((s) => s.book);
  const setBookSetting = useColoring((s) => s.setBookSetting);
  if (!book) return null;

  return (
    <PanelSection title="How pages are made">
      <Toggle
        label="Turn pictures into line art"
        hint="Off prints each picture exactly as you added it — mazes, word searches, dot-to-dot, finished drawings. Nothing is traced or thresholded."
        checked={usesLineArt(book)}
        onChange={(value) => setBookSetting('lineArtOn', value)}
      />
      <Toggle
        label="A blank page behind every picture"
        hint="So a marker that soaks through spoils nothing. Leave it off when the back of a page is a page too."
        checked={book.coloring.singleSided}
        onChange={(value) => setBookSetting('singleSided', value)}
      />
    </PanelSection>
  );
}
