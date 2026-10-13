import { describe, it, expect } from 'vitest';
import {
  computeStokesVector,
  pauliDecomposition,
  cloudePottierFromEigenvalues,
} from './polsar';

describe('PolSAR Decomposition', () => {
  describe('computeStokesVector', () => {
    it('S0 ≥ 0 (total intensity non-negative)', () => {
      const sv = computeStokesVector(1, 0.5, 0.8, 0.3);
      expect(sv.s0).toBeGreaterThanOrEqual(0);
    });

    it('S0² ≥ S1² + S2² + S3² (physical constraint)', () => {
      const sv = computeStokesVector(2, 1, 1.5, 0.5);
      const lhs = sv.s0 * sv.s0;
      const rhs = sv.s1 * sv.s1 + sv.s2 * sv.s2 + sv.s3 * sv.s3;
      expect(lhs).toBeGreaterThanOrEqual(rhs - 1e-10);
    });

    it('horizontal-only polarization: S0 = S1, S2 = S3 = 0', () => {
      const sv = computeStokesVector(1, 0, 0, 0);
      expect(sv.s0).toBeCloseTo(1);
      expect(sv.s1).toBeCloseTo(1);
      expect(sv.s2).toBeCloseTo(0);
      expect(sv.s3).toBeCloseTo(0);
    });
  });

  describe('pauliDecomposition', () => {
    it('power conservation: surface + dihedral + volume = total', () => {
      const pauli = pauliDecomposition([1, 0.2], [0.3, 0.1], [0.3, 0.1], [0.8, -0.1]);
      const sum = pauli.surface + pauli.dihedral + pauli.volume;
      expect(sum).toBeCloseTo(pauli.totalPower, 10);
    });

    it('all components non-negative', () => {
      const pauli = pauliDecomposition([1, 0], [0.5, 0.5], [0.5, 0.5], [1, 0]);
      expect(pauli.surface).toBeGreaterThanOrEqual(0);
      expect(pauli.dihedral).toBeGreaterThanOrEqual(0);
      expect(pauli.volume).toBeGreaterThanOrEqual(0);
    });

    it('identical HH and VV: dihedral → 0', () => {
      const pauli = pauliDecomposition([1, 0], [0, 0], [0, 0], [1, 0]);
      expect(pauli.dihedral).toBeCloseTo(0, 10);
      expect(pauli.surface).toBeGreaterThan(0);
    });
  });

  describe('cloudePottierFromEigenvalues', () => {
    it('entropy bounded: 0 ≤ H ≤ 1', () => {
      const cp = cloudePottierFromEigenvalues([10, 3, 1], [0.1, 0.5, 1.0]);
      expect(cp.entropy).toBeGreaterThanOrEqual(0);
      expect(cp.entropy).toBeLessThanOrEqual(1);
    });

    it('mean alpha bounded: 0 ≤ ᾱ ≤ π/2', () => {
      const cp = cloudePottierFromEigenvalues([5, 3, 2], [0.2, 0.8, 1.2]);
      expect(cp.meanAlpha).toBeGreaterThanOrEqual(0);
      expect(cp.meanAlpha).toBeLessThanOrEqual(Math.PI / 2);
    });

    it('anisotropy bounded: 0 ≤ A ≤ 1', () => {
      const cp = cloudePottierFromEigenvalues([10, 5, 1], [0, 0, 0]);
      expect(cp.anisotropy).toBeGreaterThanOrEqual(0);
      expect(cp.anisotropy).toBeLessThanOrEqual(1);
    });

    it('equal eigenvalues → maximum entropy (H ≈ 1)', () => {
      const cp = cloudePottierFromEigenvalues([1, 1, 1], [0, 0, 0]);
      expect(cp.entropy).toBeCloseTo(1, 1);
    });

    it('one dominant eigenvalue → low entropy (H ≈ 0)', () => {
      const cp = cloudePottierFromEigenvalues([1000, 0.001, 0.001], [0, 0, 0]);
      expect(cp.entropy).toBeLessThan(0.1);
    });
  });
});
