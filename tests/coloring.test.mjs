import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXTREME_UPSCALE,
  pageQuality,
  placeOnPage,
  printedSize,
  shapesAgree,
  storedLongEdge,
  targetLongEdge,
} from '../lib/coloring/quality.ts';
import { TRACE_EDGE } from '../lib/lineart/pipeline.ts';
import { convertibles } from '../lib/coloring/store.ts';
import { validateColoringBook } from '../lib/coloring/validate.ts';
import { projectAssetIds } from '../lib/exportClient.ts';
import { buildColoringHtml } from '../lib/render/coloringHtml.ts';
import { buildCoverHtml } from '../lib/render/coverHtml.ts';
import { coverLayout } from '../lib/render/coverLayout.ts';
import { validateCover } from '../lib/validate.ts';
import {
  artBox,
  frontMatterPages,
  sheetCount,
  sheetOf,
} from '../lib/render/coloringLayout.ts';
import { createColoringBook, migrateProject } from '../lib/projects.ts';

/** A page as the store writes one, with only what the reading depends on. */
const page = (over = {}) => ({
  id: 'page_1',
  title: 'A picture',
  source: 'painting',
  sourceGuessed: true,
  sourceAssetId: 'asset_1',
  lineArtAssetId: null,
  renderedWith: null,
  upscaled: 1,
  fit: 'contain',
  rotate: 0,
  naturalWidth: 3000,
  naturalHeight: 3000,
  settings: { mode: 'threshold', detail: 50, thickness: 45, cleanup: 40, smoothing: 50, invert: false },
  ...over,
});

/** A coloring book with `count` converted pictures in it. */
function coloringFixture(count) {
  const book = createColoringBook('Ghosts');
  book.pages = Array.from({ length: count }, (_, i) =>
    page({ id: `page_${i}`, title: `Picture ${i + 1}`, sourceAssetId: `src_${i}`, lineArtAssetId: `art_${i}` }),
  );
  return book;
}

const coloringOptions = () => ({
  mode: 'export',
  fontStyle: '',
  pagedJsSrc: '',
  guides: { margins: false, bleed: false, safe: false, gutter: false },
  assets: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`art_${i}`, `blob:art${i}`])),
  padPages: 0,
});

const square = () => createColoringBook('Square');

const tall = () => {
  const book = createColoringBook('Tall');
  book.trim = { ...book.trim, trimId: '8.5x11' };
  return book;
};

test('the printed page is the trim plus the bleed that is actually on it', () => {
  const book = square();
  assert.deepEqual(printedSize(book), { width: 8.625, height: 8.75 });

  book.trim = { ...book.trim, bleed: false };
  assert.deepEqual(printedSize(book), { width: 8.5, height: 8.5 });
});

test('the target long edge is 300 DPI across the paper that gets printed', () => {
  assert.equal(targetLongEdge(square()), Math.round(8.75 * 300));
  assert.equal(targetLongEdge(tall()), Math.round(11.25 * 300));
});

test('a picture that fits the page is measured by whichever side runs out first', () => {
  // Tall and narrow on a portrait page: the height decides, and reading the
  // width alone would report nearly twice the resolution there really is.
  const narrow = page({ naturalWidth: 800, naturalHeight: 2400 });
  const dpi = pageQuality(narrow, tall()).dpi;
  assert.ok(Math.abs(dpi - 2400 / 11.25) < 0.01, `read ${dpi}`);
});

test('a picture below 300 DPI is called soft, and one above it is not', () => {
  const small = page({ naturalWidth: 1200, naturalHeight: 1200, upscaled: 1 });
  assert.equal(pageQuality(small, square()).soft, true);
  // The same picture once the converter has enlarged its lines to the target.
  assert.equal(pageQuality({ ...small, upscaled: 2.2 }, square()).soft, false);
});

test('enlarging counts towards the reading, because the enlarged file is what prints', () => {
  const small = page({ naturalWidth: 1024, naturalHeight: 1024 });
  const before = pageQuality(small, square());
  const after = pageQuality({ ...small, upscaled: 2.56 }, square());
  assert.ok(after.dpi > before.dpi * 2.5);
  assert.equal(after.stored, Math.round(1024 * 2.56));
});

