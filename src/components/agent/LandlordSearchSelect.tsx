import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Building2, Loader2, Search, AlertTriangle, UserPlus } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export interface LandlordOption {
  id: string;
  name: string;
  phone: string;
  property_address: string | null;
  /** Extended saved details, used to auto-fill the rent request form. */
  district?: string | null;
  town_council?: string | null;
  county?: string | null;
  village?: string | null;
  house_category?: string | null;
  monthly_rent?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface LandlordSearchSelectProps {
  value: LandlordOption | null;
  onChange: (landlord: LandlordOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Called when the agent taps "Register new landlord" from the empty-state warning. */
  onAddNew?: () => void;
}

/**
 * Debounced searchable landlord picker.
 * Queries `landlords` by name OR phone (ILIKE), capped at 20 results.
 * Shows a prominent fallback warning when no registered landlords are found.
 */
export function LandlordSearchSelect({
  value,
  onChange,
  placeholder = 'Search landlord by name or phone…',
  disabled,
  onAddNew,
}: LandlordSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<LandlordOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const reqIdRef = useRef(0);

  // Debounce typing
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch on debounced change (only when popover is open)
  useEffect(() => {
    if (!open) return;
    const myId = ++reqIdRef.current;
    const run = async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('landlords')
          .select('id, name, phone, property_address, district, town_council, county, village, house_category, monthly_rent, latitude, longitude', { count: 'exact' })
          .order('name', { ascending: true })
          .limit(20);

        if (debounced.length > 0) {
          // Match name or phone (case-insensitive). Phone digits-only too.
          const digits = debounced.replace(/\D/g, '');
          const orParts = [`name.ilike.%${debounced}%`, `phone.ilike.%${debounced}%`];
          if (digits.length >= 3 && digits !== debounced) {
            orParts.push(`phone.ilike.%${digits}%`);
          }
          q = q.or(orParts.join(','));
        }

        const { data, error, count } = await q;
        if (error) throw error;
        if (myId === reqIdRef.current) {
          setResults((data ?? []) as LandlordOption[]);
          if (count !== null && count !== undefined) setTotalCount(count);
        }
      } catch (err) {
        if (myId === reqIdRef.current) {
          console.warn('[LandlordSearchSelect] fetch failed', err);
          setResults([]);
        }
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    };
    run();
  }, [debounced, open]);

  // One-time fetch of total landlord count so we can show a system-empty warning
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from('landlords')
        .select('*', { count: 'exact', head: true });
      if (!cancelled && !error && count !== null && count !== undefined) {
        setTotalCount(count);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const triggerLabel = useMemo(() => {
    if (!value) return placeholder;
    return `${value.name} • ${value.phone}`;
  }, [value, placeholder]);

  const isSystemEmpty = totalCount === 0;
  const isSearchEmpty = !loading && results.length === 0 && debounced.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-11 font-normal',
            !value && 'text-muted-foreground'
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type name or phone…"
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}

          {/* Prominent fallback warning when the system has zero landlords */}
          {!loading && isSystemEmpty && (
            <div className="px-3 py-4 space-y-3">
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-warning">No landlords registered yet</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    You must register a landlord before you can post a rent request.
                  </p>
                </div>
              </div>
              {onAddNew && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => {
                    setOpen(false);
                    onAddNew();
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Register a new landlord
                </Button>
              )}
            </div>
          )}

          {/* Prominent fallback warning when search yields no matches */}
          {!loading && !isSystemEmpty && isSearchEmpty && (
            <div className="px-3 py-4 space-y-3">
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-destructive">No registered landlord found</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    Try a different spelling or phone number. Only landlords already registered in the system can be selected.
                  </p>
                </div>
              </div>
              {onAddNew && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => {
                    setOpen(false);
                    onAddNew();
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Register this as a new landlord
                </Button>
              )}
            </div>
          )}

          {!loading && !isSystemEmpty && !isSearchEmpty && results.length === 0 && debounced.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              Start typing to search landlords.
            </div>
          )}

          {!loading &&
            results.map((l) => {
              const selected = value?.id === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    onChange(l);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent transition-colors',
                    selected && 'bg-accent'
                  )}
                >
                  <Check
                    className={cn(
                      'h-4 w-4 mt-0.5 shrink-0',
                      selected ? 'opacity-100 text-primary' : 'opacity-0'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.phone}
                      {l.property_address ? ` • ${l.property_address}` : ''}
                    </p>
                  </div>
                </button>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
