import { env } from '../../config/env.js';
import type { GeocodingProvider, GeocodingSuggestion, SearchBias } from './types.js';

interface PhotonFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
    country?: string;
    type?: string;
    extent?: [number, number, number, number];
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

function formatPhotonLabel(p: NonNullable<PhotonFeature['properties']>): string {
  const streetLine = [p.housenumber, p.street].filter(Boolean).join(' ').trim() || p.name || '';
  const locality = p.city || p.town || p.village || p.municipality || '';
  const parts = [streetLine, locality, p.postcode, p.state, p.country].filter(
    (part, idx, arr) => Boolean(part) && arr.indexOf(part) === idx
  );
  return parts.join(', ');
}

function mapFeatures(features: PhotonFeature[] = []): GeocodingSuggestion[] {
  const results: GeocodingSuggestion[] = [];
  const seenLabels = new Set<string>();

  for (const feature of features) {
    const coords = feature.geometry?.coordinates;
    const props = feature.properties;
    if (!coords || coords.length < 2 || !props) {
      continue;
    }

    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }

    const label = formatPhotonLabel(props);
    if (!label || seenLabels.has(label)) {
      continue;
    }
    seenLabels.add(label);

    results.push({
      id: `${props.osm_type ?? 'N'}-${props.osm_id ?? `${lat},${lng}`}`,
      label,
      street: props.street,
      houseNumber: props.housenumber,
      city: props.city || props.town || props.village || props.municipality || props.name,
      postalCode: props.postcode,
      country: props.country,
      lat,
      lng,
      extent: Array.isArray(props.extent) && props.extent.length === 4 ? props.extent : undefined,
    });
  }

  return results;
}

export class PhotonGeocodingProvider implements GeocodingProvider {
  readonly name = 'photon';

  private async queryPhoton(params: URLSearchParams): Promise<PhotonFeature[]> {
    const url = `${env.PHOTON_BASE_URL}/api/?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CollecteEcolePWA/1.0 (+https://github.com/collecte-ecole)',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      throw new Error(`Photon API a répondu avec le statut ${response.status}`);
    }

    const payload = (await response.json()) as PhotonResponse;
    return payload.features ?? [];
  }

  async searchAddresses(query: string, bias?: SearchBias): Promise<GeocodingSuggestion[]> {
    const params = new URLSearchParams({
      q: query,
      limit: '7',
      lang: 'fr',
    });

    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      params.set('lat', String(bias.lat));
      params.set('lon', String(bias.lng));
    }

    const features = await this.queryPhoton(params);
    return mapFeatures(features);
  }

  async searchCities(query: string): Promise<GeocodingSuggestion[]> {
    const params = new URLSearchParams({
      q: query,
      limit: '6',
      lang: 'fr',
    });
    params.append('osm_tag', 'place:city');
    params.append('osm_tag', 'place:town');
    params.append('osm_tag', 'place:village');
    params.append('osm_tag', 'place:municipality');
    params.append('osm_tag', 'boundary:administrative');

    const features = await this.queryPhoton(params);
    if (features.length > 0) {
      return mapFeatures(features);
    }

    // Fallback sans filtre osm_tag si la recherche est large (ex: quartier ou région)
    const fallbackParams = new URLSearchParams({
      q: query,
      limit: '6',
      lang: 'fr',
    });
    const fallbackFeatures = await this.queryPhoton(fallbackParams);
    return mapFeatures(fallbackFeatures);
  }
}
