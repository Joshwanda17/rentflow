import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, Building2, Loader2, Search, AlertTriangle, UserPlus, X, MapPin, Phone, CornerDownLeft, Sparkles, SlidersHorizontal } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
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
  /** Fuzzy-search ranking metadata (present only on search results). */
  match_score?: number | null;
  match_kind?: 'all' | 'name_exact' | 'phone' | 'fuzzy' | string | null;
}

interface LandlordSearchSelectProps {
  value: LandlordOption | null;
  onChange: (landlord: LandlordOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Called when the agent taps "Register new landlord" from the empty-state warning. */
  onAddNew?: () => void;
  /**
   * Fuzzy-match similarity threshold (0.05–0.9). Lower = more typo-tolerant
   * (more results), higher = stricter. Used as the initial slider value.
   */
  similarityThreshold?: number;
}

/** Per-character highlight style for each match flavour. */
const HL_CLASS = {
  exact: 'rounded-[2px] bg-primary/20 font-semibold text-foreground',
  phone: 'rounded-[2px] bg-emerald-500/20 font-semibold text-foreground',
  typo: 'font-semibold text-primary underline decoration-dotted decoration-primary/70 underline-offset-2',
} as const;

type HighlightMode = keyof typeof HL_CLASS;

/** Character indices in `text` covered by any case-insensitive occurrence of a term. */
function substringMatchedIndices(text: string, terms: string[]): Set<number> {
  const lower = text.toLowerCase();
  const set = new Set<number>();
  for (const raw of terms) {
    const t = raw.toLowerCase();
    if (!t) continue;
    let from = 0;
    let pos = lower.indexOf(t, from);
    while (pos !== -1) {
      for (let k = 0; k < t.length; k++) set.add(pos + k);
      from = pos + t.length;
      pos = lower.indexOf(t, from);
    }
  }
  return set;
}

/**
 * Character indices in `text` that align to `query` via the longest common
 * subsequence — used for typo matches where there is no contiguous substring.
 */
function lcsMatchedIndices(text: string, query: string): Set<number> {
  const a = text.toLowerCase();
  const b = query.toLowerCase().replace(/\s+/g, '');
  const n = a.length;
  const m = b.length;
  const idx = new Set<number>();
  if (!n || !m) return idx;
  // DP table of LCS lengths.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Backtrack to mark which characters of `text` participate.
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      idx.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return idx;
}

/** Render `text` with the matched character indices wrapped in highlight spans. */
function renderHighlighted(text: string, matched: Set<number>, mode: HighlightMode): ReactNode {
  if (!matched.size) return text;
  const out: ReactNode[] = [];
  let buffer = '';
  let bufferOn = matched.has(0);
  const flush = (on: boolean, key: number) => {
    if (!buffer) return;
    out.push(
      on ? (
        <mark key={key} className={cn('bg-transparent', HL_CLASS[mode])}>
          {buffer}
        </mark>
      ) : (
        <span key={key}>{buffer}</span>
      )
    );
    buffer = '';
  };
  for (let i = 0; i < text.length; i++) {
    const on = matched.has(i);
    if (on !== bufferOn) {
      flush(bufferOn, i);
      bufferOn = on;
    }
    buffer += text[i];
  }
  flush(bufferOn, text.length);
  return out;
}

/** Highlight a landlord NAME according to how the row was matched. */
function highlightName(text: string | null | undefined, query: string, kind?: string | null): ReactNode {
  const value = text ?? '';
  const term = query.trim();
  if (!value || !term) return value;
  if (kind === 'fuzzy') {
    // No contiguous substring — align character-by-character.
    const sub = substringMatchedIndices(value, [term]);
    const matched = sub.size ? sub : lcsMatchedIndices(value, term);
    return renderHighlighted(value, matched, sub.size ? 'exact' : 'typo');
  }
  return renderHighlighted(value, substringMatchedIndices(value, [term]), 'exact');
}

/** Highlight a landlord PHONE (digits matched are coloured distinctly). */
function highlightPhone(text: string | null | undefined, query: string): ReactNode {
  const value = text ?? '';
  const term = query.trim();
  if (!value || !term) return value;
  const digits = term.replace(/\D/g, '');
  const terms = [term];
  if (digits.length >= 3 && digits !== term) terms.push(digits);
  return renderHighlighted(value, substringMatchedIndices(value, terms), 'phone');
}

/**
 * Google-style searchable landlord picker.
 * Debounced typeahead querying `landlords` by name OR phone (ILIKE), capped at 20 results.
 * Supports keyboard navigation, query highlighting, a live result count, and a
 * prominent fallback warning when no registered landlords are found.
 */
export function LandlordSearchSelect({
  value,
  onChange,
  placeholder = 'Search landlord by name or phone…',
  disabled,
  onAddNew,
  similarityThreshold = 0.2,
}: LandlordSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<LandlordOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Configurable fuzzy-match precision (clamped to the RPC's valid range).
  const [threshold, setThreshold] = useState(() =>
    Math.min(Math.max(similarityThreshold, 0.05), 0.9)
  );
  const [showThreshold, setShowThreshold] = useState(false);
  const reqIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce typing
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset keyboard highlight whenever the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [debounced, results.length]);

  // Fetch on debounced/threshold change (only when popover is open)
  useEffect(() => {
    if (!open) return;
    const myId = ++reqIdRef.current;
    const run = async () => {
      setLoading(true);
      try {
        // Typo-tolerant fuzzy search via Postgres trigram RPC.
        // Falls back to an ILIKE query if the RPC is unavailable.
        const { data, error } = await (supabase.rpc as any)('search_landlords_fuzzy', {
          p_query: debounced,
          p_limit: 20,
          p_threshold: threshold,
        });
        if (error) throw error;
        if (myId === reqIdRef.current) {
          setResults((data ?? []) as unknown as LandlordOption[]);
        }
      } catch (err) {
        // Resilient fallback: plain ILIKE search if the fuzzy RPC fails.
        try {
          let q = supabase
            .from('landlords')
            .select('id, name, phone, property_address, district, town_council, county, village, house_category, monthly_rent, latitude, longitude')
            .order('name', { ascending: true })
            .limit(20);
          if (debounced.length > 0) {
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
        } catch (fallbackErr) {
          if (myId === reqIdRef.current) {
            console.warn('[LandlordSearchSelect] fetch failed', err, fallbackErr);
            setResults([]);
          }
        }
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    };
    run();
  }, [debounced, open, threshold]);

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

  // Compose a location subtitle from the most specific available fields.
  const locationLine = (l: LandlordOption) =>
    [l.property_address, l.village, l.town_council, l.county, l.district]
      .filter(Boolean)
      .join(', ');

  // Human-readable ranking context for a result, based on how it was matched.
  const matchContext = (l: LandlordOption) => {
    if (!debounced) return null;
    const pct = typeof l.match_score === 'number' ? Math.round(l.match_score * 100) : null;
    switch (l.match_kind) {
      case 'name_exact':
        return { label: 'Exact name', tone: 'exact' as const, pct };
      case 'phone':
        return { label: 'Phone match', tone: 'exact' as const, pct };
      case 'fuzzy':
        return {
          label: pct !== null ? `Typo match · ${pct}%` : 'Typo match',
          tone: 'fuzzy' as const,
          pct,
        };
      default:
        return null;
    }
  };

  // Whether any result was surfaced purely through typo tolerance.
  const hasFuzzy = useMemo(
    () => !!debounced && results.some((r) => r.match_kind === 'fuzzy'),
    [results, debounced]
  );

  const commitSelection = (l: LandlordOption) => {
    onChange(l);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = results[activeIndex];
      if (chosen) commitSelection(chosen);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Keep the active row scrolled into view during keyboard navigation.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-row="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

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
        className="w-[--radix-popover-trigger-width] p-0 overflow-hidden rounded-2xl shadow-xl"
        align="start"
      >
        <div className="p-2.5 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a landlord's name or phone…"
              className="h-10 rounded-full pl-9 pr-9 shadow-sm focus-visible:ring-2"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* Google-style results meta line */}
          {!loading && !isSystemEmpty && results.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-1.5 pt-2">
              <p className="text-[11px] text-muted-foreground truncate">
                {debounced
                  ? `About ${results.length} landlord${results.length === 1 ? '' : 's'} matching "${debounced}"`
                  : `Showing ${results.length} registered landlord${results.length === 1 ? '' : 's'}`}
                {typeof totalCount === 'number' && totalCount > 0 && (
                  <span className="opacity-70"> · {totalCount} total</span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setShowThreshold((s) => !s)}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] shrink-0 transition-colors',
                  showThreshold ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent'
                )}
                aria-pressed={showThreshold}
              >
                <SlidersHorizontal className="h-3 w-3" />
                Precision {Math.round(threshold * 100)}%
              </button>
            </div>
          )}

