/* CRYORADAR — SAR Migration Web Worker (v5.0)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Performs Kirchhoff (delay-and-sum) migration on a 2D radargram
 * matrix entirely within a dedicated Web Worker thread.
 *
 * v5.0: Uses depth-dependent V_RMS profile from Dix (1955) equation
 * instead of constant velocity. The profile is a Float32Array where
 * vrmsProfile[z] gives the RMS velocity at sample z.
 *
 * Kirchhoff Migration (first principles):
 *   u_mig(x, z) = Σ_{x_s} u(x_s, t_delay) × cos(θ)
 *
 *   t_delay = (2/V_RMS(z)) × √((x − x_s)² + z²)
 *   cos(θ) = z / √((x − x_s)² + z²)   [obliquity factor]
 *   V_RMS(z) = Dix RMS velocity at depth z
 *
 * Aperture-limited to ±A traces (default 100) to achieve
 * O(N·A·M) computational complexity.
 *
 * Uses linear interpolation for fractional sample indices.
 *
 * References:
 *   Dix (1955), Geophysics 20(1), 68–86
 *   Schneider (1978), Geophysics 43(1), 49–76
 *   Yilmaz (2001), Seismic Data Analysis, SEG */

interface MigrationParams {
  width: number;
  height: number;
  sampleInterval: number;
  apertureTraces: number;
  traceSpacingM: number;
}

self.onmessage = (e: MessageEvent) => {
  const { data, vrmsProfile, params } = e.data as {
    data: Float32Array;
    vrmsProfile: Float32Array;
    params: MigrationParams;
  };
  const { width, height, sampleInterval, apertureTraces, traceSpacingM } = params;
  const dt = sampleInterval;

  const output = new Float32Array(width * height);

  for (let xOut = 0; xOut < width; xOut++) {
    const xStart = Math.max(0, xOut - apertureTraces);
    const xEnd = Math.min(width, xOut + apertureTraces + 1);

    for (let zOut = 0; zOut < height; zOut++) {
      let sum = 0;
      const velocity = vrmsProfile[zOut];
      const zMeters = zOut * dt * velocity * 0.5;

      for (let xS = xStart; xS < xEnd; xS++) {
        const dx = (xOut - xS) * traceSpacingM;
        const dist = Math.sqrt(dx * dx + zMeters * zMeters);
        const tDelay = (2 * dist) / velocity;
        const sampleIdx = tDelay / dt;

        if (sampleIdx < 0 || sampleIdx >= height - 1) continue;

        const s0 = Math.floor(sampleIdx);
        const frac = sampleIdx - s0;
        const v0 = data[s0 * width + xS];
        const v1 = data[(s0 + 1) * width + xS];
        const interpolated = v0 + frac * (v1 - v0);

        const obliquity = dist > 0 ? zMeters / dist : 1;
        sum += interpolated * obliquity;
      }

      output[zOut * width + xOut] = sum;
    }

    if (xOut % 50 === 0) {
      self.postMessage({ type: 'progress', value: xOut / width });
    }
  }

  self.postMessage(
    { type: 'result', data: output },
    { transfer: [output.buffer] }
  );
};
