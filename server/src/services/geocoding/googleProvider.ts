import { env } from '../../config/env.js';
import type { GeocodingProvider, GeocodingSuggestion, SearchBias } from './types.js';

interface GoogleAutocompletePrediction {
  place_id: string;
  description: string;
}

interface GoogleAutocompleteResponse {
  status: string;
  predictions?: GoogleAutocompletePrediction[];
  error_message?: string;
}

interface GoogleGeocodeResult {
  place_id: string;
  formatted_address: string;
  geometry: {
    location: { lat: number; lng: number };
    viewport?: {
      northeast: { lat: number; lng: number };
      southwest: { lat: number; lng: number };
    };
  };
  address_components?: Array<{
    long_name: string;
    types: string[];
  }>;
}

interface GoogleGeocodeResponse {
  status: string;
  results?: GoogleGeocodeResult[];
  error_message?: string;
}

export class GoogleGeocodingProvider implements GeocodingProvider {
  readonly name = 'google';

  private ensureKey(): string {
    if (!env.GOOGLE_PLACES_API_KEY) {
      throw new Error('GOOGLE_PLACES_API_KEY est requis lorsque GEOCODING_PROVIDER=google');
    }
    return env.GOOGLE_PLACES_API_KEY;
  }

  async searchAddresses(query: string, bias?: SearchBias): Promise<GeocodingSuggestion[]> {
    const key = this.ensureKey();
    const params = new URLSearchParams({
      input: query,
      key,
      language: 'fr',
      types: 'address',
    });

    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      params.set('location', `${bias.lat},${bias.lng}`);
      params.set('radius', '25000');
    }

    const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;
    const autoResp = await fetch(autocompleteUrl, { signal: AbortSignal.timeout(6000) });
    if (!autoResp.ok) {
      throw new Error(`Google Places API a répondu avec le statut ${autoResp.status}`);
    }

    const autoData = (await autoResp.json()) as GoogleAutocompleteResponse;
    const predictions = (autoData.predictions ?? []).slice(0, 5);
    if (predictions.length === 0) {
      return [];
    }

    const details = await Promise.all(
      predictions.map(async (p): Promise<GeocodingSuggestion | null> => {
        const geoParams = new URLSearchParams({
          place_id: p.place_id,
          key,
          language: 'fr',
        });
        const geoResp = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?${geoParams.toString()}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!geoResp.ok) return null;
        const geoData = (await geoResp.json()) as GoogleGeocodeResponse;
        const first = geoData.results?.[0];
        if (!first) return null;
        return {
          id: p.place_id,
          label: first.formatted_address || p.description,
          lat: first.geometry.location.lat,
          lng: first.geometry.location.lng,
        };
      })
    );

    return details.filter((item): item is GeocodingSuggestion => item !== null);
  }

  async searchCities(query: string): Promise<GeocodingSuggestion[]> {
    const key = this.ensureKey();
    const params = new URLSearchParams({
      address: query,
      key,
      language: 'fr',
    });
    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) {
      throw new Error(`Google Geocoding API a répondu avec le statut ${resp.status}`);
    }
    const data = (await resp.json()) as GoogleGeocodeResponse;
    return (data.results ?? []).slice(0, 5).map((r) => ({
      id: r.place_id,
      label: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      extent: r.geometry.viewport
        ? [
            r.geometry.viewport.southwest.lng,
            r.geometry.viewport.northeast.lat,
            r.geometry.viewport.northeast.lng,
            r.geometry.viewport.southwest.lat,
          ]
        : undefined,
    }));
  }
}
