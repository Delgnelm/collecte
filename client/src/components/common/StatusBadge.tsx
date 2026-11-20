import type { DonationStatus } from '../../types';

interface StatusBadgeProps {
  status: DonationStatus;
  outOfSector?: boolean;
}

export function StatusBadge({ status, outOfSector = false }: StatusBadgeProps) {
  if (outOfSector) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
        Hors secteur
      </span>
    );
  }

  switch (status) {
    case 'COLLECTED':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
          Collecté
        </span>
      );
    case 'ABSENT':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
          Absent
        </span>
      );
    case 'PENDING':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
          À collecter
        </span>
      );
  }
}
