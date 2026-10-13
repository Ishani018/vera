'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { AuthCard } from './AuthCard';
import { StudioHeader } from './StudioHeader';
import { useUser } from '@/lib/auth/useUser';

const Landing = dynamic(() => import('@/components/Landing').then((m) => m.Landing));

/**
 * Initial entry gate.
 *
 * Presents the log in and sign up screen when someone first opens the studio,
 * while allowing instant one-click guest access that is remembered in storage.
 */
export function InitialGate() {
  const { user, ready, configured } = useUser();
  const [checked, setChecked] = useState(false);
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const isGuest = window.localStorage.getItem('studio_guest') === 'true';
        setGuest(isGuest);
      }
    } catch {
      // Storage restricted, proceed
      setGuest(true);
    } finally {
      setChecked(true);
    }
  }, []);

  // During SSR or initial mount before checking storage
  if (!checked || !ready) {
    return (
      <main className="flex min-h-dvh flex-col" style={{ background: 'var(--studio-page)' }}>
        <StudioHeader />
      </main>
    );
  }

  // If already signed in or guest mode active, render the studio dashboard
  if (user || guest) {
    return <Landing />;
  }

  // Otherwise, present the initial log in and sign up screen
  return (
    <main className="flex min-h-dvh flex-col" style={{ background: 'var(--studio-page)' }}>
      <StudioHeader />
      <div className="grid flex-1 place-items-center px-4 py-8 sm:px-6 sm:py-12">
        <AuthCard
          ready={configured}
          googleHref="/api/auth/google?returnTo=/"
          errorMessage={null}
          returnTo="/"
          onGuestContinue={() => setGuest(true)}
          onSuccess={() => setGuest(true)}
        />
      </div>
    </main>
  );
}
