/* CRYORADAR Type Definitions (Production)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Production: Mars-focused architecture with PolSAR, Monte Carlo UQ,
 * FWI, and volumetric rendering for Martian subsurface exploration. */

/* ── Dielectric & Material ──────────────────────────────── */

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

export interface SubsurfaceLayer {
  id: string;
  materialId: string;
  thickness: number;
  topSample: number;
  bottomSample: number;
  picks: LayerPick[];
}

export interface LayerPick {
  traceIndex: number;
  sampleIndex: number;
}

/* ── Radar Metadata ─────────────────────────────────────── */

export interface RadargramMetadata {
  instrument: 'SHARAD' | 'MARSIS';
  orbitNumber: number;
  productId: string;
  acquisitionDate: string;
  region: string;
  description: string;
  centerLat: number;
  centerLon: number;
  references: ScientificReference[];
}

export interface ScientificReference {
  authors: string;
  year: number;
  title: string;
  journal: string;
  doi?: string;
}

/* ── Radar Data ─────────────────────────────────────────── */

export interface GeometryData {
  latitudes: Float64Array;
  longitudes: Float64Array;
  surfaceElevation: Float32Array;
  spacecraftAltitude: Float32Array;
}

export interface RadargramData {
  width: number;
  height: number;
  sampleInterval: number;
  data: Float32Array;
  powerMin: number;
  powerMax: number;
}

export interface SurfaceEchoData {
  indices: Uint16Array;
}

export interface CryoDataset {
  metadata: RadargramMetadata;
  geometry: GeometryData;
  radargram: RadargramData;
  surfaceEcho: SurfaceEchoData;
}

export interface DatasetSummary {
  id: string;
  name: string;
  region: string;
  instrument: 'SHARAD' | 'MARSIS';
  description: string;
  centerLat: number;
  centerLon: number;
  thumbnail?: string;
}

/* ── Interaction ────────────────────────────────────────── */

export type InteractionMode = 'pan' | 'pick' | 'measure' | 'roi-select';
export type ColormapId = 'grayscale' | 'plasma' | 'inferno' | 'viridis' | 'radar' | 'seismic' | 'gpr';
export type ViewMode = 'explorer' | 'analyst';

/* ── Anomaly Detection ──────────────────────────────────── */

export type AnomalyClass =
  | 'geological-interface'
  | 'ice-deposit'
  | 'wet-sediment'
  | 'liquid-water';

export interface HypothesisMatrix {
  pLiquidWater: number;
  pSmectiteClay: number;
  pClutter: number;
  dominantHypothesis: 'liquid-water' | 'smectite-clay' | 'clutter';
}

export interface CRISMPixel {
  clayIndex: number;
  hydrationIndex: number;
  mineralClass: 'none' | 'phyllosilicate' | 'sulfate' | 'hydrated-silica';
}

export interface AnomalyResult {
  traceIndex: number;
  sampleIndex: number;
  surfacePower: number;
  basalPower: number;
  powerRatio: number;
  apparentPermittivity: number;
  classification: AnomalyClass;
  depthM: number;
  latitude: number;
  longitude: number;
  confidence: number;
  clutterWarning: boolean;
  surfaceSlopeDeg: number;
  hypothesis: HypothesisMatrix;
}

/* ── PolSAR (Polarimetric SAR) ──────────────────────────── */

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

export interface PolSARPixel {
  stokes: StokesVector;
  pauli: PauliComponents;
  cloudePottier: CloudePottierParams;
}

export interface PolSARResult {
  width: number;
  height: number;
  pixels: PolSARPixel[];
}

/* ── Uncertainty Quantification ─────────────────────────── */

export interface UQPixel {
  meanDepthM: number;
  stdDevM: number;
  coefficientOfVariation: number;
  confidenceLevel: 'high' | 'moderate' | 'low';
}

export interface UQResult {
  anomalyIndex: number;
  meanDepthM: number;
  stdDevM: number;
  percentile5: number;
  percentile95: number;
  nSamples: number;
}

/* ── FWI (Full Waveform Inversion) ──────────────────────── */

export interface ROIBounds {
  traceStart: number;
  traceEnd: number;
  sampleStart: number;
  sampleEnd: number;
}

export interface FWIResult {
  roi: ROIBounds;
  invertedPermittivity: Float32Array;
  residualNorm: number;
  iterations: number;
  elapsedMs: number;
}

/* ── Volumetric Data ────────────────────────────────────── */

export interface VolumeData {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  voxels: Float32Array;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number; maxDepthM: number };
}

/* ── Discovery & Log ────────────────────────────────────── */

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
  classification: AnomalyClass;
  confidence: number;
  notes: string;
}

