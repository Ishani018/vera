'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { AuthCard } from './AuthCard';
import { Wordmark } from './Wordmark';
import { useUser } from '@/lib/auth/useUser';

const Landing = dynamic(() => import('@/components/Landing').then((m) => m.Landing));

/**
 * Initial entry gate.
 *
 * Shows the log in and sign up screen when someone opens the studio.
 * Top-left branding pinned in the corner, with the auth card centered on screen.
 * A single click on "Continue as guest" enters the studio dashboard.
 */
export function InitialGate() {
  const { user, ready, configured } = useUser();
  const [checked, setChecked] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
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
      <main className="relative flex min-h-dvh w-full items-center justify-center p-4" style={{ background: 'var(--studio-page)' }}>
        <div className="absolute top-3 left-4 sm:top-4 sm:left-6 z-10">
          <Wordmark />
        </div>
      </main>
    );
  }

  // If signed in or guest clicked continue in this session, show dashboard
  if (user || entered) {
    return <Landing />;
  }

  // Initial log in and sign up screen
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
