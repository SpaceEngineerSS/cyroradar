import { useRef, useState } from 'react';
import { useApp } from '../../store/app';
import { listSyntheticScenes } from '../../core/pipeline/synthetic-generator';
import { searchProducts } from '../../core/pipeline/pds-client';
import { PDS_REGIONS, type PDSProduct } from '../../types/pds-types';
import { Button, EmptyState, Note, NumberField, Progress, Readout, Section, Select } from '../../ui/controls';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/icons';
import { saveSession, loadSession } from '../session';

const scenes = listSyntheticScenes();

function SceneList() {
  const key = useApp(s => s.datasetKey);
  const busy = useApp(s => s.datasetStatus === 'running');
  const load = useApp(s => s.loadSynthetic);
  return (
    <ul className="-mx-4 divide-y divide-line border-y border-line">
      {scenes.map(s => {
        const active = key === `synthetic:${s.id}`;
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={busy}
              aria-current={active}
              onClick={() => load(s.id)}
              className={cx('flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-60', active ? 'bg-accent-soft' : 'hover:bg-hover')}
            >
              <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0', active ? 'bg-accent' : 'bg-line-strong')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{s.title}</span>
                  <span className="num text-2xs text-dim">{s.instrument}</span>
                </span>
                <span className="block text-xs text-dim">{s.region}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PdsSearch() {
  const loadPds = useApp(s => s.loadPds);
  const busy = useApp(s => s.datasetStatus === 'running');
  const [region, setRegion] = useState(PDS_REGIONS[0].id);
  const [bounds, setBounds] = useState({ minLat: PDS_REGIONS[0].minLat, maxLat: PDS_REGIONS[0].maxLat, westLon: PDS_REGIONS[0].westLon, eastLon: PDS_REGIONS[0].eastLon });
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; products: PDSProduct[]; count: number; error?: string; offset: number }>({ status: 'idle', products: [], count: 0, offset: 0 });
  const abort = useRef<AbortController | null>(null);

  const search = async (offset = 0) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setState(s => ({ ...s, status: 'loading', error: undefined, offset }));
    try {
      const res = await searchProducts({ ...bounds, limit: 15, offset }, ctl.signal);
      if (ctl.signal.aborted) return;
      setState(s => ({ status: 'done', products: offset ? [...s.products, ...res.products] : res.products, count: res.count, offset }));
    } catch (err) {
      if (ctl.signal.aborted) return;
      setState(s => ({ ...s, status: 'error', error: err instanceof Error ? err.message : String(err) }));
    }
  };

  return (
    <>
      <Select
        label="Region"
        value={region}
        onChange={e => {
          const r = PDS_REGIONS.find(x => x.id === e.target.value);
          setRegion(e.target.value);
          if (r) setBounds({ minLat: r.minLat, maxLat: r.maxLat, westLon: r.westLon, eastLon: r.eastLon });
        }}
      >
        {PDS_REGIONS.map(r => (
          <option key={r.id} value={r.id}>
            {r.name} · {r.description}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Min latitude" value={bounds.minLat} min={-90} max={90} step={1} unit="°" onChange={v => setBounds(b => ({ ...b, minLat: v }))} />
        <NumberField label="Max latitude" value={bounds.maxLat} min={-90} max={90} step={1} unit="°" onChange={v => setBounds(b => ({ ...b, maxLat: v }))} />
        <NumberField label="West longitude" value={bounds.westLon} min={0} max={360} step={1} unit="°E" onChange={v => setBounds(b => ({ ...b, westLon: v }))} />
        <NumberField label="East longitude" value={bounds.eastLon} min={0} max={360} step={1} unit="°E" onChange={v => setBounds(b => ({ ...b, eastLon: v }))} />
      </div>
      <Button tone="primary" icon="search" onClick={() => search(0)} disabled={state.status === 'loading'}>
        Search SHARAD radargrams
      </Button>
      {state.status === 'loading' && <Progress value={null} label="Searching" />}
      {state.status === 'error' && <Note tone="error">{state.error}</Note>}
      {state.status === 'done' && state.products.length === 0 && <Note>No SHARAD radargrams in that box. Try a larger area.</Note>}
      {state.products.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-2xs text-faint">
            Showing {state.products.length} of {state.count}
          </p>
          <ul className="-mx-4 divide-y divide-line border-y border-line">
            {state.products.map(p => (
              <li key={p.productId} className="flex flex-col gap-1.5 px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="num text-sm">{p.productId.replace(/_rgram$/i, '').toUpperCase()}</span>
                  <span className="num text-2xs text-faint">{p.observationTime.slice(0, 10)}</span>
                </div>
                <span className="num text-2xs text-dim">
                  orbit {p.orbitNumber} · {p.startLat.toFixed(1)}° → {p.stopLat.toFixed(1)}°
                </span>
                <div className="flex gap-1.5">
                  <Button size="sm" disabled={busy} onClick={() => loadPds(p, false)} title="8-bit browse TIFF, about 5 MB">
                    Browse image
                  </Button>
                  <Button size="sm" tone="quiet" disabled={busy} onClick={() => loadPds(p, true)} title="Float32 RGRAM.IMG, about 20 MB">
                    Calibrated power
                  </Button>
                  <a href={p.externalUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center text-faint hover:text-ink" aria-label="Open product page at ODE">
                    <Icon name="external" size={14} />
                  </a>
                </div>
              </li>
            ))}
          </ul>
          {state.products.length < state.count && (
            <Button size="sm" tone="quiet" onClick={() => search(state.offset + 15)} disabled={state.status === 'loading'}>
              Load more
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function FileOpen() {
  const loadFile = useApp(s => s.loadFile);
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) void loadFile(f);
      }}
      className={cx('flex flex-col items-start gap-2 border border-dashed p-3 transition-colors', over ? 'border-accent bg-accent-soft' : 'border-line-strong')}
    >
      <p className="text-xs text-dim">Drop a .tif, .csv or .txt radargram here, or</p>
      <Button size="sm" icon="upload" onClick={() => ref.current?.click()}>
        Choose a file
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".tif,.tiff,.csv,.txt"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = '';
        }}
      />
      <p className="text-2xs text-faint">CSV: one row per delay sample, one column per trace, in dB or linear power. SHARAD sampling is assumed.</p>
    </div>
  );
}

function DatasetInfo() {
  const ds = useApp(s => s.dataset);
  if (!ds) return <EmptyState icon="info" title="Nothing loaded yet">Pick a scene above or search the archive.</EmptyState>;
  const { metadata: m, radargram: r } = ds;
  return (
    <>
      <p className="text-sm text-dim">{m.description}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Readout label="Instrument" value={m.instrument} />
        <Readout label="Centre frequency" value={(m.frequencyHz / 1e6).toFixed(0)} unit="MHz" />
        <Readout label="Grid" value={`${r.width} × ${r.height}`} />
        <Readout label="Sampling" value={(r.sampleInterval * 1e9).toFixed(1)} unit="ns" />
        <Readout label="Track length" value={((r.width * r.traceSpacingM) / 1000).toFixed(0)} unit="km" />
        <Readout label="Centre" value={`${m.centerLat.toFixed(1)}°, ${m.centerLon.toFixed(1)}°E`} />
      </div>
      {m.references.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="label">References</h4>
          <ol className="flex flex-col gap-2 text-xs text-dim">
            {m.references.map(ref => (
              <li key={ref.title}>
                {ref.authors} ({ref.year}). {ref.title}. <i>{ref.journal}</i>.
                {ref.doi && (
                  <>
                    {' '}
                    <a className="text-accent underline-offset-2 hover:underline" href={`https://doi.org/${ref.doi}`} target="_blank" rel="noreferrer">
                      doi:{ref.doi}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

export default function DataPanel() {
  const hasData = useApp(s => !!s.dataset);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Section title="Simulated scenes">
        <SceneList />
      </Section>
      <Section title="NASA PDS · SHARAD">
        <PdsSearch />
      </Section>
      <Section title="Local file" defaultOpen={false}>
        <FileOpen />
      </Section>
      <Section title="This radargram">
        <DatasetInfo />
      </Section>
      <Section title="Session" defaultOpen={false}>
        <p className="text-xs text-dim">Saves your depth model, picks, detection settings and display choices. The radargram itself is reloaded from its source.</p>
        <div className="flex gap-2">
          <Button size="sm" icon="save" disabled={!hasData} onClick={saveSession}>
            Save session
          </Button>
          <Button size="sm" icon="upload" onClick={() => ref.current?.click()}>
            Open session
          </Button>
          <input
            ref={ref}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void loadSession(f);
              e.target.value = '';
            }}
          />
        </div>
      </Section>
    </>
  );
}
