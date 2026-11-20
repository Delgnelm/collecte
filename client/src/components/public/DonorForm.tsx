import { useState } from 'react';
import { CheckCircle2, Clock, Home, Loader2, MessageSquare, User } from 'lucide-react';
import { api } from '../../services/api';
import type { GeocodingSuggestion } from '../../types';
import { AddressAutocomplete } from '../common/AddressAutocomplete';
import { DonorConfirmMap } from '../map/DonorConfirmMap';

interface DonorFormProps {
  bias: { lat: number; lng: number };
  tenantSlug?: string;
  onSuccess?: () => void;
}

export function DonorForm({ bias, tenantSlug, onSuccess }: DonorFormProps) {
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [donorName, setDonorName] = useState('');
  const [preferredTimeSlot, setPreferredTimeSlot] = useState('');
  const [instructions, setInstructions] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    message: string;
    inSector: boolean;
    address: string;
  } | null>(null);

  const handleSelectAddress = (suggestion: GeocodingSuggestion) => {
    setSelectedAddress(suggestion.label);
    setCoords({ lat: suggestion.lat, lng: suggestion.lng });
    setError(null);
  };

  const handleClearAddress = () => {
    setSelectedAddress('');
    setCoords(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAddress || !coords) {
      setError('Veuillez choisir votre adresse dans les suggestions afin de confirmer votre position.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.submitDonationPoint(
        {
          address: selectedAddress,
          lat: coords.lat,
          lng: coords.lng,
          donorName: donorName.trim() || undefined,
          preferredTimeSlot: preferredTimeSlot.trim() || undefined,
          instructions: instructions.trim() || undefined,
        },
        tenantSlug
      );

      setConfirmation({
        message: res.message,
        inSector: res.inSector,
        address: selectedAddress,
      });
      setSelectedAddress('');
      setCoords(null);
      setDonorName('');
      setPreferredTimeSlot('');
      setInstructions('');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Point de cueillette enregistré !</h3>
        <p className="mt-2 text-sm text-slate-700">{confirmation.message}</p>
        <p className="mt-2 text-xs font-medium text-slate-500">{confirmation.address}</p>
        {!confirmation.inSector && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Statut : <strong>Hors secteur actuel</strong>. Aucune inquiétude, votre adresse est bien visible par l’école pour ajuster les zones.
          </div>
        )}
        <button
          type="button"
          onClick={() => setConfirmation(null)}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
        >
          Inscrire une autre adresse
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-sm text-blue-950">
        <div className="flex items-start gap-2.5">
          <Home className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <p className="leading-snug">
            Indiquez votre adresse pour qu’une équipe de bénévoles vienne récupérer vos dons directement devant chez vous.
          </p>
        </div>
      </div>

      <AddressAutocomplete
        mode="address"
        label="Adresse de cueillette"
        placeholder="Ex : 1200 rue Sherbrooke Ouest, Montréal"
        bias={bias}
        selectedLabel={selectedAddress}
        required
        onSelect={handleSelectAddress}
        onClear={handleClearAddress}
      />

      {coords && (
        <DonorConfirmMap
          lat={coords.lat}
          lng={coords.lng}
          onAdjustCoordinates={(lat, lng) => setCoords({ lat, lng })}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <User className="h-4 w-4 text-slate-400" />
            Votre nom <span className="text-xs font-normal text-slate-400">(optionnel)</span>
          </label>
          <input
            type="text"
            value={donorName}
            onChange={(e) => setDonorName(e.target.value)}
            maxLength={120}
            placeholder="Ex : Famille Tremblay"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <Clock className="h-4 w-4 text-slate-400" />
            Créneau préféré <span className="text-xs font-normal text-slate-400">(optionnel)</span>
          </label>
          <select
            value={preferredTimeSlot}
            onChange={(e) => setPreferredTimeSlot(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">Indifférent</option>
            <option value="Matin (9h - 12h)">Matin (9h - 12h)</option>
            <option value="Après-midi (12h - 17h)">Après-midi (12h - 17h)</option>
            <option value="Fin de journée (17h - 20h)">Fin de journée (17h - 20h)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <MessageSquare className="h-4 w-4 text-slate-400" />
          Instructions spéciales <span className="text-xs font-normal text-slate-400">(optionnel)</span>
        </label>
        <textarea
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={400}
          placeholder="Ex : Sacs déposés sur le perron avant, code d’interphone #204..."
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !coords}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {coords ? 'Confirmer mon point de cueillette' : 'Sélectionnez d’abord votre adresse'}
      </button>
    </form>
  );
}
