/* Polarimetric decomposition.
 *
 * SHARAD and MARSIS both transmit and receive a single linear polarisation, so
 * nothing in their archives can be decomposed. This module answers a what-if
 * question instead: if a fully polarimetric sounder flew over the same scene,
 * which scattering mechanisms would the decompositions report? The scattering
 * matrix is simulated from the radargram (see simulatePolSAR below), and the
 * standard decompositions are applied to it.
 *
 * Decomposition chain:
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

import type { StokesVector, PauliComponents, CloudePottierParams, PolSARResult, RadargramData } from '../../types/types';
import { seededRandom } from '../util/random';

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
  // Sort by eigenvalue, largest first, keeping each alpha with its eigenvalue.
  const order = [0, 1, 2].sort((a, b) => eigenvalues[b] - eigenvalues[a]);
  eigenvalues = [eigenvalues[order[0]], eigenvalues[order[1]], eigenvalues[order[2]]];
  alphas = [alphas[order[0]], alphas[order[1]], alphas[order[2]]];
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

/* Simulation ------------------------------------------------------------- */

/** Grid cap so very large radargrams stay within a few MB per channel. */
const MAX_PIXELS = 400_000;

/**
 * Simulates a scattering matrix per pixel and decomposes it.
 *
 * Model: sharp local maxima along a trace (specular interfaces) scatter mostly
 * as surfaces; diffuse energy between interfaces is treated as volume
 * scattering from dust and inclusions; a small, random dihedral part stands in
 * for buried blocks and crevasse walls. Phases are random but seeded.
 */
export function simulatePolSAR(radargram: RadargramData, seed = 42): PolSARResult {
  const { width, height, data, powerMin, powerMax } = radargram;
  const step = Math.max(1, Math.ceil(Math.sqrt((width * height) / MAX_PIXELS)));
  const w = Math.ceil(width / step);
  const h = Math.ceil(height / step);
  const rng = seededRandom(seed);
  const range = powerMax - powerMin || 1;

  const entropy = new Float32Array(w * h);
  const alpha = new Float32Array(w * h);
  const anisotropy = new Float32Array(w * h);
  const surface = new Float32Array(w * h);
  const dihedral = new Float32Array(w * h);
  const volume = new Float32Array(w * h);

  let sumH = 0, sumA = 0, sumAn = 0, sumS = 0, sumD = 0, sumV = 0;

  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, y * step);
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, x * step);
      const v = data[sy * width + sx];
      const norm = Math.max(0.01, (v - powerMin) / range);
      // Peakedness: how much this sample stands out from its vertical neighbours.
      let local = 0;
      let n = 0;
      for (let k = -4; k <= 4; k++) {
        const yy = sy + k;
        if (yy < 0 || yy >= height || k === 0) continue;
        local += data[yy * width + sx];
        n++;
      }
      const peak = Math.min(1, Math.max(0, (v - local / Math.max(1, n)) / 12));

      const fs = 0.2 + 0.65 * peak;
      const fv = (0.12 + 0.45 * (1 - peak)) * (0.6 + 0.4 * norm);
      const fd = 0.03 + 0.07 * rng();
      const total = fs + fv + fd;
      const p = norm * norm;

      const ph = () => rng() * Math.PI * 2;
      const a1 = Math.sqrt((p * fs) / total);
      const a2 = Math.sqrt((p * fd) / total);
      const a3 = Math.sqrt((p * fv) / total / 2);
      const p1 = ph(), p2 = ph(), p3 = ph();
      // Pauli basis: HH + VV ∝ surface, HH − VV ∝ dihedral, HV ∝ volume.
      const sHH: [number, number] = [(a1 * Math.cos(p1) + a2 * Math.cos(p2)) / Math.SQRT2, (a1 * Math.sin(p1) + a2 * Math.sin(p2)) / Math.SQRT2];
      const sVV: [number, number] = [(a1 * Math.cos(p1) - a2 * Math.cos(p2)) / Math.SQRT2, (a1 * Math.sin(p1) - a2 * Math.sin(p2)) / Math.SQRT2];
      const sHV: [number, number] = [a3 * Math.cos(p3), a3 * Math.sin(p3)];

      const pauli = pauliDecomposition(sHH, sHV, sHV, sVV);
      const tp = pauli.totalPower || 1e-20;
      // With the T3 matrix taken as diagonal, its eigenvectors are the Pauli
      // vectors, whose alpha angles are 0, π/2 and π/2.
      const cp = cloudePottierFromEigenvalues([pauli.surface, pauli.dihedral, pauli.volume], [0, Math.PI / 2, Math.PI / 2]);

      const i = y * w + x;
      entropy[i] = cp.entropy;
      alpha[i] = cp.meanAlpha;
      anisotropy[i] = cp.anisotropy;
      surface[i] = pauli.surface / tp;
      dihedral[i] = pauli.dihedral / tp;
      volume[i] = pauli.volume / tp;
      sumH += cp.entropy;
      sumA += cp.meanAlpha;
      sumAn += cp.anisotropy;
      sumS += surface[i];
      sumD += dihedral[i];
      sumV += volume[i];
    }
  }

  const N = w * h;
  return {
    width: w,
    height: h,
    stepX: step,
    stepY: step,
    entropy, alpha, anisotropy, surface, dihedral, volume,
    stats: {
      meanEntropy: sumH / N,
      meanAlphaDeg: ((sumA / N) * 180) / Math.PI,
      meanAnisotropy: sumAn / N,
      fractions: { surface: sumS / N, dihedral: sumD / N, volume: sumV / N },
    },
  };
}
