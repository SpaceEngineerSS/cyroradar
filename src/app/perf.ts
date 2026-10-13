/* Device tier. Chooses resolution caps and how much motion to use so the app
 * stays fluid on a five-year-old phone and still uses a good desktop GPU. */

export type Tier = 'low' | 'mid' | 'high';

interface NavigatorHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
}

export interface DeviceProfile {
  tier: Tier;
  coarsePointer: boolean;
  reducedMotion: boolean;
  hasWebGPU: boolean;
  maxDpr: number;
  fwi: { gpu: { nx: number; nz: number }; cpu: { nx: number; nz: number }; iterations: number };
  sceneSegments: number;
  volume: boolean;
}

function detect(): DeviceProfile {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & NavigatorHints;
  const mem = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  const coarsePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!nav.connection?.saveData;
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

  let tier: Tier = 'mid';
  if (mem <= 2 || cores <= 2 || saveData) tier = 'low';
  else if (mem >= 8 && cores >= 8 && !coarsePointer) tier = 'high';

  return {
    tier,
    coarsePointer,
    reducedMotion,
    hasWebGPU,
    maxDpr: tier === 'low' ? 1.5 : tier === 'mid' ? 2 : 3,
    fwi: {
      gpu: tier === 'high' ? { nx: 128, nz: 96 } : { nx: 96, nz: 72 },
      cpu: tier === 'low' ? { nx: 32, nz: 48 } : { nx: 48, nz: 64 },
      iterations: tier === 'low' ? 12 : 24,
    },
    sceneSegments: tier === 'low' ? 96 : tier === 'mid' ? 192 : 320,
    volume: tier !== 'low',
  };
}

export const device: DeviceProfile = detect();

export function pixelRatio(): number {
  return Math.min(device.maxDpr, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
}
