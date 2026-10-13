/* Values derived from the store that several views need. Each is memoised
 * per input object so selectors stay cheap. */

import type { CryoDataset } from '../types/types';
import type { AppStore } from './app';
import { estimateNoiseFloorDb } from '../core/analysis/anomaly-detector';

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

/**
 * Black and white points (as fractions of the dB range). The black point sits
 * a little above the noise floor (median of the deepest rows), so noise reads
 * as dark grain; the white point is a high percentile of the whole field.
 */
export function autoContrast(f: Pick<DisplayField, 'data' | 'powerMin' | 'powerMax' | 'width' | 'height'>, hi = 0.9985): [number, number] {
  const step = Math.max(1, Math.floor(f.data.length / 200_000));
  const vals: number[] = [];
  for (let i = 0; i < f.data.length; i += step) vals.push(f.data[i]);
  vals.sort((a, b) => a - b);
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  const noise = estimateNoiseFloorDb(f.data, f.width, f.height);
  const span = f.powerMax - f.powerMin || 1;
  const top = q(hi);
  const black = Math.min(noise + 3, top - 10);
  return [Math.max(0, (black - f.powerMin) / span), Math.min(1, (top - f.powerMin) / span)];
}
