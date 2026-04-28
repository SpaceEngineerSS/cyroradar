/* CRYORADAR — Developer Attribution Card
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS) */

export function AboutDeveloper() {
  return (
    <div className="p-4 space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-space-700 bg-gradient-to-br from-space-850 to-space-900 p-6">
        <div className="absolute top-0 right-0 w-32 h-32 bg-neon-cyan/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-neon-purple/5 rounded-full blur-3xl" />

        <div className="relative space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-neon-cyan to-neon-blue flex items-center justify-center text-2xl font-bold text-space-900 font-display shadow-lg shadow-neon-cyan/20">
              MG
            </div>
            <div>
              <h2 className="text-lg font-semibold font-display text-gray-100">Mehmet Gümüş</h2>
              <p className="text-xs font-mono text-neon-cyan/80">Chief Scientist & Architect</p>
            </div>
          </div>

          <a
            href="https://github.com/SpaceEngineerSS"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-space-800 border border-space-700 text-sm text-gray-300 hover:border-neon-cyan/40 hover:text-neon-cyan transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            github.com/SpaceEngineerSS
          </a>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 font-mono">About CRYORADAR</h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          High-fidelity Mars subsurface ice detection radar simulator. Processes real NASA PDS ODE 
          data (SHARAD/MARSIS) with a physics engine derived from first principles and peer-reviewed 
          planetary science research.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 font-mono">Tech Stack</h3>
        <div className="flex flex-wrap gap-1.5">
          {['React 19', 'TypeScript', 'Vite', 'Three.js', 'Canvas 2D', 'Tailwind CSS', 'NASA PDS API'].map(tech => (
            <span key={tech} className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-space-800 border border-space-700 text-gray-400">
              {tech}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 font-mono">Physics Engine</h3>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan" />
            Radar Link Budget
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green" />
            Fresnel Reflection
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-orange" />
            Signal Attenuation
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-purple" />
            Debye Relaxation
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-blue" />
            Maxwell-Garnett
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-red" />
            L-M Inversion
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-space-700">
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-600">
          <span>CRYORADAR v3.0</span>
          <span>13+ peer-reviewed refs</span>
          <span>16 materials</span>
        </div>
      </div>
    </div>
  );
}
