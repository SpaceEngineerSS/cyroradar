import { describe, it, expect } from 'vitest';
import { generateSyntheticCRISM, summarizeCRISM, classifyMineral } from './analysis/crism-fusion';
import { simulatePolSAR } from './analysis/polsar';
import { getAllColormaps, getColormap, colorIndex, colormapCss } from './colormaps/colormaps';
import { importRadargramFile } from './pipeline/file-import';
import { getAllMaterials, getMaterial } from './physics/dielectric';
import { generateSyntheticDataset } from './pipeline/synthetic-generator';
import { runFWIJob } from './analysis/fwi/run';
import { computeStaticCorrection } from './analysis/static-correction';

const scene = generateSyntheticDataset('arcadia-planitia');

describe('CRISM context', () => {
  it('is deterministic per seed and bounded', () => {
    const a = generateSyntheticCRISM(scene.geometry, scene.radargram.width, 7);
    const b = generateSyntheticCRISM(scene.geometry, scene.radargram.width, 7);
    expect(a).toEqual(b);
    expect(a.every(p => p.clayIndex >= 0 && p.clayIndex <= 1 && p.hydrationIndex >= 0 && p.hydrationIndex <= 1)).toBe(true);
    const s = summarizeCRISM(a);
    expect(Object.values(s.counts).reduce((x, y) => x + y, 0)).toBe(a.length);
  });
  it('classifies the corner cases', () => {
    expect(classifyMineral(0.8, 0.8)).toBe('phyllosilicate');
    expect(classifyMineral(0.1, 0.9)).toBe('sulfate');
    expect(classifyMineral(0.1, 0.1)).toBe('none');
  });
});

describe('simulated polarimetry', () => {
  it('produces bounded channels whose Pauli shares sum to one', () => {
    const p = simulatePolSAR(scene.radargram, 3);
    expect(p.entropy.length).toBe(p.width * p.height);
    for (let i = 0; i < p.entropy.length; i += 97) {
      expect(p.entropy[i]).toBeGreaterThanOrEqual(0);
      expect(p.entropy[i]).toBeLessThanOrEqual(1);
      expect(p.surface[i] + p.dihedral[i] + p.volume[i]).toBeCloseTo(1, 4);
    }
    const f = p.stats.fractions;
    expect(f.surface + f.dihedral + f.volume).toBeCloseTo(1, 4);
  });
});

describe('colour tables', () => {
  it('run from dark to light and index safely', () => {
    for (const c of getAllColormaps()) {
      expect(c.rgba.length).toBe(1024);
      expect(c.packed.length).toBe(256);
    }
    const g = getColormap('grayscale');
    expect(g.rgba[0]).toBe(0);
    expect(g.rgba[255 * 4]).toBe(255);
    expect(colorIndex(-100, 0, 1)).toBe(0);
    expect(colorIndex(100, 0, 1)).toBe(255);
    expect(colorIndex(0.5, 0, 0)).toBe(0);
    expect(colormapCss('ember')).toMatch(/^linear-gradient/);
  });
});

describe('file import', () => {
  it('reads a CSV of linear power and converts to dB', () => {
    const rows = Array.from({ length: 30 }, (_, s) => Array.from({ length: 4 }, () => (s === 10 ? 100 : 1)).join(','));
    const ds = importRadargramFile('track.csv', new TextEncoder().encode(rows.join('\n')).buffer);
    expect(ds.radargram.width).toBe(4);
    expect(ds.radargram.height).toBe(30);
    expect(ds.radargram.powerMax).toBeCloseTo(20, 6);
    expect(Array.from(ds.surfaceEcho.indices)).toEqual([10, 10, 10, 10]);
  });
  it('keeps dB values that are already negative', () => {
    const ds = importRadargramFile('db.txt', new TextEncoder().encode('-40 -40\n-5 -6\n-40 -41\n').buffer);
    expect(ds.radargram.powerMax).toBe(-5);
  });
  it('rejects unknown formats', () => {
    expect(() => importRadargramFile('x.png', new ArrayBuffer(8))).toThrow(/Open a/);
  });
});

describe('materials', () => {
  it('have sensible ranges', () => {
    for (const m of getAllMaterials()) {
      expect(m.permittivity).toBeGreaterThanOrEqual(1);
      if (m.permittivityRange) expect(m.permittivity).toBeGreaterThanOrEqual(m.permittivityRange[0]);
    }
    expect(getMaterial('water-ice')?.permittivity).toBe(3.15);
    expect(getMaterial('nope')).toBeUndefined();
  });
});

describe('static correction on a scene', () => {
  it('flattens the surface', () => {
    const r = computeStaticCorrection(scene.radargram, scene.surfaceEcho);
    expect(new Set(r.correctedSurface).size).toBe(1);
  });
});

describe('FWI job on the CPU', () => {
  it('runs end to end on a window of a scene and lowers the misfit', async () => {
    const roi = { traceStart: 100, traceEnd: 124, sampleStart: scene.surfaceEcho.indices[110] + 4, sampleEnd: scene.surfaceEcho.indices[110] + 44 };
    const res = await runFWIJob(scene, roi, {
      iterations: 4,
      hostPermittivity: 3.5,
      hostLossTangent: 4e-3,
      preferGpu: false,
      gpuMax: { nx: 24, nz: 40 },
      cpuMax: { nx: 24, nz: 40 },
    });
    expect(res.backend).toBe('cpu');
    expect(res.permittivity.length).toBe(res.nx * res.nz);
    expect(res.misfitHistory[res.misfitHistory.length - 1]).toBeLessThanOrEqual(res.misfitHistory[0]);
  }, 30_000);
});
