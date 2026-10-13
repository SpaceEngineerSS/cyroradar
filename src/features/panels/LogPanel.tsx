import { useState } from 'react';
import { useApp } from '../../store/app';
import { CLASS_LABELS } from '../../core/analysis/anomaly-detector';
import { downloadBlob } from '../session';
import { Button, EmptyState, IconButton, Section } from '../../ui/controls';
import type { DiscoveryEntry } from '../../types/types';

const COLUMNS: [keyof DiscoveryEntry, string][] = [
  ['timestamp', 'saved_utc'],
  ['datasetId', 'dataset'],
  ['region', 'scene'],
  ['traceIndex', 'trace'],
  ['latitude', 'lat_deg'],
  ['longitude', 'lon_deg_e'],
  ['depthM', 'depth_m'],
  ['apparentPermittivity', 'basal_eps'],
  ['basalReflectivityDb', 'basal_reflectivity_db'],
  ['classification', 'class'],
  ['confidence', 'confidence'],
  ['pLiquidWater', 'p_water'],
  ['pSmectiteClay', 'p_clay'],
  ['pClutter', 'p_clutter'],
  ['notes', 'notes'],
];

function toCsv(entries: DiscoveryEntry[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = entries.map(e =>
    COLUMNS.map(([k]) => {
      const v = e[k];
      if (k === 'timestamp') return new Date(v as number).toISOString();
      return typeof v === 'number' ? Number(v.toPrecision(6)) : esc(v);
    }).join(','),
  );
  return [`# CryoRadar ${__APP_VERSION__} discovery log, exported ${new Date().toISOString()}`, COLUMNS.map(c => c[1]).join(','), ...rows].join('\n');
}

function Entry({ e }: { e: DiscoveryEntry }) {
  const update = useApp(s => s.updateLogNote);
  const remove = useApp(s => s.removeLogEntry);
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{e.region}</span>
        <IconButton icon="trash" label="Remove entry" size={24} tip={false} onClick={() => remove(e.id)} />
      </div>
      <div className="num grid grid-cols-3 gap-x-2 text-2xs text-dim">
        <span>{e.depthM.toFixed(0)} m</span>
        <span>ε {e.apparentPermittivity.toFixed(1)}</span>
        <span>{e.basalReflectivityDb.toFixed(1)} dB</span>
        <span>{e.latitude.toFixed(2)}°</span>
        <span>{e.longitude.toFixed(2)}°E</span>
        <span>tr {e.traceIndex}</span>
      </div>
      <div className="text-xs text-dim">
        {CLASS_LABELS[e.classification]} · water {(e.pLiquidWater * 100).toFixed(0)}% · clay {(e.pSmectiteClay * 100).toFixed(0)}% · clutter {(e.pClutter * 100).toFixed(0)}%
      </div>
      <textarea
        aria-label="Notes"
        defaultValue={e.notes}
        onBlur={ev => update(e.id, ev.target.value)}
        rows={2}
        className="field h-auto resize-y py-1.5 text-xs"
      />
      <span className="num text-2xs text-faint">{new Date(e.timestamp).toISOString().replace('T', ' ').slice(0, 16)} UTC</span>
    </li>
  );
}

export default function LogPanel() {
  const log = useApp(s => s.log);
  const clear = useApp(s => s.clearLog);
  const notify = useApp(s => s.notify);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (log.length === 0)
    return (
      <EmptyState icon="log" title="The log is empty">
        Detections you add from the Detection panel are kept here, in this browser, until you remove them.
      </EmptyState>
    );

  const stamp = new Date().toISOString().slice(0, 10);
  const report = async () => {
    setBusy(true);
    try {
      const { generateReport } = await import('../../core/export/report-generator');
      await generateReport();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Section title="Export" collapsible={false}>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon="download" onClick={() => downloadBlob(new Blob([toCsv(log)], { type: 'text/csv' }), `cryoradar-log-${stamp}.csv`)}>
            CSV
          </Button>
          <Button size="sm" icon="download" onClick={() => downloadBlob(new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' }), `cryoradar-log-${stamp}.json`)}>
            JSON
          </Button>
          <Button size="sm" icon="file" disabled={busy} onClick={report} title="Report for the current radargram, with the plot and the detections">
            {busy ? 'Preparing…' : 'PDF report'}
          </Button>
        </div>
      </Section>
      <Section title={`Entries (${log.length})`} collapsible={false} actions={
        confirming ? (
          <>
            <Button size="sm" tone="danger" onClick={() => { clear(); setConfirming(false); }}>Delete all</Button>
            <Button size="sm" tone="quiet" onClick={() => setConfirming(false)}>Keep</Button>
          </>
        ) : (
          <Button size="sm" tone="quiet" onClick={() => setConfirming(true)}>Clear</Button>
        )
      }>
        <ul className="-mx-4 divide-y divide-line border-y border-line">
          {log.map(e => (
            <Entry key={e.id} e={e} />
          ))}
        </ul>
      </Section>
    </>
  );
}
