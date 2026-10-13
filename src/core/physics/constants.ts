/* Physical constants and instrument parameters.
 *
 * SHARAD values follow the US radargram archive (MRO-M-SHARAD-5-RADARGRAM-V2.0):
 * 0.0375 µs round-trip delay spacing, 128 columns per degree (~460 m).
 * MARSIS values are used only by the synthetic generator.
 *
 *   Seu et al. (2007), JGR 112, E05S05 (SHARAD)
 *   Picardi et al. (2005), Science 310, 1925–1928 (MARSIS) */

export const SPEED_OF_LIGHT = 299_792_458;

/** Two-way time → one-way depth in vacuum, m per second. */
export const HALF_C = SPEED_OF_LIGHT / 2;

export const SHARAD = {
  centerFrequencyHz: 20e6,
  bandwidthHz: 10e6,
  sampleIntervalS: 0.0375e-6,
  traceSpacingM: 460,
  orbitAltitudeM: 300e3,
} as const;

export const MARSIS = {
  centerFrequencyHz: 4e6,
  bandwidthHz: 1e6,
  sampleIntervalS: 0.1e-6,
  traceSpacingM: 1000,
  orbitAltitudeM: 800e3,
} as const;

export type InstrumentId = 'SHARAD' | 'MARSIS';

export const INSTRUMENTS = { SHARAD, MARSIS } as const;
