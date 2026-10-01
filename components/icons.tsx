/**
 * The icons the front page uses.
 *
 * Same 24-unit grid and same stroke weight as the sticker set in
 * `components/stickers/icons.tsx`, so a row that mixes the two lines up. Drawn
 * here rather than installed: twelve shapes are forty lines of path data, and an
 * icon package that ships a thousand would be a megabyte of download for them.
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

export const HomeIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.5" />
    <path d="M9.75 20.5v-5.25h4.5v5.25" />
  </svg>
);

export const DesignsIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3.25" y="3.25" width="8" height="8" rx="1.5" />
    <rect x="12.75" y="3.25" width="8" height="5" rx="1.5" />
    <rect x="3.25" y="12.75" width="8" height="8" rx="1.5" />
    <rect x="12.75" y="9.75" width="8" height="11" rx="1.5" />
  </svg>
);

export const TemplatesIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3.25" y="3.75" width="17.5" height="16.5" rx="1.75" />
    <path d="M3.25 8.5h17.5M9.5 8.5v11.75" />
  </svg>
);

export const TrashIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 6.5h16M9.5 6.5V4.75A1.5 1.5 0 0 1 11 3.25h2a1.5 1.5 0 0 1 1.5 1.5V6.5" />
    <path d="M6.25 6.5 7 19.75a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4l.75-13.25" />
    <path d="M10.25 10.5v6.5M13.75 10.5v6.5" />
  </svg>
);

export const SearchIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="10.5" cy="10.5" r="6.25" />
    <path d="m15.25 15.25 4.5 4.5" />
  </svg>
);

export const PlusIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CopyIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="8.75" y="8.75" width="11.5" height="11.5" rx="1.75" />
    <path d="M15.25 5.5A1.75 1.75 0 0 0 13.5 3.75h-8A1.75 1.75 0 0 0 3.75 5.5v8a1.75 1.75 0 0 0 1.75 1.75" />
  </svg>
);

export const PencilIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4.25 19.75h3.5L19 8.5a1.77 1.77 0 0 0 0-2.5l-1-1a1.77 1.77 0 0 0-2.5 0L4.25 16.25Z" />
    <path d="m14.5 6.75 2.75 2.75" />
  </svg>
);

export const CrossIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </svg>
);

export const BroomIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M14.5 3.5 9 9" />
    <path d="M7.25 10.75 13.25 4.75l6 6-6 6-6-6Z" />
    <path d="M7.25 16.75 3.5 20.5M11 18.5l-2.75 2.75" />
  </svg>
);

/* ------------------------------------------------- what you can make, round */

export const InteriorIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 6.25C10 4.5 7 4.25 4.25 4.75v13C7 17.25 10 17.5 12 19.25c2-1.75 5-2 7.75-1.5v-13C17 4.25 14 4.5 12 6.25Z" />
    <path d="M12 6.25v13" />
  </svg>
);

export const CoverIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="4.25" y="3.5" width="15.5" height="17" rx="1.75" />
    <path d="M8.25 3.5v17" />
    <path d="M12 8.5h4M12 11.5h4" />
  </svg>
);

export const InstagramIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="16.75" cy="7.25" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const PinIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 3.25a6.75 6.75 0 0 0-2.5 13.02" />
    <path d="M12 3.25a6.75 6.75 0 0 1 1.1 13.41" />
    <path d="M11.5 9.75 9 20.75" />
    <path d="M11.5 9.75c.4 1.6 1.9 2.3 3 1.9" />
  </svg>
);

export const PostcardIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="2.75" y="5.75" width="18.5" height="12.5" rx="1.75" />
    <path d="M13.5 5.75v12.5M16 9.5h3M16 12.5h3" />
    <path d="M6 14.5c1-2 3.5-2 4.5 0" />
  </svg>
);

export const BookmarkIcon = ({ size = 20, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M7 3.75h10a1 1 0 0 1 1 1V20.5l-6-3.5-6 3.5V4.75a1 1 0 0 1 1-1Z" />
  </svg>
);
