export type { PaperType } from './kdp';
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
  kind: 'poem';
  id: string;
  title: string;
  /** Raw text. Line breaks and blank lines are meaningful and never reflowed. */
  body: string;
  epigraph: string;
  dedication: string;
  /**
   * Overrides the collection's left alignment for one poem. Shaped poems are
   * centred or ranged right by the poet, not by the book design, so this is
   * per poem rather than a global setting.
   */
  align?: Align;
  /**
   * Set only on seeded placeholder verses (see src/data/samplePoems.ts) so the
   * "Clear sample poems" action can find them. Never set on real work.
   */
  sampleKey?: string;
};

/**
 * A part opener. It carries no list of poems: the poems under it are simply the
 * ones that follow it in `contents`, which is also how a reader finds them.
 */
export type Section = {
  kind: 'section';
  id: string;
  title: string;
  subtitle: string;
};

/**
 * A page that is a picture rather than verse.
 *
 * The page exists before the picture does — you can put a plate in the running
 * order and choose the image later — so `assetId` may be empty, and the export
 * checks rather than the type are what insist on it being filled in.
 */
export type Illustration = {
  kind: 'illustration';
  id: string;
  /** Listed in the contents when set. A plate may perfectly well have no name. */
  title: string;
  /** Printed under the picture, in italic. */
  caption: string;
  assetId: string;
  naturalWidth: number;
  naturalHeight: number;
  /** `contain` sits inside the margins; `bleed` runs off the trimmed edge. */
  fit: 'contain' | 'bleed';
  /** Put the plate on a right-hand page. Implied by `facingBlank`. */
  startsRecto: boolean;
  /**
   * Leave the page opposite blank, the way a frontispiece is set. Which page
   * faces this one is only knowable once it has a side, so this puts the plate
   * on a recto and pushes what follows to the next recto — the arrangement the
   * convention actually describes.
   */
  facingBlank: boolean;
};

/**
 * One entry in the body of the book.
 *
 * Poems and parts used to live in two arrays keyed to each other by id and
 * ordered by a number on every row. That could not express a poem printed
 * between two parts, it needed renumbering after every drag, and the ordering
 * had to be recomputed identically in the renderer, the list and the contents
 * page. One array in printed order says the same thing and cannot disagree
 * with itself.
 */
export type ContentItem = Poem | Section | Illustration;

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

/**
 * Where a text box is measured from.
 *
 * `board` means the whole thing, which is what a board with no structure has
 * and all a social post will ever need. A cover has the other three as well.
 */
export type CoverPanel = 'front' | 'spine' | 'back' | 'board';

export type CoverTextBox = {
  id: string;
  panel: CoverPanel;
  text: string;
  /**
   * Points from the top-left of the panel the box belongs to.
   *
   * Points, not inches, because a cover is only one of the things this
   * coordinate space will have to hold. See `docs/DECISIONS.md`.
   */
  x: number;
  y: number;
  width: number;
  font: FontSpec;
  /** Spine text is rotated 90deg automatically; this is extra rotation. */
  rotate: number;
  /**
   * How far the words bend around a circle: 0 is a straight line, 100 arches
   * up into very nearly a full ring, -100 hangs down into one. The number is
   * the sweep in degrees divided by 3.5, so 10 is a gentle title arch.
   */
  curve: number;
};

/**
 * A reference to an image in the assets table, not the image itself. The pixel
 * dimensions travel with the reference so DPI checks stay synchronous and never
 * have to load the blob.
 */
export type CoverImage = {
  assetId: string;
  naturalWidth: number;
  naturalHeight: number;
  fit: 'cover' | 'contain';
};

/** A project saved before assets moved out of the document. */
export type LegacyCoverImage = {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  fit: 'cover' | 'contain';
};

/**
 * A picture placed freely on the cover — front, back, or across the wrap.
 *
 * Positions are in inches from the top-left of the whole cover, bleed
 * included, which is the same frame the layout and the exported PDF use. The
 * designer scales them to the screen; nothing else has to convert.
 *
 * Stickers are drawn in array order, so the last one is on top. That makes
 * "bring forward" a move within the array rather than a number to keep in
 * step, which is one fewer thing that can disagree with itself.
 */
