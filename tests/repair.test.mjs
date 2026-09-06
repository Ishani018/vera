import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LONG_LINE_CHARS,
  MIN_SUGGEST_CHARS,
  applyAllSuggestions,
  isLongLine,
  joinWithNext,
  repairStats,
  splitLine,
  splitPoints,
  suggestSplits,
  toggleStanzaBreakAfter,
} from '../lib/repair.ts';

const RUN_ON =
  'Make things the way they were before. What if sometimes, Change is not what you need?';

test('a long line is flagged, a short one is not', () => {
  assert.equal(isLongLine('short line'), false);
  assert.equal(isLongLine('x'.repeat(LONG_LINE_CHARS + 1)), true);
  // Trailing spaces do not make a line long.
  assert.equal(isLongLine(`${'x'.repeat(10)}${' '.repeat(80)}`), false);
});

test('a capital after punctuation is suggested as a break', () => {
  const suggestions = suggestSplits(RUN_ON);
  const high = suggestions.filter((s) => s.confidence === 'high');
  assert.ok(high.length >= 2, 'both run-on joins should be found');
  for (const s of high) {
    assert.ok(RUN_ON[s.offset] === RUN_ON[s.offset].toUpperCase());
    assert.match(RUN_ON.slice(s.offset), /^[A-Z]/);
  }
});

test('short lines are never suggested for splitting', () => {
  // 24 characters: too short to be two lines of verse welded together.
  assert.deepEqual(suggestSplits('One thing. Then another.'), []);
});

test('a run-on shorter than the measure is still suggested', () => {
  // The case that matters: two short lines joined come to about fifty
  // characters, which no measure would flag as long.
  const line = 'What if sometimes, Change is not what you need?';
  assert.ok(line.length < LONG_LINE_CHARS, 'this line is not a long line');
  assert.ok(suggestSplits(line).some((s) => s.confidence === 'high'));
});

test('a split that would leave almost nothing is not offered', () => {
  const line = `A. ${'Xx '.repeat(20)}`;
  assert.equal(suggestSplits(line).length, 0, 'two characters is not a line of verse');
});

test('splitting divides one line into two and drops the gap', () => {
  const body = 'Alpha beta gamma';
  const out = splitLine(body, 0, 6);
  assert.equal(out, 'Alpha\nbeta gamma');
});

test('splitting at an edge is refused rather than making an empty line', () => {
  assert.equal(splitLine('Alpha beta', 0, 0), 'Alpha beta');
  assert.equal(splitLine('Alpha beta', 0, 10), 'Alpha beta');
  assert.equal(splitLine('Alpha beta', 5, 3), 'Alpha beta', 'out-of-range line index');
});

test('joining puts two lines back together with one space', () => {
  assert.equal(joinWithNext('Alpha \n beta', 0), 'Alpha beta');
  assert.equal(joinWithNext('only line', 0), 'only line');
});

test('joining across a stanza break removes the break', () => {
  assert.equal(joinWithNext('one\n\ntwo', 0), 'one\ntwo');
});

test('a stanza break toggles on and back off', () => {
  const body = 'one\ntwo';
  const withBreak = toggleStanzaBreakAfter(body, 0);
  assert.equal(withBreak, 'one\n\ntwo');
  assert.equal(toggleStanzaBreakAfter(withBreak, 0), body);
});

test('split points sit between words, never inside one', () => {
  const line = 'alpha beta gamma';
  assert.deepEqual(splitPoints(line), [6, 11]);
  for (const point of splitPoints(line)) {
    assert.notEqual(line[point], ' ');
    assert.equal(line[point - 1], ' ');
  }
});

test('accepting all suggestions breaks a run-on line all the way down', () => {
  const out = applyAllSuggestions(RUN_ON);
  assert.deepEqual(out.split('\n'), [
    'Make things the way they were before.',
    'What if sometimes,',
    'Change is not what you need?',
  ]);
});

test('accepting all suggestions is idempotent', () => {
  const once = applyAllSuggestions(RUN_ON);
  assert.equal(applyAllSuggestions(once), once);
});

test('accepting suggestions leaves stanza breaks alone', () => {
  const body = `${RUN_ON}\n\nA second stanza.`;
  const out = applyAllSuggestions(body);
  assert.ok(out.includes('\n\nA second stanza.'), 'the stanza break survived');
  assert.equal(repairStats(out).stanzas, 2);
});

test('a poem with no long lines is left exactly as it was', () => {
  const body = 'Short line one,\nshort line two.\n\nAnd a third.';
  assert.equal(applyAllSuggestions(body), body);
});

test('stats count verse lines, stanzas and problems', () => {
  const stats = repairStats(`${RUN_ON}\n\nA short line.`);
  assert.equal(stats.lines, 2);
  assert.equal(stats.stanzas, 2);
  assert.equal(stats.longLines, 1);
  assert.ok(stats.suggestions >= 2);
  assert.equal(stats.longestLine, RUN_ON.length);
});

test('repair never loses or invents words', () => {
  const words = (s) => s.split(/\s+/).filter(Boolean);
  const before = words(RUN_ON);
  const after = words(applyAllSuggestions(RUN_ON));
  assert.deepEqual(after, before, 'splitting must only move breaks, never text');
});
