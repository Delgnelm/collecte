import { useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, X } from 'lucide-react';

interface PurgeDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function PurgeDataModal({ isOpen, onClose, onConfirm }: PurgeDataModalProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const isMatch = confirmationText.trim() === 'PURGER';

  const handleConfirm = async () => {
    if (!isMatch || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm();
      setConfirmationText('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Purge des données personnelles (Loi 25)
              </h2>
              <p className="text-xs font-medium text-red-700">Action irréversible</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm text-slate-700">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-950">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
              Ce qui sera définitivement anonymisé :
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
              <li>Toutes les adresses, coordonnées GPS exactes, noms et instructions des donateurs.</li>
              <li>Tous les noms complets, courriels, numéros de téléphone et notes des bénévoles.</li>
              <li>Tous les liens secrets terrain (<code>/terrain/:accessToken</code>) seront immédiatement révoqués.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <strong>Statistiques préservées :</strong> les totaux globaux et par secteur (points collectés, absents, en attente) restent intacts pour le bilan de l’école.
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-700">
              Tapez <span className="text-red-700">PURGER</span> pour confirmer
            </label>
            <input
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder="PURGER"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!isMatch || submitting}
            onClick={() => void handleConfirm()}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Exécuter la purge Loi 25
          </button>
        </div>
      </div>
    </div>
  );
}
