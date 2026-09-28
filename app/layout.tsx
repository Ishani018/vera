import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Versecraft — poetry book typesetter',
  description:
    'Typeset a poetry collection and export print-ready KDP interior and cover PDFs, in the browser.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        Grammarly and friends write their own attributes onto <body> before
        React gets to it, and React then reports the body it rendered and the
        body it found as a mismatch. Nothing here can prevent that — the page
        the server sent was right, and an extension edited it in flight.

        This is shallow: it covers this element's own attributes and nothing
        below it, so a real hydration mismatch anywhere in the app is still
        reported. It buys quiet about the one case we cannot fix and gives up
        no warning we would want.
      */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
