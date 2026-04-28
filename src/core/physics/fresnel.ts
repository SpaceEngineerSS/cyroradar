/* CRYORADAR — Fresnel Reflection Coefficients
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Normal-incidence power reflection at a planar interface.
 * Derived from boundary conditions of Maxwell's equations:
 *   v = c / √(εᵣ·μᵣ),  μᵣ ≈ 1 for non-magnetic media
 *   impedance η = η₀ / √εᵣ
 *   reflection coefficient r = (η₂ − η₁)/(η₂ + η₁)
 *   power R = |r|² = ((√ε₁ − √ε₂)/(√ε₁ + √ε₂))²
 *
 * References:
 *   Orosei et al. (2018), Science 361, 490–493
 *   Seu et al. (2007), JGR 112, E05S05 */

import type { FresnelResult } from '../../types/types';

export function fresnelReflection(epsilon1: number, epsilon2: number): FresnelResult {
  if (epsilon1 < 1 || epsilon2 < 1) {
    throw new RangeError('Dielectric permittivity must be ≥ 1');
  }

  const sqrtE1 = Math.sqrt(epsilon1);
  const sqrtE2 = Math.sqrt(epsilon2);
  const numerator = sqrtE1 - sqrtE2;
  const denominator = sqrtE1 + sqrtE2;

  const R = (numerator / denominator) ** 2;
  const T = 1 - R;
  const RdB = R > 0 ? 10 * Math.log10(R) : -Infinity;

  return {
    reflectionCoefficient: R,
    reflectionDb: RdB,
    transmissionCoefficient: T,
  };
}

export function fresnelReflectionComplex(
  epsilon1: number,
  tanDelta1: number,
  epsilon2: number,
  tanDelta2: number
): FresnelResult {
  if (epsilon1 < 1 || epsilon2 < 1) {
    throw new RangeError('Dielectric permittivity must be ≥ 1');
  }

  const re1 = epsilon1;
  const im1 = -epsilon1 * tanDelta1;
  const re2 = epsilon2;
  const im2 = -epsilon2 * tanDelta2;

  const mag1 = Math.sqrt(re1 * re1 + im1 * im1);
  const phase1 = Math.atan2(im1, re1);
  const sqrtMag1 = Math.sqrt(mag1);
  const sqrtPhase1 = phase1 / 2;
  const sqrtRe1 = sqrtMag1 * Math.cos(sqrtPhase1);
  const sqrtIm1 = sqrtMag1 * Math.sin(sqrtPhase1);

  const mag2 = Math.sqrt(re2 * re2 + im2 * im2);
  const phase2 = Math.atan2(im2, re2);
  const sqrtMag2 = Math.sqrt(mag2);
  const sqrtPhase2 = phase2 / 2;
  const sqrtRe2 = sqrtMag2 * Math.cos(sqrtPhase2);
  const sqrtIm2 = sqrtMag2 * Math.sin(sqrtPhase2);

  const diffRe = sqrtRe1 - sqrtRe2;
  const diffIm = sqrtIm1 - sqrtIm2;
  const sumRe = sqrtRe1 + sqrtRe2;
  const sumIm = sqrtIm1 + sqrtIm2;

  const diffMagSq = diffRe * diffRe + diffIm * diffIm;
  const sumMagSq = sumRe * sumRe + sumIm * sumIm;

  const R = sumMagSq > 0 ? diffMagSq / sumMagSq : 0;
  const T = 1 - R;
  const RdB = R > 0 ? 10 * Math.log10(R) : -Infinity;

  return {
    reflectionCoefficient: R,
    reflectionDb: RdB,
    transmissionCoefficient: T,
  };
}

export function reflectionDifference(
  epsilonBase: number,
  epsilonTarget1: number,
  epsilonTarget2: number
): number {
  const r1 = fresnelReflection(epsilonBase, epsilonTarget1);
  const r2 = fresnelReflection(epsilonBase, epsilonTarget2);
  return r2.reflectionDb - r1.reflectionDb;
}
