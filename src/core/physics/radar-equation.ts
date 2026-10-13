/* Link budget for an orbital sounder over a flat, specular surface.
 *
 * For a smooth interface the image-source form of the radar equation applies
 * (no scattering cross-section): the echo behaves like a mirror image of the
 * antenna at twice the range.
 *
 *   P_r = P_t G² λ² Γ / ((4π)² (2H)²)
 *
 * A subsurface echo from depth d adds two-way transmission through the surface,
 * two-way dielectric loss, and the extra (refracted) range d/√ε:
 *
 *   P_sub = P_t G² λ² T² Γ_b 10^(−L/10) / ((4π)² (2(H + d/√ε))²)
 *
 * Noise is k·T_sys·B. At HF the system temperature is dominated by galactic
 * background, which is why T_sys is tens of thousands of kelvin here.
 * The instrument numbers below are nominal and meant for order-of-magnitude
 * work; the docs list their sources.
 *
 *   Picardi et al. (2005), Science 310, 1925–1928
 *   Seu et al. (2007), JGR 112, E05S05 */

import { SPEED_OF_LIGHT } from './constants';
import { fresnelReflection } from './fresnel';
import { lossDbPerMeter } from './attenuation';

const K_BOLTZMANN = 1.380649e-23;

export interface InstrumentSpec {
  transmitPowerW: number;
  antennaGainDbi: number;
  systemTempK: number;
  centerFrequencyHz: number;
  bandwidthHz: number;
  /** 10·log10(B·τ) for the transmitted chirp. */
  pulseCompressionGainDb: number;
  /** Coherent along-track (SAR / presumming) gain. */
  processingGainDb: number;
  orbitAltitudeM: number;
}

export const SHARAD_SPEC: InstrumentSpec = {
  transmitPowerW: 10,
  antennaGainDbi: 2.15,
  systemTempK: 3e4,
  centerFrequencyHz: 20e6,
  bandwidthHz: 10e6,
  pulseCompressionGainDb: 29.3,
  processingGainDb: 27,
  orbitAltitudeM: 300e3,
};

export const MARSIS_SPEC: InstrumentSpec = {
  transmitPowerW: 5,
  antennaGainDbi: 2.15,
  systemTempK: 1e6,
  centerFrequencyHz: 4e6,
  bandwidthHz: 1e6,
  pulseCompressionGainDb: 24,
  processingGainDb: 20,
  orbitAltitudeM: 800e3,
};

export interface RadarBudget {
  wavelengthM: number;
  rangeM: number;
  surfaceReflectivityDb: number;
  receivedPowerDbw: number;
  noisePowerDbw: number;
  /** SNR after pulse compression and processing gain. */
  snrDb: number;
}

const toDb = (x: number) => 10 * Math.log10(x);

function specularPowerW(spec: InstrumentSpec, rangeM: number, reflectivity: number): number {
  const lambda = SPEED_OF_LIGHT / spec.centerFrequencyHz;
  const g = 10 ** (spec.antennaGainDbi / 10);
  return (spec.transmitPowerW * g * g * lambda * lambda * reflectivity) / ((4 * Math.PI) ** 2 * (2 * rangeM) ** 2);
}

function noisePowerW(spec: InstrumentSpec): number {
  return K_BOLTZMANN * spec.systemTempK * spec.bandwidthHz;
}

export function computeRadarBudget(spec: InstrumentSpec, surfacePermittivity = 3.15): RadarBudget {
  const R = fresnelReflection(1, surfacePermittivity).reflectionCoefficient;
  const pr = specularPowerW(spec, spec.orbitAltitudeM, R);
  const noise = noisePowerW(spec);
  return {
    wavelengthM: SPEED_OF_LIGHT / spec.centerFrequencyHz,
    rangeM: spec.orbitAltitudeM,
    surfaceReflectivityDb: toDb(R),
    receivedPowerDbw: toDb(pr),
    noisePowerDbw: toDb(noise),
    snrDb: toDb(pr / noise) + spec.pulseCompressionGainDb + spec.processingGainDb,
  };
}

export interface SubsurfaceTarget {
  /** Medium the wave travels through. */
  permittivity: number;
  lossTangent: number;
  /** Permittivity below the reflector. */
  basalPermittivity: number;
}

/** SNR of a basal echo from `depthM`, dB. */
export function subsurfaceSnrDb(spec: InstrumentSpec, target: SubsurfaceTarget, depthM: number): number {
  const T = fresnelReflection(1, target.permittivity).transmissionCoefficient;
  const Rb = fresnelReflection(target.permittivity, target.basalPermittivity).reflectionCoefficient;
  const range = spec.orbitAltitudeM + depthM / Math.sqrt(target.permittivity);
  const lossDb = 2 * lossDbPerMeter(spec.centerFrequencyHz, target.permittivity, target.lossTangent) * depthM;
  const pr = specularPowerW(spec, range, T * T * Rb) * 10 ** (-lossDb / 10);
  return toDb(pr / noisePowerW(spec)) + spec.pulseCompressionGainDb + spec.processingGainDb;
}

/** Deepest depth at which the basal echo still clears `minSnrDb` (bisection, 0–20 km). */
export function maxDetectableDepth(spec: InstrumentSpec, target: SubsurfaceTarget, minSnrDb = 3): number {
  if (subsurfaceSnrDb(spec, target, 0) < minSnrDb) return 0;
  let lo = 0;
  let hi = 20_000;
  if (subsurfaceSnrDb(spec, target, hi) >= minSnrDb) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (subsurfaceSnrDb(spec, target, mid) >= minSnrDb) lo = mid;
    else hi = mid;
  }
  return lo;
}
