import {
  area,
  booleanPointInPolygon,
  featureCollection,
  intersect,
  multiPolygon as turfMultiPolygon,
  point,
  polygon as turfPolygon,
} from '@turf/turf';
import { prisma } from '../lib/prisma.js';
import type { GeoJsonBoundary, GeoJsonPolygon } from '../schemas/validation.js';
import { env } from '../config/env.js';

function isSqliteDatabase(): boolean {
  const dbUrl = process.env.DATABASE_URL || env.DATABASE_URL;
  return dbUrl.startsWith('file:');
}

export function parseGeoJsonPolygon(raw: unknown): GeoJsonPolygon {
  if (typeof raw === 'string') {
    const parsed = JSON.parse(raw) as GeoJsonPolygon | { type: 'Feature'; geometry: GeoJsonPolygon };
    if (parsed && typeof parsed === 'object' && 'geometry' in parsed && parsed.type === 'Feature') {
      return parsed.geometry;
    }
    return parsed as GeoJsonPolygon;
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as GeoJsonPolygon | { type: 'Feature'; geometry: GeoJsonPolygon };
    if ('geometry' in obj && obj.type === 'Feature') {
      return obj.geometry;
    }
    return obj as GeoJsonPolygon;
  }

  throw new Error('Format GeoJSON de secteur invalide');
}

export function serializePolygonForDb(geo: GeoJsonPolygon): string | GeoJsonPolygon {
  return isSqliteDatabase() ? JSON.stringify(geo) : geo;
}

export function parseGeoJsonBoundary(raw: unknown): GeoJsonBoundary | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const obj = parsed as
      | GeoJsonBoundary
      | { type: 'Feature'; geometry?: GeoJsonBoundary };
    const geom = obj.type === 'Feature' && 'geometry' in obj ? obj.geometry : obj;
    if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
      return geom;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeBoundaryForDb(
  boundary: GeoJsonBoundary | null
): string | GeoJsonBoundary | null {
  if (boundary === null) {
    return null;
  }
  return isSqliteDatabase() ? JSON.stringify(boundary) : boundary;
}

export function isPointInBoundary(
  lat: number,
  lng: number,
  boundary: GeoJsonBoundary
): boolean {
  try {
    const pt = point([lng, lat]);
    if (boundary.type === 'Polygon') {
      return booleanPointInPolygon(pt, turfPolygon(boundary.coordinates));
    }
    return booleanPointInPolygon(pt, turfMultiPolygon(boundary.coordinates));
  } catch {
    return false;
  }
}

function pickLargestPolygon(candidates: number[][][][]): GeoJsonPolygon | null {
  let bestCoords: number[][][] | null = null;
  let bestArea = -1;
  for (const polyCoords of candidates) {
    const polyArea = area(turfPolygon(polyCoords));
    if (polyArea > bestArea) {
      bestArea = polyArea;
      bestCoords = polyCoords;
    }
  }
  if (!bestCoords || bestArea <= 0) {
    return null;
  }
  return {
    type: 'Polygon',
    coordinates: bestCoords,
  };
}

export function clipSectorToBoundary(
  sectorPoly: GeoJsonPolygon,
  boundary: GeoJsonBoundary
): GeoJsonPolygon | null {
  try {
    const sectorFeature = turfPolygon(sectorPoly.coordinates);
    const boundaryPolygons =
      boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates;

    const intersectedParts: number[][][][] = [];

    for (const partCoords of boundaryPolygons) {
      const clipped = intersect(featureCollection([sectorFeature, turfPolygon(partCoords)]));
      if (!clipped || !clipped.geometry) continue;
      if (clipped.geometry.type === 'Polygon') {
        intersectedParts.push(clipped.geometry.coordinates);
      } else if (clipped.geometry.type === 'MultiPolygon') {
        intersectedParts.push(...clipped.geometry.coordinates);
      }
    }

    if (intersectedParts.length === 0) {
      return null;
    }
    if (intersectedParts.length === 1) {
      return {
        type: 'Polygon',
        coordinates: intersectedParts[0],
      };
    }
    return pickLargestPolygon(intersectedParts);
  } catch {
    return null;
  }
}

export function isPointInSector(lat: number, lng: number, geo: GeoJsonPolygon): boolean {
  try {
    const pt = point([lng, lat]);
    const poly = turfPolygon(geo.coordinates);
    return booleanPointInPolygon(pt, poly);
  } catch {
    return false;
  }
}

export function findMatchingSectorId(
  lat: number,
  lng: number,
  sectors: Array<{ id: string; geoJsonPolygon: unknown }>
): string | null {
  for (const sector of sectors) {
    try {
      const parsed = parseGeoJsonPolygon(sector.geoJsonPolygon);
      if (isPointInSector(lat, lng, parsed)) {
        return sector.id;
      }
    } catch {
      // Ignore malformed polygon rows without crashing other sector matches
    }
  }
  return null;
}

export interface RecalculationSummary {
  totalPoints: number;
  assignedCount: number;
  outOfSectorCount: number;
  updatedCount: number;
}

export async function recalculateCampaignAssignments(
  campaignId: string
): Promise<RecalculationSummary> {
  const [sectors, points] = await Promise.all([
    prisma.sector.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, geoJsonPolygon: true },
    }),
    prisma.donationPoint.findMany({
      where: { campaignId, isAnonymized: false },
      select: { id: true, lat: true, lng: true, sectorId: true },
    }),
  ]);

  let assignedCount = 0;
  let outOfSectorCount = 0;
  const updates: Array<{ id: string; nextSectorId: string | null }> = [];

  for (const pt of points) {
    const matchedSectorId = findMatchingSectorId(pt.lat, pt.lng, sectors);
    if (matchedSectorId) {
      assignedCount += 1;
    } else {
      outOfSectorCount += 1;
    }

    if (matchedSectorId !== pt.sectorId) {
      updates.push({ id: pt.id, nextSectorId: matchedSectorId });
    }
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.donationPoint.update({
          where: { id: u.id },
          data: { sectorId: u.nextSectorId },
        })
      )
    );
  }

  return {
    totalPoints: points.length,
    assignedCount,
    outOfSectorCount,
    updatedCount: updates.length,
  };
}
