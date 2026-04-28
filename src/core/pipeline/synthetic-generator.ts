/* CRYORADAR — Synthetic Radargram Generator (Production)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Generates scientifically accurate radar echograms from layered subsurface models.
 * Each trace is computed by:
 *   1. Calculating two-way travel time to each interface
 *   2. Computing Fresnel reflection power at each boundary
 *   3. Applying cumulative attenuation through overlying layers
 *   4. Distributing reflections into sample bins with a Gaussian pulse shape
 *   5. Adding instrument noise (Gaussian, calibrated to SHARAD SNR)
 *   6. Applying Rayleigh speckle noise (multiplicative, single-look SAR)
 *   7. Applying ionospheric phase dispersion (Campbell et al. 2004, TEC-dependent)
 *
 * References:
 *   Seu et al. (2007), JGR 112, E05S05 — SHARAD instrument
 *   Orosei et al. (2018), Science 361, 490–493 — South pole liquid water
 *   Campbell et al. (2004), JGR 109, E07008 — Mars ionospheric effects */

import { SPEED_OF_LIGHT, SHARAD, MARSIS } from '../physics/constants';
import { fresnelReflection } from '../physics/fresnel';
import { attenuationDbPerMeter } from '../physics/attenuation';
import type {
  CryoDataset, RadargramMetadata, ScientificReference,
} from '../../types/types';

interface SyntheticLayerModel {
  permittivity: number;
  lossTangent: number;
  thicknessM: number;
  roughnessM: number;
}

interface SyntheticRegionConfig {
  name: string;
  id: string;
  instrument: 'SHARAD' | 'MARSIS';
  orbitNumber: number;
  acquisitionDate: string;
  region: string;
  description: string;
  centerLat: number;
  centerLon: number;
  numTraces: number;
  numSamples: number;
  references: ScientificReference[];
  surfaceElevationBase: number;
  surfaceElevationVariation: number;
  surfaceSlope: number;
  layers: SyntheticLayerModel[];
  noiseFloorDb: number;
  seed: number;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function gaussianNoise(rng: () => number): number {
  let u1 = rng();
  const u2 = rng();
  while (u1 === 0) u1 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function rayleighVariate(rng: () => number): number {
  const x = gaussianNoise(rng);
  const y = gaussianNoise(rng);
  return Math.sqrt(x * x + y * y);
}

function applySpeckleNoise(
  samples: Float32Array,
  rng: () => number,
  intensity: number = 0.3
): void {
  for (let i = 0; i < samples.length; i++) {
    const speckle = 1.0 + (rayleighVariate(rng) - 1.2533) * intensity;
    samples[i] *= Math.max(0, speckle);
  }
}

function applyIonosphericDispersion(
  samples: Float32Array,
  sampleInterval: number,
  frequencyHz: number,
  tecUnits: number
): void {
  if (tecUnits <= 0) return;

  const numSamples = samples.length;
  const blurred = new Float32Array(numSamples);

  const k = 8.44799e16 / (frequencyHz * frequencyHz);

  for (let i = 0; i < numSamples; i++) {
    const depthFrac = i / numSamples;
    const sigma = Math.max(0.5, k * tecUnits * depthFrac * 1e6 * sampleInterval);
    const halfW = Math.min(Math.ceil(sigma * 3), 20);

    let sum = 0;
    let wSum = 0;
    for (let j = -halfW; j <= halfW; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < numSamples) {
        const w = Math.exp(-0.5 * (j / sigma) * (j / sigma));
        sum += samples[idx] * w;
        wSum += w;
      }
    }
    blurred[i] = wSum > 0 ? sum / wSum : samples[i];
  }

  for (let i = 0; i < numSamples; i++) {
    samples[i] = blurred[i];
  }
}

function generateTrace(
  layers: SyntheticLayerModel[],
  numSamples: number,
  sampleInterval: number,
  _surfaceElevation: number,
  _spacecraftAlt: number,
  frequencyHz: number,
  noiseFloorDb: number,
  rng: () => number,
  traceVariation: number
): { samples: Float32Array; surfaceEchoIdx: number } {
  const samples = new Float32Array(numSamples);
  const surfaceEchoIdx = Math.round(numSamples * 0.12);

  const pulseWidthSamples = 3;
  const halfPulse = pulseWidthSamples * 2;

  const surfacePowerDb = 0;
  for (let k = -halfPulse; k <= halfPulse; k++) {
    const idx = surfaceEchoIdx + k;
    if (idx >= 0 && idx < numSamples) {
      const gaussWeight = Math.exp(-0.5 * (k / pulseWidthSamples) ** 2);
      samples[idx] += Math.pow(10, surfacePowerDb / 20) * gaussWeight;
    }
  }

  let cumulativeTimeS = 0;
  let cumulativeAttenuationDb = 0;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerThickness = layer.thicknessM + layer.roughnessM * gaussianNoise(rng) * traceVariation;
    const clampedThickness = Math.max(layerThickness, 1);

    const v = SPEED_OF_LIGHT / Math.sqrt(layer.permittivity);
    const layerTwoWayTime = (2 * clampedThickness) / v;
    cumulativeTimeS += layerTwoWayTime;

    const alpha = attenuationDbPerMeter(frequencyHz, layer.permittivity, layer.lossTangent);
    cumulativeAttenuationDb += 2 * alpha * clampedThickness;

    const nextEpsilon = (i + 1 < layers.length) ? layers[i + 1].permittivity : layer.permittivity * 1.5;
    const fresnel = fresnelReflection(layer.permittivity, nextEpsilon);
    const reflectionPowerDb = 10 * Math.log10(Math.max(fresnel.reflectionCoefficient, 1e-20));
    const echoPowerDb = surfacePowerDb + reflectionPowerDb - cumulativeAttenuationDb;

    const deltaSamples = cumulativeTimeS / sampleInterval;
    const echoSample = surfaceEchoIdx + Math.round(deltaSamples);

    if (echoSample >= 0 && echoSample < numSamples) {
      const roughnessSpread = Math.max(1, Math.round(layer.roughnessM / 10));
      for (let k = -halfPulse - roughnessSpread; k <= halfPulse + roughnessSpread; k++) {
        const idx = echoSample + k;
        if (idx >= 0 && idx < numSamples) {
          const gaussWeight = Math.exp(-0.5 * (k / (pulseWidthSamples + roughnessSpread * 0.3)) ** 2);
          const amplitude = Math.pow(10, echoPowerDb / 20) * gaussWeight;
          samples[idx] += amplitude;
        }
      }
    }
  }

