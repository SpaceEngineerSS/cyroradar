/* CRYORADAR — Surface Clutter Model (Three.js)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Simulates off-nadir surface clutter — radar returns from rough
 * terrain features that produce false subsurface echoes.
 *
 * Model:
 *   P_clutter ∝ σ₀(θ) · λ / l
 *   σ₀ = σ_nadir · exp(-θ²/θ₀²)   (Gaussian scattering)
 *   h_rms estimated from Δ(elevation)/Δ(trace) derivative
 *
 * Reference: Campbell & Ulrichs (1969), JGR 74(25), 5867–5881 */

import * as THREE from 'three';
import type { GeometryData } from '../../types/types';

export function generateClutterTexture(
  geometry: GeometryData,
  frequencyMhz: number,
  traceCount: number,
): THREE.CanvasTexture {
  const texWidth = Math.min(traceCount, 512);
  const texHeight = 128;
  const canvas = document.createElement('canvas');
  canvas.width = texWidth;
  canvas.height = texHeight;
  const ctx = canvas.getContext('2d')!;

  const elevations = geometry.surfaceElevation;
  const slopes = new Float32Array(traceCount);
  for (let i = 1; i < traceCount - 1; i++) {
    slopes[i] = Math.abs(elevations[i + 1] - elevations[i - 1]) / 2;
  }
  slopes[0] = slopes[1];
  slopes[traceCount - 1] = slopes[traceCount - 2];

  let maxSlope = 0;
  for (let i = 0; i < traceCount; i++) {
    if (slopes[i] > maxSlope) maxSlope = slopes[i];
  }
  if (maxSlope === 0) maxSlope = 1;

  const wavelength = 299_792_458 / (frequencyMhz * 1e6);

  const imageData = ctx.createImageData(texWidth, texHeight);
  const pixels = imageData.data;

  for (let x = 0; x < texWidth; x++) {
    const srcTrace = Math.floor((x / texWidth) * traceCount);
    const normalizedSlope = slopes[srcTrace] / maxSlope;
    const clutterStrength = normalizedSlope * wavelength * 200;

    for (let y = 0; y < texHeight; y++) {
      const depthFraction = y / texHeight;
      const attenuation = Math.exp(-depthFraction * 3);
      const noise = (Math.random() - 0.5) * 0.3;
      const intensity = Math.min(1, clutterStrength * attenuation * (1 + noise));

      const idx = (y * texWidth + x) * 4;
      pixels[idx] = Math.floor(249 * intensity);
      pixels[idx + 1] = Math.floor(115 * intensity);
      pixels[idx + 2] = Math.floor(22 * intensity);
      pixels[idx + 3] = Math.floor(intensity * 120);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

export function buildClutterOverlayMesh(
  geometry: GeometryData,
  frequencyMhz: number,
  traceCount: number,
): THREE.Mesh {
  const texture = generateClutterTexture(geometry, frequencyMhz, traceCount);

  const sliceGeometry = new THREE.PlaneGeometry(4, 0.6);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(sliceGeometry, material);
  mesh.position.set(0, -0.3, 0.001);
  return mesh;
}
