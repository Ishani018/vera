import dynamic from 'next/dynamic';

/** Client-side, because the list of books comes out of IndexedDB. */
const Landing = dynamic(() => import('@/components/Landing').then((m) => m.Landing));

export default function Page() {
  return <Landing />;
}