  const noiseAmplitude = Math.pow(10, noiseFloorDb / 20);
  for (let i = 0; i < numSamples; i++) {
    samples[i] += noiseAmplitude * gaussianNoise(rng);
  }

  applySpeckleNoise(samples, rng, 0.25);
  applyIonosphericDispersion(samples, sampleInterval, frequencyHz, 0.5);

  return { samples, surfaceEchoIdx };
}

const REGION_CONFIGS: SyntheticRegionConfig[] = [
  {
    name: 'Planum Australe — South Polar Lake',
    id: 'planum-australe',
    instrument: 'MARSIS',
    orbitNumber: 10737,
    acquisitionDate: '2015-05-14',
    region: 'South Polar Region',
    description: 'Bright basal reflection beneath the South Polar Layered Deposits at ~1.5 km depth, consistent with liquid water or brine (Orosei et al. 2018). The anomalously strong subsurface return is centered at 193°E, 81°S.',
    centerLat: -81,
    centerLon: 193,
    numTraces: 800,
    numSamples: 512,
    references: [
      { authors: 'Orosei, R. et al.', year: 2018, title: 'Radar evidence of subglacial liquid water on Mars', journal: 'Science 361, 490–493', doi: '10.1126/science.aar7268' },
      { authors: 'Lauro, S.E. et al.', year: 2021, title: 'Multiple subglacial water bodies below the south pole of Mars', journal: 'Nature Astronomy 5, 63–70', doi: '10.1038/s41550-020-1200-6' },
    ],
    surfaceElevationBase: -2800,
    surfaceElevationVariation: 30,
    surfaceSlope: 0.001,
    layers: [
      { permittivity: 2.12, lossTangent: 1e-4, thicknessM: 50, roughnessM: 5 },
      { permittivity: 3.4, lossTangent: 5e-3, thicknessM: 1450, roughnessM: 30 },
      { permittivity: 60, lossTangent: 0.5, thicknessM: 20, roughnessM: 2 },
    ],
    noiseFloorDb: -40,
    seed: 20180725,
  },
  {
    name: 'Planum Boreum — North Polar Layered Deposits',
    id: 'planum-boreum',
    instrument: 'SHARAD',
    orbitNumber: 6830,
    acquisitionDate: '2008-03-22',
    region: 'North Polar Region',
    description: 'Multiple internal reflectors within the North Polar Layered Deposits revealing climate-driven ice-dust cyclicity. Layers extend to ~2 km depth.',
    centerLat: 85,
    centerLon: 0,
    numTraces: 900,
    numSamples: 480,
    references: [
      { authors: 'Phillips, R.J. et al.', year: 2008, title: 'Mars north polar deposits: Stratigraphy, age, and geodynamical response', journal: 'Science 320, 1182–1185', doi: '10.1126/science.1157546' },
    ],
    surfaceElevationBase: -4500,
    surfaceElevationVariation: 80,
    surfaceSlope: 0.002,
    layers: [
      { permittivity: 2.12, lossTangent: 1e-4, thicknessM: 100, roughnessM: 10 },
      { permittivity: 3.15, lossTangent: 1e-3, thicknessM: 400, roughnessM: 15 },
      { permittivity: 3.5, lossTangent: 3e-3, thicknessM: 600, roughnessM: 20 },
      { permittivity: 3.3, lossTangent: 2e-3, thicknessM: 500, roughnessM: 25 },
      { permittivity: 5.0, lossTangent: 7e-3, thicknessM: 300, roughnessM: 40 },
    ],
    noiseFloorDb: -45,
    seed: 20080322,
  },
  {
    name: 'Deuteronilus Mensae — Mid-Latitude Glaciers',
    id: 'deuteronilus-mensae',
    instrument: 'SHARAD',
    orbitNumber: 11845,
    acquisitionDate: '2009-01-15',
    region: 'Deuteronilus Mensae',
    description: 'Lobate debris aprons interpreted as debris-covered glaciers. SHARAD reveals ice-consistent dielectric signatures beneath thin regolith cover (Plaut et al. 2009).',
    centerLat: 44,
    centerLon: 25,
    numTraces: 700,
    numSamples: 400,
    references: [
      { authors: 'Plaut, J.J. et al.', year: 2009, title: 'Radar evidence for ice in lobate debris aprons in the mid-northern latitudes of Mars', journal: 'GRL 36, L02203', doi: '10.1029/2008GL036379' },
    ],
    surfaceElevationBase: -3200,
    surfaceElevationVariation: 200,
    surfaceSlope: 0.005,
    layers: [
      { permittivity: 5.0, lossTangent: 7e-3, thicknessM: 15, roughnessM: 5 },
      { permittivity: 3.3, lossTangent: 2e-3, thicknessM: 500, roughnessM: 40 },
      { permittivity: 7.0, lossTangent: 0.015, thicknessM: 200, roughnessM: 30 },
    ],
    noiseFloorDb: -42,
    seed: 20090115,
  },
  {
    name: 'Arcadia Planitia — Shallow Subsurface Ice',
    id: 'arcadia-planitia',
    instrument: 'SHARAD',
    orbitNumber: 29785,
    acquisitionDate: '2013-07-08',
    region: 'Arcadia Planitia',
    description: 'Subsurface interface consistent with the base of an excess ice deposit ~20–40 m thick beneath protective regolith (Bramson et al. 2015 GRL).',
    centerLat: 42,
    centerLon: 190,
    numTraces: 600,
    numSamples: 350,
    references: [
      { authors: 'Bramson, A.M. et al.', year: 2015, title: 'Widespread excess ice in Arcadia Planitia, Mars', journal: 'GRL 42, 6566–6574', doi: '10.1002/2015GL064844' },
    ],
    surfaceElevationBase: -4700,
    surfaceElevationVariation: 15,
    surfaceSlope: 0.0005,
    layers: [
      { permittivity: 4.5, lossTangent: 6e-3, thicknessM: 5, roughnessM: 1 },
      { permittivity: 3.15, lossTangent: 1e-3, thicknessM: 30, roughnessM: 5 },
      { permittivity: 6.0, lossTangent: 0.01, thicknessM: 100, roughnessM: 15 },
    ],
    noiseFloorDb: -43,
    seed: 20150101,
  },
  {
    name: 'Utopia Planitia — Mid-Latitude Ice Sheet',
    id: 'utopia-planitia',
    instrument: 'SHARAD',
    orbitNumber: 45200,
    acquisitionDate: '2016-11-22',
    region: 'Utopia Planitia',
    description: 'Massive subsurface ice deposit spanning 80–170 m depth. Volume estimated at 14,300 km³, equivalent to Lake Superior (Stuurman et al. 2016).',
    centerLat: 45,
    centerLon: 120,
    numTraces: 750,
    numSamples: 420,
    references: [
      { authors: 'Stuurman, C.M. et al.', year: 2016, title: 'SHARAD detection and characterization of subsurface water ice deposits in Utopia Planitia, Mars', journal: 'GRL 43, 9484–9491', doi: '10.1002/2016GL070138' },
    ],
    surfaceElevationBase: -4300,
    surfaceElevationVariation: 25,
    surfaceSlope: 0.001,
    layers: [
      { permittivity: 4.0, lossTangent: 5e-3, thicknessM: 10, roughnessM: 2 },
      { permittivity: 3.2, lossTangent: 1.5e-3, thicknessM: 120, roughnessM: 15 },
      { permittivity: 7.5, lossTangent: 0.02, thicknessM: 200, roughnessM: 35 },
    ],
    noiseFloorDb: -44,
    seed: 20161122,
  },
];

