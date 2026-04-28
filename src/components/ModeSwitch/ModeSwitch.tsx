/* CRYORADAR — Explorer/Analyst Mode Switch
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS) */

import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';

export function ModeSwitch() {
  const { viewMode } = useCryoState();
  const dispatch = useCryoDispatch();
  const isExplorer = viewMode === 'explorer';

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => dispatch({ type: 'SET_VIEW_MODE', viewMode: isExplorer ? 'analyst' : 'explorer' })}
        className="relative flex items-center h-8 w-[140px] rounded-full border border-space-700 bg-space-900 transition-all duration-300 hover:border-neon-cyan/30"
      >
        <div
          className={`absolute h-7 w-[68px] rounded-full transition-all duration-300 ${
            isExplorer
              ? 'left-[1px] bg-gradient-to-r from-neon-cyan/20 to-neon-blue/20 border border-neon-cyan/40'
              : 'left-[69px] bg-gradient-to-r from-neon-orange/20 to-neon-red/20 border border-neon-orange/40'
          }`}
        />
        <span className={`relative z-10 flex-1 text-center text-[11px] font-medium font-mono transition-colors duration-300 ${
          isExplorer ? 'text-neon-cyan' : 'text-gray-500'
        }`}>
          Explorer
        </span>
        <span className={`relative z-10 flex-1 text-center text-[11px] font-medium font-mono transition-colors duration-300 ${
          !isExplorer ? 'text-neon-orange' : 'text-gray-500'
        }`}>
          Analyst
        </span>
      </button>
      <div className={`w-2 h-2 rounded-full animate-pulse-slow ${isExplorer ? 'bg-neon-cyan' : 'bg-neon-orange'}`} />
    </div>
  );
}
