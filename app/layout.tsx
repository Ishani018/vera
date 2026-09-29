import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Isnaevy — the design tool for people who self-publish books',
  description:
    'Book interiors, covers and the launch kit around a release. Print-ready KDP PDFs, made in the browser and kept on your own computer.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b0d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          The wordmark's face. Loaded the same way every other Google face in
          this app is — a stylesheet link at runtime — rather than baked in at
          build time, so building has never needed the network and still
          doesn't. If it cannot be reached the wordmark falls back to whichever
          script the machine ships.
        */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap"
        />
      </head>
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
