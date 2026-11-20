import { booleanPointInPolygon, point, polygon as turfPolygon } from '@turf/turf';
import { prisma } from '../lib/prisma.js';
import type { GeoJsonPolygon } from '../schemas/validation.js';
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
