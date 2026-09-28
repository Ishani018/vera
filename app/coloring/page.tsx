import dynamic from 'next/dynamic';

const ColoringWorkspace = dynamic(() =>
  import('@/components/coloring/ColoringWorkspace').then((m) => m.ColoringWorkspace),
);

export default function Page() {
  return <ColoringWorkspace />;
}
