import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocateFixed, Maximize2 } from 'lucide-react';
import { Circle, MapContainer, Marker, Polygon, TileLayer, useMap } from 'react-leaflet';
import type { DonationPoint, GeoJsonPolygon } from '../../types';
import { geoJsonToLatLngs, getPointMarkerIcon, gpsUserIcon } from './mapIcons';

interface FieldMapProps {
  sectorColor: string;
  geoJsonPolygon: GeoJsonPolygon;
  centerLat: number;
  centerLng: number;
  points: DonationPoint[];
  selectedPointId: string | null;
  onSelectPoint: (point: DonationPoint) => void;
}

interface MapActionsBridgeProps {
  geoJsonPolygon: GeoJsonPolygon;
  userPos: { lat: number; lng: number } | null;
  recenterSignal: number;
  locateUserSignal: number;
}

function MapActionsBridge({
  geoJsonPolygon,
  userPos,
  recenterSignal,
  locateUserSignal,
}: MapActionsBridgeProps) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  const fitSector = () => {
    const latLngs = geoJsonToLatLngs(geoJsonPolygon);
    if (latLngs.length > 0 && latLngs[0].length > 0) {
      const bounds = L.latLngBounds(latLngs[0]);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
      }
    }
  };

  useEffect(() => {
    if (!hasFittedRef.current) {
      fitSector();
      hasFittedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoJsonPolygon]);

  useEffect(() => {
    if (recenterSignal > 0) {
      fitSector();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  useEffect(() => {
    if (locateUserSignal > 0 && userPos) {
      map.flyTo([userPos.lat, userPos.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    }
  }, [locateUserSignal, userPos, map]);

  return null;
}

export function FieldMap({
  sectorColor,
  geoJsonPolygon,
  centerLat,
  centerLng,
  points,
  selectedPointId,
  onSelectPoint,
}: FieldMapProps) {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(
    null
  );
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [locateUserSignal, setLocateUserSignal] = useState(0);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('Géolocalisation non prise en charge par ce navigateur.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGpsError(null);
        setUserPos({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('Position GPS refusée. Activez la localisation pour vous repérer.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const handleLocateClick = () => {
    if (userPos) {
      setLocateUserSignal((n) => n + 1);
      return;
    }
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsError(null);
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocateUserSignal((n) => n + 1);
      },
      () => {
        setGpsError('Impossible d’obtenir votre position GPS actuellement.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const polygonCoords = geoJsonToLatLngs(geoJsonPolygon);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={14}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapActionsBridge
          geoJsonPolygon={geoJsonPolygon}
          userPos={userPos ? { lat: userPos.lat, lng: userPos.lng } : null}
          recenterSignal={recenterSignal}
          locateUserSignal={locateUserSignal}
        />

        {polygonCoords.length > 0 && (
          <Polygon
            positions={polygonCoords}
            pathOptions={{
              color: sectorColor,
              fillColor: sectorColor,
              fillOpacity: 0.14,
              weight: 3,
            }}
          />
        )}

        {userPos && (
          <>
            <Circle
              center={[userPos.lat, userPos.lng]}
              radius={Math.min(userPos.accuracy, 150)}
              pathOptions={{
                color: '#2563EB',
                fillColor: '#3B82F6',
                fillOpacity: 0.12,
                weight: 1,
              }}
            />
            <Marker position={[userPos.lat, userPos.lng]} icon={gpsUserIcon} />
          </>
        )}

        {points.map((pt) => (
          <Marker
            key={pt.id}
            position={[pt.lat, pt.lng]}
            icon={getPointMarkerIcon(pt.status, {
              selected: pt.id === selectedPointId,
            })}
            eventHandlers={{
              click: () => onSelectPoint(pt),
            }}
          />
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute right-3 top-3 z-[500] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleLocateClick}
          className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-md ring-1 ring-slate-200 backdrop-blur hover:bg-white active:scale-95"
        >
          <LocateFixed className="h-4 w-4 text-blue-600" />
          Ma position
        </button>
        <button
          type="button"
          onClick={() => setRecenterSignal((n) => n + 1)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-md ring-1 ring-slate-200 backdrop-blur hover:bg-white active:scale-95"
        >
          <Maximize2 className="h-4 w-4 text-slate-600" />
          Secteur
        </button>
      </div>

      {gpsError && (
        <div className="pointer-events-none absolute left-3 right-28 top-3 z-[500]">
          <div className="rounded-lg bg-amber-50/95 px-3 py-1.5 text-xs font-medium text-amber-900 shadow ring-1 ring-amber-200">
            {gpsError}
          </div>
        </div>
      )}
    </div>
  );
}
