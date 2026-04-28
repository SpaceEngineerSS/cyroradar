/* CRYORADAR — Dix Equation RMS Velocity Engine
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Computes depth-dependent RMS velocity profiles for multi-layered
 * subsurface models using the Dix (1955) equation.
 *
 * The constant-velocity assumption V = c/√ε is only valid for a
 * single homogeneous layer. Real Mars subsurfaces have stacked
 * layers with distinct dielectric properties. The Dix equation
 * computes the root-mean-square velocity that correctly describes
 * the hyperbolic moveout of reflections through N layers:
 *
 *   V_RMS,n = √( Σᵢ₌₁ⁿ Vᵢ² Δtᵢ / Σᵢ₌₁ⁿ Δtᵢ )
 *
 * Where:
 *   Vᵢ = c / √εᵢ    — interval velocity in layer i
 *   Δtᵢ = 2dᵢ / Vᵢ  — two-way travel time through layer i
 *
 * The resulting Float32Array V_RMS profile is passed to the SAR
 * Migration Worker for correct Kirchhoff delay computation.
 *
 * References:
 *   Dix, C.H. (1955), Geophysics 20(1), 68–86
 *   Yilmaz (2001), Seismic Data Analysis, SEG — Ch. 3 */

import { SPEED_OF_LIGHT } from './constants';

export interface DixLayer {
  permittivity: number;
  thicknessM: number;
}

export interface DixResult {
  vrms: number;
  totalTwoWayTimeS: number;
  intervalVelocities: number[];
}

/**
 * Computes depth-dependent RMS velocity profiles for a multi-layered subsurface
 * model using the Dix (1955) equation. Essential for accurate SAR time-to-depth migration.
 * 
 * @param layers Array of defined subsurface layers with permittivity and thickness.
 * @returns The RMS velocity, total two-way travel time, and interval velocities.
 * 
 * @see {@link https://doi.org/10.1190/1.1438126|Dix, C. H. (1955). Seismic velocities from surface measurements.}
 */
export function computeDixVRMS(layers: DixLayer[]): DixResult {
  if (layers.length === 0) {
    return { vrms: SPEED_OF_LIGHT, totalTwoWayTimeS: 0, intervalVelocities: [] };
  }

  let sumV2dt = 0;
  let sumDt = 0;
  const intervalVelocities: number[] = [];

  for (const layer of layers) {
    const eps = Math.max(1, layer.permittivity);
    const vi = SPEED_OF_LIGHT / Math.sqrt(eps);
    const dti = (2 * Math.max(0, layer.thicknessM)) / vi;

    intervalVelocities.push(vi);
    sumV2dt += vi * vi * dti;
    sumDt += dti;
  }

  const vrms = sumDt > 0 ? Math.sqrt(sumV2dt / sumDt) : SPEED_OF_LIGHT;

  return { vrms, totalTwoWayTimeS: sumDt, intervalVelocities };
}

/**
 * Builds a dense float array of the RMS velocity sampled at the radar temporal resolution.
 * This buffer is transferred zero-copy to the Web Worker for the O(N·A·M) migrated output.
 * 
 * @param layers Array of subsurface dielectric layers.
 * @param numSamples Number of vertical fast-time samples in the radargram.
 * @param sampleInterval The radar fast-time sampling interval (Δt).
 * @returns A Float32Array where index z is the RMS velocity mapping to sample z.
 */
export function buildVRMSProfile(
  layers: DixLayer[],
  numSamples: number,
  sampleInterval: number
): Float32Array {
  const profile = new Float32Array(numSamples);

  if (layers.length === 0) {
    profile.fill(SPEED_OF_LIGHT);
    return profile;
  }

  const layerBoundaries: { sampleEnd: number; vrmsAtEnd: number }[] = [];
  let cumulativeTimeS = 0;
  let sumV2dt = 0;

  for (const layer of layers) {
    const eps = Math.max(1, layer.permittivity);
    const vi = SPEED_OF_LIGHT / Math.sqrt(eps);
    const dti = (2 * Math.max(0, layer.thicknessM)) / vi;

    sumV2dt += vi * vi * dti;
    cumulativeTimeS += dti;

    const vrmsHere = Math.sqrt(sumV2dt / cumulativeTimeS);
    const sampleEnd = Math.floor(cumulativeTimeS / sampleInterval);

    layerBoundaries.push({ sampleEnd, vrmsAtEnd: vrmsHere });
  }

  let prevEnd = 0;
  for (const { sampleEnd, vrmsAtEnd } of layerBoundaries) {
    const end = Math.min(sampleEnd, numSamples);
    for (let s = prevEnd; s < end; s++) {
      profile[s] = vrmsAtEnd;
    }
    prevEnd = end;
  }

  const lastVrms = layerBoundaries[layerBoundaries.length - 1].vrmsAtEnd;
  for (let s = prevEnd; s < numSamples; s++) {
    profile[s] = lastVrms;
  }

  return profile;
}
