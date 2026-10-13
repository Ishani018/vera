import { isConfigured } from '@/lib/auth/config';
import { safeReturnTo } from '@/lib/auth/flow';
import { config } from '@/lib/auth/server';
import { AuthCard } from '@/components/AuthCard';
import { Wordmark } from '@/components/Wordmark';

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
  const target = safeReturnTo(returnTo);
  const href = `/api/auth/google?returnTo=${encodeURIComponent(target)}`;

  return (
    <main
      className="relative flex min-h-dvh w-full items-center justify-center p-4 sm:p-6"
      style={{ background: 'var(--studio-page)' }}
    >
      {/* Top left corner branding */}
      <div className="absolute top-3 left-4 sm:top-4 sm:left-6 z-10">
        <Wordmark />
      </div>

      <div className="w-full flex items-center justify-center py-4">
        <AuthCard
          ready={ready}
          googleHref={href}
          errorMessage={message}
          returnTo={target}
        />
      </div>
    </main>
  );
}
