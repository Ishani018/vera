import { isConfigured } from '@/lib/auth/config';
import { safeReturnTo } from '@/lib/auth/flow';
import { config } from '@/lib/auth/server';
import { AuthCard } from '@/components/AuthCard';
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
  const target = safeReturnTo(returnTo);
  const href = `/api/auth/google?returnTo=${encodeURIComponent(target)}`;

  return (
    <main className="flex min-h-dvh flex-col" style={{ background: 'var(--studio-page)' }}>
      <StudioHeader />
      <div className="grid flex-1 place-items-center px-4 py-8 sm:px-6 sm:py-12">
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
