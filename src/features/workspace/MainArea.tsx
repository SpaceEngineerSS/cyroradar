import { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../store/app';
import { fitViewport } from '../../store/viewport';
import { RadargramView } from '../radargram/RadargramView';
import { Welcome } from './Welcome';
import { IconButton, Progress, Segmented } from '../../ui/controls';
import { cx } from '../../ui/cx';
import { Icon, type IconName } from '../../ui/icons';
import type { InteractionMode, MainView } from '../../types/types';
import { capturePlot } from '../../core/export/capture';

const AScopeView = lazy(() => import('../ascope/AScopeView'));
const TrackMapView = lazy(() => import('../map/TrackMapView'));
const SceneView = lazy(() => import('../scene/SceneView'));

const VIEWS: { id: MainView; label: string; icon: IconName; key: string }[] = [
  { id: 'radargram', label: 'Radargram', icon: 'radargram', key: '1' },
  { id: 'ascope', label: 'A-scope', icon: 'ascope', key: '2' },
  { id: 'map', label: 'Track', icon: 'map', key: '3' },
  { id: 'scene', label: '3D', icon: 'scene', key: '4' },
];

const TOOLS: { id: InteractionMode; label: string; icon: IconName; key: string }[] = [
  { id: 'pan', label: 'Pan and select', icon: 'pan', key: 'V' },
  { id: 'pick', label: 'Pick a horizon', icon: 'pick', key: 'P' },
  { id: 'measure', label: 'Measure', icon: 'measure', key: 'M' },
  { id: 'roi', label: 'Region for inversion', icon: 'roi', key: 'R' },
];

function ViewTabs() {
  const view = useApp(s => s.mainView);
  const set = useApp(s => s.set);
  return (
    <div role="tablist" aria-label="Views" className="flex h-full items-stretch">
      {VIEWS.map(v => {
        const active = v.id === view;
        return (
          <button
            key={v.id}
            role="tab"
            aria-selected={active}
            aria-label={v.label}
            onClick={() => set('mainView', v.id)}
            className={cx('relative flex items-center gap-1.5 px-3 text-sm transition-colors', active ? 'text-ink' : 'text-faint hover:text-dim')}
          >
            <Icon name={v.icon} size={16} />
            <span className="hidden sm:inline">{v.label}</span>
            {active && <motion.span layoutId="view-tab" className="absolute inset-x-2 -bottom-px h-[2px] bg-accent" transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }} />}
          </button>
        );
      })}
    </div>
  );
}

function Toolstrip() {
  const tool = useApp(s => s.tool);
  const set = useApp(s => s.set);
  const dataset = useApp(s => s.dataset);
  const migrated = useApp(s => !!s.migration.result);
  const variant = useApp(s => s.variant);
  const compare = useApp(s => s.compare);
  const notify = useApp(s => s.notify);
  return (
    <div className="flex items-center gap-0.5">
      {TOOLS.map(t => (
        <IconButton key={t.id} icon={t.icon} label={t.label} shortcut={t.key} pressed={tool === t.id} size={30} onClick={() => set('tool', t.id)} />
      ))}
      <span className="mx-1.5 h-4 w-px bg-line" />
      {migrated && (
        <>
          <Segmented<'raw' | 'migrated'>
            label="Image"
            size="sm"
            value={variant}
            onChange={v => set('variant', v)}
            options={[{ value: 'raw', label: 'Raw' }, { value: 'migrated', label: 'Migrated' }]}
          />
          <IconButton icon="split" label="Compare side by side" pressed={compare} size={30} onClick={() => set('compare', !compare)} />
          <span className="mx-1.5 h-4 w-px bg-line" />
        </>
      )}
      <IconButton icon="fit" label="Fit to view" shortcut="0" size={30} onClick={() => dataset && fitViewport(dataset.radargram.width, dataset.radargram.height)} />
      <IconButton
        icon="download"
        label="Save image (PNG)"
        size={30}
        onClick={() => capturePlot().catch(err => notify(err instanceof Error ? err.message : String(err), 'error'))}
      />
    </div>
  );
}

function Radargrams() {
  const variant = useApp(s => s.variant);
  const compare = useApp(s => s.compare && !!s.migration.result);
  if (compare)
    return (
      <div className="grid h-full grid-cols-2 gap-px bg-line">
        <RadargramView variant="raw" caption="Raw" />
        <RadargramView variant="migrated" caption="Migrated" showAxes={false} />
      </div>
    );
  return <RadargramView variant={variant} />;
}

export function MainArea() {
  const view = useApp(s => s.mainView);
  const dataset = useApp(s => s.dataset);
  const status = useApp(s => s.datasetStatus);

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-line bg-raised pr-2">
        <ViewTabs />
        {dataset && view === 'radargram' && <Toolstrip />}
      </div>
      <div className="relative min-h-0 flex-1">
        {status === 'running' && <div className="absolute inset-x-0 top-0 z-10"><Progress value={null} label="Loading" /></div>}
        {!dataset ? (
          <Welcome />
        ) : (
          <Suspense fallback={<div className="plot h-full" />}>
            {view === 'radargram' && <Radargrams />}
            {view === 'ascope' && <AScopeView />}
            {view === 'map' && <TrackMapView />}
            {view === 'scene' && <SceneView />}
          </Suspense>
        )}
      </div>
    </main>
  );
}
