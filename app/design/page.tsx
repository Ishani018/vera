import dynamic from 'next/dynamic';

/**
 * A design that belongs to no book. Client-side for the same reason the book
 * editors are: what it opens lives in IndexedDB, which the server cannot read.
 */
const DesignWorkspace = dynamic(() =>
  import('@/components/DesignWorkspace').then((m) => m.DesignWorkspace),
);

export default function Page() {
  return <DesignWorkspace />;
}
