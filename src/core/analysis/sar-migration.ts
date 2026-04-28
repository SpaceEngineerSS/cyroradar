/* CRYORADAR — SAR Migration API (Main Thread, v5.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Provides the main-thread interface for invoking Kirchhoff migration
 * on a radargram via a dedicated Web Worker. Uses Vite's native
 * worker bundling syntax for correct module resolution.
 *
 * v5.0: Builds a Dix V_RMS profile from the subsurface layer model
 * and transfers it alongside the radargram to the Worker. This
 * replaces the constant-velocity assumption with physically correct
 * multi-layer velocity computation.
 *
 * Float32Array buffers are transferred (zero-copy) to avoid
 * memory duplication on both postMessage calls. */

import type { RadargramData } from '../../types/types';
import { buildVRMSProfile, type DixLayer } from '../physics/dix-velocity';
import { SPEED_OF_LIGHT } from '../physics/constants';

interface MigrationCallbacks {
  onProgress?: (fraction: number) => void;
  onComplete: (data: Float32Array, elapsedMs: number) => void;
  onError?: (error: string) => void;
}

let activeWorker: Worker | null = null;

export function runSARMigration(
  radargram: RadargramData,
  hostPermittivity: number,
  apertureTraces: number,
  traceSpacingM: number,
  callbacks: MigrationCallbacks,
  layerModel?: DixLayer[]
): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }

  const worker = new Worker(
    new URL('./sar-worker.ts', import.meta.url),
    { type: 'module' }
  );

  activeWorker = worker;
  const startTime = performance.now();

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      callbacks.onProgress?.(msg.value);
    } else if (msg.type === 'result') {
      const elapsed = performance.now() - startTime;
      callbacks.onComplete(msg.data as Float32Array, elapsed);
      worker.terminate();
      activeWorker = null;
    }
  };

  worker.onerror = (err) => {
    callbacks.onError?.(err.message || 'SAR Migration worker error');
    worker.terminate();
    activeWorker = null;
  };

  let vrmsProfile: Float32Array;
  if (layerModel && layerModel.length > 0) {
    vrmsProfile = buildVRMSProfile(layerModel, radargram.height, radargram.sampleInterval);
  } else {
    vrmsProfile = new Float32Array(radargram.height);
    const constantV = SPEED_OF_LIGHT / Math.sqrt(hostPermittivity);
    vrmsProfile.fill(constantV);
  }

  const inputCopy = new Float32Array(radargram.data);

  worker.postMessage(
    {
      data: inputCopy,
      vrmsProfile,
      params: {
        width: radargram.width,
        height: radargram.height,
        sampleInterval: radargram.sampleInterval,
        apertureTraces,
        traceSpacingM,
      },
    },
    { transfer: [inputCopy.buffer, vrmsProfile.buffer] }
  );
}

export function cancelSARMigration(): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
}
