import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  Map,
  MapPin,
  Settings,
  Users,
} from 'lucide-react';
import { AdminLogin } from '../components/admin/AdminLogin';
import { CampaignSettingsTab } from '../components/admin/CampaignSettingsTab';
import { ChangePasswordModal } from '../components/admin/ChangePasswordModal';
import { DonationPointsTab } from '../components/admin/DonationPointsTab';
import { SectorMapTab } from '../components/admin/SectorMapTab';
import { SuperAdminTenantsTab } from '../components/admin/SuperAdminTenantsTab';
import { VolunteersTab } from '../components/admin/VolunteersTab';
import { Toast, type ToastMessage } from '../components/common/Toast';
import {
  ApiError,
  api,
  getAdminToken,
  getSelectedTenantId,
  setAdminToken,
  setSelectedTenantId,
} from '../services/api';
import type {
  AdminCampaignResponse,
  AuthUser,
  Campaign,
  DonationStatus,
  EmailDispatchResult,
  GeoJsonPolygon,
  TenantSummary,
} from '../types';

type AdminTab = 'tenants' | 'map' | 'volunteers' | 'points' | 'settings';

export function AdminDashboardPage() {
  const [authenticated, setAuthenticated] = useState<boolean>(Boolean(getAdminToken()));
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [data, setData] = useState<AdminCampaignResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(getAdminToken()));
  const [activeTab, setActiveTab] = useState<AdminTab>('map');
  const [initialTabSet, setInitialTabSet] = useState(false);
  const [lastDispatch, setLastDispatch] = useState<EmailDispatchResult | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    setToast({ id: Date.now(), type, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadDashboard = useCallback(async () => {
    if (!getAdminToken()) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const me = await api.getAdminMe();
      setAuthUser(me.user);

      if (me.user.role === 'SUPERADMIN') {
        const currentSelected = getSelectedTenantId();
        const stillExists =
          currentSelected && me.tenants.some((t) => t.id === currentSelected);
        if (!stillExists && me.tenants.length > 0) {
          setSelectedTenantId(me.tenants[0].id);
        }
        const [campaignRes, tenantsRes] = await Promise.all([
          api.getAdminCampaign(),
          api.getTenants(),
        ]);
        setData(campaignRes);
        setTenants(tenantsRes.tenants);
        if (!initialTabSet) {
          setActiveTab('tenants');
          setInitialTabSet(true);
        }
      } else {
        setSelectedTenantId(null);
        const campaignRes = await api.getAdminCampaign();
        setData(campaignRes);
        setTenants([]);
        if (!initialTabSet) {
          setActiveTab('map');
          setInitialTabSet(true);
        }
      }

      setAuthenticated(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthenticated(false);
      } else {
        notify('error', err instanceof Error ? err.message : 'Erreur de chargement.');
      }
    } finally {
      setLoading(false);
    }
  }, [notify, initialTabSet]);

  useEffect(() => {
    if (authenticated) {
      void loadDashboard();
    }
  }, [authenticated, loadDashboard]);

  const handleLogout = () => {
    setAdminToken(null);
    setSelectedTenantId(null);
    setAuthenticated(false);
    setAuthUser(null);
    setData(null);
    setTenants([]);
    setInitialTabSet(false);
  };

  const handleSwitchTenant = async (tenantId: string, goToMap = false) => {
    setSelectedTenantId(tenantId);
    setLastDispatch(null);
    if (goToMap) {
      setActiveTab('map');
    }
    await loadDashboard();
  };

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2.5 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-blue-700" />
          <span className="text-sm font-medium">Chargement du tableau de bord...</span>
        </div>
      </div>
    );
  }

  if (!data || !authUser) {
    return null;
  }

  const handleUpdateCampaign = async (patch: Partial<Campaign>) => {
    try {
      await api.updateCampaign(patch);
      await loadDashboard();
      notify('success', 'Paramètres de la campagne mis à jour.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur lors de la mise à jour.');
    }
  };

  const handleCreateSector = async (geoJsonPolygon: GeoJsonPolygon) => {
    try {
      const res = await api.createSector({ geoJsonPolygon });
      await loadDashboard();
      notify(
        'success',
        `Secteur "${res.sector.name}" créé (${res.recalculation.assignedCount} point(s) assigné(s)).`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Impossible de créer le secteur.');
    }
  };

  const handleUpdateSector = async (
    sectorId: string,
    patch: { name?: string; color?: string; geoJsonPolygon?: GeoJsonPolygon }
  ) => {
    try {
      const res = await api.updateSector(sectorId, patch);
      await loadDashboard();
      if (res.recalculation) {
        notify(
          'success',
          `Secteur mis à jour : ${res.recalculation.updatedCount} point(s) réassigné(s).`
        );
      } else {
        notify('success', 'Secteur mis à jour.');
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Impossible de modifier le secteur.');
    }
  };

  const handleDeleteSector = async (sectorId: string) => {
    try {
      const res = await api.deleteSector(sectorId);
      await loadDashboard();
      notify(
        'info',
        `Secteur supprimé (${res.recalculation.outOfSectorCount} point(s) hors secteur).`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Impossible de supprimer le secteur.');
    }
  };

  const handleRotateToken = async (sectorId: string) => {
    try {
      await api.rotateSectorToken(sectorId);
      await loadDashboard();
      notify('success', 'Lien secret du secteur régénéré. L’ancien lien est révoqué.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Échec de rotation du jeton.');
    }
  };

  const handleRecalculate = async () => {
    try {
      const res = await api.recalculateAssignments();
      await loadDashboard();
      notify(
        'success',
        `Recalcul Turf.js terminé : ${res.recalculation.assignedCount} assigné(s), ${res.recalculation.outOfSectorCount} hors secteur.`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur lors du recalcul.');
    }
  };

  const handleAssignVolunteer = async (volunteerId: string, sectorId: string | null) => {
    try {
      await api.updateVolunteer(volunteerId, { sectorId });
      await loadDashboard();
      notify('success', 'Assignation du bénévole mise à jour.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur d’assignation.');
    }
  };

  const handleDeleteVolunteer = async (volunteerId: string) => {
    try {
      await api.deleteVolunteer(volunteerId);
      await loadDashboard();
      notify('info', 'Bénévole supprimé.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    }
  };

  const handleUpdatePoint = async (
    pointId: string,
    patch: { sectorId?: string | null; status?: DonationStatus }
  ) => {
    try {
      await api.updateDonationPoint(pointId, patch);
      await loadDashboard();
      notify('success', 'Point de cueillette mis à jour.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur de mise à jour.');
    }
  };

  const handleDeletePoint = async (pointId: string) => {
    try {
      await api.deleteDonationPoint(pointId);
      await loadDashboard();
      notify('info', 'Point de cueillette supprimé.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    }
  };

  const handleDispatchAll = async () => {
    try {
      const res = await api.dispatchAllEmails();
      setLastDispatch(res);
      await loadDashboard();
      notify(
        res.failedCount > 0 ? 'error' : 'success',
        res.mode === 'simulated'
          ? `${res.simulatedCount} courriel(s) simulé(s) avec succès.`
          : `${res.sentCount} courriel(s) envoyé(s) (${res.failedCount} échec).`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur lors de l’envoi.');
    }
  };

  const handleDispatchSector = async (sectorId: string) => {
    try {
      const res = await api.dispatchSectorEmails(sectorId);
      setLastDispatch(res);
      await loadDashboard();
      notify(
        res.failedCount > 0 ? 'error' : 'success',
        res.mode === 'simulated'
          ? `${res.simulatedCount} courriel(s) simulé(s) pour cette équipe.`
          : `${res.sentCount} courriel(s) envoyé(s) à cette équipe.`
      );
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur lors de l’envoi.');
    }
  };

  const handlePurgePii = async () => {
    try {
      const res = await api.purgePii();
      await loadDashboard();
      notify('success', res.message);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Erreur lors de la purge Loi 25.');
    }
  };

  const isSuperAdmin = authUser.role === 'SUPERADMIN';
  const tabs: Array<{ id: AdminTab; label: string; icon: typeof Map; badge?: number }> = [
    ...(isSuperAdmin
      ? [
          {
            id: 'tenants' as const,
            label: 'Tenants (SuperAdmin)',
            icon: Building2,
            badge: tenants.length,
          },
        ]
      : []),
    { id: 'map', label: 'Carte & Secteurs', icon: Map, badge: data.sectors.length },
    {
      id: 'volunteers',
      label: 'Bénévoles & Courriels',
      icon: Users,
      badge: data.volunteers.length,
    },
    {
      id: 'points',
      label: 'Points de collecte',
      icon: MapPin,
      badge: data.donationPoints.length,
    },
    { id: 'settings', label: 'Campagne & Loi 25', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                {isSuperAdmin ? 'Console SuperAdmin' : 'Administration Tenant'}
              </p>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                {data.tenant.name}
              </span>
            </div>
            <h1 className="text-lg font-extrabold text-slate-900 sm:text-xl">
              {data.campaign.name}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isSuperAdmin && tenants.length > 0 && (
              <select
                aria-label="Tenant actif"
                value={data.tenant.id}
                onChange={(e) => void handleSwitchTenant(e.target.value)}
                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-950"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.isActive ? '' : '(Inactif)'}
                  </option>
                ))}
              </select>
            )}

            <Link
              to={`/t/${data.tenant.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs font-semibold text-blue-900 hover:bg-blue-100"
            >
              Lien Donateurs <ExternalLink className="h-3.5 w-3.5" />
            </Link>

            <Link
              to={`/t/${data.tenant.slug}/benevole`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Lien Bénévoles <ExternalLink className="h-3.5 w-3.5" />
            </Link>

            <button
              type="button"
              onClick={() => setPasswordModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Mot de passe
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Déconnexion
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? 'border-blue-900 text-blue-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      active ? 'bg-blue-100 text-blue-900' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {activeTab === 'tenants' && isSuperAdmin && (
          <SuperAdminTenantsTab
            tenants={tenants}
            activeTenantId={data.tenant.id}
            onSelectTenant={(id) => void handleSwitchTenant(id, true)}
            onRefresh={loadDashboard}
            onNotify={notify}
          />
        )}

        {activeTab === 'map' && (
          <SectorMapTab
            campaign={data.campaign}
            sectors={data.sectors}
            donationPoints={data.donationPoints}
            onUpdateCampaign={handleUpdateCampaign}
            onCreateSector={handleCreateSector}
            onUpdateSector={handleUpdateSector}
            onDeleteSector={handleDeleteSector}
            onRotateToken={handleRotateToken}
            onRecalculate={handleRecalculate}
            onDispatchSectorEmails={handleDispatchSector}
            onNotify={notify}
          />
        )}

        {activeTab === 'volunteers' && (
          <VolunteersTab
            sectors={data.sectors}
            volunteers={data.volunteers}
            lastDispatch={lastDispatch}
            onAssignVolunteer={handleAssignVolunteer}
            onDeleteVolunteer={handleDeleteVolunteer}
            onDispatchAll={handleDispatchAll}
            onDispatchSector={handleDispatchSector}
          />
        )}

        {activeTab === 'points' && (
          <DonationPointsTab
            sectors={data.sectors}
            points={data.donationPoints}
            onUpdatePoint={handleUpdatePoint}
            onDeletePoint={handleDeletePoint}
          />
        )}

        {activeTab === 'settings' && (
          <CampaignSettingsTab
            tenantSlug={data.tenant.slug}
            campaign={data.campaign}
            stats={data.stats}
            onUpdateCampaign={handleUpdateCampaign}
            onPurgePii={handlePurgePii}
            onNotify={notify}
          />
        )}
      </main>

      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        onSuccess={(msg) => notify('success', msg)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
