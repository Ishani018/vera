import assert from 'node:assert/strict';
import test from 'node:test';

import { frontImageRect } from '../lib/board.ts';
import { createColoringBook, frontThumb } from '../lib/projects.ts';
import { buildCoverHtml } from '../lib/render/coverHtml.ts';
import { coverLayout } from '../lib/render/coverLayout.ts';

/**
 * A cover's front picture runs off its outer edges, and the front is the
 * right-hand panel.
 *
 * The rule used to start one bleed LEFT of the front (over the spine) and stop at
 * the trim line, the mirror image of what it described. Every cover with a
 * picture came out of the PDF with a white strip, one bleed wide, down its right
 * edge. The existing golden recorded the strip as correct, so nothing caught it.
 */

const withImage = (spans = false) => {
  const book = createColoringBook('Space');
  book.cover.frontImage = { assetId: 'img', naturalWidth: 2600, naturalHeight: 2600, fit: 'cover' };
  book.cover.imageSpansWrap = spans;
  return book;
};

/** The numbers the renderer wrote for `.cover-image`, in points. */
function imageBox(html) {
  const css = html.match(/\.cover-image \{([^}]*)\}/)?.[1] ?? '';
  const pt = (name) => Number(css.match(new RegExp(`${name}: ([\\d.]+)pt`))?.[1]);
  return { left: pt('left'), top: pt('top'), width: pt('width'), height: pt('height') };
}

const render = (book, pageCount = 52) =>
  buildCoverHtml(book, { pageCount, fontStyle: '', guides: false, assets: { img: 'data:image/png;base64,AAA' } });

test('the front picture reaches the right-hand edge of the board, bleed included', () => {
  const book = withImage();
  const layout = coverLayout(book, 52);
  const box = imageBox(render(book));

  assert.ok(Math.abs(box.left + box.width - layout.width) < 0.01,
    `the picture ends at ${box.left + box.width}pt but the board is ${layout.width}pt wide: a strip is left unpainted`);
  // And over the top and bottom bleed as well.
  assert.equal(box.top, 0);
  assert.ok(Math.abs(box.height - layout.height) < 0.01);
});

test('the front picture starts at the fold, not over the spine', () => {
  const book = withImage();
  const layout = coverLayout(book, 52);
  const box = imageBox(render(book));
  assert.ok(Math.abs(box.left - layout.panels.front.x) < 0.01,
    `starts at ${box.left}pt, the front panel is at ${layout.panels.front.x}pt`);
});

test('the bleed it adds on the right is exactly one bleed', () => {
  const layout = coverLayout(withImage(), 52);
  const rect = frontImageRect(layout, layout.panels.front);
  assert.ok(Math.abs(rect.width - (layout.panels.front.width + layout.bleed)) < 0.01);
});

test('a picture spanning the whole wrap still fills the whole board', () => {
  const book = withImage(true);
  const layout = coverLayout(book, 52);
  const box = imageBox(render(book));
  assert.deepEqual([box.left, box.top], [0, 0]);
  assert.ok(Math.abs(box.width - layout.width) < 0.01);
});

test('it holds at any page count, because the spine moves the front along', () => {
  for (const pages of [24, 52, 120, 400]) {
    const book = withImage();
    const layout = coverLayout(book, pages);
    const box = imageBox(render(book, pages));
    assert.ok(Math.abs(box.left + box.width - layout.width) < 0.01, `${pages} pages`);
  }
});

test('the front thumbnail shows the same region the picture is drawn over', () => {
  const book = withImage();
  const layout = coverLayout(book, 52);
  const thumb = frontThumb(book.cover, layout);
  const rect = frontImageRect(layout, layout.panels.front);
  assert.ok(Math.abs(thumb.width - rect.width) < 0.01);
  const picture = thumb.items.find((item) => item.kind === 'picture');
  assert.ok(picture, 'the thumbnail should have the picture');
  // Drawn from the thumbnail's own left edge, filling it.
  assert.ok(Math.abs(picture.x) < 0.01);
  assert.ok(Math.abs(picture.width - thumb.width) < 0.01);
});
