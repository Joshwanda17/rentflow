/**
 * Shared Uganda location picker — used by the house listing form and the
 * post rent request form (and any future form needing an address).
 *
 * Two ways in, one output:
 *  1. Type a village name → single debounced RPC returns matches with the full
 *     district/county/sub-county/parish chain, so one tap fills everything.
 *  2. Cascade the official hierarchy when the agent prefers to drill down.
 *
 * All data comes from the cached hooks in useUgLocations, so switching between
 * search and cascade — or reopening the dialog — fires no extra requests.
 */
import { useState } from 'react';
import { Search, MapPin, X, Check, ChevronDown, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useUgDistricts, useUgCounties, useUgSubcounties, useUgParishes, useUgVillages,
  useUgVillageSearch, type UgLocationSelection, type UgOption,
} from '@/hooks/useUgLocations';

interface Props {
  value: UgLocationSelection | null;
  onChange: (sel: UgLocationSelection | null) => void;
  label?: string;
  required?: boolean;
  error?: string | null;
  className?: string;
}

function LevelSelect({
  label, options, value, onValueChange, disabled, loading, placeholder,
}: {
  label: string;
  options: UgOption[];
  value: number | null;
  onValueChange: (id: number) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <Select
        value={value != null ? String(value) : undefined}
        onValueChange={(v) => onValueChange(Number(v))}
        disabled={disabled || loading}
      >
        <SelectTrigger className="h-10 text-sm">
          <SelectValue placeholder={loading ? 'Loading…' : placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {options.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function UgLocationPicker({
  value, onChange, label = 'Official location', required, error, className,
}: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [showCascade, setShowCascade] = useState(false);

  // Cascade state
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [countyId, setCountyId] = useState<number | null>(null);
  const [subcountyId, setSubcountyId] = useState<number | null>(null);
  const [parishId, setParishId] = useState<number | null>(null);

  const districts = useUgDistricts();
  const counties = useUgCounties(districtId);
  const subcounties = useUgSubcounties(countyId);
  const parishes = useUgParishes(subcountyId);
  const villages = useUgVillages(parishId);
  const search = useUgVillageSearch(query);

  const names = {
    district: districts.data?.find((d) => d.id === districtId)?.name ?? '',
    county: counties.data?.find((c) => c.id === countyId)?.name ?? '',
    subcounty: subcounties.data?.find((s) => s.id === subcountyId)?.name ?? '',
    parish: parishes.data?.find((p) => p.id === parishId)?.name ?? '',
  };

  const pickVillageFromCascade = (villageId: number) => {
    const village = villages.data?.find((v) => v.id === villageId);
    if (!village || districtId == null || countyId == null || subcountyId == null || parishId == null) return;
    onChange({
      villageId, village: village.name,
      parishId, parish: names.parish,
      subcountyId, subcounty: names.subcounty,
      countyId, county: names.county,
      districtId, district: names.district,
      fullPath: [village.name, names.parish, names.subcounty, names.county, names.district].filter(Boolean).join(', '),
    });
  };

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
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder="Type the village name e.g. Kansanga, Bwaise…"
              className={`h-11 pl-8 pr-8 text-base ${error ? 'border-destructive border-2' : ''}`}
            />
            {search.isFetching && (
              <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {focused && query.trim().length >= 2 && !search.isFetching && (
              <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover shadow-lg [-webkit-overflow-scrolling:touch]">
                {(search.data ?? []).length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    No village matched. Use the official list below instead.
                  </p>
                ) : (
                  (search.data ?? []).map((hit) => (
                    <button
                      key={hit.villageId}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onChange(hit); setQuery(''); setFocused(false); }}
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
          </div>
          {search.isError && (
            <p className="text-[11px] text-destructive">
              Could not search locations: {(search.error as Error).message}
            </p>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1 text-[11px] text-muted-foreground"
            onClick={() => setShowCascade((s) => !s)}
          >
            <ChevronDown className={`mr-1 h-3 w-3 transition-transform ${showCascade ? 'rotate-180' : ''}`} />
            {showCascade ? 'Hide official list' : 'Or pick district → village'}
          </Button>

          {showCascade && (
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/30 p-2.5 sm:grid-cols-2">
              <LevelSelect
                label="District" placeholder="Select district"
                options={districts.data ?? []} value={districtId} loading={districts.isLoading}
                onValueChange={(id) => { setDistrictId(id); setCountyId(null); setSubcountyId(null); setParishId(null); }}
              />
              <LevelSelect
                label="County" placeholder="Select county"
                options={counties.data ?? []} value={countyId} loading={counties.isLoading}
                disabled={districtId == null}
                onValueChange={(id) => { setCountyId(id); setSubcountyId(null); setParishId(null); }}
              />
              <LevelSelect
                label="Sub-county" placeholder="Select sub-county"
                options={subcounties.data ?? []} value={subcountyId} loading={subcounties.isLoading}
                disabled={countyId == null}
                onValueChange={(id) => { setSubcountyId(id); setParishId(null); }}
              />
              <LevelSelect
                label="Parish" placeholder="Select parish"
                options={parishes.data ?? []} value={parishId} loading={parishes.isLoading}
                disabled={subcountyId == null}
                onValueChange={(id) => setParishId(id)}
              />
              <div className="sm:col-span-2">
                <LevelSelect
                  label="Village" placeholder="Select village"
                  options={villages.data ?? []} value={null} loading={villages.isLoading}
                  disabled={parishId == null}
                  onValueChange={pickVillageFromCascade}
                />
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

export default UgLocationPicker;
