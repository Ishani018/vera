import assert from 'node:assert/strict';
import test from 'node:test';

import { PRESETS, boardFor, outputSize, presetById } from '../lib/presets.ts';
import { foldsOf, reservedOf, safeOf, trimOf } from '../lib/board.ts';

test('every preset is distinct, named and the right way up for its job', () => {
  assert.deepEqual([...new Set(PRESETS.map((p) => p.id))].length, PRESETS.length);
  for (const p of PRESETS) {
    assert.ok(p.name && p.note && p.stated, p.id);
    assert.ok(p.width > 0 && p.height > 0, p.id);
    assert.ok(p.safeInset * 2 < Math.min(p.width, p.height), `${p.id}: safe area is bigger than the board`);
  }
  assert.ok(presetById('instagram-post'));
  assert.equal(presetById('nothing-like-this'), null);
});

test('pixel sizes convert exactly, which is the reason for points', () => {
  // 1200 x 628 is 900 x 471 on the nose. In inches it would be 6.541666...
  const link = presetById('link-image');
  assert.equal(link.width, 900);
  assert.equal(link.height, 471);
  assert.equal(presetById('instagram-post').width, 810);
  assert.equal(presetById('instagram-story').height, 1440);
});

test('a screen board is the size stated; a printed one gains its bleed', () => {
  const post = boardFor(presetById('instagram-post'));
  assert.equal(post.width, 810, 'nothing is trimmed off a screen');
  assert.equal(post.bleed, 0);
  assert.deepEqual(trimOf(post), { x: 0, y: 0, width: 810, height: 810 });

  // A 4.25in postcard is printed on a 4.5in sheet and cut down.
  const card = boardFor(presetById('postcard-a6'));
  assert.equal(card.width, 4.5 * 72);
  assert.equal(card.height, 6.25 * 72);
  assert.equal(trimOf(card).width, 4.25 * 72, 'what the buyer ends up holding');
});

test('a launch-kit board has a safe area and nothing else marked on it', () => {
  for (const preset of PRESETS) {
    const board = boardFor(preset);
    assert.equal(foldsOf(board).length, 0, `${preset.id} does not fold`);
    assert.equal(reservedOf(board).length, 0, `${preset.id} has no barcode`);
    assert.equal(safeOf(board).length, 1, preset.id);
    assert.deepEqual(Object.keys(board.panels), ['board']);
  }
});

test("a story keeps its safe area clear of the controls over each end", () => {
  const story = boardFor(presetById('instagram-story'));
  const safe = safeOf(story)[0].rect;
  assert.equal(safe.y, 187.5, '250px from the top');
  assert.equal(safe.y + safe.height, 1440 - 187.5);
  assert.match(safe.label ?? safeOf(story)[0].label, /visible/);
});

/* --------------------------------------------- rendering a board that is not a cover */

import { buildBoardHtml } from '../lib/render/coverHtml.ts';

const spec = (over = {}) => ({
  backgroundColor: '#f4efe4',
  backColor: '#fff',
  spineColor: '#fff',
  frontImage: null,
  imageSpansWrap: false,
  showBarcodeZone: true,
  textBoxes: [],
  stickers: [],
  ...over,
});

const font = {
  family: 'Nunito Sans', fallback: 'sans-serif', weight: 700, italic: false,
  sizePt: 36, lineHeight: 1.2, letterSpacingEm: 0, transform: 'none',
  align: 'center', color: '#3a2a1f',
};

const post = () => boardFor(presetById('instagram-post'));
const render = (board, s, over = {}) =>
  buildBoardHtml(board, s, { title: 'A post', fontStyle: '', guides: false, ...over });

