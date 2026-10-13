import { useShallow } from 'zustand/react/shallow';
import { useApp, velocityLayers } from '../../store/app';
import { useHover } from '../../store/viewport';
import { displayField, shiftAt } from '../../store/derived';
import { timeToDepth } from '../../core/physics/depth-conversion';

const CALIBRATION: Record<string, string> = {
  model: 'Simulated power',
  relative: 'Relative power, uncalibrated units',
  display: 'Browse image, 35 dB range',
};

function Item({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-faint">{label}</span>
      <span className="num text-ink">{value}</span>
    </span>
  );
}

export function StatusBar() {
  const dataset = useApp(s => s.dataset);
  const hover = useHover();
  const pinned = useApp(s => s.pinnedTrace);
  const layers = useApp(s => s.layers);
  const bulk = useApp(s => s.bulkPermittivity);
  const field = useApp(useShallow(s => displayField(s, s.variant)));
  if (!dataset || !field) return <footer className="h-6 shrink-0 border-t border-line bg-raised" />;

  const { geometry, radargram, surfaceEcho } = dataset;
  let info: { label: string; value: string }[] = [];
  if (hover) {
    const t = hover.trace;
    const row = hover.row + shiftAt(field.shifts, t);
    const surf = surfaceEcho.indices[t];
    const delayUs = (row - surf) * radargram.sampleInterval * 1e6;
    const depth = timeToDepth((row - surf) * radargram.sampleInterval, velocityLayers(layers), bulk);
    const power = row >= 0 && row < field.height ? field.data[row * field.width + t] : NaN;
    info = [
      { label: 'trace', value: String(t) },
      { label: 'lat', value: `${geometry.latitudes[t].toFixed(3)}°` },
      { label: 'lon', value: `${geometry.longitudes[t].toFixed(3)}°E` },
      { label: 'Δt', value: `${delayUs.toFixed(2)} µs` },
      { label: 'depth', value: delayUs > 0 ? `${depth.toFixed(0)} m` : 'above surface' },
      { label: 'power', value: Number.isFinite(power) ? `${power.toFixed(1)} dB` : '—' },
      { label: 'elev', value: `${geometry.surfaceElevation[t].toFixed(0)} m` },
    ];
  } else {
    info = [
      { label: 'traces', value: String(radargram.width) },
      { label: 'samples', value: String(radargram.height) },
      { label: 'Δt', value: `${(radargram.sampleInterval * 1e9).toFixed(1)} ns` },
      { label: 'spacing', value: `${radargram.traceSpacingM} m` },
    ];
    if (pinned != null) info.unshift({ label: 'pinned', value: `trace ${pinned}` });
  }

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 overflow-x-auto border-t border-line bg-raised px-3 text-2xs" aria-live="off">
      {info.map(i => (
        <Item key={i.label} {...i} />
      ))}
      <span className="ml-auto hidden whitespace-nowrap text-faint md:inline">{CALIBRATION[dataset.metadata.calibration]}</span>
    </footer>
  );
}
