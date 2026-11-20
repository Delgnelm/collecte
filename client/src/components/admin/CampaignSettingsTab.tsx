import { useEffect, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  Save,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import type { AdminStats, Campaign, GeocodingSuggestion } from '../../types';
import { AddressAutocomplete } from '../common/AddressAutocomplete';
import { PurgeDataModal } from './PurgeDataModal';

interface CampaignSettingsTabProps {
  tenantSlug: string;
  campaign: Campaign;
  stats: AdminStats;
  onUpdateCampaign: (patch: Partial<Campaign>) => Promise<void>;
  onPurgePii: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

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

export function CampaignSettingsTab({
  tenantSlug,
  campaign,
  stats,
  onUpdateCampaign,
  onPurgePii,
  onNotify,
}: CampaignSettingsTabProps) {
  const copyLink = async (path: string, label: string) => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      onNotify('success', `${label} copié : ${url}`);
    } catch {
      onNotify('info', `${label} : ${url}`);
    }
  };
  const [name, setName] = useState(campaign.name);
  const [city, setCity] = useState(campaign.city);
  const [centerLat, setCenterLat] = useState(campaign.centerLat);
  const [centerLng, setCenterLng] = useState(campaign.centerLng);
  const [zoomLevel, setZoomLevel] = useState(campaign.zoomLevel);
  const [saving, setSaving] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  useEffect(() => {
    setName(campaign.name);
    setCity(campaign.city);
    setCenterLat(campaign.centerLat);
    setCenterLng(campaign.centerLng);
    setZoomLevel(campaign.zoomLevel);
  }, [campaign]);

  const handleCitySelect = async (suggestion: GeocodingSuggestion) => {
    const nextZoom = estimateZoomFromExtent(suggestion.extent);
    setCity(suggestion.label);
    setCenterLat(suggestion.lat);
    setCenterLng(suggestion.lng);
    setZoomLevel(nextZoom);

    setSaving(true);
    try {
      await onUpdateCampaign({
        city: suggestion.label,
        centerLat: suggestion.lat,
        centerLng: suggestion.lng,
        zoomLevel: nextZoom,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onUpdateCampaign({
        name: name.trim(),
        city: city.trim(),
        centerLat,
        centerLng,
        zoomLevel,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Globaux */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Total points</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{stats.global.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-xs font-medium text-emerald-700">Collectés</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{stats.global.collected}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
          <p className="text-xs font-medium text-blue-700">En attente</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">{stats.global.pending}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Absents</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{stats.global.absent}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4 shadow-sm">
          <p className="text-xs font-medium text-red-700">Hors secteur</p>
          <p className="mt-1 text-2xl font-bold text-red-900">{stats.global.outOfSector}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Configuration campagne & carte */}
        <form
          onSubmit={handleSaveDetails}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <MapPin className="h-5 w-5 text-blue-700" />
            <h2 className="text-base font-bold text-slate-900">
              Configuration de la campagne & zone géographique
            </h2>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800">
              Nom de la campagne
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <AddressAutocomplete
            mode="city"
            label="Rechercher la ville / région (centre la carte automatiquement)"
            placeholder="Ex : Sherbrooke, Laval, Québec..."
            selectedLabel={city}
            onSelect={(s) => void handleCitySelect(s)}
          />

          <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <div>
              <span className="block text-slate-400">Latitude</span>
              <span className="font-mono font-semibold text-slate-800">{centerLat.toFixed(4)}</span>
            </div>
            <div>
              <span className="block text-slate-400">Longitude</span>
              <span className="font-mono font-semibold text-slate-800">{centerLng.toFixed(4)}</span>
            </div>
            <div>
              <label className="block text-slate-400">Zoom (3-19)</label>
              <input
                type="number"
                min={3}
                max={19}
                value={zoomLevel}
                onChange={(e) => setZoomLevel(Number(e.target.value) || 13)}
                className="mt-0.5 w-20 rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-slate-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer les paramètres
          </button>
        </form>

        {/* Ouverture des formulaires publics */}
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <BarChart3 className="h-5 w-5 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-900">
              Ouverture des formulaires publics
            </h2>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Formulaire d’inscription des Donateurs
                  </p>
                  <p className="text-xs text-slate-500">
                    Permet aux citoyens de déclarer leur adresse de cueillette.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void onUpdateCampaign({ isDonorFormOpen: !campaign.isDonorFormOpen })
                  }
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                    campaign.isDonorFormOpen
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {campaign.isDonorFormOpen ? (
                    <>
                      <ToggleRight className="h-5 w-5 text-emerald-600" />
                      Ouvert
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-5 w-5 text-slate-500" />
                      Fermé
                    </>
                  )}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="truncate font-mono text-slate-700">/t/{tenantSlug}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copyLink(`/t/${tenantSlug}`, 'Lien donateurs')}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Copy className="h-3 w-3" />
                    Copier
                  </button>
                  <a
                    href={`/t/${tenantSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ouvrir
                  </a>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Formulaire d’inscription des Bénévoles
                  </p>
                  <p className="text-xs text-slate-500">
                    Permet aux parents et volontaires de s’inscrire pour la collecte.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void onUpdateCampaign({ isVolunteerFormOpen: !campaign.isVolunteerFormOpen })
                  }
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                    campaign.isVolunteerFormOpen
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {campaign.isVolunteerFormOpen ? (
                    <>
                      <ToggleRight className="h-5 w-5 text-emerald-600" />
                      Ouvert
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-5 w-5 text-slate-500" />
                      Fermé
                    </>
                  )}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="truncate font-mono text-slate-700">/t/{tenantSlug}/benevole</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void copyLink(`/t/${tenantSlug}/benevole`, 'Lien bénévoles')}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Copy className="h-3 w-3" />
                    Copier
                  </button>
                  <a
                    href={`/t/${tenantSlug}/benevole`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ouvrir
                  </a>
                </div>
              </div>
            </div>
          </div>

          {stats.bySector.length > 0 && (
            <div className="pt-2">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bilan par secteur (conservé après purge)
              </h3>
              <div className="space-y-2">
                {stats.bySector.map((s) => (
                  <div
                    key={s.sectorId}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.sectorName}
                    </div>
                    <div className="flex items-center gap-3 text-slate-600">
                      <span className="font-semibold text-emerald-700">{s.collected} collectés</span>
                      <span>{s.absent} absents</span>
                      <span>{s.pending} attente</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loi 25 */}
      <div className="rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-1.5">
            <div className="flex items-center gap-2 text-red-900">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              <h2 className="text-base font-bold">
                Confidentialité & Conformité Loi 25 — Purge après événement
              </h2>
            </div>
            <p className="text-sm text-slate-700">
              Une fois la collecte terminée, anonymisez toutes les données personnelles (noms, adresses, coordonnées GPS exactes, courriels et téléphones) et révoquez les liens d’accès terrain tout en conservant les statistiques globales et par secteur.
            </p>
            {campaign.lastPurgedAt && (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Dernière purge effectuée le{' '}
                {new Date(campaign.lastPurgedAt).toLocaleString('fr-CA')}
                {stats.anonymizedPointsCount > 0 &&
                  ` (${stats.anonymizedPointsCount} point(s) anonymisé(s))`}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setPurgeOpen(true)}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
          >
            Purger les données personnelles
          </button>
        </div>
      </div>

      <PurgeDataModal
        isOpen={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        onConfirm={onPurgePii}
      />
    </div>
  );
}
