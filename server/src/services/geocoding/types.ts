export interface GeocodingSuggestion {
  id: string;
  label: string;
  street?: string;
  houseNumber?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  lat: number;
  lng: number;
  extent?: [number, number, number, number];
}

export interface SearchBias {
  lat: number;
  lng: number;
}

export interface GeocodingProvider {
  readonly name: string;
  searchAddresses(query: string, bias?: SearchBias): Promise<GeocodingSuggestion[]>;
  searchCities(query: string): Promise<GeocodingSuggestion[]>;
}
