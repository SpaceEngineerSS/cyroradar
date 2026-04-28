/* CRYORADAR — CRISM Mineralogy Panel (v4.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Displays synthetic CRISM mineralogy strip aligned with radargram
 * traces and highlights hydrated mineral detections. */

import { useRef, useEffect, useCallback } from 'react';
import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';
import { generateSyntheticCRISM } from '../../core/analysis/crism-fusion';

const MINERAL_COLORS: Record<string, string> = {
  'none': '#1e293b',
  'phyllosilicate': '#7c3aed',
  'sulfate': '#eab308',
  'hydrated-silica': '#06b6d4',
};

export function CRISMPanel() {
  const { dataset, crismData } = useCryoState();
  const dispatch = useCryoDispatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateData = useCallback(() => {
    if (!dataset || crismData) return;
    const data = generateSyntheticCRISM(
      dataset.geometry,
      dataset.radargram.width
    );
    dispatch({ type: 'SET_CRISM_DATA', data });
  }, [dataset, crismData, dispatch]);

  useEffect(() => { generateData(); }, [generateData]);

  const renderStrip = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !crismData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.parentElement?.clientWidth ?? 300;
    const stripH = 40;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = stripH * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${stripH}px`;
    ctx.scale(dpr, dpr);

    const traceCount = crismData.length;
    const px = w / traceCount;

    for (let i = 0; i < traceCount; i++) {
      const pixel = crismData[i];
      const baseColor = MINERAL_COLORS[pixel.mineralClass] || MINERAL_COLORS['none'];

      ctx.fillStyle = baseColor;
      ctx.globalAlpha = 0.3 + pixel.clayIndex * 0.7;
      ctx.fillRect(i * px, 0, Math.max(1, px + 0.5), stripH);
    }

    ctx.globalAlpha = 1;

    for (let i = 0; i < traceCount; i++) {
      const pixel = crismData[i];
      const h = pixel.hydrationIndex * stripH * 0.8;
      const x = i * px;

      ctx.fillStyle = '#22d3ee';
      ctx.globalAlpha = pixel.hydrationIndex * 0.6;
      ctx.fillRect(x, stripH - h, Math.max(1, px + 0.5), h);
    }
    ctx.globalAlpha = 1;
  }, [crismData]);

  useEffect(() => { renderStrip(); }, [renderStrip]);

  if (!dataset) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <div className="text-2xl mb-2">🔬</div>
        <p>Load a dataset for CRISM analysis</p>
      </div>
    );
  }

  const mineralCounts = crismData ? {
    phyllosilicate: crismData.filter(p => p.mineralClass === 'phyllosilicate').length,
    sulfate: crismData.filter(p => p.mineralClass === 'sulfate').length,
    hydrated: crismData.filter(p => p.mineralClass === 'hydrated-silica').length,
    none: crismData.filter(p => p.mineralClass === 'none').length,
  } : null;

  const avgClay = crismData
    ? crismData.reduce((s, p) => s + p.clayIndex, 0) / crismData.length
    : 0;

  return (
    <div className="p-3 space-y-3">
      <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
        CRISM Mineralogy Fusion
      </div>

      <div className="bg-space-800/50 rounded-lg p-2 border border-space-700">
        <div className="text-[9px] font-mono text-gray-500 mb-1">SPECTRAL STRIP (1.9–2.3 μm)</div>
        <canvas ref={canvasRef} className="w-full rounded" />
        <div className="flex items-center justify-between mt-1.5 text-[8px] font-mono text-gray-600">
          <span>Trace 0</span>
          <span>Clay index (opacity) + Hydration (cyan bars)</span>
          <span>Trace {crismData?.length ?? '—'}</span>
        </div>
      </div>

      <div className="flex gap-2 text-[9px]">
        {[
          { label: 'Phyllosilicate', color: '#7c3aed', icon: '🧱' },
          { label: 'Sulfate', color: '#eab308', icon: '🔶' },
          { label: 'Hydrated Silica', color: '#06b6d4', icon: '💎' },
        ].map(m => (
          <div key={m.label} className="flex items-center gap-1 text-gray-500">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: m.color }} />
            <span>{m.icon} {m.label}</span>
          </div>
        ))}
      </div>

      {mineralCounts && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-space-800/40 rounded p-2 border border-purple-500/20">
            <div className="text-sm font-bold text-purple-400">{mineralCounts.phyllosilicate}</div>
            <div className="text-[8px] text-gray-500 font-mono">PHYLLOSILICATE TRACES</div>
          </div>
          <div className="bg-space-800/40 rounded p-2 border border-amber-500/20">
            <div className="text-sm font-bold text-amber-400">{mineralCounts.sulfate}</div>
            <div className="text-[8px] text-gray-500 font-mono">SULFATE TRACES</div>
          </div>
          <div className="bg-space-800/40 rounded p-2 border border-cyan-500/20">
            <div className="text-sm font-bold text-cyan-400">{mineralCounts.hydrated}</div>
            <div className="text-[8px] text-gray-500 font-mono">HYDRATED SILICA</div>
          </div>
          <div className="bg-space-800/40 rounded p-2 border border-space-600">
            <div className="text-sm font-bold text-gray-400">{avgClay.toFixed(3)}</div>
            <div className="text-[8px] text-gray-500 font-mono">MEAN CLAY INDEX</div>
          </div>
        </div>
      )}

      <div className="text-[9px] text-gray-500 bg-space-800/30 rounded p-2 border border-space-700">
        <span className="text-gray-400 font-semibold">Source:</span> Synthetic CRISM proxy
        (Murchie et al. 2007, JGR) — modeled 1.9 μm H₂O + 2.3 μm Metal-OH bands
      </div>
    </div>
  );
}
