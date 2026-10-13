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
 * Shows the log in and sign up screen when someone opens the studio.
 * A single click on "Continue as guest" enters the studio dashboard.
 */
export function InitialGate() {
  const { user, ready, configured } = useUser();
  const [checked, setChecked] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        // Clear any old permanent guest flag
        window.localStorage.removeItem('studio_guest');
        const inSession = window.sessionStorage.getItem('studio_entered') === 'true';
        setEntered(inSession);
      }
    } catch {
      setEntered(false);
    } finally {
      setChecked(true);
    }
  }, []);

  const handleEnter = () => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('studio_entered', 'true');
      }
    } catch {}
    setEntered(true);
  };

  // Before mount or user check is ready
  if (!checked || !ready) {
    return (
      <main className="flex min-h-dvh flex-col" style={{ background: 'var(--studio-page)' }}>
        <StudioHeader />
      </main>
    );
  }

  // If signed in or guest clicked continue in this session, show dashboard
  if (user || entered) {
    return <Landing />;
  }

  // Initial log in and sign up screen
  return (
    <main className="flex min-h-dvh flex-col" style={{ background: 'var(--studio-page)' }}>
      <StudioHeader />
      <div className="grid flex-1 place-items-center px-4 py-8 sm:px-6 sm:py-12">
        <AuthCard
          ready={configured}
          googleHref="/api/auth/google?returnTo=/"
          errorMessage={null}
          returnTo="/"
          onGuestContinue={handleEnter}
          onSuccess={handleEnter}
        />
      </div>
    </main>
  );
}
