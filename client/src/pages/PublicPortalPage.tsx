import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Gift,
  GraduationCap,
  HeartHandshake,
  Loader2,
  Lock,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { DonorForm } from '../components/public/DonorForm';
import { VolunteerForm } from '../components/public/VolunteerForm';
import { api } from '../services/api';
import type { PublicCampaignResponse } from '../types';

interface PublicPortalPageProps {
  mode: 'donor' | 'volunteer';
}

export function PublicPortalPage({ mode }: PublicPortalPageProps) {
  const { slug } = useParams<{ slug?: string }>();
  const [data, setData] = useState<PublicCampaignResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaign = useCallback(async () => {
    if (!slug) {
      setError('Lien de collecte invalide.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.getPublicCampaign(slug);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la campagne.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void fetchCampaign();
  }, [fetchCampaign]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2.5 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-blue-700" />
          <span className="text-sm font-medium">Chargement du portail...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Campagne introuvable</h1>
          <p className="mt-2 text-sm text-slate-600">{error || 'Réessayez dans un instant.'}</p>
          <button
            type="button"
            onClick={() => void fetchCampaign()}
            className="mt-4 rounded-xl bg-blue-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const { tenant, campaign } = data;
  const isDonorMode = mode === 'donor';
  const isFormOpen = isDonorMode ? campaign.isDonorFormOpen : campaign.isVolunteerFormOpen;

  return (
    <div
      className={`min-h-screen bg-gradient-to-b ${
        isDonorMode
          ? 'from-blue-950 via-blue-900 to-slate-100'
          : 'from-emerald-950 via-emerald-800 to-slate-100'
      }`}
    >
      <header className="mx-auto max-w-3xl px-4 pb-8 pt-8 text-white sm:pt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white/90 backdrop-blur">
            <GraduationCap className="h-4 w-4 text-emerald-300" />
            {tenant.name}
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs text-white/85">
            <MapPin className="h-3.5 w-3.5 text-emerald-300" />
            {campaign.city}
          </div>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">{campaign.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/90 sm:text-base">
          {isDonorMode
            ? 'Indiquez votre adresse ci-dessous afin qu’une équipe vienne récupérer vos dons directement à votre porte.'
            : 'Rejoignez notre équipe de bénévoles sur le terrain ! Vous recevrez votre secteur et votre carte interactive par courriel.'}
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
          {!isFormOpen ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Lock className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                {isDonorMode
                  ? 'Les inscriptions de cueillette sont actuellement fermées'
                  : 'Les inscriptions bénévoles sont actuellement fermées'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                Merci pour votre mobilisation ! La campagne est actuellement en cours de préparation ou terminée.
              </p>
            </div>
          ) : isDonorMode ? (
            <>
              <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
                <Gift className="h-5 w-5 text-blue-700" />
                <h2 className="text-lg font-bold text-slate-900">
                  Planifier une cueillette à votre adresse
                </h2>
              </div>
              <DonorForm
                bias={{ lat: campaign.centerLat, lng: campaign.centerLng }}
                tenantSlug={tenant.slug}
                onSuccess={() => void fetchCampaign()}
              />
            </>
          ) : (
            <>
              <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
                <HeartHandshake className="h-5 w-5 text-emerald-700" />
                <h2 className="text-lg font-bold text-slate-900">
                  Devenir bénévole pour la collecte
                </h2>
              </div>
              <VolunteerForm tenantSlug={tenant.slug} onSuccess={() => void fetchCampaign()} />
            </>
          )}
        </div>

        <footer className="mt-6 flex items-center justify-center gap-2 px-2 text-center text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Vos renseignements sont utilisés uniquement pour organiser cette collecte et sont purgés après l’événement.
          </span>
        </footer>
      </main>
    </div>
  );
}
