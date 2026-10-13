'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SessionUser } from './session';

type State = {
  /** Null until the server has answered, so nothing flashes in and out. */
  ready: boolean;
  configured: boolean;
  required: boolean;
  user: SessionUser | null;
};

const NOBODY: State = { ready: false, configured: false, required: false, user: null };

/** Who is signed in, and whether sign-in exists on this server. */
export function useUser() {
  const [state, setState] = useState<State>(NOBODY);

  useEffect(() => {
    let live = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => live && setState(data ? { ready: true, ...data } : { ...NOBODY, ready: true }))
      .catch(() => live && setState({ ...NOBODY, ready: true }));
    return () => {
      live = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => undefined);
    // Back to the front page, where a server that requires sign-in will ask again.
    window.location.assign('/');
  }, []);

  return { ...state, signOut };
}
