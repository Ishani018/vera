import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_IMPORT_OPTIONS,
  docxHtmlToVerse,
  splitIntoPoems,
  toPoems,
} from '../lib/import.ts';
import { parseStanzas } from '../lib/render/text.ts';

/**
 * The HTML mammoth produces for a manuscript typed the way poets actually type
 * one: each line its own paragraph, an empty paragraph between stanzas, and one
 * stanza broken with Shift+Enter instead of Enter — which Word represents as
 * <w:br/> inside a single paragraph.
 */
const WORD_HTML =
  '<p>The Title</p>' +
  '<p>First line of stanza one.</p>' +
  '<p>Second line of stanza one.</p>' +
  '<p></p>' +
  '<p>First line of stanza two.</p>' +
  '<p>    Indented line of stanza two.</p>' +
  '<p></p>' +
  '<p>Shift-enter line A.<br />Shift-enter line B.</p>';

test('a Word document keeps one line per line of verse', () => {
  const text = docxHtmlToVerse(WORD_HTML);
  assert.deepEqual(text.split('\n'), [
    'The Title',
    'First line of stanza one.',
    'Second line of stanza one.',
    '',
    'First line of stanza two.',
    '    Indented line of stanza two.',
    '',
    'Shift-enter line A.',
    'Shift-enter line B.',
  ]);
});

/**
 * mammoth's extractRawText joins paragraphs with a blank line, so every line of
 * verse reads as its own stanza. Guarding the stanza count is what catches a
 * regression back to it.
 */
test('stanza structure survives the round trip', () => {
  const text = docxHtmlToVerse(WORD_HTML);
  const [poem] = splitIntoPoems(text, DEFAULT_IMPORT_OPTIONS);
  assert.equal(poem.title, 'The Title');
  const stanzas = parseStanzas(poem.body);
  assert.equal(stanzas.length, 3, 'three stanzas, not eight one-line ones');
  assert.deepEqual(stanzas.map((s) => s.lines.length), [2, 2, 2]);
});

test('a soft line break is a line, not a weld', () => {
  // extractRawText dropped <w:br/> and returned "line A.line B." as one line.
  const text = docxHtmlToVerse('<p>line A.<br />line B.</p>');
  assert.deepEqual(text.split('\n'), ['line A.', 'line B.']);
  assert.ok(!text.includes('A.line'));
});

test('indentation inside a paragraph is preserved', () => {
  const text = docxHtmlToVerse('<p>      six spaces</p>');
  assert.equal(text, '      six spaces');
});

test('a Word heading becomes a markdown heading, so titles are recognised', () => {
  const text = docxHtmlToVerse('<h1>A Titled Poem</h1><p>Its first line.</p>');
  assert.equal(text, '# A Titled Poem\nIts first line.');
  const [poem] = splitIntoPoems(text, DEFAULT_IMPORT_OPTIONS);
  assert.equal(poem.title, 'A Titled Poem');
  assert.equal(poem.body, 'Its first line.');
});

test('inline formatting is unwrapped rather than shown as markup', () => {
  const text = docxHtmlToVerse('<p><em>Italic</em> and <strong>bold</strong> words.</p>');
  assert.equal(text, 'Italic and bold words.');
});

test('entities are decoded, including the non-breaking space Word inserts', () => {
  assert.equal(docxHtmlToVerse('<p>Rock &amp; roll &lt;here&gt;</p>'), 'Rock & roll <here>');
  assert.equal(docxHtmlToVerse('<p>a&nbsp;b</p>'), 'a b');
  assert.equal(docxHtmlToVerse('<p>&#8212;&#x2014;</p>'), '——');
});

test('several poems separated by a delimiter line split correctly', () => {
  const text = ['# One', 'a', 'b', '', '---', '', '# Two', 'c'].join('\n');
  const poems = splitIntoPoems(text, DEFAULT_IMPORT_OPTIONS);
  assert.deepEqual(poems.map((p) => p.title), ['One', 'Two']);
  assert.equal(parseStanzas(poems[0].body).length, 1);
});

test('blank-line mode splits poems without eating stanza breaks', () => {
  const text = [
    'Poem One', 'a', '', 'b', // one blank = stanza break
    '', '', '',               // three blanks = new poem
    'Poem Two', 'c',
  ].join('\n');
  const poems = splitIntoPoems(text, { ...DEFAULT_IMPORT_OPTIONS, mode: 'blankLines', blankLineCount: 3 });
  assert.deepEqual(poems.map((p) => p.title), ['Poem One', 'Poem Two']);
  assert.equal(parseStanzas(poems[0].body).length, 2, 'stanza break inside the poem survived');
});

test('single mode keeps everything as one poem', () => {
  const text = 'Title\nline\n\nline two';
  const [poem, ...rest] = splitIntoPoems(text, { ...DEFAULT_IMPORT_OPTIONS, mode: 'single' });
  assert.equal(rest.length, 0);
  assert.equal(poem.title, 'Title');
});

test('imported poems get sequential order and the chosen section', () => {
  const parsed = splitIntoPoems('# A\nx\n\n---\n\n# B\ny', DEFAULT_IMPORT_OPTIONS);
  const poems = toPoems(parsed, 5, 'sec1');
  assert.deepEqual(poems.map((p) => p.order), [5, 6]);
  assert.deepEqual(poems.map((p) => p.sectionId), ['sec1', 'sec1']);
  assert.equal(new Set(poems.map((p) => p.id)).size, 2);
});
