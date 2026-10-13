import { isConfigured } from '@/lib/auth/config';
import { safeReturnTo } from '@/lib/auth/flow';
import { config } from '@/lib/auth/server';
import { StudioHeader } from '@/components/StudioHeader';

/** Plain reasons for every way a sign-in can end without one. */
const REASONS: Record<string, string> = {
  denied: 'You chose not to sign in.',
  state: 'That sign-in did not start here, or it took too long. Please try again.',
  exchange: 'Google would not complete the sign-in. Please try again.',
  token: 'Google’s answer could not be checked, so you were not signed in.',
  unverified: 'That Google account has no verified email address.',
  'not-allowed': 'That account is not on the list of people who can use this copy of the app.',
  'not-set-up': 'Google sign-in has not been set up on this server yet.',
  failed: 'Something went wrong signing you in. Please try again.',
};

// No product name here: it comes from lib/brand.ts, and the page title gets it from the layout.
export const metadata = { title: 'Sign in' };

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo } = await searchParams;
  const cfg = config();
  const ready = isConfigured(cfg);
  const message = error ? (REASONS[error] ?? REASONS.failed) : null;
  const href = `/api/auth/google?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;

  return (
    <main className="flex min-h-dvh flex-col" style={{ background: 'var(--studio-page)' }}>
      <StudioHeader />
      <div className="grid flex-1 place-items-center px-6 py-12">
        <div
          className="w-full max-w-md rounded-2xl border p-8 text-center"
          style={{
            background: 'var(--studio-card)',
            borderColor: 'var(--studio-line)',
            boxShadow: 'var(--studio-shadow-card)',
          }}
        >
          <h1 className="display text-[30px] tracking-tight">Sign in</h1>
          <p className="mt-3 text-[16px] leading-relaxed" style={{ color: 'var(--color-ink-500)' }}>
            Use your Google account. It only tells us who you are. Your books stay in this browser and are
            never uploaded.
          </p>

          {message && (
            <p
              role="alert"
              className="mt-6 rounded-xl border px-4 py-3 text-left text-[14.5px]"
              style={{ borderColor: 'var(--studio-line)', color: 'var(--color-ink-900)' }}
            >
              {message}
            </p>
          )}

          {ready ? (
            <a href={href} className="btn btn-primary mt-7 inline-flex w-full rounded-[6px] px-6 py-3.5 text-[16px]">
              Continue with Google
            </a>
          ) : (
            <p className="mt-7 text-[14.5px] leading-relaxed" style={{ color: 'var(--color-ink-500)' }}>
              Whoever runs this copy needs to add a Google client id, a client secret and a signing key. See
              <code className="mx-1 text-[13px]">docs/DEPLOY-AUTH.md</code>.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