export type CoverSticker = {
  id: string;
  /** The image, copied into this book rather than shared with a library. */
  assetId: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Points from the top-left of the whole cover. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise, about the sticker's own centre. */
  rotate: number;
  /** 0–0.5, as a share of the shorter side. Half is a circle. */
  cornerRadius: number;
  /** Null for no border at all, which is the usual case. */
  border: { widthPt: number; color: string } | null;
  shadow: boolean;
  /**
   * How far the picture itself is bent around a circle, on the same scale as a
   * text box's curve: 0 is flat, positive arches it up, negative hangs it down.
   * A tall picture stops short of the ends of the range, where its inner edge
   * would fold through the middle of the circle.
   */
  arc: number;
  /** What it is called, for the tray and for the library. */
  name: string;
};

export type CoverSpec = {
  backgroundColor: string;
  backColor: string;
  spineColor: string;
  frontImage: CoverImage | null;
  /** When true the front image is stretched across back+spine+front. */
  imageSpansWrap: boolean;
  textBoxes: CoverTextBox[];
  /** Pictures placed freely, in the order they are drawn. */
  stickers: CoverSticker[];
  showBarcodeZone: boolean;
};

/**
 * Something else made for the book: a post, a pin, a postcard, a bookmark.
 *
 * It holds a `CoverSpec` because a design and a cover are the same thing —
 * text and pictures placed on a board — and the board it sits on comes from
 * the preset rather than from the book's trim.
 */
export type Design = {
  id: string;
  name: string;
  /** Which board, by `lib/presets.ts` id. */
  presetId: string;
  cover: CoverSpec;
  createdAt: number;
  /** Absent on designs made before anything recorded it; fall back to createdAt. */
  updatedAt?: number;
  /**
   * When this was put in the trash, or absent while it is not.
   *
   * Deletion is a soft thing here for one reason: there is no server copy.
   * A book lives in this browser and nowhere else, so a mis-click used to be
   * the end of it. See `lib/trash.ts`.
   */
  deletedAt?: number;
};

/**
 * A design that belongs to nobody.
 *
 * The same shape as one inside a book, in its own table rather than in a
 * field. Most of what someone makes around a book — a post, a pin, a bookmark
 * — is not made while a book is open, and asking which book it belongs to
 * before showing them a blank board is a question with no right answer.
 *
 * It carries the schema number for the same reason a book does: nothing in the
 * numbers says which unit they are in, so a future migration has to be told.
 */
export type StandaloneDesign = Design & {
  schema: number;
  updatedAt: number;
  /** A book whose pictures were borrowed into the tray, if one was. */
  borrowedFrom?: string;
};

export type BookKind = 'poetry' | 'coloring';

/**
 * What every book has, whatever is inside it.
 *
 * The two kinds share the parts that are about printing rather than about
 * content: the trim, the margins, the cover, the matter pages. That shared
 * half is what lets one set of KDP maths, one cover designer and one PDF
 * pipeline serve both.
 */
export type BookBase = {
  id: string;
  /**
   * What shape the stored record is in. Absent means 1, which is a book saved
   * when the cover's coordinates were in inches.
   */
  schema?: number;
  kind: BookKind;
  name: string;
  createdAt: number;
  updatedAt: number;
  meta: BookMeta;
  trim: TrimSettings;
  margins: Margins;
  frontMatter: MatterPage[];
  backMatter: MatterPage[];
  cover: CoverSpec;
  /** The launch kit: everything made for the book that is not the book. */
  designs?: Design[];
  /**
   * When this was put in the trash, or absent while it is not.
   *
   * Deletion is a soft thing here for one reason: there is no server copy.
   * A book lives in this browser and nowhere else, so a mis-click used to be
   * the end of it. See `lib/trash.ts`.
   */
  deletedAt?: number;
};

export type PoetryProject = BookBase & {
  kind: 'poetry';
  layout: LayoutSettings;
  typography: Typography;
  border: BorderSettings;
  ornament: OrnamentSettings;
  headers: HeaderSettings;
  toc: TocSettings;
  /** The body of the book, in the order it is printed. */
  contents: ContentItem[];
};

/**
 * Kept as the name the poetry side has always used. Splitting the type was to
 * make room for a second kind of book, not to rename everything that works.
 */
export type Project = PoetryProject;

