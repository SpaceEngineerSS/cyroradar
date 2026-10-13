/* Small seeded random sources. Everything that looks noisy in CryoRadar draws
 * from these, so a given seed always produces the same picture. */

/** mulberry32: 32-bit state, good enough statistics for simulation noise. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal variate (Box–Muller). */
export function gaussian(rng: () => number): number {
  let u = rng();
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * Smooth random profile of length n with zero mean and unit-ish amplitude,
 * built from a handful of sinusoids. Used for layer undulations that should be
 * continuous along track rather than white noise.
 */
export function smoothProfile(n: number, rng: () => number, components = 5): Float32Array {
  const out = new Float32Array(n);
  let norm = 0;
  for (let c = 0; c < components; c++) {
    const cycles = 0.5 + rng() * (2 + c * 2.5);
    const phase = rng() * Math.PI * 2;
    const amp = 1 / (1 + c);
    norm += amp * amp;
    for (let i = 0; i < n; i++) out[i] += amp * Math.sin((i / Math.max(1, n - 1)) * cycles * 2 * Math.PI + phase);
  }
  const k = 1 / Math.sqrt(norm / 2);
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}
