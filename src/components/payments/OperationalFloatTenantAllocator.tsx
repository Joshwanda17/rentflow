import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Search, Plus, Trash2, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * One row in the breakdown: which tenant (and a denormalised label so we
 * don't need a join on the Financial Ops side) and how much of the bulk
 * cash drop is being assigned to them.
 */
export interface TenantAllocation {
  tenant_id: string;
  tenant_name: string;
  tenant_phone?: string | null;
  amount: number;
}

interface Props {
  /** Agent (current user) — used to scope the tenant search. */
  agentId: string;
  /** Total UGX the agent says they just deposited under one TID. */
  totalAmount: number;
  /** Controlled list of allocations. */
  allocations: TenantAllocation[];
  onChange: (next: TenantAllocation[]) => void;
}

interface TenantOption {
  id: string;
  full_name: string;
  phone: string | null;
  monthly_rent?: number | null;
}

/**
 * Step-3 add-on for agents depositing field-collected cash as Operational
 * Float. The agent dropped a single lump sum at the merchant code (one TID),
 * so we capture *which tenants* that cash actually came from and *how much*
 * each one paid. The breakdown is encoded into the deposit_requests.notes
 * field as a [ALLOCATIONS] JSON tail and rendered in Financial Ops at
 * approval time.
 *
 * Pure presentation — no DB writes here, parent owns submission.
 */
export default function OperationalFloatTenantAllocator({
  agentId,
  totalAmount,
  allocations,
  onChange,
}: Props) {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Load the agent's known tenant universe once. We union three sources
  // because over the platform's history agents have been linked to tenants
  // via different paths:
  //   1. profiles.referrer_id          (modern onboarding stamp)
  //   2. referrals table               (legacy tenants)
  //   3. rent_requests.agent_id        (tenants the agent posted requests for)
  // De-dup by id and we have a clean picker list.
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [referredRes, referralRes, rentReqRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, phone, monthly_rent')
            .eq('referrer_id', agentId)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('referrals')
            .select('referred_id')
            .eq('referrer_id', agentId)
            .limit(200),
          supabase
            .from('rent_requests')
            .select('tenant_id')
            .eq('agent_id', agentId)
            .limit(200),
        ]);

        const direct = (referredRes.data || []) as TenantOption[];
        const directIds = new Set(direct.map((t) => t.id));

        const extraIds = [
          ...((referralRes.data || []).map((r: any) => r.referred_id)),
          ...((rentReqRes.data || []).map((r: any) => r.tenant_id)),
        ].filter((id): id is string => !!id && !directIds.has(id));

        let extras: TenantOption[] = [];
        if (extraIds.length > 0) {
          const unique = [...new Set(extraIds)];
          const { data } = await supabase
            .from('profiles')
            .select('id, full_name, phone, monthly_rent')
            .in('id', unique);
          extras = (data || []) as TenantOption[];
        }

        if (!cancelled) setTenants([...direct, ...extras]);
      } catch (err) {
        console.error('[Allocator] tenant load failed', err);
        if (!cancelled) toast.error('Could not load your tenants');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const allocatedTotal = useMemo(
    () => allocations.reduce((sum, a) => sum + (Number.isFinite(a.amount) ? a.amount : 0), 0),
    [allocations],
  );
  const remaining = (totalAmount || 0) - allocatedTotal;
  // Tolerate sub-shilling float drift (no fractional UGX in the wild anyway).
  const isBalanced = Math.abs(remaining) < 1;
  const isOverAllocated = remaining < -0.5;

  const selectedIds = useMemo(() => new Set(allocations.map((a) => a.tenant_id)), [allocations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = tenants.filter((t) => !selectedIds.has(t.id));
    if (!q) return pool.slice(0, 30);
    return pool
      .filter(
        (t) =>
          t.full_name?.toLowerCase().includes(q) ||
          (t.phone || '').toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [tenants, selectedIds, search]);

  const addTenant = (t: TenantOption) => {
    // Auto-suggest the tenant's monthly rent if we still have headroom;
    // otherwise leave 0 and let the agent type the actual collected amount.
    const suggest = Math.min(
      Math.max(0, remaining),
      Number(t.monthly_rent || 0),
    );
    onChange([
      ...allocations,
      {
        tenant_id: t.id,
        tenant_name: t.full_name,
        tenant_phone: t.phone || null,
        amount: suggest > 0 ? suggest : 0,
      },
    ]);
    setSearch('');
  };

  const updateAmount = (tenantId: string, raw: string) => {
    const num = parseFloat(raw.replace(/,/g, ''));
    onChange(
      allocations.map((a) =>
        a.tenant_id === tenantId
          ? { ...a, amount: Number.isFinite(num) && num >= 0 ? num : 0 }
          : a,
      ),
    );
  };

  const removeTenant = (tenantId: string) => {
    onChange(allocations.filter((a) => a.tenant_id !== tenantId));
  };

  const distributeRemaining = () => {
    if (allocations.length === 0 || remaining === 0) return;
    // Drop the entire remainder onto the last row — simplest mental model
    // for an agent who's reconciling "what's left".
    const next = [...allocations];
    const last = next[next.length - 1];
    next[next.length - 1] = { ...last, amount: Math.max(0, last.amount + remaining) };
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
      <div className="flex items-start gap-2">
        <Users className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-semibold">Break down per tenant</p>
          <p className="text-[10px] text-muted-foreground">
            One TID, many tenants. Tag each tenant whose rent is inside this drop so Financial Ops can credit them correctly.
          </p>
        </div>
      </div>

      {/* Selected tenant rows */}
      {allocations.length > 0 && (
        <div className="space-y-1.5">
          {allocations.map((a) => (
            <div
              key={a.tenant_id}
              className="flex items-center gap-2 rounded-lg bg-background border border-border p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{a.tenant_name}</p>
                {a.tenant_phone && (
                  <p className="text-[10px] text-muted-foreground truncate">{a.tenant_phone}</p>
                )}
              </div>
              <Input
                type="number"
                inputMode="numeric"
                value={a.amount || ''}
                placeholder="0"
                onChange={(e) => updateAmount(a.tenant_id, e.target.value)}
                className="h-8 w-28 text-right font-mono text-xs"
                aria-label={`Amount for ${a.tenant_name}`}
              />
              <button
                type="button"
                aria-label={`Remove ${a.tenant_name}`}
                onClick={() => removeTenant(a.tenant_id)}
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search & add */}
      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Add tenant
        </Label>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={loading ? 'Loading your tenants…' : 'Search by name or phone'}
            className="h-9 pl-7 text-xs"
            disabled={loading}
          />
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-3 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic px-1">
            {search.trim()
              ? 'No tenants match.'
              : tenants.length === 0
                ? 'You have no tenants linked yet.'
                : 'All tenants already added.'}
          </p>
        ) : (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border">
            {filtered.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => addTenant(t)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/60 transition-colors"
              >
                <Plus className="h-3 w-3 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{t.full_name}</p>
                  {t.phone && (
                    <p className="text-[10px] text-muted-foreground truncate">{t.phone}</p>
                  )}
                </div>
                {t.monthly_rent ? (
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    rent {Number(t.monthly_rent).toLocaleString()}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reconciliation strip */}
      <div className="rounded-lg bg-background border border-border p-2 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Allocated</span>
          <span className="font-mono font-semibold tabular-nums">
            UGX {allocatedTotal.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Deposit total</span>
          <span className="font-mono tabular-nums">
            UGX {(totalAmount || 0).toLocaleString()}
          </span>
        </div>
        <div
          className={`flex items-center justify-between text-xs font-semibold pt-1 border-t ${
            isBalanced
              ? 'text-emerald-600 border-emerald-500/30'
              : isOverAllocated
                ? 'text-destructive border-destructive/30'
                : 'text-warning border-warning/30'
          }`}
        >
          <span className="flex items-center gap-1">
            {isBalanced ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            {isBalanced
              ? 'Balanced'
              : isOverAllocated
                ? 'Over by'
                : 'Remaining'}
          </span>
          <span className="font-mono tabular-nums">
            UGX {Math.abs(remaining).toLocaleString()}
          </span>
        </div>
        {!isBalanced && allocations.length > 0 && !isOverAllocated && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={distributeRemaining}
            className="h-6 w-full text-[10px] text-primary hover:text-primary"
          >
            Add remaining to last tenant
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Helpers to (de)serialise allocations into the deposit_requests.notes
 * column. We use a clearly-fenced suffix so legacy free-text notes still
 * survive a round-trip and Financial Ops can detect/parse the structured
 * payload reliably.
 */
const ALLOCATIONS_PREFIX = '[ALLOCATIONS]';

export function encodeAllocationsNote(
  baseNote: string,
  allocations: TenantAllocation[],
): string {
  if (!allocations || allocations.length === 0) return baseNote;
  const payload = JSON.stringify(
    allocations.map((a) => ({
      tid: a.tenant_id,
      n: a.tenant_name,
      p: a.tenant_phone || null,
      a: a.amount,
    })),
  );
  const tail = `${ALLOCATIONS_PREFIX}${payload}`;
  return baseNote ? `${baseNote} | ${tail}` : tail;
}

export function decodeAllocationsFromNote(note: string | null | undefined): {
  cleanNote: string;
  allocations: TenantAllocation[] | null;
} {
  if (!note) return { cleanNote: '', allocations: null };
  const idx = note.indexOf(ALLOCATIONS_PREFIX);
  if (idx === -1) return { cleanNote: note, allocations: null };
  const head = note.slice(0, idx).replace(/\s*\|\s*$/, '').trim();
  const raw = note.slice(idx + ALLOCATIONS_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { cleanNote: head, allocations: null };
    const allocations: TenantAllocation[] = parsed
      .map((row: any) => ({
        tenant_id: String(row?.tid ?? ''),
        tenant_name: String(row?.n ?? 'Unknown tenant'),
        tenant_phone: row?.p ?? null,
        amount: Number(row?.a ?? 0),
      }))
      .filter((a) => a.tenant_id);
    return { cleanNote: head, allocations: allocations.length ? allocations : null };
  } catch {
    return { cleanNote: head, allocations: null };
  }
}