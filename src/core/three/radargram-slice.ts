/* CRYORADAR — Radargram 3D Slice (Three.js)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Creates a semi-transparent vertical plane below the Mars surface
 * textured with the radargram data using the current colormap. */

import * as THREE from 'three';
import { getColormap, mapValueToColor } from '../colormaps/colormaps';
import type { RadargramData, ColormapId } from '../../types/types';

export function buildRadargramSliceMesh(
  radargram: RadargramData,
  colormap: ColormapId,
  contrastMin: number,
  contrastMax: number,
): THREE.Mesh {
  const { width, height, data, powerMin, powerMax } = radargram;
  const range = powerMax - powerMin;
  const cMin = powerMin + contrastMin * range;
  const cMax = powerMin + contrastMax * range;
  const cmData = getColormap(colormap).data;

  const texWidth = Math.min(width, 512);
  const texHeight = Math.min(height, 256);

  const canvas = document.createElement('canvas');
  canvas.width = texWidth;
  canvas.height = texHeight;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(texWidth, texHeight);
  const pixels = imageData.data;

  for (let y = 0; y < texHeight; y++) {
    const srcY = Math.floor((y / texHeight) * height);
    for (let x = 0; x < texWidth; x++) {
      const srcX = Math.floor((x / texWidth) * width);
      const val = data[srcY * width + srcX];
      const [r, g, b, a] = mapValueToColor(val, cMin, cMax, cmData);
      const idx = (y * texWidth + x) * 4;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const aspectRatio = 4;
  const sliceDepth = 0.6;

  const sliceGeometry = new THREE.PlaneGeometry(aspectRatio, sliceDepth);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x112233),
    emissiveIntensity: 0.15,
  });

  const mesh = new THREE.Mesh(sliceGeometry, material);
  mesh.position.set(0, -sliceDepth / 2, 0);
  mesh.rotation.x = 0;

  return mesh;
}
