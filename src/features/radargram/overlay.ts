/* Everything drawn on top of the radargram image, in one pass. All positions
 * are kept in data coordinates (trace, data row) and converted here, so static
 * correction and pan/zoom apply to annotations exactly as they do to pixels. */

import type { AnomalyResult, CryoDataset, FWIResult, ROIBounds, SubsurfaceLayer, UQResult, PolSARResult } from '../../types/types';
import type { DetectionSegment } from '../../core/analysis/anomaly-detector';
import type { Overlays, RowPoint } from '../../store/app';
import type { Viewport, Cursor } from '../../store/viewport';
import { depthToTime, timeToDepth, type VelocityLayer } from '../../core/physics/depth-conversion';
import { getMaterial } from '../../core/physics/dielectric';
import { getColormap, colorIndex } from '../../core/colormaps/colormaps';

export interface Palette {
  ink: string;
  dim: string;
  faint: string;
  line: string;
  accent: string;
  signal: string;
  water: string;
  ice: string;
  clay: string;
  clutter: string;
  danger: string;
}

export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const g = (n: string) => cs.getPropertyValue(n).trim();
  // Annotations sit on the dark plot well in both themes, so use dark-theme inks.
  return {
    ink: '#ece7dd',
    dim: '#a59e92',
    faint: 'rgba(236,231,221,0.38)',
    line: 'rgba(236,231,221,0.14)',
    accent: g('--c-accent') || '#d9692f',
    signal: '#e2a43b',
    water: '#7fb0de',
    ice: '#b4ccd6',
    clay: '#a9b673',
    clutter: '#c99ac0',
    danger: '#e57a62',
  };
}

export interface OverlayInput {
  dataset: CryoDataset;
  shifts: Int16Array | null;
  overlays: Overlays;
  model: VelocityLayer[];
  bulkPermittivity: number;
  layers: SubsurfaceLayer[];
  activeLayer: number | null;
  anomalies: AnomalyResult[];
  segments: DetectionSegment[];
  selectedSegment: number | null;
  uq: UQResult[];
  roi: ROIBounds | null;
  roiDraft: ROIBounds | null;
  measure: { a: RowPoint; b: RowPoint | null } | null;
  hover: Cursor | null;
  pinnedTrace: number | null;
  polsar: PolSARResult | null;
  fwi: FWIResult | null;
  fwiLive: { permittivity: Float32Array; nx: number; nz: number } | null;
  palette: Palette;
  showAxes: boolean;
}

const MONO = '500 10.5px "IBM Plex Mono", ui-monospace, monospace';
const SANS = '500 11px "IBM Plex Sans Variable", "IBM Plex Sans", sans-serif';

const CLASS_COLOR = (p: Palette, cls: AnomalyResult['classification']) =>
  cls === 'liquid-water' ? p.water : cls === 'wet-sediment' ? p.ice : cls === 'hydrated' ? p.clay : p.dim;

/** Nice tick step for a span. */
function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

/* Cached colourised images for PolSAR and FWI overlays. */
const imageCache = new WeakMap<object, HTMLCanvasElement>();

function polsarImage(p: PolSARResult, which: 'entropy' | 'alpha'): HTMLCanvasElement {
  const key = which === 'entropy' ? p.entropy : p.alpha;
  const hit = imageCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = p.width;
  c.height = p.height;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(p.width, p.height);
  const px = new Uint32Array(img.data.buffer);
  const lut = getColormap(which === 'entropy' ? 'viridis' : 'diverging').packed;
  const hi = which === 'entropy' ? 1 : Math.PI / 2;
  for (let i = 0; i < key.length; i++) px[i] = lut[colorIndex(key[i], 0, hi)];
  ctx.putImageData(img, 0, 0);
  imageCache.set(key, c);
  return c;
}

