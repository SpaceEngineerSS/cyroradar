/* Opening a radargram from disk.
 *
 * Supported:
 *   .tif / .tiff   8- or 16-bit greyscale image, read like a SHARAD browse
 *                  product (35 dB across the grey range)
 *   .csv / .txt    numeric matrix, one row per delay sample, one column per
 *                  trace. Values that include zero or negatives are taken as
 *                  dB; all-positive values are taken as linear power.
 *
 * Without a geometry table the import assumes SHARAD sampling (0.0375 µs,
 * 460 m between traces) and places the track at 0°, 0°. Depths are still
 * meaningful; map positions are not. */

import type { CryoDataset } from '../../types/types';
import { SHARAD } from '../physics/constants';
import { decodeTiff, pickSurface, PdsError } from './pds-client';

const MAX_CELLS = 6_000_000;

export function parseMatrix(text: string): { width: number; height: number; values: Float32Array } {
  const rows = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
  if (rows.length < 2) throw new PdsError('The file needs at least two rows of numbers.');
  const split = (l: string) => l.split(/[\s,;]+/).filter(Boolean).map(Number);
  const first = split(rows[0]);
  const header = first.some(v => !Number.isFinite(v));
  const body = header ? rows.slice(1) : rows;
  const width = split(body[0]).length;
  const height = body.length;
  if (width < 2) throw new PdsError('The file needs at least two columns (traces).');
  if (width * height > MAX_CELLS) throw new PdsError('That matrix is larger than this browser view can hold (6 million values).');
  const values = new Float32Array(width * height);
  for (let s = 0; s < height; s++) {
    const r = split(body[s]);
    for (let t = 0; t < width; t++) values[s * width + t] = Number.isFinite(r[t]) ? r[t] : NaN;
  }
  return { width, height, values };
}

export function importRadargramFile(name: string, buffer: ArrayBuffer): CryoDataset {
  const lower = name.toLowerCase();
  let width: number;
  let height: number;
  const toDb = (values: Float32Array, kind: 'browse' | 'matrix') => {
    const out = new Float32Array(values.length);
    if (kind === 'browse') {
      for (let i = 0; i < values.length; i++) out[i] = -35 + 35 * values[i];
      return out;
    }
    let positive = true;
    let minPos = Infinity;
    for (const v of values) {
      if (!(v > 0)) positive = false;
      else if (v < minPos) minPos = v;
    }
    const floor = Number.isFinite(minPos) ? 10 * Math.log10(minPos) : -100;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      out[i] = !Number.isFinite(v) ? floor : positive ? 10 * Math.log10(v) : v;
    }
    return out;
  };

  let data: Float32Array;
  let calibration: CryoDataset['metadata']['calibration'];
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) {
    const img = decodeTiff(buffer);
    ({ width, height } = img);
    if (width * height > MAX_CELLS) throw new PdsError('That image is larger than this browser view can hold (6 million pixels).');
    data = toDb(img.values, 'browse');
    calibration = 'display';
  } else if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const m = parseMatrix(new TextDecoder().decode(buffer));
    ({ width, height } = m);
    data = toDb(m.values, 'matrix');
    calibration = 'relative';
  } else {
    throw new PdsError('Open a .tif, .tiff, .csv or .txt file.');
  }

  let powerMin = Infinity;
  let powerMax = -Infinity;
  for (const v of data) {
    if (v < powerMin) powerMin = v;
    if (v > powerMax) powerMax = v;
  }

  return {
    metadata: {
      instrument: 'SHARAD',
      source: 'file',
      orbitNumber: 0,
      productId: name.replace(/\.[^.]+$/, ''),
      acquisitionDate: '',
      region: 'Local file',
      title: name,
      description: 'Opened from a local file. SHARAD sampling is assumed and the track has no map position.',
      centerLat: 0,
      centerLon: 0,
      frequencyHz: SHARAD.centerFrequencyHz,
      references: [],
      calibration,
    },
    geometry: {
      latitudes: new Float64Array(width),
      longitudes: new Float64Array(width),
      surfaceElevation: new Float32Array(width),
      spacecraftAltitude: new Float32Array(width).fill(SHARAD.orbitAltitudeM),
    },
    radargram: { width, height, sampleInterval: SHARAD.sampleIntervalS, traceSpacingM: SHARAD.traceSpacingM, data, powerMin, powerMax },
    surfaceEcho: { indices: pickSurface(data, width, height) },
  };
}
