/* Ground track on a Mars graticule, with the surface profile underneath.
 * Polar tracks use an azimuthal equidistant projection centred on the pole,
 * everything else a local equirectangular frame. */

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../store/app';
import { cursor, useHover } from '../../store/viewport';
import { listSyntheticScenes } from '../../core/pipeline/synthetic-generator';
import { PDS_REGIONS } from '../../types/pds-types';
import { pixelRatio } from '../../app/perf';
import { Segmented, EmptyState, Readout } from '../../ui/controls';

type Frame = 'local' | 'global';
const scenes = listSyntheticScenes();

const MONO = '500 10.5px "IBM Plex Mono", monospace';

function drawMap(ctx: CanvasRenderingContext2D, W: number, H: number, frame: Frame) {
  const s = useApp.getState();
  const ds = s.dataset!;
  const { latitudes: lat, longitudes: lon } = ds.geometry;
  const n = lat.length;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim() || '#d9692f';
  ctx.clearRect(0, 0, W, H);

  const meanLat = lat.reduce((a, b) => a + b, 0) / n;
  const polar = frame === 'local' && Math.abs(meanLat) > 70;
  let project: (la: number, lo: number) => [number, number];

  if (polar) {
    const sign = Math.sign(meanLat);
    let maxColat = 0;
    for (let i = 0; i < n; i++) maxColat = Math.max(maxColat, 90 - sign * lat[i]);
    const R = (Math.min(W, H) / 2 - 24) / Math.max(4, maxColat * 1.25);
    project = (la, lo) => {
      const r = (90 - sign * la) * R;
      const th = ((lo - 90) * Math.PI) / 180;
      return [W / 2 + r * Math.cos(th), H / 2 + sign * r * Math.sin(th)];
    };
    ctx.strokeStyle = 'rgba(236,231,221,0.1)';
    ctx.fillStyle = 'rgba(236,231,221,0.42)';
    ctx.font = MONO;
    ctx.lineWidth = 1;
    for (let c = 2; c <= maxColat * 1.25; c += 2) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, c * R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(`${sign * (90 - c)}°`, W / 2 + 3, H / 2 - c * R - 3);
    }
    for (let lo = 0; lo < 360; lo += 30) {
      const [x, y] = project(sign * (90 - maxColat * 1.25), lo);
      ctx.beginPath();
      ctx.moveTo(W / 2, H / 2);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillText(`${lo}°`, x + (x > W / 2 ? 4 : -28), y + 4);
    }
  } else {
    let la0 = -90;
    let la1 = 90;
    let lo0 = 0;
    let lo1 = 360;
    if (frame === 'local') {
      la0 = Math.min(...lat) - 4;
      la1 = Math.max(...lat) + 4;
      // Unwrap longitudes around the track's first point.
      const ref = lon[0];
      const un = Array.from(lon, v => ref + ((((v - ref) % 360) + 540) % 360) - 180);
      lo0 = Math.min(...un) - 6;
      lo1 = Math.max(...un) + 6;
      const aspect = (W - 40) / (H - 40);
      const span = Math.max((lo1 - lo0) / aspect, la1 - la0);
      const cLa = (la0 + la1) / 2;
      const cLo = (lo0 + lo1) / 2;
      la0 = cLa - span / 2;
      la1 = cLa + span / 2;
      lo0 = cLo - (span * aspect) / 2;
      lo1 = cLo + (span * aspect) / 2;
    }
    const sx = (W - 40) / (lo1 - lo0);
    const sy = (H - 40) / (la1 - la0);
    project = (la, lo) => {
      let l = lo;
      if (frame === 'local') l = lo0 + ((((lo - lo0) % 360) + 360) % 360);
      return [20 + (l - lo0) * sx, 20 + (la1 - la) * sy];
    };
    const step = frame === 'global' ? 30 : Math.max(1, Math.round((la1 - la0) / 6));
    ctx.strokeStyle = 'rgba(236,231,221,0.1)';
    ctx.fillStyle = 'rgba(236,231,221,0.42)';
    ctx.font = MONO;
    for (let la = Math.ceil(la0 / step) * step; la <= la1; la += step) {
      const y = Math.round(20 + (la1 - la) * sy) + 0.5;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(W - 20, y);
      ctx.stroke();
      ctx.fillText(`${la}°`, 22, y - 3);
    }
    for (let lo = Math.ceil(lo0 / step) * step; lo <= lo1; lo += step) {
      const x = Math.round(20 + (lo - lo0) * sx) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, H - 20);
      ctx.stroke();
      ctx.fillText(`${(((lo % 360) + 360) % 360).toFixed(0)}°E`, x + 3, H - 24);
    }
  }

  // Regions offered by the PDS search and simulated scenes.
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(236,231,221,0.22)';
  ctx.fillStyle = 'rgba(236,231,221,0.5)';
  for (const r of PDS_REGIONS) {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 8; k++) pts.push(project(r.minLat, r.westLon + ((r.eastLon - r.westLon) * k) / 8));
    for (let k = 0; k <= 8; k++) pts.push(project(r.maxLat, r.eastLon - ((r.eastLon - r.westLon) * k) / 8));
    if (pts.some(([x, y]) => x < -50 || x > W + 50 || y < -50 || y > H + 50)) continue;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label at the box's outermost corner, away from the track inside it.
    const far = pts.reduce((a, b) => (Math.hypot(b[0] - W / 2, b[1] - H / 2) > Math.hypot(a[0] - W / 2, a[1] - H / 2) ? b : a));
    ctx.fillText(r.name, far[0] + (far[0] > W / 2 ? 4 : -ctx.measureText(r.name).width - 4), far[1] + (far[1] > H / 2 ? 12 : -4));
  }
  if (frame === 'global') {
    for (const sc of scenes) {
      const [x, y] = project(sc.centerLat, sc.centerLon);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  // The track, broken where it wraps around the map edge.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let prev: [number, number] | null = null;
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 600))) {
    const p = project(lat[i], lon[i]);
    if (prev && Math.abs(p[0] - prev[0]) < W / 2) ctx.lineTo(p[0], p[1]);
    else ctx.moveTo(p[0], p[1]);
    prev = p;
  }
  ctx.stroke();
  const [sx0, sy0] = project(lat[0], lon[0]);
  ctx.fillStyle = accent;
  ctx.fillRect(sx0 - 3, sy0 - 3, 6, 6);
  ctx.font = MONO;
  ctx.fillText('start', sx0 + 6, sy0 + 4);

  // Detections along the track.
  ctx.fillStyle = '#7fb0de';
  for (const seg of s.segments) {
    for (let t = seg.traceStart; t <= seg.traceEnd; t += Math.max(1, Math.floor((seg.traceEnd - seg.traceStart) / 20))) {
      const [x, y] = project(lat[t], lon[t]);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  const t = s.pinnedTrace ?? cursor.getState().hover?.trace;
  if (t != null) {
    const [x, y] = project(lat[t], lon[t]);
    ctx.strokeStyle = '#e2a43b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawProfile(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const s = useApp.getState();
  const ds = s.dataset!;
  const e = ds.geometry.surfaceElevation;
  const n = e.length;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of e) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const pad = Math.max(5, (hi - lo) * 0.1);
  lo -= pad;
  hi += pad;
  ctx.clearRect(0, 0, W, H);
  const px = (i: number) => 52 + (i / (n - 1)) * (W - 68);
  const py = (v: number) => 10 + ((hi - v) / (hi - lo)) * (H - 30);
  ctx.font = MONO;
  ctx.fillStyle = 'rgba(236,231,221,0.45)';
  ctx.fillText(`${hi.toFixed(0)} m`, 4, 16);
  ctx.fillText(`${lo.toFixed(0)} m`, 4, H - 20);
  ctx.fillText(`${((n * ds.radargram.traceSpacingM) / 1000).toFixed(0)} km`, W - 50, H - 6);
  ctx.beginPath();
  for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(i), py(e[i]));
  ctx.lineTo(px(n - 1), H - 20);
  ctx.lineTo(px(0), H - 20);
  ctx.closePath();
  ctx.fillStyle = 'rgba(236,231,221,0.07)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,231,221,0.7)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, px(i), py(e[i]));
  ctx.stroke();
  const t = s.pinnedTrace ?? cursor.getState().hover?.trace;
  if (t != null) {
    ctx.strokeStyle = '#e2a43b';
    ctx.beginPath();
    ctx.moveTo(px(t), 8);
    ctx.lineTo(px(t), H - 20);
    ctx.stroke();
  }
}

