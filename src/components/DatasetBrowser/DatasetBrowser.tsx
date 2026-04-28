/* CRYORADAR — Dataset Browser Panel (Production)
 * Chief Scientist & Architect: Mehmet Gümüş (github.com/SpaceEngineerSS) */

import { useState, useCallback } from 'react';
import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';
import { getAvailableDatasets, generateDatasetById } from '../../core/pipeline/synthetic-generator';
import { searchProducts, fetchRadargramAsImageData, footprintToLatLon } from '../../core/pipeline/pds-client';
import { PDS_REGIONS, type PDSProduct, type PDSRegion } from '../../types/pds-types';
import type { CryoDataset, RadargramData, GeometryData, SurfaceEchoData } from '../../types/types';
import './DatasetBrowser.css';

type DataSource = 'synthetic' | 'pds';

const syntheticDatasets = getAvailableDatasets();

function buildDatasetFromPDS(
  product: PDSProduct,
  imgWidth: number,
  imgHeight: number,
  pixels: Uint8ClampedArray,
): CryoDataset {
  const width = imgWidth;
  const height = imgHeight;
  const data = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    data[i] = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  }

  const footprint = footprintToLatLon(product.footprintWkt);
  const numTraces = Math.max(footprint.length, width);
  const latitudes = new Float64Array(numTraces);
  const longitudes = new Float64Array(numTraces);
  const surfaceElevation = new Float32Array(numTraces);
  const spacecraftAltitude = new Float32Array(numTraces);

  for (let i = 0; i < numTraces; i++) {
    const t = i / (numTraces - 1);
    if (footprint.length >= 2) {
      const fi = t * (footprint.length - 1);
      const lo = Math.floor(fi);
      const hi = Math.min(lo + 1, footprint.length - 1);
      const frac = fi - lo;
      latitudes[i] = footprint[lo].lat * (1 - frac) + footprint[hi].lat * frac;
      longitudes[i] = footprint[lo].lon * (1 - frac) + footprint[hi].lon * frac;
    } else {
      latitudes[i] = product.startLat + t * (product.stopLat - product.startLat);
      longitudes[i] = product.startLon + t * (product.stopLon - product.startLon);
    }
    surfaceElevation[i] = -3000 + Math.sin(i * 0.02) * 200;
    spacecraftAltitude[i] = product.instrument === 'SHARAD' ? 300e3 : 800e3;
  }

  const surfaceIndices = new Uint16Array(width);
  for (let x = 0; x < width; x++) {
    let maxVal = -1;
    let maxIdx = 0;
    for (let y = 0; y < Math.min(height * 0.3, height); y++) {
      if (data[y * width + x] > maxVal) {
        maxVal = data[y * width + x];
        maxIdx = y;
      }
    }
    surfaceIndices[x] = maxIdx;
  }

  const radargram: RadargramData = {
    width, height,
    sampleInterval: product.instrument === 'SHARAD' ? 0.075e-6 : 0.1e-6,
    data, powerMin: 0, powerMax: 1,
  };

  const geometry: GeometryData = { latitudes, longitudes, surfaceElevation, spacecraftAltitude };
  const surfaceEcho: SurfaceEchoData = { indices: surfaceIndices };

  return {
    metadata: {
      instrument: product.instrument,
      orbitNumber: product.orbitNumber,
      productId: product.productId,
      acquisitionDate: product.observationTime,
      region: 'PDS Live',
      description: `${product.description} — Orbit ${product.orbitNumber}`,
      centerLat: product.centerLat,
      centerLon: product.centerLon,
      references: [],
    },
    geometry, radargram, surfaceEcho,
  };
}

