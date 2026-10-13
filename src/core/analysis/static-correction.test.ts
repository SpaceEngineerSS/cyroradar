import { describe, it, expect } from 'vitest';
import { computeStaticCorrection } from './static-correction';
import type { RadargramData } from '../../types/types';

function radargram(width: number, height: number): RadargramData {
  return { width, height, data: new Float32Array(width * height).fill(-60), sampleInterval: 37.5e-9, traceSpacingM: 460, powerMin: -60, powerMax: -10 };
}

describe('computeStaticCorrection', () => {
  it('uses the median surface row as the datum', () => {
    const r = computeStaticCorrection(radargram(5, 100), { indices: new Uint16Array([10, 12, 15, 13, 11]) });
    expect(r.datumIdx).toBe(12);
    expect(Array.from(r.shifts)).toEqual([-2, 0, 3, 1, -1]);
  });

  it('moves each surface echo onto the datum row', () => {
    const rg = radargram(3, 50);
    const surface = new Uint16Array([10, 20, 15]);
    surface.forEach((s, t) => (rg.data[s * 3 + t] = -5));
    const r = computeStaticCorrection(rg, { indices: surface });
    for (let t = 0; t < 3; t++) expect(r.correctedData[r.datumIdx * 3 + t]).toBe(-5);
    expect(Array.from(r.correctedSurface)).toEqual([15, 15, 15]);
  });

  it('fills samples shifted in from outside the window with the floor value', () => {
    const rg = radargram(2, 20);
    rg.data.fill(-20);
    const r = computeStaticCorrection(rg, { indices: new Uint16Array([2, 12]) });
    // Trace 1 moves up by 5, so its last 5 rows come from outside the window.
    for (let s = 15; s < 20; s++) expect(r.correctedData[s * 2 + 1]).toBe(-60);
    for (let s = 0; s < 15; s++) expect(r.correctedData[s * 2 + 1]).toBe(-20);
  });

  it('is a no-op on a flat surface', () => {
    const rg = radargram(4, 30);
    rg.data.forEach((_, i) => (rg.data[i] = -i * 0.1));
    const r = computeStaticCorrection(rg, { indices: new Uint16Array([7, 7, 7, 7]) });
    expect(Array.from(r.correctedData)).toEqual(Array.from(rg.data));
  });
});
