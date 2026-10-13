import { useEffect, useRef, useState } from 'react';
import { useApp, velocityLayers } from '../../store/app';
import { createScene } from './scene';
import { device, pixelRatio } from '../../app/perf';
import { EmptyState, Note } from '../../ui/controls';

export default function SceneView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataset = useApp(s => s.dataset);
  const layers = useApp(s => s.layers);
  const bulk = useApp(s => s.bulkPermittivity);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || !dataset) return;
    let scene: ReturnType<typeof createScene>;
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--c-plot-bg').trim() || '#080807';
      scene = createScene(canvas, dataset, { segments: device.sceneSegments, model: velocityLayers(layers), bulkPermittivity: bulk }, bg);
    } catch (err) {
      queueMicrotask(() => setError(err instanceof Error ? err.message : String(err)));
      return;
    }
    const s = useApp.getState();
    scene.setColormap(s.colormap);
    scene.setContrast(s.contrast[0], s.contrast[1]);
    scene.setDetections(s.anomalies);
    scene.setPinned(s.pinnedTrace);

    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      scene.resize(r.width, r.height, pixelRatio());
    });
    ro.observe(host);
    const unsubs = [
      useApp.subscribe(st => st.colormap, id => scene.setColormap(id)),
      useApp.subscribe(st => st.contrast, c => scene.setContrast(c[0], c[1])),
      useApp.subscribe(st => st.anomalies, a => scene.setDetections(a)),
      useApp.subscribe(st => st.pinnedTrace, t => scene.setPinned(t)),
    ];
    return () => {
      ro.disconnect();
      unsubs.forEach(u => u());
      scene.dispose();
    };
  }, [dataset, layers, bulk]);

  if (!dataset) return <EmptyState icon="scene" title="No radargram" />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line px-4 py-2 text-2xs text-faint">
        <span>Drag to orbit, scroll to zoom, right-drag to pan.</span>
        <span>The curtain hangs from the surface using the depth model. The ribbon is the measured profile, coloured by slope (orange ≥ 3°).</span>
      </div>
      {error ? (
        <div className="p-4"><Note tone="error">The 3D view could not start: {error}</Note></div>
      ) : (
        <div ref={hostRef} className="plot relative min-h-0 flex-1">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" role="img" aria-label="3D view of the radargram below the surface profile" />
        </div>
      )}
    </div>
  );
}
