/// <reference lib="webworker" />
/* Compute worker. One job per worker instance: the UI creates a worker for a
 * job and terminates it when the job ends or is cancelled. */

import type { JobRequest, JobResponse, JobType, JobMap } from './protocol';
import { generateSyntheticDataset } from '../core/pipeline/synthetic-generator';
import { loadSharadProduct } from '../core/pipeline/pds-client';
import { importRadargramFile } from '../core/pipeline/file-import';
import { scanForBrightReflections } from '../core/analysis/anomaly-detector';
import { generateSyntheticCRISM } from '../core/analysis/crism-fusion';
import { simulatePolSAR } from '../core/analysis/polsar';
import { computeStaticCorrection } from '../core/analysis/static-correction';
import { migrate } from '../core/analysis/migration';
import { buildVRMSProfile } from '../core/physics/dix-velocity';
import { runUncertainty } from '../core/analysis/uncertainty';
import { runFWIJob } from '../core/analysis/fwi/run';

declare const self: DedicatedWorkerGlobalScope;

const post = (msg: JobResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

/** Typed arrays in a result, so they can be transferred instead of copied. */
function buffersOf(value: unknown, out: Set<ArrayBuffer> = new Set(), depth = 0): Set<ArrayBuffer> {
  if (depth > 4 || value == null || typeof value !== 'object') return out;
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) out.add(value.buffer);
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object') for (const v of value.slice(0, 64)) buffersOf(v, out, depth + 1);
    return out;
  }
  for (const v of Object.values(value)) buffersOf(v, out, depth + 1);
  return out;
}

type Handler<T extends JobType> = (input: JobMap[T]['input'], progress: (p: JobMap[T]['progress']) => void) => Promise<JobMap[T]['output']> | JobMap[T]['output'];

const handlers: { [T in JobType]: Handler<T> } = {
  synthetic: ({ id, tecu }) => generateSyntheticDataset(id, { tecu }),
  pds: ({ product, full }, progress) => loadSharadProduct(product, { full, onProgress: (fraction, label) => progress({ fraction, label }) }),
  file: ({ name, buffer }) => importRadargramFile(name, buffer),
  scan: ({ dataset, params, layers, crism }) => scanForBrightReflections(dataset, params, layers, crism),
  crism: ({ dataset }) => generateSyntheticCRISM(dataset.geometry, dataset.radargram.width, hashSeed(dataset.metadata.productId)),
  polsar: ({ dataset }) => simulatePolSAR(dataset.radargram, hashSeed(dataset.metadata.productId)),
  statics: ({ dataset }) => computeStaticCorrection(dataset.radargram, dataset.surfaceEcho),
  migrate: ({ dataset, layers, bulkPermittivity, maxAngleDeg, maxApertureTraces }, progress) => {
    const { radargram } = dataset;
    const vrms = buildVRMSProfile(layers, radargram.height, radargram.sampleInterval, bulkPermittivity);
    return migrate(radargram, dataset.surfaceEcho.indices, { vrms, maxAngleDeg, maxApertureTraces }, fraction => progress({ fraction }));
  },
  uq: ({ anomalies, params, frequencyHz, sampleInterval, settings }, progress) =>
    runUncertainty(anomalies, params, frequencyHz, sampleInterval, settings, fraction => progress({ fraction })),
  fwi: ({ dataset, roi, settings }, progress) => runFWIJob(dataset, roi, settings, u => progress(u)),
};

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

self.onmessage = async (e: MessageEvent<JobRequest>) => {
  const { id, type, input } = e.data;
  try {
    const handler = handlers[type] as Handler<typeof type>;
    const output = await handler(input as never, (p: unknown) => {
      post({ id, kind: 'progress', progress: p }, type === 'fwi' ? [...buffersOf(p)] : []);
    });
    post({ id, kind: 'done', output }, [...buffersOf(output)]);
  } catch (err) {
    post({ id, kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
