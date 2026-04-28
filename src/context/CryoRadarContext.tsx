/* eslint-disable react-refresh/only-export-components */
/* CRYORADAR — Application State Context (Production)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Production: Mars-focused state with PolSAR, UQ, FWI, volumetric rendering. */

import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { AppState, AppAction, SubsurfaceLayer, LayerPick, CRISMPixel } from '../types/types';

const initialState: AppState = {
  dataset: null,
  datasetId: null,
  loading: false,
  viewport: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
  mode: 'pan',
  viewMode: 'analyst',
  colormap: 'radar',
  contrastMin: 0.15,
  contrastMax: 0.85,
  layers: [],
  activeLayerIndex: null,
  showMolaTopo: true,
  showDepthGrid: true,
  showLayerPicks: true,
  showClutter: false,
  show3D: false,
  showAnomalyOverlay: false,
  operatingFrequencyMhz: 20,
  anomalies: [],
  discoveries: [],
  showMigration: false,
  migratedData: null,
  migrationRunning: false,
  migrationElapsedMs: 0,
  crismData: null,
  showStaticCorrection: false,
  correctedData: null,
  tecUnits: 0.5,
  polsarData: null,
  showPolSAR: false,
  uqResults: [],
  showConfidenceMap: false,
  fwiResult: null,
  fwiRunning: false,
  roiSelection: null,
  volumeData: null,
  showVolume: false,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_DATASET':
      return {
        ...state,
        dataset: action.dataset,
        datasetId: action.id,
        layers: [],
        activeLayerIndex: null,
        anomalies: [],
        showAnomalyOverlay: false,
        showMigration: false,
        migratedData: null,
        migrationRunning: false,
        migrationElapsedMs: 0,
        crismData: null,
        correctedData: null,
        showStaticCorrection: false,
        polsarData: null,
        showPolSAR: false,
        uqResults: [],
        showConfidenceMap: false,
        fwiResult: null,
        fwiRunning: false,
        roiSelection: null,
        volumeData: null,
        showVolume: false,
        loading: false,
      };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_VIEWPORT':
      return { ...state, viewport: action.viewport };
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.viewMode };
    case 'SET_COLORMAP':
      return { ...state, colormap: action.colormap };
    case 'SET_CONTRAST':
      return { ...state, contrastMin: action.min, contrastMax: action.max };
    case 'ADD_LAYER': {
      const layers = [...state.layers, action.layer];
      return { ...state, layers, activeLayerIndex: layers.length - 1 };
    }
    case 'UPDATE_LAYER': {
      const layers = state.layers.map((l: SubsurfaceLayer, i: number) =>
        i === action.index ? { ...l, ...action.layer } : l
      );
      return { ...state, layers };
    }
    case 'REMOVE_LAYER': {
      const layers = state.layers.filter((_: SubsurfaceLayer, i: number) => i !== action.index);
      const activeLayerIndex = state.activeLayerIndex === action.index ? null
        : state.activeLayerIndex !== null && state.activeLayerIndex > action.index
          ? state.activeLayerIndex - 1 : state.activeLayerIndex;
      return { ...state, layers, activeLayerIndex };
    }
    case 'SET_ACTIVE_LAYER':
      return { ...state, activeLayerIndex: action.index };
    case 'ADD_PICK': {
      const layers = state.layers.map((l: SubsurfaceLayer, i: number) =>
        i === action.layerIndex ? { ...l, picks: [...l.picks, action.pick] as LayerPick[] } : l
      );
      return { ...state, layers };
    }
    case 'TOGGLE_MOLA':
      return { ...state, showMolaTopo: !state.showMolaTopo };
    case 'TOGGLE_DEPTH_GRID':
      return { ...state, showDepthGrid: !state.showDepthGrid };
    case 'TOGGLE_LAYER_PICKS':
      return { ...state, showLayerPicks: !state.showLayerPicks };
    case 'TOGGLE_CLUTTER':
      return { ...state, showClutter: !state.showClutter };
    case 'TOGGLE_3D':
      return { ...state, show3D: !state.show3D };
    case 'TOGGLE_ANOMALY_OVERLAY':
      return { ...state, showAnomalyOverlay: !state.showAnomalyOverlay };
    case 'SET_FREQUENCY':
      return { ...state, operatingFrequencyMhz: action.mhz };
    case 'SET_ANOMALIES':
      return { ...state, anomalies: action.anomalies, showAnomalyOverlay: true };
    case 'ADD_DISCOVERY':
      return { ...state, discoveries: [action.discovery, ...state.discoveries] };
    case 'CLEAR_DISCOVERIES':
      return { ...state, discoveries: [] };
    case 'TOGGLE_MIGRATION':
      return { ...state, showMigration: !state.showMigration };
    case 'SET_MIGRATED_DATA':
      return { ...state, migratedData: action.data, migrationElapsedMs: action.elapsedMs, migrationRunning: false };
    case 'SET_MIGRATION_RUNNING':
      return { ...state, migrationRunning: action.running };
    case 'SET_CRISM_DATA':
      return { ...state, crismData: action.data as CRISMPixel[] };
    case 'TOGGLE_STATIC_CORRECTION':
      return { ...state, showStaticCorrection: !state.showStaticCorrection };
    case 'SET_CORRECTED_DATA':
      return { ...state, correctedData: action.data };
    case 'SET_TEC':
      return { ...state, tecUnits: action.tec };
    case 'SET_POLSAR_DATA':
      return { ...state, polsarData: action.data };
    case 'TOGGLE_POLSAR':
      return { ...state, showPolSAR: !state.showPolSAR };
    case 'SET_UQ_RESULTS':
      return { ...state, uqResults: action.results };
    case 'TOGGLE_CONFIDENCE_MAP':
      return { ...state, showConfidenceMap: !state.showConfidenceMap };
    case 'SET_FWI_RESULT':
      return { ...state, fwiResult: action.result, fwiRunning: false };
    case 'SET_FWI_RUNNING':
      return { ...state, fwiRunning: action.running };
    case 'SET_ROI_SELECTION':
      return { ...state, roiSelection: action.roi };
    case 'SET_VOLUME_DATA':
      return { ...state, volumeData: action.data };
    case 'TOGGLE_VOLUME':
      return { ...state, showVolume: !state.showVolume };
    default:
      return state;
  }
}

const StateCtx = createContext<AppState>(initialState);
const DispatchCtx = createContext<React.Dispatch<AppAction>>(() => {});

export function CryoRadarProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        {children}
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useCryoState(): AppState {
  return useContext(StateCtx);
}

export function useCryoDispatch(): React.Dispatch<AppAction> {
  return useContext(DispatchCtx);
}
