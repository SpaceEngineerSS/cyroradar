import { describe, it, expect } from 'vitest';
import { computeDixVRMS, buildVRMSProfile, type DixLayer } from './dix-velocity';

const c = 299_792_458;

describe('computeDixVRMS', () => {
  it('returns c for empty layer array', () => {
    const result = computeDixVRMS([]);
    expect(result.vrms).toBe(c);
    expect(result.totalTwoWayTimeS).toBe(0);
  });

  it('returns interval velocity for single layer', () => {
    const layers: DixLayer[] = [{ permittivity: 3.15, thicknessM: 1000 }];
    const result = computeDixVRMS(layers);
    const expected = c / Math.sqrt(3.15);
    expect(result.vrms).toBeCloseTo(expected, 0);
    expect(result.intervalVelocities[0]).toBeCloseTo(expected, 0);
  });

  it('computes correct V_RMS for 3-layer model: Vacuum→Ice→Water', () => {
    const layers: DixLayer[] = [
      { permittivity: 1.0, thicknessM: 500 },
      { permittivity: 3.15, thicknessM: 500 },
      { permittivity: 80, thicknessM: 500 },
    ];

    const result = computeDixVRMS(layers);

    const v1 = c / Math.sqrt(1.0);
    const v2 = c / Math.sqrt(3.15);
    const v3 = c / Math.sqrt(80);

    const dt1 = (2 * 500) / v1;
    const dt2 = (2 * 500) / v2;
    const dt3 = (2 * 500) / v3;

    const expectedVRMS = Math.sqrt(
      (v1 * v1 * dt1 + v2 * v2 * dt2 + v3 * v3 * dt3) /
      (dt1 + dt2 + dt3)
    );

    expect(result.vrms).toBeCloseTo(expectedVRMS, 0);
    expect(result.intervalVelocities).toHaveLength(3);
    expect(result.intervalVelocities[0]).toBeCloseTo(v1, 0);
    expect(result.intervalVelocities[1]).toBeCloseTo(v2, 0);
    expect(result.intervalVelocities[2]).toBeCloseTo(v3, 0);
    expect(result.totalTwoWayTimeS).toBeCloseTo(dt1 + dt2 + dt3, 12);
  });

  it('V_RMS is bounded: V_water <= V_RMS <= V_vacuum', () => {
    const layers: DixLayer[] = [
      { permittivity: 1.0, thicknessM: 500 },
      { permittivity: 3.15, thicknessM: 500 },
      { permittivity: 80, thicknessM: 500 },
    ];
    const result = computeDixVRMS(layers);
    const vWater = c / Math.sqrt(80);
    expect(result.vrms).toBeGreaterThan(vWater);
    expect(result.vrms).toBeLessThanOrEqual(c);
  });
});

describe('buildVRMSProfile', () => {
  it('returns array of correct length', () => {
    const layers: DixLayer[] = [{ permittivity: 3.15, thicknessM: 1000 }];
    const profile = buildVRMSProfile(layers, 512, 0.075e-6);
    expect(profile).toHaveLength(512);
  });

  it('all values are positive and finite', () => {
    const layers: DixLayer[] = [
      { permittivity: 3.15, thicknessM: 500 },
      { permittivity: 7.0, thicknessM: 300 },
    ];
    const profile = buildVRMSProfile(layers, 512, 0.075e-6);
    for (let i = 0; i < profile.length; i++) {
      expect(profile[i]).toBeGreaterThan(0);
      expect(isFinite(profile[i])).toBe(true);
    }
  });

  it('V_RMS decreases with depth for increasing permittivity', () => {
    const layers: DixLayer[] = [
      { permittivity: 1.0, thicknessM: 500 },
      { permittivity: 10.0, thicknessM: 500 },
    ];
    const profile = buildVRMSProfile(layers, 512, 0.075e-6);
    expect(profile[0]).toBeGreaterThanOrEqual(profile[511]);
  });

  it('falls back to the bulk permittivity for an empty model', () => {
    const profile = buildVRMSProfile([], 100, 0.1e-6, 4);
    for (let i = 0; i < 100; i++) {
      expect(profile[i]).toBeCloseTo(c / 2, -2);
    }
  });

  it('is continuous across a layer boundary', () => {
    const layers: DixLayer[] = [
      { permittivity: 3.15, thicknessM: 300 },
      { permittivity: 9, thicknessM: 300 },
    ];
    const dt = 0.0375e-6;
    const profile = buildVRMSProfile(layers, 400, dt);
    const boundary = Math.round((2 * 300 * Math.sqrt(3.15)) / c / dt);
    const jump = Math.abs(profile[boundary + 1] - profile[boundary]);
    expect(jump / profile[boundary]).toBeLessThan(0.01);
  });

  it('ignores zero-thickness layers instead of producing NaN', () => {
    const profile = buildVRMSProfile([{ permittivity: 5, thicknessM: 0 }, { permittivity: 3.15, thicknessM: 100 }], 50, 0.0375e-6);
    expect(profile.every(v => Number.isFinite(v) && v > 0)).toBe(true);
  });
});
