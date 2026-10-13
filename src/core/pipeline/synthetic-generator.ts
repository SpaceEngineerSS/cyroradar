/* Synthetic radargrams from layered subsurface models.
 *
 * Each trace is built as a complex sum of echoes so overlapping returns
 * interfere the way they do in real data:
 *
 *   1. Interface delays from the layer stack, τ = Σ 2dᵢ√εᵢ / c, starting at a
 *      surface echo that follows the topography.
 *   2. Echo power from Fresnel reflectivity, two-way transmission through every
 *      interface above, and two-way dielectric loss (attenuation.ts).
 *   3. Roughness splits each echo into a coherent part, exp(−(4πσ√ε/λ)²), and a
 *      Rayleigh-distributed diffuse part (Kirchhoff approximation).
 *   4. A Gaussian range pulse with a width set by the bandwidth (≈ 1/B).
 *   5. Optional off-nadir clutter: weak surface returns that land at subsurface
 *      delays because of their cross-track range.
 *   6. Residual ionospheric dispersion after correction, modelled as a smear
 *      of the echoes whose width scales with TEC and with 1/f² across the band.
 *   7. Complex white receiver noise at the scene's noise floor.
 *
 * Values are stored as power in dB relative to a perfect reflector at the
 * spacecraft range, so a water-ice surface sits near −11 dB.
 *
 *   Seu et al. (2007), JGR 112, E05S05
 *   Orosei et al. (2018), Science 361, 490–493
 *   Safaeinili et al. (2003), Planet. Space Sci. 51, 505–515 (ionospheric dispersion) */

import { SPEED_OF_LIGHT, INSTRUMENTS, type InstrumentId } from '../physics/constants';
import { fresnelReflection } from '../physics/fresnel';
import { lossDbPerMeter } from '../physics/attenuation';
import { seededRandom, gaussian, smoothProfile } from '../util/random';
import type { CryoDataset, ScientificReference, GroundTruth } from '../../types/types';

interface LayerSpec {
  label: string;
  permittivity: number;
  lossTangent: number;
  /** Ignored for the last layer, which is a half-space. */
  thicknessM: number;
  /** RMS height of the layer's base interface. */
  roughnessM: number;
  /** Amplitude of smooth along-track thickness changes. */
  undulationM?: number;
  /** Layer only exists between these track fractions, tapering at the edges. */
  extent?: { from: number; to: number; taper: number };
  /** Different material between these track fractions. */
  patches?: { from: number; to: number; label: string; permittivity: number; lossTangent: number }[];
}

interface SceneConfig {
  id: string;
  title: string;
  instrument: InstrumentId;
  orbitNumber: number;
  acquisitionDate: string;
  region: string;
  description: string;
  centerLat: number;
  centerLon: number;
  /** Ground-track heading, degrees from north. */
  headingDeg: number;
  numTraces: number;
  traceSpacingM: number;
  elevationBaseM: number;
  reliefM: number;
  regionalSlopeMPerKm: number;
  surfaceRoughnessM: number;
  layers: LayerSpec[];
  noiseFloorDb: number;
  /** Clutter power relative to the surface echo, dB. */
  clutter?: { count: number; minDb: number; maxDb: number };
  target?: { from: number; to: number; label: string };
  references: ScientificReference[];
  seed: number;
}

export interface SceneSummary {
  id: string;
  title: string;
  region: string;
  instrument: InstrumentId;
  description: string;
  centerLat: number;
  centerLon: number;
}

export interface SyntheticOptions {
  /** Total electron content, TECU (1e16 e⁻/m²). */
  tecu?: number;
}

export const DEFAULT_TECU = 0.3;
/** Fraction of the uncompensated dispersion left after ionospheric correction. */
const IONO_RESIDUAL = 0.02;

