/* NASA PDS access for SHARAD US radargrams (MRO-M-SHARAD-5-RADARGRAM-V2.0).
 *
 * Search goes to the ODE REST API, which allows cross-origin requests.
 * Product files live on pds-geosciences.wustl.edu, which does not, so they are
 * fetched through the /pds-data proxy (vite.config.ts in development,
 * vercel.json in production).
 *
 * Archive facts used below (radargram_ds.cat):
 *   - RGRAM.IMG: 32-bit little-endian float, linear power in arbitrary but
 *     consistent units, LINES = delay rows, LINE_SAMPLES = along-track columns
 *   - browse TIFF: 8-bit, logarithmic, 35 dB greyscale range
 *   - delay spacing 0.0375 µs; columns at 128 per degree (≈ 460 m)
 *   - GEOM.TAB: one row per column with latitude, longitude, Mars radius and
 *     spacecraft radius in km
 *
 * MARSIS products are searchable in ODE but their radargram format is not
 * supported here, so search is limited to SHARAD. */

import type { CryoDataset } from '../../types/types';
import type { PDSProduct, PDSSearchParams, PDSSearchResult } from '../../types/pds-types';
import { SHARAD } from '../physics/constants';

const ODE_BASE = 'https://oderest.rsl.wustl.edu/live2';
const PDS_HOST = 'https://pds-geosciences.wustl.edu';
const PROXY = '/pds-data';
/** Mean areoid radius used to turn planetary radius into elevation, km. */
const REFERENCE_RADIUS_KM = 3396.19;
const BROWSE_RANGE_DB = 35;

/* Small LRU cache for search results ------------------------------------- */

const CACHE_LIMIT = 24;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: PDSSearchResult }>();

function cacheGet(key: string): PDSSearchResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key: string, value: PDSSearchResult) {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

/* Fetch helpers ------------------------------------------------------------ */

export class PdsError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'PdsError';
    this.status = status;
  }
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchOk(url: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { signal: withTimeout(signal, timeoutMs) });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err instanceof DOMException && err.name === 'TimeoutError') throw new PdsError('The PDS server took too long to answer.');
    throw new PdsError('Could not reach the PDS server. Check your connection and try again.');
  }
  if (!res.ok) throw new PdsError(`The PDS server answered ${res.status} for ${url.split('/').pop()}.`, res.status);
  return res;
}

/** Reads a response body while reporting progress (0–1 when the size is known). */
async function readWithProgress(res: Response, onProgress?: (f: number) => void): Promise<ArrayBuffer> {
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(Math.min(1, received / total));
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out.buffer;
}

/* Search ------------------------------------------------------------------- */

function parseProduct(raw: Record<string, string>): PDSProduct {
  const name = raw.Product_name ?? '';
  return {
    productId: name.replace(/\.\w+$/, ''),
    productName: name,
    instrument: 'SHARAD',
    orbitNumber: parseInt(raw.Start_orbit_number ?? '0', 10) || 0,
    observationTime: raw.Observation_time ?? raw.UTC_start_time ?? '',
    centerLat: parseFloat(raw.Center_latitude ?? '0'),
    centerLon: parseFloat(raw.Center_longitude ?? '0'),
    startLat: parseFloat(raw.Start_latitude ?? '0'),
    startLon: parseFloat(raw.Start_longitude ?? '0'),
    stopLat: parseFloat(raw.Stop_latitude ?? '0'),
    stopLon: parseFloat(raw.Stop_longitude ?? '0'),
    footprintWkt: raw.Footprint_geometry ?? '',
    labelUrl: raw.LabelURL ?? '',
    externalUrl: raw.External_url ?? '',
  };
}

export async function searchProducts(params: PDSSearchParams, signal?: AbortSignal): Promise<PDSSearchResult> {
  const key = JSON.stringify(params);
  const cached = cacheGet(key);
  if (cached) return cached;

  const query = new URLSearchParams({
    target: 'mars',
    query: 'products',
    results: 'm',
    output: 'JSON',
    ihid: 'MRO',
    iid: 'SHARAD',
    pt: 'USRDRV2',
    minlat: String(params.minLat),
    maxlat: String(params.maxLat),
    westlon: String(params.westLon),
    eastlon: String(params.eastLon),
    limit: String(params.limit ?? 20),
    offset: String(params.offset ?? 0),
  });
  const res = await fetchOk(`${ODE_BASE}/?${query}`, signal, 20_000);
  const json = await res.json();
  const results = json?.ODEResults;
  if (results?.Status === 'ERROR') throw new PdsError(`ODE rejected the query: ${results.Error}`);

  const raw = results?.Products?.Product;
  const list: Record<string, string>[] = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  const value: PDSSearchResult = {
    products: list.map(parseProduct).filter(p => p.labelUrl),
    count: parseInt(results?.Count ?? String(list.length), 10) || list.length,
  };
  cacheSet(key, value);
  return value;
}

