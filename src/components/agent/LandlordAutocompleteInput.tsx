import { useEffect, useRef, useState } from 'react';
import { Building2, Loader2, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { LandlordOption } from '@/components/agent/LandlordSearchSelect';

interface LandlordAutocompleteInputProps {
  /** Which field this input edits. Both render a search dropdown. */
  field: 'name' | 'phone';
  value: string;
  onChange: (value: string) => void;
  /** Called when the agent taps an existing landlord from the dropdown. */
  onSelect: (landlord: LandlordOption) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}

/**
 * A landlord name/phone text input that surfaces matching existing landlords
 * as the agent types. Tapping a suggestion fills the whole landlord block
 * (name, phone, property address) via `onSelect` so the agent re-uses the
 * registered landlord instead of re-keying — and a duplicate is never created.
 */
export function LandlordAutocompleteInput({
  field,
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  maxLength,
}: LandlordAutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<LandlordOption[]>([]);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce typing
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 250);
    return () => clearTimeout(t);
  }, [value]);

  // Fetch matches while focused
  useEffect(() => {
    if (!focused) return;
    const term = debounced;
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const myId = ++reqIdRef.current;
    (async () => {
      setLoading(true);
      try {
        const digits = term.replace(/\D/g, '');
        const orParts = [`name.ilike.%${term}%`, `phone.ilike.%${term}%`];
        if (digits.length >= 3 && digits !== term) {
          orParts.push(`phone.ilike.%${digits}%`);
        }
        const { data, error } = await supabase
          .from('landlords')
          .select('id, name, phone, property_address')
          .or(orParts.join(','))
          .order('name', { ascending: true })
          .limit(8);
        if (error) throw error;
        if (myId === reqIdRef.current) {
          setResults((data ?? []) as LandlordOption[]);
        }
      } catch (err) {
        if (myId === reqIdRef.current) {
          console.warn('[LandlordAutocompleteInput] fetch failed', err);
          setResults([]);
        }
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    })();
  }, [debounced, focused]);

  const showDropdown = focused && debounced.length >= 2;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay so a tap on a suggestion registers before we close.
          blurTimer.current = setTimeout(() => setFocused(false), 150);
        }}
        placeholder={placeholder}
        className={className}
        maxLength={maxLength}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground">
              No registered landlord matches — fill in the details to add a new one.
            </div>
          )}
          {!loading &&
            results.map((l) => (
              <button
                key={l.id}
                type="button"
                onMouseDown={(e) => {
                  // onMouseDown beats the input blur so the select still fires.
                  e.preventDefault();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  onSelect(l);
                  setFocused(false);
                }}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
              >
                <Building2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{l.name}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {l.phone}
                    {l.property_address ? ` • ${l.property_address}` : ''}
                  </p>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