export default function TrackMapView() {
  const dataset = useApp(s => s.dataset);
  const [frame, setFrame] = useState<Frame>('local');
  const mapHost = useRef<HTMLDivElement>(null);
  const mapCanvas = useRef<HTMLCanvasElement>(null);
  const profHost = useRef<HTMLDivElement>(null);
  const profCanvas = useRef<HTMLCanvasElement>(null);
  const hover = useHover();
  const pinned = useApp(s => s.pinnedTrace);

  useEffect(() => {
    let raf = 0;
    const paint = () => {
      raf = 0;
      if (!useApp.getState().dataset) return;
      const dpr = pixelRatio();
      for (const [host, canvas, fn] of [
        [mapHost.current, mapCanvas.current, (c: CanvasRenderingContext2D, w: number, h: number) => drawMap(c, w, h, frame)],
        [profHost.current, profCanvas.current, drawProfile],
      ] as const) {
        if (!host || !canvas) continue;
        const r = host.getBoundingClientRect();
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fn(ctx, r.width, r.height);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const ro = new ResizeObserver(schedule);
    if (mapHost.current) ro.observe(mapHost.current);
    if (profHost.current) ro.observe(profHost.current);
    const unsubs = [cursor.subscribe(schedule), useApp.subscribe(s => [s.dataset, s.segments, s.pinnedTrace] as const, schedule, { equalityFn: (a, b) => a.every((x, i) => x === b[i]) })];
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsubs.forEach(u => u());
    };
  }, [frame]);

  if (!dataset) return <EmptyState icon="map" title="No radargram" />;
  const t = pinned ?? hover?.trace;
  const { latitudes, longitudes } = dataset.geometry;
  const located = dataset.metadata.source !== 'file';

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line px-4 py-2.5">
        <Segmented<Frame> label="Map frame" size="sm" value={frame} onChange={setFrame} options={[{ value: 'local', label: 'Track' }, { value: 'global', label: 'Whole planet' }]} />
        <Readout label="Start" value={`${latitudes[0].toFixed(2)}°, ${longitudes[0].toFixed(2)}°E`} />
        <Readout label="End" value={`${latitudes[latitudes.length - 1].toFixed(2)}°, ${longitudes[longitudes.length - 1].toFixed(2)}°E`} />
        {t != null && <Readout label={`Trace ${t}`} value={`${latitudes[t].toFixed(3)}°, ${longitudes[t].toFixed(3)}°E`} tone="signal" />}
      </div>
      {!located && <p className="border-b border-line px-4 py-2 text-xs text-dim">This file has no geometry table, so the track has no real position.</p>}
      <div ref={mapHost} className="plot relative min-h-0 flex-[3]">
        <canvas ref={mapCanvas} className="absolute inset-0 h-full w-full" role="img" aria-label="Ground track map" />
      </div>
      <div className="flex items-center justify-between border-y border-line bg-raised px-4 py-1">
        <span className="label">Surface elevation along the track</span>
        <span className="text-2xs text-faint">{dataset.metadata.source === 'pds' ? 'From planetary radius in GEOM.TAB, relative to the IAU ellipsoid' : 'Simulated'}</span>
      </div>
      <div ref={profHost} className="plot relative min-h-[110px] flex-1">
        <canvas ref={profCanvas} className="absolute inset-0 h-full w-full" role="img" aria-label="Surface elevation profile" />
      </div>
    </div>
  );
}
