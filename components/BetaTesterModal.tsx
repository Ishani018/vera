'use client';

import { useEffect, useState } from 'react';
import { Spinner } from './ui';
import { getUsageStatus, markBetaSubmitted, snoozeGate, DEFAULT_USAGE_THRESHOLD } from '@/lib/usageGate';
import { useUser } from '@/lib/auth/useUser';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const POPULAR_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me',
  'live.com',
  'aol.com',
];

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'trashmail.com',
  'yopmail.com',
  'dispostable.com',
]);

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function checkDomainTypo(domain: string): string | null {
  for (const pop of POPULAR_DOMAINS) {
    if (domain === pop) return null;
    if (levenshtein(domain, pop) <= 2) return pop;
  }
  return null;
}

interface BetaTesterModalProps {
  productName?: string;
}

export function BetaTesterModal({ productName = 'Studio' }: BetaTesterModalProps) {
  const { configured: authConfigured, user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [useEmail, setUseEmail] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [actionCount, setActionCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      if (user.name) setName(user.name);
      if (user.email) setEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    // Check initial state or URL override for testing (e.g. ?beta_gate=1 or ?test_gate=1 or ?reset_gate=1)
    const checkState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('reset_gate') === '1') {
        localStorage.removeItem('vera_gate_snooze_until');
        localStorage.removeItem('vera_beta_submitted');
        localStorage.removeItem('vera_actions_since_modal');
      }

      const forced = urlParams.get('beta_gate') === '1' || urlParams.get('test_gate') === '1';
      const status = getUsageStatus(DEFAULT_USAGE_THRESHOLD);
      setActionCount(status.count);

      if (forced || status.shouldPrompt) {
        setIsOpen(true);
      }
    };

    checkState();

    const handleUpdate = () => checkState();
    const handleOpenDirect = () => setIsOpen(true);

    // Gently prompt after 15 seconds of exploration if not already submitted
    const timer = setTimeout(() => {
      const status = getUsageStatus(DEFAULT_USAGE_THRESHOLD);
      if (!status.isSubmitted && !status.isSnoozed) {
        setIsOpen(true);
      }
    }, 15000);

    window.addEventListener('vera:usage_updated', handleUpdate);
    window.addEventListener('vera:open_beta_modal', handleOpenDirect);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('vera:usage_updated', handleUpdate);
      window.removeEventListener('vera:open_beta_modal', handleOpenDirect);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveName = (user?.name || name).trim();
    const effectiveEmail = (user?.email || email).trim().toLowerCase();

    if (!effectiveName) {
      setError('Please enter your name.');
      return;
    }
    if (!effectiveEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!user) {
      if (!EMAIL_REGEX.test(effectiveEmail)) {
        setError('Please enter a valid email address (e.g. name@example.com).');
        return;
      }
      const parts = effectiveEmail.split('@');
      if (parts.length !== 2) {
        setError('Please enter a valid email address.');
        return;
      }
      const [local, domain] = parts;
      if (local.length < 2) {
        setError('Email username must be at least 2 characters long.');
        return;
      }
      if (DISPOSABLE_DOMAINS.has(domain)) {
        setError('Please use your personal or work email address.');
        return;
      }
      const suggested = checkDomainTypo(domain);
      if (suggested) {
        setError(`Did you mean @${suggested}? Please check your email.`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/beta-tester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: effectiveName,
          email: effectiveEmail,
          note: note.trim(),
          actionCount,
          productName,
          verifiedWithGoogle: Boolean(user && user.email.toLowerCase() === effectiveEmail),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to submit details');
      }

      markBetaSubmitted(effectiveEmail);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSnooze = () => {
    snoozeGate();
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const mailtoUrl = `mailto:ishani.chakraborty.2005@gmail.com?subject=${encodeURIComponent(
    `${productName} Tester Application: ${name || 'User'}`,
  )}&body=${encodeURIComponent(
    `Hi Ishani,\n\nI'd love to join the ${productName} beta tester program!\n\nName: ${name}\nEmail: ${email}\nNote: ${note}\n\nThanks!`,
  )}`;

  return (
    <div
      className="veil fixed inset-0 z-50 flex items-center justify-center bg-ink-900/35 backdrop-blur-[2px] p-4 animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleSnooze();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="dialog relative w-full max-w-[490px] overflow-hidden rounded-[16px] border border-ink-300 p-7 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-150"
        style={{ background: 'var(--surface-raised)' }}
      >
        {/* Close Button in corner */}
        <button
          type="button"
          onClick={handleSnooze}
          className="absolute top-4 right-4 rounded-md p-1.5 text-ink-400 hover:bg-paper-200 hover:text-ink-900 transition-colors"
          title="Close"
          aria-label="Close"
        >
          ✕
        </button>

        {submitted ? (
          /* Warm Editorial Success State */
          <div className="py-4 text-center">
            <div className="flex justify-center mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/starter/cat.png"
                alt="Happy mascot"
                className="h-24 w-auto object-contain select-none pointer-events-none drop-shadow-xs"
              />
            </div>
            <h3
              className="display text-[26px] tracking-tight leading-snug"
              style={{ color: 'var(--color-ink-900)' }}
            >
              You're on the list!
            </h3>
            <p className="mt-2 text-[14px] text-ink-600 leading-relaxed max-w-sm mx-auto">
              Your details were received and dispatched to{' '}
              <strong className="text-ink-900 font-medium">ishani.chakraborty.2005@gmail.com</strong>. We'll be in touch with early features!
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full rounded-[8px] py-3 text-[14px] font-[550] shadow-xs transition-all hover:opacity-90"
                style={{
                  background: 'var(--color-ink-900)',
                  color: 'var(--color-paper-50)',
                }}
              >
                Continue Creating
              </button>
              <a
                href={mailtoUrl}
                className="text-[12px] text-ink-500 hover:text-ink-900 underline text-center pt-1"
              >
                Send backup direct email
              </a>
            </div>
          </div>
        ) : (
          /* Warm Editorial Application Form */
          <div>
            {/* Peeking Mascot Kitten */}
            <div className="flex justify-center -mt-2 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/starter/pleading-kitten.png"
                alt="Peeking kitten mascot"
                className="h-22 w-auto object-contain select-none pointer-events-none drop-shadow-xs"
              />
            </div>

            {/* Header info */}
            <div className="text-center">
              <span className="mono-label inline-flex items-center rounded-full border border-ink-200 bg-paper-100/70 px-3 py-0.5 text-[10.5px] uppercase tracking-wider text-ink-600">
                Early Tester Access
              </span>

              <h3
                className="display mt-2.5 text-[26px] tracking-tight leading-tight"
                style={{ color: 'var(--color-ink-900)' }}
              >
                Help shape {productName}
              </h3>

              <p className="mt-1.5 text-[13.5px] text-ink-600 leading-relaxed max-w-[360px] mx-auto">
                You've been creating! Join our early creator circle to get direct perks and shape new features.
              </p>
            </div>

            {/* Error notice */}
            {error && (
              <div
                className="mt-3.5 rounded-[8px] border border-red-200 bg-red-50/70 px-3.5 py-2 text-[12.5px] text-red-700"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Signed-in user view */}
            {user ? (
              <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
                <div className="flex items-center gap-3 rounded-[12px] border border-ink-200 bg-paper-100/70 p-3.5 text-left">
                  {user.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.picture}
                      alt=""
                      className="size-10 shrink-0 rounded-full border border-ink-300 object-cover"
                    />
                  ) : (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[14px] font-semibold text-paper">
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-semibold text-ink-900">{user.name}</span>
                      <span className="shrink-0 rounded-full border border-ink-300 bg-paper px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-ink-700">
                        Verified
                      </span>
                    </div>
                    <span className="block truncate text-[12.5px] text-ink-500">{user.email}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-ink-700 mb-1.5 text-left">
                    What are you creating? <span className="text-ink-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Poetry book, video reels, covers, stickers..."
                    className="w-full resize-none rounded-[8px] border border-ink-300 bg-paper px-3.5 py-2 text-[13.5px] text-ink-900 shadow-2xs placeholder:text-ink-400 focus:border-ink-900 focus:outline-hidden transition-colors leading-relaxed"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-[8px] py-2.5 px-4 text-[14px] font-[550] shadow-xs transition-all hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: 'var(--color-ink-900)',
                      color: 'var(--color-paper-50)',
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner size={14} />
                        <span>Sending...</span>
                      </span>
                    ) : (
                      'Join Tester Circle'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSnooze}
                    className="rounded-[8px] border border-ink-200 bg-paper px-4 py-2.5 text-[13px] font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900 transition-colors"
                  >
                    Maybe Later
                  </button>
                </div>
              </form>
            ) : !useEmail && authConfigured ? (
              /* Default Clean Choice: 1-Click Google or Switch to Email */
              <div className="pt-4 pb-1 text-center">
                <a
                  href={`/api/auth/google?returnTo=${encodeURIComponent(
                    typeof window !== 'undefined'
                      ? window.location.pathname + window.location.search + (window.location.search.includes('?') ? '&' : '?') + 'beta_gate=1'
                      : '/'
                  )}`}
                  className="btn btn-default flex w-full items-center justify-center gap-3 rounded-[10px] border border-ink-300 bg-paper py-3 px-4 text-[14.5px] font-semibold text-ink-900 shadow-2xs hover:border-ink-900 hover:bg-paper-100 transition-all"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/google-g.svg" alt="" className="size-4.5 shrink-0" />
                  <span>Continue with Google</span>
                </a>

                <div className="mt-4 flex flex-col items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setUseEmail(true);
                      setError(null);
                    }}
                    className="text-[13px] text-ink-600 hover:text-ink-900 underline transition-colors"
                  >
                    or use email address
                  </button>

                  <button
                    type="button"
                    onClick={handleSnooze}
                    className="text-[12px] text-ink-400 hover:text-ink-600 transition-colors pt-2"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            ) : (
              /* Email Form View */
              <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-[12.5px] font-semibold text-ink-700 mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="e.g. Ishani"
                    className="w-full rounded-[8px] border border-ink-300 bg-paper px-3.5 py-2.5 text-[14px] text-ink-900 shadow-2xs placeholder:text-ink-400 focus:border-ink-900 focus:outline-hidden transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-ink-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="your.email@example.com"
                    className="w-full rounded-[8px] border border-ink-300 bg-paper px-3.5 py-2.5 text-[14px] text-ink-900 shadow-2xs placeholder:text-ink-400 focus:border-ink-900 focus:outline-hidden transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-ink-700 mb-1.5">
                    What are you creating? <span className="text-ink-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Poetry book, video reels, covers, stickers..."
                    className="w-full resize-none rounded-[8px] border border-ink-300 bg-paper px-3.5 py-2 text-[13.5px] text-ink-900 shadow-2xs placeholder:text-ink-400 focus:border-ink-900 focus:outline-hidden transition-colors leading-relaxed"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-[8px] py-2.5 px-4 text-[14px] font-[550] shadow-xs transition-all hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: 'var(--color-ink-900)',
                      color: 'var(--color-paper-50)',
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner size={14} />
                        <span>Sending...</span>
                      </span>
                    ) : (
                      'Join Tester Circle'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleSnooze}
                    className="rounded-[8px] border border-ink-200 bg-paper px-4 py-2.5 text-[13px] font-medium text-ink-600 hover:bg-paper-100 hover:text-ink-900 transition-colors"
                  >
                    Maybe Later
                  </button>
                </div>

                {authConfigured && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUseEmail(false);
                        setError(null);
                      }}
                      className="text-[12px] text-ink-500 hover:text-ink-900 transition-colors"
                    >
                      ← Back to Google sign-in
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

