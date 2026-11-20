import L from 'leaflet';
import type { DonationStatus, GeoJsonPolygon } from '../../types';

export function geoJsonToLatLngs(polygon: GeoJsonPolygon): [number, number][][] {
  return polygon.coordinates.map((ring) =>
    ring.map(([lng, lat]) => [lat, lng] as [number, number])
  );
}

export function polygonLayerToGeoJson(layer: L.Polygon): GeoJsonPolygon {
  const rawLatLngs = layer.getLatLngs();

  const normalizeRing = (ring: L.LatLng[]): number[][] => {
    const coords = ring.map((pt) => [Number(pt.lng.toFixed(6)), Number(pt.lat.toFixed(6))]);
    if (coords.length > 0) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([first[0], first[1]]);
      }
    }
    return coords;
  };

  let rings: L.LatLng[][] = [];
  if (Array.isArray(rawLatLngs) && rawLatLngs.length > 0) {
    const firstItem = rawLatLngs[0];
    if (Array.isArray(firstItem)) {
      if (firstItem.length > 0 && Array.isArray(firstItem[0])) {
        // MultiPolygon-style nested array
        rings = firstItem as L.LatLng[][];
      } else {
        rings = rawLatLngs as L.LatLng[][];
      }
    } else {
      rings = [rawLatLngs as L.LatLng[]];
    }
  }

  return {
    type: 'Polygon',
    coordinates: rings.map(normalizeRing).filter((r) => r.length >= 4),
  };
}

export function getPointMarkerIcon(
  status: DonationStatus,
  options?: { outOfSector?: boolean; selected?: boolean }
): L.DivIcon {
  const outOfSector = Boolean(options?.outOfSector);
  const selected = Boolean(options?.selected);

  let fill = '#2563EB';
  let stroke = '#1E3A8A';
  let innerGlyph = `<circle cx="16" cy="14" r="4.5" fill="#FFFFFF"/>`;
  let dashAttr = '';

  if (outOfSector) {
    fill = '#DC2626';
    stroke = '#7F1D1D';
    dashAttr = `stroke-dasharray="3 2"`;
    innerGlyph = `<path d="M16 9v6M16 18.5v.5" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>`;
  } else if (status === 'COLLECTED') {
    fill = '#059669';
    stroke = '#064E3B';
    innerGlyph = `<path d="M11.5 14.5l3 3 6-6" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  } else if (status === 'ABSENT') {
    fill = '#64748B';
    stroke = '#334155';
    innerGlyph = `<path d="M12.5 11.5l7 7M19.5 11.5l-7 7" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>`;
  }

  const size = selected ? 40 : 32;
  const ringHalo = selected
    ? `<circle cx="16" cy="14" r="14" fill="${fill}" fill-opacity="0.22"/>`
    : '';

  const html = `
    <div style="width:${size}px;height:${size + 6}px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 4px rgba(15,23,42,0.35));">
      <svg width="${size}" height="${size + 6}" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        ${ringHalo}
        <path d="M16 2C9.373 2 4 7.373 4 14c0 8.5 12 21 12 21s12-12.5 12-21c0-6.627-5.373-12-12-12z"
              fill="${fill}" stroke="${stroke}" stroke-width="2" ${dashAttr}/>
        ${innerGlyph}
      </svg>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-donation-pin',
    iconSize: [size, size + 6],
    iconAnchor: [size / 2, size + 4],
    popupAnchor: [0, -(size - 4)],
  });
}

export const donorConfirmIcon = L.divIcon({
  html: `
    <div style="width:36px;height:42px;filter:drop-shadow(0 3px 6px rgba(30,58,138,0.4));">
      <svg width="36" height="42" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2C9.373 2 4 7.373 4 14c0 8.5 12 21 12 21s12-12.5 12-21c0-6.627-5.373-12-12-12z"
              fill="#4F46E5" stroke="#1E1B4B" stroke-width="2"/>
        <path d="M11 15l5-4.5L21 15v5h-3.2v-3h-3.6v3H11v-5z" fill="#FFFFFF"/>
      </svg>
    </div>
  `,
  className: 'donor-confirm-pin',
  iconSize: [36, 42],
  iconAnchor: [18, 40],
});

export const gpsUserIcon = L.divIcon({
  html: `
    <div class="gps-pulse-dot" style="width:18px;height:18px;border-radius:9999px;background:#2563EB;border:3px solid #FFFFFF;box-shadow:0 1px 6px rgba(15,23,42,0.4);"></div>
  `,
  className: 'gps-user-marker',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
