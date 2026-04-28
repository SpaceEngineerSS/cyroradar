/* CRYORADAR — Info Panel
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS) */

import { useCryoState } from '../../context/CryoRadarContext';
import './InfoPanel.css';

export function InfoPanel() {
  const { dataset } = useCryoState();

  if (!dataset) return null;

  const { metadata, radargram } = dataset;

  return (
    <div className="ip-panel">
      <div className="cr-section-title">Dataset Information</div>

      <div className="ip-grid">
        <div className="ip-field">
          <span className="ip-label">Instrument</span>
          <span className="ip-value">{metadata.instrument}</span>
        </div>
        <div className="ip-field">
          <span className="ip-label">Orbit</span>
          <span className="ip-value cr-mono">{metadata.orbitNumber}</span>
        </div>
        <div className="ip-field">
          <span className="ip-label">Date</span>
          <span className="ip-value">{metadata.acquisitionDate}</span>
        </div>
        <div className="ip-field">
          <span className="ip-label">Region</span>
          <span className="ip-value">{metadata.region}</span>
        </div>
        <div className="ip-field">
          <span className="ip-label">Dimensions</span>
          <span className="ip-value cr-mono">{radargram.width} × {radargram.height}</span>
        </div>
        <div className="ip-field">
          <span className="ip-label">Δt</span>
          <span className="ip-value cr-mono">{(radargram.sampleInterval * 1e9).toFixed(1)} ns</span>
        </div>
      </div>

      <p className="ip-description">{metadata.description}</p>

      {metadata.references.length > 0 && (
        <div className="ip-refs">
          <div className="cr-section-title" style={{ paddingTop: 8 }}>References</div>
          {metadata.references.map((ref, i) => (
            <div key={i} className="ip-ref">
              <span className="ip-ref-authors">{ref.authors}</span>
              <span className="ip-ref-title">{ref.title}</span>
              <span className="ip-ref-journal">{ref.journal}</span>
              {ref.doi && (
                <a
                  className="ip-ref-doi"
                  href={`https://doi.org/${ref.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {ref.doi}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="ip-credits">
        <span>Developer: Mehmet Gümüş</span>
        <a href="https://github.com/SpaceEngineerSS" target="_blank" rel="noopener noreferrer">
          github.com/SpaceEngineerSS
        </a>
      </div>
    </div>
  );
}
