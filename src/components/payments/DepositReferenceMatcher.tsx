import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Search,
  Receipt,
  CheckCircle2,
  AlertCircle,
  ClipboardPaste,
  Wand2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { TenantAllocation } from './OperationalFloatTenantAllocator';

/**
 * "Collect from receipt/reference" — for the case where an agent dropped
 * cash at a merchant code in the field but forgot to record the TID at
 * deposit time. The agent now pastes the TID / bank reference / receipt
 * number from their SMS, and we try to match it back to:
 *
 *   1. their own pending operational-float deposit_requests that have a
 *      missing or placeholder transaction_id (priority — we just attach
 *      the real ref to that row and keep the existing allocations); or
 *   2. their recent agent_collections (last 7 days) that haven't been
 *      tied to a deposit yet — bundle them into a fresh op-float deposit
 *      pre-allocated per tenant.
 *
 * This is a lookup helper only — DepositFlow owns submission. We hand
 * the result back via `onApplyMatch`.
 */

const MAX_DAYS = 7;
const PLACEHOLDER_TIDS = new Set(['', 'NONE', 'N/A', 'NA', 'PENDING', 'TBD', 'UNKNOWN']);
/** Debounce window for auto-search after the agent stops typing/pasting. */
const AUTO_SEARCH_MS = 500;
/** Minimum chars before we'll auto-fire a search. */
const MIN_REF_LEN = 6;

export interface MatchResult {
  /** When set, DepositFlow should reopen in edit mode against this deposit. */
  editDepositId?: string;
  /** Suggested amount to populate (sum of selected collections, or matched deposit amount). */
  amount: number;
  /** Pre-built tenant allocations (already balanced against `amount`). */
  allocations: TenantAllocation[];
  /** The reference/TID the agent pasted. */
  reference: string;
  /** Provider hint, if recognisable. */
  providerHint?: 'mtn' | 'airtel' | 'bank';
}

interface CollectionRow {
  id: string;
  amount: number;
  created_at: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string | null;
  payment_method: string;
  momo_transaction_id: string | null;
}

interface DepositCandidate {
  id: string;
  amount: number;
  created_at: string;
  transaction_id: string | null;
  notes: string | null;
}

interface Props {
  agentId: string;
  /** Current deposit amount in the form, in UGX. Drives auto-suggest. */
  currentAmount: number;
  onApplyMatch: (match: MatchResult) => void;
  /**
   * When true, render the matcher as a prominent CTA panel ("Auto-build
   * breakdown from receipt/reference"). DepositFlow turns this on for
   * the lump-sum case — agent typed an amount but hasn't tagged any
   * tenants yet — to make the auto-build path obvious instead of having
   * the agent type each tenant amount by hand.
   */
  highlight?: boolean;
}

function detectProvider(ref: string): 'mtn' | 'airtel' | 'bank' | undefined {
  const u = ref.trim().toUpperCase();
  if (/^MP\d{6,16}$/.test(u)) return 'mtn';
  if (/^TID\d{4,18}$/.test(u)) return 'airtel';
  if (/^FT[A-Z0-9]{6,18}$/.test(u)) return 'bank';
  return undefined;
}

/** A reference looks "well-formed" if it parses as a known provider pattern. */
function looksWellFormed(ref: string): boolean {
  return !!detectProvider(ref);
}

