/* Envelope full-waveform inversion of a radargram window.
 *
 * Physics
 *   Exploding-reflector model: every permittivity contrast inside the window
 *   fires at t = 0 and the wave travels up at half the true speed, so one-way
 *   travel time equals the observed round-trip delay. The field obeys the 2-D
 *   scalar wave equation
 *
 *     (1/s²) ∂²u/∂t² = ∇²u + ρ(x, z) · w(t)
 *
 *   with speed s ∝ 1/√ε and source strength equal to the normal-incidence
 *   amplitude reflection coefficient between neighbouring cells,
 *   ρ = tanh(¼ Δln ε) = (√ε₂ − √ε₁)/(√ε₂ + √ε₁). Receivers sit along the top
 *   of the window.
 *
 * Data
 *   Radargrams are detected power with no phase, so we fit envelopes. The
 *   caller converts the observed amplitudes 10^(dB/20) to reflection-
 *   coefficient units using the surface echo of the same traces (with the
 *   surface Fresnel coefficient, surface transmission and two-way loss
 *   undone). A calibration run fixes the factor α that maps simulated |u| to
 *   the same units, so absolute contrasts are recoverable, not just their
 *   pattern.
 *
 * Gradient
 *   Adjoint-state method. The adjoint field is driven by the envelope residual
 *   at the receivers and propagated backward with the same scheme. The
 *   gradient has a reflectivity part (λ correlated with the source wavelet)
 *   and a velocity part (λ correlated with ∂²u/∂t², from snapshots taken once
 *   per data sample). Both are chained to ln ε on the coarse grid.
 *
 * Regularisation
 *   An envelope cannot tell a step up in ε from a step down of the same size,
 *   and it constrains contrasts better than absolute values. Two priors close
 *   that gap: a smoothed total-variation penalty on ln ε keeps the model blocky,
 *   and vertical decreases cost three times as much as increases, because
 *   compaction and a rock basement make ε grow with depth in most Martian
 *   settings. Clean-ice packets under dusty ones can still appear, they just
 *   need the data to ask for them. The weight is set relative to the starting
 *   misfit.
 *
 * Update
 *   Steepest descent on ln ε with along-track smoothing and a backtracking
 *   line search, so the objective never increases between iterations.
 *
 * What it does not model: attenuation, transmission loss, off-plane
 * scattering, and the overburden above the window (the window top is the
 * time datum). These are listed in the docs.
 *
 *   Tarantola (1984), Geophysics 49(8), 1259–1266
 *   Plessix (2006), Geophys. J. Int. 167, 495–503
 *   Bozdağ et al. (2011), Geophys. J. Int. 185, 845–870 (envelope misfit) */

import type { RadargramData, ROIBounds } from '../../../types/types';

/** Fine grid rows per data sample. */
const REFINE = 3;
const PAD = 12;
const EPS_MIN = 1.2;
const EPS_MAX = 90;
const ETA_MAX = 0.3;

export interface FWIGrid {
  nx: number;
  /** Coarse model rows (one per data sample after decimation). */
  nzc: number;
  /** Fine rows including pads. */
  nz: number;
  r: number;
  padTop: number;
  recvRow: number;
  /** Time steps per data sample. */
  K: number;
  /** Data samples simulated (nzc + wavelet delay + tail). */
  ntc: number;
  steps: number;
  /** Wavelet delay in data samples. */
  t0: number;
  epsRef: number;
  /** Lateral spacing in fine vertical cells. */
  dxn: number;
  dt: number;
  wavelet: Float32Array;
  /** Damping η per fine cell. */
  eta: Float32Array;
  decimX: number;
  decimZ: number;
}

export interface FWIProblem {
  grid: FWIGrid;
  /** Observed amplitude in reflection-coefficient units, nzc rows × nx, row-major. */
  observed: Float32Array;
  observedEnergy: number;
  initialLogEps: Float32Array;
  /** Maps simulated |u| to reflection-coefficient units; set by calibrate(). */
  alpha: number;
  /** Sum of the recorded calibration pulse divided by its peak, in data samples. */
  pulseArea: number;
}

