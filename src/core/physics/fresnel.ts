/* Normal-incidence Fresnel reflection between two non-magnetic dielectrics.
 *
 *   r = (√ε₁ − √ε₂) / (√ε₁ + √ε₂),   R = r²,   T = 1 − R
 *
 * The inverse (given R and the upper medium, find the lower medium) has two
 * roots. Bright basal reflections come from a denser lower medium, so we take
 * the ε₂ > ε₁ branch: √ε₂ = √ε₁ · (1 + √R) / (1 − √R).
 *
 *   Orosei et al. (2018), Science 361, 490–493 */

export interface FresnelResult {
  /** Power reflection coefficient R. */
  reflectionCoefficient: number;
  /** 10·log10(R); −Infinity for identical media. */
  reflectionDb: number;
  /** Power transmission coefficient T = 1 − R. */
  transmissionCoefficient: number;
}

export function fresnelReflection(epsilon1: number, epsilon2: number): FresnelResult {
  if (!(epsilon1 >= 1) || !(epsilon2 >= 1)) throw new RangeError('Permittivity must be ≥ 1');
  const a = Math.sqrt(epsilon1);
  const b = Math.sqrt(epsilon2);
  const R = ((a - b) / (a + b)) ** 2;
  return {
    reflectionCoefficient: R,
    reflectionDb: R > 0 ? 10 * Math.log10(R) : -Infinity,
    transmissionCoefficient: 1 - R,
  };
}

/** Permittivity of the lower medium that produces power reflectivity R under a medium of permittivity epsAbove. */
export function invertFresnel(R: number, epsAbove: number): number {
  const r = Math.sqrt(Math.min(0.999, Math.max(0, R)));
  const root = Math.sqrt(epsAbove) * (1 + r) / (1 - r);
  return root * root;
}
