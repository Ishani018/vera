'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ACTIVE_PROJECT_KEY, getDb } from '@/lib/db';
import { createColoringBook, listProjects, type ProjectSummary } from '@/lib/projects';
import { StudioHeader } from './StudioHeader';
import { cx } from './ui';

/**
 * The way in.
 *
 * Two kinds of book, and everything already started. It is deliberately the
 * only screen that knows about both kinds — past this point each editor only
 * has to understand its own.
 */
export function Landing() {
  const router = useRouter();
  const [books, setBooks] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    void listProjects().then(setBooks);
  }, []);

  const open = (id: string, kind: ProjectSummary['kind']) => {
    window.localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    router.push(kind === 'coloring' ? '/coloring' : '/poetry');
  };

  const startColoringBook = async () => {
    const db = getDb();
    const book = createColoringBook();
    if (db) await db.projects.put(book);
    open(book.id, 'coloring');
  };

  return (
    <main className="flex h-dvh flex-col">
      <StudioHeader>
        <span className="text-ink-500">A small publishing studio</span>
      </StudioHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 py-14">
          <h1 className="text-[34px] font-semibold tracking-tight">What are you making?</h1>
          <p className="mt-2 text-[17px] text-ink-500">
            Both kinds come out as print-ready PDFs that meet KDP&rsquo;s specification.
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            <Card
              href="/poetry"
              title="Poetry Book"
              blurb="Typeset a collection: real verse layout, a contents page with true page numbers, borders and ornaments."
              art={<PoetryArt />}
            />
            <Card
              onClick={() => void startColoringBook()}
              title="Coloring Book"
              blurb="Turn your own paintings and photographs into clean line art, and bind them into a book."
              art={<ColoringArt />}
            />
          </div>

          <section className="mt-14">
            <h2 className="text-[20px] font-semibold tracking-tight">Your books</h2>
            {books === null ? (
              <p className="mt-3 text-[15px] text-ink-500">Looking…</p>
            ) : books.length === 0 ? (
              <p className="mt-3 text-[15px] text-ink-500">
                Nothing saved yet. Everything you make is kept on this computer, in this browser.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {books.map((book) => (
                  <li key={book.id}>
                    <button
                      type="button"
                      onClick={() => open(book.id, book.kind)}
                      className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-paper px-5 py-4 text-left transition-colors hover:border-ink-300 hover:bg-ink-50"
                    >
                      <span
                        aria-hidden
                        className={cx(
                          'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[19px]',
                          book.kind === 'coloring'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-sky-50 text-sky-800',
                        )}
                      >
                        {book.kind === 'coloring' ? '▤' : '¶'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[17px] font-[560]">{book.name}</span>
                        <span className="mt-0.5 block text-[14px] text-ink-500">
                          {book.kind === 'coloring' ? 'Coloring book' : 'Poetry'} ·{' '}
                          {book.items} {book.kind === 'coloring' ? 'picture' : 'poem'}
                          {book.items === 1 ? '' : 's'} · {when(book.updatedAt)}
                        </span>
                      </span>
                      <span aria-hidden className="text-ink-400">
                        →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Card({
  title,
  blurb,
  art,
  href,
  onClick,
}: {
  title: string;
  blurb: string;
  art: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="grid h-36 place-items-center rounded-xl bg-ink-100">{art}</span>
      <span className="mt-5 block text-[21px] font-semibold tracking-tight">{title}</span>
      <span className="mt-1.5 block text-[15px] leading-relaxed text-ink-500">{blurb}</span>
    </>
  );
  const className =
    'block rounded-3xl border border-ink-200 bg-paper p-6 text-left transition-colors hover:border-accent-500 hover:bg-accent-50/40';

  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cx(className, 'w-full')}>
      {inner}
    </button>
  );
}

/** A spread with verse on it, drawn rather than photographed. */
function PoetryArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-28" role="img" aria-label="An open book of verse">
      <rect x="6" y="6" width="53" height="68" fill="#fff" stroke="#d2ccc2" />
      <rect x="61" y="6" width="53" height="68" fill="#fff" stroke="#d2ccc2" />
      {[20, 28, 34, 42, 48].map((y, i) => (
        <rect key={y} x="14" y={y} width={[30, 22, 34, 18, 28][i]} height="2.4" fill="#b5ada1" />
      ))}
      {[20, 26, 34, 40].map((y, i) => (
        <rect key={y} x="69" y={y} width={[26, 34, 20, 30][i]} height="2.4" fill="#b5ada1" />
      ))}
    </svg>
  );
}

/** A painting becoming an outline. */
function ColoringArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-28" role="img" aria-label="A painting turned into line art">
      <rect x="8" y="12" width="46" height="56" fill="#cfc6b4" stroke="#b5ada1" />
      <circle cx="31" cy="34" r="12" fill="#a8927a" />
      <path d="M12 64 L26 44 L38 58 L50 40 L50 64 Z" fill="#8a7d66" />
      <rect x="66" y="12" width="46" height="56" fill="#fff" stroke="#1b1815" strokeWidth="1.4" />
      <circle cx="89" cy="34" r="12" fill="none" stroke="#1b1815" strokeWidth="1.8" />
      <path
        d="M70 64 L84 44 L96 58 L108 40 L108 64"
        fill="none"
        stroke="#1b1815"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function when(at: number): string {
  const days = Math.floor((Date.now() - at) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}