function generateDataset(config: SyntheticRegionConfig): CryoDataset {
  const rng = seededRandom(config.seed);
  const instrumentMap = { SHARAD, MARSIS } as const;
  const instrumentParams = instrumentMap[config.instrument];
  const sampleInterval = instrumentParams.sampleIntervalS;
  const frequencyHz = config.instrument === 'MARSIS'
    ? MARSIS.bandFrequenciesHz[1]
    : (instrumentParams as typeof SHARAD).centerFrequencyHz;

  const { numTraces, numSamples } = config;

  const latitudes = new Float64Array(numTraces);
  const longitudes = new Float64Array(numTraces);
  const surfaceElevation = new Float32Array(numTraces);
  const spacecraftAltitude = new Float32Array(numTraces);
  const surfaceEchoIndices = new Uint16Array(numTraces);
  const data = new Float32Array(numSamples * numTraces);

  const latSpan = 2.5;
  const lonSpan = 0.8;

  for (let t = 0; t < numTraces; t++) {
    const frac = t / (numTraces - 1);
    latitudes[t] = config.centerLat - latSpan / 2 + frac * latSpan;
    longitudes[t] = config.centerLon - lonSpan / 2 + frac * lonSpan + 0.1 * Math.sin(frac * Math.PI * 4) * rng();

    const slopeOffset = (frac - 0.5) * config.surfaceSlope * numTraces * 300;
    const topoNoise = config.surfaceElevationVariation * (
      0.5 * Math.sin(frac * Math.PI * 6) +
      0.3 * Math.sin(frac * Math.PI * 14) +
      0.2 * gaussianNoise(rng)
    );
    surfaceElevation[t] = config.surfaceElevationBase + slopeOffset + topoNoise;

    const altMap: Record<string, number> = { SHARAD: 300e3, MARSIS: 800e3 };
    const baseAlt = altMap[config.instrument] ?? 300e3;
    spacecraftAltitude[t] = baseAlt + 2000 * gaussianNoise(rng);

    const traceVariation = 0.7 + 0.6 * rng();
    const { samples, surfaceEchoIdx } = generateTrace(
      config.layers,
      numSamples,
      sampleInterval,
      surfaceElevation[t],
      spacecraftAltitude[t],
      frequencyHz,
      config.noiseFloorDb,
      rng,
      traceVariation
    );

    surfaceEchoIndices[t] = surfaceEchoIdx;
    for (let s = 0; s < numSamples; s++) {
      const raw = Math.abs(samples[s]);
      data[s * numTraces + t] = raw > 0 ? 20 * Math.log10(raw) : -80;
    }
  }

  let powerMin = Infinity;
  let powerMax = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < powerMin) powerMin = data[i];
    if (data[i] > powerMax) powerMax = data[i];
  }

  const metadata: RadargramMetadata = {
    instrument: config.instrument,
    orbitNumber: config.orbitNumber,
    productId: `SYNTH_${config.id.toUpperCase().replace(/-/g, '_')}`,
    acquisitionDate: config.acquisitionDate,
    region: config.region,
    description: config.description,
    centerLat: config.centerLat,
    centerLon: config.centerLon,
    references: config.references,
  };

  return {
    metadata,
    geometry: { latitudes, longitudes, surfaceElevation, spacecraftAltitude },
    radargram: {
      width: numTraces,
      height: numSamples,
      sampleInterval,
      data,
      powerMin,
      powerMax,
    },
    surfaceEcho: { indices: surfaceEchoIndices },
  };
}

export function getAvailableDatasets(): { id: string; name: string; region: string; instrument: 'SHARAD' | 'MARSIS'; description: string; centerLat: number; centerLon: number }[] {
  return REGION_CONFIGS.map(c => ({
    id: c.id,
    name: c.name,
    region: c.region,
    instrument: c.instrument,
    description: c.description,
    centerLat: c.centerLat,
    centerLon: c.centerLon,
  }));
}

export function generateDatasetById(id: string): CryoDataset {
  const config = REGION_CONFIGS.find(c => c.id === id);
  if (!config) throw new Error(`Unknown dataset: ${id}`);
  return generateDataset(config);
}

export { REGION_CONFIGS };
