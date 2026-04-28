/* CRYORADAR — Bayesian Hypothesis Engine
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Evaluates competing explanations for Bright Basal Reflections (BBR)
 * using Bayesian posterior probability:
 *
 *   P(Hᵢ | evidence) ∝ P(evidence | Hᵢ) × P(Hᵢ)
 *
 * Three hypotheses (Orosei 2018 vs Bierson 2021 debate):
 *   H₁ — Liquid Water:  ε ≥ 40, low slope, deep reflector
 *   H₂ — Smectite Clay: ε ~ 10-15 at 200K, high loss tangent
 *   H₃ — Off-Nadir Clutter: surface roughness artifact
 *
 * References:
 *   Orosei et al. (2018), Science 361, 490–493
 *   Bierson et al. (2021), GRL 48, e2021GL093880
 *   Stillman et al. (2010), JGR 115, E09005
 *   Smith et al. (2021), GRL 48, e2021GL093579 */

import type { HypothesisMatrix, CRISMPixel } from '../../types/types';

const PRIOR_WATER = 0.05;
const PRIOR_CLAY = 0.35;
const PRIOR_CLUTTER = 0.60;

function gaussianLikelihood(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z);
}

function exponentialDecay(x: number, scale: number): number {
  return Math.exp(-x / scale);
}

/**
 * Computes the Bayesian posterior probabilities for three competing BBR hypotheses.
 * This directly implements the scientific debates centered on Martian south polar caps.
 * 
 * @param apparentPermittivity Extracted dielectric constant (ε). Liquid water requires ε ≥ 40.
 * @param powerRatio Fresnel reflection power ratio (echo strength relative to surface).
 * @param surfaceSlopeDeg Off-nadir surface topography slope in degrees (clutter indicator).
 * @param depthM Depth of the reflector in meters.
 * @param crismPixel Co-located synthetic CRISM mineralogy data to evaluate smectite presence.
 * @returns A matrix containing posterior probabilities (pW, pC, pCl) and the dominant hypothesis.
 * 
 * @see {@link https://doi.org/10.1126/science.aar7268|Orosei et al., 2018 (Radar evidence of subglacial liquid water)}
 * @see {@link https://doi.org/10.1029/2021GL093880|Bierson et al., 2021 (Smectite clays explanation)}
 */
export function computeHypothesisMatrix(
  apparentPermittivity: number,
  powerRatio: number,
  surfaceSlopeDeg: number,
  depthM: number,
  crismPixel: CRISMPixel | null
): HypothesisMatrix {
  let lWater = 1.0;
  let lClay = 1.0;
  let lClutter = 1.0;

  lWater *= gaussianLikelihood(apparentPermittivity, 80, 20);
  lClay *= gaussianLikelihood(apparentPermittivity, 12, 3);
  lClutter *= 0.02;

  lWater *= gaussianLikelihood(powerRatio, 0.7, 0.2);
  lClay *= gaussianLikelihood(powerRatio, 0.3, 0.15);
  lClutter *= gaussianLikelihood(powerRatio, 0.25, 0.2);

  const slopeNorm = Math.min(surfaceSlopeDeg / 10, 1);
  lWater *= (1 - slopeNorm * 0.8);
  lClay *= (1 - slopeNorm * 0.3);
  lClutter *= (0.2 + slopeNorm * 0.8);

  lWater *= (1 - exponentialDecay(depthM, 500) * 0.3);
  lClay *= gaussianLikelihood(depthM, 800, 400);
  lClutter *= exponentialDecay(depthM, 200);

  if (crismPixel) {
    const clayStrength = crismPixel.clayIndex;
    lClay *= (1 + clayStrength * 2);
    lWater *= (1 + clayStrength * 0.3);

    if (crismPixel.mineralClass === 'phyllosilicate') {
      lClay *= 2.5;
    }
  }

  const postWater = lWater * PRIOR_WATER;
  const postClay = lClay * PRIOR_CLAY;
  const postClutter = lClutter * PRIOR_CLUTTER;

  const total = postWater + postClay + postClutter;
  const safeTotal = total > 0 ? total : 1e-10;

  const pW = postWater / safeTotal;
  const pC = postClay / safeTotal;
  const pCl = postClutter / safeTotal;

  let dominant: HypothesisMatrix['dominantHypothesis'] = 'clutter';
  if (pW >= pC && pW >= pCl) dominant = 'liquid-water';
  else if (pC >= pW && pC >= pCl) dominant = 'smectite-clay';

  return {
    pLiquidWater: Math.round(pW * 10000) / 10000,
    pSmectiteClay: Math.round(pC * 10000) / 10000,
    pClutter: Math.round(pCl * 10000) / 10000,
    dominantHypothesis: dominant,
  };
}
