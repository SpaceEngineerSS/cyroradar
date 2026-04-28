/* CRYORADAR — Mars Surface Terrain (Three.js)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Generates a 3D terrain mesh from MOLA elevation data using
 * PlaneGeometry with vertex displacement. */

import * as THREE from 'three';
import type { GeometryData } from '../../types/types';

const MARS_COLOR_LOW = new THREE.Color(0x8b4513);
const MARS_COLOR_HIGH = new THREE.Color(0xd2691e);
const MAX_GRID = 256;

export function buildMarsTerrainMesh(
  geometry: GeometryData,
  traceCount: number
): THREE.Mesh {
  const segX = Math.min(traceCount - 1, MAX_GRID);
  const segY = 64;
  const aspectRatio = 4;

  const plane = new THREE.PlaneGeometry(aspectRatio, 1, segX, segY);
  plane.rotateX(-Math.PI / 2);

  const positions = plane.attributes.position;
  const colors = new Float32Array(positions.count * 3);

  const elevations = geometry.surfaceElevation;
  let minElev = Infinity, maxElev = -Infinity;
  for (let i = 0; i < elevations.length; i++) {
    if (elevations[i] < minElev) minElev = elevations[i];
    if (elevations[i] > maxElev) maxElev = elevations[i];
  }
  const elevRange = maxElev - minElev || 1;
  const verticalScale = 0.3;

  for (let i = 0; i < positions.count; i++) {
    const ix = i % (segX + 1);
    const traceIdx = Math.floor((ix / segX) * (traceCount - 1));
    const normalized = (elevations[traceIdx] - minElev) / elevRange;

    positions.setY(i, normalized * verticalScale);

    const color = MARS_COLOR_LOW.clone().lerp(MARS_COLOR_HIGH, normalized);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  plane.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  plane.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(plane, material);
}
