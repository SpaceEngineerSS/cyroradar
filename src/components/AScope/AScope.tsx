/* CRYORADAR — A-Scope Single Trace Viewer
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Displays a single radar trace as amplitude vs depth — the fundamental
 * tool for radar signal analysis. Scientists use A-scopes to identify
 * reflection peaks, measure signal-to-noise ratio, and compare observed
 * returns against theoretical Fresnel predictions. */

import { useRef, useEffect, useCallback } from 'react';
import { useCryoState } from '../../context/CryoRadarContext';
import { SPEED_OF_LIGHT } from '../../core/physics/constants';
import './AScope.css';

interface AScopeProps {
  traceIndex?: number;
}

export function AScope({ traceIndex }: AScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { dataset } = useCryoState();

  const drawScope = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dataset) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = rect?.width ?? 300;
    canvas.height = rect?.height ?? 400;

    const { width: W, height: H } = canvas;
    const { radargram, metadata } = dataset;
    const ti = Math.min(traceIndex ?? Math.floor(radargram.width / 2), radargram.width - 1);

    const trace: number[] = [];
    for (let s = 0; s < radargram.height; s++) {
      trace.push(radargram.data[s * radargram.width + ti]);
    }

    const traceMax = Math.max(...trace);
    const traceMin = Math.min(...trace);
    const range = traceMax - traceMin || 1;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);

    const marginLeft = 55;
    const marginRight = 15;
    const marginTop = 35;
    const marginBottom = 50;
    const plotW = W - marginLeft - marginRight;
    const plotH = H - marginTop - marginBottom;

    const freq = metadata.instrument === 'SHARAD' ? 20e6 : 4e6;
    const sampleInterval = metadata.instrument === 'SHARAD' ? 0.075e-6 : 0.1e-6;

    ctx.fillStyle = '#60a5fa';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`A-Scope — Trace #${ti}`, W / 2, 14);

    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`${metadata.instrument} ${freq / 1e6} MHz`, W / 2, 26);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const x = marginLeft + (i / 5) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, marginTop);
      ctx.lineTo(x, marginTop + plotH);
      ctx.stroke();
    }

    for (let i = 0; i <= 10; i++) {
      const y = marginTop + (i / 10) * plotH;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(marginLeft + plotW, y);
      ctx.stroke();

      const depthSample = Math.floor((i / 10) * radargram.height);
      const depthM = (depthSample * sampleInterval * SPEED_OF_LIGHT) / (2 * Math.sqrt(3.15));
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`${depthM.toFixed(0)}m`, marginLeft - 4, y + 3);
    }

    ctx.save();
    ctx.translate(10, marginTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('Depth (m, ε=3.15)', 0, 0);
    ctx.restore();

    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('Relative Power (dB)', marginLeft + plotW / 2, H - 8);

    for (let i = 0; i <= 5; i++) {
      const x = marginLeft + (i / 5) * plotW;
      const db = -50 + i * 10;
      ctx.fillText(`${db}`, x, H - 20);
    }

    const traceDb: number[] = trace.map(v => {
      const norm = (v - traceMin) / range;
      return -50 + norm * 50;
    });

    ctx.beginPath();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    for (let s = 0; s < radargram.height; s++) {
      const x = marginLeft + ((traceDb[s] + 50) / 50) * plotW;
      const y = marginTop + (s / radargram.height) * plotH;
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const peaks: { sample: number; power: number }[] = [];
    const windowSize = 15;
    const threshold = traceMin + range * 0.35;

    for (let s = windowSize; s < radargram.height - windowSize; s++) {
      let isMax = true;
      for (let w = 1; w <= windowSize; w++) {
        if (trace[s] <= trace[s - w] || trace[s] <= trace[s + w]) {
          isMax = false;
          break;
        }
      }
      if (isMax && trace[s] > threshold) {
        peaks.push({ sample: s, power: trace[s] });
      }
    }

    peaks.sort((a, b) => b.power - a.power);
    const topPeaks = peaks.slice(0, 5);

    for (const peak of topPeaks) {
      const x = marginLeft + ((traceDb[peak.sample] + 50) / 50) * plotW;
      const y = marginTop + (peak.sample / radargram.height) * plotH;
      const depthM = (peak.sample * sampleInterval * SPEED_OF_LIGHT) / (2 * Math.sqrt(3.15));
      const powerDb = traceDb[peak.sample].toFixed(1);

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.strokeStyle = '#0a0e1a';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#f97316';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${depthM.toFixed(0)}m ${powerDb}dB`, x + 6, y + 3);
    }

    const noiseFloorDb = -45;
    const nfX = marginLeft + ((noiseFloorDb + 50) / 50) * plotW;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(nfX, marginTop);
    ctx.lineTo(nfX, marginTop + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ef4444';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Noise Floor', nfX + 3, marginTop + 10);
  }, [dataset, traceIndex]);

  useEffect(() => {
    drawScope();
  }, [drawScope]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => drawScope());
    obs.observe(canvas.parentElement!);
    return () => obs.disconnect();
  }, [drawScope]);

  if (!dataset) {
    return (
      <div className="ascope-empty">
        <div className="ascope-empty-icon">📊</div>
        <div>Load a dataset to view A-Scope</div>
      </div>
    );
  }

  return (
    <div className="ascope-container">
      <canvas ref={canvasRef} className="ascope-canvas" />
    </div>
  );
}
