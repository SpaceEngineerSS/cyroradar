import { useEffect, useState } from 'react';
import { useApp } from '../../store/app';
import { staticShifts } from '../../store/derived';
import { INSTRUMENTS } from '../../core/physics/constants';
import { ionosphericSmearS } from '../../core/pipeline/synthetic-generator';
import { Button, Checkbox, EmptyState, Note, NumberField, Progress, Readout, Section, Slider } from '../../ui/controls';

function Statics() {
  const ds = useApp(s => s.dataset);
  const statics = useApp(s => s.statics);
  const set = useApp(s => s.set);
  if (!ds) return null;
  const { shifts, datum } = staticShifts(ds);
  let maxShift = 0;
  for (const v of shifts) maxShift = Math.max(maxShift, Math.abs(v));
  return (
    <Section title="Static correction">
      <p className="text-xs text-dim">Moves each trace up or down so the surface echo sits on one row. Layers that follow the topography become flat, which makes them easier to compare.</p>
      <Checkbox label="Flatten to the surface" checked={statics} onChange={v => set('statics', v)} />
      <div className="grid grid-cols-2 gap-3">
        <Readout label="Datum row" value={datum} />
        <Readout label="Largest shift" value={`${maxShift}`} unit="samples" />
      </div>
    </Section>
  );
}

function Ionosphere() {
  const ds = useApp(s => s.dataset);
  const tecu = useApp(s => s.tecu);
  const setTecu = useApp(s => s.setTecu);
  const [draft, setDraft] = useState(tecu);
  const [seen, setSeen] = useState(tecu);
  if (tecu !== seen) {
    // The store changed underneath us (a link, a session): follow it.
    setSeen(tecu);
    setDraft(tecu);
  }
  useEffect(() => {
    if (draft === tecu) return;
    const id = setTimeout(() => setTecu(draft), 350);
    return () => clearTimeout(id);
  }, [draft, tecu, setTecu]);

  if (!ds || ds.metadata.source !== 'synthetic') {
    return (
      <Section title="Ionosphere">
        <Note>Archive radargrams already have the ionospheric correction applied. This setting changes simulated scenes only.</Note>
      </Section>
    );
  }
  const inst = INSTRUMENTS[ds.metadata.instrument];
  const smearUs = ionosphericSmearS(draft, inst.centerFrequencyHz, inst.bandwidthHz) * 1e6;
  return (
    <Section title="Ionosphere">
      <p className="text-xs text-dim">
        Free electrons delay low frequencies more than high ones, smearing each echo in time. Processing removes most of it; what is left grows with the total electron content and with 1/f², so MARSIS suffers far more than SHARAD.
      </p>
      <Slider label="Total electron content" value={draft} min={0} max={2} step={0.05} format={v => v.toFixed(2)} unit="TECU" onChange={setDraft} />
      <div className="grid grid-cols-2 gap-3">
        <Readout label="Residual smear" value={smearUs.toFixed(3)} unit="µs" />
        <Readout label="In samples" value={(smearUs / (ds.radargram.sampleInterval * 1e6)).toFixed(1)} />
      </div>
      <p className="text-2xs text-faint">Night side ≈ 0.1–0.5 TECU, day side up to about 1–2 TECU.</p>
    </Section>
  );
}

function Migration() {
  const ds = useApp(s => s.dataset);
  const mig = useApp(s => s.migration);
  const run = useApp(s => s.runMigration);
  const cancel = useApp(s => s.cancelJob);
  const set = useApp(s => s.set);
  const hasModel = useApp(s => s.layers.length > 0);
  const bulk = useApp(s => s.bulkPermittivity);
  if (!ds) return null;
  return (
    <Section title="Migration">
      <p className="text-xs text-dim">
        Collapses diffraction hyperbolas back to their source points using the depth model's RMS velocity (Dix). Radargrams have no phase, so this is an incoherent migration: it sharpens tails and dipping edges, it does not add resolution.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Max angle" value={mig.maxAngleDeg} min={2} max={70} step={1} unit="°" onChange={v => set('migration', { ...mig, maxAngleDeg: v })} />
        <NumberField label="Max aperture" value={mig.aperture} min={1} max={200} step={1} unit="tr" onChange={v => set('migration', { ...mig, aperture: v })} />
      </div>
      <p className="text-2xs text-faint">Velocity: {hasModel ? 'your depth model' : `bulk ε = ${bulk}`}</p>
      {mig.status === 'running' ? (
        <div className="flex items-center gap-2">
          <div className="flex-1"><Progress value={mig.progress} label="Migration" /></div>
          <Button size="sm" tone="quiet" onClick={() => cancel('migration')}>Cancel</Button>
        </div>
      ) : (
        <Button tone="primary" icon="migrate" onClick={run}>
          {mig.result ? 'Run again' : 'Migrate'}
        </Button>
      )}
      {mig.status === 'error' && <Note tone="error">{mig.error}</Note>}
      {mig.result && mig.status !== 'running' && (
        <p className="text-2xs text-faint">
          Finished in {(mig.elapsedMs / 1000).toFixed(1)} s. Switch between raw and migrated above the plot, or compare them side by side.
        </p>
      )}
    </Section>
  );
}

export default function ProcessingPanel() {
  const ds = useApp(s => s.dataset);
  if (!ds) return <EmptyState icon="processing" title="No radargram">Load a scene to adjust processing.</EmptyState>;
  return (
    <>
      <Statics />
      <Ionosphere />
      <Migration />
    </>
  );
}
