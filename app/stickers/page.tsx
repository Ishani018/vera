import dynamic from 'next/dynamic';

/**
 * The Sticker Studio. Client-side like the editors, because everything it
 * touches — the upload, the worker, the library — lives in the browser.
 */
const StickerStudio = dynamic(() =>
  import('@/components/stickers/StickerStudio').then((m) => m.StickerStudio),
);

export default function Page() {
  return <StickerStudio />;
}
