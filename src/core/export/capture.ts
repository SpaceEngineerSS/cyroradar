/* CRYORADAR — High-Resolution Canvas Capture Utility
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Composites the radargram canvas with its overlay into a single
 * high-resolution PNG suitable for academic publications (Figure 1).
 * Includes metadata watermark with timestamp and coordinates. */

export function captureRadargramAsPNG(): void {
  const container = document.querySelector('[data-radargram-container]') as HTMLDivElement | null;
  if (!container) return;

  const radarCanvas = container.querySelector('canvas[data-radargram-main]') as HTMLCanvasElement | null;
  const overlayCanvas = container.querySelector('canvas[data-radargram-overlay]') as HTMLCanvasElement | null;

  if (!radarCanvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  const exportWidth = Math.round(rect.width * dpr);
  const exportHeight = Math.round(rect.height * dpr);

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = exportWidth;
  exportCanvas.height = exportHeight;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, exportWidth, exportHeight);

  ctx.drawImage(radarCanvas, 0, 0, radarCanvas.width, radarCanvas.height, 0, 0, exportWidth, exportHeight);

  if (overlayCanvas) {
    ctx.drawImage(overlayCanvas, 0, 0, overlayCanvas.width, overlayCanvas.height, 0, 0, exportWidth, exportHeight);
  }

  const fontSize = Math.max(10, Math.round(12 * dpr));
  ctx.font = `${fontSize}px "Outfit", Inter, monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'right';
  ctx.fillText(
    `CRYORADAR v6.0 — ${new Date().toISOString().slice(0, 19)}Z — Developer: Mehmet Gümüş`,
    exportWidth - 10 * dpr,
    exportHeight - 8 * dpr
  );

  exportCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cryoradar-capture-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