export interface FWISetupOptions {
  maxNx: number;
  maxNz: number;
  epsRef: number;
  bandwidthHz: number;
  noiseFloorDb: number;
  /** Multiplier per radargram row that turns linear amplitude into reflection-coefficient units. */
  amplitudeGain?: (sample: number, trace: number) => number;
}

export function setupProblem(radargram: RadargramData, roi: ROIBounds, opt: FWISetupOptions): FWIProblem {
  const w = Math.max(2, roi.traceEnd - roi.traceStart);
  const h = Math.max(4, roi.sampleEnd - roi.sampleStart);
  const decimX = Math.max(1, Math.ceil(w / opt.maxNx));
  const decimZ = Math.max(1, Math.ceil(h / opt.maxNz));
  const nx = Math.max(1, Math.floor(w / decimX));
  const nzc = Math.max(4, Math.floor(h / decimZ));
  const dtS = radargram.sampleInterval * decimZ;

  // Block-average amplitudes onto the coarse grid and remove the noise level.
  const noiseAmp = 10 ** (opt.noiseFloorDb / 20);
  const observed = new Float32Array(nx * nzc);
  for (let k = 0; k < nzc; k++) {
    for (let x = 0; x < nx; x++) {
      let acc = 0;
      for (let dz = 0; dz < decimZ; dz++) {
        for (let dx = 0; dx < decimX; dx++) {
          const s = roi.sampleStart + k * decimZ + dz;
          const t = roi.traceStart + x * decimX + dx;
          const a = Math.max(0, 10 ** (radargram.data[s * radargram.width + t] / 20) - noiseAmp);
          acc += a * (opt.amplitudeGain ? opt.amplitudeGain(s, t) : 1);
        }
      }
      observed[k * nx + x] = acc / (decimX * decimZ);
    }
  }
  let observedEnergy = 0;
  let amax = 0;
  for (let i = 0; i < observed.length; i++) {
    observedEnergy += observed[i] * observed[i];
    amax = Math.max(amax, observed[i]);
  }

  const epsRef = Math.max(1.5, opt.epsRef);
  const r = REFINE;
  const sMax = r * Math.sqrt(epsRef / EPS_MIN);
  const dzM = (299_792_458 * dtS) / (2 * Math.sqrt(epsRef) * r);
  const dxn = Math.max(1, (radargram.traceSpacingM * decimX) / dzM);
  const K = Math.ceil((sMax * Math.sqrt(1 + 1 / (dxn * dxn))) / 0.85);
  const dt = 1 / K;

  // Source: derivative of a Gaussian, so a planar reflector records as a Gaussian pulse.
  const fwhm = Math.max(1.5, 1 / opt.bandwidthHz / dtS);
  const sigma = fwhm / 2.355;
  const t0 = Math.ceil(3 * sigma);
  const ntc = nzc + t0 + 2;
  const steps = ntc * K + 2;
  const wavelet = new Float32Array(steps);
  for (let n = 0; n < steps; n++) {
    const t = n * dt - t0;
    wavelet[n] = (-t / (sigma * sigma)) * Math.exp((-0.5 * t * t) / (sigma * sigma));
  }

  const nz = PAD + nzc * r + PAD;
  const eta = new Float32Array(nx * nz);
  for (let z = 0; z < nz; z++) {
    let d = 0;
    if (z < PAD) d = (PAD - z) / PAD;
    else if (z >= nz - PAD) d = (z - (nz - PAD - 1)) / PAD;
    for (let x = 0; x < nx; x++) eta[z * nx + x] = ETA_MAX * d * d;
  }

  // Starting model: the reference permittivity with a faint imprint of the
  // data. With a perfectly uniform start the predicted field is zero and the
  // envelope gradient vanishes; the imprint gives it something to grow from.
  const initialLogEps = new Float32Array(nx * nzc);
  const lnRef = Math.log(epsRef);
  for (let i = 0; i < initialLogEps.length; i++) initialLogEps[i] = lnRef + (amax > 0 ? 0.05 * (observed[i] / amax) : 0);

  const grid: FWIGrid = {
    nx, nzc, nz, r, padTop: PAD, recvRow: PAD, K, ntc, steps, t0, epsRef, dxn, dt, wavelet, eta, decimX, decimZ,
  };
  return { grid, observed, observedEnergy, initialLogEps, alpha: 1, pulseArea: 1 };
}