test('a post is one page at the size the platform asked for', () => {
  const html = render(post(), spec());
  assert.match(html, /@page \{ size: 810pt 810pt;/);
  assert.match(html, /width: 810pt;\n  height: 810pt;/);
});

test('text placed on the board lands on the board, with no panel to look up', () => {
  const box = { id: 't', panel: 'board', text: 'Out today', x: 72, y: 144, width: 666,
    rotate: 0, curve: 0, font };
  const html = render(post(), spec({ textBoxes: [box] }));
  assert.match(html, /#cb0 \{[\s\S]*?left: 72pt;/);
  assert.match(html, /#cb0 \{[\s\S]*?top: 144pt;/);
  assert.ok(html.includes('Out today'));
});

test('a cover text box survives being put on a board with no front or spine', () => {
  // Nothing should crash or land at NaN just because the panel is missing;
  // a board with no such face measures from itself.
  const box = { id: 't', panel: 'front', text: 'Moved house', x: 36, y: 36, width: 400,
    rotate: 0, curve: 0, font };
  const html = render(post(), spec({ textBoxes: [box] }));
  assert.match(html, /#cb0 \{[\s\S]*?left: 36pt;/);
  assert.doesNotMatch(html, /NaN/);
});

test('a post paints nothing but its background, and reserves nothing', () => {
  const html = render(post(), spec());
  assert.doesNotMatch(html, /class="paint"/, 'no back cover and no spine to colour');
  // showBarcodeZone is on in the spec and irrelevant here: the board has no
  // reserved area, so there is nothing to draw whatever the spec says.
  assert.doesNotMatch(html, /class="reserved"/);
  assert.match(html, /background: #f4efe4/);
});

test('a picture with no front panel to sit on fills the whole board', () => {
  const html = render(
    post(),
    spec({ frontImage: { assetId: 'a', naturalWidth: 2000, naturalHeight: 2000, fit: 'cover' } }),
    { assets: { a: 'data:image/png;base64,AAA' } },
  );
  assert.match(html, /\.cover-image \{[\s\S]*?left: 0pt;[\s\S]*?width: 810pt;/);
});

test('a printed preset draws its trim where the guillotine goes', () => {
  const card = boardFor(presetById('postcard-a6'));
  const html = render(card, spec(), { guides: true });
  assert.match(html, /guide-trim/);
  assert.match(html, new RegExp(`left: ${card.bleed}pt`));
  // The element, not the CSS class that styles it — that is always in the sheet.
  assert.equal((html.match(/class="guide guide-fold"/g) ?? []).length, 0, 'a postcard does not fold');
  assert.equal((html.match(/class="guide guide-safe"/g) ?? []).length, 1);
});

/* ------------------------------------------------------- how big the file comes out */

const sizeOf = (id, opts) => outputSize(presetById(id), opts);

test('a screen board comes out at the pixels the platform asked for', () => {
  assert.deepEqual(
    [sizeOf('instagram-post').widthPx, sizeOf('instagram-post').heightPx],
    [1080, 1080],
  );
  assert.deepEqual([sizeOf('instagram-story').widthPx, sizeOf('instagram-story').heightPx], [1080, 1920]);
  assert.deepEqual([sizeOf('pinterest-pin').widthPx, sizeOf('pinterest-pin').heightPx], [1000, 1500]);
  assert.deepEqual([sizeOf('link-image').widthPx, sizeOf('link-image').heightPx], [1200, 628]);
});

test('asking a screen board for 300 DPI does not make it three times too big', () => {
  // This is the whole reason the two are not one control. 810 points at 300
  // DPI is a 3375 pixel square; Instagram asked for 1080 and discards the rest.
  const asked = sizeOf('instagram-post', { dpi: 300 });
  assert.equal(asked.widthPx, 1080, 'dpi is ignored on a board measured in pixels');
  assert.notEqual(asked.widthPx, 3375);
});

test('a multiple gives the same design at more pixels', () => {
  assert.equal(sizeOf('instagram-post', { scale: 2 }).widthPx, 2160);
  assert.equal(sizeOf('instagram-post', { scale: 3 }).widthPx, 3240);
  // And is held to what Chromium will actually do.
  assert.equal(sizeOf('instagram-post', { scale: 99 }).shotScale, 8);
  assert.equal(sizeOf('instagram-post', { scale: 0 }).shotScale, 0.25);
  assert.equal(sizeOf('instagram-post', { scale: NaN }).widthPx, 1080);
});

test('a printed board comes out at the resolution the printer needs', () => {
  // A 4.25 x 6in postcard is laid out on 4.5 x 6.25in with the bleed.
  const card = sizeOf('postcard-a6', { dpi: 300 });
  assert.deepEqual([card.widthPx, card.heightPx], [1350, 1875]);
  assert.equal(card.dpi, 300);

  assert.equal(sizeOf('bookmark', { dpi: 300 }).widthPx, 675);
  assert.equal(sizeOf('postcard-a6', { dpi: 600 }).widthPx, 2700);
  // And never below what KDP would reject or above what is worth carrying.
  assert.equal(sizeOf('postcard-a6', { dpi: 10 }).dpi, 72);
  assert.equal(sizeOf('postcard-a6', { dpi: 5000 }).dpi, 600);
});

test('a screen board reports the resolution it would print at, honestly', () => {
  // 1080px across 11.25in is 96 dpi: fine on a screen, soft on paper. Saying so
  // is better than saying 300 because the number 300 was in the request.
  assert.equal(sizeOf('instagram-post').dpi, 96);
  assert.equal(sizeOf('instagram-post', { scale: 2 }).dpi, 192);
});
