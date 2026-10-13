/* Types for the ODE search API and the regions offered in the search form. */

export interface PDSProduct {
  productId: string;
  productName: string;
  instrument: 'SHARAD';
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
}

export interface PDSSearchParams {
  minLat: number;
  maxLat: number;
  westLon: number;
  eastLon: number;
  limit?: number;
  offset?: number;
}

export interface PDSSearchResult {
  products: PDSProduct[];
  count: number;
}

export interface PDSRegion {
  id: string;
  name: string;
  description: string;
  minLat: number;
  maxLat: number;
  westLon: number;
  eastLon: number;
}

export const PDS_REGIONS: PDSRegion[] = [
  { id: 'planum-australe', name: 'Planum Australe', description: 'South polar layered deposits', minLat: -84, maxLat: -78, westLon: 188, eastLon: 198 },
  { id: 'planum-boreum', name: 'Planum Boreum', description: 'North polar layered deposits', minLat: 82, maxLat: 88, westLon: 170, eastLon: 195 },
  { id: 'deuteronilus-mensae', name: 'Deuteronilus Mensae', description: 'Lobate debris aprons', minLat: 40, maxLat: 48, westLon: 20, eastLon: 35 },
  { id: 'arcadia-planitia', name: 'Arcadia Planitia', description: 'Mid-latitude excess ice', minLat: 38, maxLat: 46, westLon: 185, eastLon: 200 },
  { id: 'utopia-planitia', name: 'Utopia Planitia', description: 'Buried ice-rich deposit', minLat: 40, maxLat: 50, westLon: 110, eastLon: 135 },
  { id: 'hellas-planitia', name: 'Hellas Planitia', description: 'Glacial fill of the deepest basin', minLat: -50, maxLat: -35, westLon: 60, eastLon: 80 },
  { id: 'medusae-fossae', name: 'Medusae Fossae', description: 'Low-density equatorial deposits', minLat: -5, maxLat: 2, westLon: 160, eastLon: 180 },
];