export interface ViewportState {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

/* ── Physics Results ────────────────────────────────────── */

export interface FresnelResult {
  reflectionCoefficient: number;
  reflectionDb: number;
  transmissionCoefficient: number;
}

export interface DepthResult {
  depthMeters: number;
  travelTimeUs: number;
  velocityMps: number;
}

export interface AttenuationResult {
  alphaDbPerMeter: number;
  totalLossDb: number;
  twoWayLossDb: number;
}

export interface LayerAnalysis {
  layerIndex: number;
  material: DielectricMaterial;
  thickness: number;
  depthToTop: number;
  depthToBottom: number;
  fresnel: FresnelResult;
  attenuation: AttenuationResult;
}

/* ── PDS Track Search ───────────────────────────────────── */

export interface PDSTrackResult {
  productId: string;
  instrument: 'SHARAD' | 'MARSIS';
  orbitNumber: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  acquisitionDate: string;
  dataUrl: string;
}

/* ── Application State ──────────────────────────────────── */

export interface AppState {
  dataset: CryoDataset | null;
  datasetId: string | null;
  loading: boolean;
  viewport: ViewportState;
  mode: InteractionMode;
  viewMode: ViewMode;
  colormap: ColormapId;
  contrastMin: number;
  contrastMax: number;
  layers: SubsurfaceLayer[];
  activeLayerIndex: number | null;
  showMolaTopo: boolean;
  showDepthGrid: boolean;
  showLayerPicks: boolean;
  showClutter: boolean;
  show3D: boolean;
  showAnomalyOverlay: boolean;
  operatingFrequencyMhz: number;
  anomalies: AnomalyResult[];
  discoveries: DiscoveryEntry[];
  showMigration: boolean;
  migratedData: Float32Array | null;
  migrationRunning: boolean;
  migrationElapsedMs: number;
  crismData: CRISMPixel[] | null;
  showStaticCorrection: boolean;
  correctedData: Float32Array | null;
  tecUnits: number;
  polsarData: PolSARResult | null;
  showPolSAR: boolean;
  uqResults: UQResult[];
  showConfidenceMap: boolean;
  fwiResult: FWIResult | null;
  fwiRunning: boolean;
  roiSelection: ROIBounds | null;
  volumeData: VolumeData | null;
  showVolume: boolean;
}

export type AppAction =
  | { type: 'SET_DATASET'; dataset: CryoDataset; id: string }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_VIEWPORT'; viewport: ViewportState }
  | { type: 'SET_MODE'; mode: InteractionMode }
  | { type: 'SET_VIEW_MODE'; viewMode: ViewMode }
  | { type: 'SET_COLORMAP'; colormap: ColormapId }
  | { type: 'SET_CONTRAST'; min: number; max: number }
  | { type: 'ADD_LAYER'; layer: SubsurfaceLayer }
  | { type: 'UPDATE_LAYER'; index: number; layer: Partial<SubsurfaceLayer> }
  | { type: 'REMOVE_LAYER'; index: number }
  | { type: 'SET_ACTIVE_LAYER'; index: number | null }
  | { type: 'ADD_PICK'; layerIndex: number; pick: LayerPick }
  | { type: 'TOGGLE_MOLA' }
  | { type: 'TOGGLE_DEPTH_GRID' }
  | { type: 'TOGGLE_LAYER_PICKS' }
  | { type: 'TOGGLE_CLUTTER' }
  | { type: 'TOGGLE_3D' }
  | { type: 'TOGGLE_ANOMALY_OVERLAY' }
  | { type: 'SET_FREQUENCY'; mhz: number }
  | { type: 'SET_ANOMALIES'; anomalies: AnomalyResult[] }
  | { type: 'ADD_DISCOVERY'; discovery: DiscoveryEntry }
  | { type: 'CLEAR_DISCOVERIES' }
  | { type: 'TOGGLE_MIGRATION' }
  | { type: 'SET_MIGRATED_DATA'; data: Float32Array; elapsedMs: number }
  | { type: 'SET_MIGRATION_RUNNING'; running: boolean }
  | { type: 'SET_CRISM_DATA'; data: CRISMPixel[] }
  | { type: 'TOGGLE_STATIC_CORRECTION' }
  | { type: 'SET_CORRECTED_DATA'; data: Float32Array }
  | { type: 'SET_TEC'; tec: number }
  | { type: 'SET_POLSAR_DATA'; data: PolSARResult }
  | { type: 'TOGGLE_POLSAR' }
  | { type: 'SET_UQ_RESULTS'; results: UQResult[] }
  | { type: 'TOGGLE_CONFIDENCE_MAP' }
  | { type: 'SET_FWI_RESULT'; result: FWIResult }
  | { type: 'SET_FWI_RUNNING'; running: boolean }
  | { type: 'SET_ROI_SELECTION'; roi: ROIBounds | null }
  | { type: 'SET_VOLUME_DATA'; data: VolumeData }
  | { type: 'TOGGLE_VOLUME' };
