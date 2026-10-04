import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import {
  ACCEPT_ATTR, MAX_PICTURE_BYTES, OPEN_FIRST, SAMPLES, START_COMMAND,
  checkPicture, downloadReason, explainFailure, helperChip, labStatus,
} from '../lib/lab/intake.ts';

const pic = (name, type, size = 1000) => ({ name, type, size });

/* ------------------------------------------------------------ what can be opened */

test('JPG, PNG and WebP open, by type or by extension when the type is blank', () => {
  for (const f of [pic('a.jpg', 'image/jpeg'), pic('a.png', 'image/png'), pic('a.webp', 'image/webp'), pic('A.JPEG', ''), pic('b.PNG', '')])
    assert.deepEqual(checkPicture(f), { ok: true }, f.name);
  assert.equal(ACCEPT_ATTR, 'image/jpeg,image/png,image/webp');
});

test('an unsupported file says what it is and what to choose instead', () => {
  const verdict = checkPicture(pic('notes.pdf', 'application/pdf'));
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /not a JPG, PNG or WebP/);
  assert.match(verdict.message, /\.pdf/);
  assert.match(verdict.message, /Choose a JPG, PNG or WebP file/);
});

test('a HEIC photo gets its own advice, because that is the file an iPhone makes', () => {
  const verdict = checkPicture(pic('IMG_1.HEIC', 'image/heic'));
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /HEIC/);
  assert.match(verdict.message, /JPG/);
});

test('a picture over the limit says its size, the limit and what to do', () => {
  assert.equal(checkPicture(pic('a.jpg', 'image/jpeg', MAX_PICTURE_BYTES)).ok, true, 'exactly the limit is allowed');
  const verdict = checkPicture(pic('big.jpg', 'image/jpeg', 41 * 1024 * 1024));
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /41 MB/);
  assert.match(verdict.message, /30 MB/);
  assert.match(verdict.message, /smaller copy/);
});

test('an empty file is refused in plain words', () => {
  const verdict = checkPicture(pic('a.png', 'image/png', 0));
  assert.equal(verdict.ok, false);
  assert.match(verdict.message, /empty/);
});

test('an engine failure becomes advice, never a raw error string', () => {
  for (const raw of ['This browser cannot read image data.', 'InvalidStateError: The source image could not be decoded.', '']) {
    const text = explainFailure(raw);
    assert.match(text, /could not read that picture/i);
    assert.doesNotMatch(text, /InvalidState|browser cannot/);
  }
  assert.match(explainFailure('The Lab stopped. Reload the page.'), /Reload the page/);
  assert.match(explainFailure('RangeError: out of memory'), /too big/);
});

/* ----------------------------------------------------------------- the status line */

const base = {
  hasPicture: true, hasResult: true, updating: false, cardsLeft: 0, cardsTotal: 7,
  smartPicked: false, smart: 'idle', failed: false,
};

test('with no picture the line says it is waiting', () => {
  const s = labStatus({ ...base, hasPicture: false, hasResult: false });
  assert.equal(s.text, 'Waiting for a picture');
  assert.equal(s.engine, null);
});

test('reading, then finding the lines, then done, and always the built-in engine', () => {
  assert.deepEqual(labStatus({ ...base, hasResult: false, cardsLeft: 7 }), { text: 'Reading your picture', engine: 'Built-in engine', tone: 'working' });
  assert.equal(labStatus({ ...base, hasResult: false, cardsLeft: 3 }).text, 'Finding the lines');
  assert.equal(labStatus({ ...base, updating: true }).text, 'Finding the lines');
  assert.deepEqual(labStatus(base), { text: 'Done', engine: 'Built-in engine', tone: 'done' });
});

test('done while the other look previews are still coming says so, and is still done', () => {
  const s = labStatus({ ...base, cardsLeft: 2 });
  assert.match(s.text, /^Done/);
  assert.equal(s.tone, 'done');
});

test('a failure is a warning, not a spinner', () => {
  const s = labStatus({ ...base, hasResult: false, failed: true });
  assert.equal(s.tone, 'warning');
  assert.match(s.text, /Could not finish/);
});

