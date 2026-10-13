import { useApp } from '../../store/app';
import { device } from '../../app/perf';
import { colormapCss } from '../../core/colormaps/colormaps';
import { downloadBlob } from '../session';
import { Button, EmptyState, Note, NumberField, Progress, Readout, Section } from '../../ui/controls';

/** Misfit history as a small line chart on a log scale. */
function MisfitChart({ history }: { history: number[] }) {
  if (history.length < 2) return null;
  const lo = Math.log(Math.min(...history));
  const hi = Math.log(Math.max(...history));
  const span = hi - lo || 1;
  const pts = history.map((v, i) => `${(i / (history.length - 1)) * 100},${4 + (1 - (Math.log(v) - lo) / span) * 52}`).join(' ');
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="h-20 w-full border-b border-l border-line-strong" role="img" aria-label="Misfit per iteration">
        <polyline points={pts} fill="none" stroke="var(--c-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="num flex justify-between text-2xs text-faint">
        <span>it 0 · {history[0].toFixed(3)}</span>
        <span>
          it {history.length - 1} · {history[history.length - 1].toFixed(3)}
        </span>
      </figcaption>
    </figure>
  );
}

export default function InversionPanel() {
  const ds = useApp(s => s.dataset);
  const roi = useApp(s => s.roi);
  const fwi = useApp(s => s.fwi);
  const det = useApp(s => s.detection);
  const set = useApp(s => s.set);
  const run = useApp(s => s.runFwi);
  const cancel = useApp(s => s.cancelJob);
  const statics = useApp(s => s.statics);

  if (!ds) return <EmptyState icon="inversion" title="No radargram">Load a scene first.</EmptyState>;

  const live = fwi.progress;
  const result = fwi.result;
  const history = fwi.status === 'running' ? live?.misfitHistory ?? [] : result?.misfitHistory ?? [];

  const exportJson = () => {
    if (!result) return;
    const payload = {
      format: 'cryoradar-fwi',
      dataset: ds.metadata.productId,
      roi: result.roi,
      grid: { nx: result.nx, nz: result.nz },
      backend: result.backend,
      iterations: result.iterations,
      misfit: result.misfitHistory,
      permittivity: Array.from(result.permittivity, v => Number(v.toFixed(3))),
    };
    downloadBlob(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `${ds.metadata.productId.toLowerCase()}-fwi.json`);
  };

  return (
    <>
      <Section title="Envelope waveform inversion" collapsible={false}>
        <Note tone="warn">Experimental. It recovers permittivity contrasts inside a small window; read the limits in the docs before trusting a number.</Note>
        <p className="text-xs text-dim">
          Simulates the window with a 2-D wave equation (exploding reflectors), compares the simulated echo envelopes with the radargram, and updates the permittivity with adjoint-state gradients until they agree.
          It runs on the GPU through WebGPU when available, otherwise on a background CPU thread at lower resolution.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Readout label="Backend" value={live?.backend ?? result?.backend ?? (device.hasWebGPU ? 'WebGPU' : 'CPU')} />
          <Readout label="Reference ε" value={det.hostPermittivity.toFixed(2)} title="From the detection settings" />
        </div>
      </Section>

      <Section title="Window" collapsible={false}>
        {roi ? (
          <div className="grid grid-cols-2 gap-3">
            <Readout label="Traces" value={`${roi.traceStart}–${roi.traceEnd}`} />
            <Readout label="Samples" value={`${roi.sampleStart}–${roi.sampleEnd}`} />
          </div>
        ) : (
          <p className="text-xs text-faint">No window yet.</p>
        )}
        <div className="flex gap-1.5">
          <Button size="sm" icon="roi" onClick={() => { set('tool', 'roi'); set('mainView', 'radargram'); }}>
            {roi ? 'Draw a new window' : 'Draw a window'}
          </Button>
          {roi && (
            <Button size="sm" tone="quiet" onClick={() => set('roi', null)}>
              Clear
            </Button>
          )}
        </div>
        {statics && <Note>Static correction is on. The window is drawn at its centre trace's shift; the inversion always uses the uncorrected data.</Note>}
        <p className="text-2xs text-faint">
          Larger windows are averaged down to at most {device.fwi.gpu.nx} × {device.fwi.gpu.nz} cells on the GPU or {device.fwi.cpu.nx} × {device.fwi.cpu.nz} on the CPU. Put the top just above the reflector you care about.
        </p>
      </Section>

      <Section title="Run" collapsible={false}>
        <NumberField label="Iterations" value={fwi.iterations} min={1} max={200} step={1} onChange={v => set('fwi', { ...fwi, iterations: v })} />
        {fwi.status === 'running' ? (
          <div className="flex items-center gap-2">
            <div className="flex-1"><Progress value={live ? live.iteration / Math.max(1, fwi.iterations) : null} label="Inversion" /></div>
            <Button size="sm" tone="quiet" onClick={() => cancel('fwi')}>Stop</Button>
          </div>
        ) : (
          <Button tone="primary" icon="play" disabled={!roi} onClick={run}>
            Invert window
          </Button>
        )}
        {fwi.status === 'error' && <Note tone="error">{fwi.error}</Note>}
        <MisfitChart history={history} />
        {result && fwi.status !== 'running' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Readout label="Iterations" value={result.iterations} />
              <Readout label="Misfit drop" value={`${((1 - result.misfitHistory[result.misfitHistory.length - 1] / result.misfitHistory[0]) * 100).toFixed(0)}%`} />
              <Readout label="Time" value={(result.elapsedMs / 1000).toFixed(1)} unit="s" />
              <Readout label="ε min" value={Math.min(...result.permittivity).toFixed(1)} />
              <Readout label="ε max" value={Math.max(...result.permittivity).toFixed(1)} tone="signal" />
              <Readout label="Grid" value={`${result.nx} × ${result.nz}`} />
            </div>
            <div className="flex flex-col gap-1">
              <div className="h-2.5" style={{ background: colormapCss('magma') }} />
              <div className="num flex justify-between text-2xs text-faint">
                <span>ε 1.5</span>
                <span>7.7</span>
                <span>40, log scale</span>
              </div>
            </div>
            <Button size="sm" icon="download" onClick={exportJson}>
              Save result (JSON)
            </Button>
          </>
        )}
      </Section>
    </>
  );
}
