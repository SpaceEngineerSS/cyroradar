/* Messages between the UI and the compute worker. Every heavy job in the app
 * goes through here, so the main thread only ever draws. */

import type {
  AnomalyResult, CRISMPixel, CryoDataset, DetectionParams, FWIResult, PolSARResult, ROIBounds, UQResult,
} from '../types/types';
import type { PDSProduct } from '../types/pds-types';
import type { VelocityLayer } from '../core/physics/depth-conversion';
import type { UQSettings } from '../core/analysis/uncertainty';
import type { FWISettings, FWIUpdate } from '../core/analysis/fwi/run';
import type { StaticCorrectionResult } from '../core/analysis/static-correction';
import type { MigrationOutput } from '../core/analysis/migration';

export interface JobMap {
  synthetic: { input: { id: string; tecu: number }; output: CryoDataset; progress: never };
  pds: { input: { product: PDSProduct; full: boolean }; output: CryoDataset; progress: { fraction: number; label: string } };
  file: { input: { name: string; buffer: ArrayBuffer }; output: CryoDataset; progress: never };
  scan: {
    input: { dataset: CryoDataset; params: DetectionParams; layers: VelocityLayer[]; crism: CRISMPixel[] | null };
    output: AnomalyResult[];
    progress: never;
  };
  crism: { input: { dataset: CryoDataset }; output: CRISMPixel[]; progress: never };
  polsar: { input: { dataset: CryoDataset }; output: PolSARResult; progress: never };
  statics: { input: { dataset: CryoDataset }; output: StaticCorrectionResult; progress: never };
  migrate: {
    input: { dataset: CryoDataset; layers: VelocityLayer[]; bulkPermittivity: number; maxAngleDeg: number; maxApertureTraces: number };
    output: MigrationOutput;
    progress: { fraction: number };
  };
  uq: {
    input: { anomalies: AnomalyResult[]; params: DetectionParams; frequencyHz: number; sampleInterval: number; settings: UQSettings };
    output: UQResult[];
    progress: { fraction: number };
  };
  fwi: { input: { dataset: CryoDataset; roi: ROIBounds; settings: FWISettings }; output: FWIResult; progress: FWIUpdate };
}

export type JobType = keyof JobMap;

export interface JobRequest<T extends JobType = JobType> {
  id: number;
  type: T;
  input: JobMap[T]['input'];
}

export type JobResponse =
  | { id: number; kind: 'progress'; progress: unknown }
  | { id: number; kind: 'done'; output: unknown }
  | { id: number; kind: 'error'; message: string };
