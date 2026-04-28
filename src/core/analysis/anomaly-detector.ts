/* CRYORADAR — Anomaly Detection Engine (v4.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Implements the Bright Basal Reflection (BBR) methodology from:
 *   Orosei, R. et al. (2018). "Radar evidence of subglacial liquid water on Mars."
 *   Science 361, 490–493. DOI: 10.1126/science.aar7268
 *
 * v4.0 additions:
 *   - Surface slope analysis from MOLA ∂h/∂x (Bierson et al. 2021 clutter critique)
 *   - Bayesian hypothesis matrix: P(Water) vs P(Smectite) vs P(Clutter)
 *   - Clutter warnings for slopes > 2°
 *
 * Detection pipeline:
 *   1. Extract surface echo power P_s from upper 20% of each trace
 *   2. Scan lower 50% for basal reflection peaks P_b
 *   3. Compute ratio: ρ = P_b / P_s
 *   4. Compute surface slope from MOLA elevation derivative
 *   5. If ρ > threshold → run Fresnel inversion for apparent ε
 *   6. Run Bayesian hypothesis engine for each detection
 *   7. Classify interface material + flag clutter
 *
 * References:
 *   Orosei et al. (2018), Science 361, 490–493
 *   Bierson et al. (2021), GRL 48, e2021GL093880
 *   Lauro et al. (2021), Nature Astronomy 5, 63–70
 *   Stillman et al. (2010), JGR 115, E09005 */

import type { AnomalyResult, AnomalyClass, CryoDataset, CRISMPixel } from '../../types/types';
import { SPEED_OF_LIGHT } from '../physics/constants';
import { computeHypothesisMatrix } from './hypothesis-engine';

const DEFAULT_RATIO_THRESHOLD = 0.35;
const SURFACE_FRACTION = 0.2;
const BASAL_START_FRACTION = 0.5;
const PEAK_HALFWINDOW = 8;
const MIN_CONFIDENCE = 0.15;
const CLUTTER_SLOPE_THRESHOLD_DEG = 2.0;

export function classifyAnomaly(apparentPermittivity: number): AnomalyClass {
  if (apparentPermittivity >= 40) return 'liquid-water';
  if (apparentPermittivity >= 15) return 'wet-sediment';
  if (apparentPermittivity >= 5) return 'ice-deposit';
  return 'geological-interface';
}

function fresnelInvertPermittivity(
  powerRatio: number,
  hostPermittivity: number
): number {
  const clampedR = Math.max(0.001, Math.min(0.999, powerRatio));
  const sqrtR = Math.sqrt(clampedR);
  const sqrtEpsHost = Math.sqrt(hostPermittivity);
  const sqrtEpsTarget = sqrtEpsHost * (1 + sqrtR) / Math.max(1e-6, 1 - sqrtR);
  return Math.max(1.0, sqrtEpsTarget * sqrtEpsTarget);
}

function findLocalPeaks(
  trace: Float32Array | number[],
  startIdx: number,
  endIdx: number,
  halfWindow: number
): { index: number; power: number }[] {
  const peaks: { index: number; power: number }[] = [];
  for (let i = startIdx + halfWindow; i < endIdx - halfWindow; i++) {
    const val = typeof trace[i] === 'number' ? trace[i] : 0;
    let isMax = true;
    for (let w = 1; w <= halfWindow; w++) {
      const left = typeof trace[i - w] === 'number' ? trace[i - w] : 0;
      const right = typeof trace[i + w] === 'number' ? trace[i + w] : 0;
      if (val <= left || val <= right) {
        isMax = false;
        break;
      }
    }
    if (isMax) peaks.push({ index: i, power: val });
  }
  peaks.sort((a, b) => b.power - a.power);
  return peaks;
}

function computeSurfaceSlopes(
  elevations: Float32Array,
  traceCount: number,
  traceSpacingM: number
): Float32Array {
  const slopes = new Float32Array(traceCount);
  for (let i = 1; i < traceCount - 1; i++) {
    const dh = elevations[i + 1] - elevations[i - 1];
    const dx = 2 * traceSpacingM;
    slopes[i] = Math.abs(Math.atan2(dh, dx)) * (180 / Math.PI);
  }
  slopes[0] = slopes[1];
  slopes[traceCount - 1] = slopes[traceCount - 2];
  return slopes;
}

