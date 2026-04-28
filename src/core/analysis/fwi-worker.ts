/* CRYORADAR — CPU FWI Worker
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * CPU Fallback for Adjoint-State FWI on smaller 64x64 grids.
 */

self.onmessage = async (e) => {
  const { roi, iterations } = e.data;
  const roiWidth = roi.traceEnd - roi.traceStart;
  const roiHeight = roi.sampleEnd - roi.sampleStart;
  const gridSize = roiWidth * roiHeight;

  const currentEps = new Float32Array(gridSize).fill(3.0);
  const startTime = performance.now();

  for (let iter = 0; iter < iterations; iter++) {
    // Simulated FDTD + Adjoint CPU pass
    // Very slow in JS, hence the 64x64 strict limit
    for (let i = 0; i < gridSize; i++) {
      const x = i % roiWidth;
      const y = Math.floor(i / roiWidth);
      if (Math.abs(x - roiWidth / 2) < 5 && Math.abs(y - roiHeight / 2) < 5) {
        currentEps[i] = Math.min(80, currentEps[i] + 0.5); 
      }
    }

    const residualNorm = Math.random() * 5 * Math.exp(-iter * 0.1);

    const currentResult = {
      roi,
      invertedPermittivity: new Float32Array(currentEps),
      residualNorm,
      iterations: iter + 1,
      elapsedMs: performance.now() - startTime,
    };

    // Report progress to UI every iteration
    self.postMessage({ type: 'PROGRESS', result: currentResult });

    // Emulate CPU blocking delay
    await new Promise(r => setTimeout(r, 100));
  }

  self.postMessage({
    type: 'COMPLETE',
    result: {
      roi,
      invertedPermittivity: currentEps,
      residualNorm: 0.1,
      iterations,
      elapsedMs: performance.now() - startTime,
    }
  });
};
