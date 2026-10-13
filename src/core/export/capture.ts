/* Saves what is on screen in the main view as a PNG, framed with a caption,
 * a colour scale and the source, so the image can stand on its own in a
 * report or a slide. Works for every view because it composites whatever
 * canvases the plot contains, exactly as drawn. */

import { useApp } from '../../store/app';
import { displayField } from '../../store/derived';
import { getColormap } from '../colormaps/colormaps';

const HEADER = 44;
const FOOTER = 40;

export function renderPlotImage(scale = Math.min(2, window.devicePixelRatio || 1)): HTMLCanvasElement {
  const main = document.getElementById('main-view');
  const plots = Array.from(main?.querySelectorAll<HTMLElement>('.plot') ?? []).filter(p => p.offsetWidth > 0 && p.offsetHeight > 0);
  if (plots.length === 0) throw new Error('Nothing to save: open a radargram first.');

  const box = plots.reduce(
    (acc, p) => {
      const r = p.getBoundingClientRect();
      return { left: Math.min(acc.left, r.left), top: Math.min(acc.top, r.top), right: Math.max(acc.right, r.right), bottom: Math.max(acc.bottom, r.bottom) };
    },
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );
  const w = Math.round(box.right - box.left);
  const h = Math.round(box.bottom - box.top);
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale);
  out.height = Math.round((h + HEADER + FOOTER) * scale);
  const ctx = out.getContext('2d')!;
  ctx.scale(scale, scale);

  const s = useApp.getState();
  const ds = s.dataset;
  ctx.fillStyle = '#121110';
  ctx.fillRect(0, 0, w, h + HEADER + FOOTER);

  for (const p of plots) {
    const r = p.getBoundingClientRect();
    ctx.fillStyle = '#080807';
    ctx.fillRect(r.left - box.left, HEADER + r.top - box.top, r.width, r.height);
    for (const c of Array.from(p.querySelectorAll('canvas'))) {
      const cr = c.getBoundingClientRect();
      if (c.width === 0 || c.height === 0) continue;
      ctx.drawImage(c, cr.left - box.left, HEADER + cr.top - box.top, cr.width, cr.height);
    }
  }

  // Caption.
  ctx.fillStyle = '#ece7dd';
  ctx.font = '600 15px "IBM Plex Sans Variable", "IBM Plex Sans", sans-serif';
  ctx.fillText(ds?.metadata.title ?? 'CryoRadar', 14, 20);
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#a59e92';
  if (ds) {
    const m = ds.metadata;
    const parts = [
      m.instrument,
      m.orbitNumber ? `orbit ${m.orbitNumber}` : '',
      m.source === 'synthetic' ? 'simulated' : m.source === 'pds' ? `PDS ${m.productId}` : m.productId,
      s.statics ? 'static correction' : '',
      s.variant === 'migrated' && s.migration.result ? 'migrated' : '',
    ].filter(Boolean);
    ctx.fillText(parts.join('  ·  '), 14, 36);
  }

  // Colour scale and attribution.
  const y0 = HEADER + h + 12;
  const f = displayField(s, s.variant);
  if (f && s.mainView === 'radargram') {
    const lut = getColormap(s.colormap).rgba;
    const barW = Math.min(220, w * 0.4);
    for (let i = 0; i < barW; i++) {
      const k = Math.round((i / (barW - 1)) * 255) * 4;
      ctx.fillStyle = `rgb(${lut[k]},${lut[k + 1]},${lut[k + 2]})`;
      ctx.fillRect(14 + i, y0, 1, 8);
    }
    const span = f.powerMax - f.powerMin;
    ctx.fillStyle = '#a59e92';
    ctx.fillText(`${(f.powerMin + s.contrast[0] * span).toFixed(1)} dB`, 14, y0 + 22);
    const hiLabel = `${(f.powerMin + s.contrast[1] * span).toFixed(1)} dB`;
    ctx.fillText(hiLabel, 14 + barW - ctx.measureText(hiLabel).width, y0 + 22);
  }
  const credit = `CryoRadar ${__APP_VERSION__}  ·  ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  ctx.fillStyle = '#878075';
  ctx.fillText(credit, w - ctx.measureText(credit).width - 14, y0 + 22);
  return out;
}

export async function capturePlot(): Promise<void> {
  const canvas = renderPlotImage();
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('The browser could not encode the image.');
  const id = useApp.getState().dataset?.metadata.productId.toLowerCase() ?? 'cryoradar';
  const { downloadBlob } = await import('../../features/session');
  downloadBlob(blob, `${id}-${useApp.getState().mainView}.png`);
}