/* Model → fine-grid fields ------------------------------------------------ */

export interface FineFields {
  /** s² per fine cell. */
  c2: Float32Array;
  /** Reflectivity source strength per fine cell. */
  rho: Float32Array;
}

export function fineFields(grid: FWIGrid, logEps: Float32Array): FineFields {
  const { nx, nz, nzc, r, padTop, epsRef } = grid;
  const lnF = new Float32Array(nx * nz);
  const lnRef = Math.log(epsRef);
  for (let z = 0; z < nz; z++) {
    const k = z < padTop ? -1 : Math.min(nzc - 1, Math.floor((z - padTop) / r));
    for (let x = 0; x < nx; x++) lnF[z * nx + x] = k < 0 ? lnRef : logEps[k * nx + x];
  }
  const c2 = new Float32Array(nx * nz);
  const rho = new Float32Array(nx * nz);
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const i = z * nx + x;
      c2[i] = r * r * epsRef * Math.exp(-lnF[i]);
      rho[i] = z + 1 < nz ? Math.tanh(0.25 * (lnF[i + nx] - lnF[i])) : 0;
    }
  }
  return { c2, rho };
}

/** Chain fine-grid gradients (w.r.t. s² and ρ) to coarse ln ε. */
function chainToCoarse(grid: FWIGrid, fields: FineFields, gC2: Float32Array, gRho: Float32Array): Float32Array {
  const { nx, nz, nzc, r, padTop } = grid;
  const g = new Float32Array(nx * nzc);
  for (let z = padTop; z < padTop + nzc * r && z < nz; z++) {
    const k = Math.floor((z - padTop) / r);
    for (let x = 0; x < nx; x++) {
      const i = z * nx + x;
      // dρ/d(ln ε) = ±¼ (1 − ρ²) for the cell below / above the boundary.
      const fromRhoAbove = z > 0 ? 0.25 * (1 - fields.rho[i - nx] ** 2) * gRho[i - nx] : 0;
      const fromRhoHere = -0.25 * (1 - fields.rho[i] ** 2) * gRho[i];
      g[k * nx + x] += -fields.c2[i] * gC2[i] + fromRhoAbove + fromRhoHere;
    }
  }
  return g;
}

/* Misfit ------------------------------------------------------------------ */

export interface MisfitResult {
  J: number;
  alpha: number;
  /** Adjoint source per (data sample, trace) on the simulated time axis. */
  adjoint: Float32Array;
}

/** `recorded` has ntc rows × nx; row c + t0 corresponds to observed row c. */
function envelopeMisfit(problem: FWIProblem, recorded: Float32Array): MisfitResult {
  const { grid, observed, observedEnergy, alpha } = problem;
  const { nx, nzc, t0, ntc } = grid;
  // Smooths |u| near zero crossings so the misfit stays differentiable:
  // the equivalent of a reflection coefficient of 0.002.
  const delta = 0.002 / alpha;
  const norm = observedEnergy > 0 ? observedEnergy : 1;
  let J = 0;
  const adjoint = new Float32Array(ntc * nx);
  for (let c = 0; c < nzc; c++) {
    for (let x = 0; x < nx; x++) {
      const u = recorded[(c + t0) * nx + x];
      const E = Math.sqrt(u * u + delta * delta);
      const res = alpha * E - observed[c * nx + x];
      J += 0.5 * res * res;
      adjoint[(c + t0) * nx + x] = (res * alpha * (u / E)) / norm;
    }
  }
  return { J: J / norm, alpha, adjoint };
}

