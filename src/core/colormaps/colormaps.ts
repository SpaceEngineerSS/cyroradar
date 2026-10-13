/* Colour tables for radargrams and derived maps.
 *
 * Each table has 256 entries, stored twice: RGBA bytes (for textures) and as
 * packed 32-bit pixels in the platform's byte order (for ImageData writes, one
 * store per pixel). Grayscale is the default because that is how radargrams
 * are read in the literature; the others help with low-contrast reflectors. */

import type { ColormapId } from '../../types/types';

export interface Colormap {
  id: ColormapId;
  name: string;
  /** 256 × RGBA bytes. */
  rgba: Uint8Array;
  /** 256 packed pixels matching ImageData's byte layout. */
  packed: Uint32Array;
}

type Stop = [pos: number, hex: string];

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function build(id: ColormapId, name: string, stops: Stop[]): Colormap {
  const rgba = new Uint8Array(256 * 4);
  const packed = new Uint32Array(256);
  const rgb = stops.map(([p, h]) => [p, ...hexToRgb(h)] as const);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < rgb.length - 2 && t > rgb[j + 1][0]) j++;
    const a = rgb[j];
    const b = rgb[j + 1];
    const f = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0;
    const r = Math.round(a[1] + (b[1] - a[1]) * f);
    const g = Math.round(a[2] + (b[2] - a[2]) * f);
    const bl = Math.round(a[3] + (b[3] - a[3]) * f);
    rgba.set([r, g, bl, 255], i * 4);
    packed[i] = LITTLE_ENDIAN ? ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (bl << 8) | 255) >>> 0;
  }
  return { id, name, rgba, packed };
}

const ALL: Colormap[] = [
  build('grayscale', 'Grayscale', [[0, '#000000'], [1, '#ffffff']]),
  build('ember', 'Ember', [[0, '#0b0a09'], [0.22, '#2f1710'], [0.45, '#7a3416'], [0.65, '#c75a26'], [0.82, '#e5a35b'], [1, '#f6ecdc']]),
  build('ice', 'Ice', [[0, '#06090c'], [0.25, '#15283a'], [0.5, '#2f5a74'], [0.72, '#6f9db2'], [0.88, '#bcd6df'], [1, '#f5f8f7']]),
  build('viridis', 'Viridis', [
    [0, '#440154'], [0.13, '#482878'], [0.25, '#3e4989'], [0.38, '#31688e'], [0.5, '#26828e'],
    [0.63, '#1f9e89'], [0.75, '#35b779'], [0.88, '#6ece58'], [1, '#fde725'],
  ]),
  build('magma', 'Magma', [
    [0, '#000004'], [0.13, '#1c1044'], [0.25, '#4f127b'], [0.38, '#812581'], [0.5, '#b5367a'],
    [0.63, '#e55064'], [0.75, '#fb8761'], [0.88, '#fec287'], [1, '#fcfdbf'],
  ]),
  build('diverging', 'Diverging', [[0, '#21405f'], [0.25, '#6d8fa8'], [0.5, '#efebe3'], [0.75, '#c9845d'], [1, '#7c2f14']]),
];

const BY_ID = new Map(ALL.map(c => [c.id, c]));

export function getColormap(id: ColormapId): Colormap {
  return BY_ID.get(id) ?? ALL[0];
}

export function getAllColormaps(): readonly Colormap[] {
  return ALL;
}

/** Index into a 256-entry table for a value between lo and hi. */
export function colorIndex(value: number, lo: number, hi: number): number {
  const r = hi - lo;
  if (!(r > 0)) return 0;
  const t = (value - lo) / r;
  return t <= 0 ? 0 : t >= 1 ? 255 : (t * 255 + 0.5) | 0;
}

/** CSS gradient for legends and swatches. */
export function colormapCss(id: ColormapId, direction = 'to right'): string {
  const c = getColormap(id);
  const stops: string[] = [];
  for (let i = 0; i <= 8; i++) {
    const k = Math.round((i / 8) * 255) * 4;
    stops.push(`rgb(${c.rgba[k]} ${c.rgba[k + 1]} ${c.rgba[k + 2]}) ${(i / 8) * 100}%`);
  }
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}
