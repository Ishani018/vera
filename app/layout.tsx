import type { Metadata, Viewport } from 'next';
import { Flow } from '@/components/Flow';
import { Toasts } from '@/components/Toasts';
import { BRAND } from '@/lib/brand';
import { CUSTOM_ID, CUSTOM_KEY, DEFAULT_THEME, THEMES, THEME_KEY } from '@/lib/theme';
import './globals.css';

const TITLE = `${BRAND.product} — the design tool for people who self-publish books`;
const DESCRIPTION =
  'Book interiors, covers and the launch kit around a release. Print-ready KDP PDFs, made in the browser and kept on your own computer.';

export const metadata: Metadata = {
  // Absolute URLs for the social preview come from here.
  metadataBase: new URL(BRAND.siteUrl),
  title: { default: TITLE, template: `%s · ${BRAND.product}` },
  description: DESCRIPTION,
  applicationName: BRAND.product,
  creator: BRAND.studio,
  publisher: BRAND.studio,
  openGraph: {
    type: 'website',
    siteName: BRAND.product,
    title: TITLE,
    description: DESCRIPTION,
    url: BRAND.siteUrl,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
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
          The three faces that come from Google, in one request.

          Fraunces SemiBold and its italic for headings, Inter for body and
          buttons, DM Mono for the small uppercase labels a proof sheet is
          annotated with. The wordmark's face is not in this request: it is
          served from /fonts (see globals.css), so it never touches Google.

          Loaded the same way the two faces before them were — a stylesheet link
          at runtime rather than baked in at build time, so building has never
          needed the network and still doesn't. `display=swap` so the page is
          readable in the fallback stack while they arrive, and every stack in
          `lib/theme.ts` ends in something the machine already has.

          Inter is asked for as a variable face (`wght@400..600`) rather than as
          three static weights: one file of 48 KB instead of three totalling 96.
          Latin only, which is what Google serves by default and what the
          unicode-range on each block limits it to.
        */}
        {/* The wordmark face is ours: fetched early, from this origin, so the header does not flash in a fallback. */}
        <link rel="preload" href="/fonts/wordmark-display-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href={
            'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500' +
            '&family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600' +
            '&family=Inter:wght@400..600' +
            '&display=swap'
          }
        />
        {/*
          The palette, chosen before anything is painted.

          Inline and synchronous on purpose: a palette applied after the first
          paint is a flash of the wrong colours on every page load, and no
          amount of care further down can take that back. It touches one
          attribute and it cannot throw — a browser with storage blocked gets
          the default rather than an error.

          A palette somebody mixed themselves is seventeen values in a second
          key, written onto the root as inline custom properties here so that it
          too is right on the first frame. `custom` is accepted as an id only
          when that key actually parses; anything else falls back to the
          default, so a half-written key cannot leave the app unpainted.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{` +
              `var d=document.documentElement;` +
              `var k='${THEME_KEY}',c='${CUSTOM_KEY}';` +
              `var ok=${JSON.stringify(THEMES.map((one) => one.id))};` +
              `var t=new URLSearchParams(location.search).get('theme');` +
              `var s=localStorage.getItem(k);` +
              `var mine=null;try{mine=JSON.parse(localStorage.getItem(c)||'null')}catch(e){}` +
              `var fine=function(x){return x&&(ok.indexOf(x)>=0||(x==='${CUSTOM_ID}'&&mine))};` +
              `var pick=fine(t)?t:(fine(s)?s:'${DEFAULT_THEME}');` +
              `d.dataset.theme=pick;` +
              `if(pick==='${CUSTOM_ID}'&&mine){for(var r in mine){if(typeof mine[r]==='string'&&r.charAt(0)==='-')d.style.setProperty(r,mine[r])}}` +
              `if(t&&fine(t))localStorage.setItem(k,t);` +
              `}catch(e){document.documentElement.dataset.theme='${DEFAULT_THEME}';}})();`,
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
