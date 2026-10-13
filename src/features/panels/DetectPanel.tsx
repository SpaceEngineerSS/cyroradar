import { useApp } from '../../store/app';
import { viewport } from '../../store/viewport';
import { CLASS_LABELS } from '../../core/analysis/anomaly-detector';
import { HYPOTHESIS_PRIORS } from '../../core/analysis/hypothesis-engine';
import { segmentLetter } from '../radargram/overlay';
import { Button, Checkbox, EmptyState, Meter, Note, NumberField, Progress, Readout, Section } from '../../ui/controls';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/icons';
import type { AnomalyClass } from '../../types/types';

const CLASS_VAR: Record<AnomalyClass, string> = {
  'liquid-water': 'var(--c-water)',
  'wet-sediment': 'var(--c-ice)',
  hydrated: 'var(--c-clay)',
  'dry-contact': 'var(--c-faint)',
};

const HYP_LABEL = { 'liquid-water': 'Liquid water', 'smectite-clay': 'Smectite clay', clutter: 'Off-nadir clutter' } as const;

function focusSegment(i: number) {
  const s = useApp.getState();
  const seg = s.segments[i];
  const ds = s.dataset;
  if (!seg || !ds) return;
  const v = viewport.getState();
  const span = Math.max(20, (seg.traceEnd - seg.traceStart) * 3);
  const scaleX = v.width / span;
  const row = s.anomalies[seg.representative].sampleIndex;
  viewport.setState({
    scaleX,
    offsetX: v.width / 2 - ((seg.traceStart + seg.traceEnd) / 2) * scaleX,
    offsetY: v.height / 2 - row * v.scaleY,
  });
  s.set('mainView', 'radargram');
}

function Settings() {
  const det = useApp(s => s.detection);
  const setDet = useApp(s => s.setDetection);
  const useCrism = useApp(s => s.useCrism);
  const set = useApp(s => s.set);
  const simple = useApp(s => s.mode === 'explorer');
  return (
    <Section title="Settings" defaultOpen={!simple}>
      <p className="text-xs text-dim">
        For each trace the scan compares the strongest deep echo with the surface echo, undoes the surface reflection and the loss through the overburden, and asks what reflectivity the base must have. Results depend on the overburden you assume here.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Overburden ε" value={det.hostPermittivity} min={1.5} max={10} step={0.05} onChange={v => setDet({ hostPermittivity: v })} />
        <NumberField label="Overburden tan δ" value={det.hostLossTangent} min={0} max={0.1} step={0.0005} onChange={v => setDet({ hostLossTangent: v })} />
        <NumberField label="Threshold" value={det.thresholdDb} min={-30} max={0} step={0.5} unit="dB" onChange={v => setDet({ thresholdDb: v })} hint="Basal reflectivity" />
        <NumberField label="Ignore above" value={det.minDepthM} min={0} max={2000} step={5} unit="m" onChange={v => setDet({ minDepthM: v })} hint="Skips surface sidelobes" />
        <NumberField label="Shortest run" value={det.minRun} min={1} max={50} step={1} unit="tr" onChange={v => setDet({ minRun: Math.round(v) })} hint="Drops isolated hits" />
      </div>
      <Checkbox label="Use CRISM context" hint="Simulated clay and hydration indices along the track" checked={useCrism} onChange={v => set('useCrism', v)} />
    </Section>
  );
}

