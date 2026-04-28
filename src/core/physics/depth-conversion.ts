/* CRYORADAR — Two-Way Time-Depth Conversion
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Derivation from first principles:
 *   In a medium with relative permittivity εᵣ and relative permeability μᵣ ≈ 1,
 *   the electromagnetic wave velocity is v = c / √εᵣ.
 *   For a two-way path through a layer of thickness d:
 *     t = 2d / v = 2d√εᵣ / c
 *   Solving for depth:
 *     d = c·t / (2√εᵣ)
 *
 *   For N stacked layers with different εᵣ values:
 *     d_total = Σᵢ cΔtᵢ / (2√εᵣᵢ)
 *
 * References:
 *   Seu et al. (2007), JGR 112, E05S05
 *   Bramson et al. (2015), GRL 42, 6566–6574 */

import { SPEED_OF_LIGHT } from './constants';
import type { DepthResult } from '../../types/types';

export function waveVelocity(permittivity: number): number {
  if (permittivity < 1) throw new RangeError('Permittivity must be ≥ 1');
  return SPEED_OF_LIGHT / Math.sqrt(permittivity);
}

export function timeToDepth(twoWayTimeS: number, permittivity: number): DepthResult {
  if (twoWayTimeS < 0) throw new RangeError('Travel time must be ≥ 0');
  if (permittivity < 1) throw new RangeError('Permittivity must be ≥ 1');

  const v = waveVelocity(permittivity);
  const depthMeters = (SPEED_OF_LIGHT * twoWayTimeS) / (2 * Math.sqrt(permittivity));

  return {
    depthMeters,
    travelTimeUs: twoWayTimeS * 1e6,
    velocityMps: v,
  };
}

export function depthToTime(depthM: number, permittivity: number): number {
  if (depthM < 0) throw new RangeError('Depth must be ≥ 0');
  if (permittivity < 1) throw new RangeError('Permittivity must be ≥ 1');
  return (2 * depthM * Math.sqrt(permittivity)) / SPEED_OF_LIGHT;
}

export interface LayerDefinition {
  permittivity: number;
  thicknessM: number;
}

export function multiLayerDepth(
  layers: LayerDefinition[]
): { totalDepth: number; perLayer: DepthResult[] } {
  let totalDepth = 0;
  const perLayer: DepthResult[] = [];

  for (const layer of layers) {
    const twoWayTime = depthToTime(layer.thicknessM, layer.permittivity);
    const result = timeToDepth(twoWayTime, layer.permittivity);
    perLayer.push(result);
    totalDepth += result.depthMeters;
  }

  return { totalDepth, perLayer };
}

export function sampleToDepth(
  sampleIndex: number,
  surfaceSample: number,
  sampleIntervalS: number,
  permittivity: number
): number {
  const deltaSamples = sampleIndex - surfaceSample;
  if (deltaSamples <= 0) return 0;
  const twoWayTime = deltaSamples * sampleIntervalS;
  return timeToDepth(twoWayTime, permittivity).depthMeters;
}

export function depthToSample(
  depthM: number,
  surfaceSample: number,
  sampleIntervalS: number,
  permittivity: number
): number {
  const twoWayTime = depthToTime(depthM, permittivity);
  return surfaceSample + twoWayTime / sampleIntervalS;
}

export function buildDepthAxis(
  numSamples: number,
  surfaceSample: number,
  sampleIntervalS: number,
  permittivity: number
): Float32Array {
  const axis = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    axis[i] = sampleToDepth(i, surfaceSample, sampleIntervalS, permittivity);
  }
  return axis;
}