/**
 * What kind of thing was uploaded.
 *
 * A painting has to be traced; a page that is already line art must not be.
 * Running edge detection over an existing outline finds both sides of every
 * stroke and returns a doubled, hollow version of the drawing — so the two go
 * down different paths entirely rather than sharing one with a flag.
 */
export type SourceKind = 'painting' | 'lineart';

/** How one picture is turned into line art. Nothing here is generative. */
export type LineArtSettings = {
  /** Local thresholding keeps tonal areas; edges keeps outlines only. */
  mode: 'threshold' | 'edges';
  /** 0–100. Bigger means finer detail survives. */
  detail: number;
  /** 0–100. Bigger means heavier lines. */
  thickness: number;
  /** 0–100. Blur before thresholding, and the size of specks removed after. */
  cleanup: number;
  /**
   * 0–100. How far a ragged edge is straightened after everything else.
   *
   * Capped by how wide the strokes turned out, because rounding a corner by
   * more than the stroke is wide does not round it, it rubs it out.
   */
  smoothing: number;
  /** For art that is light on dark. */
  invert: boolean;
};

export type ColoringPage = {
  id: string;
  title: string;
  /** Guessed when the picture arrives, and overridable — the guess can be wrong. */
  source: SourceKind;
  /** True while the guess stands, so the interface can own up to having guessed. */
  sourceGuessed: boolean;
  /** The original upload, kept so the settings stay re-appliable. */
  sourceAssetId: string;
  /** The processed line art. Null until it has been run. */
  lineArtAssetId: string | null;
  /**
   * The settings that produced the line art now stored.
   *
   * Comparing this against `settings` is how the converter knows what still
   * needs doing — which means a book reopened tomorrow does not re-run every
   * page, and a slider moved and moved back costs nothing.
   */
  renderedWith: LineArtSettings | null;
  /** How far the stored art had to be enlarged to reach 300 DPI. 1 means not at all. */
  upscaled: number;
  /**
   * How the picture sits on the page. `contain` shows all of it and leaves
   * paper around a picture the wrong shape; `cover` fills the page and crops
   * what will not fit.
   */
  fit: 'contain' | 'cover';
  /** Quarter turns. A wide picture on a tall page is worth turning. */
  rotate: 0 | 90;
  naturalWidth: number;
  naturalHeight: number;
  settings: LineArtSettings;
};

/**
 * A front-matter page whose design is a picture rather than something the app
 * lays out — the title, the name line, or the page for trying pens on.
 */
export type MatterSlot = 'title' | 'belongs' | 'colorTest';

export type ColoringSettings = {
  /** Applied to every new page, and by "apply to all". */
  lineArt: LineArtSettings;
  /**
   * Artwork supplied for a generated page, or null to use the built-in design.
   *
   * The same shape as a coloring page on purpose: it goes through the same
   * cleanup, the same enlargement, the same placement arithmetic and the same
   * conversion queue. A front-matter drawing is a drawing.
   */
  titleArt: ColoringPage | null;
  belongsArt: ColoringPage | null;
  colorTestArt: ColoringPage | null;
  /** A blank back behind every coloring page, so markers cannot bleed through. */
  singleSided: boolean;
  /** The generated front matter, each page its own switch. */
  titlePage: boolean;
  copyrightPage: boolean;
  belongsToPage: boolean;
  colorTestPage: boolean;
  /**
   * Set when any page came from an image generator rather than from the poet's
   * own hand. KDP asks to be told, and the export panel is the last place
   * anyone would notice in time.
   */
  containsAiImages: boolean;
};

/**
 * The two faces a coloring book sets. Its front matter is a title page and a
 * copyright notice, not a book of verse, so it needs a display face and a
 * reading one and nothing else.
 */
export type ColoringTypography = {
  title: FontSpec;
  body: FontSpec;
};

export type ColoringBook = BookBase & {
  kind: 'coloring';
  pages: ColoringPage[];
  coloring: ColoringSettings;
  typography: ColoringTypography;
};

/**
 * What the cover machinery needs from a book — the designer, the layout, the
 * renderer and the validator. A cover is about the outside of the book, and
 * the outside of a book of verse and of a book of pictures are the same thing.
 */
export type CoverableBook = {
  meta: BookMeta;
  trim: TrimSettings;
  cover: CoverSpec;
};

