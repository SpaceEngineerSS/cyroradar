/* CRYORADAR — CRISM Mineralogy Data Fusion
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Generates synthetic CRISM (Compact Reconnaissance Imaging
 * Spectrometer for Mars) mineralogy maps and fuses them with
 * radar BBR anomalies to distinguish liquid water from
 * conductive smectite clays.
 *
 * CRISM absorption bands modeled:
 *   1.9 μm — H₂O molecular vibration (hydration indicator)
 *   2.3 μm — Metal-OH bond stretch (phyllosilicate indicator)
 *   1.4 μm — OH overtone
 *
 * References:
 *   Murchie et al. (2007), JGR 112, E05S03
 *   Ehlmann et al. (2011), Nature 479, 53–60
 *   Carter et al. (2013), JGR Planets 118, 831–858 */

import type { CRISMPixel, GeometryData } from '../../types/types';

type MineralClass = CRISMPixel['mineralClass'];

function polarClayProbability(lat: number): number {
  const absLat = Math.abs(lat);
  if (absLat > 75) return 0.6 + Math.random() * 0.3;
  if (absLat > 60) return 0.3 + Math.random() * 0.3;
  if (absLat > 40) return 0.15 + Math.random() * 0.2;
  return 0.05 + Math.random() * 0.15;
}

function classifyMineral(clayIndex: number, hydrationIndex: number): MineralClass {
  if (clayIndex > 0.6 && hydrationIndex > 0.5) return 'phyllosilicate';
  if (clayIndex > 0.4 && hydrationIndex > 0.7) return 'hydrated-silica';
  if (hydrationIndex > 0.6 && clayIndex < 0.3) return 'sulfate';
  return 'none';
}

export function generateSyntheticCRISM(
  geometry: GeometryData,
  traceCount: number,
  seed: number = 42
): CRISMPixel[] {
  const pixels: CRISMPixel[] = [];

  let rng = seed;
  const nextRandom = (): number => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };

  for (let i = 0; i < traceCount; i++) {
    const lat = geometry.latitudes[i];
    const baseClay = polarClayProbability(lat);

    const slopeNoise = i > 0
      ? Math.abs(geometry.surfaceElevation[i] - geometry.surfaceElevation[i - 1]) * 0.001
      : 0;

    const clayIndex = Math.min(1, Math.max(0,
      baseClay + slopeNoise + (nextRandom() - 0.5) * 0.15
    ));

    const hydrationIndex = Math.min(1, Math.max(0,
      clayIndex * 0.7 + (nextRandom() - 0.5) * 0.2 + 0.1
    ));

    pixels.push({
      clayIndex: Math.round(clayIndex * 1000) / 1000,
      hydrationIndex: Math.round(hydrationIndex * 1000) / 1000,
      mineralClass: classifyMineral(clayIndex, hydrationIndex),
    });
  }

  return pixels;
}

/**
 * Fuses CRISM mineralogy data with radar dielectric anomalies.
 * If high apparent permittivity (10 < ε < 40) is co-located with phyllosilicates (smectite),
 * it strongly supports the Bierson clay hypothesis over Orosei's liquid water.
 * 
 * @param crismPixel The pixel data containing clay and hydration indices.
 * @param apparentPermittivity The dielectric constant derived from radar.
 * @returns An object indicating if the smectite hypothesis is strengthened.
 * 
 * @see {@link https://doi.org/10.1029/2006JE002682|Murchie et al., 2007 (CRISM Instrument)}
 * @see {@link https://doi.org/10.1038/nature10582|Ehlmann et al., 2011 (Subsurface water on Mars)}
 */
export function fuseCRISMWithAnomaly(
  crismPixel: CRISMPixel,
  apparentPermittivity: number
): { smectiteStrengthened: boolean; fusionNote: string } {
  const isHighEps = apparentPermittivity >= 10 && apparentPermittivity < 40;
  const hasClay = crismPixel.clayIndex > 0.4;
  const isPhyllosilicate = crismPixel.mineralClass === 'phyllosilicate';

  if (isHighEps && (hasClay || isPhyllosilicate)) {
    return {
      smectiteStrengthened: true,
      fusionNote: `CRISM clay index ${crismPixel.clayIndex.toFixed(2)} + ε=${apparentPermittivity.toFixed(1)} → Smectite hypothesis strengthened`,
    };
  }

  if (apparentPermittivity >= 40 && crismPixel.clayIndex < 0.2) {
    return {
      smectiteStrengthened: false,
      fusionNote: `No clay signature (index ${crismPixel.clayIndex.toFixed(2)}) + high ε=${apparentPermittivity.toFixed(1)} → Liquid water hypothesis maintained`,
    };
  }

  return {
    smectiteStrengthened: false,
    fusionNote: `Inconclusive: clay=${crismPixel.clayIndex.toFixed(2)}, ε=${apparentPermittivity.toFixed(1)}`,
  };
}
