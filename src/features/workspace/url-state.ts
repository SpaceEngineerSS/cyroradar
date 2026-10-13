/* Shareable links. The URL hash mirrors the scene, view, colour table,
 * contrast, TEC and pinned trace, so a copied link reopens the same picture.
 * Only simulated scenes are encoded; PDS products need a network lookup. */

import { useEffect } from 'react';
import { useApp } from '../../store/app';
import { listSyntheticScenes } from '../../core/pipeline/synthetic-generator';
import { getAllColormaps } from '../../core/colormaps/colormaps';
import type { ColormapId, MainView } from '../../types/types';

const VIEWS: MainView[] = ['radargram', 'ascope', 'map', 'scene'];
const SCENES = new Set(listSyntheticScenes().map(s => s.id));
const CMAPS = new Set(getAllColormaps().map(c => c.id));

export function encodeState(): string {
  const s = useApp.getState();
  if (!s.datasetKey?.startsWith('synthetic:')) return '';
  const p = new URLSearchParams();
  p.set('scene', s.datasetKey.slice('synthetic:'.length));
  if (s.mainView !== 'radargram') p.set('view', s.mainView);
  if (s.colormap !== 'grayscale') p.set('cmap', s.colormap);
  p.set('contrast', `${s.contrast[0].toFixed(2)},${s.contrast[1].toFixed(2)}`);
  if (Math.abs(s.tecu - 0.3) > 1e-3) p.set('tec', s.tecu.toFixed(2));
  if (s.pinnedTrace != null) p.set('trace', String(s.pinnedTrace));
  if (s.statics) p.set('statics', '1');
  return p.toString();
}

export function shareUrl(): string {
  const hash = encodeState();
  return `${location.origin}${location.pathname}${hash ? `#${hash}` : ''}`;
}

export function useUrlState() {
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    const scene = p.get('scene');
    const s = useApp.getState();
    if (scene && SCENES.has(scene)) {
      const tec = Number(p.get('tec'));
      void s.loadSynthetic(scene, Number.isFinite(tec) && p.has('tec') ? Math.min(3, Math.max(0, tec)) : undefined).then(() => {
        const st = useApp.getState();
        const view = p.get('view') as MainView | null;
        if (view && VIEWS.includes(view)) st.set('mainView', view);
        const cmap = p.get('cmap') as ColormapId | null;
        if (cmap && CMAPS.has(cmap)) st.set('colormap', cmap);
        const c = p.get('contrast')?.split(',').map(Number);
        if (c && c.length === 2 && c.every(Number.isFinite)) st.setContrast(Math.max(0, c[0]), Math.min(1, c[1]));
        const trace = Number(p.get('trace'));
        if (p.has('trace') && Number.isInteger(trace) && st.dataset && trace >= 0 && trace < st.dataset.radargram.width) st.set('pinnedTrace', trace);
        if (p.get('statics') === '1') st.set('statics', true);
      });
    }

    let timer = 0;
    const unsub = useApp.subscribe(
      st => [st.datasetKey, st.mainView, st.colormap, st.contrast, st.tecu, st.pinnedTrace, st.statics] as const,
      () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          const hash = encodeState();
          const url = `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`;
          if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', url);
        }, 250);
      },
      { equalityFn: (a, b) => a.every((x, i) => x === b[i]) },
    );
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);
}
