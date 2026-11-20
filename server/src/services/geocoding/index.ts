import { env } from '../../config/env.js';
import { GoogleGeocodingProvider } from './googleProvider.js';
import { MapboxGeocodingProvider } from './mapboxProvider.js';
import { PhotonGeocodingProvider } from './photonProvider.js';
import type { GeocodingProvider, GeocodingSuggestion, SearchBias } from './types.js';

export type { GeocodingSuggestion, SearchBias, GeocodingProvider } from './types.js';

interface CacheEntry {
  expiresAt: number;
  data: GeocodingSuggestion[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

function getProvider(): GeocodingProvider {
  switch (env.GEOCODING_PROVIDER) {
    case 'mapbox':
      return new MapboxGeocodingProvider();
    case 'google':
      return new GoogleGeocodingProvider();
    case 'photon':
    default:
      return new PhotonGeocodingProvider();
  }
}

function getCached(key: string): GeocodingSuggestion[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: GeocodingSuggestion[]): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  });
}

export async function searchAddresses(
  query: string,
  bias?: SearchBias
): Promise<{ provider: string; suggestions: GeocodingSuggestion[] }> {
  const provider = getProvider();
  const biasKey = bias ? `${bias.lat.toFixed(2)},${bias.lng.toFixed(2)}` : 'none';
  const cacheKey = `addr:${provider.name}:${query.trim().toLowerCase()}:${biasKey}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return { provider: provider.name, suggestions: cached };
  }

  const suggestions = await provider.searchAddresses(query.trim(), bias);
  setCached(cacheKey, suggestions);
  return { provider: provider.name, suggestions };
}

export async function searchCities(
  query: string
): Promise<{ provider: string; suggestions: GeocodingSuggestion[] }> {
  const provider = getProvider();
  const cacheKey = `city:${provider.name}:${query.trim().toLowerCase()}`;

  const cached = getCached(cacheKey);
  if (cached) {
    return { provider: provider.name, suggestions: cached };
  }

  const suggestions = await provider.searchCities(query.trim());
  setCached(cacheKey, suggestions);
  return { provider: provider.name, suggestions };
}
