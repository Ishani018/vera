import type { Metadata, Viewport } from 'next';
import { Flow } from '@/components/Flow';
import { Toasts } from '@/components/Toasts';
import { DEFAULT_THEME, THEMES, THEME_KEY } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Isnaevy — the design tool for people who self-publish books',
  description:
    'Book interiors, covers and the launch kit around a release. Print-ready KDP PDFs, made in the browser and kept on your own computer.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The browser's own chrome, matched to the default theme's page.
  themeColor: '#F5EFE5',
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
        {/*
          The display face for headings. One family, two weights, the optical
          size axis left to the browser — the whole latin subset of a variable
          face, which is one file and one request. Body text keeps the system
          sans, which costs nothing and is already on the machine.
        */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&display=swap"
        />
        {/*
          The theme, chosen before anything is painted.

          Inline and synchronous on purpose: a theme applied after the first
          paint is a flash of the wrong colours on every page load, and no
          amount of care further down can take that back. It is eight lines, it
          touches one attribute, and it cannot throw — a browser with storage
          blocked gets the default rather than an error.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=new URLSearchParams(location.search).get('theme');var k='${THEME_KEY}';var s=localStorage.getItem(k);var ok=${JSON.stringify(THEMES.map((one) => one.id))};var pick=ok.indexOf(t)>=0?t:(ok.indexOf(s)>=0?s:'${DEFAULT_THEME}');document.documentElement.dataset.theme=pick;if(t&&ok.indexOf(t)>=0)localStorage.setItem(k,t);}catch(e){document.documentElement.dataset.theme='${DEFAULT_THEME}';}})();`,
          }}
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
      <body suppressHydrationWarning>
        {/* Renders nothing; fades the page when the route changes. */}
        <Flow />
        {/*
          Around everything, so anything in the app can say something in the
          corner without being wired to the screen it happens to be on. It adds
          no box of its own: the stack is fixed and the children pass straight
          through.
        */}
        <Toasts>{children}</Toasts>
      </body>
    </html>
  );
}