function fwiImage(eps: Float32Array, nx: number, nz: number): HTMLCanvasElement {
  const hit = imageCache.get(eps);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = nx;
  c.height = nz;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(nx, nz);
  const px = new Uint32Array(img.data.buffer);
  const lut = getColormap('magma').packed;
  for (let i = 0; i < eps.length; i++) px[i] = lut[colorIndex(Math.log(eps[i]), Math.log(1.5), Math.log(40))];
  ctx.putImageData(img, 0, 0);
  imageCache.set(eps, c);
  return c;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, v: Viewport, input: OverlayInput) {
  const { dataset, shifts, overlays, palette: P } = input;
  const { width: W, height: H, sampleInterval: dt } = dataset.radargram;
  const surf = dataset.surfaceEcho.indices;
  const shiftAt = (t: number) => (shifts ? shifts[Math.max(0, Math.min(W - 1, t))] : 0);
  const sx = (t: number) => v.offsetX + t * v.scaleX;
  const sy = (row: number, t: number) => v.offsetY + (row - shiftAt(t)) * v.scaleY;
  const t0 = Math.max(0, Math.floor(-v.offsetX / v.scaleX));
  const t1 = Math.min(W - 1, Math.ceil((v.width - v.offsetX) / v.scaleX));
  const stepT = Math.max(1, Math.floor((t1 - t0) / Math.max(1, v.width / 2)));

  ctx.clearRect(0, 0, v.width, v.height);
  ctx.lineJoin = 'round';

  const polyline = (rowAt: (t: number) => number | null, from = t0, to = t1) => {
    ctx.beginPath();
    let pen = false;
    for (let t = from; t <= to; t += stepT) {
      const r = rowAt(t);
      if (r == null) {
        pen = false;
        continue;
      }
      const x = sx(t + 0.5);
      const y = sy(r + 0.5, t);
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
  };

  /* Polarimetry and inversion images sit under the line work. */
  if (input.polsar && overlays.polsar !== 'off') {
    const p = input.polsar;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.imageSmoothingEnabled = false;
    if (!shifts) ctx.drawImage(polsarImage(p, overlays.polsar), sx(0), v.offsetY, W * v.scaleX, H * v.scaleY);
    else {
      // Shifted traces: draw column strips so the overlay follows static correction.
      const img = polsarImage(p, overlays.polsar);
      for (let x = 0; x < p.width; x++) {
        const t = x * p.stepX;
        ctx.drawImage(img, x, 0, 1, p.height, sx(t), sy(0, t), p.stepX * v.scaleX + 0.5, p.height * p.stepY * v.scaleY);
      }
    }
    ctx.restore();
  }

  const inv = input.fwiLive ?? (input.fwi && overlays.inversion ? { permittivity: input.fwi.permittivity, nx: input.fwi.nx, nz: input.fwi.nz } : null);
  const invRoi = input.fwi?.roi ?? input.roi;
  if (inv && invRoi) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.imageSmoothingEnabled = false;
    const x0 = sx(invRoi.traceStart);
    const y0 = sy(invRoi.sampleStart, Math.round((invRoi.traceStart + invRoi.traceEnd) / 2));
    ctx.drawImage(fwiImage(inv.permittivity, inv.nx, inv.nz), x0, y0, (invRoi.traceEnd - invRoi.traceStart) * v.scaleX, (invRoi.sampleEnd - invRoi.sampleStart) * v.scaleY);
    ctx.restore();
  }

  /* Depth contours that follow the surface. */
  if (overlays.depthGrid) {
    const medianSurf = surf[Math.floor(W / 2)] ?? 0;
    const maxDepth = timeToDepth((H - medianSurf) * dt, input.model, input.bulkPermittivity);
    const pxPerM = (v.scaleY * (depthToTime(100, input.model, input.bulkPermittivity) / dt)) / 100;
    const step = niceStep(maxDepth, Math.max(2, (H * v.scaleY) / 70));
    ctx.font = MONO;
    ctx.lineWidth = 1;
    for (let d = step; d < maxDepth; d += step) {
      const off = depthToTime(d, input.model, input.bulkPermittivity) / dt;
      ctx.strokeStyle = P.line;
      ctx.setLineDash([2, 4]);
      polyline(t => surf[t] + off);
      ctx.setLineDash([]);
      if (input.showAxes) {
        const tl = Math.min(t1, Math.max(t0, t0 + 2));
        const y = sy(surf[tl] + off, tl);
        if (y > 12 && y < v.height - 4 && pxPerM * step > 14) {
          ctx.fillStyle = P.faint;
          ctx.fillText(`${d >= 1000 ? `${d / 1000} km` : `${d} m`}`, sx(tl) + 6, y - 3);
        }
      }
    }
  }

  /* Surface pick. */
  if (overlays.topography) {
    ctx.strokeStyle = P.accent;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.25;
    polyline(t => surf[t]);
    ctx.globalAlpha = 1;
  }

  /* Model interfaces from the synthetic generator. */
  if (overlays.truth && dataset.truth) {
    ctx.strokeStyle = P.ice;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    for (const iface of dataset.truth.interfaces) polyline(t => iface[t]);
    ctx.setLineDash([]);
  }

  /* Picked horizons. */
  if (overlays.picks) {
    input.layers.forEach((layer, li) => {
      if (layer.picks.length === 0) return;
      const color = getMaterial(layer.materialId)?.color ?? P.signal;
      const active = li === input.activeLayer;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = active ? 1.75 : 1.25;
      ctx.beginPath();
      layer.picks.forEach((p, i) => {
        const x = sx(p.traceIndex + 0.5);
        const y = sy(p.sampleIndex + 0.5, p.traceIndex);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      for (const p of layer.picks) {
        const x = sx(p.traceIndex + 0.5);
        const y = sy(p.sampleIndex + 0.5, p.traceIndex);
        ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      }
      const last = layer.picks[layer.picks.length - 1];
      ctx.font = SANS;
      ctx.fillText(layer.label ?? getMaterial(layer.materialId)?.nameShort ?? `Layer ${li + 1}`, sx(last.traceIndex) + 8, sy(last.sampleIndex, last.traceIndex) - 6);
    });
  }

  /* Detections. */
  if (overlays.detections && input.anomalies.length) {
    for (const a of input.anomalies) {
      if (a.traceIndex < t0 - 1 || a.traceIndex > t1 + 1) continue;
      ctx.fillStyle = CLASS_COLOR(P, a.classification);
      const x = sx(a.traceIndex + 0.5);
      const y = sy(a.sampleIndex + 0.5, a.traceIndex);
      ctx.fillRect(x - 1, y - 1, Math.max(2, v.scaleX), 2);
    }
    ctx.font = MONO;
    input.segments.forEach((seg, i) => {
      const a = input.anomalies[seg.representative];
      const x0 = sx(seg.traceStart);
      const x1 = sx(seg.traceEnd + 1);
      if (x1 < 0 || x0 > v.width) return;
      let minRow = Infinity;
      for (let k = 0; k < input.anomalies.length; k++) {
        const b = input.anomalies[k];
        if (b.traceIndex >= seg.traceStart && b.traceIndex <= seg.traceEnd) minRow = Math.min(minRow, b.sampleIndex - shiftAt(b.traceIndex));
      }
      const y = v.offsetY + minRow * v.scaleY - 10;
      const selected = i === input.selectedSegment;
      ctx.strokeStyle = selected ? P.signal : P.dim;
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x0, y + 4);
      ctx.lineTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.lineTo(x1, y + 4);
      ctx.stroke();
      ctx.fillStyle = selected ? P.signal : P.dim;
      ctx.fillText(segmentLetter(i), x0, y - 4);

      // Uncertainty bar at the strongest member.
      const uq = input.uq.find(r => r.anomalyIndex === i);
      if (overlays.confidence && uq) {
        const s0 = surf[a.traceIndex];
        const rTop = s0 + depthToTime(uq.percentile5, [], input.bulkPermittivity) / dt;
        const rBot = s0 + depthToTime(uq.percentile95, [], input.bulkPermittivity) / dt;
        const x = sx(a.traceIndex + 0.5);
        ctx.strokeStyle = P.signal;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(x, sy(rTop, a.traceIndex));
        ctx.lineTo(x, sy(rBot, a.traceIndex));
        ctx.moveTo(x - 4, sy(rTop, a.traceIndex));
        ctx.lineTo(x + 4, sy(rTop, a.traceIndex));
        ctx.moveTo(x - 4, sy(rBot, a.traceIndex));
        ctx.lineTo(x + 4, sy(rBot, a.traceIndex));
        ctx.stroke();
      }
    });
  }

  /* Region of interest. */
  const roiBox = (r: ROIBounds, draft: boolean) => {
    const x = sx(r.traceStart);
    // A box cannot follow per-trace shifts; anchor it at its centre trace.
    const y = sy(r.sampleStart, Math.round((r.traceStart + r.traceEnd) / 2));
    const w = (r.traceEnd - r.traceStart) * v.scaleX;
    const h = (r.sampleEnd - r.sampleStart) * v.scaleY;
    ctx.strokeStyle = P.accent;
    ctx.lineWidth = 1.25;
    ctx.setLineDash(draft ? [3, 3] : [6, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.font = MONO;
    ctx.fillStyle = P.accent;
    ctx.fillText(`ROI ${r.traceEnd - r.traceStart} × ${r.sampleEnd - r.sampleStart}`, x + 2, y - 5);
  };
  if (input.roi) roiBox(input.roi, false);
  if (input.roiDraft) roiBox(input.roiDraft, true);

  /* Measurement. */
  if (input.measure) {
    const { a, b } = input.measure;
    const ax = sx(a.trace + 0.5);
    const ay = sy(a.row + 0.5, a.trace);
    ctx.strokeStyle = P.signal;
    ctx.fillStyle = P.signal;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(ax, ay, 3, 0, Math.PI * 2);
    ctx.stroke();
    if (b) {
      const bx = sx(b.trace + 0.5);
      const by = sy(b.row + 0.5, b.trace);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.stroke();
      const m = measureBetween(dataset, a, b, input.model, input.bulkPermittivity);
      const label = `Δt ${m.dtUs.toFixed(2)} µs   Δz ${m.dz.toFixed(0)} m   Δx ${(m.dx / 1000).toFixed(2)} km`;
      ctx.font = MONO;
      const tw = ctx.measureText(label).width;
      const lx = Math.min(v.width - tw - 10, Math.max(6, (ax + bx) / 2 - tw / 2));
      const ly = Math.max(16, Math.min(ay, by) - 10);
      ctx.fillStyle = 'rgba(8,8,7,0.82)';
      ctx.fillRect(lx - 4, ly - 12, tw + 8, 17);
      ctx.fillStyle = P.signal;
      ctx.fillText(label, lx, ly);
    }
  }

  /* Pinned and hovered traces. */
  if (input.pinnedTrace != null) {
    const x = Math.round(sx(input.pinnedTrace + 0.5)) + 0.5;
    ctx.strokeStyle = P.signal;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, v.height);
    ctx.stroke();
  }
  if (input.hover) {
    const x = Math.round(sx(input.hover.trace + 0.5)) + 0.5;
    const y = Math.round(v.offsetY + (input.hover.row + 0.5) * v.scaleY) + 0.5;
    ctx.strokeStyle = 'rgba(236,231,221,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, v.height);
    ctx.moveTo(0, y);
    ctx.lineTo(v.width, y);
    ctx.stroke();
  }

  if (input.showAxes) drawAxes(ctx, v, dataset, P);
}

/** Time axis on the left (µs from the window top) and distance along the bottom. */
function drawAxes(ctx: CanvasRenderingContext2D, v: Viewport, dataset: CryoDataset, P: Palette) {
  const { width: W, height: H, sampleInterval: dt, traceSpacingM } = dataset.radargram;
  ctx.font = MONO;
  ctx.fillStyle = P.faint;
  ctx.strokeStyle = P.faint;
  ctx.lineWidth = 1;

  const totalUs = H * dt * 1e6;
  const stepUs = niceStep(totalUs, Math.max(2, (H * v.scaleY) / 60));
  for (let us = 0; us <= totalUs; us += stepUs) {
    const y = Math.round(v.offsetY + (us / (dt * 1e6)) * v.scaleY) + 0.5;
    if (y < 10 || y > v.height - 18) continue;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(5, y);
    ctx.stroke();
    ctx.fillText(`${Number(us.toFixed(2))}`, 8, y + 3.5);
  }
  ctx.fillText('µs', 8, 12);

  const totalKm = (W * traceSpacingM) / 1000;
  const stepKm = niceStep(totalKm, Math.max(2, (W * v.scaleX) / 110));
  for (let km = 0; km <= totalKm; km += stepKm) {
    const x = Math.round(v.offsetX + ((km * 1000) / traceSpacingM) * v.scaleX) + 0.5;
    if (x < 30 || x > v.width - 30) continue;
    ctx.beginPath();
    ctx.moveTo(x, v.height);
    ctx.lineTo(x, v.height - 5);
    ctx.stroke();
    const label = `${Number(km.toFixed(1))}`;
    ctx.fillText(label, x - ctx.measureText(label).width / 2, v.height - 8);
  }
  ctx.fillText('km', v.width - 22, v.height - 8);
}

export function segmentLetter(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function measureBetween(dataset: CryoDataset, a: RowPoint, b: RowPoint, model: VelocityLayer[], bulk: number) {
  const { sampleInterval: dt, traceSpacingM } = dataset.radargram;
  const surf = dataset.surfaceEcho.indices;
  const da = timeToDepth((a.row - surf[a.trace]) * dt, model, bulk);
  const db = timeToDepth((b.row - surf[b.trace]) * dt, model, bulk);
  return {
    dtUs: Math.abs(b.row - a.row) * dt * 1e6,
    dz: Math.abs(db - da),
    dx: Math.abs(b.trace - a.trace) * traceSpacingM,
  };
}
