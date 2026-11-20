import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  GripVertical,
  Loader2,
  Mail,
  Search,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import type { EmailDispatchResult, Sector, Volunteer } from '../../types';

interface VolunteersTabProps {
  sectors: Sector[];
  volunteers: Volunteer[];
  lastDispatch: EmailDispatchResult | null;
  onAssignVolunteer: (volunteerId: string, sectorId: string | null) => Promise<void>;
  onDeleteVolunteer: (volunteerId: string) => Promise<void>;
  onDispatchAll: () => Promise<void>;
  onDispatchSector: (sectorId: string) => Promise<void>;
}

export function VolunteersTab({
  sectors,
  volunteers,
  lastDispatch,
  onAssignVolunteer,
  onDeleteVolunteer,
  onDispatchAll,
  onDispatchSector,
}: VolunteersTabProps) {
  const [search, setSearch] = useState('');
  const [filterSectorId, setFilterSectorId] = useState<string>('ALL');
  const [draggedVolunteerId, setDraggedVolunteerId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  const sectorNameById = new Map(sectors.map((s) => [s.id, s]));

  const filteredVolunteers = volunteers.filter((v) => {
    const matchesSearch =
      !search.trim() ||
      v.fullName.toLowerCase().includes(search.toLowerCase()) ||
      v.email.toLowerCase().includes(search.toLowerCase()) ||
      (v.notes ?? '').toLowerCase().includes(search.toLowerCase());

    const matchesSector =
      filterSectorId === 'ALL'
        ? true
        : filterSectorId === 'UNASSIGNED'
          ? !v.sectorId
          : v.sectorId === filterSectorId;

    return matchesSearch && matchesSector;
  });

  const handleDrop = async (targetSectorId: string | null) => {
    setDropTarget(null);
    if (!draggedVolunteerId) return;
    const volunteerId = draggedVolunteerId;
    setDraggedVolunteerId(null);
    await onAssignVolunteer(volunteerId, targetSectorId);
  };

  const handleSendAll = async () => {
    setSendingAll(true);
    try {
      await onDispatchAll();
    } finally {
      setSendingAll(false);
    }
  };

  const assignedCount = volunteers.filter((v) => Boolean(v.sectorId)).length;

  return (
    <div className="space-y-6">
      {/* Barre supérieure */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Gestion des Bénévoles ({volunteers.length})
            </h2>
            <p className="text-xs text-slate-500">
              Glissez-déposez un bénévole vers une carte de secteur ou utilisez le menu déroulant.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={sendingAll || assignedCount === 0}
          onClick={() => void handleSendAll()}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {sendingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Envoyer les parcours aux équipes ({assignedCount})
        </button>
      </div>

      {/* Zones de dépôt (Drag & Drop) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget('UNASSIGNED');
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => {
            e.preventDefault();
            void handleDrop(null);
          }}
          className={`rounded-2xl border-2 border-dashed p-3.5 transition ${
            dropTarget === 'UNASSIGNED'
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 bg-slate-50/70'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Non assignés</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {volunteers.filter((v) => !v.sectorId).length} bénévole(s)
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">Déposez ici pour retirer l’assignation</p>
        </div>

        {sectors.map((sector) => {
          const count = volunteers.filter((v) => v.sectorId === sector.id).length;
          return (
            <div
              key={sector.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(sector.id);
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                void handleDrop(sector.id);
              }}
              className={`rounded-2xl border bg-white p-3.5 shadow-sm transition ${
                dropTarget === sector.id
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-slate-200'
              }`}
              style={{ borderLeftWidth: '5px', borderLeftColor: sector.color }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{sector.name}</p>
                  <p className="text-xs text-slate-500">
                    {count} bénévole(s) • {sector.pointStats?.total ?? 0} point(s)
                  </p>
                </div>
                <button
                  type="button"
                  disabled={count === 0}
                  onClick={() => void onDispatchSector(sector.id)}
                  title={`Envoyer le parcours à ${sector.name}`}
                  className="rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-blue-800 hover:bg-blue-100 disabled:opacity-40"
                >
                  <Mail className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Résultat du dernier envoi */}
      {lastDispatch && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-700" />
              <p className="text-sm font-bold text-blue-950">
                {lastDispatch.mode === 'simulated'
                  ? `Mode simulation SMTP : ${lastDispatch.simulatedCount} courriel(s) généré(s)`
                  : `Envoi SMTP terminé : ${lastDispatch.sentCount} envoyé(s), ${lastDispatch.failedCount} échec(s)`}
              </p>
            </div>
          </div>

          {lastDispatch.details.length > 0 && (
            <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
              {lastDispatch.details.map((item) => (
                <div
                  key={`${item.volunteerId}-${item.sectorId}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900">{item.volunteerName}</span>{' '}
                    <span className="text-slate-500">({item.email})</span> —{' '}
                    <span className="font-medium text-blue-800">{item.sectorName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={item.fieldUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
                    >
                      Lien terrain <ExternalLink className="h-3 w-3" />
                    </a>
                    {item.error && <span className="text-red-600">{item.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filtres & Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, courriel ou note..."
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <select
            value={filterSectorId}
            onChange={(e) => setFilterSectorId(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <option value="ALL">Tous les bénévoles</option>
            <option value="UNASSIGNED">Non assignés uniquement</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Bénévole</th>
                <th className="px-4 py-3">Coordonnées</th>
                <th className="px-4 py-3">Remarques</th>
                <th className="px-4 py-3">Secteur assigné</th>
                <th className="px-4 py-3">Dernier envoi</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVolunteers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    Aucun bénévole ne correspond à votre recherche.
                  </td>
                </tr>
              ) : (
                filteredVolunteers.map((v) => {
                  const currentSector = v.sectorId ? sectorNameById.get(v.sectorId) : null;
                  return (
                    <tr
                      key={v.id}
                      draggable
                      onDragStart={() => setDraggedVolunteerId(v.id)}
                      onDragEnd={() => {
                        setDraggedVolunteerId(null);
                        setDropTarget(null);
                      }}
                      className="hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 cursor-grab text-slate-300" />
                          <span>{v.fullName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div>{v.email}</div>
                        <div className="text-slate-500">{v.phone}</div>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-slate-600">
                        {v.notes || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {currentSector && (
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: currentSector.color }}
                            />
                          )}
                          <select
                            value={v.sectorId ?? ''}
                            onChange={(e) =>
                              void onAssignVolunteer(v.id, e.target.value || null)
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                          >
                            <option value="">Non assigné</option>
                            {sectors.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {v.lastNotifiedAt
                          ? new Date(v.lastNotifiedAt).toLocaleString('fr-CA')
                          : 'Jamais envoyé'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void onDeleteVolunteer(v.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Supprimer ce bénévole"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
