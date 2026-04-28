/* CRYORADAR — CPU FWI Worker Proxy
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 */
import type { FWIConfig } from './fwi-engine';
import type { FWIResult } from '../../types/types';

export function runFWIWorker(config: FWIConfig): Promise<FWIResult> {
  return new Promise((resolve, reject) => {
    const roiWidth = config.roi.traceEnd - config.roi.traceStart;
    const roiHeight = config.roi.sampleEnd - config.roi.sampleStart;

    if (roiWidth > 64 || roiHeight > 64) {
      return reject(new Error(`CPU FWI Fallback limit is 64x64. (Selected: ${roiWidth}x${roiHeight})`));
    }

    const worker = new Worker(new URL('./fwi-worker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      if (e.data.type === 'PROGRESS' && config.onProgress) {
        config.onProgress(e.data.result);
      } else if (e.data.type === 'COMPLETE') {
        resolve(e.data.result);
        worker.terminate();
      } else if (e.data.type === 'ERROR') {
        reject(new Error(e.data.error));
        worker.terminate();
      }
    };

    worker.postMessage({
      roi: config.roi,
      iterations: config.iterations,
      // Minimal radargram slice could be sent here
    });
  });
}
