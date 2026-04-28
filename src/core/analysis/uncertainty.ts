/* CRYORADAR — Uncertainty Quantification API (v7.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Main-thread interface for the Monte Carlo UQ Web Worker.
 * Converts anomaly results to worker-compatible format and
 * dispatches analysis with zero-copy where possible. */

import type { AnomalyResult, UQResult } from '../../types/types';

interface UQCallbacks {
  onProgress?: (fraction: number) => void;
  onComplete: (results: UQResult[]) => void;
  onError?: (error: string) => void;
}

let activeWorker: Worker | null = null;

/**
 * Runs Monte Carlo uncertainty analysis on detected anomalies.
 * Propagates dielectric uncertainty through the depth conversion equation.
 *
 * @param anomalies Detected anomaly results with apparent permittivity
 * @param nSamples Number of Monte Carlo samples (default 1000)
 * @param callbacks Progress, completion, and error handlers
 */
export function runUncertaintyAnalysis(
  anomalies: AnomalyResult[],
  nSamples: number = 1000,
  callbacks: UQCallbacks
): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }

  const worker = new Worker(
    new URL('./uq-worker.ts', import.meta.url),
    { type: 'module' }
  );

  activeWorker = worker;

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      callbacks.onProgress?.(msg.value);
    } else if (msg.type === 'result') {
      callbacks.onComplete(msg.results as UQResult[]);
      worker.terminate();
      activeWorker = null;
    }
  };

  worker.onerror = (err) => {
    callbacks.onError?.(err.message || 'UQ Worker error');
    worker.terminate();
    activeWorker = null;
  };

  const workerInput = anomalies.map(a => ({
    twoWayTimeS: a.depthM * 2 * Math.sqrt(a.apparentPermittivity) / 299_792_458,
    apparentPermittivity: a.apparentPermittivity,
    permittivityUncertainty: a.apparentPermittivity * 0.1,
  }));

  worker.postMessage({ anomalies: workerInput, nSamples });
}

export function cancelUncertaintyAnalysis(): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
}
