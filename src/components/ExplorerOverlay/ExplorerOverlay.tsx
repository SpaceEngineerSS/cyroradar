/* CRYORADAR — Explorer Mode Overlay
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Renders simplified, color-coded subsurface layer overlays on the
 * radargram for the educational Explorer mode. Replaces raw dB data
 * with intuitive material categories. */

import { useRef, useEffect, useCallback } from 'react';
import type { CryoDataset, ViewportState } from '../../types/types';

interface LayerZone {
  label: string;
  color: string;
  startFraction: number;
  endFraction: number;
  pulse: boolean;
}

const LAYER_ZONES: LayerZone[] = [
  { label: 'Atmosphere', color: 'rgba(148, 163, 184, 0.08)', startFraction: 0.0, endFraction: 0.05, pulse: false },
  { label: 'Surface Regolith', color: 'rgba(180, 83, 9, 0.25)', startFraction: 0.05, endFraction: 0.15, pulse: false },
  { label: 'H₂O Ice Layer', color: 'rgba(34, 211, 238, 0.2)', startFraction: 0.15, endFraction: 0.45, pulse: false },
  { label: 'Mixed Ice & Dust', color: 'rgba(139, 92, 246, 0.15)', startFraction: 0.45, endFraction: 0.6, pulse: false },
  { label: 'Bedrock', color: 'rgba(120, 53, 15, 0.3)', startFraction: 0.6, endFraction: 0.85, pulse: false },
  { label: 'Possible Liquid', color: 'rgba(37, 99, 235, 0.35)', startFraction: 0.85, endFraction: 1.0, pulse: true },
];

export function ExplorerOverlay({
  canvasRef,
  dataset,
  viewport,
  containerWidth,
  containerHeight,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  dataset: CryoDataset;
  viewport: ViewportState;
  containerWidth: number;
  containerHeight: number;
}) {
  const animFrame = useRef(0);
  const pulsePhase = useRef(0);

  const render = useCallback(function doRender() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    const { width, height } = dataset.radargram;
    const { offsetX, offsetY, scaleX, scaleY } = viewport;
    const unitX = (containerWidth / width) * scaleX;
    const unitY = (containerHeight / height) * scaleY;

    pulsePhase.current = (pulsePhase.current + 0.02) % (Math.PI * 2);
    const pulseAlpha = 0.5 + 0.5 * Math.sin(pulsePhase.current);

    for (const zone of LAYER_ZONES) {
      const y0 = zone.startFraction * height * unitY + offsetY;
      const y1 = zone.endFraction * height * unitY + offsetY;
      const x0 = offsetX;
      const x1 = width * unitX + offsetX;

      const drawY0 = Math.max(0, y0);
      const drawY1 = Math.min(containerHeight, y1);
      const drawX0 = Math.max(0, x0);
      const drawX1 = Math.min(containerWidth, x1);

      if (drawY0 >= drawY1 || drawX0 >= drawX1) continue;

      ctx.globalAlpha = zone.pulse ? pulseAlpha * 0.6 : 1;
      ctx.fillStyle = zone.color;
      ctx.fillRect(drawX0, drawY0, drawX1 - drawX0, drawY1 - drawY0);

      ctx.strokeStyle = zone.color.replace(/[\d.]+\)$/, '0.6)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(drawX0, drawY0);
      ctx.lineTo(drawX1, drawY0);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const labelY = (drawY0 + drawY1) / 2;
      const labelX = Math.max(drawX0 + 8, 8);
      if (drawY1 - drawY0 > 20 && labelX < drawX1 - 40) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '600 11px "Outfit", sans-serif';
        ctx.fillText(zone.label, labelX, labelY + 4);
      }
    }

    const legendX = containerWidth - 140;
    const legendY = 16;
    ctx.fillStyle = 'rgba(5, 8, 16, 0.75)';
    ctx.fillRect(legendX - 8, legendY - 4, 144, LAYER_ZONES.length * 18 + 24);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.fillText('LAYER KEY', legendX, legendY + 8);

    LAYER_ZONES.forEach((z, i) => {
      const ly = legendY + 20 + i * 18;
      ctx.fillStyle = z.color.replace(/[\d.]+\)$/, '0.8)');
      ctx.fillRect(legendX, ly, 10, 10);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '10px "Outfit", sans-serif';
      ctx.fillText(z.label, legendX + 16, ly + 9);
    });

    if (LAYER_ZONES.some(z => z.pulse)) {
      animFrame.current = requestAnimationFrame(doRender);
    }
  }, [canvasRef, dataset, viewport, containerWidth, containerHeight]);

  useEffect(() => {
    render();
    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [render]);

  return null;
}