          {/* Configurable similarity threshold */}
          {!loading && !isSystemEmpty && results.length > 0 && showThreshold && (
            <div className="mt-2 rounded-lg border bg-background/60 p-2.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>More results</span>
                <span className="font-medium text-foreground">
                  Match precision {Math.round(threshold * 100)}%
                </span>
                <span>Stricter</span>
              </div>
              <Slider
                className="mt-2"
                value={[Math.round(threshold * 100)]}
                min={5}
                max={90}
                step={5}
                onValueChange={(v) => setThreshold((v[0] ?? 20) / 100)}
              />
              <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                Lower precision tolerates more typos; higher precision shows only close matches.
              </p>
            </div>
          )}

          {/* Typo-tolerance hint when fuzzy matches are present */}
          {!loading && hasFuzzy && (
            <p className="mt-2 flex items-center gap-1 px-1.5 text-[11px] text-primary">
              <Sparkles className="h-3 w-3 shrink-0" />
              Some results matched despite spelling differences.
            </p>
          )}
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
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
            results.map((l, idx) => {
              const selected = value?.id === l.id;
              const active = idx === activeIndex;
              const location = locationLine(l);
              const ctx = matchContext(l);
              return (
                <button
                  key={l.id}
                  type="button"
                  data-row={idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => commitSelection(l)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    active ? 'bg-accent' : 'hover:bg-accent/60'
                  )}
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">
                        {highlightName(l.name, debounced, l.match_kind)}
                      </p>
                      {ctx && (
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                            ctx.tone === 'fuzzy'
                              ? 'bg-primary/15 text-primary'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {ctx.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Phone className="h-3 w-3 shrink-0" />
                      {highlightPhone(l.phone, debounced)}
                      {location && (
                        <>
                          <MapPin className="h-3 w-3 shrink-0 ml-1" />
                          <span className="truncate">{location}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {selected ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  ) : active ? (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
