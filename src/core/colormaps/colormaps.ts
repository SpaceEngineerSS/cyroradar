/* CRYORADAR — Scientific Colormaps (v6.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Includes standard geophysical palettes for seismic/GPR
 * interpretation (Petrel/OpendTect compatible). */

import type { ColormapId } from '../../types/types';

export interface Colormap {
  id: ColormapId;
  name: string;
  data: Uint8Array;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildGradient(stops: { pos: number; r: number; g: number; b: number }[]): Uint8Array {
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let lo = stops[0], hi = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s].pos && t <= stops[s + 1].pos) {
        lo = stops[s];
        hi = stops[s + 1];
        break;
      }
    }
    const segT = hi.pos > lo.pos ? (t - lo.pos) / (hi.pos - lo.pos) : 0;
    out[i * 4] = Math.round(lerp(lo.r, hi.r, segT));
    out[i * 4 + 1] = Math.round(lerp(lo.g, hi.g, segT));
    out[i * 4 + 2] = Math.round(lerp(lo.b, hi.b, segT));
    out[i * 4 + 3] = 255;
  }
  return out;
}

const GRAYSCALE = buildGradient([
  { pos: 0, r: 0, g: 0, b: 0 },
  { pos: 1, r: 255, g: 255, b: 255 },
]);

const PLASMA = buildGradient([
  { pos: 0.0, r: 13, g: 8, b: 135 },
  { pos: 0.15, r: 84, g: 2, b: 163 },
  { pos: 0.3, r: 139, g: 10, b: 165 },
  { pos: 0.45, r: 185, g: 50, b: 137 },
  { pos: 0.6, r: 219, g: 92, b: 104 },
  { pos: 0.75, r: 244, g: 136, b: 73 },
  { pos: 0.9, r: 254, g: 188, b: 43 },
  { pos: 1.0, r: 240, g: 249, b: 33 },
]);

const INFERNO = buildGradient([
  { pos: 0.0, r: 0, g: 0, b: 4 },
  { pos: 0.15, r: 40, g: 11, b: 84 },
  { pos: 0.3, r: 101, g: 21, b: 110 },
  { pos: 0.45, r: 159, g: 42, b: 99 },
  { pos: 0.6, r: 212, g: 72, b: 66 },
  { pos: 0.75, r: 245, g: 125, b: 21 },
  { pos: 0.9, r: 250, g: 193, b: 39 },
  { pos: 1.0, r: 252, g: 255, b: 164 },
]);

const VIRIDIS = buildGradient([
  { pos: 0.0, r: 68, g: 1, b: 84 },
  { pos: 0.15, r: 72, g: 36, b: 117 },
  { pos: 0.3, r: 56, g: 88, b: 140 },
  { pos: 0.45, r: 38, g: 130, b: 142 },
  { pos: 0.6, r: 31, g: 158, b: 137 },
  { pos: 0.75, r: 78, g: 195, b: 107 },
  { pos: 0.9, r: 163, g: 225, b: 57 },
  { pos: 1.0, r: 253, g: 231, b: 37 },
]);

const RADAR = buildGradient([
  { pos: 0.0, r: 0, g: 0, b: 10 },
  { pos: 0.2, r: 8, g: 20, b: 60 },
  { pos: 0.4, r: 20, g: 60, b: 140 },
  { pos: 0.55, r: 40, g: 120, b: 200 },
  { pos: 0.7, r: 100, g: 180, b: 230 },
  { pos: 0.85, r: 200, g: 220, b: 240 },
  { pos: 1.0, r: 255, g: 255, b: 255 },
]);

const SEISMIC = buildGradient([
  { pos: 0.0, r: 0, g: 0, b: 180 },
  { pos: 0.2, r: 60, g: 80, b: 220 },
  { pos: 0.4, r: 180, g: 200, b: 240 },
  { pos: 0.5, r: 255, g: 255, b: 255 },
  { pos: 0.6, r: 240, g: 200, b: 180 },
  { pos: 0.8, r: 220, g: 80, b: 60 },
  { pos: 1.0, r: 180, g: 0, b: 0 },
]);

const GPR = buildGradient([
  { pos: 0.0, r: 0, g: 30, b: 0 },
  { pos: 0.2, r: 20, g: 100, b: 20 },
  { pos: 0.4, r: 80, g: 170, b: 40 },
  { pos: 0.6, r: 200, g: 200, b: 40 },
  { pos: 0.8, r: 240, g: 140, b: 20 },
  { pos: 1.0, r: 200, g: 30, b: 10 },
]);

const ALL_COLORMAPS: Colormap[] = [
  { id: 'grayscale', name: 'Grayscale', data: GRAYSCALE },
  { id: 'plasma', name: 'Plasma', data: PLASMA },
  { id: 'inferno', name: 'Inferno', data: INFERNO },
  { id: 'viridis', name: 'Viridis', data: VIRIDIS },
  { id: 'radar', name: 'Radar Blue', data: RADAR },
  { id: 'seismic', name: 'Seismic (R-W-B)', data: SEISMIC },
  { id: 'gpr', name: 'GPR', data: GPR },
];

const colormapMap = new Map(ALL_COLORMAPS.map(c => [c.id, c]));

export function getColormap(id: ColormapId): Colormap {
  return colormapMap.get(id) ?? ALL_COLORMAPS[0];
}

export function getAllColormaps(): readonly Colormap[] {
  return ALL_COLORMAPS;
}

export function mapValueToColor(
  value: number,
  min: number,
  max: number,
  colormap: Uint8Array
): [number, number, number, number] {
  const range = max - min;
  const normalized = range > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0;
  const idx = Math.round(normalized * 255) * 4;
  return [colormap[idx], colormap[idx + 1], colormap[idx + 2], colormap[idx + 3]];
}
