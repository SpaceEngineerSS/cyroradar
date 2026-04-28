/* CRYORADAR — PDS ODE REST API Client
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Queries NASA's Planetary Data System Orbital Data Explorer (ODE)
 * for real SHARAD/MARSIS radargram products.
 * API Docs: https://oderest.rsl.wustl.edu/  */

import type {
  PDSProduct,
  PDSFileEntry,
  PDSGeometryRow,
  PDSSearchParams,
  PDSSearchResult,
} from '../../types/pds-types';

const ODE_BASE = 'https://oderest.rsl.wustl.edu/live2';

const INSTRUMENT_CONFIG = {
  SHARAD: { ihid: 'MRO', iid: 'SHARAD', rgramPt: 'USRDRV2', geomPt: 'USGEOMV2' },
  MARSIS: { ihid: 'MEX', iid: 'MARSIS', rgramPt: 'RADARCH', geomPt: 'GEOM' },
} as const;

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function buildOdeUrl(params: Record<string, string | number>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${ODE_BASE}/?${query}`;
}

function parseProduct(raw: Record<string, string>, instrument: 'SHARAD' | 'MARSIS'): PDSProduct {
  return {
    productId: raw.Product_name?.replace(/\.\w+$/, '') ?? '',
    productName: raw.Product_name ?? '',
    description: raw.Description ?? '',
    instrument,
    orbitNumber: parseInt(raw.Start_orbit_number ?? '0', 10),
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
    filesUrl: raw.FilesURL ?? '',
  };
}

export async function searchProducts(params: PDSSearchParams): Promise<PDSSearchResult> {
  const cacheKey = `search:${JSON.stringify(params)}`;
  const cached = getCached<PDSSearchResult>(cacheKey);
  if (cached) return cached;

  const cfg = INSTRUMENT_CONFIG[params.instrument];
  const url = buildOdeUrl({
    target: 'mars',
    query: 'products',
    results: 'm',
    output: 'JSON',
    ihid: cfg.ihid,
    iid: cfg.iid,
    pt: cfg.rgramPt,
    minlat: params.minLat,
    maxlat: params.maxLat,
    westlon: params.westLon,
    eastlon: params.eastLon,
    limit: params.limit ?? 20,
  });

  const response = await fetch(url);
  if (!response.ok) throw new Error(`PDS ODE query failed: ${response.status}`);

  const json = await response.json();

  if (json.ODEResults?.Status === 'ERROR') {
    throw new Error(`PDS ODE error: ${json.ODEResults.Error}`);
  }

  const rawProducts = json.ODEResults?.Products?.Product;
  const products: PDSProduct[] = [];

  if (rawProducts) {
    const list = Array.isArray(rawProducts) ? rawProducts : [rawProducts];
    for (const raw of list) {
      products.push(parseProduct(raw, params.instrument));
    }
  }

  const result: PDSSearchResult = {
    products,
    totalCount: products.length,
    queryTime: json.ODEResults?.QuerySummary?.Query_Elapsed_Time ?? '',
  };

  setCache(cacheKey, result);
  return result;
}

export async function getProductFiles(filesUrl: string): Promise<PDSFileEntry[]> {
  const cacheKey = `files:${filesUrl}`;
  const cached = getCached<PDSFileEntry[]>(cacheKey);
  if (cached) return cached;

  const separator = filesUrl.includes('?') ? '&' : '?';
  const rawUrl = `${filesUrl}${separator}output=JSON`;
  const url = rawUrl.replace('https://ode.rsl.wustl.edu', '/pds-ode-files');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PDS file listing failed: ${response.status}`);

  const json = await response.json();
  const rawFiles = json.ODEResults?.Products?.Product?.Product_files?.Product_file;
  const entries: PDSFileEntry[] = [];

  if (rawFiles) {
    const list = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
    for (const f of list) {
      const filename = f.FileName ?? '';
      const url = f.URL ?? '';
      entries.push({
        url,
        filename,
        type: classifyFile(filename),
        sizeBytes: f.FileSize ? parseInt(f.FileSize, 10) : undefined,
      });
    }
  }

  setCache(cacheKey, entries);
  return entries;
}

function classifyFile(filename: string): PDSFileEntry['type'] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')
    || lower.includes('browse') || lower.includes('thumb')) return 'browse';
  if (lower.endsWith('.xml') || lower.endsWith('.lbl')) return 'label';
  if (lower.includes('geom') || lower.endsWith('.tab') || lower.endsWith('.csv')) return 'geometry';
  if (lower.endsWith('.img') || lower.endsWith('.dat')) return 'data';
  return 'other';
}

export async function fetchBrowseImageUrl(product: PDSProduct): Promise<string | null> {
  const files = await getProductFiles(product.filesUrl);
  const browse = files.find(f => f.type === 'browse');
  if (!browse) return null;
  return proxyPdsDataUrl(browse.url);
}

function proxyPdsDataUrl(url: string): string {
  return url.replace('https://pds-geosciences.wustl.edu', '/pds-data');
}

export function buildRadargramImageUrl(product: PDSProduct): string {
  const baseId = product.productId.replace(/_rgram$/, '');
  const prefix = baseId.substring(0, 8);
  const group = prefix.replace(/\d{2}$/, 'xx');
  return `/pds-data/mro/mro-m-sharad-5-radargram-v2/mrosh_2101/browse/tiff/${group}/${baseId}_tiff.tif`;
}

