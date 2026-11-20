import { useState } from 'react';
import { CheckCircle2, HeartHandshake, Loader2, Mail, Phone, StickyNote, User } from 'lucide-react';
import { api } from '../../services/api';

interface VolunteerFormProps {
  onSuccess?: () => void;
}

export function VolunteerForm({ onSuccess }: VolunteerFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.submitVolunteer({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        notes: notes.trim() || undefined,
      });
      setConfirmation(res.message);
      setFullName('');
      setEmail('');
      setPhone('');
      setNotes('');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’inscription.');
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
        <h3 className="text-lg font-bold text-slate-900">Inscription bénévole confirmée !</h3>
        <p className="mt-2 text-sm text-slate-700">{confirmation}</p>
        <button
          type="button"
          onClick={() => setConfirmation(null)}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          Inscrire un autre bénévole
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3.5 text-sm text-emerald-950">
        <div className="flex items-start gap-2.5">
          <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <p className="leading-snug">
            Rejoignez une équipe de quartier ! Vous recevrez votre lien de carte terrain directement par courriel.
          </p>
        </div>
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <User className="h-4 w-4 text-slate-400" />
          Nom complet <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Ex : Camille Gagnon"
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <Mail className="h-4 w-4 text-slate-400" />
            Courriel <span className="text-red-600">*</span>
          </label>
          <input
            type="email"
            required
            maxLength={160}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="camille@exemple.ca"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <Phone className="h-4 w-4 text-slate-400" />
            Téléphone <span className="text-red-600">*</span>
          </label>
          <input
            type="tel"
            required
            minLength={7}
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="514-555-0192"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <StickyNote className="h-4 w-4 text-slate-400" />
          Disponibilités & remarques <span className="text-xs font-normal text-slate-400">(optionnel)</span>
        </label>
        <textarea
          rows={3}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex : J’ai une voiture / disponible tout l’avant-midi / préférence pour le secteur Nord..."
          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        M’inscrire comme bénévole
      </button>
    </form>
  );
}
