import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, Search, X } from 'lucide-react';
import { api } from '../../services/api';
import type { GeocodingSuggestion } from '../../types';

interface AddressAutocompleteProps {
  mode?: 'address' | 'city';
  label: string;
  placeholder?: string;
  bias?: { lat: number; lng: number };
  selectedLabel?: string;
  required?: boolean;
  onSelect: (suggestion: GeocodingSuggestion) => void;
  onClear?: () => void;
}

export function AddressAutocomplete({
  mode = 'address',
  label,
  placeholder,
  bias,
  selectedLabel,
  required = false,
  onSelect,
  onClear,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(selectedLabel ?? '');
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const suppressNextFetchRef = useRef(false);

  useEffect(() => {
    if (selectedLabel !== undefined) {
      suppressNextFetchRef.current = true;
      setQuery(selectedLabel);
    }
  }, [selectedLabel]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (suppressNextFetchRef.current) {
      suppressNextFetchRef.current = false;
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res =
          mode === 'city'
            ? await api.searchCities(trimmed)
            : await api.searchAddresses(trimmed, bias);
        if (!cancelled) {
          setSuggestions(res.suggestions);
          setIsOpen(true);
          setActiveIndex(-1);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Impossible de contacter le service de recherche d’adresse.'
          );
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, mode, bias]);

  const handlePick = (item: GeocodingSuggestion) => {
    suppressNextFetchRef.current = true;
    setQuery(item.label);
    setSuggestions([]);
    setIsOpen(false);
    setError(null);
    onSelect(item);
  };

  const handleClear = () => {
    suppressNextFetchRef.current = true;
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    setError(null);
    onClear?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handlePick(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isConfirmed = Boolean(selectedLabel && query === selectedLabel);

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-sm font-medium text-slate-800">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
        {isConfirmed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Coordonnées validées
          </span>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (selectedLabel && val !== selectedLabel) {
              onClear?.();
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          className={`w-full rounded-xl border bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 ${
            isConfirmed
              ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200'
              : 'border-slate-300 focus:border-blue-500 focus:ring-blue-200'
          }`}
        />

        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
          {!loading && query.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Effacer la recherche"
              className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {required && !isConfirmed && query.trim().length > 0 && !loading && !isOpen && (
        <p className="mt-1 text-xs text-amber-700">
          Sélectionnez obligatoirement une suggestion dans la liste déroulante pour localiser votre adresse.
        </p>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {isOpen && (
        <ul
          role="listbox"
          className="absolute z-[1200] mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {suggestions.length === 0 ? (
            <li className="px-3.5 py-2.5 text-xs text-slate-500">
              Aucun résultat trouvé. Essayez d’ajouter le numéro civique et la ville.
            </li>
          ) : (
            suggestions.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === activeIndex}
                  onClick={() => handlePick(item)}
                  className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left text-sm transition ${
                    idx === activeIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                  }`}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <span className="leading-snug text-slate-800">{item.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
