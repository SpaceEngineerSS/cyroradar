/* CRYORADAR — Uncertainty Quantification Panel (v7.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Monte Carlo UQ results and confidence map toggle. */

import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';
import { runUncertaintyAnalysis } from '../../core/analysis/uncertainty';

export function UQPanel() {
  const { anomalies, uqResults, showConfidenceMap } = useCryoState();
  const dispatch = useCryoDispatch();

  const handleRun = () => {
    if (anomalies.length === 0) return;
    dispatch({ type: 'SET_LOADING', loading: true });
    runUncertaintyAnalysis(anomalies, 1000, {
      onComplete: (results) => {
        dispatch({ type: 'SET_UQ_RESULTS', results });
        dispatch({ type: 'SET_LOADING', loading: false });
      },
      onError: (err) => {
        console.error('UQ error:', err);
        dispatch({ type: 'SET_LOADING', loading: false });
      },
    });
  };

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neon-cyan">📊 Uncertainty Quantification</h3>
        <button
          className="px-2.5 py-1 text-[10px] font-medium bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 rounded hover:bg-neon-cyan/20 transition-all disabled:opacity-30"
          onClick={handleRun}
          disabled={anomalies.length === 0}
        >
          ▶ Run MC (N=1000)
        </button>
      </div>

      <p className="text-gray-500 text-[10px] leading-relaxed">
        Monte Carlo propagation of ε uncertainty → depth error bounds.
        Samples N=1000 perturbations of the dielectric constant.
      </p>

      {anomalies.length === 0 && (
        <div className="text-center text-gray-600 py-4">
          <span className="text-2xl block mb-1">🎯</span>
          Run anomaly detection first
        </div>
      )}

      {uqResults.length > 0 && (
        <>
          <div className="bg-space-800/50 rounded-lg p-2.5 border border-space-700 space-y-1.5 max-h-[300px] overflow-y-auto">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Results ({uqResults.length} anomalies)
            </span>
            {uqResults.map((uq, i) => {
              const cv = uq.stdDevM / Math.max(uq.meanDepthM, 0.01);
              const level = cv < 0.05 ? 'HIGH' : cv < 0.15 ? 'MOD' : 'LOW';
              const color = cv < 0.05 ? 'text-green-400' : cv < 0.15 ? 'text-yellow-400' : 'text-red-400';
              return (
                <div key={i} className="flex items-center justify-between py-1 border-b border-space-700/50 last:border-0">
                  <span className="text-gray-400">#{i + 1}</span>
                  <span className="font-mono text-gray-200">
                    {uq.meanDepthM.toFixed(1)}m ± {uq.stdDevM.toFixed(1)}m
                  </span>
                  <span className={`font-mono text-[9px] ${color}`}>{level}</span>
                </div>
              );
            })}
          </div>

          <button
            className={`w-full py-1.5 text-[10px] font-medium rounded border transition-all ${
              showConfidenceMap
                ? 'bg-green-500/10 text-green-400 border-green-500/30'
                : 'bg-space-800 text-gray-400 border-space-700 hover:bg-space-700'
            }`}
            onClick={() => dispatch({ type: 'TOGGLE_CONFIDENCE_MAP' })}
          >
            {showConfidenceMap ? '🟢 Hide Confidence Map' : '📊 Show Confidence Map'}
          </button>
        </>
      )}

      <div className="text-[9px] text-gray-600 border-t border-space-700 pt-2">
        <p>ε_k ~ N(ε̂, σ²) → d_k = c·t/(2·√ε_k)</p>
        <p>CV = σ_d/μ_d: Green {'<'}5%, Yellow 5-15%, Red {'>'}15%</p>
      </div>
    </div>
  );
}