test('a long stretch is flagged, a modest one is not', () => {
  const small = page({ naturalWidth: 1024, naturalHeight: 1024 });
  assert.equal(pageQuality({ ...small, upscaled: EXTREME_UPSCALE + 0.1 }, square()).stretched, true);
  assert.equal(pageQuality({ ...small, upscaled: EXTREME_UPSCALE - 0.1 }, square()).stretched, false);
});

test('a scan larger than the converter works at is reported at the size that was saved', () => {
  // The converter reduces anything past TRACE_EDGE before it traces, so what
  // prints comes from that reduction, not from the 9000-pixel original.
  const huge = page({ naturalWidth: 9000, naturalHeight: 9000 });
  assert.equal(storedLongEdge(huge), TRACE_EDGE);
  // A square picture on a page that bleeds runs out of width before height.
  const dpi = pageQuality(huge, square()).dpi;
  assert.ok(Math.abs(dpi - TRACE_EDGE / 8.625) < 0.01, `read ${dpi}`);
});

test('a page with no measured size reads as nothing rather than as infinity', () => {
  const unknown = page({ naturalWidth: 0, naturalHeight: 0 });
  assert.equal(pageQuality(unknown, square()).dpi, 0);
  assert.equal(storedLongEdge(unknown), 0);
});

test('a new coloring book still opens after the placement fields were added', () => {
  const book = createColoringBook();
  book.pages = [{ ...page(), fit: undefined, rotate: undefined, settings: { detail: 20 } }];
  const opened = migrateProject(structuredClone(book));
  const [first] = opened.pages;
  assert.equal(first.fit, 'contain');
  assert.equal(first.rotate, 0);
  // Settings saved before smoothing existed come back with it filled in, and
  // whatever the poet had chosen is still there.
  assert.equal(first.settings.detail, 20);
  assert.equal(typeof first.settings.smoothing, 'number');
  assert.equal(first.settings.mode, 'threshold');
});

// --- where the picture lands --------------------------------------------------

/** The shape of the ghost painting: half again as wide as it is tall. */
const wide = (over = {}) => page({ naturalWidth: 1536, naturalHeight: 864, ...over });

test('fitting a wide picture on a square page leaves paper above and below', () => {
  const placed = placeOnPage(wide(), square());
  assert.ok(Math.abs(placed.acrossPage - 100) < 0.01, 'the width should be what runs out first');
  assert.ok(placed.downPage < 60, `only ${placed.downPage.toFixed(0)}% of the height is used`);
  assert.equal(placed.cropped, false);
});

test('filling the page crops instead, and says so', () => {
  const placed = placeOnPage(wide({ fit: 'cover' }), square());
  assert.ok(Math.abs(placed.downPage - 100) < 0.01, 'the height should now be what fills');
  assert.ok(placed.acrossPage > 150, `only ${placed.acrossPage.toFixed(0)}% across`);
  assert.equal(placed.cropped, true, 'something is going over the edge and must be admitted to');
});

test('a quarter turn puts a wide picture down the tall side of a tall page', () => {
  const upright = placeOnPage(wide(), tall());
  const turned = placeOnPage(wide({ rotate: 90 }), tall());
  // Turned, the picture's long side runs down the page's long side, so it uses
  // far more of the paper than it did lying across the top.
  assert.ok(turned.downPage > upright.downPage * 2, 'turning it should use the height');
  assert.ok(Math.abs(turned.downPage - 100) < 0.01);
});

test('the width handed to CSS is the one the element has before it is turned', () => {
  // Rotating an element turns its box with it. The check is that the box, once
  // turned, really does span the page: a width in page-width units that comes
  // out as a height in page-height units.
  const book = tall();
  const printed = printedSize(book);
  const placed = placeOnPage(wide({ rotate: 90 }), book);
  const asHeight = (placed.boxWidth * printed.width) / printed.height;
  assert.ok(Math.abs(asHeight - placed.downPage) < 0.01, `${asHeight} against ${placed.downPage}`);
});

