import { useState } from 'react';
import { MapPin, Search, Trash2 } from 'lucide-react';
import type { DonationPoint, DonationStatus, Sector } from '../../types';
import { StatusBadge } from '../common/StatusBadge';

interface DonationPointsTabProps {
  sectors: Sector[];
  points: DonationPoint[];
  onUpdatePoint: (
    pointId: string,
    patch: { sectorId?: string | null; status?: DonationStatus }
  ) => Promise<void>;
  onDeletePoint: (pointId: string) => Promise<void>;
}

export function DonationPointsTab({
  sectors,
  points,
  onUpdatePoint,
  onDeletePoint,
}: DonationPointsTabProps) {
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filtered = points.filter((pt) => {
    const matchesSearch =
      !search.trim() ||
      pt.address.toLowerCase().includes(search.toLowerCase()) ||
      (pt.donorName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (pt.instructions ?? '').toLowerCase().includes(search.toLowerCase());

    const matchesSector =
      sectorFilter === 'ALL'
        ? true
        : sectorFilter === 'OUT_OF_SECTOR'
          ? !pt.sectorId
          : pt.sectorId === sectorFilter;

    const matchesStatus = statusFilter === 'ALL' ? true : pt.status === statusFilter;

    return matchesSearch && matchesSector && matchesStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Points de cueillette ({points.length})
            </h2>
            <p className="text-xs text-slate-500">
              Consultez les adresses déclarées, corrigez un statut ou ajustez manuellement le secteur.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par adresse, nom ou instruction..."
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <option value="ALL">Tous les secteurs</option>
            <option value="OUT_OF_SECTOR">Hors secteur uniquement</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="PENDING">À collecter</option>
            <option value="COLLECTED">Collecté</option>
            <option value="ABSENT">Absent</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Adresse</th>
                <th className="px-4 py-3">Donateur / Détails</th>
                <th className="px-4 py-3">Secteur</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    Aucun point de cueillette trouvé.
                  </td>
                </tr>
              ) : (
                filtered.map((pt) => (
                  <tr key={pt.id} className="hover:bg-slate-50/70">
                    <td className="max-w-xs px-4 py-3">
                      <p className="font-medium text-slate-900">{pt.address}</p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                      </p>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-slate-600">
                      {pt.donorName && <p className="font-semibold text-slate-800">{pt.donorName}</p>}
                      {pt.preferredTimeSlot && <p>Créneau : {pt.preferredTimeSlot}</p>}
                      {pt.instructions && (
                        <p className="mt-0.5 text-amber-800">{pt.instructions}</p>
                      )}
                      {!pt.donorName && !pt.preferredTimeSlot && !pt.instructions && (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={pt.sectorId ?? ''}
                        onChange={(e) =>
                          void onUpdatePoint(pt.id, { sectorId: e.target.value || null })
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                      >
                        <option value="">Hors secteur</option>
                        {sectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={pt.status} outOfSector={!pt.sectorId} />
                        <select
                          value={pt.status}
                          onChange={(e) =>
                            void onUpdatePoint(pt.id, {
                              status: e.target.value as DonationStatus,
                            })
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                        >
                          <option value="PENDING">À collecter</option>
                          <option value="COLLECTED">Collecté</option>
                          <option value="ABSENT">Absent</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void onDeletePoint(pt.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Supprimer ce point"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
