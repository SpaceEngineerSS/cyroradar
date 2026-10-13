/* Bright basal reflection scan.
 *
 * Follows the reasoning of Orosei et al. (2018): compare a subsurface echo with
 * the surface echo of the same trace, undo the known losses, and ask what
 * reflectivity the interface must have.
 *
 * For each trace, with powers in dB:
 *
 *   R_b = (P_b − P_s) + R_s − 10·log10(T_s²) + L
 *
 *   R_s   surface reflectivity for the assumed overburden ε  (Fresnel, vacuum → ε)
 *   T_s²  two-way transmission through the surface
 *   L     two-way dielectric loss down to the echo  (attenuation.ts)
 *
 * The candidate with the largest R_b below `minDepthM` is kept if it clears the
 * threshold and stands at least 10 dB above the noise floor. R_b is then
 * inverted for the permittivity under the interface.
 *
 *   Orosei et al. (2018), Science 361, 490–493
 *   Lauro et al. (2021), Nature Astronomy 5, 63–70
 *   Bierson et al. (2021), GRL 48, e2021GL093880 */

import type { AnomalyResult, AnomalyClass, CryoDataset, CRISMPixel, DetectionParams } from '../../types/types';
import { fresnelReflection, invertFresnel } from '../physics/fresnel';
import { lossDbPerMeter } from '../physics/attenuation';
import { timeToDepth, depthToTime, type VelocityLayer } from '../physics/depth-conversion';
import { computeHypothesisMatrix } from './hypothesis-engine';

export const DEFAULT_DETECTION: DetectionParams = {
  thresholdDb: -10,
  hostPermittivity: 3.15,
  hostLossTangent: 2e-3,
  minDepthM: 30,
};

export const CLUTTER_SLOPE_DEG = 2;
const MIN_SNR_DB = 10;
const PEAK_HALF_WINDOW = 3;

export const CLASS_LABELS: Record<AnomalyClass, string> = {
  'dry-contact': 'Dry contact',
  hydrated: 'Hydrated or clay-bearing',
  'wet-sediment': 'Wet sediment',
  'liquid-water': 'Liquid water or brine',
};

export function classifyAnomaly(eps: number): AnomalyClass {
  if (eps >= 25) return 'liquid-water';
  if (eps >= 15) return 'wet-sediment';
  if (eps >= 6) return 'hydrated';
  return 'dry-contact';
}

/** Median of the deepest rows: those samples are below every echo in practice. */
export function estimateNoiseFloorDb(data: Float32Array, width: number, height: number): number {
  const rows = Math.max(4, Math.floor(height * 0.06));
  const vals: number[] = [];
  const stepT = Math.max(1, Math.floor(width / 256));
  for (let s = height - rows; s < height; s++) {
    for (let t = 0; t < width; t += stepT) vals.push(data[s * width + t]);
  }
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)] ?? -60;
}

export function surfaceSlopesDeg(elevation: Float32Array, width: number, spacingM: number): Float32Array {
  const slopes = new Float32Array(width);
  if (width < 2 || elevation.length < width) return slopes;
  for (let i = 0; i < width; i++) {
    const a = elevation[Math.max(0, i - 1)];
    const b = elevation[Math.min(width - 1, i + 1)];
    const span = (Math.min(width - 1, i + 1) - Math.max(0, i - 1)) * spacingM;
    slopes[i] = (Math.abs(Math.atan2(b - a, span)) * 180) / Math.PI;
  }
  return slopes;
}