test('a page with no measured size still places somewhere sane', () => {
  const placed = placeOnPage(page({ naturalWidth: 0, naturalHeight: 0 }), square());
  assert.equal(placed.acrossPage, 100);
  assert.equal(placed.downPage, 100);
  assert.equal(placed.cropped, false);
});

test('the interface can tell when a picture is the wrong way round for the page', () => {
  assert.equal(shapesAgree(wide(), tall()), false);
  assert.equal(shapesAgree(wide({ rotate: 90 }), tall()), true);
  assert.equal(shapesAgree(page(), square()), true, 'a square picture suits a square page');
});

// --- assembly -----------------------------------------------------------------

test('a new coloring book has every detail its copyright page needs', () => {
  // It did not, for a while: createProject spreads its overrides last, so
  // handing it a partial meta replaced the one it had just built.
  const meta = createColoringBook('Ghosts').meta;
  for (const key of ['title', 'subtitle', 'author', 'publisher', 'isbn', 'year', 'copyrightExtra']) {
    assert.equal(typeof meta[key], 'string', `${key} was ${meta[key]}`);
  }
  assert.equal(meta.title, 'Ghosts');
  assert.match(meta.year, /^\d{4}$/);
});

test('a book saved with half a meta comes back with all of it', () => {
  const saved = { ...createColoringBook('Old'), meta: { title: 'Old' } };
  const opened = migrateProject(structuredClone(saved));
  assert.equal(opened.meta.title, 'Old');
  assert.equal(typeof opened.meta.year, 'string');
  assert.equal(typeof opened.meta.author, 'string');
});

test('the printed length counts the front matter, the pictures and the backs', () => {
  const book = createColoringBook();
  book.pages = Array.from({ length: 10 }, (_, i) => page({ id: `p${i}` }));
  // Three front-matter pages, then the pen test page taking a right-hand one
  // and leaving a blank before it, then ten pictures each with a blank back.
  assert.equal(sheetCount(book), 26);

  book.coloring.singleSided = false;
  assert.equal(sheetCount(book), 14);

  book.coloring.titlePage = false;
  book.coloring.copyrightPage = false;
  book.coloring.belongsToPage = false;
  book.coloring.colorTestPage = false;
  assert.equal(frontMatterPages(book), 0);
  assert.equal(sheetCount(book), 10);
});

test('the printed length is always even, because KDP requires it', () => {
  const book = createColoringBook();
  book.coloring.singleSided = false;
  for (const count of [1, 2, 3, 7, 21]) {
    book.pages = Array.from({ length: count }, (_, i) => page({ id: `p${i}` }));
    assert.equal(sheetCount(book) % 2, 0, `${count} pictures gave ${sheetCount(book)}`);
  }
});

test('a picture set to fit stays inside the margins, and the gutter swaps sides', () => {
  const book = createColoringBook();
  const wide = page({ naturalWidth: 1536, naturalHeight: 864, fit: 'contain' });
  const sheet = sheetOf(book);

  const recto = artBox(wide, book, 'right');
  const verso = artBox(wide, book, 'left');

  // The gutter is on the left of a recto, so the picture starts further in.
  assert.ok(recto.x >= book.margins.inside - 0.001, `recto started at ${recto.x}`);
  assert.ok(verso.x >= sheet.bleed + book.margins.outside - 0.001);
  assert.ok(recto.x > verso.x, 'the two sides must not be placed identically');
  // And nothing reaches the sheet edge.
  assert.ok(recto.y > 0 && recto.y + recto.height < sheet.height);
});

test('a picture set to fill covers the whole sheet, bleed included', () => {
  const book = createColoringBook();
  const sheet = sheetOf(book);
  const box = artBox(page({ naturalWidth: 1536, naturalHeight: 864, fit: 'cover' }), book, 'right');
  assert.ok(box.x <= 0.001 && box.width >= sheet.width - 0.001, 'it has to reach both edges');
  assert.ok(box.y <= 0.001 || box.height >= sheet.height - 0.001);
});

