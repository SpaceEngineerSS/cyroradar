/* Application state. Components read narrow slices with selectors; long jobs
 * run in workers (workers/run.ts) and report back through these actions. */

import { create } from 'zustand';
import { persist, createJSONStorage, subscribeWithSelector } from 'zustand/middleware';
import type {
  AnomalyResult, ColormapId, CRISMPixel, CryoDataset, DetectionParams, DiscoveryEntry, FWIResult,
  InteractionMode, MainView, PolSARResult, ROIBounds, SubsurfaceLayer, UQResult, ViewMode,
} from '../types/types';
import type { PDSProduct } from '../types/pds-types';
import type { DetectionSegment } from '../core/analysis/anomaly-detector';
import { DEFAULT_DETECTION, groupDetections } from '../core/analysis/anomaly-detector';
import type { MigrationOutput } from '../core/analysis/migration';
import type { FWIUpdate } from '../core/analysis/fwi/run';
import { DEFAULT_UQ, type UQSettings } from '../core/analysis/uncertainty';
import { DEFAULT_TECU } from '../core/pipeline/synthetic-generator';
import { getMaterial } from '../core/physics/dielectric';
import { runJob, JobCancelled } from '../workers/run';
import { autoContrast } from './derived';
import { device } from '../app/perf';

export type PanelId =
  | 'data' | 'view' | 'processing' | 'layers' | 'detect' | 'polarimetry'
  | 'uncertainty' | 'inversion' | 'log' | 'budget' | 'tour';

export type Theme = 'dark' | 'light';
export type Status = 'idle' | 'running' | 'done' | 'error';

export interface Overlays {
  topography: boolean;
  depthGrid: boolean;
  picks: boolean;
  detections: boolean;
  truth: boolean;
  polsar: 'off' | 'entropy' | 'alpha';
  confidence: boolean;
  inversion: boolean;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'ok';
}

export interface Job {
  key: string;
  label: string;
  progress: number | null;
  cancel?: () => void;
}

export interface RowPoint {
  trace: number;
  /** Data row (not shifted by static correction). */
  row: number;
}

interface State {
  /* Dataset */
  dataset: CryoDataset | null;
  datasetKey: string | null;
  datasetStatus: Status;
  datasetError: string | null;
  /** The PDS product behind the current dataset, kept so sessions can reload it. */
  pdsSource: { product: PDSProduct; full: boolean } | null;
  tecu: number;

  /* Display */
  colormap: ColormapId;
  contrast: [number, number];
  overlays: Overlays;
  statics: boolean;
  variant: 'raw' | 'migrated';
  compare: boolean;

  /* Processing */
  migration: { status: Status; progress: number; result: MigrationOutput | null; elapsedMs: number; error: string | null; maxAngleDeg: number; aperture: number };

  /* Tools */
  tool: InteractionMode;
  roi: ROIBounds | null;
  measure: { a: RowPoint; b: RowPoint | null } | null;
  pinnedTrace: number | null;

  /* Depth model */
  layers: SubsurfaceLayer[];
  activeLayer: number | null;
  bulkPermittivity: number;

  /* Detection */
  detection: DetectionParams;
  useCrism: boolean;
  crism: CRISMPixel[] | null;
  anomalies: AnomalyResult[];
  segments: DetectionSegment[];
  scanStatus: Status;
  selectedSegment: number | null;

  polsar: PolSARResult | null;
  polsarStatus: Status;

  uq: { status: Status; progress: number; results: UQResult[]; settings: UQSettings };
  fwi: { status: Status; progress: FWIUpdate | null; result: FWIResult | null; error: string | null; iterations: number };

  /* Log */
  log: DiscoveryEntry[];

  /* UI */
  mode: ViewMode;
  panel: PanelId;
  mainView: MainView;
  inspectorOpen: boolean;
  theme: Theme;
  tourStep: number | null;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  onboarded: boolean;
  jobs: Job[];
  toasts: Toast[];
}

interface Actions {
  loadSynthetic: (id: string, tecu?: number) => Promise<void>;
  loadPds: (product: PDSProduct, full: boolean) => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  setTecu: (v: number) => void;

  set: <K extends keyof State>(key: K, value: State[K]) => void;
  setOverlay: <K extends keyof Overlays>(key: K, value: Overlays[K]) => void;
  setContrast: (lo: number, hi: number) => void;

