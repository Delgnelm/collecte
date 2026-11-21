import { useEffect, useRef } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { DonationPoint, GeoJsonBoundary, GeoJsonPolygon, Sector } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { geoJsonToLatLngs, getPointMarkerIcon, polygonLayerToGeoJson } from './mapIcons';

interface TaggedPolygon extends L.Polygon {
  _sectorId?: string;
}

interface AdminSectorMapProps {
  centerLat: number;
  centerLng: number;
  zoomLevel: number;
  boundaryGeoJson: GeoJsonBoundary | null;
  drawMode: 'sector' | 'boundary';
  sectors: Sector[];
  donationPoints: DonationPoint[];
  selectedSectorId: string | null;
  highlightOutOfSector: boolean;
  onSelectSector: (sectorId: string | null) => void;
  onCreatePolygon: (geoJson: GeoJsonPolygon) => void | Promise<void>;
  onUpdatePolygon: (sectorId: string, geoJson: GeoJsonPolygon) => void | Promise<void>;
  onDeleteSector: (sectorId: string) => void | Promise<void>;
  onSetBoundary: (geoJson: GeoJsonPolygon) => void | Promise<void>;
  onCancelBoundaryDraw: () => void;
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

function BoundaryReferenceLayer({ boundaryGeoJson }: { boundaryGeoJson: GeoJsonBoundary | null }) {
  const map = useMap();
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const prevKeyRef = useRef<string>('');

  useEffect(() => {
    const layer = L.geoJSON(undefined, {
      interactive: false,
      style: {
        color: '#0f172a',
        weight: 3,
        dashArray: '8 6',
        fillColor: '#1e3a8a',
        fillOpacity: 0.05,
      },
      ...({ pmIgnore: true } as Record<string, unknown>),
    } as L.GeoJSONOptions);

    layer.addTo(map);
    boundaryLayerRef.current = layer;

    return () => {
      layer.remove();
      boundaryLayerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const layer = boundaryLayerRef.current;
    if (!layer) return;

    const nextKey = boundaryGeoJson ? JSON.stringify(boundaryGeoJson) : '';
    layer.clearLayers();

    if (boundaryGeoJson) {
      layer.addData(boundaryGeoJson as never);
      layer.eachLayer((child) => {
        (child.options as Record<string, unknown>).pmIgnore = true;
      });
      layer.bringToBack();

      if (nextKey !== prevKeyRef.current) {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [28, 28] });
        }
      }
    }

    prevKeyRef.current = nextKey;
  }, [boundaryGeoJson, map]);

  return null;
}

function GeomanController({
  sectors,
  selectedSectorId,
  drawMode,
  onSelectSector,
  onCreatePolygon,
  onUpdatePolygon,
  onDeleteSector,
  onSetBoundary,
}: Pick<
  AdminSectorMapProps,
  | 'sectors'
  | 'selectedSectorId'
  | 'drawMode'
  | 'onSelectSector'
  | 'onCreatePolygon'
  | 'onUpdatePolygon'
  | 'onDeleteSector'
  | 'onSetBoundary'
>) {
  const map = useMap();
  const featureGroupRef = useRef<L.FeatureGroup>(L.featureGroup());

  const drawModeRef = useRef(drawMode);
  const onCreateRef = useRef(onCreatePolygon);
  const onUpdateRef = useRef(onUpdatePolygon);
  const onDeleteRef = useRef(onDeleteSector);
  const onSelectRef = useRef(onSelectSector);
  const onSetBoundaryRef = useRef(onSetBoundary);

  drawModeRef.current = drawMode;
  onCreateRef.current = onCreatePolygon;
  onUpdateRef.current = onUpdatePolygon;
  onDeleteRef.current = onDeleteSector;
  onSelectRef.current = onSelectSector;
  onSetBoundaryRef.current = onSetBoundary;

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
        if (drawModeRef.current === 'boundary') {
          void onSetBoundaryRef.current(geoJson);
        } else {
          void onCreateRef.current(geoJson);
        }
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
    if (drawMode === 'boundary') {
      map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 15,
        allowSelfIntersection: false,
      });
    } else {
      map.pm.disableDraw('Polygon');
    }
  }, [drawMode, map]);

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
  boundaryGeoJson,
  drawMode,
  sectors,
  donationPoints,
  selectedSectorId,
  highlightOutOfSector,
  onSelectSector,
  onCreatePolygon,
  onUpdatePolygon,
  onDeleteSector,
  onSetBoundary,
  onCancelBoundaryDraw,
}: AdminSectorMapProps) {
  const sectorNamesById = new Map(sectors.map((s) => [s.id, s.name]));

  const visiblePoints = highlightOutOfSector
    ? donationPoints.filter((pt) => !pt.sectorId)
    : donationPoints;

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      {drawMode === 'boundary' && (
        <div className="pointer-events-none absolute left-14 right-4 top-3 z-[500] flex justify-center">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-blue-300 bg-blue-950/95 px-4 py-2 text-xs font-medium text-white shadow-lg">
            <span>
              <strong>Mode Zone Principale :</strong> cliquez sur la carte pour tracer les limites de la zone, puis fermez le polygone.
            </span>
            <button
              type="button"
              onClick={onCancelBoundaryDraw}
              className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <MapContainer center={[centerLat, centerLng]} zoom={zoomLevel} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CampaignCenterSync
          centerLat={centerLat}
          centerLng={centerLng}
          zoomLevel={zoomLevel}
        />

        <BoundaryReferenceLayer boundaryGeoJson={boundaryGeoJson} />

        <GeomanController
          sectors={sectors}
          selectedSectorId={selectedSectorId}
          drawMode={drawMode}
          onSelectSector={onSelectSector}
          onCreatePolygon={onCreatePolygon}
          onUpdatePolygon={onUpdatePolygon}
          onDeleteSector={onDeleteSector}
          onSetBoundary={onSetBoundary}
        />

        {visiblePoints.map((pt) => {
          const isOutOfSector = !pt.sectorId;
          const sectorLabel = pt.sectorId ? sectorNamesById.get(pt.sectorId) : null;
          return (
            <Marker
              key={pt.id}
              position={[pt.lat, pt.lng]}
              icon={getPointMarkerIcon(pt.status, { outOfSector: isOutOfSector })}
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
