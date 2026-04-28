/* CRYORADAR — Scientific Notebook Panel
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Collapsible panels with physics derivations, instrument specs,
 * and reference library. */

import { useState } from 'react';
import { computeRadarBudget, SHARAD_SPEC, MARSIS_SPEC, minimumDetectableDepth } from '../../core/physics/radar-equation';
import { useCryoState } from '../../context/CryoRadarContext';
import './ScientificNotebook.css';

interface CollapsibleProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Collapsible({ title, children, defaultOpen = false }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sn-section">
      <button className="sn-section-header" onClick={() => setOpen(!open)}>
        <span className="sn-toggle">{open ? '▼' : '▶'}</span>
        <span>{title}</span>
      </button>
      {open && <div className="sn-section-body">{children}</div>}
    </div>
  );
}

export function ScientificNotebook() {
  const { dataset } = useCryoState();
  const instrument = dataset?.metadata.instrument ?? 'SHARAD';
  const spec = instrument === 'SHARAD' ? SHARAD_SPEC : MARSIS_SPEC;
  const orbitAlt = instrument === 'SHARAD' ? 300e3 : 800e3;
  const budget = computeRadarBudget(spec, orbitAlt);

  const maxDepthIce = minimumDetectableDepth(instrument, 3.15, 1e-3);
  const maxDepthBasalt = minimumDetectableDepth(instrument, 8.0, 0.02);

  return (
    <div className="sn-panel">
      <div className="cr-section-title">Scientific Reference</div>

      <Collapsible title="📡 Instrument Specifications" defaultOpen>
        <table className="sn-table">
          <tbody>
            <tr><td>Instrument</td><td>{instrument}</td></tr>
            <tr><td>Center Frequency</td><td>{spec.centerFrequencyHz / 1e6} MHz</td></tr>
            <tr><td>Bandwidth</td><td>{spec.bandwidthHz / 1e6} MHz</td></tr>
            <tr><td>Transmit Power</td><td>{spec.transmitPowerW} W ({budget.transmitPowerDbm.toFixed(1)} dBm)</td></tr>
            <tr><td>Antenna Gain</td><td>{spec.antennaGainDb} dBi</td></tr>
            <tr><td>System Temp</td><td>{spec.systemTempK} K</td></tr>
            <tr><td>Pulse Compression</td><td>+{spec.pulseCompressionGainDb} dB</td></tr>
            <tr><td>Wavelength</td><td>{budget.wavelengthM.toFixed(2)} m</td></tr>
          </tbody>
        </table>
      </Collapsible>

      <Collapsible title="📊 Radar Link Budget">
        <table className="sn-table">
          <tbody>
            <tr><td>Orbit Altitude</td><td>{(orbitAlt / 1e3).toFixed(0)} km</td></tr>
            <tr><td>Spreading Loss</td><td>{budget.spreadingLossDb.toFixed(1)} dB</td></tr>
            <tr><td>Received Power</td><td>{budget.receivedPowerDbm.toFixed(1)} dBm</td></tr>
            <tr><td>Noise Power</td><td>{budget.systemNoiseDbm.toFixed(1)} dBm</td></tr>
            <tr><td>Surface SNR</td><td className="sn-highlight">{budget.snrDb.toFixed(1)} dB</td></tr>
          </tbody>
        </table>
        <div className="sn-equation">
          P<sub>r</sub>/P<sub>t</sub> = G²λ²σ / (4π)³R⁴
        </div>
        <div className="sn-cite">Skolnik, M. I. (2001) Introduction to Radar Systems, 3rd ed.</div>
      </Collapsible>

      <Collapsible title="📏 Maximum Penetration Depth">
        <table className="sn-table">
          <tbody>
            <tr><td>Water Ice (ε=3.15)</td><td className="sn-highlight">{maxDepthIce.toFixed(0)} m</td></tr>
            <tr><td>Dense Basalt (ε=8.0)</td><td>{maxDepthBasalt.toFixed(0)} m</td></tr>
          </tbody>
        </table>
        <div className="sn-note">
          Depth limited by two-way attenuation loss exceeding available SNR.
          α = 2πf·tanδ·√εᵣ / c
        </div>
      </Collapsible>

      <Collapsible title="🧮 Key Equations">
        <div className="sn-eq-block">
          <div className="sn-eq-title">Fresnel Reflection (Normal Incidence)</div>
          <div className="sn-equation">R = ((√ε₁ − √ε₂) / (√ε₁ + √ε₂))²</div>
        </div>
        <div className="sn-eq-block">
          <div className="sn-eq-title">Two-Way Depth Conversion</div>
          <div className="sn-equation">d = cτ / (2√εᵣ)</div>
        </div>
        <div className="sn-eq-block">
          <div className="sn-eq-title">Signal Attenuation</div>
          <div className="sn-equation">α = 2πf·tanδ·√εᵣ / c &nbsp;[Np/m]</div>
        </div>
        <div className="sn-eq-block">
          <div className="sn-eq-title">Maxwell-Garnett Mixing</div>
          <div className="sn-equation">εeff = εm · (1 + 2fβ) / (1 − fβ)</div>
          <div className="sn-equation">β = (εi − εm) / (εi + 2εm)</div>
        </div>
      </Collapsible>

      <Collapsible title="📚 Reference Library">
        <div className="sn-ref-list">
          {REFERENCES.map((ref, i) => (
            <div key={i} className="sn-ref">
              <div className="sn-ref-authors">{ref.authors} ({ref.year})</div>
              <div className="sn-ref-title">{ref.title}</div>
              {ref.doi && (
                <a className="sn-ref-doi" href={`https://doi.org/${ref.doi}`} target="_blank" rel="noopener noreferrer">
                  DOI: {ref.doi}
                </a>
              )}
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

const REFERENCES = [
  { authors: 'Orosei, R. et al.', year: 2018, title: 'Radar evidence of subglacial liquid water on Mars', doi: '10.1126/science.aar7268' },
  { authors: 'Phillips, R. J. et al.', year: 2008, title: 'Mars north polar deposits: Stratigraphy, age, and geodynamical response', doi: '10.1126/science.1157546' },
  { authors: 'Bramson, A. M. et al.', year: 2015, title: 'Widespread excess ice in Arcadia Planitia, Mars', doi: '10.1002/2015GL064844' },
  { authors: 'Stuurman, C. M. et al.', year: 2016, title: 'SHARAD detection and characterization of subsurface water ice deposits in Utopia Planitia, Mars', doi: '10.1002/2016GL070138' },
  { authors: 'Plaut, J. J. et al.', year: 2009, title: 'Radar evidence for ice in lobate debris aprons in the mid-northern latitudes of Mars', doi: '10.1029/2009GL038754' },
  { authors: 'Watters, T. R. et al.', year: 2007, title: 'Radar sounding of the Medusae Fossae Formation Mars', doi: '10.1126/science.1148112' },
  { authors: 'Mätzler, C.', year: 2006, title: 'Thermal Microwave Radiation: Applications for Remote Sensing', doi: '10.1049/PBEW052E' },
  { authors: 'Heggy, E. et al.', year: 2001, title: 'On water detection in the Martian subsurface using sounding radar', doi: '10.1016/S0019-1035(01)00225-1' },
  { authors: 'Skolnik, M. I.', year: 2001, title: 'Introduction to Radar Systems, 3rd ed.', doi: '' },
  { authors: 'Pettinelli, E. et al.', year: 2015, title: 'Dielectric properties of Jovian satellite ice analogs', doi: '10.1016/j.asr.2015.03.008' },
  { authors: 'Stillman, D. E. et al.', year: 2010, title: 'Dielectric relaxation of perchlorate and Mars-relevant salt aqueous solutions', doi: '10.1029/2010JE003735' },
  { authors: 'Campbell, M. J. & Ulrichs, J.', year: 1969, title: 'Electrical properties of rocks and their significance for lunar radar observations', doi: '10.1029/JB074i025p05867' },
  { authors: 'Sihvola, A.', year: 1999, title: 'Electromagnetic Mixing Formulas and Applications', doi: '' },
];
