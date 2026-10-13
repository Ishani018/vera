'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type MouseEvent } from 'react';

/** Mail icon for email input field */
function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

/** Lock icon for password input field */
function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function AuthCard({
  ready,
  googleHref,
  errorMessage,
  returnTo,
  onGuestContinue,
  onSuccess,
}: {
  ready: boolean;
  googleHref: string;
  errorMessage: string | null;
  returnTo: string;
  onGuestContinue?: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;

    // Sign in is optional. Work stays local in IndexedDB.
    try {
      if (typeof window !== 'undefined') {
        const displayName = name.trim() || email.split('@')[0];
        window.sessionStorage.setItem('studio_entered', 'true');
        window.localStorage.removeItem('studio_guest');
        window.localStorage.setItem('studio_user_email', email);
        window.localStorage.setItem('studio_user_name', displayName);
      }
    } catch {
      // Storage restricted, proceed anyway
    }

    setStatusNotice(tab === 'signup' ? 'Account created! Entering the studio...' : 'Welcome back! Entering the studio...');
    setTimeout(() => {
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(returnTo);
      }
    }, 450);
  };

  const handleGuest = (e: MouseEvent) => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('studio_entered', 'true');
        window.localStorage.removeItem('studio_guest');
      }
    } catch {}
    if (onGuestContinue) {
      e.preventDefault();
      onGuestContinue();
    }
  };

  return (
    <div
      className="w-full max-w-[440px] rounded-2xl border p-7 text-center sm:p-9 shadow-sm"
      style={{
        background: 'var(--studio-card)',
        borderColor: 'var(--studio-line)',
        boxShadow: 'var(--studio-shadow-card)',
      }}
    >
      {/* Peeking Kitten Sticker on top of heading */}
      <div className="flex justify-center -mt-2 mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/starter/pleading-kitten.png"
          alt="Peeking kitten"
          className="h-28 w-auto max-w-[220px] object-contain select-none pointer-events-none drop-shadow-sm"
        />
      </div>

      {/* Heading */}
      <h1
        className="display text-[32px] sm:text-[34px] tracking-tight"
        style={{ color: 'var(--color-ink-900)' }}
      >
        {tab === 'signin' ? 'Welcome back' : 'Create account'}
      </h1>

      <p className="mt-1.5 text-[14.5px] leading-relaxed" style={{ color: 'var(--color-ink-500)' }}>
        {tab === 'signin'
          ? 'Sign in to continue your work, or skip to use the studio offline.'
          : 'Create an account to keep your identity across sessions.'}
      </p>

      {/* Tabs */}
      <div
        className="mt-6 flex rounded-xl border p-1"
        style={{ borderColor: 'var(--studio-line)', background: 'var(--studio-page)' }}
      >
        <button
          type="button"
          onClick={() => {
            setTab('signin');
            setStatusNotice(null);
          }}
          className="flex-1 rounded-lg py-2 text-[14px] font-[550] transition-colors"
          style={
            tab === 'signin'
              ? { background: 'var(--studio-card)', color: 'var(--color-ink-900)' }
              : { color: 'var(--color-ink-500)' }
          }
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('signup');
            setStatusNotice(null);
          }}
          className="flex-1 rounded-lg py-2 text-[14px] font-[550] transition-colors"
          style={
            tab === 'signup'
              ? { background: 'var(--studio-card)', color: 'var(--color-ink-900)' }
              : { color: 'var(--color-ink-500)' }
          }
        >
          Sign up
        </button>
      </div>

      {/* Error alert from server */}
      {errorMessage && (
        <p
          role="alert"
          className="mt-5 rounded-xl border px-4 py-3 text-left text-[14px]"
          style={{ borderColor: 'var(--studio-line)', color: 'var(--color-ink-900)' }}
        >
          {errorMessage}
        </p>
      )}

      {/* Status notice */}
      {statusNotice && (
        <p
          role="status"
          className="mt-5 rounded-xl border px-4 py-3 text-left text-[14px]"
          style={{
            borderColor: 'var(--studio-line)',
            background: 'var(--studio-page)',
            color: 'var(--color-ink-900)',
          }}
        >
          {statusNotice}
        </p>
      )}

      {/* Google Sign-in */}
      <div className="mt-5">
        {ready ? (
          <a
            href={googleHref}
            className="btn btn-default inline-flex w-full items-center justify-center gap-3 rounded-[10px] border px-4 py-3 text-[15px] font-medium transition-all"
            style={{
              borderColor: 'var(--studio-line)',
              background: 'var(--studio-card)',
              color: 'var(--color-ink-900)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/google-g.svg" alt="" className="size-5 shrink-0" />
            <span>Continue with Google</span>
          </a>
        ) : (
          <div
            className="rounded-xl border p-3.5 text-left text-[13px] leading-relaxed"
            style={{
              borderColor: 'var(--studio-line)',
              background: 'var(--studio-page)',
              color: 'var(--color-ink-500)',
            }}
          >
            <div className="flex items-center gap-2 font-medium" style={{ color: 'var(--color-ink-900)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/google-g.svg" alt="" className="size-4 shrink-0" />
              <span>Google OAuth</span>
            </div>
            <p className="mt-1">
              Google OAuth is not configured on this server. You can freely continue below with local sign-in or guest access.
            </p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="relative my-5 flex items-center justify-center">
        <div className="w-full border-t" style={{ borderColor: 'var(--studio-line)' }} />
        <span
          className="absolute px-3 text-[12px] uppercase tracking-wider"
          style={{
            background: 'var(--studio-card)',
            color: 'var(--color-ink-500)',
          }}
        >
          or
        </span>
      </div>

      {/* Email / Password Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5 text-left">
        {tab === 'signup' && (
          <div>
            <label className="block text-[13px] font-medium" style={{ color: 'var(--color-ink-700)' }}>
              Your name
            </label>
            <input
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field mt-1.5 w-full rounded-[8px] px-3.5 py-2.5 text-[15px]"
              style={{
                color: 'var(--color-ink-900)',
                background: 'var(--studio-page)',
                borderColor: 'var(--studio-line)',
              }}
            />
          </div>
        )}

        <div>
          <label className="block text-[13px] font-medium" style={{ color: 'var(--color-ink-700)' }}>
            Email address
          </label>
          <div className="relative mt-1.5">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="ada@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field w-full rounded-[8px] pl-3.5 pr-10 py-2.5 text-[15px]"
              style={{
                color: 'var(--color-ink-900)',
                background: 'var(--studio-page)',
                borderColor: 'var(--studio-line)',
              }}
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 opacity-40">
              <MailIcon />
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-[13px] font-medium" style={{ color: 'var(--color-ink-700)' }}>
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="text-[12px] hover:underline"
              style={{ color: 'var(--color-ink-500)' }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="relative mt-1.5">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field w-full rounded-[8px] pl-3.5 pr-10 py-2.5 text-[15px]"
              style={{
                color: 'var(--color-ink-900)',
                background: 'var(--studio-page)',
                borderColor: 'var(--studio-line)',
              }}
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 opacity-40">
              <LockIcon />
            </span>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary mt-2 inline-flex w-full justify-center rounded-[8px] px-5 py-3 text-[15.5px] font-medium"
        >
          {tab === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      {/* Guest / Skip Option */}
      <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--studio-line)' }}>
        <p className="text-[13px]" style={{ color: 'var(--color-ink-500)' }}>
          Don&apos;t want an account right now?
        </p>
        <Link
          href={returnTo}
          onClick={handleGuest}
          className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-medium transition-colors hover:underline"
          style={{ color: 'var(--color-accenta-500)' }}
        >
          <span>Continue as guest &rarr;</span>
        </Link>
      </div>

      {/* Local storage note */}
      <p className="mt-5 text-[12px] leading-relaxed" style={{ color: 'var(--color-ink-500)' }}>
        Your books, designs, and settings remain saved locally in your browser and are never uploaded without your action.
      </p>
    </div>
  );
}