export function buildGeometryUrl(product: PDSProduct): string {
  const baseId = product.productId.replace(/_rgram$/, '');
  const prefix = baseId.substring(0, 8);
  const group = prefix.replace(/\d{2}$/, 'xx');
  return `/pds-data/mro/mro-m-sharad-5-radargram-v2/mrosh_2101/data/geom/${group}/${baseId}_geom.csv`;
}

function readUint16(dv: DataView, offset: number, le: boolean): number {
  return dv.getUint16(offset, le);
}

function readUint32(dv: DataView, offset: number, le: boolean): number {
  return dv.getUint32(offset, le);
}

function decodeTiffToCanvas(buffer: ArrayBuffer): { width: number; height: number; data: Uint8ClampedArray } {
  const dv = new DataView(buffer);
  const magic = dv.getUint16(0, true);
  const le = magic === 0x4949;

  if (readUint16(dv, 2, le) !== 42) {
    throw new Error('Not a valid TIFF file');
  }

  const ifdOffset = readUint32(dv, 4, le);
  const tagCount = readUint16(dv, ifdOffset, le);

  let width = 0, height = 0, bitsPerSample = 8, stripOffsets: number[] = [];
  let rowsPerStrip = 0, samplesPerPixel = 1;

  for (let i = 0; i < tagCount; i++) {
    const tagOffset = ifdOffset + 2 + i * 12;
    const tag = readUint16(dv, tagOffset, le);
    const type = readUint16(dv, tagOffset + 2, le);
    const count = readUint32(dv, tagOffset + 4, le);
    const valueOffset = tagOffset + 8;

    const readValue = () => {
      if (type === 3) return readUint16(dv, valueOffset, le);
      return readUint32(dv, valueOffset, le);
    };

    const readArray = (): number[] => {
      const arr: number[] = [];
      const size = type === 3 ? 2 : 4;
      const dataOff = count * size > 4 ? readUint32(dv, valueOffset, le) : valueOffset;
      for (let j = 0; j < count; j++) {
        arr.push(type === 3
          ? readUint16(dv, dataOff + j * size, le)
          : readUint32(dv, dataOff + j * size, le));
      }
      return arr;
    };

    switch (tag) {
      case 256: width = readValue(); break;
      case 257: height = readValue(); break;
      case 258: bitsPerSample = readValue(); break;
      case 273: stripOffsets = count === 1 ? [readValue()] : readArray(); break;
      case 277: samplesPerPixel = readValue(); break;
      case 278: rowsPerStrip = readValue(); break;
      case 279: break;
    }
  }

  if (!rowsPerStrip) rowsPerStrip = height;

  const pixelData = new Uint8ClampedArray(width * height * 4);
  const bytesPerPixel = (bitsPerSample / 8) * samplesPerPixel;
  const src = new Uint8Array(buffer);

  let dstRow = 0;
  for (let s = 0; s < stripOffsets.length; s++) {
    const off = stripOffsets[s];
    const rows = Math.min(rowsPerStrip, height - dstRow);

    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = off + (r * width + x) * bytesPerPixel;
        const dstIdx = ((dstRow + r) * width + x) * 4;

        if (samplesPerPixel >= 3) {
          pixelData[dstIdx] = src[srcIdx];
          pixelData[dstIdx + 1] = src[srcIdx + 1];
          pixelData[dstIdx + 2] = src[srcIdx + 2];
          pixelData[dstIdx + 3] = 255;
        } else {
          const val = bitsPerSample === 16
            ? (le ? src[srcIdx] | (src[srcIdx + 1] << 8) : (src[srcIdx] << 8) | src[srcIdx + 1]) >> 8
            : src[srcIdx];
          pixelData[dstIdx] = val;
          pixelData[dstIdx + 1] = val;
          pixelData[dstIdx + 2] = val;
          pixelData[dstIdx + 3] = 255;
        }
      }
    }
    dstRow += rows;
  }

  return { width, height, data: pixelData };
}

export async function fetchRadargramAsImageData(product: PDSProduct): Promise<{
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
} | null> {
  const url = buildRadargramImageUrl(product);
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const { width, height, data } = decodeTiffToCanvas(buffer);
    return { width, height, pixels: data };
  } catch {
    return null;
  }
}

export async function fetchGeometry(url: string): Promise<PDSGeometryRow[]> {
  const cacheKey = `geom:${url}`;
  const cached = getCached<PDSGeometryRow[]>(cacheKey);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) return [];

  const text = await response.text();
  const rows: PDSGeometryRow[] = [];

  const lines = text.trim().split('\n');
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim());
    if (parts.length < 7) continue;
    const lat = parseFloat(parts[1]);
    if (isNaN(lat)) continue;

    rows.push({
      traceNumber: parseInt(parts[0], 10) || i,
      latitude: lat,
      longitude: parseFloat(parts[2]) || 0,
      marsRadius: parseFloat(parts[3]) || 3389500,
      surfaceElevation: parseFloat(parts[4]) || 0,
      spacecraftAltitude: parseFloat(parts[5]) || 300000,
      solarZenithAngle: parseFloat(parts[6]) || 0,
    });
  }

  setCache(cacheKey, rows);
  return rows;
}

export function footprintToLatLon(wkt: string): { lat: number; lon: number }[] {
  const coordMatch = wkt.match(/LINESTRING\s*\(([^)]+)\)/);
  if (!coordMatch) return [];
  return coordMatch[1].split(',').map(pair => {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    return { lat, lon };
  });
}