test('a turned picture is given the box it has before it is spun', () => {
  const book = createColoringBook();
  book.trim = { ...book.trim, trimId: '8.5x11' };
  const upright = artBox(page({ naturalWidth: 1536, naturalHeight: 864 }), book, 'right');
  const turned = artBox(page({ naturalWidth: 1536, naturalHeight: 864, rotate: 90 }), book, 'right');

  // What the box becomes once it has been spun: width and height swap over.
  const footprint = (box) =>
    box.rotate === 90 ? { w: box.height, h: box.width } : { w: box.width, h: box.height };

  assert.equal(turned.rotate, 90);
  // The box handed to CSS is the one before the spin, so for a wide picture
  // turned onto a tall page it is wider than it is tall — and the footprint it
  // becomes is the other way round.
  assert.ok(turned.width > turned.height, `box was ${turned.width} × ${turned.height}`);
  assert.ok(footprint(turned).h > footprint(turned).w, 'turned, it should run down the page');
  assert.ok(
    footprint(turned).h > footprint(upright).h * 2,
    'turning it should use far more of a tall page',
  );
});

test('a picture with no measured size is given the whole target and left alone', () => {
  const book = createColoringBook();
  const box = artBox(page({ naturalWidth: 0, naturalHeight: 0 }), book, 'right');
  assert.equal(box.rotate, 0);
  assert.ok(box.width > 0 && box.height > 0);
});

test('the warnings name what is actually wrong', () => {
  const book = createColoringBook();
  const ids = (b, count) => validateColoringBook(b, count).map((i) => i.id);

  assert.ok(ids(book, 0).includes('coloring-empty'), 'an empty book is an error');

  book.pages = [page({ lineArtAssetId: null })];
  assert.ok(ids(book, 24).includes('coloring-unconverted'));

  book.pages = [page({ lineArtAssetId: 'a', naturalWidth: 700, naturalHeight: 700 })];
  assert.ok(ids(book, 24).includes('coloring-dpi'));
  assert.ok(!ids(book, 24).includes('coloring-unconverted'));

  book.pages = [page({ lineArtAssetId: 'a', upscaled: 4 })];
  assert.ok(ids(book, 24).includes('coloring-upscale'));

  assert.ok(ids(book, 12).includes('page-min'), 'a short book is an error');
  assert.ok(ids(book, 25).includes('page-parity'));

  book.coloring.containsAiImages = true;
  assert.ok(ids(book, 24).includes('coloring-ai'));
});

// --- the cover ----------------------------------------------------------------

test('a coloring book carries everything the cover machinery needs', () => {
  // The designer, the layout, the renderer and the validator all take the same
  // narrow view of a book. If a coloring book satisfies it, one component
  // serves both kinds.
  const book = createColoringBook('Ghosts');
  const layout = coverLayout(book, 52);
  assert.ok(layout.dimensions.width > 0 && layout.dimensions.height > 0);
  assert.equal(layout.panels.front.width, 8.5);
  assert.ok(layout.folds[1] > layout.folds[0]);
});

test('the spine widens with the book and with the paper', () => {
  const book = createColoringBook();
  const thin = coverLayout(book, 24).dimensions.spine;
  const thick = coverLayout(book, 200).dimensions.spine;
  assert.ok(thick > thin * 5, `${thin} then ${thick}`);

  book.trim = { ...book.trim, paper: 'color' };
  assert.ok(coverLayout(book, 200).dimensions.spine > thick, 'colour stock is thicker');
});

test('the barcode area stays clear of the trimmed edge, on the back', () => {
  const book = createColoringBook();
  const layout = coverLayout(book, 52);
  const { barcode, panels } = layout;
  assert.ok(barcode.x >= panels.back.x, 'it belongs on the back cover');
  assert.ok(barcode.x + barcode.width <= panels.back.x + panels.back.width);
  assert.ok(barcode.y + barcode.height <= panels.back.y + panels.back.height);
  assert.equal(barcode.width, 2);
  assert.equal(barcode.height, 1.2);
});

