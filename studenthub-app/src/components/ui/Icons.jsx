import React from 'react';
import brandLogoUrl from '../../../../icons/icon-192.png';

const GLYPH_PATHS = {
  home: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  tasks: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 13 2 2 4-4" /></>,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  study: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  cards: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 1.8h9a4 4 0 0 1 4 4v11M3 7v9a4 4 0 0 0 4 4" /><path d="M8.5 9h7M8.5 13h5" /></>,
  grades: <><path d="M4 20V10M10 20V4M16 20v-7M2 20h20" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M14 21h-4" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
  arrow: <><path d="m9 18 6-6-6-6" /></>,
  sync: <><path d="M20 7h-5V2" /><path d="M4 17h5v5" /><path d="M5.5 9a8 8 0 0 1 13-3L20 7M4 17l1.5 1A8 8 0 0 0 18.5 15" /></>,
  spark: <><path d="m4 15 4-4 4 3 7-8" /><path d="M15 6h4v4" /></>,
  chevron: <><path d="m6 9 6 6 6-6" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: <><path d="M9 5v14M15 5v14" /></>,
  reset: <><path d="M4 4v6h6" /><path d="M5.5 15a7.5 7.5 0 1 0 1.2-8.7L4 10" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  notes: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  tag: <><path d="M20 13 13 20 4 11V4h7l9 9Z" /><circle cx="8.5" cy="8.5" r="1.5" /></>,
  progress: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9h.01M15 9h.01" /></>,
};

export function Glyph({ name, className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPH_PATHS[name] || GLYPH_PATHS.home}
    </svg>
  );
}

export function BrandLogo({ className = '' }) {
  return <img className={className} src={brandLogoUrl} alt="" width="192" height="192" decoding="async" />;
}
