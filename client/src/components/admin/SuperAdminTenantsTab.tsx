import { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  Power,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { api } from '../../services/api';
import type { GeocodingSuggestion, TenantSummary } from '../../types';
import { AddressAutocomplete } from '../common/AddressAutocomplete';

interface SuperAdminTenantsTabProps {
  tenants: TenantSummary[];
  activeTenantId: string | null;
  onSelectTenant: (tenantId: string) => void;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function SuperAdminTenantsTab({
  tenants,
  activeTenantId,
  onSelectTenant,
  onRefresh,
  onNotify,
}: SuperAdminTenantsTabProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [city, setCity] = useState('');
  const [centerLat, setCenterLat] = useState<number | undefined>(undefined);
  const [centerLng, setCenterLng] = useState<number | undefined>(undefined);
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const [addingUserTenantId, setAddingUserTenantId] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugEdited) {
      setSlug(slugify(val));
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createTenant({
        name: name.trim(),
        slug: slug.trim(),
        campaignName: campaignName.trim() || undefined,
        city: city.trim() || undefined,
        centerLat,
        centerLng,
        adminFullName: adminFullName.trim() || undefined,
        adminEmail: adminEmail.trim() || undefined,
        adminPassword: adminPassword || undefined,
      });
      setName('');
      setSlug('');
      setSlugEdited(false);
      setCampaignName('');
      setCity('');
      setCenterLat(undefined);
      setCenterLng(undefined);
      setAdminFullName('');
      setAdminEmail('');
      setAdminPassword('');
      await onRefresh();
      onNotify('success', 'Nouveau tenant créé avec sa campagne initiale.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleTenant = async (tenant: TenantSummary) => {
    try {
      await api.updateTenant(tenant.id, { isActive: !tenant.isActive });
      await onRefresh();
      onNotify(
        'info',
        tenant.isActive
          ? `Tenant "${tenant.name}" désactivé.`
          : `Tenant "${tenant.name}" activé.`
      );
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur de mise à jour.');
    }
  };

  const handleDeleteTenant = async (tenant: TenantSummary) => {
    if (
      !window.confirm(
        `Supprimer définitivement "${tenant.name}" ainsi que ses campagnes, secteurs, bénévoles et administrateurs ?`
      )
    ) {
      return;
    }
    try {
      await api.deleteTenant(tenant.id);
      await onRefresh();
      onNotify('info', `Tenant "${tenant.name}" supprimé.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent, tenantId: string) => {
    e.preventDefault();
    try {
      await api.createTenantUser(tenantId, {
        fullName: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword,
      });
      setAddingUserTenantId(null);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      await onRefresh();
      onNotify('success', 'Compte administrateur du tenant créé.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur lors de la création.');
    }
  };

  const handleToggleUser = async (userId: string, currentActive: boolean) => {
    try {
      await api.updateTenantUser(userId, { isActive: !currentActive });
      await onRefresh();
      onNotify('success', 'Statut de l’administrateur mis à jour.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur de mise à jour.');
    }
  };

  const handleResetUserPassword = async (userId: string) => {
    if (resetPasswordVal.length < 8) {
      onNotify('error', 'Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    try {
      await api.updateTenantUser(userId, { password: resetPasswordVal });
      setResetUserId(null);
      setResetPasswordVal('');
      onNotify('success', 'Mot de passe de l’administrateur réinitialisé.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur de réinitialisation.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await api.deleteTenantUser(userId);
      await onRefresh();
      onNotify('info', 'Administrateur supprimé.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    }
  };

  const handleCopyUrl = async (path: string, label: string) => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      onNotify('success', `${label} copié : ${url}`);
    } catch {
      onNotify('info', `${label} : ${url}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulaire création tenant */}
      <form
        onSubmit={handleCreateTenant}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
          <Building2 className="h-5 w-5 text-blue-700" />
          <h2 className="text-base font-bold text-slate-900">
            Créer un nouveau Tenant (École / Organisme)
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Nom du tenant (école / organisme) *
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex : École des Érables"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Slug URL (/t/slug) *
            </label>
            <input
              type="text"
              required
              minLength={2}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase());
              }}
              placeholder="ecole-des-erables"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Nom de la collecte (optionnel)
            </label>
            <input
              type="text"
              minLength={campaignName.trim() ? 2 : undefined}
              maxLength={140}
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Ex : Collecte de bouteilles consignées 2026"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <AddressAutocomplete
              mode="city"
              label="Ville initiale (optionnel)"
              placeholder="Ex : Sept-Îles, Québec... (Montréal par défaut)"
              selectedLabel={city}
              onSelect={(suggestion: GeocodingSuggestion) => {
                setCity(suggestion.label);
                setCenterLat(suggestion.lat);
                setCenterLng(suggestion.lng);
              }}
              onClear={() => {
                setCity('');
                setCenterLat(undefined);
                setCenterLng(undefined);
              }}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Nom de l’admin du tenant (optionnel)
            </label>
            <input
              type="text"
              value={adminFullName}
              onChange={(e) => setAdminFullName(e.target.value)}
              placeholder="Ex : Sophie Lavoie"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Courriel admin (optionnel)
            </label>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@erables.ca"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Mot de passe admin (min. 8 car.)
            </label>
            <input
              type="password"
              minLength={adminEmail ? 8 : undefined}
              required={Boolean(adminEmail.trim())}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-slate-400"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Créer le tenant
          </button>
        </div>
      </form>

      {/* Liste des tenants */}
      <div className="grid gap-5 lg:grid-cols-2">
        {tenants.map((tenant) => {
          const isCurrent = tenant.id === activeTenantId;
          return (
            <div
              key={tenant.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                isCurrent ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900">{tenant.name}</h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        tenant.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tenant.isActive ? 'Actif' : 'Désactivé'}
                    </span>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-900">
                        <CheckCircle2 className="h-3 w-3" />
                        Sélectionné
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">slug : {tenant.slug}</p>
                  {tenant.campaign && (
                    <p className="mt-0.5 text-xs font-medium text-slate-700">
                      Collecte : {tenant.campaign.name}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-slate-700">
                    <strong className="font-sans text-blue-900">Donateurs :</strong> /t/{tenant.slug}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl(`/t/${tenant.slug}`, 'Lien donateurs')}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Copy className="h-3 w-3" />
                      Copier
                    </button>
                    <a
                      href={`/t/${tenant.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-md border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-100"
                      title="Ouvrir le formulaire donateurs"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-slate-700">
                    <strong className="font-sans text-emerald-800">Bénévoles :</strong> /t/{tenant.slug}/benevole
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyUrl(`/t/${tenant.slug}/benevole`, 'Lien bénévoles')
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Copy className="h-3 w-3" />
                      Copier
                    </button>
                    <a
                      href={`/t/${tenant.slug}/benevole`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-md border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-100"
                      title="Ouvrir le formulaire bénévoles"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-3 text-center text-xs">
                <div>
                  <span className="block text-slate-400">Secteurs</span>
                  <span className="font-bold text-slate-900">{tenant.stats.sectorsCount}</span>
                </div>
                <div>
                  <span className="block text-slate-400">Bénévoles</span>
                  <span className="font-bold text-slate-900">{tenant.stats.volunteersCount}</span>
                </div>
                <div>
                  <span className="block text-slate-400">Points</span>
                  <span className="font-bold text-slate-900">
                    {tenant.stats.donationPointsCount}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-400">Collectés</span>
                  <span className="font-bold text-emerald-700">
                    {tenant.stats.collectedPointsCount}
                  </span>
                </div>
              </div>

              {/* Actions tenant */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <button
                  type="button"
                  onClick={() => onSelectTenant(tenant.id)}
                  className="rounded-xl bg-blue-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                >
                  Administrer ce tenant
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleTenant(tenant)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Power className="h-3.5 w-3.5" />
                    {tenant.isActive ? 'Désactiver' : 'Activer'}
                  </button>

                  {tenants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteTenant(tenant)}
                      className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Administrateurs du tenant */}
              <div className="mt-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Administrateurs du tenant ({tenant.users.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      setAddingUserTenantId(addingUserTenantId === tenant.id ? null : tenant.id)
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Ajouter un admin
                  </button>
                </div>

                {addingUserTenantId === tenant.id && (
                  <form
                    onSubmit={(e) => void handleCreateUser(e, tenant.id)}
                    className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="Nom complet"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="email"
                        required
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        placeholder="Courriel"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="Mot de passe (8+)"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAddingUserTenantId(null)}
                        className="rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-blue-900 px-3 py-1 text-xs font-semibold text-white"
                      >
                        Créer
                      </button>
                    </div>
                  </form>
                )}

                {tenant.users.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Aucun administrateur dédié (géré uniquement par le SuperAdmin).
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tenant.users.map((u) => (
                      <div
                        key={u.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-semibold text-slate-900">{u.fullName}</span>{' '}
                            <span className="text-slate-500">({u.email})</span>
                            {!u.isActive && (
                              <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                Inactif
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setResetUserId(resetUserId === u.id ? null : u.id);
                                setResetPasswordVal('');
                              }}
                              className="rounded p-1 text-slate-600 hover:bg-slate-200"
                              title="Réinitialiser le mot de passe"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleUser(u.id, u.isActive)}
                              className="rounded p-1 text-slate-600 hover:bg-slate-200"
                              title={u.isActive ? 'Désactiver' : 'Activer'}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteUser(u.id)}
                              className="rounded p-1 text-red-600 hover:bg-red-100"
                              title="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {resetUserId === u.id && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="password"
                              value={resetPasswordVal}
                              onChange={(e) => setResetPasswordVal(e.target.value)}
                              placeholder="Nouveau mot de passe (min. 8 car.)"
                              className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => void handleResetUserPassword(u.id)}
                              className="rounded-lg bg-blue-900 px-3 py-1 text-xs font-semibold text-white"
                            >
                              Appliquer
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
