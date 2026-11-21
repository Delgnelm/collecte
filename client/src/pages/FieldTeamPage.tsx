import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  Clock,
  List,
  Loader2,
  Map as MapIcon,
  Navigation,
  Phone,
  RefreshCw,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { StatusBadge } from '../components/common/StatusBadge';
import { Toast, type ToastMessage } from '../components/common/Toast';
import { FieldMap } from '../components/map/FieldMap';
import { ApiError, api } from '../services/api';
import {
  applyPendingQueueToSnapshot,
  enqueueStatusUpdate,
  flushPendingQueue,
  getPendingQueue,
  loadFieldSnapshot,
  saveFieldSnapshot,
} from '../services/offlineQueue';
import type { DonationPoint, DonationStatus, FieldPayload } from '../types';

export function FieldTeamPage() {
  const { accessToken = '' } = useParams<{ accessToken: string }>();
  const [data, setData] = useState<FieldPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [usingCache, setUsingCache] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(() =>
    accessToken ? getPendingQueue(accessToken).length : 0
  );
  const [syncing, setSyncing] = useState(false);

  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [showTeammates, setShowTeammates] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | DonationStatus>('ALL');
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    setToast({ id: Date.now(), type, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const syncPending = useCallback(async () => {
    if (!accessToken || !navigator.onLine) return;
    const currentQueue = getPendingQueue(accessToken);
    if (currentQueue.length === 0) return;

    setSyncing(true);
    try {
      const res = await flushPendingQueue(accessToken);
      setPendingCount(res.remainingCount);
      if (res.syncedCount > 0) {
        notify('success', `${res.syncedCount} statut(s) synchronisé(s) avec le serveur.`);
      }
    } finally {
      setSyncing(false);
    }
  }, [accessToken, notify]);

  const loadField = useCallback(async () => {
    if (!accessToken) {
      setFatalError('Lien d’accès terrain manquant.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Tente d'abord d'envoyer les modifications hors-ligne en attente
      if (navigator.onLine) {
        await flushPendingQueue(accessToken);
      }

      const fresh = await api.getFieldData(accessToken);
      const remainingQueue = getPendingQueue(accessToken);
      setPendingCount(remainingQueue.length);

      const merged = applyPendingQueueToSnapshot(fresh, remainingQueue);
      saveFieldSnapshot(accessToken, merged);
      setData(merged);
      setUsingCache(false);
      setFatalError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setFatalError(
          'Ce lien de secteur est invalide ou a été révoqué par l’organisateur.'
        );
        setLoading(false);
        return;
      }

      const cached = loadFieldSnapshot(accessToken);
      if (cached) {
        const queue = getPendingQueue(accessToken);
        setPendingCount(queue.length);
        setData(applyPendingQueueToSnapshot(cached.data, queue));
        setUsingCache(true);
        setFatalError(null);
      } else {
        setFatalError(
          err instanceof Error
            ? err.message
            : 'Impossible de charger les données du secteur.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadField();
  }, [loadField]);

  useEffect(() => {
    if (data) {
      document.title = `${data.sector.name} — ${data.campaign.name}`;
    }
    return () => {
      document.title = 'Collecte École — Porte-à-Porte';
    };
  }, [data]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncPending().then(() => loadField());
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPending, loadField]);

  const handleSetStatus = async (point: DonationPoint, nextStatus: DonationStatus) => {
    if (!data || !accessToken) return;

    // Mise à jour optimiste locale immédiate
    const updatedPayload: FieldPayload = {
      ...data,
      points: data.points.map((p) =>
        p.id === point.id ? { ...p, status: nextStatus, updatedAt: new Date().toISOString() } : p
      ),
    };
    setData(updatedPayload);
    saveFieldSnapshot(accessToken, updatedPayload);

    if (!navigator.onLine) {
      const queue = enqueueStatusUpdate(accessToken, point.id, nextStatus);
      setPendingCount(queue.length);
      notify('info', 'Statut enregistré hors-ligne. Synchronisation automatique dès le retour du réseau.');
      return;
    }

    try {
      await api.updateFieldPointStatus(accessToken, point.id, nextStatus);
      notify(
        'success',
        nextStatus === 'COLLECTED'
          ? 'Point marqué comme Collecté.'
          : nextStatus === 'ABSENT'
            ? 'Point marqué comme Absent.'
            : 'Point remis En attente.'
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        notify('error', err.message);
        return;
      }
      const queue = enqueueStatusUpdate(accessToken, point.id, nextStatus);
      setPendingCount(queue.length);
      setUsingCache(true);
      notify('info', 'Réseau instable : statut sauvegardé localement pour synchronisation.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2.5 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-blue-700" />
          <span className="text-sm font-medium">Chargement de votre parcours terrain...</span>
        </div>
      </div>
    );
  }

  if (fatalError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-3xl border border-red-200 bg-white p-6 text-center shadow-lg">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">Accès terrain indisponible</h1>
          <p className="mt-2 text-sm text-slate-600">{fatalError}</p>
        </div>
      </div>
    );
  }

  const totalPoints = data.points.length;
  const collectedCount = data.points.filter((p) => p.status === 'COLLECTED').length;
  const absentCount = data.points.filter((p) => p.status === 'ABSENT').length;
  const doneCount = collectedCount + absentCount;
  const progressPct = totalPoints > 0 ? Math.round((doneCount / totalPoints) * 100) : 0;

  const filteredPoints =
    statusFilter === 'ALL'
      ? data.points
      : data.points.filter((p) => p.status === statusFilter);

  const selectedPoint = data.points.find((p) => p.id === selectedPointId) ?? null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-100">
      {/* En-tête mobile-first */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: data.sector.color }}
              />
              <h1 className="truncate text-base font-extrabold text-slate-900">
                {data.sector.name}
              </h1>
            </div>
            <p className="truncate text-[11px] text-slate-500">
              {data.campaign.name} • {data.campaign.city}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowTeammates((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Users className="h-3.5 w-3.5 text-blue-700" />
              <span>{data.teammates.length}</span>
            </button>

            <div className="flex rounded-xl bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  viewMode === 'map'
                    ? 'bg-white text-blue-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" />
                Carte
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  viewMode === 'list'
                    ? 'bg-white text-blue-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Liste
              </button>
            </div>
          </div>
        </div>

        {/* Barre de progression & statut réseau */}
        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-600">
              <span>
                {collectedCount} collecté(s) • {absentCount} absent(s) / {totalPoints}
              </span>
              <span className="font-bold text-slate-800">{progressPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {isOnline && !usingCache ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <Wifi className="h-3 w-3" />
                En ligne
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                <WifiOff className="h-3 w-3" />
                Hors-ligne
              </span>
            )}

            {pendingCount > 0 && (
              <button
                type="button"
                disabled={!isOnline || syncing}
                onClick={() => void syncPending()}
                className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold text-white disabled:bg-slate-400"
              >
                <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                Sync ({pendingCount})
              </button>
            )}
          </div>
        </div>

        {/* Panneau Coéquipiers */}
        {showTeammates && (
          <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-800">Équipe du secteur</p>
              <button
                type="button"
                onClick={() => setShowTeammates(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {data.teammates.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun coéquipier assigné pour le moment.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.teammates.map((mate) => (
                  <a
                    key={mate.id}
                    href={mate.phone ? `tel:${mate.phone}` : undefined}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 ring-1 ring-slate-200"
                  >
                    <span>{mate.fullName}</span>
                    {mate.phone && (
                      <span className="inline-flex items-center gap-0.5 text-blue-700">
                        <Phone className="h-3 w-3" />
                        {mate.phone}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Contenu principal : Carte ou Liste */}
      <main className="relative flex-1 overflow-hidden">
        {viewMode === 'map' ? (
          <FieldMap
            sectorColor={data.sector.color}
            geoJsonPolygon={data.sector.geoJsonPolygon}
            centerLat={data.campaign.centerLat}
            centerLng={data.campaign.centerLng}
            points={filteredPoints}
            selectedPointId={selectedPointId}
            onSelectPoint={(pt) => setSelectedPointId(pt.id)}
          />
        ) : (
          <div className="h-full overflow-y-auto p-3.5 pb-24">
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
              {(
                [
                  ['ALL', 'Tous'],
                  ['PENDING', 'À collecter'],
                  ['COLLECTED', 'Collectés'],
                  ['ABSENT', 'Absents'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    statusFilter === value
                      ? 'bg-blue-900 text-white'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredPoints.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                Aucun point de collecte dans cette vue.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredPoints.map((pt) => (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => setSelectedPointId(pt.id)}
                    className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                      pt.id === selectedPointId
                        ? 'border-blue-500 ring-2 ring-blue-100'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{pt.address}</p>
                      <StatusBadge status={pt.status} />
                    </div>
                    {(pt.donorName || pt.preferredTimeSlot) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {[pt.donorName, pt.preferredTimeSlot].filter(Boolean).join(' • ')}
                      </p>
                    )}
                    {pt.instructions && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                        {pt.instructions}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom Sheet détaillé pour le point sélectionné */}
        {selectedPoint && (
          <div className="absolute inset-x-0 bottom-0 z-[600] rounded-t-3xl border-t border-slate-200 bg-white p-4 shadow-2xl sm:left-auto sm:right-4 sm:bottom-4 sm:w-[400px] sm:rounded-3xl sm:border">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <StatusBadge status={selectedPoint.status} />
                <h2 className="text-base font-bold leading-snug text-slate-900">
                  {selectedPoint.address}
                </h2>
                {selectedPoint.donorName && (
                  <p className="text-xs font-medium text-slate-600">
                    Donateur : {selectedPoint.donorName}
                  </p>
                )}
                {selectedPoint.preferredTimeSlot && (
                  <p className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    {selectedPoint.preferredTimeSlot}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedPointId(null)}
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200"
                aria-label="Fermer la fiche"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedPoint.instructions && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-950">
                {selectedPoint.instructions}
              </div>
            )}

            {/* Liens GPS Google Maps & Apple Plans */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPoint.lat},${selectedPoint.lng}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                <Navigation className="h-3.5 w-3.5 text-blue-700" />
                Google Maps
              </a>
              <a
                href={`https://maps.apple.com/?daddr=${selectedPoint.lat},${selectedPoint.lng}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                <Navigation className="h-3.5 w-3.5 text-slate-700" />
                Apple Plans
              </a>
            </div>

            {/* Actions statut terrain */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void handleSetStatus(selectedPoint, 'COLLECTED')}
                className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-xs font-bold transition ${
                  selectedPoint.status === 'COLLECTED'
                    ? 'bg-emerald-700 text-white ring-2 ring-emerald-300'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                <Check className="h-4 w-4" />
                Collecté
              </button>

              <button
                type="button"
                onClick={() => void handleSetStatus(selectedPoint, 'ABSENT')}
                className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-xs font-bold transition ${
                  selectedPoint.status === 'ABSENT'
                    ? 'bg-slate-700 text-white ring-2 ring-slate-300'
                    : 'bg-slate-500 text-white hover:bg-slate-600'
                }`}
              >
                <X className="h-4 w-4" />
                Absent
              </button>

              <button
                type="button"
                onClick={() => void handleSetStatus(selectedPoint, 'PENDING')}
                className="flex items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-2 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                En attente
              </button>
            </div>
          </div>
        )}
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
