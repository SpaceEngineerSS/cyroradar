/* CRYORADAR — Topographic Static Correction Engine
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Aligns all radar traces to a common surface datum by computing
 * per-trace vertical time-shifts from MOLA surface echo indices.
 *
 * Without static correction, the radargram surface echo appears
 * at different sample positions per trace due to varying spacecraft
 * altitude and surface topography. This misalignment invalidates
 * SAR migration geometry.
 *
 * Algorithm (first principles):
 *   1. datumIdx = median(surfaceEchoIdx[0..N])
 *   2. shift[t] = surfaceEchoIdx[t] − datumIdx
 *   3. For each trace, shift samples vertically by shift[t]
 *   4. Boundary handling: zero-fill (no wrap)
 *
 * Energy conservation: Σ|corrected| ≈ Σ|original| within ε for
 * samples lost at boundaries due to shifting.
 *
 * References:
 *   Yilmaz (2001), Seismic Data Analysis, SEG — Ch. 3 (Statics)
 *   Heggy et al. (2006), JGR 111, E06S02 */

import type { RadargramData, SurfaceEchoData } from '../../types/types';

export interface StaticCorrectionResult {
  correctedData: Float32Array;
  shifts: Int16Array;
  datumIdx: number;
  energyBefore: number;
  energyAfter: number;
}

function medianUint16(arr: Uint16Array): number {
  const sorted = Array.from(arr).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function computeStaticCorrection(
  radargram: RadargramData,
  surfaceEcho: SurfaceEchoData
): StaticCorrectionResult {
  const { width, height, data } = radargram;
  const correctedData = new Float32Array(width * height);
  const shifts = new Int16Array(width);

  const datumIdx = medianUint16(surfaceEcho.indices);

  let energyBefore = 0;
  let energyAfter = 0;

  for (let t = 0; t < width; t++) {
    const shift = surfaceEcho.indices[t] - datumIdx;
    shifts[t] = shift;

    for (let s = 0; s < height; s++) {
      const srcVal = data[s * width + t];
      energyBefore += Math.abs(srcVal);

      const dstS = s - shift;
      if (dstS >= 0 && dstS < height) {
        correctedData[dstS * width + t] = srcVal;
        energyAfter += Math.abs(srcVal);
      }
    }
  }

  return { correctedData, shifts, datumIdx, energyBefore, energyAfter };
}
