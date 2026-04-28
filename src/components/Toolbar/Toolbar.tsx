/* CRYORADAR — Command Bar (Production)
 * Chief Scientist & Architect: Mehmet Gümüş (github.com/SpaceEngineerSS) */

import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';
import { ModeSwitch } from '../ModeSwitch/ModeSwitch';
import { getAllColormaps } from '../../core/colormaps/colormaps';
import { captureRadargramAsPNG } from '../../core/export/capture';
import type { ColormapId, InteractionMode } from '../../types/types';

const colormaps = getAllColormaps();

const modes: { id: InteractionMode; label: string; icon: string }[] = [
  { id: 'pan', label: 'Pan', icon: '✋' },
  { id: 'pick', label: 'Pick', icon: '📌' },
  { id: 'measure', label: 'Measure', icon: '📏' },
  { id: 'roi-select', label: 'ROI', icon: '🔲' },
];

export function Toolbar() {
  const state = useCryoState();
  const dispatch = useCryoDispatch();
  const isAnalyst = state.viewMode === 'analyst';

  return (
    <header className="flex items-center h-[52px] px-4 bg-space-900/90 backdrop-blur-lg border-b border-space-700 shrink-0 gap-3">
      <div className="flex items-center gap-2.5 mr-4">
        <span className="text-xl">❄️</span>
        <span className="text-base font-semibold font-display tracking-wide text-gray-100">CRYORADAR</span>
        <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">v1.0.0</span>
      </div>

      <ModeSwitch />

      <div className="w-px h-6 bg-space-700 mx-1" />

      {isAnalyst && (
        <>
          <div className="flex items-center gap-1">
            {modes.map(m => (
              <button
                key={m.id}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-200 border ${
                  state.mode === m.id
                    ? 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300 hover:bg-space-800'
                }`}
                onClick={() => dispatch({ type: 'SET_MODE', mode: m.id })}
                title={m.label}
              >
                <span>{m.icon}</span>
                <span className="hidden lg:inline">{m.label}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-space-700 mx-1" />

          <select
            className="h-7 px-2 text-[11px] font-mono bg-space-800 border border-space-700 rounded text-gray-300 focus:border-neon-cyan/40 focus:outline-none"
            value={state.colormap}
            onChange={e => dispatch({ type: 'SET_COLORMAP', colormap: e.target.value as ColormapId })}
          >
            {colormaps.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="hidden lg:flex items-center gap-2 ml-1">
            <span className="text-[10px] font-mono text-gray-500">Contrast</span>
            <input
              type="range" min="0" max="0.5" step="0.01"
              value={state.contrastMin}
              onChange={e => dispatch({ type: 'SET_CONTRAST', min: parseFloat(e.target.value), max: state.contrastMax })}
              className="w-16 h-1 accent-neon-cyan"
            />
            <input
              type="range" min="0.5" max="1" step="0.01"
              value={state.contrastMax}
              onChange={e => dispatch({ type: 'SET_CONTRAST', min: state.contrastMin, max: parseFloat(e.target.value) })}
              className="w-16 h-1 accent-neon-cyan"
            />
          </div>

          <div className="w-px h-6 bg-space-700 mx-1" />

          <div className="flex items-center gap-1">
            <ToggleBtn active={state.showMolaTopo} icon="🏔️" title="MOLA Topography" onClick={() => dispatch({ type: 'TOGGLE_MOLA' })} />
            <ToggleBtn active={state.showDepthGrid} icon="📐" title="Depth Grid" onClick={() => dispatch({ type: 'TOGGLE_DEPTH_GRID' })} />
            <ToggleBtn active={state.showLayerPicks} icon="📍" title="Layer Picks" onClick={() => dispatch({ type: 'TOGGLE_LAYER_PICKS' })} />
            <ToggleBtn active={state.showAnomalyOverlay} icon="🎯" title="Anomaly Overlay" onClick={() => dispatch({ type: 'TOGGLE_ANOMALY_OVERLAY' })} />
            <ToggleBtn active={state.showMigration} icon="🔄" title="Toggle Migration (Raw ↔ Focused)" onClick={() => dispatch({ type: 'TOGGLE_MIGRATION' })} />
            <ToggleBtn active={state.showStaticCorrection} icon="📏" title="Topographic Static Correction" onClick={() => dispatch({ type: 'TOGGLE_STATIC_CORRECTION' })} />
          </div>

          <div className="w-px h-6 bg-space-700 mx-1" />

          <div className="hidden lg:flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-500">TEC</span>
            <input
              type="range" min="0" max="5" step="0.1"
              value={state.tecUnits}
              onChange={e => dispatch({ type: 'SET_TEC', tec: parseFloat(e.target.value) })}
              className="w-14 h-1 accent-purple-500"
              title={`Ionosphere TEC: ${state.tecUnits.toFixed(1)} TECU`}
            />
            <span className="text-[9px] font-mono text-purple-400 w-8">{state.tecUnits.toFixed(1)}</span>
          </div>

          <div className="w-px h-6 bg-space-700 mx-1" />

          <button
            onClick={captureRadargramAsPNG}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-transparent border border-transparent text-gray-500 hover:text-gray-200 hover:bg-space-800 hover:border-space-600 transition-all duration-200"
            title="Capture High-Res Image (PNG)"
          >
            📸
            <span className="hidden xl:inline">Capture</span>
          </button>
        </>
      )}
    </header>
  );
}

function ToggleBtn({ active, icon, title, onClick }: { active: boolean; icon: string; title: string; onClick: () => void }) {
  return (
    <button
      className={`w-8 h-8 flex items-center justify-center rounded-md text-sm transition-all duration-200 border ${
        active
          ? 'bg-neon-cyan/10 border-neon-cyan/30 text-gray-200'
          : 'bg-transparent border-transparent text-gray-600 hover:text-gray-400 hover:bg-space-800'
      }`}
      onClick={onClick}
      title={title}
    >
      {icon}
    </button>
  );
}
