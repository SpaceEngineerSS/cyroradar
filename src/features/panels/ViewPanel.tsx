import { useShallow } from 'zustand/react/shallow';
import { useApp } from '../../store/app';
import { displayField } from '../../store/derived';
import { getAllColormaps, colormapCss } from '../../core/colormaps/colormaps';
import { Button, Checkbox, Section, Segmented, Slider } from '../../ui/controls';
import { cx } from '../../ui/cx';

/** Contrast from percentiles of a subsample of the displayed field. */
function autoContrast() {
  const s = useApp.getState();
  const f = displayField(s, s.variant);
  if (!f) return;
  const step = Math.max(1, Math.floor(f.data.length / 200_000));
  const vals: number[] = [];
  for (let i = 0; i < f.data.length; i += step) vals.push(f.data[i]);
  vals.sort((a, b) => a - b);
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  const span = f.powerMax - f.powerMin || 1;
  s.setContrast((q(0.35) - f.powerMin) / span, (q(0.9985) - f.powerMin) / span);
}

export default function ViewPanel() {
  const colormap = useApp(s => s.colormap);
  const contrast = useApp(s => s.contrast);
  const overlays = useApp(s => s.overlays);
  const set = useApp(s => s.set);
  const setOverlay = useApp(s => s.setOverlay);
  const setContrast = useApp(s => s.setContrast);
  const range = useApp(useShallow(s => {
    const f = displayField(s, s.variant);
    return f ? { lo: f.powerMin, hi: f.powerMax } : null;
  }));
  const hasTruth = useApp(s => !!s.dataset?.truth);
  const hasPolsar = useApp(s => !!s.polsar);
  const hasInversion = useApp(s => !!s.fwi.result);
  const hasUq = useApp(s => s.uq.results.length > 0);

  const toDb = (f: number) => (range ? (range.lo + f * (range.hi - range.lo)).toFixed(1) : '');

  return (
    <>
      <Section title="Colour table">
        <div role="radiogroup" aria-label="Colour table" className="grid grid-cols-2 gap-2">
          {getAllColormaps().map(c => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={colormap === c.id}
              onClick={() => set('colormap', c.id)}
              className={cx('flex flex-col gap-1 border p-1.5 text-left transition-colors', colormap === c.id ? 'border-accent' : 'border-line hover:border-line-strong')}
            >
              <span className="h-3 w-full" style={{ background: colormapCss(c.id) }} />
              <span className="text-xs">{c.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Contrast" actions={<Button size="sm" tone="quiet" onClick={autoContrast}>Auto</Button>}>
        <div className="h-2.5 w-full" style={{ background: colormapCss(colormap) }} />
        <Slider label="Black point" value={contrast[0]} min={0} max={1} step={0.005} format={toDb} unit="dB" onChange={v => setContrast(v, contrast[1])} />
        <Slider label="White point" value={contrast[1]} min={0} max={1} step={0.005} format={toDb} unit="dB" onChange={v => setContrast(contrast[0], v)} />
        <p className="text-2xs text-faint">Powers below the black point are drawn as the darkest colour, above the white point as the brightest.</p>
      </Section>

      <Section title="Overlays">
        <Checkbox label="Surface echo" hint="The picked surface, which is the reference for every depth" checked={overlays.topography} onChange={v => setOverlay('topography', v)} />
        <Checkbox label="Depth contours" hint="Follow the surface, using the depth model" checked={overlays.depthGrid} onChange={v => setOverlay('depthGrid', v)} />
        <Checkbox label="Picked horizons" checked={overlays.picks} onChange={v => setOverlay('picks', v)} />
        <Checkbox label="Detections" checked={overlays.detections} onChange={v => setOverlay('detections', v)} />
        <Checkbox label="Depth uncertainty bars" disabled={!hasUq} hint={hasUq ? undefined : 'Run the uncertainty analysis first'} checked={overlays.confidence} onChange={v => setOverlay('confidence', v)} />
        <Checkbox label="Scene model interfaces" disabled={!hasTruth} hint={hasTruth ? 'Where the simulator put each interface' : 'Only for simulated scenes'} checked={overlays.truth} onChange={v => setOverlay('truth', v)} />
        <Checkbox label="Inversion result" disabled={!hasInversion} checked={overlays.inversion} onChange={v => setOverlay('inversion', v)} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-dim">Polarimetry</span>
          <Segmented
            label="Polarimetry overlay"
            size="sm"
            value={hasPolsar ? overlays.polsar : 'off'}
            onChange={v => hasPolsar && setOverlay('polsar', v)}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'entropy', label: 'Entropy' },
              { value: 'alpha', label: 'Alpha' },
            ]}
          />
          {!hasPolsar && <span className="text-2xs text-faint">Run the polarimetry simulation to enable.</span>}
        </div>
      </Section>
    </>
  );
}
