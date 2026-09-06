import type { PaperType } from './kdp';

export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'smallcaps';
export type Align = 'left' | 'center' | 'right';

export type FontSpec = {
  family: string;
  /** CSS fallback stack appended after `family`. */
  fallback: string;
  weight: number;
  italic: boolean;
  sizePt: number;
  /** Unitless multiplier. */
  lineHeight: number;
  letterSpacingEm: number;
  transform: TextTransform;
  align: Align;
  color: string;
};

export type Poem = {
  id: string;
  title: string;
  /** Raw text. Line breaks and blank lines are meaningful and never reflowed. */
  body: string;
  epigraph: string;
  dedication: string;
  sectionId: string | null;
  order: number;
  /**
   * Set only on seeded placeholder verses (see src/data/samplePoems.ts) so the
   * "Clear sample poems" action can find them. Never set on real work.
   */
  sampleKey?: string;
};

export type Section = {
  id: string;
  title: string;
  subtitle: string;
  order: number;
};

export type MatterKind =
  | 'halfTitle'
  | 'title'
  | 'copyright'
  | 'dedication'
  | 'epigraph'
  | 'acknowledgements'
  | 'aboutAuthor'
  | 'custom';

export type MatterPage = {
  id: string;
  kind: MatterKind;
  label: string;
  enabled: boolean;
  heading: string;
  body: string;
  align: Align;
  verticalPosition: 'top' | 'center' | 'bottom';
  /** Force the page onto a right-hand page. */
  startsRecto: boolean;
  order: number;
};

export type BorderStyle = 'thin' | 'double' | 'deco' | 'floral' | 'corners';
export type BorderScope = 'all' | 'poemOpen' | 'sectionOpen' | 'matter';

export type BorderSettings = {
  enabled: boolean;
  style: BorderStyle;
  color: string;
  /** Stroke weight in points. */
  weightPt: number;
  /** Distance in inches from the text block out to the border. */
  insetIn: number;
  scope: BorderScope;
};

export type OrnamentGlyph = 'asterism' | 'fleuron' | 'dinkus' | 'rule' | 'diamond';

export type OrnamentSettings = {
  /** Ornament drawn between poems that flow on the same page. */
  betweenPoems: boolean;
  glyph: OrnamentGlyph;
  color: string;
  sizePt: number;
  spacingEm: number;
};

export type PoemStartMode = 'continuous' | 'newPage' | 'recto';

export type LayoutSettings = {
  poemStart: PoemStartMode;
  /** Space between stanzas, in em of the body size. */
  stanzaSpacingEm: number;
  /** Indent applied to a line that is too long for the measure (turnover). */
  hangingIndentEm: number;
  /** Space above/below a poem title, in em. */
  titleSpaceAboveEm: number;
  titleSpaceBelowEm: number;
  /** Centre a short poem in the text block when it has a page to itself. */
  verticalCenterShortPoems: boolean;
  /** "Short" means at most this many lines. */
  shortPoemMaxLines: number;
  /** Sections open on a new page; optionally force a recto. */
  sectionStartsRecto: boolean;
  /** Marker printed when a poem carries over onto the next page. */
  continuedMarker: string;
  showContinuedMarker: boolean;
};

export type PageNumberPosition = 'bottomCenter' | 'bottomOutside' | 'topOutside' | 'none';
export type RunningHeadContent = 'none' | 'bookTitle' | 'author' | 'sectionTitle' | 'poemTitle';

export type HeaderSettings = {
  verso: RunningHeadContent;
  recto: RunningHeadContent;
  pageNumberPosition: PageNumberPosition;
  suppressOnPoemOpen: boolean;
  suppressOnSectionOpen: boolean;
};

export type TocSettings = {
  enabled: boolean;
  heading: string;
  includePoems: boolean;
  leaderDots: boolean;
  firstLineIndex: boolean;
  firstLineIndexHeading: string;
};

export type Typography = {
  body: FontSpec;
  poemTitle: FontSpec;
  sectionTitle: FontSpec;
  matter: FontSpec;
  runningHead: FontSpec;
  pageNumber: FontSpec;
  toc: FontSpec;
};

export type BookMeta = {
  title: string;
  subtitle: string;
  author: string;
  publisher: string;
  isbn: string;
  year: string;
  copyrightExtra: string;
};

export type TrimSettings = {
  trimId: string;
  bleed: boolean;
  paper: PaperType;
};

export type Margins = { inside: number; outside: number; top: number; bottom: number };

export type CoverPanel = 'front' | 'spine' | 'back';

export type CoverTextBox = {
  id: string;
  panel: CoverPanel;
  text: string;
  /** Inches from the top-left of the panel the box belongs to. */
  x: number;
  y: number;
  widthIn: number;
  font: FontSpec;
  /** Spine text is rotated 90deg automatically; this is extra rotation. */
  rotate: number;
};

export type CoverImage = {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  fit: 'cover' | 'contain';
};

export type CoverSpec = {
  backgroundColor: string;
  backColor: string;
  spineColor: string;
  frontImage: CoverImage | null;
  /** When true the front image is stretched across back+spine+front. */
  imageSpansWrap: boolean;
  textBoxes: CoverTextBox[];
  showBarcodeZone: boolean;
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  meta: BookMeta;
  trim: TrimSettings;
  margins: Margins;
  layout: LayoutSettings;
  typography: Typography;
  border: BorderSettings;
  ornament: OrnamentSettings;
  headers: HeaderSettings;
  toc: TocSettings;
  frontMatter: MatterPage[];
  backMatter: MatterPage[];
  sections: Section[];
  poems: Poem[];
  cover: CoverSpec;
};

/** Everything the renderer needs that is not stored on the project. */
export type RenderOptions = {
  /**
   * `preview` renders for the iframe: page shadows, guides, and a postMessage
   * back to the app with the page count. `export` renders for headless
   * Chromium: no chrome, no guides, blank-page padding applied.
   */
  mode: 'preview' | 'export';
  /** Head markup that supplies the fonts: a stylesheet link, or inlined faces. */
  fontStyle: string;
  /**
   * URL of the Paged.js polyfill. Empty means the caller injects it itself,
   * which is what the export route does so it can serve it from node_modules.
   */
  pagedJsSrc: string;
  /** Draw margin/bleed/safe-area guides over each page. Preview only. */
  guides: { margins: boolean; bleed: boolean; safe: boolean; gutter: boolean };
  /** Blank pages appended to reach an even count, known after a first pass. */
  padPages: number;
};
