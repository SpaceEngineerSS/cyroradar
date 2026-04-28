/* CRYORADAR — Polarimetric SAR Decomposition Engine (Production)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Implements PolSAR decomposition chain for subsurface radar:
 *   1. Stokes Parameters — polarization state of the returned wave
 *   2. Pauli Decomposition — surface/dihedral/volume scattering power
 *   3. Cloude-Pottier Decomposition — entropy, alpha, anisotropy
 *
 * Stokes vector:
 *   S₀ = |E_H|² + |E_V|²
 *   S₁ = |E_H|² - |E_V|²
 *   S₂ = 2·Re(E_H·E_V*)
 *   S₃ = 2·Im(E_H·E_V*)
 *
 * Pauli decomposition power components:
 *   |α|² = |S_HH + S_VV|²/2   → surface (single-bounce)
 *   |β|² = |S_HH - S_VV|²/2   → dihedral (double-bounce)
 *   |γ|² = 2|S_HV|²            → volume scattering
 *
 * Cloude-Pottier (eigenvalue-based):
 *   T₃ coherency matrix → eigenvalues λ₁,λ₂,λ₃
 *   Entropy H = -Σ pᵢ·log₃(pᵢ)   where pᵢ = λᵢ/Σλⱼ
 *   Mean alpha ᾱ = Σ pᵢ·αᵢ
 *   Anisotropy A = (λ₂-λ₃)/(λ₂+λ₃)
 *
 * References:
 *   Cloude, S.R. & Pottier, E. (1997). An Entropy Based Classification
 *     Scheme for Land Applications of Polarimetric SAR. IEEE TGRS 35(1).
 *   Lee, J.S. & Pottier, E. (2009). Polarimetric Radar Imaging:
 *     From Basics to Applications. CRC Press. */

import type {
  StokesVector, PauliComponents, CloudePottierParams,
  PolSARPixel, PolSARResult, RadargramData,
} from '../../types/types';

/* ── Stokes Vector ──────────────────────────────────────── */

/**
 * Computes the Stokes vector from horizontal and vertical E-field amplitudes.
 * For subsurface radar, these are synthesized from the echo power profile.
 *
 * @param eHreal Real part of horizontal E-field
 * @param eHimag Imaginary part of horizontal E-field
 * @param eVreal Real part of vertical E-field
 * @param eVimag Imaginary part of vertical E-field
 * @returns Stokes vector [S0, S1, S2, S3]
 */
export function computeStokesVector(
  eHreal: number, eHimag: number,
  eVreal: number, eVimag: number
): StokesVector {
  const iH = eHreal * eHreal + eHimag * eHimag;
  const iV = eVreal * eVreal + eVimag * eVimag;

  const reHV = eHreal * eVreal + eHimag * eVimag;
  const imHV = eHimag * eVreal - eHreal * eVimag;

  return {
    s0: iH + iV,
    s1: iH - iV,
    s2: 2 * reHV,
    s3: 2 * imHV,
  };
}

/* ── Pauli Decomposition ────────────────────────────────── */

/**
 * Pauli decomposition of the scattering matrix.
 * Separates total backscattered power into three scattering mechanisms.
 *
 * @param sHH Complex HH scattering element [real, imag]
 * @param sHV Complex HV scattering element [real, imag]
 * @param sVH Complex VH scattering element [real, imag]
 * @param sVV Complex VV scattering element [real, imag]
 * @returns Surface, dihedral, and volume power components
 *
 * @see Cloude & Pottier (1997), IEEE TGRS 35(1)
 */
export function pauliDecomposition(
  sHH: [number, number],
  sHV: [number, number],
  _sVH: [number, number],
  sVV: [number, number]
): PauliComponents {
  const sumR = sHH[0] + sVV[0];
  const sumI = sHH[1] + sVV[1];
  const surface = (sumR * sumR + sumI * sumI) / 2;

  const diffR = sHH[0] - sVV[0];
  const diffI = sHH[1] - sVV[1];
  const dihedral = (diffR * diffR + diffI * diffI) / 2;

  const volume = 2 * (sHV[0] * sHV[0] + sHV[1] * sHV[1]);

  const totalPower = surface + dihedral + volume;

  return { surface, dihedral, volume, totalPower };
}

/* ── Cloude-Pottier Decomposition ───────────────────────── */

