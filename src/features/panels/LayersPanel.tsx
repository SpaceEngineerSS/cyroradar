import { useState } from 'react';
import { useApp, velocityLayers } from '../../store/app';
import { getAllMaterials, getMaterial } from '../../core/physics/dielectric';
import { computeDixVRMS } from '../../core/physics/dix-velocity';
import { twoWayLossDb } from '../../core/physics/attenuation';
import { waterIcePermittivity } from '../../core/physics/dielectric-temperature';
import { SPEED_OF_LIGHT } from '../../core/physics/constants';
import { Button, EmptyState, IconButton, NumberField, Readout, Section, Select } from '../../ui/controls';
import { cx } from '../../ui/cx';
import type { SubsurfaceLayer } from '../../types/types';

const materials = getAllMaterials().filter(m => m.id !== 'vacuum' && m.id !== 'mars-atmo');

/** Thickness that puts the layer base at its picked delay, given the layers above. */
function thicknessFromPicks(index: number): number | null {
  const s = useApp.getState();
  const ds = s.dataset;
  const layer = s.layers[index];
  if (!ds || !layer || layer.picks.length === 0) return null;
  const surf = ds.surfaceEcho.indices;
  let tau = 0;
  for (const p of layer.picks) tau += (p.sampleIndex - surf[p.traceIndex]) * ds.radargram.sampleInterval;
  tau /= layer.picks.length;
  let above = 0;
  for (let i = 0; i < index; i++) above += (2 * s.layers[i].thicknessM * Math.sqrt(s.layers[i].permittivity)) / SPEED_OF_LIGHT;
  return Math.max(0, ((tau - above) * SPEED_OF_LIGHT) / (2 * Math.sqrt(layer.permittivity)));
}

