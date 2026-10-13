/* Radargram view: image canvas, annotation canvas, and all pointer input.
 *
 * React mounts this once; after that, drawing is driven by store
 * subscriptions and requestAnimationFrame. Panning, zooming, hovering and
 * dragging the contrast slider never re-render a component. */

import { useEffect, useRef } from 'react';
import { useApp, velocityLayers, type RowPoint } from '../../store/app';
import { viewport, cursor, fitViewport, zoomAt, panBy } from '../../store/viewport';
import { displayField, shiftAt } from '../../store/derived';
import { createRenderer, type RadargramRenderer } from './renderer';
import { drawOverlay, readPalette, type Palette } from './overlay';
import { pixelRatio } from '../../app/perf';
import type { ROIBounds } from '../../types/types';

interface Props {
  variant: 'raw' | 'migrated';
  showAxes?: boolean;
  caption?: string;
}

const CLICK_SLOP = 4;

export function RadargramView({ variant, showAxes = true, caption }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const tool = useApp(s => s.tool);

  useEffect(() => {
    const host = hostRef.current!;
    let imageCanvas = imageRef.current!;
    const overlayCanvas = overlayRef.current!;
    const octx = overlayCanvas.getContext('2d')!;
    const made = createRenderer(imageCanvas, displayField(useApp.getState(), variant));
    let renderer: RadargramRenderer = made.renderer;
    imageCanvas = made.canvas;
    let palette: Palette = readPalette();
    let dpr = pixelRatio();
    let frame = 0;
    let needImage = true;
    let needOverlay = true;
    let fittedKey: string | null = null;
    let roiDraft: ROIBounds | null = null;

    const schedule = (image: boolean, overlay: boolean) => {
      needImage ||= image;
      needOverlay ||= overlay;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const applyField = () => {
      const s = useApp.getState();
      const f = displayField(s, variant);
      if (!f) return;
      renderer.setField(f);
      applyRange();
    };
    const applyRange = () => {
      const s = useApp.getState();
      const f = displayField(s, variant);
      if (!f) return;
      const span = f.powerMax - f.powerMin;
      renderer.setRange(f.powerMin + s.contrast[0] * span, f.powerMin + s.contrast[1] * span);
    };

    function paint() {
      frame = 0;
      const s = useApp.getState();
      const v = viewport.getState();
      if (!s.dataset || v.width === 0) return;
      if (needImage) renderer.draw(v);
      if (needOverlay) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const f = displayField(s, variant);
        drawOverlay(octx, v, {
          dataset: s.dataset,
          shifts: f?.shifts ?? null,
          overlays: s.overlays,
          model: velocityLayers(s.layers),
          bulkPermittivity: s.bulkPermittivity,
          layers: s.layers,
          activeLayer: s.activeLayer,
          anomalies: s.anomalies,
          segments: s.segments,
          selectedSegment: s.selectedSegment,
          uq: s.uq.results,
          roi: s.roi,
          roiDraft,
          measure: s.measure,
          hover: cursor.getState().hover,
          pinnedTrace: s.pinnedTrace,
          polsar: s.polsar,
          fwi: s.fwi.result,
          fwiLive: s.fwi.status === 'running' && s.fwi.progress ? s.fwi.progress : null,
          palette,
          showAxes,
        });
      }
      needImage = needOverlay = false;
    }

    /* Sizing ---------------------------------------------------------------- */
    const resize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      dpr = pixelRatio();
      renderer.resize(w, h, dpr);
      overlayCanvas.width = Math.round(w * dpr);
      overlayCanvas.height = Math.round(h * dpr);
      const s = useApp.getState();
      const v = viewport.getState();
      if (s.dataset && fittedKey !== s.datasetKey) {
        fittedKey = s.datasetKey;
        fitViewport(s.dataset.radargram.width, s.dataset.radargram.height, w, h);
      } else if (v.width !== w || v.height !== h) {
        // Keep the same data range visible when the panel changes size.
        const kx = v.width ? w / v.width : 1;
        const ky = v.height ? h / v.height : 1;
        viewport.setState({ width: w, height: h, scaleX: v.scaleX * kx, scaleY: v.scaleY * ky, offsetX: v.offsetX * kx, offsetY: v.offsetY * ky });
      }
      schedule(true, true);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* Subscriptions --------------------------------------------------------- */
    renderer.setColormap(useApp.getState().colormap);
    applyField();

    const unsubs = [
      viewport.subscribe(() => schedule(true, true)),
      cursor.subscribe(() => schedule(false, true)),
      useApp.subscribe(
        s => [s.dataset, s.migration.result, s.statics] as const,
        ([ds]) => {
          if (ds && fittedKey !== useApp.getState().datasetKey) {
            const prev = renderer;
            const f = displayField(useApp.getState(), variant);
            if (f && renderer.kind === 'webgl2' && (f.width > 8192 || f.height > 8192)) {
              prev.dispose();
              const next = createRenderer(imageCanvas, f);
              renderer = next.renderer;
              imageCanvas = next.canvas;
            }
            resize();
          }
          applyField();
          schedule(true, true);
        },
        { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] },
      ),
      useApp.subscribe(
        s => s.colormap,
        id => {
          renderer.setColormap(id);
          schedule(true, false);
        },
      ),
      useApp.subscribe(
        s => s.contrast,
        () => {
          applyRange();
          schedule(true, false);
        },
      ),
      useApp.subscribe(
        s => s.theme,
        () => {
          palette = readPalette();
          renderer.setColormap(useApp.getState().colormap);
          schedule(true, true);
        },
      ),
      useApp.subscribe(
        s => [s.overlays, s.layers, s.activeLayer, s.anomalies, s.segments, s.selectedSegment, s.uq.results, s.roi, s.measure, s.pinnedTrace, s.polsar, s.fwi, s.bulkPermittivity] as const,
        () => schedule(false, true),
        { equalityFn: (a, b) => a.every((x, i) => x === b[i]) },
      ),
    ];

    /* Input ----------------------------------------------------------------- */
    const toData = (clientX: number, clientY: number) => {
      const rect = overlayCanvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const v = viewport.getState();
      const s = useApp.getState();
      if (!s.dataset) return null;
      const { width: W, height: H } = s.dataset.radargram;
      const trace = Math.floor((x - v.offsetX) / v.scaleX);
      const displayRow = (y - v.offsetY) / v.scaleY;
      const f = displayField(s, variant);
      const row = Math.floor(displayRow + shiftAt(f?.shifts ?? null, trace));
      const inside = trace >= 0 && trace < W && displayRow >= 0 && displayRow < H;
      return { x, y, trace: Math.max(0, Math.min(W - 1, trace)), row: Math.max(0, Math.min(H - 1, row)), displayRow, inside };
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { startX: number; startY: number; lastX: number; lastY: number; moved: boolean; start: ReturnType<typeof toData> } | null = null;
    let pinch: { dist: number; cx: number; cy: number } | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      host.focus({ preventScroll: true });
      overlayCanvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        drag = null;
        roiDraft = null;
        return;
      }
      drag = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, start: toData(e.clientX, e.clientY) };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const rect = overlayCanvas.getBoundingClientRect();
        panBy(cx - pinch.cx, cy - pinch.cy);
        const k = dist / Math.max(1, pinch.dist);
        zoomAt(cx - rect.left, cy - rect.top, k, k);
        pinch = { dist, cx, cy };
        return;
      }

      const p = toData(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') cursor.setState({ hover: p && p.inside ? { trace: p.trace, row: Math.floor(p.displayRow) } : null });

      if (!drag) return;
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > CLICK_SLOP) drag.moved = true;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      const t = useApp.getState().tool;
      if (t === 'pan' || e.buttons === 4) panBy(dx, dy);
      else if (t === 'roi' && drag.start && p) {
        const a = drag.start;
        roiDraft = {
          traceStart: Math.min(a.trace, p.trace),
          traceEnd: Math.max(a.trace, p.trace) + 1,
          sampleStart: Math.min(a.row, p.row),
          sampleEnd: Math.max(a.row, p.row) + 1,
        };
        schedule(false, true);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!drag) return;
      const d = drag;
      drag = null;
      const s = useApp.getState();
      const p = toData(e.clientX, e.clientY);
      if (!p) return;

      if (s.tool === 'roi') {
        if (roiDraft && roiDraft.traceEnd - roiDraft.traceStart >= 4 && roiDraft.sampleEnd - roiDraft.sampleStart >= 8) s.set('roi', roiDraft);
        roiDraft = null;
        schedule(false, true);
        return;
      }
      if (d.moved || !p.inside) return;

      const point: RowPoint = { trace: p.trace, row: p.row };
      if (s.tool === 'pick') s.addPick(point);
      else if (s.tool === 'measure') s.set('measure', !s.measure || s.measure.b ? { a: point, b: null } : { a: s.measure.a, b: point });
      else if (s.tool === 'pan') {
        // A click near a detection selects its segment; elsewhere it pins the trace for the A-scope.
        const v = viewport.getState();
        const hit = s.segments.findIndex(seg => p.trace >= seg.traceStart - 2 / v.scaleX && p.trace <= seg.traceEnd + 2 / v.scaleX && Math.abs(s.anomalies[seg.representative].sampleIndex - p.row) * v.scaleY < 24);
        if (hit >= 0) {
          s.selectSegment(hit);
          s.set('panel', 'detect');
        } else s.set('pinnedTrace', s.pinnedTrace === p.trace ? null : p.trace);
      }
    };

    const onLeave = () => cursor.setState({ hover: null });

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = overlayCanvas.getBoundingClientRect();
      const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.altKey ? 1 : k, e.shiftKey ? 1 : k);
    };

    const onDblClick = () => {
      const s = useApp.getState();
      if (s.dataset) fitViewport(s.dataset.radargram.width, s.dataset.radargram.height);
    };

    const onKey = (e: KeyboardEvent) => {
      const v = viewport.getState();
      const s = useApp.getState();
      if (e.key === 'ArrowLeft') panBy(40, 0);
      else if (e.key === 'ArrowRight') panBy(-40, 0);
      else if (e.key === 'ArrowUp') panBy(0, 40);
      else if (e.key === 'ArrowDown') panBy(0, -40);
      else if (e.key === '+' || e.key === '=') zoomAt(v.width / 2, v.height / 2, 1.25, 1.25);
      else if (e.key === '-') zoomAt(v.width / 2, v.height / 2, 0.8, 0.8);
      else if (e.key === '0' && s.dataset) fitViewport(s.dataset.radargram.width, s.dataset.radargram.height);
      else if (e.key === 'Escape') {
        roiDraft = null;
        if (s.measure) s.set('measure', null);
        schedule(false, true);
        return;
      } else return;
      e.preventDefault();
    };

    overlayCanvas.addEventListener('pointerdown', onPointerDown);
    overlayCanvas.addEventListener('pointermove', onPointerMove);
    overlayCanvas.addEventListener('pointerup', onPointerUp);
    overlayCanvas.addEventListener('pointercancel', onPointerUp);
    overlayCanvas.addEventListener('pointerleave', onLeave);
    overlayCanvas.addEventListener('wheel', onWheel, { passive: false });
    overlayCanvas.addEventListener('dblclick', onDblClick);
    host.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      unsubs.forEach(u => u());
      overlayCanvas.removeEventListener('pointerdown', onPointerDown);
      overlayCanvas.removeEventListener('pointermove', onPointerMove);
      overlayCanvas.removeEventListener('pointerup', onPointerUp);
      overlayCanvas.removeEventListener('pointercancel', onPointerUp);
      overlayCanvas.removeEventListener('pointerleave', onLeave);
      overlayCanvas.removeEventListener('wheel', onWheel);
      overlayCanvas.removeEventListener('dblclick', onDblClick);
      host.removeEventListener('keydown', onKey);
      renderer.dispose();
    };
  }, [variant, showAxes]);

  return (
    <div
      ref={hostRef}
      tabIndex={0}
      role="application"
      aria-roledescription="radargram"
      aria-label={`Radargram${caption ? `, ${caption}` : ''}. Arrow keys pan, plus and minus zoom, 0 fits.`}
      className="plot relative h-full w-full overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-accent"
      data-radargram={variant}
    >
      <canvas ref={imageRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: tool === 'pan' ? 'grab' : tool === 'roi' ? 'crosshair' : 'cell' }}
      />
      {caption && <span className="label pointer-events-none absolute top-2 right-3 text-[rgba(236,231,221,0.6)]">{caption}</span>}
    </div>
  );
}
