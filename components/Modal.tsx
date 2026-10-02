'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './ui';

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 'max-w-2xl',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Held in a ref so the effect below can run once, on mount, and never again.
   *
   * Callers pass an inline arrow for onClose, which is a new function on every
   * render. With onClose in the dependency array this effect re-ran after every
   * keystroke and pulled focus back to the dialog, so only the first character
   * anyone typed into a field ever landed.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    // Move focus in so Escape and Tab behave, and the page behind stays put.
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="veil fixed inset-0 z-50 flex items-center justify-center bg-ink-900/25 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'dialog flex max-h-full w-full flex-col overflow-hidden outline-none',
          width,
        )}
      >
        <header className="flex items-center gap-3 border-b border-ink-200 px-4 py-3">
          <h2 className="display flex-1 text-[15px] text-ink-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="rounded px-2 py-1 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-ink-200 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
