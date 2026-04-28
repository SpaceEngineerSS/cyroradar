/* CRYORADAR — Main Application Shell (Production)
 * Chief Scientist & Architect: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Production: Mars Subsurface Explorer with PolSAR, UQ, FWI.
 * Dual-mode architecture: Explorer (educational) and Analyst (research).
 * Mission-control UI with Tailwind CSS + glassmorphism. */

import { useState, Suspense, lazy } from 'react';
import { CryoRadarProvider, useCryoState } from './context/CryoRadarContext';
import { Toolbar } from './components/Toolbar/Toolbar';
import { RadargramViewer } from './components/RadargramViewer/RadargramViewer';
import { DatasetBrowser } from './components/DatasetBrowser/DatasetBrowser';
import { DielectricPanel } from './components/DielectricPanel/DielectricPanel';
import { InfoPanel } from './components/InfoPanel/InfoPanel';
import { AScope } from './components/AScope/AScope';
import { MarsTrackMap } from './components/MarsTrackMap/MarsTrackMap';
import { ScientificNotebook } from './components/ScientificNotebook/ScientificNotebook';
import { DiscoveryPanel } from './components/DiscoveryPanel/DiscoveryPanel';
import { DiscoveryLog } from './components/DiscoveryLog/DiscoveryLog';
import { AboutDeveloper } from './components/AboutDeveloper/AboutDeveloper';
import { HypothesisPanel } from './components/HypothesisPanel/HypothesisPanel';
import { CRISMPanel } from './components/CRISMPanel/CRISMPanel';
import { PolSARPanel } from './components/PolSARPanel/PolSARPanel';
import { UQPanel } from './components/UQPanel/UQPanel';
import { FWIPanel } from './components/FWIPanel/FWIPanel';
import './App.css';

const ThreeViewer = lazy(() => import('./components/ThreeViewer/ThreeViewer'));

type SidebarTab = 'datasets' | 'layers' | 'science' | 'discovery' | 'log' | 'info' | 'about' | 'hypothesis' | 'crism' | 'polsar' | 'uq' | 'fwi';
type MainView = 'radargram' | 'ascope' | 'map' | '3d';

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-space-700" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-neon-cyan animate-spin" />
      </div>
      <span className="text-sm font-mono text-gray-500">Initializing module…</span>
    </div>
  );
}

function LoadingOverlay() {
  const { loading } = useCryoState();
  if (!loading) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-4 bg-space-950/80 backdrop-blur-sm">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-space-700" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-neon-cyan animate-spin" />
        <div className="absolute inset-1 rounded-full border-2 border-transparent border-b-neon-orange animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }} />
      </div>
      <span className="text-sm text-gray-400 font-mono">Processing radar data…</span>
    </div>
  );
}

function StatusBar() {
  const { dataset, mode, viewMode, colormap, anomalies } = useCryoState();
  if (!dataset) return null;

  const { metadata, geometry, radargram } = dataset;
  const midTrace = Math.floor(radargram.width / 2);

  return (
    <div className="flex items-center gap-4 px-3 py-1 bg-space-900 border-t border-space-700 text-[10px] font-mono text-gray-500 shrink-0 overflow-x-auto">
      <StatusItem label="Body" value="🔴 Mars" />
      <StatusItem label="Mode" value={viewMode === 'explorer' ? '🔭 Explorer' : '🔬 Analyst'} />
      <StatusItem label="Instrument" value={`${metadata.instrument}${metadata.orbitNumber > 0 ? ` • Orbit ${metadata.orbitNumber}` : ''}`} />
      <StatusItem label="Center" value={`${geometry.latitudes[midTrace]?.toFixed(2)}°N, ${geometry.longitudes[midTrace]?.toFixed(2)}°E`} />
      <StatusItem label="Size" value={`${radargram.width}×${radargram.height}`} />
      <StatusItem label="Tool" value={mode} />
      <StatusItem label="Colormap" value={colormap} />
      {anomalies.length > 0 && (
        <StatusItem label="Anomalies" value={`${anomalies.length} detected`} highlight />
      )}
    </div>
  );
}

function StatusItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span className={`font-semibold ${highlight ? 'text-neon-orange' : 'text-neon-cyan/70'}`}>{label}</span>
      <span className={highlight ? 'text-neon-orange/80' : ''}>{value}</span>
    </span>
  );
}

const EXPLORER_TABS: { id: SidebarTab; icon: string; label: string }[] = [
  { id: 'datasets', icon: '🔭', label: 'Explore' },
  { id: 'discovery', icon: '🎯', label: 'Discover' },
  { id: 'about', icon: '👨‍🚀', label: 'About' },
];

