/* Simulated CRISM context along the radar ground track.
 *
 * CRISM does not see below the surface, and its real coverage of the polar
 * caps is patchy. This module produces a plausible per-trace mineralogy context
 * (clay and hydration band-depth indices) so the hypothesis engine has the same
 * kind of input that Bierson et al. (2021) and Smith et al. (2021) used to argue
 * for clays. It is labelled as simulated everywhere it appears.
 *
 * Indices are driven by latitude (clays are more commonly reported in the
 * southern highlands and polar layered terrain margins), a smooth spatial field,
 * and a seed so a dataset always gets the same context.
 *
 *   Murchie et al. (2007), JGR 112, E05S03
 *   Ehlmann et al. (2011), Nature 479, 53–60 */

import type { CRISMPixel, GeometryData, MineralClass } from '../../types/types';
import { seededRandom, smoothProfile } from '../util/random';

function baseClay(lat: number): number {
  const a = Math.abs(lat);
  if (a > 75) return 0.45;
  if (a > 60) return 0.35;
  if (a > 40) return 0.22;
  return 0.12;
}

export function classifyMineral(clayIndex: number, hydrationIndex: number): MineralClass {
  if (clayIndex > 0.6 && hydrationIndex > 0.5) return 'phyllosilicate';
  if (clayIndex > 0.4 && hydrationIndex > 0.7) return 'hydrated-silica';
  if (hydrationIndex > 0.6 && clayIndex < 0.3) return 'sulfate';
  return 'none';
}

export function generateSyntheticCRISM(geometry: GeometryData, traceCount: number, seed = 42): CRISMPixel[] {
  const rng = seededRandom(seed);
  const field = smoothProfile(traceCount, rng, 6);
  const hydField = smoothProfile(traceCount, rng, 4);
  const pixels: CRISMPixel[] = [];
  for (let i = 0; i < traceCount; i++) {
    const clay = Math.min(1, Math.max(0, baseClay(geometry.latitudes[i] ?? 0) + 0.18 * field[i] + (rng() - 0.5) * 0.08));
    const hyd = Math.min(1, Math.max(0, 0.15 + 0.65 * clay + 0.12 * hydField[i] + (rng() - 0.5) * 0.08));
    pixels.push({ clayIndex: clay, hydrationIndex: hyd, mineralClass: classifyMineral(clay, hyd) });
  }
  return pixels;
}

export function summarizeCRISM(pixels: readonly CRISMPixel[]) {
  const counts: Record<MineralClass, number> = { none: 0, phyllosilicate: 0, sulfate: 0, 'hydrated-silica': 0 };
  let clay = 0;
  let hyd = 0;
  for (const p of pixels) {
    counts[p.mineralClass]++;
    clay += p.clayIndex;
    hyd += p.hydrationIndex;
  }
  const n = Math.max(1, pixels.length);
  return { counts, meanClay: clay / n, meanHydration: hyd / n };
}
