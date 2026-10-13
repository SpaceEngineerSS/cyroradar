/* Dielectric loss.
 *
 * Field attenuation constant of a plane wave in a non-magnetic lossy medium
 * with complex permittivity ε = ε'(1 − j tanδ):
 *
 *   α = (ω/c) · √(ε'/2) · √(√(1 + tan²δ) − 1)          [Np/m]
 *
 * For tanδ ≪ 1 this reduces to α ≈ π f √ε' tanδ / c. Power falls as e^(−2αz),
 * so the power loss in decibels is 20·log10(e)·α = 8.686·α dB/m.
 *
 * Check (20 MHz, water ice ε' = 3.15, tanδ = 1e-3):
 *   α ≈ 3.72e-4 Np/m → 3.23e-3 dB/m → 6.5 dB two-way through 1 km.
 *
 *   Ulaby, Moore & Fung (1986), Microwave Remote Sensing, vol. III, App. E
 *   Seu et al. (2007), JGR 112, E05S05 */

import { SPEED_OF_LIGHT } from './constants';

const NP_TO_DB = 20 / Math.LN10;

export function attenuationNpPerMeter(frequencyHz: number, permittivity: number, lossTangent: number): number {
  if (!(frequencyHz > 0)) throw new RangeError('Frequency must be > 0');
  if (!(permittivity >= 1)) throw new RangeError('Permittivity must be ≥ 1');
  if (!(lossTangent >= 0)) throw new RangeError('Loss tangent must be ≥ 0');
  const omega = 2 * Math.PI * frequencyHz;
  return (omega / SPEED_OF_LIGHT) * Math.sqrt(permittivity / 2) * Math.sqrt(Math.sqrt(1 + lossTangent * lossTangent) - 1);
}

/** One-way power loss per metre, dB/m. */
export function lossDbPerMeter(frequencyHz: number, permittivity: number, lossTangent: number): number {
  return attenuationNpPerMeter(frequencyHz, permittivity, lossTangent) * NP_TO_DB;
}

export interface LossLayer {
  permittivity: number;
  lossTangent: number;
  thicknessM: number;
}

/** Two-way dielectric loss through a stack of layers, dB (positive number). */
export function twoWayLossDb(frequencyHz: number, layers: readonly LossLayer[]): number {
  let total = 0;
  for (const l of layers) total += 2 * lossDbPerMeter(frequencyHz, l.permittivity, l.lossTangent) * Math.max(0, l.thicknessM);
  return total;
}
