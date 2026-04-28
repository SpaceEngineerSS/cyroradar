/* CRYORADAR — Physical Constants (Production)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Production: Mars-focused — SHARAD and MARSIS instrument parameters.
 *
 * References:
 *   Seu et al. (2007), JGR 112, E05S05 — SHARAD
 *   Picardi et al. (2005), Science 310, 1925–1928 — MARSIS */

export const SPEED_OF_LIGHT = 299_792_458;

/* ── Mars Instruments ───────────────────────────────────── */

export const SHARAD = {
  centerFrequencyHz: 20e6,
  bandwidthHz: 10e6,
  sampleIntervalS: 0.075e-6,
  verticalResolutionFreeSpaceM: 15,
  alongTrackResolutionM: 300,
  maxPenetrationDepthM: 3000,
} as const;

export const MARSIS = {
  bandFrequenciesHz: [1.8e6, 3.0e6, 4.0e6, 5.0e6] as const,
  bandwidthHz: 1e6,
  sampleIntervalS: 0.1e-6,
  verticalResolutionFreeSpaceM: 150,
  alongTrackResolutionM: 5000,
  maxPenetrationDepthM: 5000,
} as const;

/* ── Mars Physical Parameters ───────────────────────────── */

export const MARS_PARAMS = {
  gravity: 3.72,
  surfaceTempK: 210,
  meanRadiusM: 3389.5e3,
  label: 'Mars',
} as const;
