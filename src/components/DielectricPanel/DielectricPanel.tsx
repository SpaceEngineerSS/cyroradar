/* CRYORADAR — Dielectric & Layer Analysis Panel
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS) */

import { useCallback, useMemo } from 'react';
import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';
import { getAllMaterials, getMaterial } from '../../core/physics/dielectric';
import { fresnelReflection } from '../../core/physics/fresnel';
import { layerAttenuation } from '../../core/physics/attenuation';
import { sampleToDepth } from '../../core/physics/depth-conversion';
import type { SubsurfaceLayer } from '../../types/types';
import './DielectricPanel.css';

const materials = getAllMaterials();

export function DielectricPanel() {
  const state = useCryoState();
  const dispatch = useCryoDispatch();
  const { layers, activeLayerIndex, dataset, operatingFrequencyMhz } = state;

  const addLayer = useCallback(() => {
    const layer: SubsurfaceLayer = {
      id: `layer-${Date.now()}`,
      materialId: 'water-ice',
      thickness: 100,
      topSample: 0,
      bottomSample: 50,
      picks: [],
    };
    dispatch({ type: 'ADD_LAYER', layer });
  }, [dispatch]);

  const removeLayer = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_LAYER', index });
  }, [dispatch]);

  const setMaterial = useCallback((index: number, materialId: string) => {
    dispatch({ type: 'UPDATE_LAYER', index, layer: { materialId } });
  }, [dispatch]);

  const layerAnalyses = useMemo(() => {
    if (!dataset) return [];
    const freqHz = operatingFrequencyMhz * 1e6;
    const sampleInterval = dataset.radargram.sampleInterval;
    const surfIdx = dataset.surfaceEcho.indices[Math.floor(dataset.radargram.width / 2)];

    return layers.map((layer, i) => {
      const mat = getMaterial(layer.materialId);
      if (!mat) return null;

      const prevMat = i > 0 ? getMaterial(layers[i - 1].materialId) : getMaterial('mars-atmo');
      const eps1 = prevMat?.permittivity ?? 1;
      const eps2 = mat.permittivity;

      const fresnel = fresnelReflection(eps1, eps2);
      const atten = layerAttenuation(freqHz, mat.permittivity, mat.lossTangent, layer.thickness);
      const depth = sampleToDepth(layer.bottomSample, surfIdx, sampleInterval, mat.permittivity);

      return { mat, fresnel, atten, depth, eps1, eps2 };
    });
  }, [layers, dataset, operatingFrequencyMhz]);

  return (
    <div className="dp-panel">
      <div className="dp-header">
        <span className="cr-section-title">Layer Interpretation</span>
        <button className="cr-btn dp-add-btn" onClick={addLayer}>+ Add Layer</button>
      </div>

      {layers.length === 0 && (
        <div className="dp-empty">
          <p>No layers defined. Add a layer and pick horizons on the radargram to begin interpretation.</p>
        </div>
      )}

      <div className="dp-layers">
        {layers.map((layer, i) => {
          const analysis = layerAnalyses[i];
          const active = activeLayerIndex === i;
          const mat = getMaterial(layer.materialId);

          return (
            <div
              key={layer.id}
              className={`dp-layer ${active ? 'dp-layer--active' : ''}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_LAYER', index: active ? null : i })}
            >
              <div className="dp-layer-header">
                <div className="dp-layer-dot" style={{ backgroundColor: mat?.color ?? '#fff' }} />
                <span className="dp-layer-label">Layer {i + 1}</span>
                <span className="dp-layer-picks">{layer.picks.length} picks</span>
                <button className="dp-remove-btn" onClick={e => { e.stopPropagation(); removeLayer(i); }} title="Remove layer">✕</button>
              </div>

              <div className="dp-layer-body">
                <label className="dp-field">
                  <span className="dp-field-label">Material</span>
                  <select
                    value={layer.materialId}
                    onChange={e => setMaterial(i, e.target.value)}
                    onClick={e => e.stopPropagation()}
                  >
                    {materials.map(m => (
                      <option key={m.id} value={m.id}>{m.name} (εᵣ={m.permittivity})</option>
                    ))}
                  </select>
                </label>

                {analysis && (
                  <div className="dp-analysis">
                    <div className="dp-analysis-row">
                      <span className="dp-analysis-label">Fresnel R</span>
                      <span className="dp-analysis-value cr-mono">
                        {(analysis.fresnel.reflectionCoefficient * 100).toFixed(2)}% ({analysis.fresnel.reflectionDb.toFixed(1)} dB)
                      </span>
                    </div>
                    <div className="dp-fresnel-bar">
                      <div className="dp-fresnel-fill" style={{ width: `${Math.min(analysis.fresnel.reflectionCoefficient * 100 * 2.5, 100)}%` }} />
                    </div>
                    <div className="dp-analysis-row">
                      <span className="dp-analysis-label">2-Way Atten.</span>
                      <span className="dp-analysis-value cr-mono">{analysis.atten.twoWayLossDb.toFixed(2)} dB</span>
                    </div>
                    <div className="dp-analysis-row">
                      <span className="dp-analysis-label">Interface</span>
                      <span className="dp-analysis-value cr-mono">εᵣ {analysis.eps1.toFixed(1)} → {analysis.eps2.toFixed(1)}</span>
                    </div>

                    {analysis.fresnel.reflectionCoefficient > 0.2 && (
                      <div className="dp-bright-alert">
                        ⚡ Bright reflection — possible liquid water
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
