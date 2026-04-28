/* CRYORADAR — Dielectric Constants Database (Production)
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS)
 *
 * Production: Mars-focused dielectric material library. */

import type { DielectricMaterial } from '../../types/types';

const MATERIALS: DielectricMaterial[] = [
  {
    id: 'vacuum',
    name: 'Vacuum / Free Space',
    nameShort: 'Vacuum',
    permittivity: 1.0,
    lossTangent: 0,
    color: '#475569',
    reference: '—',
  },
  {
    id: 'mars-atmo',
    name: 'Mars Atmosphere (CO₂)',
    nameShort: 'Atmo',
    permittivity: 1.0006,
    lossTangent: 0,
    color: '#94a3b8',
    reference: '—',
  },
  {
    id: 'co2-ice',
    name: 'CO₂ Ice (Dry Ice)',
    nameShort: 'CO₂',
    permittivity: 2.12,
    permittivityRange: [2.11, 2.13],
    lossTangent: 1e-4,
    lossTangentRange: [5e-5, 2e-4],
    color: '#e0f2fe',
    reference: 'Pettinelli et al. (2003)',
  },
  {
    id: 'water-ice',
    name: 'Pure Water Ice (H₂O)',
    nameShort: 'H₂O Ice',
    permittivity: 3.15,
    permittivityRange: [3.13, 3.17],
    lossTangent: 1e-3,
    lossTangentRange: [5e-4, 2e-3],
    color: '#7dd3fc',
    reference: 'Mätzler (1998)',
  },
  {
    id: 'dusty-ice',
    name: 'Dusty Water Ice (~10% dust)',
    nameShort: 'Dusty Ice',
    permittivity: 3.4,
    permittivityRange: [3.4, 3.5],
    lossTangent: 1e-2,
    lossTangentRange: [5e-3, 2e-2],
    color: '#a5b4fc',
    reference: 'Nunes & Phillips (2006)',
  },
  {
    id: 'volcanic-ash',
    name: 'Volcanic Ash / Tuff',
    nameShort: 'Ash',
    permittivity: 3.8,
    permittivityRange: [3.2, 4.5],
    lossTangent: 0.008,
    lossTangentRange: [0.005, 0.012],
    color: '#a8a29e',
    reference: 'Carter et al. (2009)',
  },
  {
    id: 'mars-soil',
    name: 'Mars Soil Analog (JSC Mars-1)',
    nameShort: 'Soil',
    permittivity: 4.2,
    permittivityRange: [3.5, 5.0],
    lossTangent: 0.005,
    lossTangentRange: [0.003, 0.008],
    color: '#c2410c',
    reference: 'Heggy et al. (2001), Allen et al. (1998)',
  },
  {
    id: 'regolith-porous',
    name: 'Basaltic Regolith (Porous)',
    nameShort: 'Regolith',
    permittivity: 5.0,
    permittivityRange: [4, 6],
    lossTangent: 0.007,
    lossTangentRange: [0.005, 0.01],
    color: '#d97706',
    reference: 'Heggy et al. (2001)',
  },
  {
    id: 'gypsum',
    name: 'Gypsum (CaSO₄·2H₂O)',
    nameShort: 'Gypsum',
    permittivity: 5.5,
    permittivityRange: [5.0, 6.5],
    lossTangent: 0.003,
    lossTangentRange: [0.001, 0.005],
    color: '#fef3c7',
    reference: 'Stillman & Olhoeft (2008)',
  },
  {
    id: 'clay-minerals',
    name: 'Clay Minerals (Phyllosilicates)',
    nameShort: 'Clay',
    permittivity: 6.5,
    permittivityRange: [5.0, 8.0],
    lossTangent: 0.015,
    lossTangentRange: [0.01, 0.025],
    color: '#65a30d',
    reference: 'Stillman & Olhoeft (2008)',
  },
  {
    id: 'smectite-clay',
    name: 'Smectite Clay (Montmorillonite, ~200K)',
    nameShort: 'Smectite',
    permittivity: 12.0,
    permittivityRange: [10, 15],
    lossTangent: 0.15,
    lossTangentRange: [0.08, 0.25],
    color: '#7c3aed',
    reference: 'Stillman et al. (2010), JGR 115, E09005',
  },
  {
    id: 'fe-smectite',
    name: 'Fe-Smectite Nontronite (~200K)',
    nameShort: 'Nontronite',
    permittivity: 14.0,
    permittivityRange: [12, 17],
    lossTangent: 0.30,
    lossTangentRange: [0.15, 0.50],
    color: '#6d28d9',
    reference: 'Stillman & Grimm (2011), JGR 116',
  },
  {
    id: 'jarosite',
    name: 'Jarosite (KFe₃(SO₄)₂(OH)₆)',
    nameShort: 'Jarosite',
    permittivity: 7.0,
    permittivityRange: [6.0, 8.0],
    lossTangent: 0.018,
    lossTangentRange: [0.01, 0.03],
    color: '#eab308',
    reference: 'Stillman et al. (2006)',
  },
  {
    id: 'basalt-dense',
    name: 'Dense Basalt',
    nameShort: 'Basalt',
    permittivity: 8.0,
    permittivityRange: [7, 9],
    lossTangent: 0.02,
    lossTangentRange: [0.01, 0.03],
    color: '#78350f',
    reference: 'Campbell & Ulrichs (1969)',
  },
  {
    id: 'iron-basalt',
    name: 'Fe-rich Basalt (High Iron)',
    nameShort: 'Fe-Basalt',
    permittivity: 10.0,
    permittivityRange: [9, 12],
    lossTangent: 0.04,
    lossTangentRange: [0.02, 0.06],
    color: '#991b1b',
    reference: 'Olhoeft & Strangway (1975)',
  },
  {
    id: 'clathrate',
    name: 'Methane Clathrate (CH₄·5.75H₂O)',
    nameShort: 'Clathrate',
    permittivity: 2.8,
    permittivityRange: [2.5, 3.1],
    lossTangent: 5e-4,
    lossTangentRange: [2e-4, 8e-4],
    color: '#d8b4fe',
    reference: 'Pettinelli et al. (2015)',
  },
  {
    id: 'liquid-water',
    name: 'Liquid Water',
    nameShort: 'Water',
    permittivity: 80,
    permittivityRange: [80, 88],
    lossTangent: 0.1,
    color: '#2563eb',
    reference: 'Buchner et al. (1999)',
  },
  {
    id: 'brine',
    name: 'Perchlorate Brine',
    nameShort: 'Brine',
    permittivity: 60,
    permittivityRange: [40, 80],
    lossTangent: 0.5,
    color: '#1d4ed8',
    reference: 'Stillman et al. (2010)',
  },
];

const materialMap = new Map<string, DielectricMaterial>(
  MATERIALS.map(m => [m.id, m])
);

export function getAllMaterials(): readonly DielectricMaterial[] {
  return MATERIALS;
}

export function getMaterial(id: string): DielectricMaterial | undefined {
  return materialMap.get(id);
}

export function getMaterialOrThrow(id: string): DielectricMaterial {
  const mat = materialMap.get(id);
  if (!mat) throw new Error(`Unknown material: ${id}`);
  return mat;
}

export function createCustomMaterial(
  name: string,
  permittivity: number,
  lossTangent: number,
  color = '#9ca3af'
): DielectricMaterial {
  if (permittivity < 1) throw new RangeError('Permittivity must be ≥ 1');
  if (lossTangent < 0) throw new RangeError('Loss tangent must be ≥ 0');
  return {
    id: `custom-${Date.now()}`,
    name,
    nameShort: name.slice(0, 10),
    permittivity,
    lossTangent,
    color,
    reference: 'User-defined',
  };
}
