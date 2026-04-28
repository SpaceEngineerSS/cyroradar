/* CRYORADAR — Temperature-Dependent Dielectric Models
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Models the temperature dependence of dielectric properties for
 * key Martian materials. Critical for accurate subsurface interpretation
 * since Mars surface temperatures range from 130 K to 300 K.
 *
 * References:
 *   Mätzler, C. (2006). Thermal Microwave Radiation: Applications for Remote Sensing.
 *   Pettinelli, E. et al. (2015). Dielectric properties of Jovian satellite ice analogs.
 *   Heggy, E. et al. (2001). On water detection by radar in the Martian subsurface.
 *   Sihvola, A. (1999). Electromagnetic Mixing Formulas and Applications.  */

export interface FrequencyDependentDielectric {
  realPart: number;
  imaginaryPart: number;
  lossTangent: number;
  effectivePermittivity: number;
}

export function waterIcePermittivity(temperatureK: number, frequencyHz: number = 20e6): FrequencyDependentDielectric {
  const T = Math.max(100, Math.min(273, temperatureK));
  const epsilonInf = 3.185;
  const epsilonS = 203.168 * Math.exp(-0.01677 * T);
  const tau0 = 5.73e-14;
  const Ea = 0.55;
  const kB = 8.6173e-5;
  const tau = tau0 * Math.exp(Ea / (kB * T));

  const omega = 2 * Math.PI * frequencyHz;
  const wt = omega * tau;
  const denom = 1 + wt * wt;

  const epsPrime = epsilonInf + (epsilonS - epsilonInf) / denom;
  const epsDoublePrime = (epsilonS - epsilonInf) * wt / denom;

  return {
    realPart: epsPrime,
    imaginaryPart: epsDoublePrime,
    lossTangent: epsDoublePrime / epsPrime,
    effectivePermittivity: epsPrime,
  };
}

export function co2IcePermittivity(temperatureK: number): FrequencyDependentDielectric {
  const T = Math.max(50, Math.min(200, temperatureK));
  const eps = 2.12 + 2.5e-4 * (T - 150);
  const tanDelta = 1e-4 + 5e-7 * (T - 150);

  return {
    realPart: eps,
    imaginaryPart: eps * tanDelta,
    lossTangent: tanDelta,
    effectivePermittivity: eps,
  };
}

export function basaltPermittivity(temperatureK: number, porosity: number = 0.3): FrequencyDependentDielectric {
  const T = Math.max(100, Math.min(400, temperatureK));
  const phi = Math.max(0, Math.min(0.8, porosity));

  const epsSolid = 7.5 + 0.003 * (T - 200);
  const tanDeltaSolid = 0.015 + 2e-5 * (T - 200);
  const epsVacuum = 1.0;

  const epsEff = Math.pow(
    (1 - phi) * Math.pow(epsSolid, 1 / 3) + phi * Math.pow(epsVacuum, 1 / 3),
    3
  );

  const tanDeltaEff = tanDeltaSolid * (1 - phi);

  return {
    realPart: epsEff,
    imaginaryPart: epsEff * tanDeltaEff,
    lossTangent: tanDeltaEff,
    effectivePermittivity: epsEff,
  };
}

export function maxwellGarnettMixing(
  hostPermittivity: number,
  inclusionPermittivity: number,
  volumeFraction: number
): number {
  const f = Math.max(0, Math.min(0.99, volumeFraction));
  const em = hostPermittivity;
  const ei = inclusionPermittivity;

  const beta = (ei - em) / (ei + 2 * em);
  return em * (1 + 2 * f * beta) / (1 - f * beta);
}

export function dustyIcePermittivity(
  temperatureK: number,
  dustFraction: number,
  frequencyHz: number = 20e6
): FrequencyDependentDielectric {
  const ice = waterIcePermittivity(temperatureK, frequencyHz);
  const dustEps = basaltPermittivity(temperatureK, 0).realPart;

  const epsEff = maxwellGarnettMixing(ice.realPart, dustEps, dustFraction);

  const tanDeltaIce = ice.lossTangent;
  const tanDeltaDust = 0.015;
  const tanDeltaEff = (1 - dustFraction) * tanDeltaIce + dustFraction * tanDeltaDust;

  return {
    realPart: epsEff,
    imaginaryPart: epsEff * tanDeltaEff,
    lossTangent: tanDeltaEff,
    effectivePermittivity: epsEff,
  };
}

export function brinePermittivity(
  temperatureK: number,
  salinityMolPerLiter: number = 3.0
): FrequencyDependentDielectric {
  const T = Math.max(200, Math.min(300, temperatureK));
  const S = Math.max(0.1, Math.min(5, salinityMolPerLiter));

  const epsStatic = 80 - 0.4 * (T - 293) - 8 * S;
  const epsInf = 4.5;
  const sigma = 0.5 * S * Math.exp(-0.02 * (293 - T));

  const omega = 2 * Math.PI * 20e6;
  const tau = 8.3e-12 * Math.exp(1800 / T - 1800 / 293);
  const wt = omega * tau;

  const epsPrime = epsInf + (epsStatic - epsInf) / (1 + wt * wt);
  const epsDoublePrime = (epsStatic - epsInf) * wt / (1 + wt * wt)
    + sigma / (omega * 8.854e-12);

  return {
    realPart: epsPrime,
    imaginaryPart: epsDoublePrime,
    lossTangent: epsDoublePrime / epsPrime,
    effectivePermittivity: epsPrime,
  };
}

export function marsSubsurfaceTemperature(depthM: number, latitudeDeg: number): number {
  const absLat = Math.abs(latitudeDeg);
  const surfaceTemp = absLat > 60 ? 160 : absLat > 30 ? 200 : 220;
  const skinDepth = 2.0;
  const geothermalGradient = 0.005;
  const meanTemp = surfaceTemp + geothermalGradient * depthM;
  const seasonalAmplitude = 30 * Math.exp(-depthM / skinDepth);

  return meanTemp + seasonalAmplitude * 0.5;
}
