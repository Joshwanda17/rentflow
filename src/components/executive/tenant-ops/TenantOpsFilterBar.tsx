import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Calendar as CalendarIcon, Bookmark, Download, X, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  type TenantOpsFilters, type TimeWindowKey, type RentBandKey,
  type LinkBandKey, type PhotosBandKey, type LeafSortKey,
  RENT_BANDS, DEFAULT_FILTERS, isFiltersActive,
  loadPresets, savePreset, deletePreset, type TenantOpsPreset,
} from '@/lib/tenantOpsFilters';

interface Props {
  filters: TenantOpsFilters;
  onChange: (f: TenantOpsFilters) => void;
  resultCount?: number;
  totalCount?: number;
  onExportCSV?: () => void;
  exportDisabled?: boolean;
}

const TIME_CHIPS: { key: TimeWindowKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '24h', label: 'Last 24h' },
  { key: '7d',  label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
];

const LINK_CHIPS: { key: LinkBandKey; label: string }[] = [
  { key: 'any',     label: 'All' },
  { key: 'linked',  label: 'Has landlord' },
  { key: 'pending', label: 'Missing landlord' },
];

const PHOTOS_CHIPS: { key: PhotosBandKey; label: string }[] = [
  { key: 'any',     label: 'Any photos' },
  { key: 'with',    label: 'With photos' },
  { key: 'without', label: 'No photos' },
];

const SORT_OPTIONS: { key: LeafSortKey; label: string }[] = [
  { key: 'name_asc',          label: 'Name A→Z' },
  { key: 'rent_desc',         label: 'Rent (high→low)' },
  { key: 'rent_asc',          label: 'Rent (low→high)' },
  { key: 'funded_desc',       label: 'Most recently funded' },
  { key: 'funded_amount_desc',label: 'Largest funded amount' },
];

export function TenantOpsFilterBar({
  filters, onChange, resultCount, totalCount, onExportCSV, exportDisabled,
}: Props) {
  const [presets, setPresets] = useState<TenantOpsPreset[]>(() => loadPresets());
  const [presetName, setPresetName] = useState('');

  const patch = (p: Partial<TenantOpsFilters>) => onChange({ ...filters, ...p });
  const active = isFiltersActive(filters);

  const customFrom  = filters.customFrom ? new Date(filters.customFrom) : undefined;
  const customUntil = filters.customUntil ? new Date(filters.customUntil) : undefined;

  return (
    <Card className="p-2.5 space-y-2 bg-muted/20">
      {/* Time window row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
          Landlord funded
        </span>
        {TIME_CHIPS.map((c) => (
          <Button
            key={c.key}
            size="sm"
            variant={filters.timeWindow === c.key ? 'default' : 'outline'}
            className="h-7 px-2.5 text-[11px]"
            onClick={() => patch({ timeWindow: c.key, customFrom: null, customUntil: null })}
          >
            {c.label}
          </Button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={filters.timeWindow === 'custom' ? 'default' : 'outline'}
              className="h-7 px-2.5 text-[11px] gap-1"
            >
              <CalendarIcon className="h-3 w-3" />
              {filters.timeWindow === 'custom' && (customFrom || customUntil)
                ? `${customFrom ? format(customFrom, 'MMM d') : '…'} – ${customUntil ? format(customUntil, 'MMM d') : '…'}`
                : 'Custom range'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="p-3 space-y-2">
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">From</p>
                <Calendar
                  mode="single"
                  selected={customFrom}
                  onSelect={(d) =>
                    patch({
                      timeWindow: 'custom',
                      customFrom: d ? d.toISOString() : null,
                    })
                  }
                  className={cn('p-0 pointer-events-auto')}
                />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Until</p>
                <Calendar
                  mode="single"
                  selected={customUntil}
                  onSelect={(d) =>
                    patch({
                      timeWindow: 'custom',
                      customUntil: d ? new Date(d.getTime() + 24 * 60 * 60 * 1000).toISOString() : null,
                    })
                  }
                  className={cn('p-0 pointer-events-auto')}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Rent + link + photos + sort row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
          Rent
        </span>
        {RENT_BANDS.map((b) => (
          <Button
            key={b.key}
            size="sm"
            variant={filters.rentBand === b.key ? 'default' : 'outline'}
            className="h-7 px-2 text-[11px]"
            onClick={() => patch({ rentBand: b.key as RentBandKey })}
          >
            {b.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {LINK_CHIPS.map((c) => (
            <Button
              key={c.key}
              size="sm"
              variant={filters.linkBand === c.key ? 'default' : 'outline'}
              className="h-7 px-2 text-[11px]"
              onClick={() => patch({ linkBand: c.key })}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PHOTOS_CHIPS.map((c) => (
            <Button
              key={c.key}
              size="sm"
              variant={filters.photosBand === c.key ? 'default' : 'outline'}
              className="h-7 px-2 text-[11px]"
              onClick={() => patch({ photosBand: c.key })}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Select value={filters.sort} onValueChange={(v) => patch({ sort: v as LeafSortKey })}>
            <SelectTrigger className="h-7 w-[180px] text-[11px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => (
                <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Status / presets / export row */}
      <div className="flex flex-wrap items-center gap-2">
        {active && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
          >
            <X className="h-3 w-3" /> Clear filters
          </Button>
        )}
        {typeof resultCount === 'number' && typeof totalCount === 'number' && (
          <Badge variant="secondary" className="text-[10px]">
            {resultCount.toLocaleString()} of {totalCount.toLocaleString()} tenants
          </Badge>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1">
              <Bookmark className="h-3 w-3" /> Presets {presets.length > 0 && `(${presets.length})`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-2 space-y-2" align="end">
            {active && (
              <div className="flex items-center gap-1">
                <Input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Name this view…"
                  className="h-7 text-xs"
                />
                <Button
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={!presetName.trim()}
                  onClick={() => {
                    setPresets(savePreset(presetName, filters));
                    setPresetName('');
                  }}
                >
                  Save
                </Button>
              </div>
            )}
            {presets.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2 text-center">
                {active ? 'Save the current view for one-tap recall.' : 'Apply filters to save a preset.'}
              </p>
            ) : (
              presets.map((p) => (
                <div key={p.id} className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 flex-1 justify-start text-xs"
                    onClick={() => onChange(p.filters)}
                  >
                    {p.name}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setPresets(deletePreset(p.id))}
                    aria-label="Delete preset"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              ))
            )}
          </PopoverContent>
        </Popover>

        {onExportCSV && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px] gap-1"
            onClick={onExportCSV}
            disabled={exportDisabled}
            title="Export filtered tenants to CSV"
          >
            <Download className="h-3 w-3" /> Export CSV
          </Button>
        )}
      </div>
    </Card>
  );
}