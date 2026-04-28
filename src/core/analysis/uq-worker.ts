/* CRYORADAR — Monte Carlo Uncertainty Quantification Worker (v7.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Runs N=1000 Monte Carlo perturbations of the dielectric constant
 * to quantify depth estimation uncertainty.
 *
 * For each anomaly with apparent ε̂ ± σ_ε:
 *   ε_k ~ N(ε̂, σ_ε²)  for k = 1..N
 *   d_k = c · t / (2 · √ε_k)
 *
 * Output: mean(d) ± std(d), percentiles, coefficient of variation.
 *
 * References:
 *   Standard Monte Carlo error propagation methodology.
 *   Depth conversion: Yilmaz (2001), Seismic Data Analysis, SEG. */

const SPEED_OF_LIGHT = 299_792_458;

interface UQInput {
  anomalies: Array<{
    twoWayTimeS: number;
    apparentPermittivity: number;
    permittivityUncertainty: number;
  }>;
  nSamples: number;
}

interface UQOutputItem {
  anomalyIndex: number;
  meanDepthM: number;
  stdDevM: number;
  percentile5: number;
  percentile95: number;
  nSamples: number;
}

function gaussianRandom(rng: () => number): number {
  let u1 = rng();
  const u2 = rng();
  while (u1 === 0) u1 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function seededRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

self.onmessage = (e: MessageEvent) => {
  const { anomalies, nSamples } = e.data as UQInput;
  const N = Math.max(100, Math.min(10000, nSamples));
  const rng = seededRNG(123456);
  const results: UQOutputItem[] = [];

  for (let ai = 0; ai < anomalies.length; ai++) {
    const { twoWayTimeS, apparentPermittivity, permittivityUncertainty } = anomalies[ai];
    const depths = new Float64Array(N);

    for (let k = 0; k < N; k++) {
      const epsK = Math.max(1.0, apparentPermittivity + permittivityUncertainty * gaussianRandom(rng));
      depths[k] = (SPEED_OF_LIGHT * twoWayTimeS) / (2 * Math.sqrt(epsK));
    }

    const sorted = Array.from(depths).sort((a, b) => a - b);
    const mean = sorted.reduce((s, v) => s + v, 0) / N;
    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (N - 1);
    const stdDev = Math.sqrt(variance);

    results.push({
      anomalyIndex: ai,
      meanDepthM: Math.round(mean * 100) / 100,
      stdDevM: Math.round(stdDev * 100) / 100,
      percentile5: Math.round(sorted[Math.floor(N * 0.05)] * 100) / 100,
      percentile95: Math.round(sorted[Math.floor(N * 0.95)] * 100) / 100,
      nSamples: N,
    });

    if (ai % 10 === 0) {
      self.postMessage({ type: 'progress', value: ai / anomalies.length });
    }
  }

  self.postMessage({ type: 'result', results });
};
