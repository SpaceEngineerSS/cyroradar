/* Runs a job on a fresh compute worker. Cancelling terminates the worker, which
 * is the only reliable way to stop a tight numeric loop. */

import type { JobMap, JobResponse, JobType } from './protocol';

export class JobCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'JobCancelled';
  }
}

let nextId = 1;

export interface JobHandle<T extends JobType> {
  promise: Promise<JobMap[T]['output']>;
  cancel: () => void;
}

export function runJob<T extends JobType>(
  type: T,
  input: JobMap[T]['input'],
  onProgress?: (p: JobMap[T]['progress']) => void,
): JobHandle<T> {
  const id = nextId++;
  const worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module', name: `cryoradar-${type}` });
  let settled = false;
  let rejectFn: (e: Error) => void = () => {};

  const promise = new Promise<JobMap[T]['output']>((resolve, reject) => {
    rejectFn = reject;
    const finish = () => {
      settled = true;
      worker.terminate();
    };
    worker.onmessage = (e: MessageEvent<JobResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.kind === 'progress') onProgress?.(msg.progress as JobMap[T]['progress']);
      else if (msg.kind === 'done') {
        finish();
        resolve(msg.output as JobMap[T]['output']);
      } else {
        finish();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = e => {
      e.preventDefault();
      finish();
      reject(new Error(e.message || 'The compute worker stopped unexpectedly.'));
    };
    worker.onmessageerror = () => {
      finish();
      reject(new Error('The compute worker sent data that could not be read.'));
    };
  });

  worker.postMessage({ id, type, input });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker.terminate();
      rejectFn(new JobCancelled());
    },
  };
}