const SCENES: SceneConfig[] = [
  {
    id: 'planum-australe',
    title: 'Planum Australe',
    instrument: 'MARSIS',
    orbitNumber: 10737,
    acquisitionDate: '2015-05-14',
    region: 'South polar layered deposits',
    description:
      'About 1.5 km of dusty water ice over the base of the south polar cap. Between roughly 46 % and 57 % of the track, and again near 70 %, the basal echo is much brighter than elsewhere, which is the signature Orosei et al. (2018) and Lauro et al. (2021) interpreted as ponded brine.',
    centerLat: -81,
    centerLon: 193,
    headingDeg: 8,
    numTraces: 720,
    traceSpacingM: 500,
    elevationBaseM: 1200,
    reliefM: 25,
    regionalSlopeMPerKm: 0.4,
    surfaceRoughnessM: 0.4,
    layers: [
      { label: 'SPLD, dusty water ice', permittivity: 3.3, lossTangent: 4e-3, thicknessM: 1450, roughnessM: 0.8, undulationM: 22 },
      {
        label: 'Basement rock', permittivity: 7, lossTangent: 0.02, thicknessM: 0, roughnessM: 0,
        patches: [
          { from: 0.46, to: 0.57, label: 'Brine-saturated base', permittivity: 35, lossTangent: 0.3 },
          { from: 0.69, to: 0.715, label: 'Brine-saturated base', permittivity: 28, lossTangent: 0.3 },
        ],
      },
    ],
    noiseFloorDb: -48,
    target: { from: 0.46, to: 0.57, label: 'Bright basal reflection' },
    references: [
      { authors: 'Orosei, R. et al.', year: 2018, title: 'Radar evidence of subglacial liquid water on Mars', journal: 'Science 361, 490–493', doi: '10.1126/science.aar7268' },
      { authors: 'Lauro, S.E. et al.', year: 2021, title: 'Multiple subglacial water bodies below the south pole of Mars unveiled by new MARSIS data', journal: 'Nature Astronomy 5, 63–70', doi: '10.1038/s41550-020-1200-6' },
    ],
    seed: 20180725,
  },
  {
    id: 'planum-boreum',
    title: 'Planum Boreum',
    instrument: 'SHARAD',
    orbitNumber: 6830,
    acquisitionDate: '2008-03-22',
    region: 'North polar layered deposits',
    description:
      'Packets of clean and dustier ice inside the north polar layered deposits, above the sandy basal unit and the Vastitas Borealis basement. The internal reflectors are weak because the permittivity contrast between ice packets is small.',
    centerLat: 85,
    centerLon: 0,
    headingDeg: 172,
    numTraces: 900,
    traceSpacingM: 460,
    elevationBaseM: -2600,
    reliefM: 70,
    regionalSlopeMPerKm: 2.5,
    surfaceRoughnessM: 0.3,
    layers: [
      { label: 'Residual ice cap', permittivity: 3.15, lossTangent: 6e-4, thicknessM: 60, roughnessM: 0.3, undulationM: 6 },
      { label: 'NPLD, clean ice', permittivity: 3.15, lossTangent: 8e-4, thicknessM: 280, roughnessM: 0.2, undulationM: 14 },
      { label: 'NPLD, dust-rich packet', permittivity: 3.5, lossTangent: 3e-3, thicknessM: 45, roughnessM: 0.3, undulationM: 6 },
      { label: 'NPLD, clean ice', permittivity: 3.15, lossTangent: 8e-4, thicknessM: 260, roughnessM: 0.2, undulationM: 18 },
      { label: 'NPLD, dust-rich packet', permittivity: 3.55, lossTangent: 3e-3, thicknessM: 60, roughnessM: 0.3, undulationM: 8 },
      { label: 'NPLD, clean ice', permittivity: 3.15, lossTangent: 8e-4, thicknessM: 380, roughnessM: 0.3, undulationM: 25 },
      { label: 'Basal unit, sand and ice', permittivity: 4.6, lossTangent: 8e-3, thicknessM: 550, roughnessM: 1.2, undulationM: 80, extent: { from: 0.12, to: 0.96, taper: 0.1 } },
      { label: 'Vastitas Borealis basement', permittivity: 7.5, lossTangent: 0.02, thicknessM: 0, roughnessM: 0 },
    ],
    noiseFloorDb: -55,
    references: [
      { authors: 'Phillips, R.J. et al.', year: 2008, title: 'Mars north polar deposits: stratigraphy, age, and geodynamical response', journal: 'Science 320, 1182–1185', doi: '10.1126/science.1157546' },
      { authors: 'Putzig, N.E. et al.', year: 2009, title: 'Subsurface structure of Planum Boreum from Mars Reconnaissance Orbiter Shallow Radar soundings', journal: 'Icarus 204, 443–457', doi: '10.1016/j.icarus.2009.07.034' },
    ],
    seed: 20080322,
  },
  {
    id: 'deuteronilus-mensae',
    title: 'Deuteronilus Mensae',
    instrument: 'SHARAD',
    orbitNumber: 11845,
    acquisitionDate: '2009-01-15',
    region: 'Lobate debris aprons',
    description:
      'A debris-covered glacier flowing off a mesa. The ice lens thins toward both margins of the apron. Steep mesa walls nearby produce off-nadir clutter that can mimic subsurface reflectors.',
    centerLat: 44,
    centerLon: 25,
    headingDeg: 4,
    numTraces: 700,
    traceSpacingM: 460,
    elevationBaseM: -3200,
    reliefM: 110,
    regionalSlopeMPerKm: 0.5,
    surfaceRoughnessM: 1.5,
    layers: [
      { label: 'Debris cover', permittivity: 5.5, lossTangent: 0.01, thicknessM: 12, roughnessM: 1, undulationM: 3 },
      { label: 'Glacial ice', permittivity: 3.2, lossTangent: 1.5e-3, thicknessM: 460, roughnessM: 1.5, undulationM: 50, extent: { from: 0.14, to: 0.88, taper: 0.18 } },
      { label: 'Plains basement', permittivity: 7.5, lossTangent: 0.02, thicknessM: 0, roughnessM: 0 },
    ],
    noiseFloorDb: -52,
    clutter: { count: 9, minDb: -22, maxDb: -11 },
    references: [
      { authors: 'Plaut, J.J. et al.', year: 2009, title: 'Radar evidence for ice in lobate debris aprons in the mid-northern latitudes of Mars', journal: 'GRL 36, L02203', doi: '10.1029/2008GL036379' },
      { authors: 'Holt, J.W. et al.', year: 2008, title: 'Radar sounding evidence for buried glaciers in the southern mid-latitudes of Mars', journal: 'Science 322, 1235–1238', doi: '10.1126/science.1164246' },
    ],
    seed: 20090115,
  },
  {
    id: 'arcadia-planitia',
    title: 'Arcadia Planitia',
    instrument: 'SHARAD',
    orbitNumber: 29785,
    acquisitionDate: '2013-07-08',
    region: 'Mid-latitude excess ice',
    description:
      'A few tens of metres of excess ice under a thin regolith cover, resting on lava plains. The ice-to-basement contact is the main subsurface reflector; it fades where the ice sheet thins out.',
    centerLat: 42,
    centerLon: 190,
    headingDeg: 357,
    numTraces: 600,
    traceSpacingM: 460,
    elevationBaseM: -4100,
    reliefM: 12,
    regionalSlopeMPerKm: 0.3,
    surfaceRoughnessM: 0.4,
    layers: [
      { label: 'Ice-cemented regolith', permittivity: 4.2, lossTangent: 6e-3, thicknessM: 18, roughnessM: 0.4, undulationM: 3 },
      { label: 'Excess water ice', permittivity: 3.0, lossTangent: 2e-3, thicknessM: 45, roughnessM: 0.6, undulationM: 9, extent: { from: 0.05, to: 0.8, taper: 0.15 } },
      { label: 'Lava plains', permittivity: 6.5, lossTangent: 0.012, thicknessM: 0, roughnessM: 0 },
    ],
    noiseFloorDb: -53,
    references: [
      { authors: 'Bramson, A.M. et al.', year: 2015, title: 'Widespread excess ice in Arcadia Planitia, Mars', journal: 'GRL 42, 6566–6574', doi: '10.1002/2015GL064844' },
    ],
    seed: 20150101,
  },
  {
    id: 'utopia-planitia',
    title: 'Utopia Planitia',
    instrument: 'SHARAD',
    orbitNumber: 45200,
    acquisitionDate: '2016-11-22',
    region: 'Mid-latitude ice sheet',
    description:
      'A buried ice-rich deposit 80–170 m thick with a permittivity close to 2.8, consistent with ice plus some porosity or dust. Its base shows up as a continuous reflector across most of the track.',
    centerLat: 45,
    centerLon: 120,
    headingDeg: 2,
    numTraces: 750,
    traceSpacingM: 460,
    elevationBaseM: -4300,
    reliefM: 20,
    regionalSlopeMPerKm: 0.5,
    surfaceRoughnessM: 0.5,
    layers: [
      { label: 'Regolith cover', permittivity: 4.0, lossTangent: 5e-3, thicknessM: 10, roughnessM: 0.4, undulationM: 2 },
      { label: 'Ice-rich deposit', permittivity: 2.8, lossTangent: 1.5e-3, thicknessM: 125, roughnessM: 0.8, undulationM: 40 },
      { label: 'Basement', permittivity: 6.0, lossTangent: 0.012, thicknessM: 0, roughnessM: 0 },
    ],
    noiseFloorDb: -53,
    references: [
      { authors: 'Stuurman, C.M. et al.', year: 2016, title: 'SHARAD detection and characterization of subsurface water ice deposits in Utopia Planitia, Mars', journal: 'GRL 43, 9484–9491', doi: '10.1002/2016GL070138' },
    ],
    seed: 20161122,
  },
];

