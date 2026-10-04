/**
 * The four marks on the Lab's rail.
 *
 * Drawn here rather than taken from `components/stickers/icons.tsx` because
 * only one of the four has a twin there, and a rail where three icons share a
 * weight and the fourth does not reads as a mistake. All four are one stroke
 * weight on the same 20-unit grid, and all four take `currentColor`, so the
 * pale teal pill colours its icon by colouring its text.
 */

export type LabIconProps = { size?: number };

const common = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

/** A framed picture with a sun and a hill: the thing you brought. */
export function PictureIcon({ size = 20 }: LabIconProps) {
  return (
    <svg {...common(size)}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <circle cx="7.25" cy="8" r="1.5" />
      <path d="M3 14l4-4 3.5 3.5L13 11l4 3.5" />
    </svg>
  );
}

/** An eye: which of the eight you are looking at. */
export function LookIcon({ size = 20 }: LabIconProps) {
  return (
    <svg {...common(size)}>
      <path d="M1.75 10S4.75 4.5 10 4.5 18.25 10 18.25 10 15.25 15.5 10 15.5 1.75 10 1.75 10z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

/** Two sliders, which is what tuning is. */
export function TuneIcon({ size = 20 }: LabIconProps) {
  return (
    <svg {...common(size)}>
      <path d="M3 7h14M3 13h14" />
      <circle cx="7.5" cy="7" r="2" />
      <circle cx="12.5" cy="13" r="2" />
    </svg>
  );
}

/** An arrow leaving a tray: off this computer and onto yours. */
export function ExportIcon({ size = 20 }: LabIconProps) {
  return (
    <svg {...common(size)}>
      <path d="M10 2.75v8.5" />
      <path d="M6.75 8l3.25 3.25L13.25 8" />
      <path d="M3.5 12.5v2.75a2 2 0 002 2h9a2 2 0 002-2V12.5" />
    </svg>
  );
}
