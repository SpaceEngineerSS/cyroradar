/* CRYORADAR — Volume Data Builder (v7.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Constructs Data3DTexture from radargram datasets for volumetric rendering.
 * Interpolates adjacent orbital tracks into a 3D voxel grid. */

import * as THREE from 'three';
import type { CryoDataset, VolumeData } from '../../types/types';

/**
 * Builds a 3D voxel volume from a single radargram.
 * Extrudes the 2D radargram across-track to create a pseudo-3D volume.
 * For true multi-track volumes, use buildVolumeFromMultipleTracks.
 *
 * @param dataset The radar dataset to volumetrize
 * @param sizeZ Cross-track depth (number of extruded slices)
 * @returns VolumeData with normalized voxels
 */
export function buildVolumeFromDataset(
  dataset: CryoDataset,
  sizeZ: number = 64
): VolumeData {
  const { radargram, geometry } = dataset;
  const sizeX = Math.min(radargram.width, 128);
  const sizeY = Math.min(radargram.height, 128);
  const voxels = new Float32Array(sizeX * sizeY * sizeZ);

  const { data, width, height, powerMin, powerMax } = radargram;
  const range = powerMax - powerMin;

  for (let z = 0; z < sizeZ; z++) {
    const crossTrackFade = 1 - Math.abs(z - sizeZ / 2) / (sizeZ / 2);
    const fade = 0.3 + 0.7 * crossTrackFade * crossTrackFade;

    for (let y = 0; y < sizeY; y++) {
      const srcY = Math.floor((y / sizeY) * height);
      for (let x = 0; x < sizeX; x++) {
        const srcX = Math.floor((x / sizeX) * width);
        const val = data[srcY * width + srcX];
        const norm = range > 0 ? Math.max(0, Math.min(1, (val - powerMin) / range)) : 0;
        voxels[z * sizeY * sizeX + y * sizeX + x] = norm * fade;
      }
    }
  }

  const minLat = geometry.latitudes[0];
  const maxLat = geometry.latitudes[radargram.width - 1];
  const minLon = geometry.longitudes[0];
  const maxLon = geometry.longitudes[radargram.width - 1];

  return {
    sizeX, sizeY, sizeZ, voxels,
    bounds: {
      minLat, maxLat, minLon, maxLon,
      maxDepthM: radargram.height * radargram.sampleInterval * 299_792_458 / (2 * Math.sqrt(3.15)),
    },
  };
}

/**
 * Creates a Three.js Data3DTexture from a VolumeData object.
 */
export function createData3DTexture(volume: VolumeData): THREE.Data3DTexture {
  const { sizeX, sizeY, sizeZ, voxels } = volume;

  const uint8Data = new Uint8Array(sizeX * sizeY * sizeZ);
  for (let i = 0; i < voxels.length; i++) {
    uint8Data[i] = Math.round(Math.max(0, Math.min(1, voxels[i])) * 255);
  }

  const texture = new THREE.Data3DTexture(uint8Data, sizeX, sizeY, sizeZ);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  return texture;
}
