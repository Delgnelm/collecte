import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import type L from 'leaflet';
import { donorConfirmIcon } from './mapIcons';

interface DonorConfirmMapProps {
  lat: number;
  lng: number;
  onAdjustCoordinates: (lat: number, lng: number) => void;
}

function MapCenterUpdater({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [lat, lng, map]);

  return null;
}

export function DonorConfirmMap({ lat, lng, onAdjustCoordinates }: DonorConfirmMapProps) {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm h-64 w-full">
        <MapContainer
          center={[lat, lng]}
          zoom={16}
          className="h-full w-full"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapCenterUpdater lat={lat} lng={lng} />
          <Marker
            position={[lat, lng]}
            icon={donorConfirmIcon}
            draggable={true}
            eventHandlers={{
              dragend: (event) => {
                const marker = event.target as L.Marker;
                const pos = marker.getLatLng();
                onAdjustCoordinates(
                  Number(pos.lat.toFixed(6)),
                  Number(pos.lng.toFixed(6))
                );
              },
            }}
          />
        </MapContainer>
      </div>
      <p className="text-xs text-slate-600">
        Vérifiez l’emplacement du marqueur sur votre résidence. Vous pouvez le glisser pour ajuster la position exacte ({lat.toFixed(5)}, {lng.toFixed(5)}).
      </p>
    </div>
  );
}
