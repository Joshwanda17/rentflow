/**
 * Shared Uganda location picker — used by the house listing form and the
 * post rent request form (and any future form needing an address).
 *
 * Type a village name → single debounced RPC returns matches with the full
 * district/county/sub-county/parish chain, so one tap fills everything.
 *
 * All data comes from the cached hooks in useUgLocations, so reopening the
 * dialog fires no extra requests.
 */
import { useState } from 'react';
import { Search, MapPin, X, Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUgVillageSearch, type UgLocationSelection } from '@/hooks/useUgLocations';

interface Props {
  value: UgLocationSelection | null;
  onChange: (sel: UgLocationSelection | null) => void;
  label?: string;
  required?: boolean;
  error?: string | null;
  className?: string;
  /** When set, village search is limited to villages inside this district. */
  districtName?: string | null;
}

export function UgLocationPicker({
  value, onChange, label = 'Official location', required, error, className, districtName,
}: Props) {
  const [query, setQuery] = useState('');
  // no focus gating — results stay visible while typing so they can't be hidden

  const scopeDistrictName = (districtName ?? '').trim();
  const search = useUgVillageSearch(query, 20, {
    districtName: scopeDistrictName || null,
  });

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Label className="text-sm font-semibold flex items-center gap-1">
        <MapPin className="h-4 w-4 text-primary" /> {label}
        {required && <span className="text-destructive">*</span>}
      </Label>

      {value ? (
        <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/5 p-2.5">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{value.village}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">{value.fullPath}</p>
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setQuery(''); }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear location"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              
              
              placeholder="Type the village name e.g. Kansanga, Bwaise…"
              className={`h-11 pl-8 pr-8 text-base ${error ? 'border-destructive border-2' : ''}`}
            />
            {search.isFetching && (
              <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {query.trim().length >= 2 && (
            <div className="mt-1 max-h-56 w-full overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover shadow-sm [-webkit-overflow-scrolling:touch]">
              {search.isFetching && (search.data ?? []).length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">Searching villages…</p>
              ) : (search.data ?? []).length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    {scopeDistrictName
                      ? `No village matched in ${scopeDistrictName} district. Try a different spelling.`
                      : 'No village matched. Try a different spelling.'}
                  </p>
                ) : (
                  (search.data ?? []).map((hit) => (
                    <button
                      key={hit.villageId}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onChange(hit); setQuery(""); }}
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-muted/60"
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{hit.village}</span>
                        <span className="block text-[11px] text-muted-foreground">{hit.fullPath}</span>
                      </span>
                    </button>
                  ))
                )}
            </div>
          )}
          {search.isError && (
            <p className="text-[11px] text-destructive">
              Could not search locations: {(search.error as Error).message}
            </p>
          )}
          {scopeDistrictName && (
            <p className="text-[11px] text-muted-foreground">
              Searching villages in <span className="font-medium text-foreground">{scopeDistrictName}</span> district only.
            </p>
          )}
        </>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

export default UgLocationPicker;
