/* CRYORADAR — Discovery Panel (Auto-Detection UI)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS) */

import { useState, useCallback } from 'react';
import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';
import { scanForBrightReflections, summarizeAnomalies } from '../../core/analysis/anomaly-detector';
import type { AnomalyResult, AnomalyClass, DiscoveryEntry } from '../../types/types';

const CLASS_LABELS: Record<AnomalyClass, { label: string; color: string; icon: string }> = {
  'geological-interface': { label: 'Geological', color: 'text-gray-400', icon: '🪨' },
  'ice-deposit':          { label: 'Ice Deposit', color: 'text-ice-300', icon: '🧊' },
  'wet-sediment':         { label: 'Wet Sediment', color: 'text-neon-orange', icon: '💧' },
  'liquid-water':         { label: 'Liquid Water', color: 'text-neon-blue', icon: '🌊' },
};

export function DiscoveryPanel() {
  const { dataset, datasetId, anomalies, crismData } = useCryoState();
  const dispatch = useCryoDispatch();
  const [scanning, setScanning] = useState(false);
  const [threshold, setThreshold] = useState(0.35);

  const runDetection = useCallback(() => {
    if (!dataset) return;
    setScanning(true);
    requestAnimationFrame(() => {
      const results = scanForBrightReflections(dataset, threshold, 3.15, crismData);
      dispatch({ type: 'SET_ANOMALIES', anomalies: results });
      setScanning(false);
    });
  }, [dataset, threshold, crismData, dispatch]);

  const logDiscovery = useCallback((anomaly: AnomalyResult) => {
    if (!datasetId || !dataset) return;
    const entry: DiscoveryEntry = {
      id: `disc-${Date.now()}-${anomaly.traceIndex}`,
      timestamp: Date.now(),
      datasetId,
      region: dataset.metadata.region,
      traceIndex: anomaly.traceIndex,
      depthM: anomaly.depthM,
      latitude: anomaly.latitude,
      longitude: anomaly.longitude,
      apparentPermittivity: anomaly.apparentPermittivity,
      classification: anomaly.classification,
      confidence: anomaly.confidence,
      notes: '',
    };
    dispatch({ type: 'ADD_DISCOVERY', discovery: entry });
  }, [datasetId, dataset, dispatch]);

  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-500">
        <span className="text-3xl">🎯</span>
        <p className="text-sm">Load a dataset to run detection</p>
      </div>
    );
  }

  const summary = anomalies.length > 0 ? summarizeAnomalies(anomalies) : null;

  return (
    <div className="p-3 space-y-4">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 font-mono">
          Auto-Detection (Orosei 2018)
        </h3>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Scans for Bright Basal Reflections (BBR) — subsurface echoes brighter than 
          surface returns, indicating high-ε interfaces like liquid water (ε ≥ 40).
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-[11px] font-mono text-gray-400">
          <span>Detection Threshold (ρ)</span>
          <span className="text-neon-cyan">{threshold.toFixed(2)}</span>
        </label>
        <input
          type="range" min="0.1" max="0.8" step="0.05"
          value={threshold}
          onChange={e => setThreshold(parseFloat(e.target.value))}
          className="w-full h-1 accent-neon-cyan"
        />
        <div className="flex justify-between text-[9px] font-mono text-gray-600">
          <span>Sensitive (0.1)</span>
          <span>Strict (0.8)</span>
        </div>
      </div>

      <button
        onClick={runDetection}
        disabled={scanning}
        className={`w-full py-2.5 rounded-lg text-sm font-medium font-mono transition-all duration-300 border ${
          scanning
            ? 'bg-space-800 border-space-700 text-gray-500 cursor-wait'
            : 'bg-gradient-to-r from-neon-cyan/10 to-neon-blue/10 border-neon-cyan/30 text-neon-cyan hover:border-neon-cyan/60 hover:shadow-lg hover:shadow-neon-cyan/10'
        }`}
      >
        {scanning ? '⏳ Scanning traces…' : '🎯 Run Auto-Detection'}
      </button>

      {summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Total Anomalies" value={String(summary.total)} color="text-neon-cyan" />
            <StatCard label="Mean Depth" value={`${summary.meanDepth.toFixed(0)} m`} color="text-gray-300" />
            <StatCard label="Ice Deposits" value={String(summary.byClass['ice-deposit'])} color="text-ice-300" />
            <StatCard label="Liquid Water" value={String(summary.byClass['liquid-water'])} color="text-neon-blue" />
          </div>

          {summary.strongestBBR && (
            <div className="p-3 rounded-lg border border-neon-blue/30 bg-neon-blue/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🌊</span>
                <span className="text-xs font-semibold text-neon-blue font-mono">Strongest BBR Detection</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-gray-400">
                <span>Trace: #{summary.strongestBBR.traceIndex}</span>
                <span>ε = {summary.strongestBBR.apparentPermittivity.toFixed(1)}</span>
                <span>Depth: {summary.strongestBBR.depthM} m</span>
                <span>Confidence: {(summary.strongestBBR.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}

          <div className="space-y-1 max-h-48 overflow-y-auto">
            <h4 className="text-[10px] font-semibold uppercase text-gray-500 font-mono sticky top-0 bg-space-900 py-1">
              Detected Anomalies ({anomalies.length})
            </h4>
            {anomalies.slice(0, 50).map((a, i) => {
              const cls = CLASS_LABELS[a.classification];
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-space-850 border border-space-700 hover:border-space-600 transition-colors group"
                >
                  <span className="text-sm">{cls.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={cls.color}>{cls.label}</span>
                      <span className="text-gray-600">ε={a.apparentPermittivity.toFixed(1)}</span>
                      <span className="text-gray-600">{a.depthM}m</span>
                    </div>
                    <div className="text-[9px] font-mono text-gray-600">
                      {a.latitude.toFixed(2)}°N, {a.longitude.toFixed(2)}°E — Trace #{a.traceIndex}
                      {a.clutterWarning && <span className="ml-1 text-amber-400">⚠️</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => logDiscovery(a)}
                    className="opacity-0 group-hover:opacity-100 px-2 py-0.5 text-[9px] font-mono rounded bg-neon-green/10 border border-neon-green/30 text-neon-green transition-all hover:bg-neon-green/20"
                    title="Log this discovery"
                  >
                    Log
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-2 rounded-lg bg-space-850 border border-space-700">
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[9px] font-mono text-gray-500 uppercase">{label}</div>
    </div>
  );
}
