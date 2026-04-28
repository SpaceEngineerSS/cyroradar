/* CRYORADAR — Mars Track Map
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Canvas-rendered equirectangular Mars projection showing radar ground tracks.
 * Displays all available PDS regions and highlights the current track. */

import { useRef, useEffect, useCallback } from 'react';
import { useCryoState } from '../../context/CryoRadarContext';
import { PDS_REGIONS } from '../../types/pds-types';
import './MarsTrackMap.css';

export function MarsTrackMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { dataset } = useCryoState();

  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = rect?.width ?? 600;
    canvas.height = Math.round((canvas.width) / 2);

    const { width: W, height: H } = canvas;

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1a0a00');
    bg.addColorStop(0.3, '#2d1608');
    bg.addColorStop(0.5, '#3d2010');
    bg.addColorStop(0.7, '#2d1608');
    bg.addColorStop(1, '#0a0e1a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    function lonToX(lon: number): number { return ((lon + 180) / 360) * W; }
    function latToY(lat: number): number { return ((90 - lat) / 180) * H; }

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = lonToX(lon);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let lat = -90; lat <= 90; lat += 30) {
      const y = latToY(lat);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#475569';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let lon = -150; lon <= 150; lon += 60) {
      ctx.fillText(`${lon}°`, lonToX(lon), H - 3);
    }
    ctx.textAlign = 'right';
    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat === 0) continue;
      ctx.fillText(`${lat}°`, W - 3, latToY(lat) + 3);
    }

    ctx.fillStyle = '#382009';
    ctx.beginPath();
    ctx.ellipse(lonToX(70), latToY(-42), W * 0.06, H * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d1a0a';
    ctx.beginPath();
    ctx.ellipse(lonToX(-70), latToY(-13), W * 0.03, H * 0.025, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e120a';
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Hellas', lonToX(70), latToY(-42) + 12);
    ctx.fillText('V. Marineris', lonToX(-70), latToY(-13) + 10);
    ctx.fillText('Olympus', lonToX(-134), latToY(18) + 8);
    ctx.fillText('Tharsis', lonToX(-112), latToY(0) + 8);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.ellipse(lonToX(180), latToY(85), W * 0.04, H * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(lonToX(180), latToY(-85), W * 0.05, H * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#475569';
    ctx.fillText('N Pole', lonToX(180), latToY(85) - 6);
    ctx.fillText('S Pole', lonToX(180), latToY(-85) + 14);

    for (const region of PDS_REGIONS) {
      const cx = lonToX(region.centerLon > 180 ? region.centerLon - 360 : region.centerLon);
      const cy = latToY(region.centerLat);
      const isActive = dataset?.metadata.region === region.name;

      if (isActive) {
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#22d3ee';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(249, 115, 22, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.fillStyle = isActive ? '#22d3ee' : '#94a3b8';
      ctx.font = `${isActive ? '9' : '8'}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(region.name, cx, cy - 8);
    }

    if (dataset?.geometry) {
      const { latitudes, longitudes } = dataset.geometry;
      ctx.beginPath();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 4;

      for (let i = 0; i < latitudes.length; i += Math.max(1, Math.floor(latitudes.length / 200))) {
        let lon = longitudes[i];
        if (lon > 180) lon -= 360;
        const x = lonToX(lon);
        const y = latToY(latitudes[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CRYORADAR — Mars Radar Track Map', 8, 14);

    ctx.fillStyle = '#64748b';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText(`${PDS_REGIONS.length} regions • Equirectangular Projection`, 8, 26);
  }, [dataset]);

  useEffect(() => { drawMap(); }, [drawMap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => drawMap());
    obs.observe(canvas.parentElement!);
    return () => obs.disconnect();
  }, [drawMap]);

  return (
    <div className="marsmap-container">
      <canvas ref={canvasRef} className="marsmap-canvas" />
    </div>
  );
}
