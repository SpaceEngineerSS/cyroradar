/* CRYORADAR — Static Correction Unit Tests
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Validates topographic static correction:
 * - Datum index = median of surface echo indices
 * - Zero-fill boundary (no array wrap)
 * - Energy conservation within tolerance */

import { describe, it, expect } from 'vitest';
import { computeStaticCorrection } from './static-correction';
import type { RadargramData, SurfaceEchoData } from '../../types/types';

function makeRadargram(width: number, height: number, fill: number = 1.0): RadargramData {
  const data = new Float32Array(width * height);
  data.fill(fill);
  return {
    width, height, data,
    sampleInterval: 0.075e-6,
    powerMin: 0,
    powerMax: fill,
  };
}

describe('computeStaticCorrection', () => {
  it('datum index is median of surface echo indices', () => {
    const radargram = makeRadargram(5, 100);
    const surfaceEcho: SurfaceEchoData = {
      indices: new Uint16Array([10, 12, 15, 13, 11]),
    };

    const result = computeStaticCorrection(radargram, surfaceEcho);
    expect(result.datumIdx).toBe(12);
  });

  it('zero-fill boundary: no array wrapping', () => {
    const width = 3;
    const height = 10;
    const radargram = makeRadargram(width, height, 0);

    for (let t = 0; t < width; t++) {
      for (let s = 0; s < height; s++) {
        radargram.data[s * width + t] = s + 1;
      }
    }

    const surfaceEcho: SurfaceEchoData = {
      indices: new Uint16Array([2, 5, 8]),
    };

    const result = computeStaticCorrection(radargram, surfaceEcho);

    for (let s = 0; s < height; s++) {
      const val = result.correctedData[s * width + 2];
      if (s >= height) {
        expect(val).toBe(0);
      }
    }
  });

  it('energy conservation: loss only from boundary truncation', () => {
    const radargram = makeRadargram(10, 50, 5.0);
    const surfaceEcho: SurfaceEchoData = {
      indices: new Uint16Array([25, 25, 25, 25, 25, 25, 25, 25, 25, 25]),
    };

    const result = computeStaticCorrection(radargram, surfaceEcho);

    expect(result.energyBefore).toBeGreaterThan(0);
    expect(result.energyAfter).toBeLessThanOrEqual(result.energyBefore);
    expect(result.energyAfter).toBe(result.energyBefore);
  });

  it('no shift when all surface echoes identical', () => {
    const width = 5;
    const height = 20;
    const radargram = makeRadargram(width, height, 1.0);
    const surfaceEcho: SurfaceEchoData = {
      indices: new Uint16Array([8, 8, 8, 8, 8]),
    };

    const result = computeStaticCorrection(radargram, surfaceEcho);

    expect(result.datumIdx).toBe(8);
    for (let i = 0; i < result.shifts.length; i++) {
      expect(result.shifts[i]).toBe(0);
    }
    expect(result.energyAfter).toBe(result.energyBefore);
  });

  it('handles large positive shifts without crash', () => {
    const width = 3;
    const height = 20;
    const radargram = makeRadargram(width, height);
    const surfaceEcho: SurfaceEchoData = {
      indices: new Uint16Array([5, 15, 10]),
    };

    const result = computeStaticCorrection(radargram, surfaceEcho);
    expect(result.correctedData).toHaveLength(width * height);
    expect(result.shifts).toHaveLength(width);
    expect(isFinite(result.energyAfter)).toBe(true);
  });
});
