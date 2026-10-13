/* Kirchhoff (diffraction-stack) migration of the below-surface section.
 *
 * Orbital radargrams are already SAR-focused for the vacuum path, so we only
 * migrate what lies under the surface echo. Each trace's surface row is its
 * datum. For an output point at delay τ below the surface of trace x, the
 * scatterer depth is z = V_rms(τ)·τ/2 and a neighbouring trace x_s sees it at
 *
 *   τ_s = 2·√(z² + (x − x_s)²) / V_rms(τ)
 *
 * Amplitudes (not dB) are summed along that hyperbola with an obliquity weight
 * cos θ = z / r, inside an aperture limited by a maximum angle, and the sum is
 * normalised by the total weight so edges are not dimmed.
 *
 * Radargrams are detected power without phase, so this is an incoherent
 * migration: it collapses diffraction tails and sharpens dipping reflectors,
 * but it cannot do what coherent migration of complex data does.
 *
 *   Schneider (1978), Geophysics 43(1), 49–76
 *   Yilmaz (2001), Seismic Data Analysis, SEG, ch. 4 */

import type { RadargramData } from '../../types/types';

export interface MigrationParams {
  /** RMS velocity per sample of delay below the surface (from buildVRMSProfile). */
  vrms: Float32Array;
  maxAngleDeg: number;
  maxApertureTraces: number;
}

export interface MigrationOutput {
  data: Float32Array;
  powerMin: number;
  powerMax: number;
}

export function migrate(
  radargram: RadargramData,
  surface: Uint16Array,
  params: MigrationParams,
  onProgress?: (fraction: number) => void,
): MigrationOutput {
  const { width: W, height: H, data, sampleInterval: dt, traceSpacingM: dx } = radargram;
  const amp = new Float32Array(W * H);
  for (let i = 0; i < amp.length; i++) amp[i] = 10 ** (data[i] / 20);

  const out = new Float32Array(W * H);
  const tanMax = Math.tan((Math.min(80, Math.max(1, params.maxAngleDeg)) * Math.PI) / 180);
  const floor = 10 ** (radargram.powerMin / 20);

  for (let x = 0; x < W; x++) {
    const s0 = surface[x];
    // Above and at the surface: copy through.
    for (let r = 0; r <= Math.min(H - 1, s0); r++) out[r * W + x] = amp[r * W + x];

    for (let r = s0 + 1; r < H; r++) {
      const k = r - s0;
      const v = params.vrms[Math.min(params.vrms.length - 1, k)];
      const tau = k * dt;
      const z = (v * tau) / 2;
      const aperture = Math.min(params.maxApertureTraces, Math.floor((z * tanMax) / dx));
      let sum = 0;
      let wsum = 0;
      for (let xs = Math.max(0, x - aperture); xs <= Math.min(W - 1, x + aperture); xs++) {
        const off = (x - xs) * dx;
        const dist = Math.sqrt(z * z + off * off);
        const row = surface[xs] + (2 * dist) / v / dt;
        if (row < 0 || row >= H - 1) continue;
        const r0 = Math.floor(row);
        const f = row - r0;
        const a = amp[r0 * W + xs] * (1 - f) + amp[(r0 + 1) * W + xs] * f;
        const w = dist > 0 ? z / dist : 1;
        sum += a * w;
        wsum += w;
      }
      out[r * W + x] = wsum > 0 ? sum / wsum : floor;
    }
    if (onProgress && x % 32 === 0) onProgress(x / W);
  }

  let powerMin = Infinity;
  let powerMax = -Infinity;
  for (let i = 0; i < out.length; i++) {
    const db = 20 * Math.log10(Math.max(out[i], floor));
    out[i] = db;
    if (db < powerMin) powerMin = db;
    if (db > powerMax) powerMax = db;
  }
  onProgress?.(1);
  return { data: out, powerMin, powerMax };
}
