/* A-scope: power against delay for one trace, drawn vertically so it lines up
 * with the radargram. Shows the pinned trace and, while you hover the plot in
 * split layouts, the hovered one. */

import { useEffect, useRef } from 'react';
import { useApp } from '../../store/app';
import { cursor, useHover } from '../../store/viewport';
import { displayField } from '../../store/derived';
import { estimateNoiseFloorDb } from '../../core/analysis/anomaly-detector';
import { pixelRatio } from '../../app/perf';
import { Readout, EmptyState } from '../../ui/controls';

const PAD = { l: 52, r: 16, t: 18, b: 28 };

export default function AScopeView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataset = useApp(s => s.dataset);
  const pinned = useApp(s => s.pinnedTrace);
  const hover = useHover();
  const trace = pinned ?? hover?.trace ?? (dataset ? Math.floor(dataset.radargram.width / 2) : 0);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    let noise = NaN;
    let noiseFor: Float32Array | null = null;

    const draw = () => {
      frame = 0;
      const s = useApp.getState();
      const f = displayField(s, s.variant);
      const ds = s.dataset;
      if (!f || !ds) return;
      if (noiseFor !== f.data) {
        noise = estimateNoiseFloorDb(f.data, f.width, f.height);
        noiseFor = f.data;
      }
      const rect = host.getBoundingClientRect();
      const dpr = pixelRatio();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = rect.width;
      const H = rect.height;
      ctx.clearRect(0, 0, W, H);

      const lo = Math.floor((f.powerMin - 2) / 10) * 10;
      const hi = Math.ceil((f.powerMax + 2) / 10) * 10;
      const px = (db: number) => PAD.l + ((db - lo) / (hi - lo)) * (W - PAD.l - PAD.r);
      const py = (row: number) => PAD.t + (row / f.height) * (H - PAD.t - PAD.b);
      const dt = ds.radargram.sampleInterval;

      // Grid and axes.
      ctx.font = '500 10.5px "IBM Plex Mono", monospace';
      ctx.strokeStyle = 'rgba(236,231,221,0.08)';
      ctx.fillStyle = 'rgba(236,231,221,0.45)';
      ctx.lineWidth = 1;
      for (let db = lo; db <= hi; db += 10) {
        const x = Math.round(px(db)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, PAD.t);
        ctx.lineTo(x, H - PAD.b);
        ctx.stroke();
        ctx.fillText(String(db), x - 8, H - PAD.b + 14);
      }
      ctx.fillText('dB', W - PAD.r - 12, H - 6);
      const totalUs = f.height * dt * 1e6;
      const stepUs = totalUs > 40 ? 10 : totalUs > 16 ? 5 : totalUs > 6 ? 2 : 1;
      for (let us = 0; us <= totalUs; us += stepUs) {
        const y = Math.round(py(us / (dt * 1e6))) + 0.5;
        ctx.beginPath();
        ctx.moveTo(PAD.l, y);
        ctx.lineTo(W - PAD.r, y);
        ctx.stroke();
        ctx.fillText(`${us} µs`, 6, y + 3.5);
      }

      // Noise floor.
      ctx.strokeStyle = 'rgba(236,231,221,0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px(noise), PAD.t);
      ctx.lineTo(px(noise), H - PAD.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText('noise', px(noise) + 4, PAD.t + 10);

      const plotTrace = (t: number, color: string, width: number) => {
        const shift = f.shifts ? f.shifts[t] : 0;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let r = 0; r < f.height; r++) {
          const src = r + shift;
          const v = src >= 0 && src < f.height ? f.data[src * f.width + t] : f.powerMin;
          const x = px(v);
          const y = py(r);
          if (r) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      };

      const h = cursor.getState().hover;
      const pin = s.pinnedTrace;
      if (pin != null && h && h.trace !== pin) plotTrace(h.trace, 'rgba(236,231,221,0.35)', 1);
      const t = pin ?? h?.trace ?? Math.floor(f.width / 2);
      plotTrace(t, pin != null ? '#e2a43b' : '#ece7dd', 1.25);

      // Markers: surface echo and any detection on this trace.
      const shift = f.shifts ? f.shifts[t] : 0;
      const surf = ds.surfaceEcho.indices[t] - shift;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim() || '#d9692f';
      ctx.fillRect(W - PAD.r - 6, py(surf) - 1, 6, 2);
      ctx.fillText('surface', W - PAD.r - 52, py(surf) - 4);
      const det = s.anomalies.find(a => a.traceIndex === t);
      if (det) {
        ctx.fillStyle = '#7fb0de';
        const y = py(det.sampleIndex - shift);
        ctx.fillRect(W - PAD.r - 6, y - 1, 6, 2);
        ctx.fillText(`basal ε ${det.apparentPermittivity.toFixed(1)}`, W - PAD.r - 92, y - 4);
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    const unsubs = [
      cursor.subscribe(schedule),
      useApp.subscribe(s => [s.dataset, s.pinnedTrace, s.statics, s.variant, s.migration.result, s.anomalies] as const, schedule, { equalityFn: (a, b) => a.every((x, i) => x === b[i]) }),
    ];
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      unsubs.forEach(u => u());
    };
  }, []);

  if (!dataset) return <EmptyState icon="ascope" title="No radargram" />;
  const { geometry } = dataset;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line px-4 py-2.5">
        <Readout label={pinned != null ? 'Pinned trace' : 'Trace'} value={trace} tone={pinned != null ? 'signal' : undefined} />
        <Readout label="Latitude" value={`${geometry.latitudes[trace]?.toFixed(3)}°`} />
        <Readout label="Longitude" value={`${geometry.longitudes[trace]?.toFixed(3)}°E`} />
        <Readout label="Elevation" value={geometry.surfaceElevation[trace]?.toFixed(0)} unit="m" />
        <p className="ml-auto max-w-[44ch] text-2xs text-faint">
          {pinned != null ? 'Click the radargram again on the same trace to unpin.' : 'Click a trace on the radargram to pin it here.'}
        </p>
      </div>
      <div ref={hostRef} className="plot relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={`A-scope of trace ${trace}`} role="img" />
      </div>
    </div>
  );
}
