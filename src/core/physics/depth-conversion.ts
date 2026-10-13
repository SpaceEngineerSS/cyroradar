/* Two-way time ↔ depth.
 *
 * In a layer with permittivity ε the wave speed is v = c/√ε, so a layer of
 * thickness d adds a round-trip delay of 2d√ε/c. Below the last layer of the
 * model we continue with the last layer's speed (or the bulk ε when the model
 * is empty).
 *
 *   Seu et al. (2007), JGR 112, E05S05 */

import { SPEED_OF_LIGHT } from './constants';

export interface VelocityLayer {
  permittivity: number;
  thicknessM: number;
}

/** Depth reached after a round-trip delay `t` below the surface, metres. */
export function timeToDepth(t: number, layers: readonly VelocityLayer[], bulkPermittivity = 3.15): number {
  if (!(t > 0)) return 0;
  let remaining = t;
  let depth = 0;
  for (const l of layers) {
    const sq = Math.sqrt(Math.max(1, l.permittivity));
    const layerTime = (2 * Math.max(0, l.thicknessM) * sq) / SPEED_OF_LIGHT;
    if (remaining <= layerTime) return depth + (remaining * SPEED_OF_LIGHT) / (2 * sq);
    remaining -= layerTime;
    depth += Math.max(0, l.thicknessM);
  }
  const tail = layers.length > 0 ? layers[layers.length - 1].permittivity : bulkPermittivity;
  return depth + (remaining * SPEED_OF_LIGHT) / (2 * Math.sqrt(Math.max(1, tail)));
}

/** Round-trip delay needed to reach `depth` metres below the surface. */
export function depthToTime(depth: number, layers: readonly VelocityLayer[], bulkPermittivity = 3.15): number {
  if (!(depth > 0)) return 0;
  let remaining = depth;
  let t = 0;
  for (const l of layers) {
    const sq = Math.sqrt(Math.max(1, l.permittivity));
    const d = Math.max(0, l.thicknessM);
    if (remaining <= d) return t + (2 * remaining * sq) / SPEED_OF_LIGHT;
    remaining -= d;
    t += (2 * d * sq) / SPEED_OF_LIGHT;
  }
  const tail = layers.length > 0 ? layers[layers.length - 1].permittivity : bulkPermittivity;
  return t + (2 * remaining * Math.sqrt(Math.max(1, tail))) / SPEED_OF_LIGHT;
}

export function sampleToDepth(
  sampleIndex: number,
  surfaceSample: number,
  sampleIntervalS: number,
  layers: readonly VelocityLayer[],
  bulkPermittivity = 3.15,
): number {
  return timeToDepth((sampleIndex - surfaceSample) * sampleIntervalS, layers, bulkPermittivity);
}
