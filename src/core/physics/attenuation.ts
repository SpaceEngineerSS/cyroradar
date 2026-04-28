/* CRYORADAR — Signal Attenuation Model
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Power loss per unit distance for an EM wave in a lossy dielectric:
 *   α = (2πf · tan δ · √εᵣ) / c    [Np/m]
 *   α_dB = 8.686 · α                [dB/m]
 *
 * Two-way attenuation through a layer of thickness d:
 *   A = 2 · α_dB · d   [dB]
 *
 * Validation (SHARAD, 20 MHz, water ice: εᵣ=3.15, tan δ=10⁻³):
 *   α ≈ 7.43×10⁻⁴ Np/m → 0.00645 dB/m
 *   1 km two-way → ~12.9 dB (consistent with published values)
 *
 * References:
 *   Seu et al. (2007), JGR 112, E05S05
 *   Pettinelli et al. (2003), JGR 108, 8029 */

import { SPEED_OF_LIGHT } from './constants';
import type { AttenuationResult } from '../../types/types';

const NP_TO_DB = 8.685889638;

export function attenuationCoefficient(
  frequencyHz: number,
  permittivity: number,
  lossTangent: number
): number {
  if (frequencyHz <= 0) throw new RangeError('Frequency must be > 0');
  if (permittivity < 1) throw new RangeError('Permittivity must be ≥ 1');
  if (lossTangent < 0) throw new RangeError('Loss tangent must be ≥ 0');

  return (2 * Math.PI * frequencyHz * lossTangent * Math.sqrt(permittivity)) / SPEED_OF_LIGHT;
}

export function attenuationDbPerMeter(
  frequencyHz: number,
  permittivity: number,
  lossTangent: number
): number {
  return attenuationCoefficient(frequencyHz, permittivity, lossTangent) * NP_TO_DB;
}

export function layerAttenuation(
  frequencyHz: number,
  permittivity: number,
  lossTangent: number,
  thicknessM: number
): AttenuationResult {
  const alphaDbPerMeter = attenuationDbPerMeter(frequencyHz, permittivity, lossTangent);
  const oneWay = alphaDbPerMeter * thicknessM;

  return {
    alphaDbPerMeter,
    totalLossDb: oneWay,
    twoWayLossDb: 2 * oneWay,
  };
}

export interface AttenuationLayerDef {
  permittivity: number;
  lossTangent: number;
  thicknessM: number;
}

export function totalAttenuation(
  frequencyHz: number,
  layers: AttenuationLayerDef[]
): { perLayer: AttenuationResult[]; totalTwoWayDb: number } {
  let totalTwoWayDb = 0;
  const perLayer: AttenuationResult[] = [];

  for (const layer of layers) {
    const result = layerAttenuation(
      frequencyHz,
      layer.permittivity,
      layer.lossTangent,
      layer.thicknessM
    );
    perLayer.push(result);
    totalTwoWayDb += result.twoWayLossDb;
  }

  return { perLayer, totalTwoWayDb };
}

export function signalPowerAtDepth(
  initialPowerDb: number,
  frequencyHz: number,
  layers: AttenuationLayerDef[]
): number {
  const { totalTwoWayDb } = totalAttenuation(frequencyHz, layers);
  return initialPowerDb - totalTwoWayDb;
}