/* CPU solver -------------------------------------------------------------- */

export interface FWIBackend {
  readonly kind: 'cpu' | 'webgpu';
  /** Forward model; returns receiver traces (ntc × nx). */
  forward(fields: FineFields): Promise<Float32Array>;
  /** Gradients w.r.t. s² and ρ on the fine grid. */
  gradient(fields: FineFields, adjoint: Float32Array): Promise<{ gC2: Float32Array; gRho: Float32Array }>;
  dispose(): void;
}

function step(
  grid: FWIGrid, c2: Float32Array, src: Float32Array | null, srcScale: number,
  prev: Float32Array, curr: Float32Array, next: Float32Array,
) {
  const { nx, nz, dt, dxn, eta } = grid;
  const dt2 = dt * dt;
  const ix2 = 1 / (dxn * dxn);
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const i = z * nx + x;
      const u = curr[i];
      const l = x > 0 ? curr[i - 1] : u;
      const rr = x < nx - 1 ? curr[i + 1] : u;
      const up = z > 0 ? curr[i - nx] : 0;
      const dn = z < nz - 1 ? curr[i + nx] : 0;
      const lap = (l + rr - 2 * u) * ix2 + (up + dn - 2 * u);
      const f = src ? src[i] * srcScale : 0;
      const e = eta[i];
      next[i] = (2 * u - (1 - e) * prev[i] + dt2 * c2[i] * (lap + f)) / (1 + e);
    }
  }
}

export function createCpuBackend(grid: FWIGrid): FWIBackend {
  const N = grid.nx * grid.nz;
  const { nx, K, ntc, steps, recvRow, wavelet, dt } = grid;

  const runForward = (fields: FineFields, snapshots: Float32Array | null): Float32Array => {
    let prev = new Float32Array(N);
    let curr = new Float32Array(N);
    let next = new Float32Array(N);
    const rec = new Float32Array(ntc * nx);
    for (let n = 0; n < steps - 1; n++) {
      step(grid, fields.c2, fields.rho, wavelet[n], prev, curr, next);
      // `next` now holds step n + 1.
      const m = n + 1;
      if (m % K === 0) {
        const c = m / K;
        if (c < ntc) rec.set(next.subarray(recvRow * nx, recvRow * nx + nx), c * nx);
      }
      if (snapshots) {
        const c = Math.round(m / K);
        const off = m - c * K;
        if (c >= 1 && c < ntc && off >= -1 && off <= 1) snapshots.set(next, (c * 3 + off + 1) * N);
      }
      const t = prev;
      prev = curr;
      curr = next;
      next = t;
    }
    return rec;
  };

  return {
    kind: 'cpu',
    forward(fields) {
      return Promise.resolve(runForward(fields, null));
    },
    gradient(fields, adjoint) {
      const snaps = new Float32Array(ntc * 3 * N);
      runForward(fields, snaps);

      const gC2 = new Float32Array(N);
      const gRho = new Float32Array(N);
      let lNext = new Float32Array(N);
      let lCurr = new Float32Array(N);
      let lPrev = new Float32Array(N);
      const inj = new Float32Array(N);
      const dt2 = dt * dt;

      for (let n = steps - 1; n >= 1; n--) {
        // Inject the adjoint source at data samples.
        inj.fill(0);
        let hasSrc = false;
        if (n % K === 0) {
          const c = n / K;
          if (c < ntc) {
            // The step multiplies sources by dt²·s², so divide it out: the
            // discrete adjoint takes ∂J/∂u as-is.
            for (let x = 0; x < nx; x++) {
              const i = recvRow * nx + x;
              inj[i] = adjoint[c * nx + x] / (dt2 * fields.c2[i]);
            }
            hasSrc = true;
          }
        }
        step(grid, fields.c2, hasSrc ? inj : null, 1, lNext, lCurr, lPrev);
        // lPrev now holds λ at step n − 1; correlate λ at step n (lCurr).
        const w = wavelet[n - 1];
        for (let i = 0; i < N; i++) gRho[i] += lCurr[i] * w * dt2 * fields.c2[i];
        if (n % K === 0) {
          const c = n / K;
          if (c >= 1 && c < ntc) {
            const b = c * 3 * N;
            for (let i = 0; i < N; i++) {
              const d2 = snaps[b + 2 * N + i] - 2 * snaps[b + N + i] + snaps[b + i];
              gC2[i] += (K * lCurr[i] * d2) / fields.c2[i];
            }
          }
        }
        const t = lNext;
        lNext = lCurr;
        lCurr = lPrev;
        lPrev = t;
      }
      return Promise.resolve({ gC2, gRho });
    },
    dispose() {},
  };
}

