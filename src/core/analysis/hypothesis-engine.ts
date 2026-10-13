/* Competing explanations for a bright basal reflection.
 *
 *   P(H | evidence) ∝ P(evidence | H) · P(H)
 *
 *   H₁ liquid water / brine   ε above ~20 (brines span roughly 25–90), deep, flat surface above
 *   H₂ smectite clay          ε ≈ 10–17 at ~200 K, favoured by CRISM clay signatures
 *   H₃ off-nadir clutter      a surface echo arriving late; favoured by slopes and shallow delays
 *
 * Likelihood terms are normalised densities or bounded factors in [0, 1], so no
 * single piece of evidence can dominate by construction. The priors below are
 * a deliberately sceptical starting point and are listed in the docs.
 *
 *   Orosei et al. (2018), Science 361, 490–493
 *   Bierson et al. (2021), GRL 48, e2021GL093880
 *   Smith et al. (2021), GRL 48, e2021GL093618
 *   Stillman et al. (2010), JGR 115, E09005 */

import type { HypothesisMatrix, CRISMPixel } from '../../types/types';

export const HYPOTHESIS_PRIORS = { water: 0.2, clay: 0.4, clutter: 0.4 } as const;

function normalPdf(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

export interface HypothesisEvidence {
  apparentPermittivity: number;
  surfaceSlopeDeg: number;
  depthM: number;
  crism?: CRISMPixel | null;
}

export function computeHypothesisMatrix(ev: HypothesisEvidence): HypothesisMatrix {
  const eps = Math.max(1, ev.apparentPermittivity);
  const slope = Math.min(1, Math.max(0, ev.surfaceSlopeDeg) / 5);
  const depth = Math.max(0, ev.depthM);

  // Permittivity: water and clay have characteristic ranges, clutter does not.
  // Water/brine is a plateau from ~22 upward rather than a peak: an estimate of
  // 120 is noisy, but it is not evidence against a wet base.
  let lWater = logistic((eps - 22) / 2.5) / 70;
  let lClay = normalPdf(eps, 13, 4);
  let lClutter = 1 / 60;

  // Surface slope raises the chance that the echo is off-nadir.
  lWater *= 1 - 0.6 * slope;
  lClay *= 1 - 0.3 * slope;
  lClutter *= 0.2 + 0.8 * slope;

  // Liquid water needs insulation and pressure; clutter favours short delays.
  lWater *= logistic((depth - 300) / 150);
  lClutter *= 0.1 + Math.exp(-depth / 600);

  if (ev.crism) {
    const c = Math.min(1, Math.max(0, ev.crism.clayIndex));
    lClay *= 0.5 + 1.5 * c;
    lWater *= 1.2 - 0.6 * c;
    if (ev.crism.mineralClass === 'phyllosilicate') {
      lClay *= 1.5;
      lWater *= 0.8;
    }
  }

  const pw = lWater * HYPOTHESIS_PRIORS.water;
  const pc = lClay * HYPOTHESIS_PRIORS.clay;
  const pk = lClutter * HYPOTHESIS_PRIORS.clutter;
  const total = pw + pc + pk || 1;

  const pLiquidWater = pw / total;
  const pSmectiteClay = pc / total;
  const pClutter = pk / total;

  let dominantHypothesis: HypothesisMatrix['dominantHypothesis'] = 'clutter';
  if (pLiquidWater >= pSmectiteClay && pLiquidWater >= pClutter) dominantHypothesis = 'liquid-water';
  else if (pSmectiteClay >= pClutter) dominantHypothesis = 'smectite-clay';

  return { pLiquidWater, pSmectiteClay, pClutter, dominantHypothesis };
}
