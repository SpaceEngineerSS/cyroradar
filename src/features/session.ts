/* Session files (.cryoradar.json): everything you did to a radargram, so the
 * work can be picked up later or sent to someone. The radargram itself is not
 * stored; simulated scenes are regenerated and PDS tracks are downloaded again. */

import { useApp } from '../store/app';
import type { DetectionParams, ROIBounds, SubsurfaceLayer, ColormapId } from '../types/types';
import type { PDSProduct } from '../types/pds-types';
import type { Overlays } from '../store/app';

const VERSION = 1;

interface SessionFile {
  format: 'cryoradar-session';
  version: number;
  savedAt: string;
  source: { kind: 'synthetic'; id: string; tecu: number } | { kind: 'pds'; product: PDSProduct; full: boolean } | { kind: 'file'; name: string };
  layers: SubsurfaceLayer[];
  bulkPermittivity: number;
  detection: DetectionParams;
  roi: ROIBounds | null;
  pinnedTrace: number | null;
  display: { colormap: ColormapId; contrast: [number, number]; overlays: Overlays; statics: boolean };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function saveSession() {
  const s = useApp.getState();
  if (!s.dataset || !s.datasetKey) return;
  const source: SessionFile['source'] = s.datasetKey.startsWith('synthetic:')
    ? { kind: 'synthetic', id: s.datasetKey.slice('synthetic:'.length), tecu: s.tecu }
    : s.pdsSource
      ? { kind: 'pds', product: s.pdsSource.product, full: s.pdsSource.full }
      : { kind: 'file', name: s.dataset.metadata.title };
  const file: SessionFile = {
    format: 'cryoradar-session',
    version: VERSION,
    savedAt: new Date().toISOString(),
    source,
    layers: s.layers,
    bulkPermittivity: s.bulkPermittivity,
    detection: s.detection,
    roi: s.roi,
    pinnedTrace: s.pinnedTrace,
    display: { colormap: s.colormap, contrast: s.contrast, overlays: s.overlays, statics: s.statics },
  };
  const name = s.dataset.metadata.productId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${name}.cryoradar.json`);
}

export async function loadSession(file: File) {
  const s = useApp.getState();
  let data: SessionFile;
  try {
    data = JSON.parse(await file.text());
  } catch {
    s.notify('That file is not valid JSON.', 'error');
    return;
  }
  if (data?.format !== 'cryoradar-session') {
    s.notify('That file is not a CryoRadar session.', 'error');
    return;
  }

  if (data.source.kind === 'synthetic') await s.loadSynthetic(data.source.id, data.source.tecu);
  else if (data.source.kind === 'pds') await s.loadPds(data.source.product, data.source.full);
  else if (!s.dataset || s.dataset.metadata.title !== data.source.name) {
    s.notify(`Open ${data.source.name} first, then load the session again.`, 'info');
    return;
  }

  const st = useApp.getState();
  if (!st.dataset) return;
  useApp.setState({
    layers: data.layers ?? [],
    activeLayer: data.layers?.length ? 0 : null,
    bulkPermittivity: data.bulkPermittivity ?? st.bulkPermittivity,
    detection: { ...st.detection, ...data.detection },
    roi: data.roi ?? null,
    pinnedTrace: data.pinnedTrace ?? null,
    colormap: data.display?.colormap ?? st.colormap,
    contrast: data.display?.contrast ?? st.contrast,
    overlays: { ...st.overlays, ...data.display?.overlays },
    statics: !!data.display?.statics,
  });
  st.notify('Session restored.', 'ok');
}
