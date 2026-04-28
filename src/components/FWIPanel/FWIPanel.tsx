import { useEffect, useRef, useState } from 'react';
import { useCryoState, useCryoDispatch } from '../../context/CryoRadarContext';
import { runFWI } from '../../core/analysis/fwi-engine';
import type { FWIResult } from '../../types/types';

export function FWIPanel() {
  const state = useCryoState();
  const dispatch = useCryoDispatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !state.fwiResult) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    const { roi, invertedPermittivity } = state.fwiResult;
    const w = roi.traceEnd - roi.traceStart;
    const h = roi.sampleEnd - roi.sampleStart;
    
    canvasRef.current.width = w;
    canvasRef.current.height = h;
    
    const imgData = ctx.createImageData(w, h);
    for (let i = 0; i < invertedPermittivity.length; i++) {
      const val = invertedPermittivity[i];
      // Map permittivity (1 to 80) to a heatmap (blue to red)
      const norm = Math.max(0, Math.min(1, (val - 1) / 79));
      const r = Math.floor(norm * 255);
      const g = Math.floor((1 - norm) * 100);
      const b = Math.floor((1 - norm) * 255);
      
      const px = i * 4;
      imgData.data[px] = r;
      imgData.data[px + 1] = g;
      imgData.data[px + 2] = b;
      imgData.data[px + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }, [state.fwiResult]);

  const startFWI = async () => {
    if (!state.roiSelection || !state.dataset) return;
    setErrorMsg(null);
    dispatch({ type: 'SET_FWI_RUNNING', running: true });

    try {
      const result = await runFWI({
        roi: state.roiSelection,
        radargram: state.dataset.radargram,
        iterations: 50,
        onProgress: (res: FWIResult) => {
          dispatch({ type: 'SET_FWI_RESULT', result: res });
        }
      });
      dispatch({ type: 'SET_FWI_RESULT', result });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setErrorMsg(e.message || 'FWI computation failed.');
    } finally {
      dispatch({ type: 'SET_FWI_RUNNING', running: false });
    }
  };


  const downloadPlotPNG = () => {
    if (!canvasRef.current || !state.fwiResult || !state.dataset) return;
    
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const pad = 60;
    
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w + pad * 2 + 50; // extra width for colorbar
    exportCanvas.height = h + pad * 2;
    const eCtx = exportCanvas.getContext('2d');
    if (!eCtx) return;
    
    // Background
    eCtx.fillStyle = '#0f172a'; // space-950
    eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    // Draw original image
    eCtx.imageSmoothingEnabled = false;
    eCtx.drawImage(canvasRef.current, pad, pad, w, h);
    
    // Border around image
    eCtx.strokeStyle = '#334155';
    eCtx.lineWidth = 1;
    eCtx.strokeRect(pad, pad, w, h);
    
    // Y-axis (Depth)
    eCtx.fillStyle = '#94a3b8';
    eCtx.font = '10px monospace';
    eCtx.textAlign = 'right';
    eCtx.textBaseline = 'middle';
    const sampleStart = state.fwiResult.roi.sampleStart;
    const sampleEnd = state.fwiResult.roi.sampleEnd;
    const { sampleInterval } = state.dataset.radargram;
    
    for (let i = 0; i <= 2; i++) {
      const frac = i / 2;
      const s = sampleStart + (sampleEnd - sampleStart) * frac;
      const t = s * sampleInterval;
      const depth = (3e8 * t) / (2 * Math.sqrt(3.15));
      eCtx.fillText(`${depth.toFixed(0)}m`, pad - 5, pad + h * frac);
    }
    
    // X-axis (Trace)
    eCtx.textAlign = 'center';
    eCtx.textBaseline = 'top';
    const traceStart = state.fwiResult.roi.traceStart;
    const traceEnd = state.fwiResult.roi.traceEnd;
    for (let i = 0; i <= 2; i++) {
      const frac = i / 2;
      const tr = Math.round(traceStart + (traceEnd - traceStart) * frac);
      eCtx.fillText(`T:${tr}`, pad + w * frac, pad + h + 5);
    }
    
    // Colorbar (Right side)
    const cbX = pad + w + 15;
    const cbY = pad;
    const cbW = 10;
    const cbH = h;
    const grad = eCtx.createLinearGradient(0, cbY + cbH, 0, cbY);
    grad.addColorStop(0, 'rgb(0,0,255)');
    grad.addColorStop(0.5, 'rgb(127,50,127)');
    grad.addColorStop(1, 'rgb(255,0,0)');
    eCtx.fillStyle = grad;
    eCtx.fillRect(cbX, cbY, cbW, cbH);
    eCtx.strokeRect(cbX, cbY, cbW, cbH);
    
    // Colorbar labels
    eCtx.fillStyle = '#94a3b8';
    eCtx.textAlign = 'left';
    eCtx.textBaseline = 'middle';
    eCtx.fillText('ε=80', cbX + cbW + 5, cbY);
    eCtx.fillText('ε=1', cbX + cbW + 5, cbY + cbH);
    
    // Overlays
    eCtx.fillStyle = '#22d3ee';
    eCtx.font = 'bold 12px monospace';
    eCtx.textAlign = 'left';
    eCtx.textBaseline = 'top';
    eCtx.fillText('CRYORADAR - Mars Subsurface Tomography', pad, 20);
    
    eCtx.fillStyle = '#64748b';
    eCtx.font = '10px monospace';
    eCtx.textAlign = 'right';
    eCtx.textBaseline = 'bottom';
    eCtx.fillText('Developer: Mehmet Gümüş', exportCanvas.width - 10, exportCanvas.height - 10);
    
    const link = document.createElement('a');
    link.download = `FWI_Tomography_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const exportMapJSON = () => {
    if (!state.fwiResult || !state.dataset) return;
    const data = {
      generator: 'CRYORADAR',
      developer: 'Mehmet Gümüş',
      exportDate: new Date().toISOString(),
      datasetId: state.dataset.metadata.productId,
      fwiParams: {
        roi: state.fwiResult.roi,
        iterations: state.fwiResult.iterations,
        residualNorm: state.fwiResult.residualNorm,
        elapsedMs: state.fwiResult.elapsedMs,
      },
      invertedPermittivity: Array.from(state.fwiResult.invertedPermittivity)
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `FWI_Map_${Date.now()}.json`;
    link.click();
  };

  return (
    <div className="flex flex-col h-full bg-space-900 border-l border-space-800 w-80 text-gray-300">
      <div className="p-4 border-b border-space-800 bg-space-950">
        <h2 className="text-sm font-bold text-neon-cyan flex items-center gap-2">
          <span>🌊</span> WebGPU FWI Tomography
        </h2>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          Full-Waveform Inversion via Adjoint-State Method.
        </p>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {!state.roiSelection ? (
          <div className="p-4 rounded bg-space-800/50 border border-space-700 text-center text-xs text-gray-400">
            Select a Region of Interest (ROI) using the [🔲] tool to begin FWI analysis.
            <br/><br/>
            WebGPU Max: 256x256<br/>
            CPU Max: 64x64
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-space-800 p-2 rounded border border-space-700">
              <span className="text-xs font-mono">ROI Size:</span>
              <span className="text-xs font-mono text-neon-cyan">
                {state.roiSelection.traceEnd - state.roiSelection.traceStart} x {state.roiSelection.sampleEnd - state.roiSelection.sampleStart}
              </span>
            </div>

            <button
              onClick={startFWI}
              disabled={state.fwiRunning}
              className={`w-full py-2 text-xs font-bold uppercase rounded transition-colors ${
                state.fwiRunning 
                  ? 'bg-space-800 text-gray-500 cursor-not-allowed' 
                  : 'bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30 border border-neon-cyan/50'
              }`}
            >
              {state.fwiRunning ? 'Inverting...' : 'Run Tomography'}
            </button>

            {errorMsg && (
              <div className="p-2 bg-red-900/30 border border-red-500/50 text-red-400 text-[10px] rounded">
                {errorMsg}
              </div>
            )}

            {state.fwiResult && (
              <div className="space-y-3 mt-4">
                <div className="flex justify-between text-[10px] font-mono border-b border-space-700 pb-1">
                  <span>Iteration:</span>
                  <span className="text-white">{state.fwiResult.iterations}</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono border-b border-space-700 pb-1">
                  <span>Residual RMS:</span>
                  <span className="text-emerald-400">{state.fwiResult.residualNorm.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono border-b border-space-700 pb-1">
                  <span>Elapsed Time:</span>
                  <span className="text-yellow-400">{(state.fwiResult.elapsedMs / 1000).toFixed(1)}s</span>
                </div>

                <div className="mt-4 bg-black p-2 rounded border border-space-700 relative">
                  <span className="absolute -top-2 left-2 bg-space-900 px-1 text-[9px] text-gray-500 uppercase tracking-wider">
                    Permittivity Map ε(x,z)
                  </span>
                  <canvas 
                    ref={canvasRef} 
                    className="w-full h-auto aspect-square rounded-sm border border-space-800 pixelated"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={downloadPlotPNG}
                    className="flex-1 py-1.5 text-[10px] font-mono font-medium rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all"
                  >
                    🖼️ PNG Çıktı
                  </button>
                  <button
                    onClick={exportMapJSON}
                    className="flex-1 py-1.5 text-[10px] font-mono font-medium rounded bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 transition-all"
                  >
                    📋 JSON İndir
                  </button>
                </div>

              </div>
            )}
          </div>
        )}
      </div>
      <div className="p-2 border-t border-space-800 text-center">
        <span className="text-[9px] text-gray-600 font-mono">Developer: Mehmet Gümüş</span>
      </div>
    </div>
  );
}
