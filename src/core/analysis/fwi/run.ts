/* Runs an FWI job end to end: amplitude calibration against the surface echo,
 * backend selection (WebGPU, falling back to CPU), and the inversion loop. */

import type { CryoDataset, FWIResult, ROIBounds } from '../../../types/types';
import { fresnelReflection } from '../../physics/fresnel';
import { lossDbPerMeter } from '../../physics/attenuation';
import { INSTRUMENTS } from '../../physics/constants';
import { estimateNoiseFloorDb } from '../anomaly-detector';
import { setupProblem, createCpuBackend, invert, toPermittivity, type FWIBackend } from './model';
import { createWebGpuBackend } from './webgpu';

export interface FWISettings {
  iterations: number;
  hostPermittivity: number;
  hostLossTangent: number;
  preferGpu: boolean;
  /** Grid caps; the caller picks them from the device tier. */
  gpuMax: { nx: number; nz: number };
  cpuMax: { nx: number; nz: number };
}

export interface FWIUpdate {
  iteration: number;
  misfitHistory: number[];
  permittivity: Float32Array;
  nx: number;
  nz: number;
  backend: 'webgpu' | 'cpu';
}

export async function runFWIJob(
  dataset: CryoDataset,
  roi: ROIBounds,
  settings: FWISettings,
  onUpdate?: (u: FWIUpdate) => void,
  signal?: { aborted: boolean },
): Promise<FWIResult> {
  const start = performance.now();
  const { radargram, surfaceEcho, metadata } = dataset;
  const { width, data, sampleInterval } = radargram;
  const eh = Math.max(1.05, settings.hostPermittivity);
  const surface = fresnelReflection(1, eh);
  const rs = Math.sqrt(surface.reflectionCoefficient);
  const lossPerM = 2 * lossDbPerMeter(metadata.frequencyHz, eh, Math.max(0, settings.hostLossTangent));
  const noise = estimateNoiseFloorDb(data, width, radargram.height);

  // Converts linear amplitude into amplitude reflection coefficient using the
  // surface echo of the same trace.
  const amplitudeGain = (s: number, t: number) => {
    const surf = surfaceEcho.indices[t];
    const as = 10 ** (data[surf * width + t] / 20);
    const depth = Math.max(0, ((s - surf) * sampleInterval * 299_792_458) / (2 * Math.sqrt(eh)));
    return (rs / (surface.transmissionCoefficient * as)) * 10 ** ((lossPerM * depth) / 20);
  };

  const bandwidthHz = INSTRUMENTS[metadata.instrument].bandwidthHz;
  const make = (cap: { nx: number; nz: number }) =>
    setupProblem(radargram, roi, { maxNx: cap.nx, maxNz: cap.nz, epsRef: eh, bandwidthHz, noiseFloorDb: noise, amplitudeGain });

  let problem = make(settings.gpuMax);
  let backend: FWIBackend | null = settings.preferGpu ? await createWebGpuBackend(problem.grid) : null;
  if (!backend) {
    problem = make(settings.cpuMax);
    backend = createCpuBackend(problem.grid);
  }
  const kind = backend.kind;
  const { nx, nzc } = problem.grid;

  try {
    const res = await invert(problem, backend, {
      iterations: settings.iterations,
      signal,
      onIteration: p =>
        onUpdate?.({ iteration: p.iteration, misfitHistory: p.misfitHistory, permittivity: toPermittivity(p.logEps), nx, nz: nzc, backend: kind }),
    });
    return {
      roi,
      permittivity: toPermittivity(res.logEps),
      nx,
      nz: nzc,
      misfitHistory: res.misfitHistory,
      iterations: res.iteration,
      elapsedMs: performance.now() - start,
      backend: kind,
    };
  } finally {
    backend.dispose();
  }
}
