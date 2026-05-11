import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Building2, Loader2, Search } from 'lucide-react';
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
}

interface LandlordSearchSelectProps {
  value: LandlordOption | null;
  onChange: (landlord: LandlordOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Debounced searchable landlord picker.
 * Queries `landlords` by name OR phone (ILIKE), capped at 20 results.
 */
export function LandlordSearchSelect({
  value,
  onChange,
  placeholder = 'Search landlord by name or phone…',
  disabled,
}: LandlordSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<LandlordOption[]>([]);
  const [loading, setLoading] = useState(false);
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
          .select('id, name, phone, property_address')
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

        const { data, error } = await q;
        if (error) throw error;
        if (myId === reqIdRef.current) {
          setResults((data ?? []) as LandlordOption[]);
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

  const triggerLabel = useMemo(() => {
    if (!value) return placeholder;
    return `${value.name} • ${value.phone}`;
  }, [value, placeholder]);

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
          {!loading && results.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {debounced
                ? 'No landlords match that search.'
                : 'Start typing to search landlords.'}
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