export function listSyntheticScenes(): SceneSummary[] {
  return SCENES.map(s => ({
    id: s.id,
    title: s.title,
    region: s.region,
    instrument: s.instrument,
    description: s.description,
    centerLat: s.centerLat,
    centerLon: s.centerLon,
  }));
}

/** Layer stacks of every scene, for documentation figures. */
export function sceneModels() {
  return SCENES.map(s => ({
    id: s.id,
    title: s.title,
    instrument: s.instrument,
    layers: s.layers.map(l => ({ label: l.label, permittivity: l.permittivity, lossTangent: l.lossTangent, thicknessM: l.thicknessM, patches: l.patches?.map(p => ({ label: p.label, permittivity: p.permittivity })) })),
  }));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Two-way group-delay spread across the band left after correction, seconds. */
export function ionosphericSmearS(tecu: number, centerHz: number, bandwidthHz: number): number {
  if (!(tecu > 0)) return 0;
  const lo = centerHz - bandwidthHz / 2;
  const hi = centerHz + bandwidthHz / 2;
  const spread = ((2 * 40.3 * tecu * 1e16) / SPEED_OF_LIGHT) * (1 / (lo * lo) - 1 / (hi * hi));
  return spread * IONO_RESIDUAL;
}

export function generateSyntheticDataset(id: string, options: SyntheticOptions = {}): CryoDataset {
  const cfg = SCENES.find(s => s.id === id);
  if (!cfg) throw new Error(`Unknown synthetic scene: ${id}`);
  return renderScene(cfg, options.tecu ?? DEFAULT_TECU);
}

function renderScene(cfg: SceneConfig, tecu: number): CryoDataset {
  const inst = INSTRUMENTS[cfg.instrument];
  const dt = inst.sampleIntervalS;
  const freq = inst.centerFrequencyHz;
  const lambda = SPEED_OF_LIGHT / freq;
  const W = cfg.numTraces;
  const rng = seededRandom(cfg.seed);
  const nLayers = cfg.layers.length;
  const nFinite = nLayers - 1;

  /* Per-trace model ------------------------------------------------------- */
  const latitudes = new Float64Array(W);
  const longitudes = new Float64Array(W);
  const elevation = new Float32Array(W);
  const altitude = new Float32Array(W);
  const relief = smoothProfile(W, rng, 6);
  const altWobble = smoothProfile(W, rng, 2);
  const metresPerDegree = 59_275;
  const heading = (cfg.headingDeg * Math.PI) / 180;

  for (let t = 0; t < W; t++) {
    const frac = t / (W - 1);
    const along = (t - (W - 1) / 2) * cfg.traceSpacingM;
    const lat = cfg.centerLat + (along * Math.cos(heading)) / metresPerDegree;
    latitudes[t] = Math.max(-89.9, Math.min(89.9, lat));
    const coslat = Math.max(0.05, Math.cos((latitudes[t] * Math.PI) / 180));
    longitudes[t] = (((cfg.centerLon + (along * Math.sin(heading)) / (metresPerDegree * coslat)) % 360) + 360) % 360;
    elevation[t] = cfg.elevationBaseM + cfg.regionalSlopeMPerKm * (along / 1000) + cfg.reliefM * relief[t] + 0.03 * cfg.reliefM * gaussian(rng);
    altitude[t] = inst.orbitAltitudeM + 1500 * altWobble[t] + 4000 * (frac - 0.5);
  }

  const thickness: Float32Array[] = [];
  const eps: Float32Array[] = [];
  const tand: Float32Array[] = [];
  for (let i = 0; i < nLayers; i++) {
    const spec = cfg.layers[i];
    const th = new Float32Array(W);
    const ep = new Float32Array(W);
    const td = new Float32Array(W);
    const und = smoothProfile(W, rng, 5);
    for (let t = 0; t < W; t++) {
      const frac = t / (W - 1);
      let d = i < nFinite ? spec.thicknessM + (spec.undulationM ?? 0) * und[t] : 0;
      if (spec.extent) {
        const { from, to, taper } = spec.extent;
        d *= smoothstep(from - taper / 2, from + taper / 2, frac) * (1 - smoothstep(to - taper / 2, to + taper / 2, frac));
      }
      th[t] = Math.max(0, d);
      const patch = spec.patches?.find(p => frac >= p.from && frac <= p.to);
      ep[t] = patch ? patch.permittivity : spec.permittivity;
      td[t] = patch ? patch.lossTangent : spec.lossTangent;
    }
    thickness.push(th);
    eps.push(ep);
    tand.push(td);
  }

  /* Window size ----------------------------------------------------------- */
  const meanElev = elevation.reduce((a, b) => a + b, 0) / W;
  let maxElev = -Infinity;
  let minElev = Infinity;
  for (let t = 0; t < W; t++) {
    maxElev = Math.max(maxElev, elevation[t]);
    minElev = Math.min(minElev, elevation[t]);
  }
  let maxBelow = 0;
  for (let t = 0; t < W; t++) {
    let tt = 0;
    for (let i = 0; i < nFinite; i++) tt += (2 * thickness[i][t] * Math.sqrt(eps[i][t])) / SPEED_OF_LIGHT;
    maxBelow = Math.max(maxBelow, tt / dt);
  }
  const pulseFwhm = 1 / inst.bandwidthHz / dt;
  const pulseSigma = pulseFwhm / 2.355;
  const topMargin = Math.ceil(24 + 3 * pulseSigma);
  const surfaceRow = topMargin + ((maxElev - meanElev) * 2) / (SPEED_OF_LIGHT * dt);
  const lowestSurface = surfaceRow + ((meanElev - minElev) * 2) / (SPEED_OF_LIGHT * dt);
  const minHeight = cfg.instrument === 'SHARAD' ? 320 : 256;
  const H = Math.min(1600, Math.max(minHeight, Math.ceil((lowestSurface + maxBelow * 1.15 + 40 + 4 * pulseSigma) / 16) * 16));

  /* Clutter sources ------------------------------------------------------- */
  const clutter: { center: number; halfWidth: number; delay: number; curvature: number; powerDb: number }[] = [];
  if (cfg.clutter) {
    for (let k = 0; k < cfg.clutter.count; k++) {
      const crossTrackM = 3000 + rng() * 9000;
      const excessDelay = (2 * (Math.hypot(inst.orbitAltitudeM, crossTrackM) - inst.orbitAltitudeM)) / SPEED_OF_LIGHT;
      clutter.push({
        center: Math.floor(rng() * W),
        halfWidth: 12 + Math.floor(rng() * 40),
        delay: excessDelay / dt,
        curvature: 4 + rng() * 10,
        powerDb: cfg.clutter.minDb + rng() * (cfg.clutter.maxDb - cfg.clutter.minDb),
      });
    }
  }

  /* Render ---------------------------------------------------------------- */
  const data = new Float32Array(W * H);
  const surfaceIdx = new Uint16Array(W);
  const interfaces: Uint16Array[] = [];
  for (let i = 0; i < nFinite; i++) interfaces.push(new Uint16Array(W));

  const re = new Float64Array(H);
  const im = new Float64Array(H);
  const pow = new Float64Array(H);
  const noiseAmp = Math.sqrt(10 ** (cfg.noiseFloorDb / 10) / 2);
  const floorPower = 10 ** ((cfg.noiseFloorDb - 18) / 10);
  const pulseReach = Math.ceil(4 * pulseSigma);

  const ionoSigma = ionosphericSmearS(tecu, freq, inst.bandwidthHz) / dt / 2.355;
  const ionoKernel = buildGaussianKernel(ionoSigma);

  const addEcho = (delay: number, powerLin: number, coherent: number) => {
    if (!(powerLin > 0) || delay < -pulseReach || delay >= H + pulseReach) return;
    const phase = rng() * Math.PI * 2;
    const diffuse = Math.sqrt(Math.max(0, 1 - coherent) / 2);
    const a = Math.sqrt(powerLin);
    const cr = a * (Math.sqrt(coherent) * Math.cos(phase) + diffuse * gaussian(rng));
    const ci = a * (Math.sqrt(coherent) * Math.sin(phase) + diffuse * gaussian(rng));
    const s0 = Math.max(0, Math.floor(delay - pulseReach));
    const s1 = Math.min(H - 1, Math.ceil(delay + pulseReach));
    for (let s = s0; s <= s1; s++) {
      const x = (s - delay) / pulseSigma;
      const g = Math.exp(-0.5 * x * x);
      re[s] += cr * g;
      im[s] += ci * g;
    }
  };

  const coherentFraction = (roughnessM: number, epsAbove: number) => {
    const k = (4 * Math.PI * roughnessM * Math.sqrt(epsAbove)) / lambda;
    return Math.exp(-k * k);
  };

  for (let t = 0; t < W; t++) {
    re.fill(0);
    im.fill(0);

    let delay = surfaceRow + ((meanElev - elevation[t]) * 2) / (SPEED_OF_LIGHT * dt);
    surfaceIdx[t] = Math.max(0, Math.min(H - 1, Math.round(delay)));

    // Surface echo.
    const eTop = eps[0][t];
    const surf = fresnelReflection(1, eTop);
    addEcho(delay, surf.reflectionCoefficient, coherentFraction(cfg.surfaceRoughnessM, 1));
    let transmission = surf.transmissionCoefficient * surf.transmissionCoefficient;
    let lossDb = 0;

    // Walk down the stack, skipping layers pinched out at this trace.
    for (let i = 0; i < nFinite; i++) {
      const d = thickness[i][t];
      if (d <= 0.01) {
        interfaces[i][t] = Math.max(0, Math.min(H - 1, Math.round(delay)));
        continue;
      }
      const e = eps[i][t];
      delay += (2 * d * Math.sqrt(e)) / (SPEED_OF_LIGHT * dt);
      lossDb += 2 * lossDbPerMeter(freq, e, tand[i][t]) * d;

      let below = i + 1;
      while (below < nFinite && thickness[below][t] <= 0.01) below++;
      const f = fresnelReflection(e, eps[below][t]);
      const p = f.reflectionCoefficient * transmission * 10 ** (-lossDb / 10);
      addEcho(delay, p, coherentFraction(cfg.layers[i].roughnessM, e));
      transmission *= f.transmissionCoefficient * f.transmissionCoefficient;
      interfaces[i][t] = Math.max(0, Math.min(H - 1, Math.round(delay)));
    }

    // Off-nadir clutter appears at the surface delay plus the cross-track excess range.
    for (const c of clutter) {
      const dx = (t - c.center) / c.halfWidth;
      if (Math.abs(dx) > 1) continue;
      const surfDelay = surfaceIdx[t];
      const p = surf.reflectionCoefficient * 10 ** (c.powerDb / 10) * (1 - dx * dx);
      addEcho(surfDelay + c.delay + c.curvature * dx * dx, p, 0.3);
    }

    // The ionosphere smears the echoes on their way up; receiver noise is added
    // afterwards, so only the echo power is blurred.
    if (ionoKernel) {
      for (let s = 0; s < H; s++) pow[s] = re[s] * re[s] + im[s] * im[s];
      const smeared = convolve(pow, ionoKernel);
      for (let s = 0; s < H; s++) {
        const k = pow[s] > 1e-30 ? Math.sqrt(smeared[s] / pow[s]) : 0;
        if (k > 0) {
          re[s] *= k;
          im[s] *= k;
        } else {
          re[s] = Math.sqrt(smeared[s]);
        }
      }
    }
    for (let s = 0; s < H; s++) {
      const r = re[s] + noiseAmp * gaussian(rng);
      const q = im[s] + noiseAmp * gaussian(rng);
      data[s * W + t] = 10 * Math.log10(Math.max(r * r + q * q, floorPower));
    }
  }

  let powerMin = Infinity;
  let powerMax = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < powerMin) powerMin = v;
    if (v > powerMax) powerMax = v;
  }

  const truth: GroundTruth = {
    layers: cfg.layers.map(l => ({ label: l.label, permittivity: l.permittivity, lossTangent: l.lossTangent, thicknessM: l.thicknessM })),
    interfaces,
    target: cfg.target
      ? { traceStart: Math.round(cfg.target.from * (W - 1)), traceEnd: Math.round(cfg.target.to * (W - 1)), label: cfg.target.label }
      : undefined,
  };

  return {
    metadata: {
      instrument: cfg.instrument,
      source: 'synthetic',
      orbitNumber: cfg.orbitNumber,
      productId: `SYN_${cfg.id.toUpperCase().replace(/-/g, '_')}`,
      acquisitionDate: cfg.acquisitionDate,
      region: cfg.region,
      title: cfg.title,
      description: cfg.description,
      centerLat: cfg.centerLat,
      centerLon: cfg.centerLon,
      frequencyHz: freq,
      references: cfg.references,
      calibration: 'model',
    },
    geometry: { latitudes, longitudes, surfaceElevation: elevation, spacecraftAltitude: altitude },
    radargram: { width: W, height: H, sampleInterval: dt, traceSpacingM: cfg.traceSpacingM, data, powerMin, powerMax },
    surfaceEcho: { indices: surfaceIdx },
    truth,
  };
}

function buildGaussianKernel(sigma: number): Float64Array | null {
  if (!(sigma > 0.35)) return null;
  const half = Math.ceil(3 * sigma);
  const k = new Float64Array(2 * half + 1);
  let sum = 0;
  for (let i = -half; i <= half; i++) {
    const v = Math.exp(-0.5 * (i / sigma) ** 2);
    k[i + half] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

function convolve(x: Float64Array, k: Float64Array): Float64Array {
  const n = x.length;
  const half = (k.length - 1) / 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let wsum = 0;
    const j0 = Math.max(-half, -i);
    const j1 = Math.min(half, n - 1 - i);
    for (let j = j0; j <= j1; j++) {
      const w = k[j + half];
      acc += x[i + j] * w;
      wsum += w;
    }
    out[i] = acc / wsum;
  }
  return out;
}
