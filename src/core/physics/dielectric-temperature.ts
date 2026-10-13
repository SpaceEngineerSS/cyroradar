/* Temperature-dependent permittivity of the materials that matter most here.
 *
 * Water ice: Debye relaxation plus an impurity conduction term. Pure ice is
 * nearly lossless at HF below ~250 K; the loss measured in polar ice sheets
 * comes from soluble impurities, modelled as an Arrhenius conductivity.
 *
 *   ε_s(T)  = 20715 / (T − 6.6)                          (Johari & Whalley 1981)
 *   τ(T)    = 5.3e-16 · exp(0.57 eV / kT)  s
 *   σ(T)    = σ_r · exp(−E/k · (1/T − 1/T_r)),  σ_r = 10 µS/m at 251 K, E = 0.22 eV
 *   ε'' = Δε·ωτ/(1 + ω²τ²) + σ/(ω ε₀)
 *
 *   Johari & Whalley (1981), J. Chem. Phys. 75, 1333
 *   MacGregor et al. (2007), JGR 112, F03008
 *   Sihvola (1999), Electromagnetic Mixing Formulas and Applications */

const K_B_EV = 8.617333e-5;
const EPS0 = 8.8541878128e-12;

export interface ComplexPermittivity {
  real: number;
  imaginary: number;
  lossTangent: number;
}

function result(real: number, imaginary: number): ComplexPermittivity {
  return { real, imaginary, lossTangent: imaginary / real };
}

export function waterIcePermittivity(temperatureK: number, frequencyHz = 20e6): ComplexPermittivity {
  const T = Math.min(270, Math.max(120, temperatureK));
  const epsInf = 3.15;
  const epsS = 20715 / (T - 6.6);
  const tau = 5.3e-16 * Math.exp(0.57 / (K_B_EV * T));
  const omega = 2 * Math.PI * frequencyHz;
  const wt = omega * tau;
  const debyeReal = epsInf + (epsS - epsInf) / (1 + wt * wt);
  const debyeImag = ((epsS - epsInf) * wt) / (1 + wt * wt);
  const sigma = 1e-5 * Math.exp((-0.22 / K_B_EV) * (1 / T - 1 / 251));
  return result(debyeReal, debyeImag + sigma / (omega * EPS0));
}

/** Maxwell Garnett mixing of spherical inclusions in a host. */
function maxwellGarnett(host: number, inclusion: number, volumeFraction: number): number {
  const f = Math.min(0.99, Math.max(0, volumeFraction));
  const beta = (inclusion - host) / (inclusion + 2 * host);
  return (host * (1 + 2 * f * beta)) / (1 - f * beta);
}

/** Ice with basaltic dust inclusions (ε_dust ≈ 7.5, tanδ ≈ 0.015). */
export function dustyIcePermittivity(temperatureK: number, dustFraction: number, frequencyHz = 20e6): ComplexPermittivity {
  const ice = waterIcePermittivity(temperatureK, frequencyHz);
  const f = Math.min(0.99, Math.max(0, dustFraction));
  const real = maxwellGarnett(ice.real, 7.5, f);
  const tan = (1 - f) * ice.lossTangent + f * 0.015;
  return result(real, real * tan);
}
