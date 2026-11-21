import {
  bbox as turfBbox,
  center as turfCenter,
  multiPolygon as turfMultiPolygon,
  polygon as turfPolygon,
  simplify,
} from '@turf/turf';
import type { GeoJsonBoundary } from '../../schemas/validation.js';
import type { SearchBias } from './types.js';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  class?: string;
  type?: string;
  importance?: number;
  geojson?: {
    type?: string;
    coordinates?: unknown;
  };
}

export type CityBoundaryResult =
  | {
      found: true;
      displayName: string;
      geoJson: GeoJsonBoundary;
      centerLat: number;
      centerLng: number;
      bbox: [number, number, number, number];
    }
  | {
      found: false;
    };

interface CacheEntry {
  expiresAt: number;
  data: CityBoundaryResult;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const boundaryCache = new Map<string, CacheEntry>();

function countVertices(geom: GeoJsonBoundary): number {
  if (geom.type === 'Polygon') {
    return geom.coordinates.reduce((sum, ring) => sum + ring.length, 0);
  }
  return geom.coordinates.reduce(
    (sum, poly) => sum + poly.reduce((pSum, ring) => pSum + ring.length, 0),
    0
  );
}

function simplifyBoundaryIfNeeded(geom: GeoJsonBoundary): GeoJsonBoundary {
  const vertices = countVertices(geom);
  if (vertices <= 800) {
    return geom;
  }

  const feature =
    geom.type === 'Polygon'
      ? turfPolygon(geom.coordinates)
      : turfMultiPolygon(geom.coordinates);

  const simplified1 = simplify(feature, {
    tolerance: 0.0005,
    highQuality: true,
    mutate: false,
  });
  let out = simplified1.geometry as GeoJsonBoundary;

  if (countVertices(out) > 4500) {
    const simplified2 = simplify(simplified1, {
      tolerance: 0.002,
      highQuality: true,
      mutate: false,
    });
    out = simplified2.geometry as GeoJsonBoundary;
  }

  return out;
}

async function queryNominatim(query: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    polygon_geojson: '1',
    polygon_threshold: '0.0005',
    limit: '5',
    addressdetails: '1',
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'fr',
      'User-Agent': 'CollecteEcolePWA/1.0 (+https://github.com/Delgnelm/collecte)',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Nominatim a répondu avec le statut ${response.status}`);
  }

  return (await response.json()) as NominatimResult[];
}

function pickBestCandidate(
  items: NominatimResult[],
  bias?: SearchBias
): NominatimResult | null {
  const polygonCandidates = items.filter(
    (item) =>
      item.geojson &&
      (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon') &&
      Array.isArray(item.geojson.coordinates)
  );

  if (polygonCandidates.length === 0) {
    return null;
  }

  const scored = polygonCandidates.map((item) => {
    let score = item.importance ?? 0;
    if (item.class === 'boundary' && item.type === 'administrative') {
      score += 10;
    } else if (item.class === 'place') {
      score += 5;
    }

    if (bias) {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const distSq = (lat - bias.lat) ** 2 + (lon - bias.lng) ** 2;
        score -= distSq * 2;
      }
    }

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.item ?? null;
}

export async function fetchCityBoundary(
  query: string,
  bias?: SearchBias
): Promise<CityBoundaryResult> {
  const trimmed = query.trim();
  const biasKey = bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : 'none';
  const cacheKey = `${trimmed.toLowerCase()}:${biasKey}`;

  const cached = boundaryCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) {
    return cached.data;
  }

  let results = await queryNominatim(trimmed);
  let best = pickBestCandidate(results, bias);

  if (!best && trimmed.includes(',')) {
    const parts = trimmed
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      const simplifiedQuery = `${parts[0]}, ${parts[parts.length - 1]}`;
      results = await queryNominatim(simplifiedQuery);
      best = pickBestCandidate(results, bias);
    }
    if (!best && parts.length >= 2) {
      results = await queryNominatim(parts[0]);
      best = pickBestCandidate(results, bias);
    }
  }

  let finalResult: CityBoundaryResult = { found: false };

  if (best && best.geojson) {
    const rawGeom = {
      type: best.geojson.type as 'Polygon' | 'MultiPolygon',
      coordinates: best.geojson.coordinates,
    } as GeoJsonBoundary;

    const geoJson = simplifyBoundaryIfNeeded(rawGeom);
    const feature =
      geoJson.type === 'Polygon'
        ? turfPolygon(geoJson.coordinates)
        : turfMultiPolygon(geoJson.coordinates);

    const computedBbox = turfBbox(feature);
    const computedCenter = turfCenter(feature);
    const [centerLng, centerLat] = computedCenter.geometry.coordinates;

    finalResult = {
      found: true,
      displayName: best.display_name,
      geoJson,
      centerLat,
      centerLng,
      bbox: [computedBbox[0], computedBbox[1], computedBbox[2], computedBbox[3]],
    };
  }

  if (boundaryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = boundaryCache.keys().next().value;
    if (oldestKey) boundaryCache.delete(oldestKey);
  }
  boundaryCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data: finalResult,
  });

  return finalResult;
}