export function scanForBrightReflections(
  dataset: CryoDataset,
  ratioThreshold: number = DEFAULT_RATIO_THRESHOLD,
  hostPermittivity: number = 3.15,
  crismData: CRISMPixel[] | null = null,
  traceSpacingM: number = 300
): AnomalyResult[] {
  const { radargram, surfaceEcho, geometry } = dataset;
  const { width, height, data, sampleInterval } = radargram;
  const results: AnomalyResult[] = [];

  const surfaceBound = Math.floor(height * SURFACE_FRACTION);
  const basalStart = Math.floor(height * BASAL_START_FRACTION);
  const slopes = computeSurfaceSlopes(geometry.surfaceElevation, width, traceSpacingM);

  for (let t = 0; t < width; t++) {
    let surfacePower = -Infinity;
    let surfaceSample = 0;
    for (let s = 0; s < surfaceBound; s++) {
      const val = data[s * width + t];
      if (val > surfacePower) {
        surfacePower = val;
        surfaceSample = s;
      }
    }

    if (surfacePower <= 0) continue;

    const traceSlice: number[] = [];
    for (let s = basalStart; s < height; s++) {
      traceSlice.push(data[s * width + t]);
    }

    const peaks = findLocalPeaks(
      traceSlice, 0, traceSlice.length, PEAK_HALFWINDOW
    );

    for (const peak of peaks.slice(0, 3)) {
      const basalPower = peak.power;
      const ratio = basalPower / surfacePower;

      if (ratio < ratioThreshold) continue;

      const basalSampleAbsolute = basalStart + peak.index;
      const apparentEps = fresnelInvertPermittivity(ratio, hostPermittivity);

      if (!isFinite(apparentEps) || apparentEps < 1) continue;

      const depthSamples = basalSampleAbsolute - (surfaceEcho.indices[t] ?? surfaceSample);
      const depthM = Math.max(0, (depthSamples * sampleInterval * SPEED_OF_LIGHT) / (2 * Math.sqrt(hostPermittivity)));

      const noiseFloor = surfacePower * 0.05;
      const snr = basalPower / Math.max(noiseFloor, 1e-10);
      const confidence = Math.min(1, Math.max(MIN_CONFIDENCE, 1 - 1 / (1 + Math.log10(snr))));

      const slopeDeg = Math.round(slopes[t] * 100) / 100;
      const clutterWarning = slopeDeg > CLUTTER_SLOPE_THRESHOLD_DEG;

      const crismPixel = crismData && t < crismData.length ? crismData[t] : null;
      const hypothesis = computeHypothesisMatrix(
        apparentEps, ratio, slopeDeg, depthM, crismPixel
      );

      results.push({
        traceIndex: t,
        sampleIndex: basalSampleAbsolute,
        surfacePower,
        basalPower,
        powerRatio: ratio,
        apparentPermittivity: Math.round(apparentEps * 100) / 100,
        classification: classifyAnomaly(apparentEps),
        depthM: Math.round(depthM * 10) / 10,
        latitude: geometry.latitudes[t] ?? 0,
        longitude: geometry.longitudes[t] ?? 0,
        confidence: Math.round(confidence * 1000) / 1000,
        clutterWarning,
        surfaceSlopeDeg: slopeDeg,
        hypothesis,
      });
      break;
    }
  }

  return results;
}

export function computeAnomalyHeatmap(
  anomalies: AnomalyResult[],
  width: number
): Float32Array {
  const heatmap = new Float32Array(width);
  for (const a of anomalies) {
    if (a.traceIndex >= 0 && a.traceIndex < width) {
      heatmap[a.traceIndex] = a.powerRatio;
    }
  }
  return heatmap;
}

export function summarizeAnomalies(anomalies: AnomalyResult[]): {
  total: number;
  byClass: Record<AnomalyClass, number>;
  strongestBBR: AnomalyResult | null;
  meanDepth: number;
  clutterCount: number;
  hypothesisSummary: { water: number; clay: number; clutter: number };
} {
  const byClass: Record<AnomalyClass, number> = {
    'geological-interface': 0,
    'ice-deposit': 0,
    'wet-sediment': 0,
    'liquid-water': 0,
  };

  let strongestBBR: AnomalyResult | null = null;
  let depthSum = 0;
  let clutterCount = 0;
  let hWater = 0, hClay = 0, hClutter = 0;

  for (const a of anomalies) {
    byClass[a.classification]++;
    depthSum += a.depthM;
    if (a.clutterWarning) clutterCount++;

    if (a.hypothesis.dominantHypothesis === 'liquid-water') hWater++;
    else if (a.hypothesis.dominantHypothesis === 'smectite-clay') hClay++;
    else hClutter++;

    if (a.classification === 'liquid-water') {
      if (!strongestBBR || a.powerRatio > strongestBBR.powerRatio) {
        strongestBBR = a;
      }
    }
  }

  return {
    total: anomalies.length,
    byClass,
    strongestBBR,
    meanDepth: anomalies.length > 0 ? depthSum / anomalies.length : 0,
    clutterCount,
    hypothesisSummary: { water: hWater, clay: hClay, clutter: hClutter },
  };
}
