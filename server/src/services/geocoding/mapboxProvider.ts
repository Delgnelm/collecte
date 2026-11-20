import { env } from '../../config/env.js';
import type { GeocodingProvider, GeocodingSuggestion, SearchBias } from './types.js';

interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
  bbox?: [number, number, number, number];
  address?: string;
  text?: string;
  context?: Array<{ id: string; text: string }>;
}

interface MapboxResponse {
  features?: MapboxFeature[];
}

export class MapboxGeocodingProvider implements GeocodingProvider {
  readonly name = 'mapbox';

  private ensureToken(): string {
    if (!env.MAPBOX_ACCESS_TOKEN) {
      throw new Error('MAPBOX_ACCESS_TOKEN est requis lorsque GEOCODING_PROVIDER=mapbox');
    }
    return env.MAPBOX_ACCESS_TOKEN;
  }

  private async queryMapbox(
    query: string,
    types: string,
    bias?: SearchBias
  ): Promise<GeocodingSuggestion[]> {
    const token = this.ensureToken();
    const params = new URLSearchParams({
      access_token: token,
      autocomplete: 'true',
      language: 'fr',
      limit: '6',
      types,
    });

    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      params.set('proximity', `${bias.lng},${bias.lat}`);
    }

    const encoded = encodeURIComponent(query);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      throw new Error(`Mapbox API a répondu avec le statut ${response.status}`);
    }

    const data = (await response.json()) as MapboxResponse;
    return (data.features ?? []).map((f) => {
      const postcode = f.context?.find((c) => c.id.startsWith('postcode'))?.text;
      const place = f.context?.find((c) => c.id.startsWith('place'))?.text;
      const country = f.context?.find((c) => c.id.startsWith('country'))?.text;
      return {
        id: f.id,
        label: f.place_name,
        street: f.text,
        houseNumber: f.address,
        city: place || f.text,
        postalCode: postcode,
        country,
        lng: f.center[0],
        lat: f.center[1],
        extent: f.bbox ? [f.bbox[0], f.bbox[3], f.bbox[2], f.bbox[1]] : undefined,
      };
    });
  }

  async searchAddresses(query: string, bias?: SearchBias): Promise<GeocodingSuggestion[]> {
    return this.queryMapbox(query, 'address,poi', bias);
  }

  async searchCities(query: string): Promise<GeocodingSuggestion[]> {
    return this.queryMapbox(query, 'place,locality,region');
  }
}