const ANALYST_TABS: { id: SidebarTab; icon: string; label: string }[] = [
  { id: 'datasets', icon: '📡', label: 'Data' },
  { id: 'layers', icon: '🧊', label: 'Layers' },
  { id: 'science', icon: '🧮', label: 'Science' },
  { id: 'discovery', icon: '🎯', label: 'Detect' },
  { id: 'hypothesis', icon: '🔬', label: 'Bayes' },
  { id: 'polsar', icon: '📡', label: 'PolSAR' },
  { id: 'uq', icon: '📊', label: 'UQ' },
  { id: 'crism', icon: '🌈', label: 'CRISM' },
  { id: 'fwi', icon: '🌊', label: 'Tomography' },
  { id: 'log', icon: '📋', label: 'Log' },
  { id: 'info', icon: 'ℹ️', label: 'Info' },
];

function SidebarContent({ tab }: { tab: SidebarTab }) {
  switch (tab) {
    case 'datasets': return <DatasetBrowser />;
    case 'layers': return <DielectricPanel />;
    case 'science': return <ScientificNotebook />;
    case 'discovery': return <DiscoveryPanel />;
    case 'hypothesis': return <HypothesisPanel />;
    case 'polsar': return <PolSARPanel />;
    case 'uq': return <UQPanel />;
    case 'crism': return <CRISMPanel />;
    case 'fwi': return <FWIPanel />;
    case 'log': return <DiscoveryLog />;
    case 'info': return <InfoPanel />;
    case 'about': return <AboutDeveloper />;
  }
}

function AppLayout() {
  const { viewMode } = useCryoState();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('datasets');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mainView, setMainView] = useState<MainView>('radargram');

  const tabs = viewMode === 'explorer' ? EXPLORER_TABS : ANALYST_TABS;
  const validTab = tabs.find(t => t.id === sidebarTab) ? sidebarTab : tabs[0].id;
  if (validTab !== sidebarTab) setSidebarTab(validTab);

  return (
    <div className="flex flex-col h-full w-full relative bg-space-950">
      <Toolbar />

      <div className="flex flex-1 overflow-hidden relative">
        {sidebarOpen && (
          <aside className="w-[320px] shrink-0 flex flex-col bg-space-900/75 backdrop-blur-xl border-r border-space-700 overflow-hidden animate-[cr-slideInLeft_0.3s_ease] lg:w-[320px] md:w-[280px]">
            <nav className="flex border-b border-space-700 shrink-0 overflow-x-auto scrollbar-hide">
              {tabs.map(t => (
                <button
                  key={t.id}
                  className={`flex-1 py-2.5 px-1 text-[11px] font-medium whitespace-nowrap transition-all duration-200 border-b-2 ${
                    validTab === t.id
                      ? 'text-neon-cyan border-neon-cyan bg-neon-cyan/5'
                      : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-space-800/50'
                  }`}
                  onClick={() => setSidebarTab(t.id)}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </nav>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent tab={validTab} />
            </div>
          </aside>
        )}

        <button
          className="absolute top-1/2 -translate-y-1/2 z-50 w-5 h-12 flex items-center justify-center bg-space-800 border border-space-700 border-l-0 rounded-r text-gray-500 text-xs cursor-pointer transition-all hover:bg-space-700 hover:text-gray-200"
          style={{ left: sidebarOpen ? '320px' : 0 }}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? '◁' : '▷'}
        </button>

        <div className="flex-1 flex flex-col overflow-hidden">
          <nav className="flex border-b border-space-700 bg-space-900 shrink-0">
            {[
              { id: 'radargram' as MainView, icon: '📊', label: 'Radargram' },
              { id: 'ascope' as MainView, icon: '📈', label: 'A-Scope' },
              { id: 'map' as MainView, icon: '🗺️', label: 'Track Map' },
              { id: '3d' as MainView, icon: '🌐', label: '3D View' },
            ].map(v => (
              <button
                key={v.id}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-all duration-200 ${
                  mainView === v.id
                    ? 'text-neon-cyan border-neon-cyan bg-space-800/50'
                    : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-space-800/30'
                }`}
                onClick={() => setMainView(v.id)}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </nav>

          <main className="flex-1 overflow-hidden relative">
            {mainView === 'radargram' && <RadargramViewer />}
            {mainView === 'ascope' && <AScope />}
            {mainView === 'map' && <MarsTrackMap />}
            {mainView === '3d' && (
              <Suspense fallback={<LoadingSpinner />}>
                <ThreeViewer />
              </Suspense>
            )}
          </main>
        </div>
      </div>

      <StatusBar />
      <LoadingOverlay />
    </div>
  );
}

export default function App() {
  return (
    <CryoRadarProvider>
      <AppLayout />
    </CryoRadarProvider>
  );
}
