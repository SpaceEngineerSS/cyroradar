/* RMS velocity of a layered medium (Dix 1955).
 *
 *   V_rms(t)² = Σ vᵢ² Δtᵢ / Σ Δtᵢ
 *
 * where vᵢ = c/√εᵢ and Δtᵢ is the round-trip time spent in layer i up to the
 * delay t. Migration uses V_rms(t) to build diffraction hyperbolas.
 *
 *   Dix, C.H. (1955), Geophysics 20(1), 68–86
 *   Yilmaz, Ö. (2001), Seismic Data Analysis, SEG, ch. 3 */

import { SPEED_OF_LIGHT } from './constants';
import type { VelocityLayer } from './depth-conversion';

export interface DixResult {
  vrms: number;
  totalTwoWayTimeS: number;
  intervalVelocities: number[];
}

export function computeDixVRMS(layers: readonly VelocityLayer[]): DixResult {
  let sumV2dt = 0;
  let sumDt = 0;
  const intervalVelocities: number[] = [];
  for (const layer of layers) {
    const v = SPEED_OF_LIGHT / Math.sqrt(Math.max(1, layer.permittivity));
    const dt = (2 * Math.max(0, layer.thicknessM)) / v;
    intervalVelocities.push(v);
    sumV2dt += v * v * dt;
    sumDt += dt;
  }
  return {
    vrms: sumDt > 0 ? Math.sqrt(sumV2dt / sumDt) : SPEED_OF_LIGHT,
    totalTwoWayTimeS: sumDt,
    intervalVelocities,
  };
}

/**
 * V_rms sampled at every delay below the surface: profile[k] is the RMS
 * velocity for a round-trip delay of k·dt below the surface echo.
 * Below the model the last layer continues; an empty model uses the bulk ε.
 */
export function buildVRMSProfile(
  layers: readonly VelocityLayer[],
  numSamples: number,
  sampleInterval: number,
  bulkPermittivity = 3.15,
): Float32Array {
  const profile = new Float32Array(numSamples);
  const stack = layers.filter(l => l.thicknessM > 0);
  const tailEps = stack.length > 0 ? stack[stack.length - 1].permittivity : bulkPermittivity;
  const tailV = SPEED_OF_LIGHT / Math.sqrt(Math.max(1, tailEps));

  let layerIdx = 0;
  let layerStartT = 0;
  let sumV2dtBefore = 0;

  for (let k = 0; k < numSamples; k++) {
    const t = k * sampleInterval;
    while (layerIdx < stack.length) {
      const l = stack[layerIdx];
      const v = SPEED_OF_LIGHT / Math.sqrt(Math.max(1, l.permittivity));
      const dt = (2 * l.thicknessM) / v;
      if (t <= layerStartT + dt) break;
      sumV2dtBefore += v * v * dt;
      layerStartT += dt;
      layerIdx++;
    }
    const v = layerIdx < stack.length
      ? SPEED_OF_LIGHT / Math.sqrt(Math.max(1, stack[layerIdx].permittivity))
      : tailV;
    profile[k] = t > 0 ? Math.sqrt((sumV2dtBefore + v * v * (t - layerStartT)) / t) : v;
  }
  return profile;
}

export type DixLayer = VelocityLayer;