function LayerRow({ layer, index }: { layer: SubsurfaceLayer; index: number }) {
  const active = useApp(s => s.activeLayer === index);
  const set = useApp(s => s.set);
  const update = useApp(s => s.updateLayer);
  const remove = useApp(s => s.removeLayer);
  const clearPicks = useApp(s => s.clearPicks);
  const notify = useApp(s => s.notify);
  const material = getMaterial(layer.materialId);
  const name = layer.label ?? material?.name ?? 'Custom material';

  return (
    <li className={cx('flex flex-col gap-2.5 border-l-2 py-3 pr-4 pl-3.5', active ? 'border-accent bg-accent-soft' : 'border-transparent')}>
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 border border-line-strong" style={{ background: material?.color ?? 'var(--c-faint)' }} />
        <button type="button" onClick={() => set('activeLayer', index)} className="min-w-0 flex-1 truncate text-left text-sm font-medium" aria-pressed={active}>
          {index + 1}. {name}
        </button>
        <IconButton icon="trash" label={`Remove layer ${index + 1}`} size={26} tip={false} onClick={() => remove(index)} />
      </div>
      <Select
        label="Material"
        value={material ? layer.materialId : 'custom'}
        onChange={e => {
          const m = getMaterial(e.target.value);
          if (m) update(index, { materialId: m.id, label: undefined, permittivity: m.permittivity, lossTangent: m.lossTangent });
        }}
      >
        {!material && <option value="custom">{layer.label ?? 'Custom'}</option>}
        {materials.map(m => (
          <option key={m.id} value={m.id}>
            {m.name} (ε {m.permittivity})
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="ε" value={layer.permittivity} min={1} max={100} step={0.05} onChange={v => update(index, { permittivity: v })} />
        <NumberField label="tan δ" value={layer.lossTangent} min={0} max={2} step={0.0005} onChange={v => update(index, { lossTangent: v })} />
        <NumberField label="Thickness" value={Math.round(layer.thicknessM)} min={0} max={10000} step={5} unit="m" onChange={v => update(index, { thicknessM: v })} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="num mr-auto text-2xs text-faint">{layer.picks.length} picks</span>
        {!active && (
          <Button size="sm" tone="quiet" onClick={() => { set('activeLayer', index); set('tool', 'pick'); }}>
            Pick base
          </Button>
        )}
        <Button
          size="sm"
          tone="quiet"
          disabled={layer.picks.length === 0}
          onClick={() => {
            const d = thicknessFromPicks(index);
            if (d == null) return;
            update(index, { thicknessM: Math.round(d) });
            notify(`Thickness set to ${Math.round(d)} m from ${layer.picks.length} picks.`, 'ok');
          }}
        >
          Fit to picks
        </Button>
        <Button size="sm" tone="quiet" disabled={layer.picks.length === 0} onClick={() => clearPicks(index)}>
          Clear
        </Button>
      </div>
    </li>
  );
}

export default function LayersPanel() {
  const ds = useApp(s => s.dataset);
  const layers = useApp(s => s.layers);
  const bulk = useApp(s => s.bulkPermittivity);
  const set = useApp(s => s.set);
  const addLayer = useApp(s => s.addLayer);
  const loadTruth = useApp(s => s.loadTruthModel);
  const update = useApp(s => s.updateLayer);
  const [material, setMaterial] = useState('water-ice');
  const [temperature, setTemperature] = useState(180);

  if (!ds) return <EmptyState icon="layers" title="No radargram">Load a scene to build a depth model.</EmptyState>;

  const dix = computeDixVRMS(velocityLayers(layers));
  const loss = twoWayLossDb(ds.metadata.frequencyHz, layers);
  const total = layers.reduce((a, l) => a + l.thicknessM, 0);

  return (
    <>
      <Section title="Model">
        <p className="text-xs text-dim">
          Depths come from echo delay and the wave speed c/√ε of each layer, top to bottom. Below the last layer the last speed carries on; with no layers, the bulk permittivity is used everywhere.
        </p>
        <NumberField label="Bulk permittivity" value={bulk} min={1} max={30} step={0.05} onChange={v => set('bulkPermittivity', v)} hint="Water ice 3.15, dusty ice 3.3–3.5, dry regolith 3–5" />
        {layers.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Readout label="Thickness" value={total.toFixed(0)} unit="m" />
            <Readout label="V rms" value={(dix.vrms / 1e6).toFixed(0)} unit="m/µs" />
            <Readout label="2-way loss" value={loss.toFixed(1)} unit="dB" />
          </div>
        )}
        {ds.truth && (
          <Button size="sm" onClick={loadTruth}>
            Copy the scene's own model
          </Button>
        )}
      </Section>

      <Section title={`Layers (${layers.length})`}>
        {layers.length === 0 ? (
          <p className="text-xs text-faint">No layers yet. Add one, then pick its base on the radargram with the pick tool (P).</p>
        ) : (
          <ol className="-mx-4 divide-y divide-line border-y border-line">
            {layers.map((l, i) => (
              <LayerRow key={l.id} layer={l} index={i} />
            ))}
          </ol>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select label="New layer" value={material} onChange={e => setMaterial(e.target.value)}>
              {materials.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <Button icon="plus" onClick={() => addLayer(material)}>
            Add
          </Button>
        </div>
      </Section>

      <Section title="Ice temperature" defaultOpen={false}>
        <p className="text-xs text-dim">Sets ε and tan δ of every water-ice layer from a temperature, using Debye relaxation plus impurity conduction (see the docs). Colder ice is less lossy.</p>
        <NumberField label="Temperature" value={temperature} min={120} max={270} step={5} unit="K" onChange={setTemperature} />
        <Button
          size="sm"
          onClick={() => {
            const p = waterIcePermittivity(temperature, ds.metadata.frequencyHz);
            layers.forEach((l, i) => l.materialId === 'water-ice' && update(i, { permittivity: Number(p.real.toFixed(3)), lossTangent: Number(p.lossTangent.toPrecision(2)) }));
          }}
        >
          Apply to water-ice layers
        </Button>
      </Section>
    </>
  );
}
