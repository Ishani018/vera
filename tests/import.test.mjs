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

// --- filename as title -------------------------------------------------------

import { firstLineIsTitleOf, poemsFromFile, titleFromFilename } from '../lib/import.ts';

test('a filename becomes a title, with Google substitutions undone', () => {
  assert.equal(titleFromFilename('Are we the same_.docx'), 'Are we the same');
  assert.equal(titleFromFilename('It_s only fair_.docx'), "It's only fair");
  assert.equal(titleFromFilename('What if it_s just me.docx'), "What if it's just me");
  assert.equal(titleFromFilename('_What if.docx'), 'What if');
  assert.equal(titleFromFilename('Lost letters (1).docx'), 'Lost letters');
  assert.equal(titleFromFilename('Not Like The Rest.docx'), 'Not Like The Rest');
});

test('Google placeholder names produce an untitled poem, not a title', () => {
  assert.equal(titleFromFilename('Untitled document.docx'), '');
  assert.equal(titleFromFilename('untitled.docx'), '');
  assert.equal(titleFromFilename('Untitled document (2).docx'), '');
});

test('a first line matching the filename is a title', () => {
  assert.ok(firstLineIsTitleOf('Are we the same?', 'Are we the same'));
  assert.ok(firstLineIsTitleOf('Love: A beautiful mistake', 'Love_ A beautiful mistake'));
  assert.ok(firstLineIsTitleOf('Friends can break hearts too~', 'Friends can break hearts too'));
  assert.ok(firstLineIsTitleOf('The Book of Life', 'The book of life'));
  // A parenthetical dedication and a trailing date are part of a title.
  assert.ok(firstLineIsTitleOf('The Dwindling Daisy(the one for Revathy)', 'The Dwindling Daisy'));
  assert.ok(firstLineIsTitleOf('My last ode to you -21/6/2024', 'My last ode to you'));
});

test('a first line that is verse is not mistaken for a title', () => {
  assert.equal(firstLineIsTitleOf('I closed my eyes,', "It's only fair"), false);
  assert.equal(firstLineIsTitleOf('Your leaves were bright,', 'Not Like The Rest'), false);
  assert.equal(firstLineIsTitleOf('Like a river,', 'Your Strongest Soilder'), false);
  assert.equal(firstLineIsTitleOf('Chapter 2:', 'Lost letters'), false);
  // The dangerous near-miss: a poem opening with its own title word.
  assert.equal(
    firstLineIsTitleOf('Forevermore, the leaves will fall.', 'Forevermore'),
    false,
    'a prefix is not a title unless almost nothing is left over',
  );
});

test('an untitled document keeps every line of verse', () => {
  const poems = poemsFromFile(
    { name: 'Untitled document.docx', text: 'Close your eyes,\nAnd drift away,' },
    DEFAULT_IMPORT_OPTIONS,
  );
  assert.equal(poems.length, 1);
  assert.equal(poems[0].title, '');
  assert.equal(poems[0].body, 'Close your eyes,\nAnd drift away,');
});

test('a document with no title line keeps its first line and takes the filename', () => {
  const poems = poemsFromFile(
    { name: 'Not Like The Rest.docx', text: 'Your leaves were bright,\nThe petals white.' },
    DEFAULT_IMPORT_OPTIONS,
  );
  assert.equal(poems[0].title, 'Not Like The Rest');
  assert.equal(poems[0].body, 'Your leaves were bright,\nThe petals white.');
});

test('a document with a title line uses its wording, not the sanitised filename', () => {
  const poems = poemsFromFile(
    { name: 'What if it_s just me.docx', text: "What if it's just me?\nWhat do you do," },
    DEFAULT_IMPORT_OPTIONS,
  );
  assert.equal(poems[0].title, "What if it's just me?", 'the document keeps the apostrophe');
  assert.equal(poems[0].body, 'What do you do,');
});

test('a file holding several poems falls back to the blob rules', () => {
  const poems = poemsFromFile(
    { name: 'Collection.docx', text: '# One\na\n\n---\n\n# Two\nb' },
    DEFAULT_IMPORT_OPTIONS,
  );
  assert.deepEqual(poems.map((p) => p.title), ['One', 'Two']);
});

test('a markdown heading still wins over the filename', () => {
  const poems = poemsFromFile(
    { name: 'wrong-name.docx', text: '# The Real Title\nA line.' },
    DEFAULT_IMPORT_OPTIONS,
  );
  assert.equal(poems[0].title, 'The Real Title');
  assert.equal(poems[0].body, 'A line.');
});