test('Smart redraw names its steps, counts the redraw, and names itself as the engine', () => {
  const run = (extra) => labStatus({ ...base, smartPicked: true, smart: 'running', ...extra });
  assert.equal(run({ smartStage: 'cutout' }).text, 'Cutting out the subject');
  assert.equal(run({ smartStage: 'analyse' }).text, 'Looking at the picture');
  assert.equal(run({ smartStage: 'redraw', smartStep: 2, smartOf: 4 }).text, 'Redrawing, step 2 of 4');
  assert.equal(run({ smartStage: 'vector' }).text, 'Tracing the lines');
  for (const stage of ['cutout', 'redraw', undefined]) assert.equal(run({ smartStage: stage }).engine, 'Smart redraw');
});

test('a Smart result says Smart redraw; a fallback says the built-in engine made it', () => {
  const done = labStatus({ ...base, smartPicked: true, smart: 'done', smartSource: 'smart' });
  assert.deepEqual(done, { text: 'Done', engine: 'Smart redraw', tone: 'done' });
  const fallback = labStatus({ ...base, smartPicked: true, smart: 'done', smartSource: 'fallback' });
  assert.equal(fallback.engine, 'Built-in engine (fallback)');
  assert.equal(fallback.tone, 'warning');
  assert.match(fallback.text, /did not finish/);
});

/* --------------------------------------------------------------- disabled controls */

test('downloads say why they are not there yet, in order of what is missing', () => {
  const ok = { hasPicture: true, hasDrawing: true, smartRunning: false, saving: false };
  assert.equal(downloadReason(ok), undefined);
  assert.equal(downloadReason({ ...ok, hasPicture: false, hasDrawing: false }), OPEN_FIRST);
  assert.equal(OPEN_FIRST, 'Open a picture first');
  assert.match(downloadReason({ ...ok, hasDrawing: false }), /not ready/);
  assert.match(downloadReason({ ...ok, smartRunning: true }), /Smart redraw is still working/);
  assert.ok(downloadReason({ ...ok, saving: true }));
});

/* ------------------------------------------------------------------ the helper chip */

test('with Smart redraw off the chip is nothing at all: no text and no command', () => {
  for (const checked of [true, false]) for (const running of [true, false])
    assert.equal(helperChip({ enabled: false, checked, running }), null);
});

test('running, not running and not yet known each have their own words', () => {
  assert.deepEqual(helperChip({ enabled: true, checked: true, running: true }), { running: true, text: 'Smart redraw: helper running', hint: null });
  const down = helperChip({ enabled: true, checked: true, running: false });
  assert.equal(down.text, 'Smart redraw: helper not running');
  assert.equal(down.hint, START_COMMAND);
  const unknown = helperChip({ enabled: true, checked: false, running: false });
  assert.equal(unknown.running, null);
  assert.equal(unknown.hint, null, 'no command is offered before the first answer: it may be running');
});

test('the start command is exactly the one in the docs', () => {
  assert.equal(START_COMMAND, 'cd tools/logo-proto && .venv/bin/python server.py');
  assert.match(readFileSync(new URL('../docs/SMART-REDRAW.md', import.meta.url), 'utf8'), /cd tools\/logo-proto\n\.venv\/bin\/python server\.py/);
});

/* ----------------------------------------------------------------------- samples */

test('every sample ships: a real PNG, small, and identical to the picture in docs/lab-inputs', () => {
  assert.ok(SAMPLES.length >= 2 && SAMPLES.length <= 3);
  const origins = { cat: 'drawing-cat.png', flower: 'drawing-flower.png', photo: 'synthetic-photo.png' };
  for (const s of SAMPLES) {
    const file = new URL(`../public${s.src}`, import.meta.url);
    assert.ok(existsSync(file), s.src);
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.ok(bytes.length < 400_000, `${s.src} is ${bytes.length} bytes`);
    assert.deepEqual(bytes, readFileSync(new URL(`../docs/lab-inputs/${origins[s.id]}`, import.meta.url)));
    assert.equal(checkPicture({ name: s.name, type: s.type, size: bytes.length }).ok, true);
  }
});