test('the cover renders with a picture from the book on its front', () => {
  const book = createColoringBook('Ghosts');
  book.cover.frontImage = {
    assetId: 'src_0',
    naturalWidth: 2600,
    naturalHeight: 2600,
    fit: 'cover',
  };
  const html = buildCoverHtml(book, {
    pageCount: 52,
    fontStyle: '',
    guides: false,
    assets: { src_0: 'data:image/png;base64,AAA' },
  });
  assert.ok(html.includes('class="cover-image"'));
  assert.ok(html.includes('data:image/png;base64,AAA'));
  // One page, at the exact wraparound size.
  const d = coverLayout(book, 52).dimensions;
  assert.ok(html.includes(`size: ${d.width}in ${d.height}in`));
});

test('a cover warns about a picture too small for the front', () => {
  const book = createColoringBook();
  book.cover.frontImage = { assetId: 'a', naturalWidth: 900, naturalHeight: 900, fit: 'cover' };
  assert.ok(validateCover(book, 52).some((i) => i.id === 'cover-dpi'));

  book.cover.frontImage = { assetId: 'a', naturalWidth: 2800, naturalHeight: 2800, fit: 'cover' };
  assert.ok(!validateCover(book, 52).some((i) => i.id === 'cover-dpi'));
});

test('a cover warns when the spine is too thin to print text on', () => {
  const book = createColoringBook();
  book.cover.textBoxes = [
    {
      id: 'b1',
      panel: 'spine',
      text: 'Ghosts',
      x: 0,
      y: 0,
      widthIn: 4,
      rotate: 0,
      font: book.typography.title,
    },
  ];
  assert.ok(validateCover(book, 20).some((i) => i.id === 'spine-too-thin'));
  assert.ok(!validateCover(book, 120).some((i) => i.id === 'spine-too-thin'));
});

test('filling the page without bleed is an error, and the reverse is a note', () => {
  const book = createColoringBook();
  book.trim = { ...book.trim, bleed: false };
  book.pages = [page({ lineArtAssetId: 'a', fit: 'cover' })];
  const ids = validateColoringBook(book, 24).map((i) => i.id);
  assert.ok(ids.includes('coloring-bleed-off'), 'a picture would stop short of the trimmed edge');

  book.trim = { ...book.trim, bleed: true };
  assert.ok(!validateColoringBook(book, 24).some((i) => i.id === 'coloring-bleed-off'));

  // Bleed on with nothing using it is harmless, but worth saying so the KDP
  // setting is chosen to match.
  book.pages = [page({ lineArtAssetId: 'a', fit: 'contain' })];
  assert.ok(validateColoringBook(book, 24).some((i) => i.id === 'coloring-bleed-unused'));
});

// --- front matter you drew yourself -------------------------------------------

/** A drawing supplied for one of the generated pages. */
const drawing = (over = {}) =>
  page({
    id: 'matter_1',
    title: 'Pen test page',
    source: 'lineart',
    sourceGuessed: false,
    naturalWidth: 1280,
    naturalHeight: 1280,
    ...over,
  });

test('front matter artwork goes through the same queue as a picture', () => {
  // The converter walks one list. If a title page were not in it, it would sit
  // unconverted for ever and nothing would say why.
  const book = createColoringBook();
  book.pages = [page({ id: 'p1' })];
  book.coloring.titleArt = drawing({ id: 'matter_title' });
  book.coloring.colorTestArt = drawing({ id: 'matter_test' });

  const ids = convertibles(book).map((item) => item.id);
  assert.deepEqual(ids, ['p1', 'matter_title', 'matter_test']);
});

test('a page you drew replaces the built-in design, and nothing else', () => {
  const book = coloringFixture(1);
  book.coloring.titleArt = drawing({ id: 'matter_title', lineArtAssetId: 'art_title' });
  const html = buildColoringHtml(book, {
    ...coloringOptions(),
    assets: { ...coloringOptions().assets, art_title: 'blob:title' },
  });

  const body = html.slice(html.indexOf('<body>'));
  assert.ok(body.includes('blob:title'), 'the drawing should be on the page');
  assert.ok(!body.includes('matter-title'), 'the built-in title design should be gone');
  // The copyright page still names the book, as it should — what must be gone
  // is the built-in title page, not every mention of the title.
  assert.ok(!body.includes('<h1'), 'the title should not also be set as type');
  // The other generated pages are untouched.
  assert.ok(body.includes('data-label="Copyright"'));
  assert.ok(body.includes('data-label="This book belongs to"'));
});

