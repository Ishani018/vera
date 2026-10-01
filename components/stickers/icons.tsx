/**
 * The icons the sticker pages use.
 *
 * Drawn here as inline SVG rather than pulled from an icon package: there are
 * eight of them, they are twenty lines of path data, and a dependency that
 * ships a thousand would be a megabyte of download for eight shapes. They all
 * take their colour from the text around them and all sit on the same 24-unit
 * grid, so they line up with each other and with a label beside them.
 */

export type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
});

/** Making one: a picture with a spark coming off it. */
export const MakeIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 5.5h10a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 17V7A1.5 1.5 0 0 1 4 5.5Z" />
    <path d="M2.8 14.2 6.5 11l3 2.6 2.4-2 3.1 2.8" />
    <path d="M19 3v4M21 5h-4M19.5 10.5v2.5M20.75 11.75h-2.5" />
  </svg>
);

/** A sheet of them: a page with a grid on it. */
export const SheetIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 2.75h14a1.25 1.25 0 0 1 1.25 1.25v16A1.25 1.25 0 0 1 19 21.25H5A1.25 1.25 0 0 1 3.75 20V4A1.25 1.25 0 0 1 5 2.75Z" />
    <circle cx="8.5" cy="8" r="2.1" />
    <circle cx="15.5" cy="8" r="2.1" />
    <circle cx="8.5" cy="15.5" r="2.1" />
    <circle cx="15.5" cy="15.5" r="2.1" />
  </svg>
);

/** A pack: a box with a band round it. */
export const PackIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" />
    <path d="M3 7.5 12 12l9-4.5M12 12v9" />
  </svg>
);

/** The library: a stack of cards. */
export const LibraryIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M7 3.75h10a1.25 1.25 0 0 1 1.25 1.25v9A1.25 1.25 0 0 1 17 15.25H7A1.25 1.25 0 0 1 5.75 14V5A1.25 1.25 0 0 1 7 3.75Z" />
    <path d="M3.75 7v11A2.25 2.25 0 0 0 6 20.25h11" />
    <path d="M9 8.5h6M9 11.5h4" />
  </svg>
);

/** Adding a picture. */
export const UploadIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 16V4.5M8 8l4-3.5L16 8" />
    <path d="M3.75 14.5V18A2.25 2.25 0 0 0 6 20.25h12A2.25 2.25 0 0 0 20.25 18v-3.5" />
  </svg>
);

/** A draft: a page with a corner turned, mid-work. */
export const DraftIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M13.5 2.75H7A1.25 1.25 0 0 0 5.75 4v16A1.25 1.25 0 0 0 7 21.25h10A1.25 1.25 0 0 0 18.25 20V7.5l-4.75-4.75Z" />
    <path d="M13.25 3v4.25h4.5" />
    <path d="M8.75 13h6.5M8.75 16.5h4" />
  </svg>
);

/** Plus, for a new anything. */
export const PlusIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** Minus, for taking one back off. */
export const MinusIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14" />
  </svg>
);

/** Downwards into a file. */
export const DownloadIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 4v11.5M8 12l4 3.5 4-3.5" />
    <path d="M3.75 16V18A2.25 2.25 0 0 0 6 20.25h12A2.25 2.25 0 0 0 20.25 18v-2" />
  </svg>
);
