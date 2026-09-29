'use client';

import { useEffect, useState } from 'react';

/**
 * Where the front page asked to land inside a book.
 *
 * Read from the address bar once, on mount, rather than through
 * `useSearchParams`: these pages are rendered statically and that hook would
 * make each of them need a Suspense boundary to say the same thing.
 */
export type OpenIntent = {
  open: 'cover' | 'kit';
  presetId: string | null;
  designId: string | null;
};

export function useOpenIntent(): OpenIntent | null {
  const [intent, setIntent] = useState<OpenIntent | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    if (open !== 'cover' && open !== 'kit') return;
    setIntent({ open, presetId: params.get('preset'), designId: params.get('design') });
  }, []);
  return intent;
}
