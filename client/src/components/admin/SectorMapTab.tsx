import { useState } from 'react';
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Mail,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  Campaign,
  DonationPoint,
  GeocodingSuggestion,
  GeoJsonPolygon,
  Sector,
} from '../../types';
import { AddressAutocomplete } from '../common/AddressAutocomplete';
import { AdminSectorMap } from '../map/AdminSectorMap';

function estimateZoomFromExtent(extent?: [number, number, number, number]): number {
  if (!extent) return 13;
  const spanLng = Math.abs(extent[2] - extent[0]);
  const spanLat = Math.abs(extent[1] - extent[3]);
  const span = Math.max(spanLng, spanLat);
  if (span > 1.0) return 9;
  if (span > 0.4) return 11;
  if (span > 0.15) return 12;
  if (span > 0.05) return 13;
  return 14;
}

const PRESET_COLORS = [
  '#2563EB',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
  '#DC2626',
  '#4F46E5',
];

interface SectorMapTabProps {
  campaign: Campaign;
  sectors: Sector[];
  donationPoints: DonationPoint[];
  onUpdateCampaign: (patch: Partial<Campaign>) => Promise<void>;
  onCreateSector: (geo: GeoJsonPolygon) => Promise<void>;
  onUpdateSector: (
    sectorId: string,
    patch: { name?: string; color?: string; geoJsonPolygon?: GeoJsonPolygon }
  ) => Promise<void>;
  onDeleteSector: (sectorId: string) => Promise<void>;
  onRotateToken: (sectorId: string) => Promise<void>;
  onRecalculate: () => Promise<void>;
  onDispatchSectorEmails: (sectorId: string) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function SectorMapTab({
  campaign,
  sectors,
  donationPoints,
  onUpdateCampaign,
  onCreateSector,
  onUpdateSector,
  onDeleteSector,
  onRotateToken,
  onRecalculate,
  onDispatchSectorEmails,
  onNotify,
}: SectorMapTabProps) {
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [onlyOutOfSector, setOnlyOutOfSector] = useState(false);
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});

  const outOfSectorCount = donationPoints.filter((pt) => !pt.sectorId).length;

  const handleCitySelect = async (suggestion: GeocodingSuggestion) => {
    const zoomLevel = estimateZoomFromExtent(suggestion.extent);
    await onUpdateCampaign({
      city: suggestion.label,
      centerLat: suggestion.lat,
      centerLng: suggestion.lng,
      zoomLevel,
    });
  };

  const handleCopyLink = async (sector: Sector) => {
    const url = `${window.location.origin}/terrain/${sector.accessToken}`;
    try {
      await navigator.clipboard.writeText(url);
      onNotify('success', `Lien terrain copié pour "${sector.name}".`);
    } catch {
      onNotify('info', `Lien terrain : ${url}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-slate-900">
              Découpage cartographique des secteurs (Geoman + Turf.js)
            </h2>
            <p className="text-xs text-slate-500">
              Choisissez d’abord la ville / secteur de travail ci-dessous pour centrer la carte, puis tracez vos zones avec l’outil Polygone en haut à gauche de la carte.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {outOfSectorCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyOutOfSector((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  onlyOutOfSector
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'border border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {onlyOutOfSector
                  ? 'Afficher tous les points'
                  : `Voir ${outOfSectorCount} point(s) hors secteur`}
              </button>
            )}

            <button
              type="button"
              onClick={() => void onRecalculate()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Recalculer Turf.js
            </button>
          </div>
        </div>

        <div className="max-w-xl">
          <AddressAutocomplete
            mode="city"
            label="Ville / secteur de travail (centre la carte automatiquement)"
            placeholder="Ex : Sept-Îles, Sherbrooke, Québec, Laval..."
            selectedLabel={campaign.city}
            onSelect={(s) => void handleCitySelect(s)}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <AdminSectorMap
            centerLat={campaign.centerLat}
            centerLng={campaign.centerLng}
            zoomLevel={campaign.zoomLevel}
            sectors={sectors}
            donationPoints={donationPoints}
            selectedSectorId={selectedSectorId}
            highlightOutOfSector={onlyOutOfSector}
            onSelectSector={setSelectedSectorId}
            onCreatePolygon={(geo) => onCreateSector(geo)}
            onUpdatePolygon={(id, geo) => onUpdateSector(id, { geoJsonPolygon: geo })}
            onDeleteSector={(id) => onDeleteSector(id)}
          />
        </div>

        <div className="space-y-3 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Secteurs / Équipes ({sectors.length})
            </h3>
            {selectedSectorId && (
              <button
                type="button"
                onClick={() => setSelectedSectorId(null)}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                Tout désélectionner
              </button>
            )}
          </div>

          {sectors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Aucun secteur tracé pour l’instant. Cliquez sur l’icône polygone sur la carte pour dessiner votre premier secteur.
            </div>
          ) : (
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {sectors.map((sector) => {
                const isSelected = sector.id === selectedSectorId;
                const draftName = editingNames[sector.id] ?? sector.name;
                const pointTotal = sector.pointStats?.total ?? 0;
                const pointCollected = sector.pointStats?.collected ?? 0;

                return (
                  <div
                    key={sector.id}
                    onClick={() => setSelectedSectorId(sector.id)}
                    className={`cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-100'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: sector.color }}
                      />
                      <input
                        type="text"
                        value={draftName}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setEditingNames((prev) => ({
                            ...prev,
                            [sector.id]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          const trimmed = draftName.trim();
                          if (trimmed && trimmed !== sector.name) {
                            void onUpdateSector(sector.id, { name: trimmed });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-bold text-slate-900 focus:border-slate-300 focus:bg-slate-50 focus:outline-none"
                      />
                    </div>

                    <div
                      className="mt-2.5 flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {PRESET_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => void onUpdateSector(sector.id, { color: hex })}
                          className={`h-4 w-4 rounded-full transition ${
                            sector.color.toUpperCase() === hex
                              ? 'scale-125 ring-2 ring-slate-900 ring-offset-1'
                              : 'opacity-75 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: hex }}
                          aria-label={`Couleur ${hex}`}
                        />
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium">
                        {pointTotal} point(s) ({pointCollected} collecté(s))
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium">
                        {sector.volunteerCount ?? 0} bénévole(s)
                      </span>
                    </div>

                    <div
                      className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(sector)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        title="Copier le lien terrain"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Lien
                      </button>

                      <a
                        href={`/terrain/${sector.accessToken}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        title="Ouvrir la vue terrain"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ouvrir
                      </a>

                      <button
                        type="button"
                        onClick={() => void onDispatchSectorEmails(sector.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
                        title="Envoyer les parcours par courriel à cette équipe"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Envoyer
                      </button>

                      <button
                        type="button"
                        onClick={() => void onRotateToken(sector.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        title="Régénérer le jeton d'accès terrain"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void onDeleteSector(sector.id)}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        title="Supprimer ce secteur"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
