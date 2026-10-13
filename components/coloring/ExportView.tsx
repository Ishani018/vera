'use client';

import { useState } from 'react';
import { useColoring } from '@/lib/coloring/store';
import { validateColoringBook } from '@/lib/coloring/validate';
import {
  exportCoverPdf,
  exportInteriorPdf,
  exportProjectJson,
  printCover,
  printInterior,
} from '@/lib/exportClient';
import { padToEven } from '@/lib/kdp';
import { PRINT_COST, ROYALTY_TIERS, estimateRoyalty, money, printCostKnown } from '@/lib/royalty';
import { validateCover } from '@/lib/validate';
import { Button, Field, Notice, NumberInput, cx } from '../ui';
import { CARD, cardStyle } from '../studio/Shell';

type Status = { level: 'ok' | 'error' | 'info'; text: string } | null;

/**
 * The last screen: two PDFs, and what the book is likely to earn.
 *
 * The royalty figure is here rather than beside the price field it would
 * normally live next to, because the page count is what drives it and the page
 * count is only settled once the book is. It is an estimate; the numbers
 * behind it are Amazon's and carry the date they were read.
 */
export function ExportView({
  pageCount,
  onLaunchKit,
}: {
  pageCount: number;
  /** Opens the launch-day posts. Optional so the view can stand on its own. */
  onLaunchKit?: () => void;
}) {
  const book = useColoring((s) => s.book);
  const [price, setPrice] = useState(12.99);
  const [busy, setBusy] = useState<'interior' | 'cover' | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [printFallback, setPrintFallback] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!book) return null;

  const finalPages = padToEven(pageCount || 0);
  const padded = finalPages - pageCount;
  const issues = [
    ...validateColoringBook(book, pageCount),
    ...validateCover(book, pageCount),
  ];
  const blocking = issues.filter((issue) => issue.level === 'error');
  const estimate = estimateRoyalty(price, finalPages);
  // Colour printing is charged on a different scale entirely, so the estimate
  // is withheld rather than given wrongly.
  const estimable = printCostKnown(book.trim.paper);

  // The disclosure is a reminder, not a gate — but it is the last moment it
  // can usefully be given, so it has to be taken in before the PDFs appear.
  const mustAcknowledge = book.coloring.containsAiImages && !acknowledged;

  const run = async (which: 'interior' | 'cover') => {
    setBusy(which);
    setStatus(null);
    try {
      const outcome =
        which === 'interior'
          ? await exportInteriorPdf(book)
          : await exportCoverPdf(book, finalPages);
      if (outcome.needsPrintFallback) setPrintFallback(true);
      setStatus({ level: outcome.ok ? 'ok' : 'error', text: outcome.message });
    } catch (error) {
      setStatus({ level: 'error', text: error instanceof Error ? error.message : 'Export failed.' });
    } finally {
      setBusy(null);
    }
  };

  const print = async (which: 'interior' | 'cover') => {
    try {
      if (which === 'interior') printInterior(book, padded);
      else await printCover(book, finalPages);
      setStatus({
        level: 'info',
        text: 'Opened a print window. Choose “Save as PDF”, set margins to None and turn on background graphics.',
      });
    } catch (error) {
      setStatus({
        level: 'error',
        text: error instanceof Error ? error.message : 'Could not open the print window.',
      });
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-7 px-8 py-8">
      {book.coloring.containsAiImages && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4">
          <h3 className="text-[17px] font-semibold text-amber-900">
            This book is marked as containing AI-generated images
          </h3>
          <p className="mt-2 text-[14.5px] leading-relaxed text-amber-900/90">
            KDP asks to be told when any part of a book was generated rather than made by hand.
            The question comes during publishing, after the files are uploaded; check their
            current guidelines for the wording. Pages traced from your own paintings are not
            AI-generated, so if this book mixes the two, splitting it into two books means only
            one carries the disclosure.
          </p>
          <label className="mt-3 flex items-center gap-2.5 text-[14.5px] font-[550] text-amber-900">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="h-4 w-4 accent-amber-700"
            />
            I have read this and will disclose it at publication.
          </label>
        </section>
      )}

      <section>
        <h3 className="text-[19px] font-semibold tracking-tight">The two files KDP wants</h3>
        <p className="mt-1 text-[15px] text-ink-500">
          An interior and a wraparound cover, both at the exact trim size, both made by the same
          renderer that drew the preview.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Card
            title="Interior"
            detail={`${finalPages} pages${padded ? ` · ${padded} blank appended for parity` : ''}`}
            action={
              <Button onClick={() => void run('interior')} disabled={busy !== null || mustAcknowledge}>
                {busy === 'interior' ? 'Rendering…' : 'Download interior PDF'}
              </Button>
            }
            fallback={printFallback ? () => void print('interior') : null}
          />
          <Card
            title="Cover"
            detail={`Spine sized for ${finalPages} pages on ${book.trim.paper} paper`}
            action={
              <Button onClick={() => void run('cover')} disabled={busy !== null || mustAcknowledge}>
                {busy === 'cover' ? 'Rendering…' : 'Download cover PDF'}
              </Button>
            }
            fallback={printFallback ? () => void print('cover') : null}
          />
        </div>

        {mustAcknowledge && (
          <p className="mt-3 text-[14px]" style={{ color: 'var(--color-ink-900)' }}>
            Tick the box above first — it is the last moment that reminder is any use.
          </p>
        )}
        {status && (
          <div className="mt-3">
            <Notice level={status.level}>{status.text}</Notice>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[19px] font-semibold tracking-tight">What it earns</h3>
        <p className="mt-1 text-[15px] text-ink-500">
          An estimate, from Amazon&rsquo;s own figures, read on {PRINT_COST.updated}.
        </p>

        {!estimable ? (
          <div className="mt-4">
            <Notice level="warning">
              <strong className="font-[570]">
                This book is set to print on colour paper, and these figures are for black ink.
              </strong>
              <span className="mt-0.5 block opacity-80">
                Colour costs several times as much and is charged by the page rather than at a flat
                rate, so no estimate is shown. Use KDP&rsquo;s own printing-cost calculator — or, if
                the pages are line art, switch to black &amp; white under Paper in Pages, which is what a
                coloring book prints as.
              </span>
            </Notice>
          </div>
        ) : (
        <>
        <div className="mt-4 flex items-end gap-4">
          <Field label="List price">
            <NumberInput value={price} onChange={setPrice} step={0.5} min={0} suffix="USD" />
          </Field>
          <div className="pb-1 text-[14.5px] text-ink-500">
            {Math.round(estimate.rate * 100)}% royalty
            {estimate.rate === ROYALTY_TIERS.lowRate
              ? ` — the higher rate starts at $${ROYALTY_TIERS.highRateFrom.toFixed(2)}`
              : ''}
          </div>
        </div>

        <dl className="mt-4 divide-y divide-ink-200 text-[15px]">
          <Line label="List price" value={money(estimate.listPrice)} />
          <Line
            label={`Amazon keeps (${Math.round((1 - estimate.rate) * 100)}%)`}
            value={`− ${money(estimate.listPrice * (1 - estimate.rate))}`}
          />
          <Line
            label={`Printing, ${finalPages} pages`}
            value={`− ${money(estimate.printing)}`}
          />
          <Line label="You keep, per copy" value={money(estimate.royalty)} strong />
        </dl>

        {estimate.royalty < 0 && (
          <div className="mt-3">
            <Notice level="error">
              At {money(estimate.listPrice)} this book loses {money(-estimate.royalty)} on every
              copy — printing costs more than the royalty. KDP will not accept a price below about{' '}
              {money(estimate.breakEvenPrice)}.
            </Notice>
          </div>
        )}
        {estimate.atHigherRate !== null && estimate.atHigherRate > estimate.royalty && (
          <div className="mt-3">
            <Notice level="info">
              At ${ROYALTY_TIERS.highRateFrom.toFixed(2)} the royalty rate steps up to{' '}
              {Math.round(ROYALTY_TIERS.highRate * 100)}%, and you would keep{' '}
              {money(estimate.atHigherRate)} a copy instead of {money(estimate.royalty)}.
            </Notice>
          </div>
        )}

        </>
        )}

        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-500">
          {PRINT_COST.marketplace}. Other marketplaces print at other prices, and Amazon changes
          these figures. Check the printing-cost calculator in KDP before you set a price — these
          three numbers live in <code className="text-[13px]">lib/royalty.ts</code> and are the
          only thing to edit when they go stale.
        </p>
      </section>

      <section>
        <h3 className="text-[19px] font-semibold tracking-tight">Before you upload</h3>
        <div className="mt-3 flex flex-col gap-2.5">
          {issues.length === 0 ? (
            <Notice level="ok">Nothing to flag. The book meets KDP&rsquo;s specification.</Notice>
          ) : (
            issues.map((issue) => (
              <Notice key={issue.id} level={issue.level}>
                <strong className="font-[570]">{issue.message}</strong>
                {issue.fix && <span className="mt-0.5 block opacity-80">{issue.fix}</span>}
              </Notice>
            ))
          )}
        </div>
        {blocking.length > 0 && (
          <p className="mt-3 text-[14px] text-ink-500">
            The PDFs will still render — nothing here stops you looking at them. KDP is what will
            refuse them.
          </p>
        )}
      </section>

      {onLaunchKit && (
        <section className="border-t border-ink-200 pt-5">
          <h3 className="text-[17px] font-semibold">Posts for launch day</h3>
          <p className="mt-1 text-[14.5px] text-ink-500">
            Instagram and Pinterest posts built from the book&rsquo;s own pages.
          </p>
          <div className="mt-3">
            <Button onClick={onLaunchKit}>Make posts →</Button>
          </div>
        </section>
      )}

      <section className="border-t border-ink-200 pt-5">
        <h3 className="text-[17px] font-semibold">Keep a copy</h3>
        <p className="mt-1 text-[14.5px] text-ink-500">
          Everything lives in this browser and nowhere else. A backup is one file, pictures
          included.
        </p>
        <div className="mt-3">
          <Button onClick={() => void exportProjectJson(book)}>Save a backup file</Button>
        </div>
      </section>
    </div>
  );
}

function Card({
  title,
  detail,
  action,
  fallback,
}: {
  title: string;
  detail: string;
  action: React.ReactNode;
  fallback: (() => void) | null;
}) {
  return (
    <div className={CARD} style={{ ...cardStyle, padding: '16px 20px' }}>
      <h4 className="text-[16px] font-[570]">{title}</h4>
      <p className="mt-0.5 text-[14px] text-ink-500">{detail}</p>
      <div className="mt-3">{action}</div>
      {fallback && (
        <button
          type="button"
          onClick={fallback}
          className="mt-2 text-[13.5px] text-accent-500 underline"
        >
          No renderer on the server — print it from this browser instead
        </button>
      )}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 py-2', strong && 'pt-3')}>
      <dt className={strong ? 'font-[570]' : 'text-ink-500'}>{label}</dt>
      <dd className={cx('tabular-nums', strong && 'text-[17px] font-semibold')}>{value}</dd>
    </div>
  );
}
