/* CRYORADAR — Canvas-Based Radargram Renderer
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS) */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';
import { getColormap, mapValueToColor } from '../../core/colormaps/colormaps';
import { sampleToDepth } from '../../core/physics/depth-conversion';
import { getMaterial } from '../../core/physics/dielectric';
import { ExplorerOverlay } from '../ExplorerOverlay/ExplorerOverlay';
import type { ViewportState } from '../../types/types';
import './RadargramViewer.css';

export function RadargramViewer() {
  const state = useCryoState();
  const dispatch = useCryoDispatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const explorerCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorInfo, setCursorInfo] = useState<{ trace: number; sample: number; power: number; depth: number; lat: number; lon: number } | null>(null);
  const [roiDragStart, setRoiDragStart] = useState<{x: number, y: number} | null>(null);
  const [roiCurrent, setRoiCurrent] = useState<{x: number, y: number} | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const { dataset, viewport, viewMode, colormap, contrastMin, contrastMax, showMolaTopo, showDepthGrid, showLayerPicks, layers } = state;
  const isExplorer = viewMode === 'explorer';

  const renderRadargram = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataset) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, data, powerMin, powerMax } = dataset.radargram;
    const range = powerMax - powerMin;
    const cMin = powerMin + contrastMin * range;
    const cMax = powerMin + contrastMax * range;
    const cmData = getColormap(colormap).data;

    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const val = data[y * width + x];
        const [r, g, b, a] = mapValueToColor(val, cMin, cMax, cmData);
        const idx = (y * width + x) * 4;
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = a;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [dataset, colormap, contrastMin, contrastMax]);

  const renderOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !dataset) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const { width, height, sampleInterval } = dataset.radargram;
    const { offsetX, offsetY, scaleX, scaleY } = viewport;

    const unitX = (rect.width / width) * scaleX;
    const unitY = (rect.height / height) * scaleY;

    const toScreenX = (trace: number) => trace * unitX + offsetX;
    const toScreenY = (sample: number) => sample * unitY + offsetY;

    const visibleTraceStart = Math.max(0, Math.floor(-offsetX / unitX));
    const visibleTraceEnd = Math.min(width, Math.ceil((rect.width - offsetX) / unitX));

    if (showMolaTopo) {
      const elevations = dataset.geometry.surfaceElevation;
      let minElev = Infinity, maxElev = -Infinity;
      for (let i = 0; i < elevations.length; i++) {
        if (elevations[i] < minElev) minElev = elevations[i];
        if (elevations[i] > maxElev) maxElev = elevations[i];
      }
      const elevRange = maxElev - minElev || 1;
      const topoHeightSamples = height * 0.06;

      ctx.beginPath();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;

      for (let t = visibleTraceStart; t < visibleTraceEnd; t++) {
        const sx = toScreenX(t);
        const normalized = (elevations[t] - minElev) / elevRange;
        const sy = toScreenY(-topoHeightSamples + normalized * topoHeightSamples);
        if (t === visibleTraceStart) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const labelX = toScreenX(Math.max(visibleTraceStart, 2));
      const labelYTop = toScreenY(-topoHeightSamples);
      const labelYBot = toScreenY(0);
      if (labelX > 0 && labelX < rect.width) {
        ctx.fillStyle = '#06b6d499';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(`MOLA: ${maxElev.toFixed(0)}m`, labelX + 4, Math.max(10, labelYTop - 4));
        ctx.fillText(`${minElev.toFixed(0)}m`, labelX + 4, Math.min(rect.height - 4, labelYBot + 12));
      }
    }

    if (showDepthGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      const surfaceSample = dataset.surfaceEcho.indices[Math.floor(width / 2)];
      const eps = 3.15;
      const depthSteps = [100, 200, 500, 1000, 1500, 2000, 3000];

      const visX0 = toScreenX(visibleTraceStart);
      const visX1 = toScreenX(visibleTraceEnd);

      for (const depthM of depthSteps) {
        const twoWayTime = (2 * depthM * Math.sqrt(eps)) / 299_792_458;
        const sampleIdx = surfaceSample + twoWayTime / sampleInterval;
        if (sampleIdx >= height) continue;
        const sy = toScreenY(sampleIdx);
        if (sy < 0 || sy > rect.height) continue;

        ctx.beginPath();
        ctx.moveTo(Math.max(0, visX0), sy);
        ctx.lineTo(Math.min(rect.width, visX1), sy);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(`${depthM}m`, Math.max(4, visX0 + 4), sy - 3);
      }
      ctx.setLineDash([]);
    }

    if (showLayerPicks && layers.length > 0) {
      const materialColors = ['#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];
      for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        if (layer.picks.length < 2) continue;

        const color = materialColors[li % materialColors.length];
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;

        const sorted = [...layer.picks].sort((a, b) => a.traceIndex - b.traceIndex);
        for (let p = 0; p < sorted.length; p++) {
          const sx = toScreenX(sorted[p].traceIndex);
          const sy = toScreenY(sorted[p].sampleIndex);
          if (p === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        for (const pick of sorted) {
          const sx = toScreenX(pick.traceIndex);
          const sy = toScreenY(pick.sampleIndex);
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        const mat = getMaterial(layer.materialId);
        if (mat && sorted.length > 0) {
          const lastPick = sorted[sorted.length - 1];
          const tx = toScreenX(lastPick.traceIndex) + 8;
          const ty = toScreenY(lastPick.sampleIndex) - 8;
          ctx.fillStyle = color;
          ctx.font = '11px Inter, sans-serif';
          ctx.fillText(mat.nameShort, tx, ty);
        }
      }
    
    // Draw existing ROI
    if (state.roiSelection) {
      const { traceStart, traceEnd, sampleStart, sampleEnd } = state.roiSelection;
      const x1 = toScreenX(traceStart);
      const x2 = toScreenX(traceEnd);
      const y1 = toScreenY(sampleStart);
      const y2 = toScreenY(sampleEnd);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.setLineDash([]);
      
      // Label
      ctx.fillStyle = '#00ffff';
      ctx.font = '10px monospace';
      ctx.fillText('ROI: FWI TARGET', x1, y1 - 4);
    }

    // Draw active drag ROI
    if (roiDragStart && roiCurrent) {
      const x = Math.min(roiDragStart.x, roiCurrent.x);
      const y = Math.min(roiDragStart.y, roiCurrent.y);
      const w = Math.abs(roiCurrent.x - roiDragStart.x);
      const h = Math.abs(roiCurrent.y - roiDragStart.y);
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255, 0, 255, 0.1)';
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([]);
    }
}
  }, [dataset, viewport, showMolaTopo, showDepthGrid, showLayerPicks, layers, roiDragStart, roiCurrent, state.roiSelection]);

  useEffect(() => { renderRadargram(); }, [renderRadargram]);
  useEffect(() => { renderOverlay(); }, [renderOverlay]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      renderOverlay();
      const rect = container.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [renderOverlay]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    dispatch({
      type: 'SET_VIEWPORT',
      viewport: {
        scaleX: viewport.scaleX * factor,
        scaleY: viewport.scaleY * factor,
        offsetX: mx - (mx - viewport.offsetX) * factor,
        offsetY: my - (my - viewport.offsetY) * factor,
      },
    });
  }, [dispatch, viewport]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !dataset) return;

    if (state.mode === 'pan') {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    } else if (state.mode === 'roi-select') {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setRoiDragStart({ x: mx, y: my });
      setRoiCurrent({ x: mx, y: my });
    } else if (state.mode === 'pick') {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { width, height } = dataset.radargram;

      const unitX = (rect.width / width) * viewport.scaleX;
      const unitY = (rect.height / height) * viewport.scaleY;
      const trace = Math.round((mx - viewport.offsetX) / unitX);
      const sample = Math.round((my - viewport.offsetY) / unitY);

      if (trace >= 0 && trace < width && sample >= 0 && sample < height && state.activeLayerIndex !== null) {
        dispatch({ type: 'ADD_PICK', layerIndex: state.activeLayerIndex, pick: { traceIndex: trace, sampleIndex: sample } });
      }
    }
  }, [state.mode, state.activeLayerIndex, dataset, viewport, dispatch]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (state.mode === 'roi-select' && roiDragStart) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setRoiCurrent({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }
    
    if (isDragging.current && state.mode === 'pan') {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      dispatch({
        type: 'SET_VIEWPORT',
        viewport: {
          ...viewport,
          offsetX: viewport.offsetX + dx,
          offsetY: viewport.offsetY + dy,
        } as ViewportState,
      });
    }

    if (dataset) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const { width, height, data, sampleInterval } = dataset.radargram;
      const unitX = (rect.width / width) * viewport.scaleX;
      const unitY = (rect.height / height) * viewport.scaleY;
      const trace = Math.round((mx - viewport.offsetX) / unitX);
      const sample = Math.round((my - viewport.offsetY) / unitY);

      if (trace >= 0 && trace < width && sample >= 0 && sample < height) {
        const power = data[sample * width + trace];
        const surfIdx = dataset.surfaceEcho.indices[trace];
        const depth = sampleToDepth(sample, surfIdx, sampleInterval, 3.15);
        setCursorInfo({
          trace,
          sample,
          power: Math.round(power * 10) / 10,
          depth: Math.round(depth * 10) / 10,
          lat: Math.round(dataset.geometry.latitudes[trace] * 1000) / 1000,
          lon: Math.round(dataset.geometry.longitudes[trace] * 1000) / 1000,
        });
      }
    }
  }, [dataset, viewport, state.mode, dispatch, roiDragStart]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    
    if (state.mode === 'roi-select' && roiDragStart && roiCurrent && dataset) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const { width, height } = dataset.radargram;
        const unitX = (rect.width / width) * viewport.scaleX;
        const unitY = (rect.height / height) * viewport.scaleY;
        
        const x1 = Math.min(roiDragStart.x, roiCurrent.x);
        const x2 = Math.max(roiDragStart.x, roiCurrent.x);
        const y1 = Math.min(roiDragStart.y, roiCurrent.y);
        const y2 = Math.max(roiDragStart.y, roiCurrent.y);

        const traceStart = Math.max(0, Math.floor((x1 - viewport.offsetX) / unitX));
        const traceEnd = Math.min(width, Math.ceil((x2 - viewport.offsetX) / unitX));
        const sampleStart = Math.max(0, Math.floor((y1 - viewport.offsetY) / unitY));
        const sampleEnd = Math.min(height, Math.ceil((y2 - viewport.offsetY) / unitY));

        const tStart = traceStart; const sStart = sampleStart; let tEnd = traceEnd; let sEnd = sampleEnd;
        const roiWidth = tEnd - tStart;
        const roiHeight = sEnd - sStart;
        
        // Enforce Limits
        const hasWebGPU = !!navigator.gpu;
        const maxW = hasWebGPU ? 256 : 64;
        const maxH = hasWebGPU ? 256 : 64;

        if (roiWidth > maxW) tEnd = tStart + maxW;
        if (roiHeight > maxH) sEnd = sStart + maxH;

        if (tEnd > tStart && sEnd > sStart) {
          dispatch({
            type: 'SET_ROI_SELECTION',
            roi: { traceStart: tStart, traceEnd: tEnd, sampleStart: sStart, sampleEnd: sEnd }
          });
        }
      }
      setRoiDragStart(null);
      setRoiCurrent(null);
    }
  }, [state.mode, roiDragStart, roiCurrent, dataset, viewport, dispatch]);

  if (!dataset) {
    return (
      <div className="rv-empty">
        <div className="rv-empty-icon">📡</div>
        <h2>Select a Dataset</h2>
        <p>Choose a Mars radar track from the panel to begin analysis</p>
      </div>
    );
  }

  return (
    <div className="rv-container" ref={containerRef} data-radargram-container>
      <canvas
        ref={canvasRef}
        className="rv-radargram"
        data-radargram-main
        style={{
          transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scaleX}, ${viewport.scaleY})`,
          transformOrigin: '0 0',
        }}
      />
      {isExplorer && dataset && containerSize.w > 0 && (
        <>
          <canvas ref={explorerCanvasRef} className="rv-overlay" style={{ pointerEvents: 'none' }} />
          <ExplorerOverlay
            canvasRef={explorerCanvasRef}
            dataset={dataset}
            viewport={viewport}
            containerWidth={containerSize.w}
            containerHeight={containerSize.h}
          />
        </>
      )}
      <canvas
        ref={overlayRef}
        className="rv-overlay"
        data-radargram-overlay
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {cursorInfo && (
        <div className="rv-cursor-info">
          <span className="cr-mono">{cursorInfo.lat}°N {cursorInfo.lon}°E</span>
          <span className="rv-separator">|</span>
          <span className="cr-mono">Depth: {cursorInfo.depth}m</span>
          {!isExplorer && (
            <>
              <span className="rv-separator">|</span>
              <span className="cr-mono">Power: {cursorInfo.power} dB</span>
              <span className="rv-separator">|</span>
              <span className="cr-mono">Trace: {cursorInfo.trace} / Sample: {cursorInfo.sample}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