export function scanForBrightReflections(
  dataset: CryoDataset,
  params: DetectionParams = DEFAULT_DETECTION,
  layers: readonly VelocityLayer[] = [],
  crism: CRISMPixel[] | null = null,
): AnomalyResult[] {
  const { radargram, surfaceEcho, geometry, metadata } = dataset;
  const { width, height, data, sampleInterval, traceSpacingM } = radargram;
  const eh = Math.max(1, params.hostPermittivity);
  const freq = metadata.frequencyHz;

  const surface = fresnelReflection(1, eh);
  const surfaceTermDb = surface.reflectionDb - 10 * Math.log10(surface.transmissionCoefficient ** 2);
  const lossPerM = 2 * lossDbPerMeter(freq, eh, Math.max(0, params.hostLossTangent));
  const noiseDb = estimateNoiseFloorDb(data, width, height);
  const slopes = surfaceSlopesDeg(geometry.surfaceElevation, width, traceSpacingM);
  const minDelaySamples = depthToTime(params.minDepthM, layers, eh) / sampleInterval;

  const results: AnomalyResult[] = [];

  for (let t = 0; t < width; t++) {
    // Re-centre the surface pick on the local maximum.
    let s0 = surfaceEcho.indices[t] ?? 0;
    let ps = data[s0 * width + t];
    for (let s = Math.max(0, s0 - 3); s <= Math.min(height - 1, s0 + 3); s++) {
      const v = data[s * width + t];
      if (v > ps) {
        ps = v;
        s0 = s;
      }
    }
    if (ps - noiseDb < MIN_SNR_DB) continue;

    const start = Math.ceil(s0 + Math.max(minDelaySamples, 2));
    let best: { s: number; pb: number; rb: number; depth: number } | null = null;

    for (let s = start + PEAK_HALF_WINDOW; s < height - PEAK_HALF_WINDOW; s++) {
      const v = data[s * width + t];
      if (v - noiseDb < MIN_SNR_DB) continue;
      let isPeak = true;
      for (let w = 1; w <= PEAK_HALF_WINDOW; w++) {
        if (v < data[(s - w) * width + t] || v < data[(s + w) * width + t]) {
          isPeak = false;
          break;
        }
      }
      if (!isPeak) continue;
      const depth = timeToDepth((s - s0) * sampleInterval, layers, eh);
      const rb = v - ps + surfaceTermDb + lossPerM * depth;
      if (!best || rb > best.rb) best = { s, pb: v, rb, depth };
    }

    if (!best || best.rb < params.thresholdDb) continue;

    const apparentPermittivity = invertFresnel(10 ** (best.rb / 10), eh);
    if (!Number.isFinite(apparentPermittivity)) continue;

    const snrDb = best.pb - noiseDb;
    const slope = slopes[t];
    const crismPixel = crism && t < crism.length ? crism[t] : null;
    const confidence =
      (1 / (1 + Math.exp(-(snrDb - 15) / 4))) * (1 / (1 + Math.exp(-(best.rb - params.thresholdDb) / 1.5)));

    results.push({
      traceIndex: t,
      sampleIndex: best.s,
      surfacePowerDb: ps,
      basalPowerDb: best.pb,
      relativePowerDb: best.pb - ps,
      basalReflectivityDb: best.rb,
      apparentPermittivity,
      classification: classifyAnomaly(apparentPermittivity),
      depthM: best.depth,
      latitude: geometry.latitudes[t] ?? 0,
      longitude: geometry.longitudes[t] ?? 0,
      snrDb,
      confidence,
      clutterWarning: slope > CLUTTER_SLOPE_DEG,
      surfaceSlopeDeg: slope,
      hypothesis: computeHypothesisMatrix({ apparentPermittivity, surfaceSlopeDeg: slope, depthM: best.depth, crism: crismPixel }),
    });
  }

  return results;
}

/** Contiguous runs of detections, which is how people actually talk about them. */
export interface DetectionSegment {
  id: number;
  traceStart: number;
  traceEnd: number;
  count: number;
  meanDepthM: number;
  meanPermittivity: number;
  peakReflectivityDb: number;
  meanConfidence: number;
  classification: AnomalyClass;
  dominantHypothesis: AnomalyResult['hypothesis']['dominantHypothesis'];
  clutterFraction: number;
  /** Index into the detection array of the strongest member. */
  representative: number;
}

export function groupDetections(anomalies: readonly AnomalyResult[], maxGap = 3): DetectionSegment[] {
  const segments: DetectionSegment[] = [];
  let i = 0;
  while (i < anomalies.length) {
    let j = i;
    while (j + 1 < anomalies.length && anomalies[j + 1].traceIndex - anomalies[j].traceIndex <= maxGap + 1) j++;
    const members = anomalies.slice(i, j + 1);
    let rep = i;
    let depth = 0;
    let eps = 0;
    let conf = 0;
    let clutter = 0;
    const votes = { 'liquid-water': 0, 'smectite-clay': 0, clutter: 0 };
    for (let k = i; k <= j; k++) {
      const a = anomalies[k];
      if (a.basalReflectivityDb > anomalies[rep].basalReflectivityDb) rep = k;
      depth += a.depthM;
      eps += a.apparentPermittivity;
      conf += a.confidence;
      if (a.clutterWarning) clutter++;
      votes[a.hypothesis.dominantHypothesis]++;
    }
    const n = members.length;
    const meanPermittivity = eps / n;
    const dominantHypothesis = (Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]) as DetectionSegment['dominantHypothesis'];
    segments.push({
      id: segments.length,
      traceStart: anomalies[i].traceIndex,
      traceEnd: anomalies[j].traceIndex,
      count: n,
      meanDepthM: depth / n,
      meanPermittivity,
      peakReflectivityDb: anomalies[rep].basalReflectivityDb,
      meanConfidence: conf / n,
      classification: classifyAnomaly(meanPermittivity),
      dominantHypothesis,
      clutterFraction: clutter / n,
      representative: rep,
    });
    i = j + 1;
  }
  return segments;
}