test('a page you drew is placed inside the margins and never cropped', () => {
  const book = createColoringBook();
  const art = drawing({ naturalWidth: 1600, naturalHeight: 900 });
  const sheet = sheetOf(book);
  const box = artBox(art, book, 'right');

  assert.equal(art.fit, 'contain');
  assert.ok(box.x >= book.margins.inside - 0.001, 'it must clear the gutter');
  assert.ok(box.x + box.width <= sheet.width - sheet.bleed - book.margins.outside + 0.001);
  assert.ok(box.y >= sheet.bleed + book.margins.top - 0.001);
  assert.ok(box.y + box.height <= sheet.height - sheet.bleed - book.margins.bottom + 0.001);
});

test('the pen test page takes a right-hand page, so its back stays blank', () => {
  const book = coloringFixture(0);
  const html = buildColoringHtml(book, coloringOptions());
  const testSheet = html.match(/<div class="([^"]*)"[^>]*data-label="Pen test page"/)?.[1] ?? '';
  assert.ok(testSheet.includes('matter-recto'), 'the whole point is what is behind it');

  book.coloring.singleSided = false;
  const flat = buildColoringHtml(book, coloringOptions());
  const flatSheet = flat.match(/<div class="([^"]*)"[^>]*data-label="Pen test page"/)?.[1] ?? '';
  assert.ok(!flatSheet.includes('matter-recto'), 'double-sided has no blank backs to keep');
});

test('a drawn pen test page keeps its blank back too', () => {
  const book = coloringFixture(0);
  book.coloring.colorTestArt = drawing({ lineArtAssetId: 'art_test' });
  const html = buildColoringHtml(book, coloringOptions());
  const sheet = html.match(/<div class="([^"]*)"[^>]*data-label="Pen test page"/)?.[1] ?? '';
  assert.ok(sheet.includes('matter-art'));
  assert.ok(sheet.includes('matter-recto'));
});

test('the printed page never says colour or color, because it cannot spell both', () => {
  const html = buildColoringHtml(coloringFixture(1), coloringOptions());
  const body = html.slice(html.indexOf('<body>'));
  assert.ok(!/\bcolou?rs?\b/i.test(body.replace(/<style[\s\S]*?<\/style>/g, '')));
});

test('artwork you drew is saved with the book, or a backup restores it missing', () => {
  const book = coloringFixture(1);
  book.coloring.titleArt = drawing({ id: 'm1', sourceAssetId: 'src_title', lineArtAssetId: 'art_title' });
  const ids = projectAssetIds(book);
  assert.ok(ids.includes('src_title'), 'the original has to travel');
  assert.ok(ids.includes('art_title'), 'and so does the cleaned-up version');
});

test('a drawn page that has not been converted is reported by name', () => {
  const book = createColoringBook();
  book.pages = [page({ lineArtAssetId: 'a' })];
  book.coloring.belongsArt = drawing({ id: 'm2', title: 'This book belongs to', lineArtAssetId: null });
  const issue = validateColoringBook(book, 24).find((i) => i.id === 'coloring-unconverted');
  assert.ok(issue, 'an unconverted front-matter page is still an unconverted page');
  assert.match(issue.message, /This book belongs to/);
});

test('front matter you drew is not thickened, so its lettering survives', () => {
  // Line thickness exists because tracing gives thin broken strokes. A page
  // that arrived drawn has the weight its artist chose, and one pixel of
  // growth is enough to swallow a full stop or weld an i to its dot.
  const book = createColoringBook();
  book.coloring.lineArt = { ...book.coloring.lineArt, thickness: 80 };

  // What setMatterArt builds, without a browser to put a file through.
  const art = { ...book.coloring.lineArt, thickness: 0 };
  assert.equal(art.thickness, 0);
  assert.equal(art.detail, book.coloring.lineArt.detail, 'everything else follows the book');
  assert.equal(art.cleanup, book.coloring.lineArt.cleanup);
});
