import { describe, it, expect } from 'vitest';
import { generateSyntheticDataset, listSyntheticScenes } from './synthetic-generator';
import { scanForBrightReflections, groupDetections } from '../analysis/anomaly-detector';

describe('synthetic scenes', () => {
  it('generate every scene deterministically', () => {
    for (const s of listSyntheticScenes()) {
      const a = generateSyntheticDataset(s.id);
      const b = generateSyntheticDataset(s.id);
      const { width, height, data } = a.radargram;
      expect(data.length).toBe(width * height);
      expect(Number.isFinite(a.radargram.powerMin)).toBe(true);
      expect(a.radargram.powerMax).toBeLessThan(0);
      expect(b.radargram.data[1234]).toBe(data[1234]);
      console.log(s.id, width, height, a.radargram.powerMin.toFixed(1), a.radargram.powerMax.toFixed(1));
    }
  });

  it('Planum Australe shows bright basal echoes only over the brine', () => {
    const ds = generateSyntheticDataset('planum-australe');
    const found = scanForBrightReflections(ds, { thresholdDb: -10, hostPermittivity: 3.3, hostLossTangent: 4e-3, minDepthM: 30 });
    const segs = groupDetections(found);
    const W = ds.radargram.width;
    const bodies = [[0.46, 0.57], [0.69, 0.715]].map(([a, b]) => [Math.round(a * (W - 1)), Math.round(b * (W - 1))]);
    expect(segs.length).toBe(2);
    segs.forEach((seg, k) => {
      const [a, b] = bodies[k];
      expect(seg.traceStart).toBeGreaterThanOrEqual(a - 3);
      expect(seg.traceEnd).toBeLessThanOrEqual(b + 3);
      expect(seg.count).toBeGreaterThan((b - a) * 0.6);
      expect(seg.classification).toBe('liquid-water');
      expect(seg.meanDepthM).toBeGreaterThan(1300);
      expect(seg.meanDepthM).toBeLessThan(1600);
    });
    expect(Math.abs(segs[0].meanPermittivity - 35)).toBeLessThan(6);
  });

  it('the TEC setting smears MARSIS echoes', () => {
    const quiet = generateSyntheticDataset('planum-australe', { tecu: 0 });
    const loud = generateSyntheticDataset('planum-australe', { tecu: 1.5 });
    const t = 200;
    const s = quiet.surfaceEcho.indices[t];
    const W = quiet.radargram.width;
    expect(loud.radargram.data[s * W + t]).toBeLessThan(quiet.radargram.data[s * W + t] - 2);
  });
});
