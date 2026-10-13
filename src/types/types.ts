/* Shared domain types. */

import type { InstrumentId } from '../core/physics/constants';

export type { InstrumentId };

/* Materials ---------------------------------------------------------------- */

export interface DielectricMaterial {
  id: string;
  name: string;
  nameShort: string;
  permittivity: number;
  permittivityRange?: [number, number];
  lossTangent: number;
  lossTangentRange?: [number, number];
  color: string;
  reference: string;
}

/** One layer of the user's depth model, ordered from the surface down. */
export interface SubsurfaceLayer {
  id: string;
  materialId: string;
  /** Overrides the material name, e.g. for layers copied from a scene model. */
  label?: string;
  permittivity: number;
  lossTangent: number;
  thicknessM: number;
  /** Picked base horizon of this layer. */
  picks: LayerPick[];
}

export interface LayerPick {
  traceIndex: number;
  sampleIndex: number;
}

/* Datasets ----------------------------------------------------------------- */

export interface ScientificReference {
  authors: string;
  year: number;
  title: string;
  journal: string;
  doi?: string;
}

export type DatasetSource = 'synthetic' | 'pds' | 'file';

export interface RadargramMetadata {
  instrument: InstrumentId;
  source: DatasetSource;
  orbitNumber: number;
  productId: string;
  acquisitionDate: string;
  region: string;
  title: string;
  description: string;
  centerLat: number;
  centerLon: number;
  frequencyHz: number;
  references: ScientificReference[];
  /** How far the power values can be trusted, shown next to every derived number. */
  calibration: 'model' | 'relative' | 'display';
}

export interface GeometryData {
  latitudes: Float64Array;
  longitudes: Float64Array;
  /** Surface elevation relative to the reference, metres. */
  surfaceElevation: Float32Array;
  spacecraftAltitude: Float32Array;
}

export interface RadargramData {
  width: number;
  height: number;
  /** Round-trip delay between samples, seconds. */
  sampleInterval: number;
  traceSpacingM: number;
  /** Echo power in dB, row-major (sample * width + trace). */
  data: Float32Array;
  powerMin: number;
  powerMax: number;
}

export interface SurfaceEchoData {
  indices: Uint16Array;
}

/** Layer model the synthetic generator used; drives the guided tour. */
export interface GroundTruth {
  layers: {
    label: string;
    permittivity: number;
    lossTangent: number;
    thicknessM: number;
  }[];
  /** For each interface below the surface, the sample index per trace. */
  interfaces: Uint16Array[];
  /** Trace range of the bright target, if the scene has one. */
  target?: { traceStart: number; traceEnd: number; label: string };
}

export interface CryoDataset {
  metadata: RadargramMetadata;
  geometry: GeometryData;
  radargram: RadargramData;
  surfaceEcho: SurfaceEchoData;
  truth?: GroundTruth;
}

/* Interaction -------------------------------------------------------------- */

export type InteractionMode = 'pan' | 'pick' | 'measure' | 'roi';
export type ColormapId = 'grayscale' | 'ember' | 'ice' | 'viridis' | 'magma' | 'diverging';
export type ViewMode = 'explorer' | 'analyst';
export type MainView = 'radargram' | 'ascope' | 'map' | 'scene';

export interface ViewportState {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

/* Detection ---------------------------------------------------------------- */

export type AnomalyClass = 'dry-contact' | 'hydrated' | 'wet-sediment' | 'liquid-water';

export interface HypothesisMatrix {
  pLiquidWater: number;
  pSmectiteClay: number;
  pClutter: number;
  dominantHypothesis: 'liquid-water' | 'smectite-clay' | 'clutter';
}

export interface DetectionParams {
  /** Minimum estimated basal reflectivity, dB. */
  thresholdDb: number;
  /** Overburden permittivity and loss tangent used for the correction. */
  hostPermittivity: number;
  hostLossTangent: number;
  /** Ignore echoes shallower than this, metres below the surface. */
  minDepthM: number;
  /** Drop runs of detections shorter than this many traces. */
  minRun: number;
}

export interface AnomalyResult {
  traceIndex: number;
  sampleIndex: number;
  surfacePowerDb: number;
  basalPowerDb: number;
  /** Basal minus surface echo, dB. */
  relativePowerDb: number;
  /** Basal reflectivity after surface and loss correction, dB. */
  basalReflectivityDb: number;
  apparentPermittivity: number;
  classification: AnomalyClass;
  depthM: number;
  latitude: number;
  longitude: number;
  snrDb: number;
  confidence: number;
  clutterWarning: boolean;
  surfaceSlopeDeg: number;
  hypothesis: HypothesisMatrix;
}

/* Context mineralogy (simulated) -------------------------------------------- */

export type MineralClass = 'none' | 'phyllosilicate' | 'sulfate' | 'hydrated-silica';

export interface CRISMPixel {
  clayIndex: number;
  hydrationIndex: number;
  mineralClass: MineralClass;
}

/* Polarimetry (simulated) --------------------------------------------------- */

export interface StokesVector {
  s0: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface PauliComponents {
  surface: number;
  dihedral: number;
  volume: number;
  totalPower: number;
}

export interface CloudePottierParams {
  entropy: number;
  meanAlpha: number;
  anisotropy: number;
}

/** Channel images on a (possibly decimated) grid. */
export interface PolSARResult {
  width: number;
  height: number;
  /** Decimation factors relative to the radargram. */
  stepX: number;
  stepY: number;
  entropy: Float32Array;
  alpha: Float32Array;
  anisotropy: Float32Array;
  surface: Float32Array;
  dihedral: Float32Array;
  volume: Float32Array;
  stats: {
    meanEntropy: number;
    meanAlphaDeg: number;
    meanAnisotropy: number;
    fractions: { surface: number; dihedral: number; volume: number };
  };
}

/* Uncertainty -------------------------------------------------------------- */

export interface UQResult {
  anomalyIndex: number;
  meanDepthM: number;
  stdDevM: number;
  percentile5: number;
  percentile95: number;
  meanBasalPermittivity: number;
  basalPermittivity5: number;
  basalPermittivity95: number;
  /** Fraction of samples with basal ε ≥ 40. */
  pWet: number;
  nSamples: number;
}

/* Inversion ---------------------------------------------------------------- */

export interface ROIBounds {
  traceStart: number;
  traceEnd: number;
  sampleStart: number;
  sampleEnd: number;
}

export interface FWIResult {
  roi: ROIBounds;
  /** Inverted permittivity on the coarse grid (nx × nz), row-major. */
  permittivity: Float32Array;
  nx: number;
  nz: number;
  misfitHistory: number[];
  iterations: number;
  elapsedMs: number;
  backend: 'webgpu' | 'cpu';
}

/* Log ---------------------------------------------------------------------- */

export interface DiscoveryEntry {
  id: string;
  timestamp: number;
  datasetId: string;
  region: string;
  traceIndex: number;
  depthM: number;
  latitude: number;
  longitude: number;
  apparentPermittivity: number;
  basalReflectivityDb: number;
  classification: AnomalyClass;
  confidence: number;
  pLiquidWater: number;
  pSmectiteClay: number;
  pClutter: number;
  notes: string;
}
