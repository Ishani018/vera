import dynamic from 'next/dynamic';

/**
 * The whole workspace is client-side: the project lives in IndexedDB and the
 * preview paginates in an iframe, neither of which the server can do. Rendering
 * it dynamically keeps the server from attempting either.
 */
const Workspace = dynamic(() => import('@/components/Workspace').then((m) => m.Workspace));

export default function Page() {
  return <Workspace />;
}
