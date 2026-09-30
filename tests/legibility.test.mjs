import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROWSE_HEIGHT_PX,
  CONTRAST_MIN,
  TIGHT_PX,
  UNREADABLE_PX,
  contrastRatio,
  judgeCover,
  luminance,
  parseHex,
  sizeAtBrowse,
  titleBox,
} from '../lib/legibility.ts';
import { font } from '../lib/defaults.ts';

/** A cover with the text boxes given, on a plain background. */
const coverWith = (boxes, extra = {}) => ({
  backgroundColor: '#FFFFFF',
  backColor: '#FFFFFF',
  spineColor: '#FFFFFF',
  frontImage: null,
  imageSpansWrap: false,
  showBarcodeZone: true,
  stickers: [],
  textBoxes: boxes,
  ...extra,
});

const box = (text, sizePt, { color = '#000000', panel = 'front', y = 100 } = {}) => ({
  id: text,
  panel,
  text,
  x: 0,
  y,
  width: 300,
  rotate: 0,
  curve: 0,
  font: { ...font(), sizePt, color },
});

/* ----------------------------------------------------------------- colour */

test('hex parses in both lengths, and refuses anything else', () => {
  assert.deepEqual(parseHex('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex('#FFFFFF'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseHex('000000'), { r: 0, g: 0, b: 0 });
  assert.equal(parseHex('rgb(0,0,0)'), null);
  assert.equal(parseHex(''), null);
  assert.equal(parseHex('#12345'), null);
});

test('luminance and contrast match the values WCAG defines', () => {
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#FFFFFF'), 1);
  // The extremes of the scale, which is where an implementation error shows.
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  // Symmetric: which one is the ink does not change the ratio.
  assert.equal(contrastRatio('#123456', '#EEEEEE'), contrastRatio('#EEEEEE', '#123456'));
  assert.equal(contrastRatio('#000000', 'not a colour'), null);
});

/* ------------------------------------------------------------------ title */

test('the title is the biggest type on the front, and ties go to the higher box', () => {
  const cover = coverWith([
    box('A subtitle underneath', 18),
    box('THE TITLE', 60),
    box('Author name', 14),
  ]);
  assert.equal(titleBox(cover).text, 'THE TITLE');

  const tied = coverWith([
    box('Lower', 40, { y: 400 }),
    box('Higher', 40, { y: 80 }),
  ]);
  assert.equal(titleBox(tied).text, 'Higher');
});

test('back-cover blurb is not the title, and an empty box is not text', () => {
  const cover = coverWith([
    box('A very long blurb set enormous on the back', 90, { panel: 'back' }),
    box('   ', 72),
    box('The Title', 40),
  ]);
  assert.equal(titleBox(cover).text, 'The Title');
});

test('a cover with nothing on the front has nothing to judge', () => {
  const judged = judgeCover(coverWith([]), 648);
  assert.equal(judged.verdict, 'nothing-to-judge');
  assert.equal(judged.title, null);
});

/* ------------------------------------------------------------- the scaling */

test('type scales by exactly the amount the cover does', () => {
  // A 9in cover is 648pt. Shown 160px tall, it is scaled by 160/648.
  assert.equal(sizeAtBrowse(648, 648, 160), 160, 'type as tall as the cover fills the thumbnail');
  assert.equal(sizeAtBrowse(324, 648, 160), 80);
  assert.equal(Math.round(sizeAtBrowse(48, 648, 160) * 100) / 100, 11.85);
  assert.equal(sizeAtBrowse(48, 0, 160), 0, 'a cover with no height does not divide by zero');
});

/* ------------------------------------------------------------ the verdicts */

test('a large, dark title on a light cover reads', () => {
  const judged = judgeCover(coverWith([box('Winter Poems', 72)]), 648);
  assert.equal(judged.verdict, 'ok');
  assert.ok(judged.pxAtBrowse >= TIGHT_PX);
  assert.equal(judged.contrast, 21);
  assert.match(judged.notes.join(' '), /reads easily/);
});

test('a title too small to survive the shrink is called unreadable', () => {
  // 30pt on a 648pt cover is 7.4px at browse size: under the floor.
  const judged = judgeCover(coverWith([box('Winter Poems', 30)]), 648);
  assert.equal(judged.verdict, 'unreadable');
  assert.ok(judged.pxAtBrowse < UNREADABLE_PX);
  assert.match(judged.notes.join(' '), /stop being distinguishable/);
});

test('between the two thresholds it is tight rather than either', () => {
  // 48pt on a 648pt cover is 11.85px: readable, not at a glance.
  const judged = judgeCover(coverWith([box('Winter Poems', 48)]), 648);
  assert.equal(judged.verdict, 'tight');
  assert.ok(judged.pxAtBrowse > UNREADABLE_PX && judged.pxAtBrowse < TIGHT_PX);
});

test('big enough but too pale is still a failure', () => {
  const pale = coverWith([box('Winter Poems', 96, { color: '#CFCFCF' })]);
  const judged = judgeCover(pale, 648);
  assert.ok(judged.pxAtBrowse > TIGHT_PX, 'the size alone would have passed');
  assert.equal(judged.verdict, 'unreadable');
  assert.match(judged.notes.join(' '), /it is a texture/);
});

test('slightly under the contrast bar is tight, not fatal', () => {
  // #767676 on white is about 4.5:1; #808080 is just under it.
  const judged = judgeCover(coverWith([box('Winter Poems', 96, { color: '#808080' })]), 648);
  assert.ok(judged.contrast < CONTRAST_MIN && judged.contrast >= 3);
  assert.equal(judged.verdict, 'tight');
});

test('over a picture the contrast is not guessed at', () => {
  const judged = judgeCover(coverWith([box('Winter Poems', 96)]), 648, { overPicture: true });
  assert.equal(judged.contrast, null);
  assert.equal(judged.verdict, 'ok', 'the size still stands on its own');
  assert.match(judged.notes.join(' '), /judge that one by eye/);
});

test('a size failure and a contrast failure are both reported, not just the first', () => {
  const judged = judgeCover(coverWith([box('Winter Poems', 30, { color: '#DDDDDD' })]), 648);
  assert.equal(judged.verdict, 'unreadable');
  assert.equal(judged.notes.length, 2, 'one note about the size, one about the contrast');
});

test('the default browse height is the one the thresholds were chosen against', () => {
  // If this moves, the px thresholds mean something different and the numbers
  // in the notes stop matching what anyone sees.
  assert.equal(BROWSE_HEIGHT_PX, 160);
  assert.ok(UNREADABLE_PX < TIGHT_PX);
});
