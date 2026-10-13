'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/lib/auth/useUser';

/**
 * Who you are, and a way out; or a way in.
 *
 * Renders nothing at all where sign-in is not set up, so running the app on your
 * own computer looks exactly as it always did. Books are never part of this:
 * they stay in the browser whether or not anybody is signed in. All signing in
 * does is say who is using the app.
 */
export function UserMenu({ className }: { className?: string }) {
  const { ready, configured, user, signOut } = useUser();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!ready || !configured) return null;
  // The sign-in screen already has a button the size of a hand; a second in its bar is noise.
  if (!user && typeof window !== 'undefined' && window.location.pathname === '/signin') return null;

  if (!user) {
    return (
      <a
        href={`/api/auth/google?returnTo=${encodeURIComponent(
          typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search,
        )}`}
        className={`btn btn-default shrink-0 rounded-[6px] px-4 py-2.5 text-[14px] ${className ?? ''}`}
      >
        Sign in
      </a>
    );
  }

  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  return (
    <div ref={box} className={`relative shrink-0 ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Signed in as ${user.name}`}
        title={user.name}
        className="grid size-10 place-items-center overflow-hidden rounded-full border text-[15px] font-[600]"
        style={{ background: 'var(--studio-card)', borderColor: 'var(--studio-line)', color: 'var(--color-ink-900)' }}
      >
        {user.picture ? (
          // Google's own picture URL. No referrer sent, so it is not told which page.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border p-3 shadow-xl"
          style={{ background: 'var(--studio-card)', borderColor: 'var(--studio-line)', color: 'var(--color-ink-900)' }}
        >
          <p className="truncate text-[15px] font-[600]">{user.name}</p>
          <p className="truncate text-[13px]" style={{ color: 'var(--color-ink-500)' }}>
            {user.email}
          </p>
          <p className="mt-2 text-[12.5px] leading-snug" style={{ color: 'var(--color-ink-500)' }}>
            Your books stay in this browser. Signing in only says who is using the app.
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="btn btn-default mt-3 w-full rounded-[6px] px-4 py-2 text-[14px]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