/* Optimiser --------------------------------------------------------------- */

export interface FWIProgress {
  iteration: number;
  misfit: number;
  logEps: Float32Array;
  misfitHistory: number[];
}

export interface FWIRunOptions {
  iterations: number;
  /** TV weight as a fraction of the starting data misfit (default 0.05). */
  regularization?: number;
  signal?: { aborted: boolean };
  onIteration?: (p: FWIProgress) => void;
}

function smoothAlongTrack(g: Float32Array, nx: number, nzc: number): Float32Array {
  const out = new Float32Array(g.length);
  for (let k = 0; k < nzc; k++) {
    for (let x = 0; x < nx; x++) {
      let acc = 0;
      let w = 0;
      for (let d = -2; d <= 2; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= nx) continue;
        const wt = Math.exp(-0.5 * d * d);
        acc += g[k * nx + xx] * wt;
        w += wt;
      }
      out[k * nx + x] = acc / w;
    }
  }
  return out;
}

/**
 * Finds α by simulating one weak, flat contrast of known reflection
 * coefficient in the middle of the window and reading back its peak.
 */
export async function calibrate(problem: FWIProblem, backend: FWIBackend): Promise<number> {
  const { nx, nzc, epsRef } = problem.grid;
  const m = new Float32Array(nx * nzc);
  const lnRef = Math.log(epsRef);
  const k0 = Math.floor(nzc / 2);
  const step = 0.04;
  for (let k = 0; k < nzc; k++) for (let x = 0; x < nx; x++) m[k * nx + x] = lnRef + (k >= k0 ? step : 0);
  const rec = await backend.forward(fineFields(problem.grid, m));
  let peak = 0;
  let area = 0;
  const x = Math.floor(nx / 2);
  for (let c = 0; c < problem.grid.ntc; c++) {
    const v = Math.abs(rec[c * nx + x]);
    peak = Math.max(peak, v);
    area += v;
  }
  const r = Math.tanh(step / 4);
  problem.alpha = peak > 0 ? r / peak : 1;
  problem.pulseArea = peak > 0 ? area / peak : 1;
  return problem.alpha;
}

/**
 * Recursive starting model: read each data sample as a share of a reflection
 * coefficient (dividing by the pulse area) and integrate ln ε downward,
 * assuming the stack gets denser with depth.
 */
function recursiveStart(problem: FWIProblem): Float32Array {
  const { nx, nzc, epsRef } = problem.grid;
  const out = new Float32Array(nx * nzc);
  const lnRef = Math.log(epsRef);
  const hi = Math.log(EPS_MAX);
  for (let x = 0; x < nx; x++) {
    let acc = lnRef;
    for (let k = 0; k < nzc; k++) {
      const r = Math.min(0.95, problem.observed[k * nx + x] / problem.pulseArea);
      acc = Math.min(hi, acc + 4 * Math.atanh(r));
      out[k * nx + x] = acc;
    }
  }
  return out;
}

export async function evaluate(problem: FWIProblem, backend: FWIBackend, logEps: Float32Array) {
  const fields = fineFields(problem.grid, logEps);
  const rec = await backend.forward(fields);
  return { fields, misfit: envelopeMisfit(problem, rec) };
}

