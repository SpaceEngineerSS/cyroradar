import { useRef } from 'react';
import { motion } from 'motion/react';
import { Link } from 'wouter';
import { useApp } from '../../store/app';
import { listSyntheticScenes } from '../../core/pipeline/synthetic-generator';
import { Button } from '../../ui/controls';
import { Icon } from '../../ui/icons';

const scenes = listSyntheticScenes();

/** Cross-section sketch of the featured scene: orbiter, ice, and a bright patch at the base. */
function SouthPoleSketch() {
  return (
    <svg viewBox="0 0 360 170" className="h-auto w-full" role="img" aria-label="Sketch: an orbiter sounding 1.5 km of ice with a bright patch at the base">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0v6" stroke="var(--c-line-strong)" strokeWidth="1" />
        </pattern>
      </defs>
      {/* orbiter */}
      <g stroke="var(--c-ink)" strokeWidth="1.25" fill="none">
        <rect x="170" y="8" width="20" height="10" />
        <path d="M150 13h20M190 13h20" />
      </g>
      <path d="M180 18 120 64M180 18 240 64" stroke="var(--c-faint)" strokeDasharray="3 3" />
      <path d="M180 18v46" stroke="var(--c-accent)" strokeWidth="1.25" />
      {/* surface and ice */}
      <path d="M10 64c60-4 120 3 170 0s110-4 170 1" stroke="var(--c-ink)" strokeWidth="1.25" fill="none" />
      <path d="M10 64c60-4 120 3 170 0s110-4 170 1V128H10Z" fill="var(--c-sunken)" />
      {[78, 90, 101].map((y, i) => (
        <path key={y} d={`M10 ${y}c70 ${i % 2 ? 3 : -3} 150 ${i % 2 ? -2 : 2} 340 0`} stroke="var(--c-line-strong)" fill="none" />
      ))}
      {/* base */}
      <path d="M10 128h340" stroke="var(--c-ink)" strokeWidth="1.25" />
      <rect x="10" y="128" width="340" height="30" fill="url(#hatch)" />
      <path d="M150 128h70" stroke="var(--c-water)" strokeWidth="4" />
      <path d="M262 128h14" stroke="var(--c-water)" strokeWidth="4" />
      {/* annotations */}
      <g fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--c-faint)">
        <text x="14" y="58">surface</text>
        <text x="14" y="122">base of ice, ≈ 1.5 km</text>
        <text x="150" y="146" fill="var(--c-water)">bright basal echo</text>
        <text x="216" y="16">MARSIS</text>
      </g>
    </svg>
  );
}

export function Welcome() {
  const loadSynthetic = useApp(s => s.loadSynthetic);
  const loadFile = useApp(s => s.loadFile);
  const set = useApp(s => s.set);
  const status = useApp(s => s.datasetStatus);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = status === 'running';

  const startTour = async () => {
    set('mode', 'explorer');
    set('panel', 'tour');
    set('inspectorOpen', true);
    await loadSynthetic('planum-australe');
    set('tourStep', 0);
  };

  return (
    <div className="h-full overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
        className="mx-auto grid max-w-5xl gap-10 px-6 py-10 lg:grid-cols-[1.15fr_1fr] lg:py-16"
      >
        <section className="flex flex-col gap-5">
          <p className="label">Start here</p>
          <h1 className="max-w-[22ch] text-[28px] leading-[34px] font-semibold tracking-[-0.015em]">
            Look under the ice of Mars with the same data the radar teams use.
          </h1>
          <p className="max-w-[60ch] text-dim">
            CryoRadar reads SHARAD radargrams straight from NASA&apos;s archive and simulates MARSIS and SHARAD scenes from layered ice models.
            It converts echo delay to depth, looks for unusually bright reflections at the base of the ice, and lets you test what could cause them.
          </p>

          <figure className="border border-line bg-raised">
            <SouthPoleSketch />
            <figcaption className="flex flex-col gap-3 border-t border-line p-4">
              <div>
                <p className="text-sm font-medium">Planum Australe, south polar cap</p>
                <p className="text-xs text-dim">A simulated MARSIS track over the area where Orosei et al. (2018) reported a bright basal reflection.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button tone="primary" icon="play" disabled={busy} onClick={() => loadSynthetic('planum-australe')}>
                  Open this scene
                </Button>
                <Button icon="tour" disabled={busy} onClick={startTour}>
                  Guided tour
                </Button>
              </div>
            </figcaption>
          </figure>
        </section>

        <section className="flex flex-col gap-6 lg:pt-9">
          <div>
            <h2 className="label mb-2">Other simulated scenes</h2>
            <ul className="divide-y divide-line border-y border-line">
              {scenes
                .filter(s => s.id !== 'planum-australe')
                .map(s => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => loadSynthetic(s.id)}
                      className="group flex w-full items-center justify-between gap-3 py-2.5 text-left disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium group-hover:text-accent">{s.title}</span>
                        <span className="block truncate text-xs text-faint">{s.region}</span>
                      </span>
                      <span className="num shrink-0 text-2xs text-faint">{s.instrument}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="label">Real data</h2>
            <p className="text-xs text-dim">Search the SHARAD archive by region and load a track. Browse images are about 5 MB; calibrated power is about 20 MB.</p>
            <div className="flex flex-wrap gap-2">
              <Button icon="search" onClick={() => { set('panel', 'data'); set('inspectorOpen', true); }}>
                Search NASA PDS
              </Button>
              <Button icon="upload" onClick={() => fileRef.current?.click()}>
                Open a file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".tif,.tiff,.csv,.txt"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void loadFile(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <Link href="/docs" className="inline-flex items-center gap-1.5 text-sm text-dim hover:text-ink">
            <Icon name="docs" size={16} />
            How the physics works
            <Icon name="chevronRight" size={14} />
          </Link>
        </section>
      </motion.div>
    </div>
  );
}
