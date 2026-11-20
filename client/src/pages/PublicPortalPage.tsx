import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Gift,
  GraduationCap,
  HeartHandshake,
  Loader2,
  Lock,
  MapPin,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { DonorForm } from '../components/public/DonorForm';
import { VolunteerForm } from '../components/public/VolunteerForm';
import { api } from '../services/api';
import type { PublicCampaignResponse } from '../types';

export function PublicPortalPage() {
  const [data, setData] = useState<PublicCampaignResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'donor' | 'volunteer'>('donor');

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await api.getPublicCampaign();
      setData(res);
      setError(null);
      if (!res.campaign.isDonorFormOpen && res.campaign.isVolunteerFormOpen) {
        setActiveTab('volunteer');
      } else if (res.campaign.isDonorFormOpen && !res.campaign.isVolunteerFormOpen) {
        setActiveTab('donor');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la campagne.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCampaign();
  }, [fetchCampaign]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2.5 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-blue-700" />
          <span className="text-sm font-medium">Chargement du portail de collecte...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Service temporairement indisponible</h1>
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

  const { campaign, stats } = data;
  const bothClosed = !campaign.isDonorFormOpen && !campaign.isVolunteerFormOpen;
  const bothOpen = campaign.isDonorFormOpen && campaign.isVolunteerFormOpen;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-100">
      <header className="mx-auto max-w-3xl px-4 pb-8 pt-8 text-white sm:pt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-blue-100 backdrop-blur">
            <GraduationCap className="h-4 w-4 text-emerald-300" />
            Collecte Porte-à-Porte
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs text-blue-100">
            <MapPin className="h-3.5 w-3.5 text-emerald-300" />
            {campaign.city}
          </div>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">{campaign.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-blue-100/90 sm:text-base">
          Soutenez les projets de notre école ! Participez en offrant un point de cueillette devant votre domicile ou en donnant un coup de main sur le terrain.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
            <p className="text-xs text-blue-200">Adresses inscrites</p>
            <p className="mt-0.5 text-xl font-bold">{stats.totalPoints}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
            <p className="text-xs text-blue-200">Secteurs actifs</p>
            <p className="mt-0.5 text-xl font-bold">{stats.totalSectors}</p>
          </div>
          <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
            <p className="text-xs text-blue-200">Bénévoles</p>
            <p className="mt-0.5 text-xl font-bold">{stats.totalVolunteers}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-12">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
          {bothClosed ? (
            <div className="py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Lock className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Les inscriptions sont actuellement fermées
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                Merci à tous les citoyens et bénévoles pour leur mobilisation ! La campagne est en cours de préparation ou terminée.
              </p>
            </div>
          ) : (
            <>
              {bothOpen && (
                <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('donor')}
                    className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      activeTab === 'donor'
                        ? 'bg-white text-blue-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Gift className="h-4 w-4" />
                    Donner / Cueillette
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('volunteer')}
                    className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                      activeTab === 'volunteer'
                        ? 'bg-white text-emerald-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Devenir bénévole
                  </button>
                </div>
              )}

              {!bothOpen && (
                <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
                  {campaign.isDonorFormOpen ? (
                    <>
                      <Gift className="h-5 w-5 text-blue-700" />
                      <h2 className="text-lg font-bold text-slate-900">
                        Inscrire un point de cueillette
                      </h2>
                    </>
                  ) : (
                    <>
                      <HeartHandshake className="h-5 w-5 text-emerald-700" />
                      <h2 className="text-lg font-bold text-slate-900">
                        Inscription des bénévoles
                      </h2>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'donor' && campaign.isDonorFormOpen && (
                <DonorForm
                  bias={{ lat: campaign.centerLat, lng: campaign.centerLng }}
                  onSuccess={() => void fetchCampaign()}
                />
              )}

              {activeTab === 'volunteer' && campaign.isVolunteerFormOpen && (
                <VolunteerForm onSuccess={() => void fetchCampaign()} />
              )}
            </>
          )}
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-4 px-2 text-xs text-slate-500">
          <div className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Données utilisées uniquement pour la collecte et purgées après l’événement.</span>
          </div>
          <Link
            to="/admin"
            className="font-medium text-slate-600 underline decoration-slate-300 hover:text-blue-900"
          >
            Accès organisateur
          </Link>
        </footer>
      </main>
    </div>
  );
}