export default function DepositReferenceMatcher({
  agentId,
  currentAmount,
  onApplyMatch,
  highlight = false,
}: Props) {
  const [reference, setReference] = useState('');
  const [searching, setSearching] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'no-match' | 'collections'>('idle');
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.error('Clipboard is empty');
        return;
      }
      // Pull the first plausible token out of an SMS body.
      const match =
        text.match(/\bMP\d{6,16}\b/i) ??
        text.match(/\bTID\d{4,18}\b/i) ??
        text.match(/\bFT[A-Z0-9]{6,18}\b/i);
      const token = (match?.[0] ?? text.trim().split(/\s+/)[0]).toUpperCase();
      setReference(token);
      toast.success(`Pasted ${token}`);
    } catch {
      toast.error('Could not read clipboard. Paste manually.');
    }
  };

  /**
   * Stage 1: see if the agent already has a pending op-float deposit with
   * a missing/placeholder TID. If yes, the right move is to reopen that
   * deposit in edit mode and attach the real ref — keeps the allocations
   * the agent already entered.
   */
  const tryDepositMatch = async (ref: string): Promise<MatchResult | null> => {
    const since = new Date(Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('deposit_requests')
      .select('id, amount, created_at, transaction_id, notes')
      .eq('user_id', agentId)
      .eq('status', 'pending')
      .eq('deposit_purpose', 'operational_float')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('[Matcher] deposit lookup failed', error);
      return null;
    }
    const candidates = (data ?? []) as DepositCandidate[];
    // Same TID already on a row? Nothing to do.
    if (candidates.some((c) => (c.transaction_id || '').toUpperCase() === ref)) {
      toast.info('That reference is already attached to one of your deposits');
      return null;
    }
    // Find the closest by amount among rows with no real TID.
    const placeholders = candidates.filter((c) =>
      PLACEHOLDER_TIDS.has((c.transaction_id || '').trim().toUpperCase()),
    );
    if (placeholders.length === 0) return null;
    const target = currentAmount > 0 ? currentAmount : 0;
    const sorted = target
      ? [...placeholders].sort((a, b) => Math.abs(a.amount - target) - Math.abs(b.amount - target))
      : placeholders;
    const best = sorted[0];
    return {
      editDepositId: best.id,
      amount: best.amount,
      allocations: [],
      reference: ref,
      providerHint: detectProvider(ref),
    };
  };

  /**
   * Stage 2 fallback: look at the agent's recent collections that don't
   * yet have a TID, suggest the subset that sums closest to the current
   * amount, and let the agent tick/untick before applying.
   */
  const loadCollections = async () => {
    const since = new Date(Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('agent_collections')
      .select('id, amount, created_at, tenant_id, payment_method, momo_transaction_id')
      .eq('agent_id', agentId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('[Matcher] collections lookup failed', error);
      toast.error('Could not load your recent collections');
      return;
    }
    const rows = (data ?? []).filter((r: any) => !r.momo_transaction_id);
    if (rows.length === 0) {
      setCollections([]);
      setPhase('no-match');
      return;
    }
    // Hydrate tenant names in one round trip.
    const tenantIds = [...new Set(rows.map((r: any) => r.tenant_id).filter(Boolean))];
    const profiles = tenantIds.length
      ? await supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds)
      : { data: [] as any[] };
    const nameById = new Map((profiles.data ?? []).map((p: any) => [p.id, p]));
    const enriched: CollectionRow[] = rows.map((r: any) => ({
      id: r.id,
      amount: Number(r.amount) || 0,
      created_at: r.created_at,
      tenant_id: r.tenant_id,
      tenant_name: nameById.get(r.tenant_id)?.full_name ?? 'Unknown tenant',
      tenant_phone: nameById.get(r.tenant_id)?.phone ?? null,
      payment_method: r.payment_method,
      momo_transaction_id: r.momo_transaction_id,
    }));
    setCollections(enriched);

    // Auto-pre-select a subset whose sum gets closest to currentAmount —
    // greedy from the largest down. Always overridable by ticking.
    const target = currentAmount > 0 ? currentAmount : 0;
    const preselect = new Set<string>();
    if (target > 0) {
      let remaining = target;
      const sortedDesc = [...enriched].sort((a, b) => b.amount - a.amount);
      for (const c of sortedDesc) {
        if (remaining <= 0) break;
        if (c.amount <= remaining + 1) {
          preselect.add(c.id);
          remaining -= c.amount;
        }
      }
      // If we left a chunk unfilled, also tick the smallest unselected
      // row that gets us closest — gives the agent a starting point.
      if (remaining > 1) {
        const candidate = enriched
          .filter((c) => !preselect.has(c.id))
          .sort((a, b) => Math.abs(a.amount - remaining) - Math.abs(b.amount - remaining))[0];
        if (candidate) preselect.add(candidate.id);
      }
    } else {
      // No target yet — preselect the most recent row so the panel isn't empty.
      if (enriched[0]) preselect.add(enriched[0].id);
    }
    setSelectedIds(preselect);
    setPhase('collections');
  };

  const handleSearch = async () => {
    const ref = reference.trim().toUpperCase();
    if (!ref) {
      toast.error('Paste a TID, bank reference or receipt number first');
      return;
    }
    setSearching(true);
    setPhase('idle');
    try {
      const depositMatch = await tryDepositMatch(ref);
      if (depositMatch) {
        toast.success('Matched a pending deposit — reopening for edit');
        onApplyMatch(depositMatch);
        return;
      }
      await loadCollections();
    } finally {
      setSearching(false);
    }
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selected = collections.filter((c) => selectedIds.has(c.id));
  const sum = selected.reduce((s, c) => s + c.amount, 0);

  const applyCollections = () => {
    if (selected.length === 0) {
      toast.error('Tick at least one collection to apply');
      return;
    }
    // Aggregate per tenant — multiple field collections from the same
    // tenant collapse into one allocation row.
    const byTenant = new Map<string, TenantAllocation>();
    for (const c of selected) {
      const prev = byTenant.get(c.tenant_id);
      byTenant.set(c.tenant_id, {
        tenant_id: c.tenant_id,
        tenant_name: c.tenant_name,
        tenant_phone: c.tenant_phone,
        amount: (prev?.amount || 0) + c.amount,
      });
    }
    onApplyMatch({
      amount: sum,
      allocations: Array.from(byTenant.values()),
      reference: reference.trim().toUpperCase(),
      providerHint: detectProvider(reference),
    });
    toast.success(
      `Applied ${selected.length} collection${selected.length === 1 ? '' : 's'} — UGX ${sum.toLocaleString()}`,
    );
  };

  return (
    <div
      className={`space-y-3 rounded-xl border-2 p-3 transition-colors ${
        highlight
          ? 'border-primary bg-primary/10 shadow-sm shadow-primary/10'
          : 'border-dashed border-primary/30 bg-primary/5'
      }`}
    >
      <div className="flex items-start gap-2">
        {highlight ? (
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        ) : (
          <Receipt className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            {highlight
              ? 'Auto-build breakdown from receipt / reference'
              : 'Collect from receipt / reference'}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {highlight
              ? `Big lump sum without per-tenant TIDs? Paste your bank reference or receipt number — we'll pull every unattached field collection it covers and build the per-tenant breakdown for you.`
              : `Forgot to capture the TID in the field? Paste it here — we'll find your matching deposit or pull the unattached collections it covers.`}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Bank reference / TID / receipt #
        </Label>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. MP39665905645 / TID144205 / FT12345"
              className="h-9 pl-7 text-xs font-mono"
              disabled={searching}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePaste}
            disabled={searching}
            className="h-9 px-2 shrink-0"
            aria-label="Paste from clipboard"
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSearch}
            disabled={searching || !reference.trim()}
            className="h-9 px-3 shrink-0"
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5 mr-1" /> Find
              </>
            )}
          </Button>
        </div>
      </div>

      {phase === 'no-match' && (
        <div className="flex items-start gap-2 p-2 rounded-lg border border-warning/30 bg-warning/10">
          <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-[11px] text-warning-foreground">
            No pending deposit or unattached collections from the last {MAX_DAYS} days. Enter the deposit details below as a fresh op-float drop.
          </p>
        </div>
      )}

      {phase === 'collections' && collections.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground">
              Tick the collections this reference covers
            </p>
            {currentAmount > 0 && (
              <Badge variant="outline" className="text-[10px]">
                Target UGX {currentAmount.toLocaleString()}
              </Badge>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border">
            {collections.map((c) => {
              const checked = selectedIds.has(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/60 transition-colors"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(c.id)}
                    className="shrink-0"
                    aria-label={`Select ${c.tenant_name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{c.tenant_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()} · {c.payment_method}
                    </p>
                  </div>
                  <span className="font-mono text-xs tabular-nums shrink-0">
                    UGX {c.amount.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-background border border-border p-2">
            <span className="text-[11px] text-muted-foreground">
              {selected.length} selected
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums">
              UGX {sum.toLocaleString()}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={applyCollections}
            disabled={selected.length === 0}
            className="w-full h-8 text-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Apply to deposit form
          </Button>
        </div>
      )}
    </div>
  );
}