import {
  MIN_COVER_DPI,
  checkMargins,
  checkPageCount,
  effectiveDpi,
  getTrim,
  padToEven,
  type ValidationIssue,
} from './kdp';
import { illustrationsOf, poemsOf } from './contents';
import { collidesWithBarcode, coverLayout, spineTooThinForText } from './render/coverLayout';
import { countLines } from './render/text';
import type { Project } from './types';

export type { ValidationIssue };

/**
 * Everything worth telling someone before they upload to KDP, gathered in one
 * place so the export panel and the trim panel cannot disagree.
 *
 * Errors are things KDP will reject. Warnings are things it will accept but a
 * printed book will suffer for. Nothing here blocks an export — a draft PDF of
 * a half-finished manuscript is a legitimate thing to want.
 */
export function validateProject(project: Project, pageCount: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (pageCount > 0) {
    issues.push(...checkPageCount(pageCount));
    issues.push(
      ...checkMargins({
        margins: project.margins,
        pageCount: padToEven(pageCount),
        bleed: project.trim.bleed,
      }),
    );
  }

  const poems = poemsOf(project);

  if (!poems.length) {
    issues.push({
      id: 'no-poems',
      level: 'error',
      message: 'The collection has no poems.',
      fix: 'Add or import poems from the left-hand panel.',
    });
  }

  const untitled = poems.filter((p) => !p.title.trim());
  if (untitled.length) {
    issues.push({
      id: 'untitled-poems',
      level: 'warning',
      message: `${untitled.length} poem${untitled.length === 1 ? ' has' : 's have'} no title.`,
      fix: 'Untitled poems still typeset, but they cannot appear in the contents.',
    });
  }

  const empty = poems.filter((p) => countLines(p.body) === 0);
  if (empty.length) {
    issues.push({
      id: 'empty-poems',
      level: 'warning',
      message: `${empty.length} poem${empty.length === 1 ? ' has' : 's have'} no lines.`,
      fix: 'An empty poem still takes a page. Delete it or add its text.',
    });
  }

  const plates = illustrationsOf(project);
  const emptyPlates = plates.filter((plate) => !plate.assetId);
  if (emptyPlates.length) {
    issues.push({
      id: 'empty-plates',
      level: 'error',
      message: `${emptyPlates.length} illustration page${emptyPlates.length === 1 ? ' has' : 's have'} no picture.`,
      fix: 'Choose a picture, or delete the page. It prints blank otherwise.',
    });
  }

  // A plate inside the margins prints narrower than one that bleeds, so the
  // resolution that matters is the one at the size this plate will actually be.
  const trim = getTrim(project.trim.trimId);
  const soft = plates.filter((plate) => {
    if (!plate.assetId || !plate.naturalWidth) return false;
    const printedWidth =
      plate.fit === 'bleed'
        ? trim.width
        : trim.width - project.margins.inside - project.margins.outside;
    return effectiveDpi(plate.naturalWidth, printedWidth) < MIN_COVER_DPI;
  });
  if (soft.length) {
    issues.push({
      id: 'low-dpi-plates',
      level: 'warning',
      message: `${soft.length} illustration${soft.length === 1 ? '' : 's'} print${soft.length === 1 ? 's' : ''} under ${MIN_COVER_DPI} DPI.`,
      fix: 'KDP accepts them; they will look soft. A larger original is the only fix.',
    });
  }

  const bleedingWithoutBleed = plates.filter((plate) => plate.fit === 'bleed');
  if (bleedingWithoutBleed.length && !project.trim.bleed) {
    issues.push({
      id: 'plate-bleed-off',
      level: 'warning',
      message: `${bleedingWithoutBleed.length} illustration${bleedingWithoutBleed.length === 1 ? ' runs' : 's run'} off the trimmed edge, but the book is set up without bleed.`,
      fix: 'Turn bleed on under Trim & margins, or set those plates inside the margins.',
    });
  }

  const titlePage = project.frontMatter.find((p) => p.kind === 'title');
  if (!titlePage?.enabled) {
    issues.push({
      id: 'no-title-page',
      level: 'warning',
      message: 'There is no title page.',
      fix: 'Enable it under Front Matter. Every printed book has one.',
    });
  }
  const copyright = project.frontMatter.find((p) => p.kind === 'copyright');
  if (!copyright?.enabled) {
    issues.push({
      id: 'no-copyright',
      level: 'warning',
      message: 'There is no copyright page.',
      fix: 'Enable it under Front Matter.',
    });
  }

  if (!project.meta.title.trim()) {
    issues.push({
      id: 'no-title',
      level: 'error',
      message: 'The book has no title.',
      fix: 'Set it under Book Details.',
    });
  }

  issues.push(...validateCover(project, pageCount));
  return issues;
}

export function validateCover(project: Project, pageCount: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const trim = getTrim(project.trim.trimId);
  const image = project.cover.frontImage;

  if (!image) {
    issues.push({
      id: 'cover-no-image',
      level: 'info',
      message: 'The cover has no image — it will print as a flat colour.',
      fix: 'Upload a front cover image in the Cover tab.',
    });
  } else {
    const widthIn = project.cover.imageSpansWrap
      ? coverLayout(project, padToEven(pageCount || 24)).dimensions.width
      : trim.width;
    const dpi = Math.min(
      effectiveDpi(image.naturalWidth, widthIn),
      effectiveDpi(image.naturalHeight, trim.height),
    );
    if (dpi < MIN_COVER_DPI) {
      issues.push({
        id: 'cover-dpi',
        level: 'warning',
        message: `The cover image is about ${Math.round(dpi)} DPI at its printed size. KDP asks for ${MIN_COVER_DPI}.`,
        fix: `Supply an image at least ${Math.ceil(widthIn * MIN_COVER_DPI)}px wide.`,
      });
    }
  }

  if (pageCount > 0) {
    const layout = coverLayout(project, padToEven(pageCount));
    const hasSpineText = project.cover.textBoxes.some((b) => b.panel === 'spine' && b.text.trim());
    if (hasSpineText && spineTooThinForText(layout)) {
      issues.push({
        id: 'spine-too-thin',
        level: 'warning',
        message: `The spine is ${layout.dimensions.spine.toFixed(3)}" wide — too thin for KDP to print spine text.`,
        fix: 'KDP requires at least 0.0625" (roughly 25 pages). Remove the spine text or lengthen the book.',
      });
    }
    for (const box of project.cover.textBoxes) {
      // A generous height estimate: better to warn about a near miss than to
      // let text land under the barcode sticker.
      const estimated = (box.font.sizePt * box.font.lineHeight * 2) / 72;
      if (collidesWithBarcode(box, layout, estimated)) {
        issues.push({
          id: `barcode-collision-${box.id}`,
          level: 'warning',
          message: `Back cover text "${box.text.slice(0, 24) || 'untitled box'}" overlaps the barcode area.`,
          fix: 'KDP prints a 2" × 1.2" barcode there. Move the box up or left.',
        });
      }
    }
  }

  return issues;
}

export const countByLevel = (issues: ValidationIssue[]) => ({
  error: issues.filter((i) => i.level === 'error').length,
  warning: issues.filter((i) => i.level === 'warning').length,
  info: issues.filter((i) => i.level === 'info').length,
});
