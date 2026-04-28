/* CRYORADAR — PolSAR Analysis Panel (Production)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Displays Pauli RGB decomposition and Cloude-Pottier H/α classification. */

import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';
import { generateSyntheticPolSAR } from '../../core/analysis/polsar';

export function PolSARPanel() {
  const { dataset, polsarData, showPolSAR } = useCryoState();
  const dispatch = useCryoDispatch();

  const handleCompute = () => {
    if (!dataset) return;
    dispatch({ type: 'SET_LOADING', loading: true });
    requestAnimationFrame(() => {
      const result = generateSyntheticPolSAR(dataset.radargram);
      dispatch({ type: 'SET_POLSAR_DATA', data: result });
      dispatch({ type: 'SET_LOADING', loading: false });
    });
  };

  if (!dataset) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <span className="text-3xl block mb-2">📡</span>
        Load a dataset to run PolSAR analysis
      </div>
    );
  }

  const avgEntropy = polsarData
    ? (polsarData.pixels.reduce((s, p) => s + p.cloudePottier.entropy, 0) / polsarData.pixels.length).toFixed(3)
    : '—';
  const avgAlpha = polsarData
    ? ((polsarData.pixels.reduce((s, p) => s + p.cloudePottier.meanAlpha, 0) / polsarData.pixels.length) * 180 / Math.PI).toFixed(1) + '°'
    : '—';
  const avgAniso = polsarData
    ? (polsarData.pixels.reduce((s, p) => s + p.cloudePottier.anisotropy, 0) / polsarData.pixels.length).toFixed(3)
    : '—';

  const totalPower = polsarData
    ? polsarData.pixels.reduce((s, p) => s + p.pauli.totalPower, 0)
    : 0;
  const surfacePct = polsarData && totalPower > 0
    ? ((polsarData.pixels.reduce((s, p) => s + p.pauli.surface, 0) / totalPower) * 100).toFixed(1)
    : '—';
  const dihedralPct = polsarData && totalPower > 0
    ? ((polsarData.pixels.reduce((s, p) => s + p.pauli.dihedral, 0) / totalPower) * 100).toFixed(1)
    : '—';
  const volumePct = polsarData && totalPower > 0
    ? ((polsarData.pixels.reduce((s, p) => s + p.pauli.volume, 0) / totalPower) * 100).toFixed(1)
    : '—';

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neon-cyan">📡 PolSAR Decomposition</h3>
        <button
          className="px-2.5 py-1 text-[10px] font-medium bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 rounded hover:bg-neon-cyan/20 transition-all"
          onClick={handleCompute}
        >
          {polsarData ? '↻ Recompute' : '▶ Compute'}
        </button>
      </div>

      <p className="text-gray-500 text-[10px] leading-relaxed">
        Polarimetric decomposition separates backscattered radar energy into 
        surface (single-bounce), dihedral (double-bounce), and volume scattering.
      </p>

      {polsarData && (
        <>
          {/* Pauli Power Bars */}
          <div className="bg-space-800/50 rounded-lg p-2.5 border border-space-700 space-y-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pauli Scattering Power</span>
            <div className="space-y-1.5">
              <PowerBar label="Surface (α)" pct={parseFloat(surfacePct as string)} color="bg-blue-400" />
              <PowerBar label="Dihedral (β)" pct={parseFloat(dihedralPct as string)} color="bg-red-400" />
              <PowerBar label="Volume (γ)" pct={parseFloat(volumePct as string)} color="bg-green-400" />
            </div>
            <p className="text-[9px] text-gray-600 mt-1">
              RGB Composite: R=Dihedral, G=Volume, B=Surface
            </p>
          </div>

          {/* Cloude-Pottier Stats */}
          <div className="bg-space-800/50 rounded-lg p-2.5 border border-space-700 space-y-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cloude-Pottier Classification</span>
            <StatRow label="Entropy (H)" value={avgEntropy} hint="0=deterministic, 1=random" />
            <StatRow label="Mean Alpha (ᾱ)" value={avgAlpha} hint="0°=surface, 90°=dihedral" />
            <StatRow label="Anisotropy (A)" value={avgAniso} hint="λ₂ vs λ₃ discrimination" />
            <div className="mt-2 text-[9px] text-gray-600">
              <p className="font-mono">H→0, ᾱ→0°: Clean specular interface</p>
              <p className="font-mono">H→1: Diffuse volume scattering (dusty ice)</p>
            </div>
          </div>

          {/* Toggle overlay */}
          <button
            className={`w-full py-1.5 text-[10px] font-medium rounded border transition-all ${
              showPolSAR
                ? 'bg-neon-orange/10 text-neon-orange border-neon-orange/30'
                : 'bg-space-800 text-gray-400 border-space-700 hover:bg-space-700'
            }`}
            onClick={() => dispatch({ type: 'TOGGLE_POLSAR' })}
          >
            {showPolSAR ? '🔴 Hide PolSAR Overlay' : '🟢 Show PolSAR Overlay'}
          </button>
        </>
      )}

      <div className="text-[9px] text-gray-600 border-t border-space-700 pt-2">
        <p>Ref: Cloude & Pottier (1997), IEEE TGRS 35(1)</p>
        <p>Lee & Pottier (2009), Polarimetric Radar Imaging</p>
      </div>
    </div>
  );
}

function PowerBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-gray-400 text-[10px]">{label}</span>
      <div className="flex-1 h-2 bg-space-900 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="w-10 text-right text-gray-300 font-mono text-[10px]">{pct}%</span>
    </div>
  );
}

function StatRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-600 text-[9px] ml-1">({hint})</span>
      </div>
      <span className="font-mono text-neon-cyan">{value}</span>
    </div>
  );
}