/** What the font machinery needs from a book, whichever kind it is. */
export type FontedBook = {
  typography: Record<string, FontSpec>;
  cover: CoverSpec;
};

/**
 * A sticker kept across every book rather than inside one.
 *
 * The image is held at the size it was supplied, never at the size it happened
 * to be used at, so the same sticker prints sharply whether it ends up an inch
 * across or six.
 */
export type LibrarySticker = {
  id: string;
  name: string;
  /** Free-form, for grouping: "cats", "flowers", "badges". */
  tags: string[];
  assetId: string;
  width: number;
  height: number;
  createdAt: number;
  /**
   * When this was put in the trash, or absent while it is not.
   *
   * Deletion is a soft thing here for one reason: there is no server copy.
   * A book lives in this browser and nowhere else, so a mis-click used to be
   * the end of it. See `lib/trash.ts`.
   */
  deletedAt?: number;
};

/**
 * A saved cover layout, so every book in a series can start from one design.
 *
 * It holds a whole CoverSpec. Applying it copies each sticker's image into the
 * book it is applied to, so a template and the books made from it never share
 * bytes and can never break each other.
 */
export type CoverTemplate = {
  id: string;
  name: string;
  createdAt: number;
  cover: CoverSpec;
  /**
   * When this was put in the trash, or absent while it is not.
   *
   * Deletion is a soft thing here for one reason: there is no server copy.
   * A book lives in this browser and nowhere else, so a mis-click used to be
   * the end of it. See `lib/trash.ts`.
   */
  deletedAt?: number;
};

/**
 * A sticker still being made.
 *
 * Everything needed to put the Studio back exactly as it was left, and nothing
 * that could be mistaken for a finished sticker. The upload and the colouring
 * are referred to by asset id rather than carried here, so the row stays small
 * enough to write on every change without thinking about it.
 *
 * The original is never overwritten. Every setting can be changed later and
 * re-applied from `sourceAssetId`, which is the same reason a colouring page
 * keeps its source and its line art apart.
 */
export type StickerDraft = {
  id: string;
  name: string;
  /** As typed, not yet parsed, so reopening shows what was written. */
  tags: string;
  /** The upload, untouched and at full resolution. */
  sourceAssetId: string;
  mode: 'convert' | 'cleanup' | 'asis';
  settings: LineArtSettings;
  removeBackground: boolean;
  tolerance: number;
  smoothing: number;
  inkColour: string;
  dieCut: { width: number; colour: string; radius: number } | null;
  /** The long edge the finished PNG is exported at. */
  size: number;
  /**
   * The colouring, as its own PNG, at the size it was painted.
   *
   * Its own layer rather than painted into the line art, so the line weight
   * can be changed afterwards without losing the colours — and stored
   * losslessly, so opening a draft a week later starts from exactly the
   * pixels that were left.
   */
  colourAssetId: string | null;
  /**
   * The hand corrections to the background removal, stored the same way and
   * for the same reason: a field on the row, not a new table, so no version
   * bump — IndexedDB stores whole objects and only indexes need declaring.
   */
  touchAssetId: string | null;
  /** Colours changed on a kept picture, in order. Another plain field. */
  swaps: { from: string; to: string; tolerance: number }[];
  /** Flipping, turning and cropping. Settings, never baked pixels. */
  frame: {
    flipX: boolean;
    flipY: boolean;
    rotate: number;
    crop: { x: number; y: number; width: number; height: number } | null;
  };
  colourAt: { width: number; height: number } | null;
  /** How far outlines are thickened, invisibly, to stop a fill leaking. */
  gapClosing: number;
  createdAt: number;
  updatedAt: number;
  /** The trash rules apply here too. See `lib/deleted.ts`. */
  deletedAt?: number;
};

/** Anything the studio can open. */
export type AnyProject = PoetryProject | ColoringBook;

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
  /**
   * Asset id to URL. Object URLs in the preview, data URLs for export, because
   * an object URL means nothing outside the document that made it.
   */
  assets?: Record<string, string>;
  /** Blank pages appended to reach an even count, known after a first pass. */
  padPages: number;
  /**
   * Open the browser's print dialog once pagination finishes. This is the
   * fallback path when no server-side Chromium is available: the same Paged.js
   * output, printed by the user's own browser.
   */
  autoPrint?: boolean;
};