  runMigration: () => void;

  addLayer: (materialId: string) => void;
  updateLayer: (index: number, patch: Partial<SubsurfaceLayer>) => void;
  removeLayer: (index: number) => void;
  addPick: (p: RowPoint) => void;
  clearPicks: (index: number) => void;
  loadTruthModel: () => void;

  setDetection: (patch: Partial<DetectionParams>) => void;
  runScan: () => Promise<void>;
  selectSegment: (i: number | null) => void;
  runPolsar: () => Promise<void>;
  runUq: () => Promise<void>;
  runFwi: () => Promise<void>;

  logSegment: (i: number) => void;
  updateLogNote: (id: string, notes: string) => void;
  removeLogEntry: (id: string) => void;
  clearLog: () => void;

  notify: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  cancelJob: (key: string) => void;
}

export type AppStore = State & Actions;

const ANALYSIS_RESET: Partial<State> = {
  statics: false,
  variant: 'raw',
  compare: false,
  roi: null,
  measure: null,
  pinnedTrace: null,
  crism: null,
  anomalies: [],
  segments: [],
  scanStatus: 'idle',
  selectedSegment: null,
  polsar: null,
  polsarStatus: 'idle',
};

let toastId = 1;
const handles = new Map<string, () => void>();

export const useApp = create<AppStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        /** Starts a worker job, tracks it for the job tray, and cancels any previous job with the same key. */
        const track = <T>(key: string, label: string, start: (progress: (p: number | null) => void) => { promise: Promise<T>; cancel: () => void }) => {
          handles.get(key)?.();
          const update = (progress: number | null) =>
            set(s => ({ jobs: s.jobs.map(j => (j.key === key ? { ...j, progress } : j)) }));
          const h = start(update);
          handles.set(key, h.cancel);
          set(s => ({ jobs: [...s.jobs.filter(j => j.key !== key), { key, label, progress: null, cancel: h.cancel }] }));
          const done = () => {
            if (handles.get(key) === h.cancel) handles.delete(key);
            set(s => ({ jobs: s.jobs.filter(j => j.key !== key || j.cancel !== h.cancel) }));
          };
          h.promise.then(done, done);
          return h.promise;
        };

        const setDataset = (dataset: CryoDataset, key: string, keepModel = false) => {
          const host = suggestHost(dataset);
          set({
            ...(ANALYSIS_RESET as State),
            dataset,
            datasetKey: key,
            datasetStatus: 'done',
            ...(keepModel ? {} : { contrast: autoContrast(dataset.radargram) }),
            datasetError: null,
            migration: { ...get().migration, status: 'idle', progress: 0, result: null, error: null },
            uq: { ...get().uq, status: 'idle', progress: 0, results: [] },
            fwi: { ...get().fwi, status: 'idle', progress: null, result: null, error: null },
            ...(keepModel
              ? {}
              : { layers: [], activeLayer: null, bulkPermittivity: host.permittivity, detection: { ...get().detection, hostPermittivity: host.permittivity, hostLossTangent: host.lossTangent } }),
          });
          // CRISM context is cheap; compute it up front so scans can use it.
          const job = runJob('crism', { dataset });
          job.promise.then(crism => get().datasetKey === key && set({ crism }), () => {});
        };

        const failLoad = (err: unknown) => {
          if (err instanceof JobCancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          set({ datasetStatus: 'error', datasetError: message });
          get().notify(message, 'error');
        };

        return {
          dataset: null,
          datasetKey: null,
          datasetStatus: 'idle',
          datasetError: null,
          pdsSource: null,
          tecu: DEFAULT_TECU,

          colormap: 'grayscale',
          contrast: [0.35, 0.98],
          overlays: { topography: true, depthGrid: true, picks: true, detections: true, truth: false, polsar: 'off', confidence: true, inversion: true },
          statics: false,
          variant: 'raw',
          compare: false,

          migration: { status: 'idle', progress: 0, result: null, elapsedMs: 0, error: null, maxAngleDeg: 30, aperture: 24 },

          tool: 'pan',
          roi: null,
          measure: null,
          pinnedTrace: null,

          layers: [],
          activeLayer: null,
          bulkPermittivity: 3.15,

          detection: DEFAULT_DETECTION,
          useCrism: true,
          crism: null,
          anomalies: [],
          segments: [],
          scanStatus: 'idle',
          selectedSegment: null,

          polsar: null,
          polsarStatus: 'idle',

          uq: { status: 'idle', progress: 0, results: [], settings: DEFAULT_UQ },
          fwi: { status: 'idle', progress: null, result: null, error: null, iterations: device.fwi.iterations },

          log: [],

          mode: 'analyst',
          panel: 'data',
          mainView: 'radargram',
          inspectorOpen: true,
          theme: 'dark',
          tourStep: null,
          paletteOpen: false,
          shortcutsOpen: false,
          onboarded: false,
          jobs: [],
          toasts: [],

          /* Dataset ---------------------------------------------------------- */

          async loadSynthetic(id, tecu) {
            const t = tecu ?? get().tecu;
            const key = `synthetic:${id}`;
            const keep = get().datasetKey === key;
            set({ datasetStatus: 'running', datasetError: null, tecu: t });
            try {
              const ds = await track('dataset', 'Generating radargram', () => runJob('synthetic', { id, tecu: t }));
              setDataset(ds, key, keep);
              set({ pdsSource: null });
            } catch (err) {
              failLoad(err);
            }
          },

          async loadPds(product, full) {
            set({ datasetStatus: 'running', datasetError: null });
            try {
              const ds = await track('dataset', `Loading ${product.productId}`, progress => {
                const h = runJob('pds', { product, full }, p => progress(p.fraction));
                return h;
              });
              setDataset(ds, `pds:${product.productId}:${full ? 'img' : 'tif'}`);
              set({ pdsSource: { product, full } });
            } catch (err) {
              failLoad(err);
            }
          },

          async loadFile(file) {
            set({ datasetStatus: 'running', datasetError: null });
            try {
              const buffer = await file.arrayBuffer();
              const ds = await track('dataset', `Opening ${file.name}`, () => runJob('file', { name: file.name, buffer }));
              setDataset(ds, `file:${file.name}`);
              set({ pdsSource: null });
            } catch (err) {
              failLoad(err);
            }
          },

          setTecu(v) {
            set({ tecu: v });
            const key = get().datasetKey;
            if (key?.startsWith('synthetic:')) void get().loadSynthetic(key.slice('synthetic:'.length), v);
          },

          /* Display ---------------------------------------------------------- */

          set: (key, value) => set({ [key]: value } as Partial<State>),
          setOverlay: (key, value) => set(s => ({ overlays: { ...s.overlays, [key]: value } })),
          setContrast: (lo, hi) => set({ contrast: [Math.min(lo, hi - 0.01), Math.max(hi, lo + 0.01)] }),

          /* Processing ------------------------------------------------------- */

          runMigration() {
            const { dataset, layers, bulkPermittivity, migration } = get();
            if (!dataset) return;
            const start = performance.now();
            set({ migration: { ...migration, status: 'running', progress: 0, error: null } });
            track('migration', 'Migrating', progress =>
              runJob(
                'migrate',
                { dataset, layers: velocityLayers(layers), bulkPermittivity, maxAngleDeg: migration.maxAngleDeg, maxApertureTraces: migration.aperture },
                p => {
                  progress(p.fraction);
                  set(s => ({ migration: { ...s.migration, progress: p.fraction } }));
                },
              ),
            ).then(
              result => set(s => ({ migration: { ...s.migration, status: 'done', result, progress: 1, elapsedMs: performance.now() - start }, variant: 'migrated' })),
              err =>
                set(s => ({
                  migration: { ...s.migration, status: err instanceof JobCancelled ? 'idle' : 'error', error: err instanceof JobCancelled ? null : String(err.message ?? err) },
                })),
            );
          },

          /* Depth model ------------------------------------------------------ */

          addLayer(materialId) {
            const m = getMaterial(materialId);
            if (!m) return;
            set(s => {
              const layers = [
                ...s.layers,
                { id: `L${Date.now().toString(36)}`, materialId, permittivity: m.permittivity, lossTangent: m.lossTangent, thicknessM: 100, picks: [] },
              ];
              return { layers, activeLayer: layers.length - 1 };
            });
          },
          updateLayer: (index, patch) => set(s => ({ layers: s.layers.map((l, i) => (i === index ? { ...l, ...patch } : l)) })),
          removeLayer: index =>
            set(s => {
              const layers = s.layers.filter((_, i) => i !== index);
              const a = s.activeLayer;
              return { layers, activeLayer: a === null || a === index ? (layers.length ? Math.min(index, layers.length - 1) : null) : a > index ? a - 1 : a };
            }),
          addPick(p) {
            const { activeLayer, layers } = get();
            if (activeLayer === null || !layers[activeLayer]) {
              get().notify('Add a layer first, then pick its base on the radargram.', 'info');
              return;
            }
            set({
              layers: layers.map((l, i) =>
                i === activeLayer
                  ? { ...l, picks: [...l.picks.filter(q => q.traceIndex !== p.trace), { traceIndex: p.trace, sampleIndex: p.row }].sort((a, b) => a.traceIndex - b.traceIndex) }
                  : l,
              ),
            });
          },
          clearPicks: index => set(s => ({ layers: s.layers.map((l, i) => (i === index ? { ...l, picks: [] } : l)) })),
          loadTruthModel() {
            const truth = get().dataset?.truth;
            if (!truth) return;
            const layers: SubsurfaceLayer[] = truth.layers.slice(0, -1).map((l, i) => ({
              id: `T${i}`,
              materialId: 'custom',
              label: l.label,
              permittivity: l.permittivity,
              lossTangent: l.lossTangent,
              thicknessM: l.thicknessM,
              picks: [],
            }));
            set({ layers, activeLayer: layers.length ? 0 : null });
          },

          /* Detection -------------------------------------------------------- */

          setDetection: patch => set(s => ({ detection: { ...s.detection, ...patch } })),

          async runScan() {
            const { dataset, detection, layers, crism, useCrism } = get();
            if (!dataset) return;
            set({ scanStatus: 'running' });
            try {
              const anomalies = await track('scan', 'Scanning for bright reflections', () =>
                runJob('scan', { dataset, params: detection, layers: velocityLayers(layers), crism: useCrism ? crism : null }),
              );
              const segments = groupDetections(anomalies);
              set({ anomalies, segments, scanStatus: 'done', selectedSegment: segments.length ? 0 : null, uq: { ...get().uq, results: [], status: 'idle' } });
              setOverlayIfOff(set, get, 'detections');
            } catch (err) {
              if (err instanceof JobCancelled) {
                set({ scanStatus: 'idle' });
                return;
              }
              set({ scanStatus: 'error' });
              get().notify(err instanceof Error ? err.message : String(err), 'error');
            }
          },
          selectSegment: i => set({ selectedSegment: i }),

          async runPolsar() {
            const { dataset } = get();
            if (!dataset) return;
            set({ polsarStatus: 'running' });
            try {
              const polsar = await track('polsar', 'Simulating polarimetry', () => runJob('polsar', { dataset }));
              set({ polsar, polsarStatus: 'done' });
            } catch (err) {
              set({ polsarStatus: err instanceof JobCancelled ? 'idle' : 'error' });
            }
          },

          async runUq() {
            const { dataset, segments, anomalies, detection, uq } = get();
            if (!dataset || segments.length === 0) return;
            const reps = segments.map(s => anomalies[s.representative]);
            set({ uq: { ...uq, status: 'running', progress: 0 } });
            try {
              const results = await track('uq', 'Monte Carlo uncertainty', progress =>
                runJob(
                  'uq',
                  { anomalies: reps, params: detection, frequencyHz: dataset.metadata.frequencyHz, sampleInterval: dataset.radargram.sampleInterval, settings: uq.settings },
                  p => {
                    progress(p.fraction);
                    set(s => ({ uq: { ...s.uq, progress: p.fraction } }));
                  },
                ),
              );
              set(s => ({ uq: { ...s.uq, status: 'done', progress: 1, results } }));
            } catch (err) {
              set(s => ({ uq: { ...s.uq, status: err instanceof JobCancelled ? 'idle' : 'error' } }));
            }
          },

          async runFwi() {
            const { dataset, roi, detection, fwi } = get();
            if (!dataset || !roi) return;
            set({ fwi: { ...fwi, status: 'running', progress: null, error: null } });
            try {
              const result = await track('fwi', 'Waveform inversion', progress =>
                runJob(
                  'fwi',
                  {
                    dataset,
                    roi,
                    settings: {
                      iterations: fwi.iterations,
                      hostPermittivity: detection.hostPermittivity,
                      hostLossTangent: detection.hostLossTangent,
                      preferGpu: device.hasWebGPU,
                      gpuMax: device.fwi.gpu,
                      cpuMax: device.fwi.cpu,
                    },
                  },
                  u => {
                    progress(u.iteration / Math.max(1, fwi.iterations));
                    set(s => ({ fwi: { ...s.fwi, progress: u } }));
                  },
                ),
              );
              set(s => ({ fwi: { ...s.fwi, status: 'done', result } }));
              setOverlayIfOff(set, get, 'inversion');
            } catch (err) {
              if (err instanceof JobCancelled) {
                set(s => ({ fwi: { ...s.fwi, status: 'idle' } }));
                return;
              }
              set(s => ({ fwi: { ...s.fwi, status: 'error', error: err instanceof Error ? err.message : String(err) } }));
            }
          },

          /* Log -------------------------------------------------------------- */

          logSegment(i) {
            const { segments, anomalies, dataset, datasetKey, log } = get();
            const seg = segments[i];
            if (!seg || !dataset) return;
            const a = anomalies[seg.representative];
            const id = `${datasetKey}:${a.traceIndex}:${a.sampleIndex}`;
            if (log.some(e => e.id === id)) {
              get().notify('Already in the log.', 'info');
              return;
            }
            const entry: DiscoveryEntry = {
              id,
              timestamp: Date.now(),
              datasetId: datasetKey ?? '',
              region: dataset.metadata.title,
              traceIndex: a.traceIndex,
              depthM: a.depthM,
              latitude: a.latitude,
              longitude: a.longitude,
              apparentPermittivity: a.apparentPermittivity,
              basalReflectivityDb: a.basalReflectivityDb,
              classification: a.classification,
              confidence: a.confidence,
              pLiquidWater: seg.hypothesis.pLiquidWater,
              pSmectiteClay: seg.hypothesis.pSmectiteClay,
              pClutter: seg.hypothesis.pClutter,
              notes: `Traces ${seg.traceStart}–${seg.traceEnd}, ${seg.count} detections.`,
            };
            set({ log: [entry, ...log] });
            get().notify('Added to the log.', 'ok');
          },
          updateLogNote: (id, notes) => set(s => ({ log: s.log.map(e => (e.id === id ? { ...e, notes } : e)) })),
          removeLogEntry: id => set(s => ({ log: s.log.filter(e => e.id !== id) })),
          clearLog: () => set({ log: [] }),

          /* Feedback --------------------------------------------------------- */

          notify(text, tone = 'info') {
            const id = toastId++;
            set(s => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
            setTimeout(() => get().dismissToast(id), tone === 'error' ? 8000 : 3500);
          },
          dismissToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
          cancelJob: key => handles.get(key)?.(),
        };
      },
      {
        name: 'cryoradar',
        version: 2,
        storage: createJSONStorage(() => localStorage),
        partialize: s => ({ log: s.log, theme: s.theme, mode: s.mode, colormap: s.colormap, onboarded: s.onboarded }),
        // v1 stored discoveries under a different key and shape; start fresh.
        migrate: () => ({}),
      },
    ),
  ),
);

