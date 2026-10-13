/* CryoRadar icon set. Drawn on a 20 × 20 grid with a 1.5 px stroke, butt caps
 * and mitred joins, so they read as small technical drawings rather than
 * friendly glyphs. Every icon inherits currentColor. */

import type { SVGProps } from 'react';

const PATHS = {
  pan: 'M10 2.5v15M2.5 10h15M7.5 5 10 2.5 12.5 5M7.5 15 10 17.5 12.5 15M5 7.5 2.5 10 5 12.5M15 7.5l2.5 2.5-2.5 2.5',
  pick: 'M2 14c3 0 4.5-4 8-4s5 4 8 4M10 10V3.5M7.5 5.5 10 3l2.5 2.5',
  measure: 'M3.5 16.5 16.5 3.5M3.5 16.5v-4M3.5 16.5h4M16.5 3.5v4M16.5 3.5h-4M7 11.5l1.5 1.5M9.5 9l1.5 1.5M12 6.5l1.5 1.5',
  roi: 'M3 4.5h3M8.5 4.5h3M14 4.5h3v3M17 10v2.5M17 15v.5h-3M11.5 15.5h-3M6 15.5H3v-3M3 10V7.5',
  radargram: 'M2 5.5c2-1.5 4 1.5 6 0s4-1.5 6 0 3 1 4 0M2 10.5c2-1 4 1 6 0s4-1 6 0 3 .8 4 0M2 15.5c3 0 5-2 8-2s5 2 8 2',
  ascope: 'M3 2.5v15h14.5M3 12.5h3l1.5-7 1.6 10 1.4-5h7',
  map: 'M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM10 2.5c-2 2-3 4.5-3 7.5s1 5.5 3 7.5M10 2.5c2 2 3 4.5 3 7.5s-1 5.5-3 7.5M2.5 10h15M3.6 6.25h12.8M3.6 13.75h12.8',
  scene: 'M10 2.5 17 6.5v7l-7 4-7-4v-7ZM3 6.5l7 4 7-4M10 10.5v7',
  data: 'M8.5 7.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM2.5 14c1.5 2 9.5-.5 13.5-4.5 2.5-2.5 3-4.5 1.5-5M14.5 2.5h3v3h-3Z',
  view: 'M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5S2 10 2 10ZM10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  processing: 'M5 2.5v15M10 2.5v15M15 2.5v15M3 12h4M8 6h4M13 10h4',
  layers: 'M2 6.5c3-1.5 5 1 8 0s5-1.5 8 0M2 10.5c3-1.5 5 1 8 0s5-1.5 8 0M2 14.5c3-1.5 5 1 8 0s5-1.5 8 0',
  detect: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM10 1.5V6M10 14v4.5M1.5 10H6M14 10h4.5M10 9.25v1.5',
  hypothesis: 'M10 3v14M5.5 17h9M4 6h12M4 6l-2 5h4ZM16 6l-2 5h4ZM2 11c0 1.5 4 1.5 4 0M14 11c0 1.5 4 1.5 4 0',
  polarimetry: 'M3.5 14.5c-1.5-2.5 1-6.5 5-9s8.5-3 10-.5-1 6.5-5 9-8.5 3-10 .5ZM13.5 4l3 .5-1 3',
  uncertainty: 'M2 16.5h16M2 16c3.5 0 4.5-10.5 8-10.5S14.5 16 18 16M6.5 16.5v-3.5M13.5 16.5v-3.5',
  crism: 'M2 15.5h16M2 13l2.5-2 2 3.5 2.5-9 2.5 6.5 2-3 2 2.5 2.5-2',
  inversion: 'M3 3h14v14H3ZM3 7.67h14M3 12.33h14M7.67 3v14M12.33 3v14M7.67 7.67h4.66v4.66H7.67Z',
  log: 'M4.5 2.5h11v15h-11ZM7.5 2.5v15M10 6.5h3.5M10 9.5h3.5M10 12.5h2',
  budget: 'M10 18V9.5M6.5 6a5 5 0 0 1 7 0M4 3.5a8.5 8.5 0 0 1 12 0M7 18h6',
  tour: 'M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM12.9 7.1 11.4 11.4 7.1 12.9 8.6 8.6Z',
  docs: 'M10 5C8 3.5 5 3.5 2.5 4v12c2.5-.5 5.5-.5 7.5 1 2-1.5 5-1.5 7.5-1V4C15 3.5 12 3.5 10 5ZM10 5v12',
  search: 'M8.5 3a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM12.5 12.5l5 5',
  close: 'M5 5l10 10M15 5 5 15',
  chevronDown: 'M5.5 8 10 12.5 14.5 8',
  chevronRight: 'M8 5.5 12.5 10 8 14.5',
  chevronLeft: 'M12 5.5 7.5 10 12 14.5',
  play: 'M6 4l10 6-10 6Z',
  stop: 'M5.5 5.5h9v9h-9Z',
  download: 'M10 3v10M6 9l4 4 4-4M3.5 16.5h13',
  upload: 'M10 13V3M6 7l4-4 4 4M3.5 16.5h13',
  link: 'M8.5 11.5a3 3 0 0 0 4.2 0l3-3a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0l-3 3a3 3 0 0 0 4.2 4.2l1-1',
  check: 'M4 10.5l4 4 8-9',
  warning: 'M10 3 18 17H2ZM10 8v4.5M10 14.25v1.25',
  sun: 'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5M4 4l1.75 1.75M14.25 14.25 16 16M4 16l1.75-1.75M14.25 5.75 16 4',
  moon: 'M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9Z',
  keyboard: 'M2 5h16v10H2ZM5 8.5h1M8 8.5h1M11 8.5h1M14 8.5h1M6 12h8',
  plus: 'M10 4v12M4 10h12',
  minus: 'M4 10h12',
  trash: 'M3.5 5.5h13M8 5.5V3h4v2.5M5 5.5l1 11.5h8l1-11.5M8.5 8.5v6M11.5 8.5v6',
  eyeOff: 'M3 3l14 14M8.2 4.7C8.8 4.6 9.4 4.5 10 4.5c5 0 8 5.5 8 5.5a14 14 0 0 1-2.4 3.1M5.4 6.4A13.5 13.5 0 0 0 2 10s3 5.5 8 5.5c1.3 0 2.4-.3 3.4-.8',
  fit: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4',
  split: 'M2.5 3.5h15v13h-15ZM10 3.5v13',
  migrate: 'M2.5 16c1.5-7 4-9.5 7.5-9.5s6 2.5 7.5 9.5M10 3v6.5',
  statics: 'M2.5 5h6l1 2h8M2.5 10h15M2.5 15h8l1-2h6',
  tec: 'M2 9c4-5 12-5 16 0M4.5 12c3-3.5 8-3.5 11 0M10 13v5M8 16l2 2 2-2',
  external: 'M8.5 4.5H4v11.5h11.5v-4.5M11 3h6v6M17 3 9 11',
  menu: 'M3 5.5h14M3 10h14M3 14.5h14',
  more: 'M4.5 10h.01M10 10h.01M15.5 10h.01',
  info: 'M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM10 9v5M10 6.25v1.25',
  reset: 'M3.5 10a6.5 6.5 0 1 0 2-4.7M3 2.5v3.5h3.5',
  code: 'M7 6l-4 4 4 4M13 6l4 4-4 4M11.5 3.5l-3 13',
  file: 'M5 2.5h6.5l3.5 3.5v11.5H5ZM11.5 2.5V6H15',
  save: 'M3 3h11l3 3v11H3ZM6 3v5h7V3M6 17v-5h8v5',
  grid: 'M3 3h14v14H3ZM3 10h14M10 3v14',
  crosshair: 'M10 2.5v15M2.5 10h15',
  pin: 'M10 17.5V11M6 3h8M7 3v5l-2 3h10l-2-3V3',
  command: 'M7 7h6v6H7ZM7 7H5a2 2 0 1 1 2-2ZM13 7V5a2 2 0 1 1 2 2ZM13 13h2a2 2 0 1 1-2 2ZM7 13v2a2 2 0 1 1-2-2Z',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, strokeWidth = 1.5, ...rest }: IconProps) {
  const round = name === 'more';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={round ? 2.5 : strokeWidth}
      strokeLinecap={round ? 'round' : 'butt'}
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The CryoRadar mark: a surface echo arching over two buried reflectors, inside an instrument frame. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="1.75" y="1.75" width="20.5" height="20.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 9.5c2-3.2 12-3.2 14 0" fill="none" stroke="var(--c-accent)" strokeWidth="2" />
      <path d="M5 14h14" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 17.75h3M10.5 17.75h3M16 17.75h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
