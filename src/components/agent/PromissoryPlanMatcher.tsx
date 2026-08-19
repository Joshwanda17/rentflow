import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUGX } from '@/lib/rentCalculations';
import { AlertTriangle, Home, Wand2 } from 'lucide-react';

/**
 * Optional plan matcher for a promissory note.
 *
 * A partner promising e.g. UGX 10,000,000 can have that money earmarked to
 * specific ready-to-fund tenant rent plans up front. If the queue cannot fill
 * the promised amount, the agent simply leaves plans unselected and the note is
 * created on its own — the fallback is always available.
 *
 * All data comes from one server call (`agent_list_promissory_fundable_plans`):
 * plans already earmarked by another note, or held by a partner, are excluded
 * server-side, so there are no client-side round trips per row.
 */

export interface FundablePlanRow {
  rent_request_id: string;
  funding_amount: number;
  daily_repayment: number | null;
  duration_days: number | null;
  house_category: string | null;
  request_city: string | null;
  tenant_full_name: string | null;
  tenant_location: string | null;
  landlord_name: string | null;
}

interface Payload {
  plans: FundablePlanRow[];
  total: number;
  available_pool: number;
}

export function PromissoryPlanMatcher({
  targetAmount,
  selectedIds,
  onChange,
  disabled,
}: {
  targetAmount: number;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['promissory-fundable-plans', debounced],
    queryFn: async (): Promise<Payload> => {
      const { data, error } = await supabase.rpc('agent_list_promissory_fundable_plans', {
        p_limit: 60,
        p_offset: 0,
        p_search: debounced || null,
        p_max_amount: null,
      });
      if (error) throw error;
      const payload = (data ?? {}) as unknown as Payload;
      return {
        plans: Array.isArray(payload.plans) ? payload.plans : [],
        total: Number(payload.total || 0),
        available_pool: Number(payload.available_pool || 0),
      };
    },
  });

  const plans = data?.plans ?? [];
  const pool = data?.available_pool ?? 0;

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedTotal = useMemo(
    () =>
      plans
        .filter((p) => selectedSet.has(p.rent_request_id))
        .reduce((s, p) => s + Number(p.funding_amount || 0), 0),
    [plans, selectedSet],
  );
  const remaining = Math.max(0, targetAmount - selectedTotal);
  const shortfall = targetAmount > 0 && pool < targetAmount;

  const toggle = useCallback(
    (plan: FundablePlanRow) => {
      if (disabled) return;
      const id = plan.rent_request_id;
      if (selectedSet.has(id)) {
        onChange(selectedIds.filter((x) => x !== id));
        return;
      }
      // Never let the earmarked total exceed the promised amount — the server
      // enforces the same rule, this only explains it early.
      if (targetAmount > 0 && selectedTotal + Number(plan.funding_amount || 0) > targetAmount) return;
      onChange([...selectedIds, id]);
    },
    [disabled, onChange, selectedIds, selectedSet, selectedTotal, targetAmount],
  );

  /** Greedy fill: largest plans first, never crossing the promised amount. */
  const autoFill = useCallback(() => {
    if (disabled || targetAmount <= 0) return;
    let budget = targetAmount;
    const picked: string[] = [];
    [...plans]
      .sort((a, b) => Number(b.funding_amount || 0) - Number(a.funding_amount || 0))
      .forEach((p) => {
        const amt = Number(p.funding_amount || 0);
        if (amt > 0 && amt <= budget) {
          picked.push(p.rent_request_id);
          budget -= amt;
        }
      });
    onChange(picked);
  }, [disabled, onChange, plans, targetAmount]);

  return (
    <div className="rounded-xl border border-border p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">Attach ready-to-fund tenant plans (optional)</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Earmark this partner&apos;s money to specific plans, or skip and create the note on its own.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px] shrink-0"
          onClick={autoFill}
          disabled={disabled || isLoading || targetAmount <= 0 || plans.length === 0}
        >
          <Wand2 className="h-3 w-3" /> Match amount
        </Button>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
          {(error as Error)?.message || 'Could not load ready-to-fund plans.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Promised', value: formatUGX(targetAmount) },
              { label: 'Earmarked', value: formatUGX(selectedTotal) },
              { label: 'Unallocated', value: formatUGX(remaining) },
            ].map((f) => (
              <div key={f.label} className="rounded-lg bg-muted/40 px-2 py-1.5 min-w-0">
                <p className="text-[9px] uppercase tracking-wide font-semibold text-muted-foreground truncate">
                  {f.label}
                </p>
                <p className="text-[11px] font-bold mt-0.5 truncate">{f.value}</p>
              </div>
            ))}
          </div>

          {shortfall && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700">
                Ready-to-fund plans total {formatUGX(pool)} — less than the promised amount. Attach what
                fits, or create the note without any plans attached.
              </p>
            </div>
          )}

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant, city or landlord"
            className="h-8 text-xs"
            disabled={disabled}
          />

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
            {isLoading ? (
              <>
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </>
            ) : plans.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-2">
                No ready-to-fund plans available right now. Create the note on its own.
              </p>
            ) : (
              plans.map((p) => {
                const checked = selectedSet.has(p.rent_request_id);
                const amt = Number(p.funding_amount || 0);
                const blocked =
                  !checked && targetAmount > 0 && selectedTotal + amt > targetAmount;
                return (
                  <button
                    type="button"
                    key={p.rent_request_id}
                    onClick={() => toggle(p)}
                    disabled={disabled || blocked}
                    aria-pressed={checked}
                    className={`w-full text-left rounded-lg border p-2 transition-colors ${
                      checked ? 'border-primary bg-primary/5' : 'border-border'
                    } ${blocked ? 'opacity-45' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox checked={checked} className="mt-0.5 pointer-events-none" tabIndex={-1} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold truncate">
                            {p.tenant_full_name || 'Tenant'}
                          </p>
                          <span className="text-xs font-bold text-primary shrink-0">{formatUGX(amt)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                          <Home className="h-3 w-3 shrink-0" />
                          {p.tenant_location || p.request_city || 'Location not recorded'}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {p.house_category && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0">
                              {p.house_category}
                            </Badge>
                          )}
                          {p.duration_days ? (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              {p.duration_days} days
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}