export function DatasetBrowser() {
  const state = useCryoState();
  const dispatch = useCryoDispatch();
  const [source, setSource] = useState<DataSource>('synthetic');
  const [selectedRegion, setSelectedRegion] = useState<PDSRegion>(PDS_REGIONS[0]);
  const [pdsResults, setPdsResults] = useState<PDSProduct[]>([]);
  const [pdsLoading, setPdsLoading] = useState(false);
  const [pdsError, setPdsError] = useState<string | null>(null);

  const loadSynthetic = useCallback((id: string) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    requestAnimationFrame(() => {
      const ds = generateDatasetById(id);
      dispatch({ type: 'SET_DATASET', dataset: ds, id });
    });
  }, [dispatch]);

  const searchPDS = useCallback(async () => {
    setPdsLoading(true);
    setPdsError(null);
    try {
      const result = await searchProducts({
        instrument: 'SHARAD',
        minLat: selectedRegion.minLat,
        maxLat: selectedRegion.maxLat,
        westLon: selectedRegion.westLon,
        eastLon: selectedRegion.eastLon,
        limit: 12,
      });
      setPdsResults(result.products);
      if (result.products.length === 0) setPdsError('No tracks found in this region');
    } catch (err) {
      setPdsError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setPdsLoading(false);
    }
  }, [selectedRegion]);

  const loadPDSProduct = useCallback(async (product: PDSProduct) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    setPdsError(null);
    try {
      const tiffData = await fetchRadargramAsImageData(product);
      if (!tiffData) throw new Error('TIFF download failed');

      const ds = buildDatasetFromPDS(product, tiffData.width, tiffData.height, tiffData.pixels);
      dispatch({ type: 'SET_DATASET', dataset: ds, id: `pds:${product.productId}` });
    } catch (err) {
      dispatch({ type: 'SET_LOADING', loading: false });
      setPdsError(err instanceof Error ? err.message : 'Failed to load radargram');
    }
  }, [dispatch]);

  return (
    <div className="db-panel">
      <div className="db-source-toggle">
        <button
          className={`db-source-btn ${source === 'synthetic' ? 'db-source-btn--active' : ''}`}
          onClick={() => setSource('synthetic')}
        >
          🔬 Synthetic
        </button>
        <button
          className={`db-source-btn ${source === 'pds' ? 'db-source-btn--active' : ''}`}
          onClick={() => setSource('pds')}
        >
          🛰️ PDS Live
        </button>
      </div>

      {source === 'synthetic' && (
        <>
          <div className="cr-section-title">Synthetic Radargrams</div>
          <div className="db-list">
            {syntheticDatasets.map(ds => {
              const active = state.datasetId === ds.id;
              return (
                <button
                  key={ds.id}
                  className={`db-item ${active ? 'db-item--active' : ''}`}
                  onClick={() => loadSynthetic(ds.id)}
                  disabled={state.loading}
                >
                  <div className="db-item-header">
                    <span className={`db-badge db-badge--${ds.instrument.toLowerCase()}`}>{ds.instrument}</span>
                    <span className="db-coords">{ds.centerLat}°N, {ds.centerLon}°E</span>
                  </div>
                  <div className="db-item-name">{ds.name}</div>
                  <div className="db-item-region">{ds.region}</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {source === 'pds' && (
        <>
          <div className="cr-section-title">NASA PDS ODE — Real SHARAD Data</div>
          <div className="db-pds-search">
            <select
              className="db-region-select"
              value={selectedRegion.id}
              onChange={e => setSelectedRegion(PDS_REGIONS.find(r => r.id === e.target.value) ?? PDS_REGIONS[0])}
            >
              {PDS_REGIONS.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <div className="db-region-desc">{selectedRegion.description}</div>
            <div className="db-region-coords">
              {selectedRegion.minLat}° to {selectedRegion.maxLat}°N, {selectedRegion.westLon}° to {selectedRegion.eastLon}°E
            </div>
            <button
              className="db-search-btn"
              onClick={searchPDS}
              disabled={pdsLoading || state.loading}
            >
              {pdsLoading ? 'Searching PDS…' : '🔍 Search PDS ODE'}
            </button>
          </div>

          {pdsError && <div className="db-pds-error">{pdsError}</div>}

          <div className="db-list">
            {pdsResults.map(product => {
              const active = state.datasetId === `pds:${product.productId}`;
              return (
                <button
                  key={product.productId}
                  className={`db-item ${active ? 'db-item--active' : ''}`}
                  onClick={() => loadPDSProduct(product)}
                  disabled={state.loading}
                >
                  <div className="db-item-header">
                    <span className="db-badge db-badge--sharad">SHARAD</span>
                    <span className="db-coords">Orbit {product.orbitNumber}</span>
                  </div>
                  <div className="db-item-name">{product.productId}</div>
                  <div className="db-item-region">
                    {product.centerLat.toFixed(2)}°N, {product.centerLon.toFixed(2)}°E
                    <span className="db-item-date">
                      {new Date(product.observationTime).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
