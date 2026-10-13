import { describe, it, expect } from 'vitest';
import { computeHypothesisMatrix } from './hypothesis-engine';
import { classifyAnomaly, groupDetections, surfaceSlopesDeg } from './anomaly-detector';
import { runUncertainty } from './uncertainty';
import { migrate } from './migration';
import type { AnomalyResult } from '../../types/types';

describe('hypothesis engine', () => {
  const base = { apparentPermittivity: 35, surfaceSlopeDeg: 0.3, depthM: 1400 };
  it('probabilities sum to one', () => {
    const h = computeHypothesisMatrix(base);
    expect(h.pLiquidWater + h.pSmectiteClay + h.pClutter).toBeCloseTo(1, 10);
  });
  it('favours water for a deep, flat, very bright reflector', () => {
    expect(computeHypothesisMatrix(base).dominantHypothesis).toBe('liquid-water');
  });
  it('clay evidence lowers the water probability', () => {
    const none = computeHypothesisMatrix({ ...base, crism: { clayIndex: 0, hydrationIndex: 0.2, mineralClass: 'none' } });
    const clay = computeHypothesisMatrix({ ...base, crism: { clayIndex: 0.9, hydrationIndex: 0.8, mineralClass: 'phyllosilicate' } });
    expect(clay.pLiquidWater).toBeLessThan(none.pLiquidWater);
    expect(clay.pSmectiteClay).toBeGreaterThan(none.pSmectiteClay);
  });
  it('slope raises the clutter probability', () => {
    expect(computeHypothesisMatrix({ ...base, surfaceSlopeDeg: 6 }).pClutter).toBeGreaterThan(computeHypothesisMatrix(base).pClutter);
  });
  it('a clay-range permittivity favours clay', () => {
    expect(computeHypothesisMatrix({ ...base, apparentPermittivity: 13 }).dominantHypothesis).toBe('smectite-clay');
  });
});

describe('detection helpers', () => {
  it('classifies across all four classes', () => {
    expect(classifyAnomaly(4)).toBe('dry-contact');
    expect(classifyAnomaly(10)).toBe('hydrated');
    expect(classifyAnomaly(20)).toBe('wet-sediment');
    expect(classifyAnomaly(60)).toBe('liquid-water');
  });
  it('computes slopes without NaN, even for one trace', () => {
    expect(Array.from(surfaceSlopesDeg(new Float32Array([5]), 1, 460))).toEqual([0]);
    const s = surfaceSlopesDeg(new Float32Array([0, 46, 92]), 3, 460);
    expect(s[1]).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 5);
  });
  it('groups neighbouring traces into segments', () => {
    const a = (t: number) =>
      ({
        traceIndex: t, depthM: 100, apparentPermittivity: 30, confidence: 0.9, basalReflectivityDb: -5, clutterWarning: false,
        hypothesis: { dominantHypothesis: 'liquid-water' },
      }) as AnomalyResult;
    const segs = groupDetections([a(1), a(2), a(4), a(20), a(21)]);
    expect(segs.map(s => [s.traceStart, s.traceEnd])).toEqual([[1, 4], [20, 21]]);
  });
});

describe('uncertainty', () => {
  it('brackets the input depth and reports a probability of wet basal material', () => {
    const a = { depthM: 1400, relativePowerDb: -4, apparentPermittivity: 35 } as AnomalyResult;
    const [r] = runUncertainty(
      [a],
      { thresholdDb: -10, hostPermittivity: 3.3, hostLossTangent: 4e-3, minDepthM: 30 },
      4e6,
      1e-7,
      { nSamples: 3000, permittivitySigma: 0.2, powerSigmaDb: 1.5 },
    );
    expect(r.percentile5).toBeLessThan(1400);
    expect(r.percentile95).toBeGreaterThan(1400);
    expect(r.pWet).toBeGreaterThan(0.5);
    expect(r.basalPermittivity5).toBeLessThan(r.meanBasalPermittivity);
  });
});

describe('migration', () => {
  it('leaves a flat reflector in place and keeps the surface untouched', () => {
    const W = 40;
    const H = 80;
    const data = new Float32Array(W * H).fill(-60);
    const surface = new Uint16Array(W).fill(10);
    for (let t = 0; t < W; t++) {
      data[10 * W + t] = -10;
      data[50 * W + t] = -20;
    }
    const out = migrate(
      { width: W, height: H, data, sampleInterval: 37.5e-9, traceSpacingM: 460, powerMin: -60, powerMax: -10 },
      surface,
      { vrms: new Float32Array(H).fill(1.68e8), maxAngleDeg: 30, maxApertureTraces: 8 },
    );
    expect(out.data[10 * W + 20]).toBeCloseTo(-10, 4);
    let best = 11;
    for (let s = 11; s < H; s++) if (out.data[s * W + 20] > out.data[best * W + 20]) best = s;
    expect(best).toBe(50);
  });
});
