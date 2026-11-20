import { useEffect, useRef } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { DonationPoint, GeoJsonPolygon, Sector } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { geoJsonToLatLngs, getPointMarkerIcon, polygonLayerToGeoJson } from './mapIcons';

interface TaggedPolygon extends L.Polygon {
  _sectorId?: string;
}

interface AdminSectorMapProps {
  centerLat: number;
  centerLng: number;
  zoomLevel: number;
  sectors: Sector[];
  donationPoints: DonationPoint[];
  selectedSectorId: string | null;
  highlightOutOfSector: boolean;
  onSelectSector: (sectorId: string | null) => void;
  onCreatePolygon: (geoJson: GeoJsonPolygon) => void | Promise<void>;
  onUpdatePolygon: (sectorId: string, geoJson: GeoJsonPolygon) => void | Promise<void>;
  onDeleteSector: (sectorId: string) => void | Promise<void>;
}

function CampaignCenterSync({
  centerLat,
  centerLng,
  zoomLevel,
}: {
  centerLat: number;
  centerLng: number;
  zoomLevel: number;
}) {
  const map = useMap();
  const prevCenterRef = useRef<string>('');

  useEffect(() => {
    const key = `${centerLat.toFixed(5)}:${centerLng.toFixed(5)}:${zoomLevel}`;
    if (prevCenterRef.current && prevCenterRef.current !== key) {
      map.flyTo([centerLat, centerLng], zoomLevel, { duration: 0.8 });
    }
    prevCenterRef.current = key;
  }, [centerLat, centerLng, zoomLevel, map]);

  return null;
}

function GeomanController({
  sectors,
  selectedSectorId,
  onSelectSector,
  onCreatePolygon,
  onUpdatePolygon,
  onDeleteSector,
}: Pick<
  AdminSectorMapProps,
  | 'sectors'
  | 'selectedSectorId'
  | 'onSelectSector'
  | 'onCreatePolygon'
  | 'onUpdatePolygon'
  | 'onDeleteSector'
>) {
  const map = useMap();
  const featureGroupRef = useRef<L.FeatureGroup>(L.featureGroup());

  const onCreateRef = useRef(onCreatePolygon);
  const onUpdateRef = useRef(onUpdatePolygon);
  const onDeleteRef = useRef(onDeleteSector);
  const onSelectRef = useRef(onSelectSector);

  onCreateRef.current = onCreatePolygon;
  onUpdateRef.current = onUpdatePolygon;
  onDeleteRef.current = onDeleteSector;
  onSelectRef.current = onSelectSector;

  useEffect(() => {
    const group = featureGroupRef.current;
    group.addTo(map);

    map.pm.setLang('fr');
    map.pm.setGlobalOptions({
      layerGroup: group,
      allowSelfIntersection: false,
      snappable: true,
      snapDistance: 15,
    });

    map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      removalMode: true,
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    });

    const handleCreate = (event: { layer?: L.Layer }) => {
      const layer = event.layer;
      if (!layer || !(layer instanceof L.Polygon)) return;
      const geoJson = polygonLayerToGeoJson(layer);
      group.removeLayer(layer);
      map.removeLayer(layer);
      if (geoJson.coordinates.length > 0) {
        void onCreateRef.current(geoJson);
      }
    };

    const handleRemove = (event: { layer?: L.Layer }) => {
      const layer = event.layer as TaggedPolygon | undefined;
      if (layer && layer._sectorId) {
        void onDeleteRef.current(layer._sectorId);
      }
    };

    map.on('pm:create', handleCreate as L.LeafletEventHandlerFn);
    map.on('pm:remove', handleRemove as L.LeafletEventHandlerFn);

    return () => {
      map.off('pm:create', handleCreate as L.LeafletEventHandlerFn);
      map.off('pm:remove', handleRemove as L.LeafletEventHandlerFn);
      map.pm.removeControls();
      group.remove();
    };
  }, [map]);

  useEffect(() => {
    const group = featureGroupRef.current;
    group.clearLayers();

    for (const sector of sectors) {
      const isSelected = sector.id === selectedSectorId;
      const latLngs = geoJsonToLatLngs(sector.geoJsonPolygon);
      const poly = L.polygon(latLngs, {
        color: sector.color,
        fillColor: sector.color,
        fillOpacity: isSelected ? 0.36 : 0.2,
        weight: isSelected ? 3.5 : 2,
      }) as TaggedPolygon;

      poly._sectorId = sector.id;
      poly.bindTooltip(sector.name, { sticky: true });

      poly.on('click', () => {
        onSelectRef.current(sector.id);
      });

      const emitGeometryUpdate = () => {
        const updatedGeo = polygonLayerToGeoJson(poly);
        if (updatedGeo.coordinates.length > 0) {
          void onUpdateRef.current(sector.id, updatedGeo);
        }
      };

      poly.on('pm:edit', emitGeometryUpdate);
      poly.on('pm:dragend', emitGeometryUpdate);

      group.addLayer(poly);
    }
  }, [sectors, selectedSectorId]);

  return null;
}

export function AdminSectorMap({
  centerLat,
  centerLng,
  zoomLevel,
  sectors,
  donationPoints,
  selectedSectorId,
  highlightOutOfSector,
  onSelectSector,
  onCreatePolygon,
  onUpdatePolygon,
  onDeleteSector,
}: AdminSectorMapProps) {
  const sectorNamesById = new Map(sectors.map((s) => [s.id, s.name]));

  const visiblePoints = highlightOutOfSector
    ? donationPoints.filter((pt) => !pt.sectorId)
    : donationPoints;

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={zoomLevel}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CampaignCenterSync
          centerLat={centerLat}
          centerLng={centerLng}
          zoomLevel={zoomLevel}
        />

        <GeomanController
          sectors={sectors}
          selectedSectorId={selectedSectorId}
          onSelectSector={onSelectSector}
          onCreatePolygon={onCreatePolygon}
          onUpdatePolygon={onUpdatePolygon}
          onDeleteSector={onDeleteSector}
        />

        {visiblePoints.map((pt) => {
          const isOutOfSector = !pt.sectorId;
          const sectorLabel = pt.sectorId ? sectorNamesById.get(pt.sectorId) : null;
          return (
            <Marker
              key={pt.id}
              position={[pt.lat, pt.lng]}
              icon={getPointMarkerIcon(pt.status, { outOfSector: isOutOfSector })}
              // Empêche Geoman d'éditer ou supprimer les marqueurs de collecte
              {...({ pmIgnore: true } as Record<string, unknown>)}
            >
              <Popup>
                <div className="min-w-[210px] space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={pt.status} outOfSector={isOutOfSector} />
                  </div>
                  <p className="font-semibold text-slate-900">{pt.address}</p>
                  {pt.donorName && <p className="text-slate-600">Donateur : {pt.donorName}</p>}
                  {pt.preferredTimeSlot && (
                    <p className="text-xs text-slate-500">Créneau : {pt.preferredTimeSlot}</p>
                  )}
                  {pt.instructions && (
                    <p className="rounded bg-amber-50 p-1.5 text-xs text-amber-900">
                      {pt.instructions}
                    </p>
                  )}
                  <p className="text-xs font-medium text-slate-700">
                    Secteur : {sectorLabel ?? 'Hors secteur'}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