function SegmentDetail({ index }: { index: number }) {
  const seg = useApp(s => s.segments[index]);
  const a = useApp(s => (seg ? s.anomalies[seg.representative] : null));
  const crism = useApp(s => (a && s.crism ? s.crism[a.traceIndex] : null));
  const uq = useApp(s => s.uq.results.find(r => r.anomalyIndex === index));
  const logSegment = useApp(s => s.logSegment);
  const set = useApp(s => s.set);
  const calibration = useApp(s => s.dataset?.metadata.calibration);
  if (!seg || !a) return null;
  const h = seg.hypothesis;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold">
          Segment {segmentLetter(index)} <span className="num font-normal text-faint">traces {seg.traceStart}–{seg.traceEnd}</span>
        </h4>
        <span className="text-xs" style={{ color: CLASS_VAR[seg.classification] }}>
          {CLASS_LABELS[seg.classification]}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Readout label="Depth" value={uq ? `${uq.meanDepthM.toFixed(0)} ± ${uq.stdDevM.toFixed(0)}` : seg.meanDepthM.toFixed(0)} unit="m" />
        <Readout label="Base ε" value={seg.meanPermittivity >= 99.5 ? '≥ 100' : seg.meanPermittivity.toFixed(1)} tone="signal" />
        <Readout label="Reflectivity" value={seg.peakReflectivityDb.toFixed(1)} unit="dB" />
        <Readout label="Echo vs surface" value={a.relativePowerDb.toFixed(1)} unit="dB" />
        <Readout label="SNR" value={a.snrDb.toFixed(0)} unit="dB" />
        <Readout label="Slope" value={a.surfaceSlopeDeg.toFixed(2)} unit="°" tone={a.clutterWarning ? 'danger' : undefined} />
      </div>
      {a.clutterWarning && <Note tone="warn">The surface slopes more than 2° here. Off-nadir echoes from that slope can arrive at the same delay as a basal echo.</Note>}
      {calibration === 'display' && <Note tone="warn">This is a browse image with a 35 dB greyscale range, so strong ratios are clipped. Load calibrated power for numbers you can rely on.</Note>}

      <div className="flex flex-col gap-2.5">
        <h5 className="label">What could it be (averaged over the segment)</h5>
        <Meter label={HYP_LABEL['liquid-water']} value={h.pLiquidWater} color="var(--c-water)" />
        <Meter label={HYP_LABEL['smectite-clay']} value={h.pSmectiteClay} color="var(--c-clay)" />
        <Meter label={HYP_LABEL.clutter} value={h.pClutter} color="var(--c-clutter)" />
        <p className="text-2xs text-faint">
          Priors {HYPOTHESIS_PRIORS.water} / {HYPOTHESIS_PRIORS.clay} / {HYPOTHESIS_PRIORS.clutter}. Evidence: permittivity, surface slope, depth{crism ? ', CRISM context' : ''}.
          {uq && ` Monte Carlo: ${(uq.pWet * 100).toFixed(0)} % of samples give ε ≥ 25.`}
        </p>
      </div>

      {crism && (
        <div className="grid grid-cols-3 gap-3">
          <Readout label="Clay index" value={crism.clayIndex.toFixed(2)} />
          <Readout label="Hydration" value={crism.hydrationIndex.toFixed(2)} />
          <Readout label="CRISM class" value={crism.mineralClass === 'none' ? 'none' : crism.mineralClass.replace('-', ' ')} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon="crosshair" onClick={() => focusSegment(index)}>
          Show
        </Button>
        <Button size="sm" icon="ascope" onClick={() => { set('pinnedTrace', a.traceIndex); set('mainView', 'ascope'); }}>
          A-scope
        </Button>
        <Button size="sm" icon="log" onClick={() => logSegment(index)}>
          Add to log
        </Button>
      </div>
    </div>
  );
}

export default function DetectPanel() {
  const ds = useApp(s => s.dataset);
  const status = useApp(s => s.scanStatus);
  const segments = useApp(s => s.segments);
  const count = useApp(s => s.anomalies.length);
  const selected = useApp(s => s.selectedSegment);
  const runScan = useApp(s => s.runScan);
  const select = useApp(s => s.selectSegment);

  if (!ds) return <EmptyState icon="detect" title="No radargram">Load a scene, then scan it for bright basal reflections.</EmptyState>;

  return (
    <>
      <Settings />
      <Section title="Scan" collapsible={false}>
        <Button tone="primary" icon="detect" onClick={() => runScan()} disabled={status === 'running'}>
          {status === 'done' ? 'Scan again' : 'Scan for bright reflections'}
        </Button>
        {status === 'running' && <Progress value={null} label="Scanning" />}
        {status === 'done' && segments.length === 0 && (
          <Note>Nothing above the threshold. Lower the threshold, or check that the overburden ε and loss match the ice you are looking through.</Note>
        )}
        {segments.length > 0 && (
          <>
            <p className="text-xs text-dim">
              {count} traces in {segments.length} segment{segments.length === 1 ? '' : 's'}. Click a segment here or on the plot.
            </p>
            <ul className="-mx-4 border-y border-line" role="listbox" aria-label="Detections">
              {segments.map((seg, i) => (
                <li key={seg.id} role="option" aria-selected={selected === i}>
                  <button
                    type="button"
                    onClick={() => select(i)}
                    className={cx('grid w-full grid-cols-[28px_1fr_auto] items-center gap-2 px-4 py-2 text-left', selected === i ? 'bg-hover' : 'hover:bg-hover')}
                  >
                    <span className={cx('num text-sm font-medium', selected === i ? 'text-signal' : 'text-dim')}>{segmentLetter(i)}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm">
                        <span className="h-2 w-2 shrink-0" style={{ background: CLASS_VAR[seg.classification] }} />
                        <span className="truncate">{CLASS_LABELS[seg.classification]}</span>
                        {seg.clutterFraction > 0.5 && <Icon name="warning" size={13} className="text-signal" aria-label="Sloped surface" />}
                      </span>
                      <span className="num block text-2xs text-faint">
                        {seg.count} tr · {seg.meanDepthM.toFixed(0)} m · ε {seg.meanPermittivity.toFixed(1)}
                      </span>
                    </span>
                    <span className="num text-xs text-dim">{seg.peakReflectivityDb.toFixed(1)} dB</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
      {selected != null && segments[selected] && (
        <Section title="Selected" collapsible={false}>
          <SegmentDetail index={selected} />
        </Section>
      )}
    </>
  );
}