function setOverlayIfOff(set: (p: Partial<AppStore> | ((s: AppStore) => Partial<AppStore>)) => void, get: () => AppStore, key: 'detections' | 'inversion') {
  if (!get().overlays[key]) set(s => ({ overlays: { ...s.overlays, [key]: true } }));
}

/** The user's layers as a velocity model. */
export function velocityLayers(layers: readonly SubsurfaceLayer[]) {
  return layers.map(l => ({ permittivity: l.permittivity, thicknessM: l.thicknessM }));
}

/** Overburden properties to start detection with: the thickest layer of the scene model, or clean ice. */
function suggestHost(dataset: CryoDataset): { permittivity: number; lossTangent: number } {
  const t = dataset.truth;
  if (!t) return { permittivity: 3.15, lossTangent: 2e-3 };
  const finite = t.layers.slice(0, -1);
  let thick = 0;
  let eps = 0;
  let tan = 0;
  for (const l of finite) {
    thick += l.thicknessM;
    eps += l.permittivity * l.thicknessM;
    tan += l.lossTangent * l.thicknessM;
  }
  if (!(thick > 0)) return { permittivity: 3.15, lossTangent: 2e-3 };
  return { permittivity: Math.round((eps / thick) * 100) / 100, lossTangent: Number((tan / thick).toPrecision(2)) };
}
