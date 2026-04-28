/* CRYORADAR — PDS ODE REST API Types
 * Developer: Mehmet Gümüş (github.com/SpaceEngineerSS) */

export interface PDSProduct {
  productId: string;
  productName: string;
  description: string;
  instrument: 'SHARAD' | 'MARSIS';
  orbitNumber: number;
  observationTime: string;
  centerLat: number;
  centerLon: number;
  startLat: number;
  startLon: number;
  stopLat: number;
  stopLon: number;
  footprintWkt: string;
  labelUrl: string;
  externalUrl: string;
  filesUrl: string;
}

export interface PDSFileEntry {
  url: string;
  filename: string;
  type: 'browse' | 'data' | 'label' | 'geometry' | 'other';
  sizeBytes?: number;
}

export interface PDSGeometryRow {
  traceNumber: number;
  latitude: number;
  longitude: number;
  marsRadius: number;
  surfaceElevation: number;
  spacecraftAltitude: number;
  solarZenithAngle: number;
}

export interface PDSSearchParams {
  instrument: 'SHARAD' | 'MARSIS';
  minLat: number;
  maxLat: number;
  westLon: number;
  eastLon: number;
  limit?: number;
}

export interface PDSSearchResult {
  products: PDSProduct[];
  totalCount: number;
  queryTime: string;
}

export type PDSProductType = 'USRDRV2' | 'USGEOMV2' | 'SHSIMU' | 'EDR' | 'RDR'
  | 'RADARCH' | 'RADAROP' | 'RADARUN' | 'RDRSS' | 'GEOM' | 'CLUTTER';

export interface PDSRegion {
  id: string;
  name: string;
  description: string;
  centerLat: number;
  centerLon: number;
  minLat: number;
  maxLat: number;
  westLon: number;
  eastLon: number;
  references: { authors: string; year: number; title: string; doi?: string }[];
}

export const PDS_REGIONS: PDSRegion[] = [
  {
    id: 'planum-australe',
    name: 'Planum Australe',
    description: 'South polar layered deposits — site of Orosei et al. 2018 subglacial lake detection',
    centerLat: -81, centerLon: 193,
    minLat: -84, maxLat: -78, westLon: 188, eastLon: 198,
    references: [
      { authors: 'Orosei, R. et al.', year: 2018, title: 'Radar evidence of subglacial liquid water on Mars', doi: '10.1126/science.aar7268' },
      { authors: 'Plaut, J. J. et al.', year: 2007, title: 'Subsurface radar sounding of the south polar layered deposits of Mars', doi: '10.1126/science.1139672' },
    ],
  },
  {
    id: 'planum-boreum',
    name: 'Planum Boreum',
    description: 'North polar cap with layered CO₂/H₂O ice deposits recording climate history',
    centerLat: 85, centerLon: 180,
    minLat: 82, maxLat: 88, westLon: 170, eastLon: 195,
    references: [
      { authors: 'Phillips, R. J. et al.', year: 2008, title: 'Mars north polar deposits: Stratigraphy, age, and geodynamical response', doi: '10.1126/science.1157546' },
      { authors: 'Putzig, N. E. et al.', year: 2009, title: 'Subsurface structure of Planum Boreum from Mars Reconnaissance Orbiter Shallow Radar soundings', doi: '10.1016/j.icarus.2009.07.034' },
    ],
  },
  {
    id: 'deuteronilus-mensae',
    name: 'Deuteronilus Mensae',
    description: 'Lobate debris aprons interpreted as debris-covered glaciers — mid-latitude ice reservoir',
    centerLat: 44, centerLon: 25,
    minLat: 40, maxLat: 48, westLon: 20, eastLon: 35,
    references: [
      { authors: 'Plaut, J. J. et al.', year: 2009, title: 'Radar evidence for ice in lobate debris aprons in the mid-northern latitudes of Mars', doi: '10.1029/2009GL038754' },
      { authors: 'Holt, J. W. et al.', year: 2008, title: 'Radar sounding evidence for buried glaciers in the southern mid-latitudes of Mars', doi: '10.1126/science.1164246' },
    ],
  },
  {
    id: 'arcadia-planitia',
    name: 'Arcadia Planitia',
    description: 'Widespread shallow subsurface ice at mid-latitudes — excess ice thickness 10–170 m',
    centerLat: 42, centerLon: 190,
    minLat: 38, maxLat: 46, westLon: 185, eastLon: 200,
    references: [
      { authors: 'Bramson, A. M. et al.', year: 2015, title: 'Widespread excess ice in Arcadia Planitia, Mars', doi: '10.1002/2015GL064844' },
    ],
  },
  {
    id: 'utopia-planitia',
    name: 'Utopia Planitia',
    description: 'Massive subsurface ice sheet — estimated 14,300 km³ volume (Stuurman et al. 2016)',
    centerLat: 45, centerLon: 120,
    minLat: 40, maxLat: 50, westLon: 110, eastLon: 135,
    references: [
      { authors: 'Stuurman, C. M. et al.', year: 2016, title: 'SHARAD detection and characterization of subsurface water ice deposits in Utopia Planitia, Mars', doi: '10.1002/2016GL070138' },
    ],
  },
  {
    id: 'hellas-planitia',
    name: 'Hellas Planitia',
    description: 'Deepest impact basin on Mars (−7 km) — possible glacial fill and ancient lake sediments',
    centerLat: -42, centerLon: 70,
    minLat: -50, maxLat: -35, westLon: 60, eastLon: 80,
    references: [
      { authors: 'Whitten, J. L. et al.', year: 2014, title: 'Infilling and erosion of the early Hellas basin, Mars', doi: '10.1016/j.icarus.2013.12.022' },
    ],
  },
  {
    id: 'valles-marineris',
    name: 'Valles Marineris',
    description: 'Canyon system extending ~4000 km — radar detects layered wall deposits and floor fill',
    centerLat: -13, centerLon: 290,
    minLat: -18, maxLat: -8, westLon: 282, eastLon: 300,
    references: [
      { authors: 'Quantin, C. et al.', year: 2005, title: 'Fluvial and lacustrine activity on layered deposits in Melas Chasma, Valles Marineris, Mars', doi: '10.1029/2005JE002440' },
    ],
  },
  {
    id: 'medusae-fossae',
    name: 'Medusae Fossae Formation',
    description: 'Enigmatic equatorial radar-transparent deposits — possibly volcanic ash or ice-rich sediment',
    centerLat: -2, centerLon: 170,
    minLat: -5, maxLat: 2, westLon: 160, eastLon: 180,
    references: [
      { authors: 'Watters, T. R. et al.', year: 2007, title: 'Radar sounding of the Medusae Fossae Formation Mars: Equatorial ice or dry, low-density deposits?', doi: '10.1126/science.1148112' },
    ],
  },
];