export async function computeGradient(problem: FWIProblem, backend: FWIBackend, logEps: Float32Array) {
  const { fields, misfit } = await evaluate(problem, backend, logEps);
  const { gC2, gRho } = await backend.gradient(fields, misfit.adjoint);
  return { misfit, gradient: chainToCoarse(problem.grid, fields, gC2, gRho) };
}

/**
 * Smoothed total variation of ln ε and its gradient. Lateral differences
 * count 30 %; vertical decreases with depth count up to 3× (smoothly).
 */
function totalVariation(logEps: Float32Array, nx: number, nzc: number, grad?: Float32Array): number {
  const e2 = 1e-4;
  const kink = 0.02;
  let tv = 0;
  for (let k = 0; k < nzc; k++) {
    for (let x = 0; x < nx; x++) {
      const i = k * nx + x;
      if (k + 1 < nzc) {
        const d = logEps[i + nx] - logEps[i];
        const s = Math.sqrt(d * d + e2);
        const th = Math.tanh(d / kink);
        const w = 2 - th;
        tv += w * s;
        if (grad) {
          const dd = w * (d / s) - ((1 - th * th) / kink) * s;
          grad[i + nx] += dd;
          grad[i] -= dd;
        }
      }
      if (x + 1 < nx) {
        const d = logEps[i + 1] - logEps[i];
        const s = Math.sqrt(d * d + e2);
        tv += 0.3 * s;
        if (grad) {
          grad[i + 1] += (0.3 * d) / s;
          grad[i] -= (0.3 * d) / s;
        }
      }
    }
  }
  return tv;
}

export async function invert(problem: FWIProblem, backend: FWIBackend, opt: FWIRunOptions): Promise<FWIProgress> {
  const { nx, nzc } = problem.grid;
  const lo = Math.log(EPS_MIN);
  const hi = Math.log(EPS_MAX);
  await calibrate(problem, backend);
  let logEps = recursiveStart(problem);
  let stepLen = 0.15;
  const history: number[] = [];

  const J0 = (await evaluate(problem, backend, logEps)).misfit.J;
  const beta = ((opt.regularization ?? 0.05) * J0) / Math.max(1, nx);
  const objective = async (m: Float32Array) => (await evaluate(problem, backend, m)).misfit.J + beta * totalVariation(m, nx, nzc);
  let current = J0 + beta * totalVariation(logEps, nx, nzc);
  history.push(current);

  for (let it = 0; it < opt.iterations; it++) {
    if (opt.signal?.aborted) break;
    const { gradient } = await computeGradient(problem, backend, logEps);
    const gReg = new Float32Array(gradient.length);
    totalVariation(logEps, nx, nzc, gReg);
    for (let i = 0; i < gradient.length; i++) gradient[i] += beta * gReg[i];
    const g = smoothAlongTrack(gradient, nx, nzc);
    let gmax = 0;
    for (let i = 0; i < g.length; i++) gmax = Math.max(gmax, Math.abs(g[i]));
    if (!(gmax > 0)) break;

    let accepted = false;
    for (let tries = 0; tries < 7 && !accepted; tries++) {
      const trial = new Float32Array(logEps.length);
      for (let i = 0; i < trial.length; i++) trial[i] = Math.min(hi, Math.max(lo, logEps[i] - (stepLen * g[i]) / gmax));
      const J = await objective(trial);
      if (J < current) {
        logEps = trial;
        current = J;
        stepLen *= 1.4;
        accepted = true;
      } else {
        stepLen *= 0.5;
      }
    }
    if (!accepted) break;
    history.push(current);
    opt.onIteration?.({ iteration: it + 1, misfit: current, logEps, misfitHistory: [...history] });
  }

  return { iteration: history.length - 1, misfit: current, logEps, misfitHistory: history };
}

export function toPermittivity(logEps: Float32Array): Float32Array {
  const out = new Float32Array(logEps.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.exp(logEps[i]);
  return out;
}
