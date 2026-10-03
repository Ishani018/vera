import dynamic from 'next/dynamic';

/**
 * The Line Art Lab. Client-side, like the editors: the engine, the worker and
 * the picture all live in the browser, and nothing is sent anywhere.
 */
const Lab = dynamic(() => import('@/components/lab/Lab').then((m) => m.Lab));

export default function Page() {
  return <Lab />;
}
