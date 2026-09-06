/**
 * ============================================================================
 * PLACEHOLDER SEED CONTENT — SAFE TO DELETE
 * ============================================================================
 *
 * These are throwaway verses written for this repository purely to exercise the
 * layout engine. They are not literature and are not meant to ship in anyone's
 * book. Each one is shaped to stress one specific typesetting path:
 *
 *   long lines .......... hanging turnover indents
 *   ~30 lines ........... a mid-poem page break and the "(continued)" marker
 *   3 lines ............. vertical centering on a page of its own
 *   uneven stanzas ...... stanza spacing
 *   an epigraph ......... the epigraph block above the first stanza
 *   a very long title ... poem-title wrapping in the measure
 *   three ordinary ...... the common case
 *
 * To remove them: press "Clear sample poems" in the poem list, or delete this
 * file and the single import of `SAMPLE_POEMS` in `lib/samples.ts`.
 */

export type SamplePoem = {
  /** Stable id so "Clear sample poems" can find them again after a reload. */
  key: string;
  title: string;
  epigraph?: string;
  dedication?: string;
  body: string;
};

export const SAMPLE_POEM_KEY_PREFIX = 'sample:';

export const SAMPLE_POEMS: SamplePoem[] = [
  {
    key: 'long-lines',
    title: 'Test — Long Lines',
    body: [
      'The measure of this line runs on well past the point where any sensible typesetter would have stopped it,',
      'and it keeps going, gathering commas, so that the turnover falls somewhere near the middle of the phrase,',
      'which is exactly the place a hanging indent has to prove that it knows the difference between a wrapped line and a new one.',
      'Short line after.',
      'Then another that stretches out again, deliberately, past ninety characters, to be certain the indent repeats.',
    ].join('\n'),
  },
  {
    key: 'page-break',
    title: 'Test — Page Break',
    body: [
      'Count the lines as they go by.',
      'One for the paper.',
      'Two for the ink.',
      'Three for the press that will not wait.',
      '',
      'Four for the margin.',
      'Five for the gutter.',
      'Six for the thumb that holds the page.',
      'Seven for the fold.',
      '',
      'Eight for the spine.',
      'Nine for the glue.',
      'Ten for the box it travels in.',
      'Eleven for the shelf.',
      '',
      'Twelve for the reader.',
      'Thirteen for the lamp.',
      'Fourteen for the hour that is late.',
      'Fifteen for the quiet.',
      '',
      'Sixteen for the turning.',
      'Seventeen for the pause.',
      'Eighteen for the line that carries over.',
      'Nineteen for the one that follows it.',
      '',
      'Twenty for the second page.',
      'Twenty-one for the marker.',
      'Twenty-two for the word that says continued.',
      'Twenty-three for the stanza that survived the break.',
      '',
      'Twenty-four for the ending.',
      'Twenty-five, and stop.',
    ].join('\n'),
  },
  {
    key: 'short',
    title: 'Test — Short Poem',
    body: ['Three lines,', 'a page to themselves,', 'and all that air around them.'].join('\n'),
  },
  {
    key: 'uneven-stanzas',
    title: 'Test — Uneven Stanzas',
    body: [
      'A stanza of one.',
      '',
      'A stanza of two,',
      'set close together.',
      '',
      'A stanza of four,',
      'which takes its time,',
      'and does not hurry',
      'toward the white space.',
      '',
      'A stanza of three',
      'to end on,',
      'unevenly.',
    ].join('\n'),
  },
  {
    key: 'epigraph',
    title: 'Test — Epigraph',
    epigraph: 'Set everything twice: once to read, once to be sure.',
    body: [
      'The note above sits closer to the title',
      'than the first line does.',
      '',
      'It leans right, or centres, or stays put,',
      'depending on the panel.',
      '',
      'Below it the poem begins as poems do,',
      'flush left, ragged right,',
      'with nothing justified,',
      'and nothing stretched to fit.',
    ].join('\n'),
  },
  {
    key: 'long-title',
    title:
      'Test — A Deliberately Overlong Title That Should Wrap Across More Than One Line Inside The Measure Without Disturbing The Space Below It',
    body: [
      'The title above is the point.',
      'The poem is only here to follow it.',
      '',
      'Check the leading between title lines.',
      'Check the gap before this stanza.',
      'Check that the second line of the title',
      'did not steal room from the first line of the verse.',
    ].join('\n'),
  },
  {
    key: 'ordinary-1',
    title: 'Test — Ordinary A',
    body: [
      'Morning gets in through the small window',
      'and lands on the table without asking.',
      'The chair takes its usual share.',
      'The cup keeps the rest.',
      '',
      'Nothing here is in a hurry.',
      'The light moves an inch an hour.',
      'By noon it has crossed the whole grain',
      'and left the wood a little warmer.',
    ].join('\n'),
  },
  {
    key: 'ordinary-2',
    title: 'Test — Ordinary B',
    body: [
      'The road holds its shape in the rain',
      'the way an argument holds its shape',
      'long after the reason has gone.',
      '',
      'Somewhere a gate is open.',
      'Somewhere a dog has stopped barking.',
      'The hedge keeps its own counsel.',
      '',
      'I walk to the turn and back.',
      'That is the whole of it.',
      'That is enough for one evening.',
    ].join('\n'),
  },
  {
    key: 'ordinary-3',
    title: 'Test — Ordinary C',
    dedication: 'for no one in particular',
    body: [
      'Count what is left at the end of the week:',
      'two apples, a letter, the good pen.',
      'The list is short and does not improve',
      'for being read again.',
      '',
      'Still, the kettle works.',
      'Still, the door shuts properly.',
      'Still, the clock is only a minute fast,',
      'and that has always been on purpose.',
    ].join('\n'),
  },
];
