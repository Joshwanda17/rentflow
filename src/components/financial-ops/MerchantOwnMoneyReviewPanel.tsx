import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Check, X, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * "Own money used" claims awaiting finance review.
 *
 * A company float shortfall on a merchant payout is NOT proof the merchant
 * spent their own money — own cash never passes through the wallet ledger. So
 * shortfalls are filed here first. Finance confirms the ones that are real
 * (turning them into money owed to the agent) or rejects them with a reason.
 * Read-only figures otherwise; nothing here touches wallets or the ledger.
 */
interface ReviewRow {
  id: string;
  agentId: string;
  agentName: string;
  kind: string;
  payoutAmount: number;
  floatUsed: number;
  shortfallAmount: number;
  note: string | null;
  attestedAt: string | null;
  createdAt: string;
  origin: string | null;
}

function useOwnMoneyReviewQueue() {
  return useQuery({
    queryKey: ['merchant-own-money-review'],
    retry: false,
    staleTime: 20_000,
    queryFn: async (): Promise<ReviewRow[]> => {
      const { data, error } = await supabase
        .from('merchant_out_of_pocket_advances' as any)
        .select(
          'id, agent_id, kind, payout_amount, float_used, shortfall_amount, note, attested_at, created_at, evidence',
        )
        .eq('status', 'needs_review')
        .order('shortfall_amount', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.agent_id).filter(Boolean)));
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);
        (profs ?? []).forEach((p: any) => names.set(String(p.id), p.full_name ?? 'Unknown agent'));
      }
      return rows.map((r) => ({
        id: String(r.id),
        agentId: String(r.agent_id),
        agentName: names.get(String(r.agent_id)) ?? 'Unknown agent',
        kind: String(r.kind),
        payoutAmount: Number(r.payout_amount ?? 0),
        floatUsed: Number(r.float_used ?? 0),
        shortfallAmount: Number(r.shortfall_amount ?? 0),
        note: r.note ?? null,
        attestedAt: r.attested_at ?? null,
        createdAt: String(r.created_at),
        origin: r.evidence?.origin ?? null,
      }));
    },
  });
}

export function MerchantOwnMoneyReviewPanel() {
  const { data, isLoading, error } = useOwnMoneyReviewQueue();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const decide = useMutation({
    mutationFn: async (input: { id: string; decision: 'confirm' | 'reject'; note?: string }) => {
      const { error: rpcErr } = await supabase.rpc('review_merchant_out_of_pocket' as any, {
        p_id: input.id,
        p_decision: input.decision,
        p_note: input.note?.trim() || null,
      });
      if (rpcErr) throw rpcErr;
    },
    onSuccess: (_d, v) => {
      toast.success(v.decision === 'confirm' ? 'Confirmed as money we owe the agent.' : 'Rejected.');
      setRejectFor(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['merchant-own-money-review'] });
      qc.invalidateQueries({ queryKey: ['merchant-float-positions'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not save. Try again.'),
  });

  const rows = data ?? [];
  const total = useMemo(() => rows.reduce((s, r) => s + r.shortfallAmount, 0), [rows]);
  const agents = useMemo(() => new Set(rows.map((r) => r.agentId)).size, [rows]);
  const shown = expanded ? rows : rows.slice(0, 8);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 min-w-0">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
          <Search className="h-5 w-5 text-warning" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            "OWN MONEY USED" — AWAITING REVIEW
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground break-all">
            {isLoading ? '—' : formatUGX(total)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {rows.length} claim{rows.length === 1 ? '' : 's'} from {agents} merchant agent
            {agents === 1 ? '' : 's'}. Not counted as money we owe until confirmed here.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[11px] text-destructive">Could not load the review list.</p>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">Nothing waiting for review.</p>
      )}

      <ul className="mt-4 space-y-2">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground truncate">{r.agentName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {' · '}
                  {r.kind === 'telecom' ? 'Telecom charge' : `Payout ${formatUGX(r.payoutAmount)}`}
                  {' · company float covered '}
                  {formatUGX(r.floatUsed)}
                </p>
                {r.attestedAt && (
                  <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    Agent has confirmed they used their own money.
                  </p>
                )}
                {r.origin === 'bulk_backfill_2026_08_12' && (
                  <p className="text-[10px] text-warning">
                    From the 12 Aug bulk classification — confirm with the agent before paying.
                  </p>
                )}
              </div>
              <p className="font-mono text-sm font-bold tabular-nums text-foreground shrink-0">
                {formatUGX(r.shortfallAmount)}
              </p>
            </div>

            {rejectFor === r.id ? (
              <div className="mt-2">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this not money we owe? (at least 10 characters)"
                  className="text-[12px]"
                  rows={2}
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={reason.trim().length < 10 || decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, decision: 'reject', note: reason })}
                  >
                    Reject claim
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRejectFor(null);
                      setReason('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, decision: 'confirm' })}
                >
                  <Check className="h-3.5 w-3.5" /> Confirm we owe this
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-destructive"
                  onClick={() => setRejectFor(r.id)}
                >
                  <X className="h-3.5 w-3.5" /> Not owed
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {rows.length > 8 && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full gap-1 text-[11px]"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Show less' : `Show all ${rows.length}`}
        </Button>
      )}

      <p className="mt-3 rounded-xl border border-primary/10 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
        A shortfall on its own does not prove the agent spent their own money — their own cash never
        passes through our books. Confirm only what you have checked with the agent and their payment
        proof. Rejecting needs a written reason and nothing is ever deleted.
      </p>
    </div>
  );
}