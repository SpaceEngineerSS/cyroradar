/* CRYORADAR — Radar Link Budget Equation
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Implements the monostatic radar range equation for orbital ground-penetrating
 * radar. Core reference: Skolnik, M. I. (2001), Introduction to Radar Systems.
 *
 * Pr/Pt = G² λ² σ / ((4π)³ R⁴)
 *
 * For subsurface sounding radar:
 *   - σ is the effective scattering cross-section of the reflecting interface
 *   - Additional terms account for propagation through Martian subsurface  */

import { SPEED_OF_LIGHT, SHARAD, MARSIS } from './constants';

const K_BOLTZMANN = 1.380649e-23;

export interface RadarBudget {
  transmitPowerW: number;
  transmitPowerDbm: number;
  antennaGainDb: number;
  wavelengthM: number;
  rangeM: number;
  spreadingLossDb: number;
  receivedPowerDbm: number;
  systemNoiseDbm: number;
  snrDb: number;
}

export interface InstrumentSpec {
  transmitPowerW: number;
  antennaGainDb: number;
  systemTempK: number;
  noiseFigureDb: number;
  centerFrequencyHz: number;
  bandwidthHz: number;
  pulseCompressionGainDb: number;
  stackingGain: number;
}

export const SHARAD_SPEC: InstrumentSpec = {
  transmitPowerW: 10,
  antennaGainDb: 4.1,
  systemTempK: 500,
  noiseFigureDb: 3.5,
  centerFrequencyHz: 20e6,
  bandwidthHz: 10e6,
  pulseCompressionGainDb: 21.6,
  stackingGain: 8,
};

export const MARSIS_SPEC: InstrumentSpec = {
  transmitPowerW: 5,
  antennaGainDb: 2.0,
  systemTempK: 600,
  noiseFigureDb: 4.0,
  centerFrequencyHz: 4e6,
  bandwidthHz: 1e6,
  pulseCompressionGainDb: 16.0,
  stackingGain: 16,
};

function toDbm(watts: number): number {
  return 10 * Math.log10(watts) + 30;
}

export function computeWavelength(frequencyHz: number): number {
  return SPEED_OF_LIGHT / frequencyHz;
}

export function freeSpaceSpreadingLoss(rangeM: number, wavelengthM: number): number {
  return 20 * Math.log10((4 * Math.PI * rangeM) / wavelengthM);
}

export function surfaceReflectionLoss(permittivityAbove: number, permittivityBelow: number): number {
  const r = Math.pow(
    (Math.sqrt(permittivityAbove) - Math.sqrt(permittivityBelow)) /
    (Math.sqrt(permittivityAbove) + Math.sqrt(permittivityBelow)),
    2
  );
  return -10 * Math.log10(r);
}

export function subsurfaceAttenuationDb(
  frequencyHz: number,
  permittivity: number,
  lossTangent: number,
  thicknessM: number
): number {
  const alpha =
    (2 * Math.PI * frequencyHz * lossTangent * Math.sqrt(permittivity)) / SPEED_OF_LIGHT;
  return 2 * alpha * thicknessM * (20 / Math.LN10);
}

export function systemNoisePower(spec: InstrumentSpec): number {
  const noiseW = K_BOLTZMANN * spec.systemTempK * spec.bandwidthHz;
  return noiseW * Math.pow(10, spec.noiseFigureDb / 10);
}

export function computeRadarBudget(
  spec: InstrumentSpec,
  rangeM: number,
  surfaceReflectivity: number = 0.02
): RadarBudget {
  const wavelength = computeWavelength(spec.centerFrequencyHz);
  const sigma = surfaceReflectivity * Math.PI * Math.pow(wavelength * rangeM, 0.5);

  const numerator =
    spec.transmitPowerW *
    Math.pow(10, (2 * spec.antennaGainDb) / 10) *
    Math.pow(wavelength, 2) *
    sigma;
  const denominator = Math.pow(4 * Math.PI, 3) * Math.pow(rangeM, 4);

  const prW = numerator / denominator;
  const prWithGains = prW
    * Math.pow(10, spec.pulseCompressionGainDb / 10)
    * spec.stackingGain;

  const noisePowerW = systemNoisePower(spec);
  const spreading = freeSpaceSpreadingLoss(rangeM, wavelength);

  return {
    transmitPowerW: spec.transmitPowerW,
    transmitPowerDbm: toDbm(spec.transmitPowerW),
    antennaGainDb: spec.antennaGainDb,
    wavelengthM: wavelength,
    rangeM,
    spreadingLossDb: spreading,
    receivedPowerDbm: toDbm(prWithGains),
    systemNoiseDbm: toDbm(noisePowerW),
    snrDb: toDbm(prWithGains) - toDbm(noisePowerW),
  };
}

export function minimumDetectableDepth(
  instrument: 'SHARAD' | 'MARSIS',
  permittivity: number,
  lossTangent: number
): number {
  const spec = instrument === 'SHARAD' ? SHARAD_SPEC : MARSIS_SPEC;
  const orbitAltitude = instrument === 'SHARAD' ? 300e3 : 800e3;

  const budget = computeRadarBudget(spec, orbitAltitude);
  const availableSNR = budget.snrDb;

  const freq = spec.centerFrequencyHz;
  const c = SPEED_OF_LIGHT;
  const alphaDbPerM = (2 * Math.PI * freq * lossTangent * Math.sqrt(permittivity) / c)
    * (20 / Math.LN10) * 2;

  if (alphaDbPerM <= 0) return instrument === 'SHARAD' ? SHARAD.maxPenetrationDepthM : MARSIS.maxPenetrationDepthM;
  return Math.min(
    availableSNR / alphaDbPerM,
    instrument === 'SHARAD' ? SHARAD.maxPenetrationDepthM : MARSIS.maxPenetrationDepthM
  );
}
