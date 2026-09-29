import { DEFAULT_TRIM_ID } from './kdp';
import { SCHEMA } from './schema';
import type {
  ColoringTypography,
  Design,
  FontSpec,
  MatterPage,
  Project,
  Typography,
} from './types';

export const SERIF_FALLBACK = "'EB Garamond', Garamond, 'Times New Roman', Georgia, serif";
export const SANS_FALLBACK = "'Inter', 'Helvetica Neue', Arial, sans-serif";

export function font(partial: Partial<FontSpec> & { family: string }): FontSpec {
  return {
    fallback: SERIF_FALLBACK,
    weight: 400,
    italic: false,
    sizePt: 11,
    lineHeight: 1.5,
    letterSpacingEm: 0,
    transform: 'none',
    align: 'left',
    color: '#111111',
    ...partial,
  };
}

/**
 * A coloring book's two faces. Nothing here is set on a page anybody colours
 * in — it is the title page, the copyright notice and the line a child writes
 * their name on, so it wants to be plain, large and friendly rather than
 * literary.
 */
export const DEFAULT_COLORING_TYPOGRAPHY: ColoringTypography = {
  title: font({
    family: 'Nunito Sans',
    fallback: SANS_FALLBACK,
    sizePt: 30,
    lineHeight: 1.2,
    weight: 700,
    align: 'center',
  }),
  body: font({
    family: 'Nunito Sans',
    fallback: SANS_FALLBACK,
    sizePt: 11,
    lineHeight: 1.6,
    align: 'center',
  }),
};

/**
 * Poetry defaults: a Garamond at 11.5pt on 1.5 line height. Ragged right,
 * generous leading, and titles set in small caps a size up from the body.
 */
export const DEFAULT_TYPOGRAPHY: Typography = {
  body: font({ family: 'EB Garamond', sizePt: 11.5, lineHeight: 1.5 }),
  poemTitle: font({
    family: 'EB Garamond',
    sizePt: 13,
    lineHeight: 1.25,
    transform: 'smallcaps',
    letterSpacingEm: 0.06,
    align: 'left',
  }),
  sectionTitle: font({
    family: 'Cormorant Garamond',
    sizePt: 24,
    lineHeight: 1.2,
    transform: 'none',
    letterSpacingEm: 0.04,
    align: 'center',
  }),
  matter: font({ family: 'EB Garamond', sizePt: 11, lineHeight: 1.5, align: 'center' }),
  runningHead: font({
    family: 'EB Garamond',
    sizePt: 9,
    italic: true,
    letterSpacingEm: 0.05,
    color: '#444444',
  }),
  pageNumber: font({ family: 'EB Garamond', sizePt: 9.5, align: 'center', color: '#333333' }),
  toc: font({ family: 'EB Garamond', sizePt: 10.5, lineHeight: 1.7 }),
};