export function footprintToLatLon(wkt: string): { lat: number; lon: number }[] {
  const body = wkt.match(/\(\(?([^()]+)\)?\)/);
  if (!body) return [];
  return body[1]
    .split(',')
    .map(pair => pair.trim().split(/\s+/).map(Number))
    .filter(p => p.length >= 2 && p.every(Number.isFinite))
    .map(([lon, lat]) => ({ lat, lon }));
}

/* Product files ------------------------------------------------------------ */

export interface ProductPaths {
  image: string;
  browse: string;
  geometry: string;
}

/** Derives file URLs from the label URL ODE returns, routed through the proxy. */
export function productPaths(product: PDSProduct): ProductPaths {
  const label = product.labelUrl;
  const m = label.match(/^(.*\/)data\/rgram\/([^/]+)\/([^/]+)_rgram\.(xml|lbl)$/i);
  if (!m) throw new PdsError('This product does not look like a SHARAD US radargram.');
  const [, root, group, id] = m;
  const viaProxy = (u: string) => u.replace(PDS_HOST, PROXY);
  return {
    image: viaProxy(`${root}data/rgram/${group}/${id}_rgram.img`),
    browse: viaProxy(`${root}browse/tiff/${group}/${id}_tiff.tif`),
    geometry: viaProxy(`${root}data/geom/${group}/${id}_geom.tab`),
  };
}

/* Decoders ----------------------------------------------------------------- */

export interface DecodedImage {
  width: number;
  height: number;
  /** One value per pixel, row-major. */
  values: Float32Array;
}

/** Baseline TIFF reader: uncompressed, 8- or 16-bit, one or more samples per pixel. */
export function decodeTiff(buffer: ArrayBuffer): DecodedImage {
  const dv = new DataView(buffer);
  if (buffer.byteLength < 8) throw new PdsError('The browse image is empty.');
  const order = dv.getUint16(0, false);
  if (order !== 0x4949 && order !== 0x4d4d) throw new PdsError('The browse image is not a TIFF file.');
  const le = order === 0x4949;
  if (dv.getUint16(2, le) !== 42) throw new PdsError('The browse image is not a classic TIFF file.');

  const u16 = (o: number) => dv.getUint16(o, le);
  const u32 = (o: number) => dv.getUint32(o, le);
  const ifd = u32(4);
  if (ifd + 2 > buffer.byteLength) throw new PdsError('The browse image is truncated.');
  const count = u16(ifd);

  const tags = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e);
    const type = u16(e + 2);
    const n = u32(e + 4);
    const size = type === 3 ? 2 : type === 4 ? 4 : type === 1 ? 1 : 0;
    if (!size) continue;
    const at = n * size > 4 ? u32(e + 8) : e + 8;
    if (at + n * size > buffer.byteLength) continue;
    const vals: number[] = [];
    for (let k = 0; k < n; k++) vals.push(size === 2 ? u16(at + k * 2) : size === 4 ? u32(at + k * 4) : dv.getUint8(at + k));
    tags.set(tag, vals);
  }

  const width = tags.get(256)?.[0] ?? 0;
  const height = tags.get(257)?.[0] ?? 0;
  const bits = tags.get(258)?.[0] ?? 8;
  const compression = tags.get(259)?.[0] ?? 1;
  const photometric = tags.get(262)?.[0] ?? 1;
  const offsets = tags.get(273) ?? [];
  const spp = tags.get(277)?.[0] ?? 1;
  const rowsPerStrip = tags.get(278)?.[0] ?? height;
  if (!width || !height || offsets.length === 0) throw new PdsError('The browse image is missing size or strip tags.');
  if (compression !== 1) throw new PdsError('Compressed TIFF files are not supported.');
  if (bits !== 8 && bits !== 16) throw new PdsError(`${bits}-bit TIFF files are not supported.`);

  const bytesPerSample = bits / 8;
  const stride = bytesPerSample * spp;
  const maxValue = bits === 8 ? 255 : 65535;
  const values = new Float32Array(width * height);
  let row = 0;
  for (const off of offsets) {
    const rows = Math.min(rowsPerStrip, height - row);
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < width; x++) {
        const p = off + ((r * width + x) * stride);
        if (p + stride > buffer.byteLength) continue;
        // Average colour channels if present; take the first sample otherwise.
        let v = 0;
        const channels = spp >= 3 ? 3 : 1;
        for (let c = 0; c < channels; c++) v += bits === 8 ? dv.getUint8(p + c) : dv.getUint16(p + c * 2, le);
        v /= channels * maxValue;
        values[(row + r) * width + x] = photometric === 0 ? 1 - v : v;
      }
    }
    row += rows;
    if (row >= height) break;
  }
  return { width, height, values };
}

