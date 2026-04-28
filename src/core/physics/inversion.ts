/* CRYORADAR — Subsurface Layer Inversion Solver
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Given observed radar reflection times and power levels, inverts for
 * layer permittivity and thickness. Uses Levenberg-Marquardt-style
 * iterative least-squares minimization.
 *
 * Forward model: for N layers with permittivities ε₁…εN and thicknesses d₁…dN,
 *   reflection time:  τᵢ = 2dᵢ√εᵢ / c
 *   reflection power: Pᵢ = Σ(Fresnel + attenuation through all layers above)  */

import { SPEED_OF_LIGHT } from './constants';
import { fresnelReflection } from './fresnel';

export interface ObservedReflection {
  twoWayTimeS: number;
  powerDb: number;
  uncertainty: number;
}

export interface InvertedLayer {
  permittivity: number;
  thickness: number;
  permittivityUncertainty: number;
  thicknessUncertainty: number;
  chiSquared: number;
}

export interface InversionResult {
  layers: InvertedLayer[];
  totalChiSquared: number;
  converged: boolean;
  iterations: number;
  residualRms: number;
}

function forwardTwoWayTime(thickness: number, permittivity: number): number {
  return (2 * thickness * Math.sqrt(permittivity)) / SPEED_OF_LIGHT;
}

function forwardReflectionPowerDb(
  layers: { permittivity: number; thickness: number; lossTangent: number }[],
  layerIndex: number,
  frequencyHz: number
): number {
  let totalLossDb = 0;

  for (let i = 0; i < layerIndex; i++) {
    const epsAbove = i === 0 ? 1.0 : layers[i - 1].permittivity;
    const epsBelow = layers[i].permittivity;
    const { transmissionCoefficient } = fresnelReflection(epsAbove, epsBelow);
    totalLossDb -= 10 * Math.log10(transmissionCoefficient);

    const alpha = (2 * Math.PI * frequencyHz * layers[i].lossTangent
      * Math.sqrt(layers[i].permittivity)) / SPEED_OF_LIGHT;
    totalLossDb += 2 * alpha * layers[i].thickness * (20 / Math.LN10);
  }

  const epsAboveTarget = layerIndex === 0 ? 1.0 : layers[layerIndex - 1].permittivity;
  const epsTarget = layers[layerIndex].permittivity;
  const { reflectionCoefficient } = fresnelReflection(epsAboveTarget, epsTarget);
  const reflDb = 10 * Math.log10(reflectionCoefficient);

  return reflDb - totalLossDb;
}

export function invertSingleLayer(
  observedTimeS: number,
  observedPowerDb: number,
  abovePermittivity: number = 1.0
): InvertedLayer {
  const c = SPEED_OF_LIGHT;

  const rLinear = Math.pow(10, observedPowerDb / 10);
  const sqrtEps = (1 + Math.sqrt(rLinear)) / (1 - Math.sqrt(Math.max(0.001, rLinear)));
  const eps = Math.max(1.01, sqrtEps * sqrtEps * abovePermittivity);

  const thickness = (observedTimeS * c) / (2 * Math.sqrt(eps));

  const dEps = Math.abs(eps * 0.1);
  const dThickness = Math.abs(thickness * 0.05);

  return {
    permittivity: eps,
    thickness,
    permittivityUncertainty: dEps,
    thicknessUncertainty: dThickness,
    chiSquared: 0,
  };
}

export function invertMultiLayer(
  observations: ObservedReflection[],
  frequencyHz: number,
  maxIterations: number = 50,
  convergenceThreshold: number = 1e-6
): InversionResult {
  const n = observations.length;
  if (n === 0) {
    return { layers: [], totalChiSquared: 0, converged: true, iterations: 0, residualRms: 0 };
  }

  const layers: { permittivity: number; thickness: number; lossTangent: number }[] = [];
  for (let i = 0; i < n; i++) {
    const prevEps = i === 0 ? 1.0 : layers[i - 1].permittivity;
    const dt = i === 0
      ? observations[i].twoWayTimeS
      : observations[i].twoWayTimeS - observations[i - 1].twoWayTimeS;

    const guessEps = Math.max(1.5, prevEps + 0.5 * (i + 1));
    const thickness = Math.max(1, (dt * SPEED_OF_LIGHT) / (2 * Math.sqrt(guessEps)));
    layers.push({ permittivity: guessEps, thickness, lossTangent: 0.005 });
  }

  let lambda = 0.01;
  let prevChi = Infinity;
  let iteration = 0;

  for (; iteration < maxIterations; iteration++) {
    let chiSquared = 0;

    for (let i = 0; i < n; i++) {
      const predictedTime = layers.slice(0, i + 1).reduce(
        (sum, l) => sum + forwardTwoWayTime(l.thickness, l.permittivity), 0
      );
      const predictedPower = forwardReflectionPowerDb(layers, i, frequencyHz);

      const timeResidual = (observations[i].twoWayTimeS - predictedTime)
        / (observations[i].uncertainty || 1e-7);
      const powerResidual = (observations[i].powerDb - predictedPower) / 3.0;

      chiSquared += timeResidual * timeResidual + powerResidual * powerResidual;

      const gradEps = -timeResidual * layers[i].thickness
        / (SPEED_OF_LIGHT * Math.sqrt(layers[i].permittivity));
      const gradThick = -timeResidual * Math.sqrt(layers[i].permittivity) / SPEED_OF_LIGHT;

      const step = 1 / (1 + lambda);
      layers[i].permittivity = Math.max(1.01, layers[i].permittivity - step * gradEps * 0.1);
      layers[i].thickness = Math.max(0.1, layers[i].thickness - step * gradThick * 0.1);
    }

    if (chiSquared < prevChi) {
      lambda *= 0.5;
    } else {
      lambda *= 2;
    }

    if (Math.abs(prevChi - chiSquared) < convergenceThreshold) {
      prevChi = chiSquared;
      iteration++;
      break;
    }
    prevChi = chiSquared;
  }

  const invertedLayers: InvertedLayer[] = layers.map(l => ({
    permittivity: l.permittivity,
    thickness: l.thickness,
    permittivityUncertainty: l.permittivity * 0.1,
    thicknessUncertainty: l.thickness * 0.05,
    chiSquared: prevChi / n,
  }));

  return {
    layers: invertedLayers,
    totalChiSquared: prevChi,
    converged: iteration < maxIterations,
    iterations: iteration,
    residualRms: Math.sqrt(prevChi / (2 * n)),
  };
}
