import { describe, it, expect } from 'vitest';
import { fresnelReflection, invertFresnel } from './fresnel';
import { lossDbPerMeter, attenuationNpPerMeter, twoWayLossDb } from './attenuation';
import { timeToDepth, depthToTime, sampleToDepth } from './depth-conversion';
import { computeRadarBudget, maxDetectableDepth, subsurfaceSnrDb, SHARAD_SPEC, MARSIS_SPEC } from './radar-equation';
import { waterIcePermittivity } from './dielectric-temperature';
import { SPEED_OF_LIGHT } from './constants';

describe('Fresnel', () => {
  it('matches the hand value for vacuum over water ice', () => {
    // ((1 − √3.15)/(1 + √3.15))² = (0.7748/2.7748)² = 0.0780
    expect(fresnelReflection(1, 3.15).reflectionCoefficient).toBeCloseTo(0.078, 3);
  });
  it('is symmetric and conserves energy', () => {
    const a = fresnelReflection(3.15, 80);
    const b = fresnelReflection(80, 3.15);
    expect(a.reflectionCoefficient).toBeCloseTo(b.reflectionCoefficient, 12);
    expect(a.reflectionCoefficient + a.transmissionCoefficient).toBeCloseTo(1, 12);
  });
  it('inverts back to the lower medium', () => {
    for (const eps of [4, 9, 35, 80]) expect(invertFresnel(fresnelReflection(3.3, eps).reflectionCoefficient, 3.3)).toBeCloseTo(eps, 6);
  });
});

describe('attenuation', () => {
  it('gives about 6.5 dB two-way per km of 20 MHz ice with tanδ = 1e-3', () => {
    expect(twoWayLossDb(20e6, [{ permittivity: 3.15, lossTangent: 1e-3, thicknessM: 1000 }])).toBeCloseTo(6.45, 1);
  });
  it('reduces to π f √ε tanδ / c for small losses', () => {
    const f = 20e6;
    const eps = 3.15;
    const tan = 1e-3;
    expect(attenuationNpPerMeter(f, eps, tan)).toBeCloseTo((Math.PI * f * Math.sqrt(eps) * tan) / SPEED_OF_LIGHT, 8);
  });
  it('is linear in frequency', () => {
    expect(lossDbPerMeter(40e6, 4, 0.01) / lossDbPerMeter(20e6, 4, 0.01)).toBeCloseTo(2, 6);
  });
});

describe('time and depth', () => {
  it('round-trips through a layered model', () => {
    const layers = [{ permittivity: 2.1, thicknessM: 50 }, { permittivity: 3.3, thicknessM: 800 }];
    for (const d of [10, 50, 400, 1200]) expect(timeToDepth(depthToTime(d, layers), layers)).toBeCloseTo(d, 6);
  });
  it('uses the bulk permittivity without a model', () => {
    // 1 µs in ε = 4 is c·1e-6/(2·2) ≈ 74.9 m
    expect(timeToDepth(1e-6, [], 4)).toBeCloseTo(74.948, 2);
  });
  it('is zero above the surface', () => {
    expect(sampleToDepth(10, 20, 37.5e-9, [])).toBe(0);
  });
});

describe('radar equation', () => {
  it('gives surface SNRs in the published range', () => {
    const s = computeRadarBudget(SHARAD_SPEC).snrDb;
    const m = computeRadarBudget(MARSIS_SPEC).snrDb;
    expect(s).toBeGreaterThan(40);
    expect(s).toBeLessThan(65);
    expect(m).toBeGreaterThan(25);
    expect(m).toBeLessThan(55);
  });
  it('loses SNR with depth and never returns a negative depth', () => {
    const target = { permittivity: 3.15, lossTangent: 1e-3, basalPermittivity: 8 };
    expect(subsurfaceSnrDb(SHARAD_SPEC, target, 1000)).toBeLessThan(subsurfaceSnrDb(SHARAD_SPEC, target, 100));
    const lossy = { permittivity: 8, lossTangent: 0.5, basalPermittivity: 9 };
    expect(maxDetectableDepth(SHARAD_SPEC, lossy)).toBeGreaterThanOrEqual(0);
    expect(maxDetectableDepth(SHARAD_SPEC, target)).toBeGreaterThan(maxDetectableDepth(SHARAD_SPEC, { ...target, lossTangent: 1e-2 }));
  });
});

describe('ice permittivity', () => {
  it('stays near 3.15 at HF and gets lossier when warmer', () => {
    const cold = waterIcePermittivity(170, 20e6);
    const warm = waterIcePermittivity(250, 20e6);
    expect(cold.real).toBeGreaterThan(3.1);
    expect(cold.real).toBeLessThan(3.3);
    expect(warm.lossTangent).toBeGreaterThan(cold.lossTangent);
    expect(cold.lossTangent).toBeGreaterThan(0);
  });
});