/** RGRAM.IMG: little-endian float32 power, `columns` per row. */
export function decodeRgramImg(buffer: ArrayBuffer, columns: number): DecodedImage {
  if (buffer.byteLength % (columns * 4) !== 0) throw new PdsError('The radargram file size does not match its geometry table.');
  const height = buffer.byteLength / (columns * 4);
  const dv = new DataView(buffer);
  const values = new Float32Array(columns * height);
  for (let i = 0; i < values.length; i++) values[i] = dv.getFloat32(i * 4, true);
  return { width: columns, height, values };
}

export interface GeometryRow {
  latitude: number;
  longitude: number;
  marsRadiusKm: number;
  spacecraftRadiusKm: number;
}

export function parseGeometryTable(text: string): GeometryRow[] {
  const rows: GeometryRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(',').map(s => s.trim());
    if (parts.length < 6) continue;
    const latitude = Number(parts[2]);
    const longitude = Number(parts[3]);
    const marsRadiusKm = Number(parts[4]);
    const spacecraftRadiusKm = Number(parts[5]);
    if (![latitude, longitude, marsRadiusKm, spacecraftRadiusKm].every(Number.isFinite)) continue;
    rows.push({ latitude, longitude, marsRadiusKm, spacecraftRadiusKm });
  }
  return rows;
}

/* Surface pick and crop ---------------------------------------------------- */

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

/**
 * Surface row per column: the brightest return, then a running median over
 * ±7 columns to reject isolated clutter or noise spikes.
 */
export function pickSurface(db: Float32Array, width: number, height: number): Uint16Array {
  const raw = new Array<number>(width);
  for (let t = 0; t < width; t++) {
    let best = -Infinity;
    let row = 0;
    for (let s = 0; s < height; s++) {
      const v = db[s * width + t];
      if (v > best) {
        best = v;
        row = s;
      }
    }
    raw[t] = row;
  }
  const out = new Uint16Array(width);
  for (let t = 0; t < width; t++) {
    const lo = Math.max(0, t - 7);
    const hi = Math.min(width, t + 8);
    out[t] = median(raw.slice(lo, hi));
  }
  return out;
}

export interface LoadOptions {
  /** Full-resolution calibrated power (≈ 20 MB) instead of the 8-bit browse image (≈ 5 MB). */
  full: boolean;
  /** Delay rows kept below the deepest surface pick. */
  depthRows?: number;
  onProgress?: (fraction: number, label: string) => void;
  signal?: AbortSignal;
}

