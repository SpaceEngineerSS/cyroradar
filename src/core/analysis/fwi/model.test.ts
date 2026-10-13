import { describe, it, expect } from 'vitest';
import { setupProblem, createCpuBackend, computeGradient, evaluate, invert, fineFields, toPermittivity, calibrate, type FWIProblem } from './model';
import type { RadargramData } from '../../../types/types';

/** Builds a problem whose "observed" data come from the forward model itself. */
async function syntheticProblem(nx: number, nzc: number, truth: (x: number, k: number) => number): Promise<FWIProblem> {
  const rg: RadargramData = {
    width: nx, height: nzc, sampleInterval: 37.5e-9, traceSpacingM: 460,
    data: new Float32Array(nx * nzc).fill(-80), powerMin: -80, powerMax: 0,
  };
  const p = setupProblem(rg, { traceStart: 0, traceEnd: nx, sampleStart: 0, sampleEnd: nzc }, { maxNx: nx, maxNz: nzc, epsRef: 3.15, bandwidthHz: 10e6, noiseFloorDb: -200 });
  const logTrue = new Float32Array(nx * nzc);
  for (let k = 0; k < nzc; k++) for (let x = 0; x < nx; x++) logTrue[k * nx + x] = Math.log(truth(x, k));
  const backend = createCpuBackend(p.grid);
  const alpha = await calibrate(p, backend);
  const rec = await backend.forward(fineFields(p.grid, logTrue));
  let e = 0;
  for (let c = 0; c < nzc; c++) for (let x = 0; x < nx; x++) {
    const v = alpha * Math.abs(rec[(c + p.grid.t0) * nx + x]);
    p.observed[c * nx + x] = v;
    e += v * v;
  }
  p.observedEnergy = e;
  return p;
}

const truth = (x: number, k: number) => (k >= 26 && x >= 3 && x <= 7 ? 12 : k >= 12 ? 4 : 3.15);

describe('envelope FWI', () => {
  it('adjoint gradient agrees with finite differences', async () => {
    const p = await syntheticProblem(6, 24, (_x, k) => (k >= 14 ? 6 : k >= 8 ? 4 : 3.15));
    const backend = createCpuBackend(p.grid);
    const m = new Float32Array(p.initialLogEps);
    const { gradient } = await computeGradient(p, backend, m);
    // Two cells on interfaces the data constrain well, one deep cell that only
    // feels the (approximated) velocity term.
    const cells = [8 * 6 + 2, 14 * 6 + 3, 18 * 6 + 1];
    const fds: number[] = [];
    for (const i of cells) {
      const h = 1e-2;
      const a = new Float32Array(m); a[i] += h;
      const b = new Float32Array(m); b[i] -= h;
      fds.push(((await evaluate(p, backend, a)).misfit.J - (await evaluate(p, backend, b)).misfit.J) / (2 * h));
    }
    const scale = Math.max(...fds.map(Math.abs));
    cells.forEach((i, n) => {
      expect(Math.sign(gradient[i])).toBe(Math.sign(fds[n]));
      if (Math.abs(fds[n]) > 0.1 * scale) {
        expect(gradient[i] / fds[n]).toBeGreaterThan(0.5);
        expect(gradient[i] / fds[n]).toBeLessThan(2.5);
      }
    });
  });

  it('misfit decreases monotonically and the bright block is recovered', async () => {
    const p = await syntheticProblem(10, 40, truth);
    const backend = createCpuBackend(p.grid);
    const res = await invert(p, backend, { iterations: 25 });
        for (let i = 1; i < res.misfitHistory.length; i++) expect(res.misfitHistory[i]).toBeLessThanOrEqual(res.misfitHistory[i - 1]);
    expect(res.misfit).toBeLessThan(res.misfitHistory[0] * 0.3);
    const eps = toPermittivity(res.logEps);
    const at = (x: number, k: number) => eps[k * 10 + x];
    // The block top at row 26 is a contrast only for traces 3–7.
    const jumpIn = Math.log(at(5, 29) / at(5, 23));
    const jumpOut = Math.log(at(0, 29) / at(0, 23));
    expect(jumpIn).toBeGreaterThan(jumpOut + 0.2);
    expect(Math.max(...eps)).toBeLessThan(60);
  }, 30_000);
});