/**
 * Computes Cloude-Pottier entropy/alpha/anisotropy from eigenvalues.
 * For subsurface radar, entropy indicates scattering randomness and
 * alpha indicates the dominant scattering mechanism type.
 *
 * H → 0: single deterministic scattering (clean ice-rock interface)
 * H → 1: random volume scattering (dusty ice layers, NPLD/SPLD)
 * ᾱ → 0°: surface scattering
 * ᾱ → 45°: dipole scattering
 * ᾱ → 90°: dihedral scattering
 *
 * @param eigenvalues Three eigenvalues of the 3x3 coherency matrix T₃ [λ₁, λ₂, λ₃]
 * @param alphas Three alpha angles from eigenvector columns [α₁, α₂, α₃]
 * @returns Entropy H, mean alpha ᾱ, anisotropy A
 *
 * @see Cloude & Pottier (1997), IEEE TGRS 35(1)
 */
export function cloudePottierFromEigenvalues(
  eigenvalues: [number, number, number],
  alphas: [number, number, number]
): CloudePottierParams {
  const total = eigenvalues[0] + eigenvalues[1] + eigenvalues[2];
  const safeTotal = Math.max(total, 1e-20);

  const p = eigenvalues.map(l => Math.max(l, 1e-20) / safeTotal) as [number, number, number];

  const log3 = Math.log(3);
  const entropy = -p.reduce((sum, pi) => sum + pi * Math.log(pi) / log3, 0);

  const meanAlpha = p[0] * alphas[0] + p[1] * alphas[1] + p[2] * alphas[2];

  const l2l3sum = eigenvalues[1] + eigenvalues[2];
  const anisotropy = l2l3sum > 1e-20
    ? (eigenvalues[1] - eigenvalues[2]) / l2l3sum
    : 0;

  return {
    entropy: Math.max(0, Math.min(1, entropy)),
    meanAlpha: Math.max(0, Math.min(Math.PI / 2, meanAlpha)),
    anisotropy: Math.max(0, Math.min(1, Math.abs(anisotropy))),
  };
}

/* ── Synthetic PolSAR Generator ─────────────────────────── */

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/**
 * Generates synthetic PolSAR data from a radargram.
 * Synthesizes polarimetric channels based on Mars subsurface layer structure.
 *
 * For Mars polar layered deposits (NPLD/SPLD), volume scattering
 * indicates dust-laden ice layers, while surface scattering dominates
 * at clean ice-rock or ice-regolith interfaces.
 */
export function generateSyntheticPolSAR(
  radargram: RadargramData,
  seed: number = 42
): PolSARResult {
  const { width, height, data, powerMin, powerMax } = radargram;
  const rng = seededRandom(seed);
  const range = powerMax - powerMin;
  const pixels: PolSARPixel[] = [];

  for (let y = 0; y < height; y++) {
    const depthFrac = y / height;
    for (let x = 0; x < width; x++) {
      const val = data[y * width + x];
      const norm = range > 0 ? (val - powerMin) / range : 0;
      const amplitude = Math.max(0.01, norm);

      const surfaceFrac = depthFrac < 0.1 ? 0.8 : 0.2 + amplitude * 0.3;

      const volumeFrac = 0.05 + rng() * 0.1;

      const dihedralFrac = Math.max(0, 1 - surfaceFrac - volumeFrac);

      const power = amplitude * amplitude;
      const sHH: [number, number] = [
        Math.sqrt(power * (surfaceFrac + dihedralFrac)) * (0.8 + 0.4 * rng()),
        rng() * 0.1,
      ];
      const sVV: [number, number] = [
        Math.sqrt(power * surfaceFrac) * (0.8 + 0.4 * rng()),
        rng() * 0.1,
      ];
      const sHV: [number, number] = [
        Math.sqrt(power * volumeFrac * 0.5) * rng(),
        Math.sqrt(power * volumeFrac * 0.5) * rng(),
      ];

      const stokes = computeStokesVector(sHH[0], sHH[1], sVV[0], sVV[1]);
      const pauli = pauliDecomposition(sHH, sHV, sHV, sVV);

      const totalP = pauli.totalPower || 1e-20;
      const lambda1 = pauli.surface / totalP;
      const lambda2 = pauli.dihedral / totalP;
      const lambda3 = pauli.volume / totalP;

      const alpha1 = Math.acos(Math.min(1, Math.sqrt(lambda1)));
      const alpha2 = Math.acos(Math.min(1, Math.sqrt(Math.max(0, lambda2))));
      const alpha3 = Math.PI / 4;

      const cloudePottier = cloudePottierFromEigenvalues(
        [lambda1 * totalP, lambda2 * totalP, lambda3 * totalP],
        [alpha1, alpha2, alpha3]
      );

      pixels.push({ stokes, pauli, cloudePottier });
    }
  }

  return { width, height, pixels };
}
