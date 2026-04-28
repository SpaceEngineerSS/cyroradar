/* CRYORADAR — Hypothesis Panel (v4.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Displays Bayesian probability matrix for BBR anomalies —
 * competing hypotheses (Water, Smectite Clay, Clutter) shown
 * as telemetry-style bars with mission-control aesthetics. */

import { useCryoState } from '../../context/CryoRadarContext';
import type { AnomalyResult } from '../../types/types';

function ProbabilityBar({ label, value, color, icon }: {
  label: string;
  value: number;
  color: string;
  icon: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-gray-400 font-medium flex items-center gap-1">
          <span>{icon}</span> {label}
        </span>
        <span className="font-mono font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-space-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}40` }}
        />
      </div>
    </div>
  );
}

function AnomalyHypothesisCard({ anomaly }: { anomaly: AnomalyResult }) {
  const h = anomaly.hypothesis;
  const dominant = h.dominantHypothesis;

  const dominantLabel = dominant === 'liquid-water' ? '💧 LIQUID WATER'
    : dominant === 'smectite-clay' ? '�ite SMECTITE CLAY' : '⚡ SURFACE CLUTTER';
  const dominantColor = dominant === 'liquid-water' ? '#22d3ee'
    : dominant === 'smectite-clay' ? '#7c3aed' : '#f59e0b';

  return (
    <div className="bg-space-800/60 backdrop-blur-sm rounded-lg p-3 border border-space-700 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono text-gray-500">TRACE {anomaly.traceIndex}</span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
          color: dominantColor,
          backgroundColor: `${dominantColor}15`,
          border: `1px solid ${dominantColor}30`
        }}>
          {dominantLabel}
        </span>
      </div>

      <ProbabilityBar label="Liquid Water" value={h.pLiquidWater} color="#22d3ee" icon="💧" />
      <ProbabilityBar label="Smectite Clay" value={h.pSmectiteClay} color="#7c3aed" icon="�ite" />
      <ProbabilityBar label="Off-Nadir Clutter" value={h.pClutter} color="#f59e0b" icon="⚡" />

      <div className="flex flex-wrap gap-2 mt-2 text-[9px] font-mono text-gray-500">
        <span>ε={anomaly.apparentPermittivity}</span>
        <span>ρ={anomaly.powerRatio.toFixed(3)}</span>
        <span>slope={anomaly.surfaceSlopeDeg}°</span>
        <span>depth={anomaly.depthM}m</span>
      </div>

      {anomaly.clutterWarning && (
        <div className="mt-2 text-[9px] px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono">
          ⚠️ Potential Off-Nadir Clutter (slope &gt; 2°)
        </div>
      )}
    </div>
  );
}

export function HypothesisPanel() {
  const { anomalies } = useCryoState();

  if (anomalies.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <div className="text-2xl mb-2">🔬</div>
        <p>Run auto-detection first to see hypothesis analysis</p>
        <p className="text-[10px] text-gray-600 mt-1">Bayesian posterior probabilities for each BBR anomaly</p>
      </div>
    );
  }

  const waterCount = anomalies.filter(a => a.hypothesis.dominantHypothesis === 'liquid-water').length;
  const clayCount = anomalies.filter(a => a.hypothesis.dominantHypothesis === 'smectite-clay').length;
  const clutterCount = anomalies.filter(a => a.hypothesis.dominantHypothesis === 'clutter').length;

  return (
    <div className="p-3 space-y-3 overflow-y-auto max-h-full">
      <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
        Counter-Hypothesis Analysis
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-space-800/50 rounded-lg p-2 text-center border border-neon-cyan/20">
          <div className="text-lg font-bold text-neon-cyan">{waterCount}</div>
          <div className="text-[8px] text-gray-500 font-mono">WATER</div>
        </div>
        <div className="bg-space-800/50 rounded-lg p-2 text-center border border-purple-500/20">
          <div className="text-lg font-bold text-purple-400">{clayCount}</div>
          <div className="text-[8px] text-gray-500 font-mono">SMECTITE</div>
        </div>
        <div className="bg-space-800/50 rounded-lg p-2 text-center border border-amber-500/20">
          <div className="text-lg font-bold text-amber-400">{clutterCount}</div>
          <div className="text-[8px] text-gray-500 font-mono">CLUTTER</div>
        </div>
      </div>

      <div className="text-[9px] text-gray-500 bg-space-800/30 rounded p-2 border border-space-700">
        <span className="text-gray-400 font-semibold">Method:</span> Bayesian posterior probability
        P(Hᵢ|e) ∝ P(e|Hᵢ)·P(Hᵢ) — Orosei (2018) vs Bierson (2021)
      </div>

      {anomalies.slice(0, 20).map((a) => (
        <AnomalyHypothesisCard key={`${a.traceIndex}-${a.sampleIndex}`} anomaly={a} />
      ))}

      {anomalies.length > 20 && (
        <div className="text-center text-[10px] text-gray-500 py-2">
          Showing 20 of {anomalies.length} anomalies
        </div>
      )}
    </div>
  );
}
