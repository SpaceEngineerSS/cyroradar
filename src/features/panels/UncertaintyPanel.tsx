import { useApp } from '../../store/app';
import { segmentLetter } from '../radargram/overlay';
import { Button, EmptyState, NumberField, Progress, Section } from '../../ui/controls';
import type { UQResult } from '../../types/types';

const LOG_LO = Math.log(1);
const LOG_HI = Math.log(100);
const x = (eps: number) => ((Math.log(Math.max(1, Math.min(100, eps))) - LOG_LO) / (LOG_HI - LOG_LO)) * 100;

/** One row of a forest plot: the 90 % interval of basal ε on a log axis, with the class boundaries. */
function IntervalRow({ r, label }: { r: UQResult; label: string }) {
  return (
    <div className="grid grid-cols-[22px_1fr_44px] items-center gap-2">
      <span className="num text-xs text-dim">{label}</span>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="h-3 w-full" aria-label={`Basal permittivity 90% interval ${r.basalPermittivity5.toFixed(1)} to ${r.basalPermittivity95.toFixed(1)}`}>
        {[6, 15, 25].map(b => (
          <line key={b} x1={x(b)} x2={x(b)} y1={0} y2={12} stroke="var(--c-line-strong)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={x(r.basalPermittivity5)} x2={x(r.basalPermittivity95)} y1={6} y2={6} stroke="var(--c-signal)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <rect x={x(r.meanBasalPermittivity) - 0.8} y={2.5} width={1.6} height={7} fill="var(--c-ink)" />
      </svg>
      <span className="num text-right text-xs">{(r.pWet * 100).toFixed(0)}%</span>
    </div>
  );
}

export default function UncertaintyPanel() {
  const ds = useApp(s => s.dataset);
  const segments = useApp(s => s.segments);
  const uq = useApp(s => s.uq);
  const set = useApp(s => s.set);
  const run = useApp(s => s.runUq);
  const cancel = useApp(s => s.cancelJob);

  if (!ds) return <EmptyState icon="uncertainty" title="No radargram">Load a scene first.</EmptyState>;
  if (segments.length === 0)
    return (
      <EmptyState icon="uncertainty" title="Nothing to analyse yet" action={<Button size="sm" onClick={() => set('panel', 'detect')}>Go to detection</Button>}>
        Run a scan first. The analysis takes the strongest trace of each detected segment.
      </EmptyState>
    );

  const settings = uq.settings;
  const setSettings = (patch: Partial<typeof settings>) => set('uq', { ...uq, settings: { ...settings, ...patch } });

  return (
    <>
      <Section title="Inputs">
        <p className="text-xs text-dim">
          Each run redraws the overburden permittivity, its loss tangent (log-normal, factor e^±0.5), the echo delay (±½ sample) and the measured power ratio, then repeats the detector's calculation. The spread of the answers is the uncertainty.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Samples" value={settings.nSamples} min={200} max={20000} step={500} onChange={v => setSettings({ nSamples: v })} />
          <NumberField label="σ ε" value={settings.permittivitySigma} min={0} max={2} step={0.05} onChange={v => setSettings({ permittivitySigma: v })} />
          <NumberField label="σ power" value={settings.powerSigmaDb} min={0} max={6} step={0.25} unit="dB" onChange={v => setSettings({ powerSigmaDb: v })} />
        </div>
        {uq.status === 'running' ? (
          <div className="flex items-center gap-2">
            <div className="flex-1"><Progress value={uq.progress} label="Monte Carlo" /></div>
            <Button size="sm" tone="quiet" onClick={() => cancel('uq')}>Cancel</Button>
          </div>
        ) : (
          <Button tone="primary" icon="uncertainty" onClick={run}>
            Run {settings.nSamples.toLocaleString('en')} samples per segment
          </Button>
        )}
      </Section>

      {uq.results.length > 0 && (
        <>
          <Section title="Basal permittivity, 90 % interval" collapsible={false}>
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[22px_1fr_44px] gap-2 text-2xs text-faint">
                <span />
                <span className="relative h-3">
                  {[1, 3, 6, 15, 25].map(v => (
                    <span key={v} className="num absolute -translate-x-1/2" style={{ left: `${x(v)}%` }}>{v}</span>
                  ))}
                </span>
                <span className="text-right">P(ε≥25)</span>
              </div>
              {uq.results.map(r => (
                <IntervalRow key={r.anomalyIndex} r={r} label={segmentLetter(r.anomalyIndex)} />
              ))}
            </div>
            <p className="text-2xs text-faint">Ticks mark the class boundaries at ε = 6, 15 and 25. Log scale.</p>
          </Section>
          <Section title="Depth" collapsible={false}>
            <table className="num w-full text-xs">
              <thead className="text-left text-faint">
                <tr>
                  <th className="pb-1 font-normal" />
                  <th className="pb-1 font-normal">mean</th>
                  <th className="pb-1 font-normal">σ</th>
                  <th className="pb-1 font-normal">5 %</th>
                  <th className="pb-1 font-normal">95 %</th>
                </tr>
              </thead>
              <tbody>
                {uq.results.map(r => (
                  <tr key={r.anomalyIndex} className="border-t border-line">
                    <td className="py-1 text-dim">{segmentLetter(r.anomalyIndex)}</td>
                    <td>{r.meanDepthM.toFixed(0)} m</td>
                    <td>{r.stdDevM.toFixed(0)}</td>
                    <td>{r.percentile5.toFixed(0)}</td>
                    <td>{r.percentile95.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </>
  );
}
