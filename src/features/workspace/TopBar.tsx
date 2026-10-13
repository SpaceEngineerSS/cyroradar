import { Link } from 'wouter';
import { useApp } from '../../store/app';
import { IconButton, Segmented, Progress } from '../../ui/controls';
import { cx } from '../../ui/cx';
import { Icon, LogoMark } from '../../ui/icons';
import type { ViewMode } from '../../types/types';

export function TopBar() {
  const dataset = useApp(s => s.dataset);
  const mode = useApp(s => s.mode);
  const theme = useApp(s => s.theme);
  const jobs = useApp(s => s.jobs);
  const set = useApp(s => s.set);
  const cancelJob = useApp(s => s.cancelJob);
  const job = jobs[jobs.length - 1];

  return (
    <header className="relative z-30 flex h-11 shrink-0 items-center gap-3 border-b border-line bg-raised pr-2 pl-3">
      <Link href="/" className="flex items-center gap-2 text-ink" aria-label="CryoRadar home">
        <LogoMark />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">CryoRadar</span>
      </Link>

      <span className="hidden h-5 w-px bg-line sm:block" />

      <div className="hidden min-w-0 flex-1 items-baseline gap-2 sm:flex">
        {dataset ? (
          <>
            <span className="truncate text-sm font-medium">{dataset.metadata.title}</span>
            <span className="num hidden truncate text-xs text-faint md:inline">
              {dataset.metadata.instrument}
              {dataset.metadata.orbitNumber ? ` · orbit ${dataset.metadata.orbitNumber}` : ''}
              {dataset.metadata.source === 'synthetic' ? ' · simulated' : dataset.metadata.source === 'pds' ? ' · NASA PDS' : ' · local file'}
            </span>
          </>
        ) : (
          <span className="text-sm text-faint">No radargram loaded</span>
        )}
      </div>
      <div className="flex-1 sm:hidden" />

      {job && (
        <div className="hidden w-52 items-center gap-2 md:flex" aria-live="polite">
          <div className="min-w-0 flex-1">
            <div className="truncate text-2xs text-dim">{job.label}</div>
            <Progress value={job.progress} label={job.label} />
          </div>
          {job.cancel && <IconButton icon="close" label={`Cancel ${job.label.toLowerCase()}`} size={24} onClick={() => cancelJob(job.key)} />}
        </div>
      )}

      <div className="hidden md:block">
        <Segmented<ViewMode>
          label="Interface mode"
          size="sm"
          value={mode}
          onChange={m => {
            set('mode', m);
            set('panel', m === 'explorer' ? 'tour' : 'data');
          }}
          options={[
            { value: 'explorer', label: 'Explore', title: 'Guided, fewer controls' },
            { value: 'analyst', label: 'Analyse', title: 'Every tool' },
          ]}
        />
      </div>

      <button
        type="button"
        onClick={() => set('paletteOpen', true)}
        className="hidden h-7 items-center gap-2 rounded-xs border border-line-strong px-2 text-xs text-faint hover:text-dim lg:flex"
      >
        <Icon name="search" size={14} />
        Commands
        <kbd className="num text-[10.5px]">Ctrl K</kbd>
      </button>
      <IconButton icon="search" label="Commands" className="lg:hidden" onClick={() => set('paletteOpen', true)} />

      <Link
        href="/docs"
        aria-label="Documentation"
        className={cx('inline-flex h-8 items-center gap-1.5 rounded-xs px-2 text-sm text-dim hover:bg-hover hover:text-ink')}
      >
        <Icon name="docs" size={16} />
        <span className="hidden sm:inline">Docs</span>
      </Link>
      <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => set('theme', theme === 'dark' ? 'light' : 'dark')} />
    </header>
  );
}
