/* Topographic static correction.
 *
 * Shifts every trace so its surface echo lands on a common datum row (the
 * median surface row). Samples shifted in from outside the window are filled
 * with the radargram's minimum, which is the noise floor in dB data.
 *
 * Flattening the surface makes layer continuity easier to judge by eye and is
 * the expected input geometry for migration.
 *
 *   Yilmaz (2001), Seismic Data Analysis, SEG, ch. 3 */

import type { RadargramData, SurfaceEchoData } from '../../types/types';

export interface StaticCorrectionResult {
  correctedData: Float32Array;
  shifts: Int16Array;
  datumIdx: number;
  /** Surface rows after correction (all equal to the datum where in range). */
  correctedSurface: Uint16Array;
}

function median(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function computeStaticCorrection(radargram: RadargramData, surfaceEcho: SurfaceEchoData): StaticCorrectionResult {
  const { width, height, data, powerMin } = radargram;
  const correctedData = new Float32Array(width * height).fill(powerMin);
  const shifts = new Int16Array(width);
  const correctedSurface = new Uint16Array(width);
  const datumIdx = median(surfaceEcho.indices.subarray(0, width));

  for (let t = 0; t < width; t++) {
    const surf = t < surfaceEcho.indices.length ? surfaceEcho.indices[t] : datumIdx;
    const shift = surf - datumIdx;
    shifts[t] = shift;
    correctedSurface[t] = Math.max(0, Math.min(height - 1, surf - shift));
    for (let s = 0; s < height; s++) {
      const src = s + shift;
      if (src >= 0 && src < height) correctedData[s * width + t] = data[src * width + t];
    }
  }
  return { correctedData, shifts, datumIdx, correctedSurface };
}