export async function loadSharadProduct(product: PDSProduct, opt: LoadOptions): Promise<CryoDataset> {
  const paths = productPaths(product);
  const { onProgress, signal } = opt;

  onProgress?.(0, 'Reading geometry table');
  const geomText = await (await fetchOk(paths.geometry, signal, 30_000)).text();
  const geom = parseGeometryTable(geomText);
  if (geom.length < 2) throw new PdsError('The geometry table for this product is empty.');

  onProgress?.(0.05, opt.full ? 'Downloading calibrated radargram' : 'Downloading browse image');
  const res = await fetchOk(opt.full ? paths.image : paths.browse, signal, 120_000);
  const buffer = await readWithProgress(res, f => onProgress?.(0.05 + 0.8 * f, opt.full ? 'Downloading calibrated radargram' : 'Downloading browse image'));

  onProgress?.(0.88, 'Decoding');
  const img = opt.full ? decodeRgramImg(buffer, geom.length) : decodeTiff(buffer);
  const width = Math.min(img.width, geom.length);

  // To dB. The browse image is already logarithmic over a 35 dB range.
  const fullDb = new Float32Array(width * img.height);
  let floor = Infinity;
  if (opt.full) {
    let positiveMin = Infinity;
    for (let i = 0; i < img.values.length; i++) if (img.values[i] > 0 && img.values[i] < positiveMin) positiveMin = img.values[i];
    floor = 10 * Math.log10(Number.isFinite(positiveMin) ? positiveMin : 1e-12);
  } else {
    floor = -BROWSE_RANGE_DB;
  }
  for (let s = 0; s < img.height; s++) {
    for (let t = 0; t < width; t++) {
      const v = img.values[s * img.width + t];
      fullDb[s * width + t] = opt.full ? (v > 0 ? 10 * Math.log10(v) : floor) : -BROWSE_RANGE_DB + BROWSE_RANGE_DB * v;
    }
  }

  onProgress?.(0.93, 'Finding the surface');
  const surfaceFull = pickSurface(fullDb, width, img.height);
  let top = img.height;
  let bottom = 0;
  for (let t = 0; t < width; t++) {
    top = Math.min(top, surfaceFull[t]);
    bottom = Math.max(bottom, surfaceFull[t]);
  }
  const depthRows = opt.depthRows ?? 1200;
  const r0 = Math.max(0, top - 64);
  const r1 = Math.min(img.height, bottom + depthRows);
  const height = r1 - r0;
  const data = fullDb.slice(r0 * width, r1 * width);
  const surface = new Uint16Array(width);
  for (let t = 0; t < width; t++) surface[t] = surfaceFull[t] - r0;

  let powerMin = Infinity;
  let powerMax = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < powerMin) powerMin = data[i];
    if (data[i] > powerMax) powerMax = data[i];
  }

  const latitudes = new Float64Array(width);
  const longitudes = new Float64Array(width);
  const surfaceElevation = new Float32Array(width);
  const spacecraftAltitude = new Float32Array(width);
  for (let t = 0; t < width; t++) {
    const g = geom[t];
    latitudes[t] = g.latitude;
    longitudes[t] = ((g.longitude % 360) + 360) % 360;
    surfaceElevation[t] = (g.marsRadiusKm - REFERENCE_RADIUS_KM) * 1000;
    spacecraftAltitude[t] = (g.spacecraftRadiusKm - g.marsRadiusKm) * 1000;
  }

  onProgress?.(1, 'Done');
  return {
    metadata: {
      instrument: 'SHARAD',
      source: 'pds',
      orbitNumber: product.orbitNumber,
      productId: product.productId,
      acquisitionDate: product.observationTime.slice(0, 10),
      region: `${product.centerLat.toFixed(1)}°, ${product.centerLon.toFixed(1)}°E`,
      title: `SHARAD ${product.productId.replace(/_rgram$/i, '').toUpperCase()}`,
      description: opt.full
        ? 'Calibrated SHARAD radargram (RGRAM.IMG), US team processing, converted to dB. Power units are arbitrary but consistent across the archive.'
        : 'SHARAD browse radargram (8-bit TIFF, 35 dB range). Good for looking; power ratios above about 30 dB are clipped.',
      centerLat: product.centerLat,
      centerLon: product.centerLon,
      frequencyHz: SHARAD.centerFrequencyHz,
      references: [
        { authors: 'Seu, R. et al.', year: 2007, title: 'SHARAD sounding radar on the Mars Reconnaissance Orbiter', journal: 'JGR 112, E05S05', doi: '10.1029/2006JE002745' },
        { authors: 'Campbell, B.A.', year: 2021, title: 'MRO SHARAD US radargram archive, version 2', journal: 'NASA Planetary Data System, MRO-M-SHARAD-5-RADARGRAM-V2.0' },
      ],
      calibration: opt.full ? 'relative' : 'display',
    },
    geometry: { latitudes, longitudes, surfaceElevation, spacecraftAltitude },
    radargram: {
      width,
      height,
      sampleInterval: SHARAD.sampleIntervalS,
      traceSpacingM: SHARAD.traceSpacingM,
      data,
      powerMin,
      powerMax,
    },
    surfaceEcho: { indices: surface },
  };
}
