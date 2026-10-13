import { useState } from 'react';
import { useApp } from '../../store/app';
import { SHARAD_SPEC, MARSIS_SPEC, computeRadarBudget, subsurfaceSnrDb, maxDetectableDepth } from '../../core/physics/radar-equation';
import { Readout, Section, NumberField, Segmented } from '../../ui/controls';
import type { InstrumentId } from '../../core/physics/constants';

function SnrChart({ points, maxDepth, minSnr }: { points: [number, number][]; maxDepth: number; minSnr: number }) {
  const snrs = points.map(p => p[1]);
  const hi = Math.ceil(Math.max(...snrs) / 10) * 10;
  const lo = Math.min(-10, Math.floor(Math.min(...snrs) / 10) * 10);
  const dmax = points[points.length - 1][0];
  const X = (d: number) => (d / dmax) * 100;
  const Y = (s: number) => ((hi - s) / (hi - lo)) * 60;
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="h-28 w-full border-b border-l border-line-strong" role="img" aria-label="Basal echo SNR against depth">
        <line x1={0} x2={100} y1={Y(minSnr)} y2={Y(minSnr)} stroke="var(--c-faint)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        {maxDepth > 0 && <line x1={X(maxDepth)} x2={X(maxDepth)} y1={0} y2={60} stroke="var(--c-signal)" vectorEffect="non-scaling-stroke" />}
        <polyline points={points.map(([d, s]) => `${X(d)},${Y(s)}`).join(' ')} fill="none" stroke="var(--c-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="num flex justify-between text-2xs text-faint">
        <span>0 m</span>
        <span>SNR {lo}…{hi} dB</span>
        <span>{(dmax / 1000).toFixed(1)} km</span>
      </figcaption>
    </figure>
  );
}

export default function BudgetPanel() {
  const datasetInstrument = useApp(s => s.dataset?.metadata.instrument);
  const det = useApp(s => s.detection);
  const [instrument, setInstrument] = useState<InstrumentId>(datasetInstrument ?? 'SHARAD');
  const [eps, setEps] = useState(det.hostPermittivity);
  const [tan, setTan] = useState(det.hostLossTangent);
  const [basal, setBasal] = useState(25);
  const [minSnr, setMinSnr] = useState(3);

  const spec = instrument === 'SHARAD' ? SHARAD_SPEC : MARSIS_SPEC;
  const target = { permittivity: eps, lossTangent: tan, basalPermittivity: basal };
  // A few hundred evaluations of a closed-form expression: cheap enough to redo on every render.
  const budget = computeRadarBudget(spec, eps);
  const maxDepth = maxDetectableDepth(spec, target, minSnr);
  const dmax = Math.max(500, Math.min(20000, maxDepth * 1.6 || 3000));
  const points = Array.from({ length: 61 }, (_, i) => {
    const d = (i / 60) * dmax;
    return [d, subsurfaceSnrDb(spec, target, d)] as [number, number];
  });

  return (
    <>
      <Section title="Instrument" collapsible={false}>
        <Segmented<InstrumentId>
          label="Instrument"
          value={instrument}
          onChange={setInstrument}
          options={[{ value: 'SHARAD', label: 'SHARAD 20 MHz' }, { value: 'MARSIS', label: 'MARSIS 4 MHz' }]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Readout label="Wavelength" value={budget.wavelengthM.toFixed(1)} unit="m" />
          <Readout label="Range" value={(spec.orbitAltitudeM / 1000).toFixed(0)} unit="km" />
          <Readout label="Surface echo" value={budget.receivedPowerDbw.toFixed(1)} unit="dBW" />
          <Readout label="Noise (kTB)" value={budget.noisePowerDbw.toFixed(1)} unit="dBW" />
          <Readout label="Surface SNR" value={budget.snrDb.toFixed(1)} unit="dB" tone="signal" />
          <Readout label="Surface R" value={budget.surfaceReflectivityDb.toFixed(1)} unit="dB" />
        </div>
        <p className="text-2xs text-faint">Nominal instrument numbers, after pulse compression and along-track processing. Good to a few dB.</p>
      </Section>
      <Section title="How deep can it see?" collapsible={false}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Medium ε" value={eps} min={1.5} max={15} step={0.05} onChange={setEps} />
          <NumberField label="Medium tan δ" value={tan} min={0} max={0.2} step={0.0005} onChange={setTan} />
          <NumberField label="Basal ε" value={basal} min={1} max={90} step={1} onChange={setBasal} />
          <NumberField label="Detection SNR" value={minSnr} min={-10} max={30} step={1} unit="dB" onChange={setMinSnr} />
        </div>
        <SnrChart points={points} maxDepth={maxDepth} minSnr={minSnr} />
        <Readout label="Deepest detectable basal echo" value={maxDepth >= 20000 ? '> 20 km' : `${maxDepth.toFixed(0)} m`} tone="accent" />
      </Section>
    </>
  );
}
