/* Values derived from the store that several views need. Each is memoised
 * per input object so selectors stay cheap. */

import type { CryoDataset } from '../types/types';
import type { AppStore } from './app';

export interface StaticShifts {
  /** Rows to move each trace up by (data row − shift = displayed row). */
  shifts: Int16Array;
  datum: number;
}

const shiftCache = new WeakMap<CryoDataset, StaticShifts>();

export function staticShifts(dataset: CryoDataset): StaticShifts {
  const hit = shiftCache.get(dataset);
  if (hit) return hit;
  const idx = dataset.surfaceEcho.indices;
  const sorted = Array.from(idx).sort((a, b) => a - b);
  const datum = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const shifts = new Int16Array(idx.length);
  for (let t = 0; t < idx.length; t++) shifts[t] = idx[t] - datum;
  const value = { shifts, datum };
  shiftCache.set(dataset, value);
  return value;
}

export interface DisplayField {
  data: Float32Array;
  width: number;
  height: number;
  powerMin: number;
  powerMax: number;
  /** Per-trace row shift applied on screen, or null. */
  shifts: Int16Array | null;
  variant: 'raw' | 'migrated';
}

/** What the radargram view should draw for a given variant. */
export function displayField(s: Pick<AppStore, 'dataset' | 'migration' | 'statics'>, variant: 'raw' | 'migrated'): DisplayField | null {
  const ds = s.dataset;
  if (!ds) return null;
  const mig = variant === 'migrated' ? s.migration.result : null;
  return {
    data: mig ? mig.data : ds.radargram.data,
    width: ds.radargram.width,
    height: ds.radargram.height,
    powerMin: mig ? mig.powerMin : ds.radargram.powerMin,
    powerMax: mig ? mig.powerMax : ds.radargram.powerMax,
    shifts: s.statics ? staticShifts(ds).shifts : null,
    variant: mig ? 'migrated' : 'raw',
  };
}

export const shiftAt = (shifts: Int16Array | null, trace: number) => (shifts ? shifts[Math.max(0, Math.min(shifts.length - 1, trace))] : 0);
