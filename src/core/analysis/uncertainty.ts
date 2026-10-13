/* Monte Carlo propagation of the uncertain inputs behind each detection.
 *
 * Inputs drawn per sample:
 *   ε_h    overburden permittivity        ~ N(ε̂_h, σ_ε)
 *   tanδ   overburden loss tangent        ~ logN(tanδ̂, σ_log = 0.5)
 *   Δt     round-trip delay               ~ N(Δt̂, (½ sample)²)
 *   ΔP     basal − surface power          ~ N(ΔP̂, σ_P)
 *
 * Each sample re-runs the same chain as the detector: depth from Δt and ε_h,
 * two-way loss, surface correction, and Fresnel inversion for ε_b. The result
 * is a depth interval and a basal-permittivity interval, plus the fraction of
 * samples where ε_b ≥ 25 (the "liquid water or brine" class).
 *
 * Uses a fixed seed so a rerun gives the same numbers. */

import type { AnomalyResult, DetectionParams, UQResult } from '../../types/types';
import { SPEED_OF_LIGHT } from '../physics/constants';
import { fresnelReflection, invertFresnel } from '../physics/fresnel';
import { lossDbPerMeter } from '../physics/attenuation';
import { seededRandom, gaussian } from '../util/random';

export interface UQSettings {
  nSamples: number;
  permittivitySigma: number;
  powerSigmaDb: number;
}

export const DEFAULT_UQ: UQSettings = { nSamples: 2000, permittivitySigma: 0.25, powerSigmaDb: 1.5 };

export const WET_PERMITTIVITY = 25;

function quantile(sorted: Float64Array, q: number): number {
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function runUncertainty(
  anomalies: readonly AnomalyResult[],
  detection: DetectionParams,
  frequencyHz: number,
  sampleIntervalS: number,
  settings: UQSettings = DEFAULT_UQ,
  onProgress?: (fraction: number) => void,
): UQResult[] {
  const N = Math.max(200, Math.min(20000, Math.round(settings.nSamples)));
  const rng = seededRandom(0x5eed);
  const out: UQResult[] = [];
  const depths = new Float64Array(N);
  const basal = new Float64Array(N);

  for (let ai = 0; ai < anomalies.length; ai++) {
    const a = anomalies[ai];
    const eh0 = detection.hostPermittivity;
    // Delay is recovered from the reported depth with the same constant-ε model the detector used.
    const dt0 = (2 * a.depthM * Math.sqrt(eh0)) / SPEED_OF_LIGHT;
    let wet = 0;

    for (let k = 0; k < N; k++) {
      const eh = Math.max(1.05, eh0 + settings.permittivitySigma * gaussian(rng));
      const tan = Math.max(0, detection.hostLossTangent * Math.exp(0.5 * gaussian(rng)));
      const dt = Math.max(0, dt0 + 0.5 * sampleIntervalS * gaussian(rng));
      const dP = a.relativePowerDb + settings.powerSigmaDb * gaussian(rng);

      const depth = (dt * SPEED_OF_LIGHT) / (2 * Math.sqrt(eh));
      const s = fresnelReflection(1, eh);
      const rb = dP + s.reflectionDb - 10 * Math.log10(s.transmissionCoefficient ** 2) + 2 * lossDbPerMeter(frequencyHz, eh, tan) * depth;
      const eb = invertFresnel(10 ** (rb / 10), eh);
      depths[k] = depth;
      basal[k] = eb;
      if (eb >= WET_PERMITTIVITY) wet++;
    }

    let mean = 0;
    for (let k = 0; k < N; k++) mean += depths[k];
    mean /= N;
    let v = 0;
    for (let k = 0; k < N; k++) v += (depths[k] - mean) ** 2;
    let meanEb = 0;
    for (let k = 0; k < N; k++) meanEb += basal[k];
    meanEb /= N;

    depths.sort();
    basal.sort();
    out.push({
      anomalyIndex: ai,
      meanDepthM: mean,
      stdDevM: Math.sqrt(v / (N - 1)),
      percentile5: quantile(depths, 0.05),
      percentile95: quantile(depths, 0.95),
      meanBasalPermittivity: meanEb,
      basalPermittivity5: quantile(basal, 0.05),
      basalPermittivity95: quantile(basal, 0.95),
      pWet: wet / N,
      nSamples: N,
    });
    if (onProgress && (ai % 8 === 0 || ai === anomalies.length - 1)) onProgress((ai + 1) / anomalies.length);
  }
  return out;
}
