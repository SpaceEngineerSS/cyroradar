import { describe, it, expect } from 'vitest';
import { decodeTiff, parseGeometryTable, productPaths, footprintToLatLon, pickSurface, ellipsoidRadiusKm } from './pds-client';
import { parseMatrix } from './file-import';
import type { PDSProduct } from '../../types/pds-types';

/** Minimal little-endian, uncompressed, 8-bit greyscale TIFF. */
function tiff(width: number, height: number, pixels: number[]): ArrayBuffer {
  const entries = [
    [256, 3, 1, width], [257, 3, 1, height], [258, 3, 1, 8], [259, 3, 1, 1],
    [262, 3, 1, 1], [273, 4, 1, 0], [277, 3, 1, 1], [278, 3, 1, height],
  ];
  const ifdSize = 2 + entries.length * 12 + 4;
  const dataOffset = 8 + ifdSize;
  const buf = new ArrayBuffer(dataOffset + pixels.length);
  const dv = new DataView(buf);
  dv.setUint16(0, 0x4949);
  dv.setUint16(2, 42, true);
  dv.setUint32(4, 8, true);
  dv.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, count, value], i) => {
    const o = 10 + i * 12;
    dv.setUint16(o, tag, true);
    dv.setUint16(o + 2, type, true);
    dv.setUint32(o + 4, count, true);
    if (tag === 273) dv.setUint32(o + 8, dataOffset, true);
    else if (type === 3) dv.setUint16(o + 8, value, true);
    else dv.setUint32(o + 8, value, true);
  });
  new Uint8Array(buf, dataOffset).set(pixels);
  return buf;
}

describe('PDS client', () => {
  it('decodes a small greyscale TIFF', () => {
    const img = decodeTiff(tiff(3, 2, [0, 128, 255, 255, 0, 51]));
    expect(img.width).toBe(3);
    expect(img.height).toBe(2);
    expect(img.values[2]).toBeCloseTo(1, 6);
    expect(img.values[5]).toBeCloseTo(0.2, 6);
  });

  it('rejects non-TIFF data with a readable message', () => {
    expect(() => decodeTiff(new TextEncoder().encode('<html>not found</html>').buffer)).toThrow(/not a TIFF/);
  });

  it('parses a real SHARAD GEOM.TAB row', () => {
    const rows = parseGeometryTable('    1,2006-12-06T02:51:42.478,-74.8272,204.7308,3379.490,3626.133,  7.6448,3459.0000,114.30, 0.000\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].latitude).toBeCloseTo(-74.8272, 4);
    expect(rows[0].spacecraftRadiusKm - rows[0].marsRadiusKm).toBeCloseTo(246.643, 3);
  });

  it('turns polar planetary radius into a sensible elevation', () => {
    // GEOM.TAB at -74.83° reports 3379.49 km; that is about +0.5 km on the ellipsoid, not -17 km.
    const elev = (3379.49 - ellipsoidRadiusKm(-74.8272)) * 1000;
    expect(Math.abs(elev)).toBeLessThan(3000);
    expect(ellipsoidRadiusKm(0)).toBeCloseTo(3396.19, 6);
    expect(ellipsoidRadiusKm(90)).toBeCloseTo(3376.2, 6);
  });

  it('derives file paths from the label URL', () => {
    const p = productPaths({
      labelUrl: 'https://pds-geosciences.wustl.edu/mro/mro-m-sharad-5-radargram-v2/mrosh_2101/data/rgram/s_0016xx/s_00169001_rgram.xml',
    } as PDSProduct);
    expect(p.browse).toBe('/pds-data/mro/mro-m-sharad-5-radargram-v2/mrosh_2101/browse/tiff/s_0016xx/s_00169001_tiff.tif');
    expect(p.geometry).toBe('/pds-data/mro/mro-m-sharad-5-radargram-v2/mrosh_2101/data/geom/s_0016xx/s_00169001_geom.tab');
    expect(p.image.endsWith('s_00169001_rgram.img')).toBe(true);
  });

  it('reads line and polygon footprints', () => {
    expect(footprintToLatLon('LINESTRING (204.7 -74.8, 204.4 -75.2)')).toEqual([{ lat: -74.8, lon: 204.7 }, { lat: -75.2, lon: 204.4 }]);
    expect(footprintToLatLon('POLYGON ((1 2, 3 4, 5 6))')).toHaveLength(3);
  });

  it('picks the brightest row per column, ignoring a lone spike', () => {
    const W = 20;
    const H = 30;
    const db = new Float32Array(W * H).fill(-40);
    for (let t = 0; t < W; t++) db[12 * W + t] = -5;
    db[25 * W + 7] = 0;
    expect(Array.from(pickSurface(db, W, H)).every(v => v === 12)).toBe(true);
  });

  it('reads a numeric matrix with a header', () => {
    const m = parseMatrix('a,b,c\n1,2,3\n4,5,6\n');
    expect([m.width, m.height]).toEqual([3, 2]);
    expect(m.values[4]).toBe(5);
  });
});