let seq = 0;
export function id(prefix = 'id'): string {
  seq += 1;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${seq.toString(36)}`;
}

function matter(
  kind: MatterPage['kind'],
  label: string,
  order: number,
  extra: Partial<MatterPage> = {},
): MatterPage {
  return {
    id: id('mt'),
    kind,
    label,
    enabled: true,
    heading: '',
    body: '',
    align: 'center',
    verticalPosition: 'center',
    startsRecto: true,
    order,
    ...extra,
  };
}

export function defaultFrontMatter(meta: { title: string; author: string; year: string }): MatterPage[] {
  return [
    matter('halfTitle', 'Half title', 0, { body: meta.title, verticalPosition: 'center' }),
    matter('title', 'Title page', 1, {
      body: `${meta.title}\n\n\n${meta.author}`,
      verticalPosition: 'center',
    }),
    matter('copyright', 'Copyright', 2, {
      align: 'left',
      verticalPosition: 'bottom',
      startsRecto: false,
      body: [
        `Copyright © ${meta.year} ${meta.author}`,
        '',
        'All rights reserved. No part of this book may be reproduced in any form',
        'without written permission from the publisher, except for brief',
        'quotations in a review.',
        '',
        'First edition.',
      ].join('\n'),
    }),
    matter('dedication', 'Dedication', 3, {
      body: 'For those who read slowly.',
      verticalPosition: 'center',
    }),
    matter('epigraph', 'Epigraph', 4, {
      enabled: false,
      body: '“I dwell in Possibility—”\n\n— Emily Dickinson',
      verticalPosition: 'center',
    }),
  ];
}

export function defaultBackMatter(): MatterPage[] {
  return [
    matter('acknowledgements', 'Acknowledgements', 0, {
      heading: 'Acknowledgements',
      align: 'left',
      verticalPosition: 'top',
      body: 'Thanks are due to the editors of the journals in which several of these poems first appeared.',
    }),
    matter('aboutAuthor', 'About the author', 1, {
      heading: 'About the Author',
      align: 'left',
      verticalPosition: 'top',
      body: 'A short biographical note goes here.',
    }),
  ];
}

/**
 * A launch-kit design with nothing on it yet.
 *
 * Here rather than in the kit itself because a design can now be started from
 * the front page as well, and two places making one would eventually make two
 * slightly different ones.
 */
export function createDesign(presetId: string, name: string): Design {
  return {
    id: id('dsn'),
    name,
    presetId,
    createdAt: Date.now(),
    cover: {
      backgroundColor: '#f4efe4',
      backColor: '#f4efe4',
      spineColor: '#f4efe4',
      frontImage: null,
      imageSpansWrap: false,
      showBarcodeZone: false,
      textBoxes: [],
      stickers: [],
    },
  };
}

export function createProject(overrides: Partial<Project> = {}): Project {
  const now = Date.now();
  const meta = {
    title: 'Untitled Collection',
    subtitle: '',
    author: 'Anonymous',
    publisher: '',
    isbn: '',
    year: String(new Date().getFullYear()),
    copyrightExtra: '',
    ...overrides.meta,
  };
  return {
    id: overrides.id ?? id('proj'),
    kind: 'poetry',
    // Written in the shape the app writes now, so the migration leaves it be.
    schema: SCHEMA,
    name: overrides.name ?? meta.title,
    createdAt: now,
    updatedAt: now,
    meta,
    trim: { trimId: DEFAULT_TRIM_ID, bleed: false, paper: 'cream' },
    // 0.75" gutter is legal all the way to 700 pages, so a growing manuscript
    // never trips the margin warning on its own.
    margins: { inside: 0.75, outside: 0.6, top: 0.75, bottom: 0.7 },
    layout: {
      poemStart: 'newPage',
      stanzaSpacingEm: 1,
      hangingIndentEm: 1.5,
      titleSpaceAboveEm: 0,
      titleSpaceBelowEm: 1.4,
      verticalCenterShortPoems: false,
      shortPoemMaxLines: 14,
      sectionStartsRecto: true,
      continuedMarker: '(continued)',
      showContinuedMarker: true,
    },
    typography: structuredCloneSafe(DEFAULT_TYPOGRAPHY),
    border: {
      enabled: false,
      style: 'thin',
      color: '#8a7a5c',
      weightPt: 0.75,
      insetIn: 0.15,
      scope: 'poemOpen',
    },
    ornament: {
      betweenPoems: true,
      glyph: 'asterism',
      color: '#8a7a5c',
      sizePt: 11,
      spacingEm: 1.6,
    },
    headers: {
      verso: 'bookTitle',
      recto: 'author',
      pageNumberPosition: 'bottomCenter',
      suppressOnPoemOpen: false,
      suppressOnSectionOpen: true,
    },
    toc: {
      enabled: true,
      heading: 'Contents',
      includePoems: true,
      leaderDots: true,
      firstLineIndex: false,
      firstLineIndexHeading: 'Index of First Lines',
    },
    frontMatter: defaultFrontMatter(meta),
    backMatter: defaultBackMatter(),
    contents: [],
    cover: {
      backgroundColor: '#f4efe4',
      backColor: '#f4efe4',
      spineColor: '#f4efe4',
      frontImage: null,
      imageSpansWrap: false,
      textBoxes: [],
      stickers: [],
      showBarcodeZone: true,
    },
    ...overrides,
  };
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
