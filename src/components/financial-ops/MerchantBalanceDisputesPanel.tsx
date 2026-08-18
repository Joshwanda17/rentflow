import { useState } from 'react';
import { Flag, SlidersHorizontal, Check, X, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import {
  DISPUTED_FIELD_LABELS,
  useAllBalanceDisputes,
  useResolveBalanceDispute,
  MerchantBalanceDispute,
} from '@/hooks/useMerchantBalanceDisputes';
import { useMerchantFloatPositions, MerchantFloatPosition } from '@/hooks/useMerchantFloat';
import { MerchantReconcileDialog } from './MerchantReconcileDialog';
import { useFinancialOpsEditAccess } from '@/hooks/useFinancialOpsEditAccess';

/**
 * Merchant agents flagging that a figure on their dashboard is wrong.
 * Financial Ops reads the agent's own words, fixes the balance with the
 * existing correction tool, then closes the request with a note.
 */
export function MerchantBalanceDisputesPanel() {
  const { data, isLoading, error } = useAllBalanceDisputes();
  const { data: positions } = useMerchantFloatPositions();
  const resolve = useResolveBalanceDispute();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [fixing, setFixing] = useState<MerchantFloatPosition | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const rows = (data ?? []).filter((d) =>
    showClosed ? true : d.status === 'open' || d.status === 'reviewing',
  );
  const openCount = (data ?? []).filter((d) => d.status === 'open').length;

  const close = async (d: MerchantBalanceDispute, status: 'resolved' | 'rejected') => {
    const note = (notes[d.id] ?? '').trim();
    if (note.length < 10) {
      toast.error('Write at least 10 letters explaining what you did');
      return;
    }
    try {
      await resolve.mutateAsync({ id: d.id, status, resolutionNote: note });
      toast.success(status === 'resolved' ? 'Marked as fixed' : 'Marked as not accepted');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    }
  };

  const openFix = (d: MerchantBalanceDispute) => {
    const p =
      (positions ?? []).find((x) => x.deskId === d.deskId) ??
      (positions ?? []).find((x) => x.agentId === d.agentId);
    if (!p) {
      toast.error('No merchant position found for this agent');
      return;
    }
    setFixing(p);
  };

  // The figure being disputed may itself be unverified. Show that inline so
  // nobody resolves a dispute against a balance the books do not support.
  const positionFor = (d: MerchantBalanceDispute) =>
    (positions ?? []).find((x) => x.deskId === d.deskId) ??
    (positions ?? []).find((x) => x.agentId === d.agentId) ??
    null;
  const excludedFor = (p: MerchantFloatPosition) =>
    Math.max(0, p.clampArtifactAmount) + Math.max(0, p.assertedOnlyAmount);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
            <Flag className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              AGENTS SAYING THEIR BALANCE IS WRONG
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {openCount > 0
                ? `${openCount} waiting for you to check and correct`
                : 'Nothing waiting right now'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowClosed((v) => !v)}
          className="text-[11px] font-medium text-primary hover:underline shrink-0"
        >
          {showClosed ? 'Show only open' : 'Show all'}
        </button>
      </div>

      {error && (
        <p className="mt-4 text-[11px] text-muted-foreground">
          This board is only visible to finance roles.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {isLoading && <p className="text-xs text-muted-foreground">Loading requests…</p>}
        {!isLoading && rows.length === 0 && !error && (
          <p className="text-xs text-muted-foreground">No correction requests.</p>
        )}
        {rows.map((d) => {
          const closed = d.status === 'resolved' || d.status === 'rejected';
          const pos = positionFor(d);
          const unverified = !!pos && pos.evidenceStatus !== 'evidenced';
          return (
            <div key={d.id} className="rounded-xl border border-border bg-background p-3 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {d.agentName || 'Merchant agent'}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {d.agentPhone || '—'} · {new Date(d.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-semibold shrink-0 ${
                    d.status === 'resolved'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : d.status === 'rejected'
                        ? 'text-destructive'
                        : 'text-warning'
                  }`}
                >
                  {d.status === 'open'
                    ? 'Waiting'
                    : d.status === 'reviewing'
                      ? 'Being checked'
                      : d.status === 'resolved'
                        ? 'Fixed'
                        : 'Not accepted'}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border bg-muted/20 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {DISPUTED_FIELD_LABELS[d.disputedField]} — system
                  </p>
                  <p className="mt-0.5 font-mono text-xs font-bold tabular-nums break-all">
                    {formatUGX(d.systemAmount)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Agent says it should be
                  </p>
                  <p className="mt-0.5 font-mono text-xs font-bold tabular-nums break-all">
                    {d.claimedAmount === null ? 'not given' : formatUGX(d.claimedAmount)}
                  </p>
                </div>
              </div>

              <p className="mt-2 rounded-lg bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground">
                “{d.reason}”
              </p>

              {unverified && pos && (
                <div className="mt-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-2 flex gap-2">
                  <ShieldAlert className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
                      This desk's float is itself unverified
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Evidenced float {formatUGX(Math.max(0, pos.evidencedAmount))} ·{' '}
                      {formatUGX(excludedFor(pos))} excluded from float
                    </p>
                    {pos.clampArtifactAmount > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {formatUGX(pos.clampArtifactAmount)} — cache exceeds what the ledger supports
                      </p>
                    )}
                    {pos.assertedOnlyAmount > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        {formatUGX(pos.assertedOnlyAmount)} — no independent evidence found
                      </p>
                    )}
                  </div>
                </div>
              )}

              {closed ? (
                d.resolutionNote && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Finance note: {d.resolutionNote}
                  </p>
                )
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canEditFloat ? (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => openFix(d)}>
                        <SlidersHorizontal className="h-3.5 w-3.5" /> Fix balance
                      </Button>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">{readOnlyReason}</p>
                    )}
                    {d.status === 'open' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resolve.mutate({ id: d.id, status: 'reviewing' })}
                      >
                        I am checking this
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={notes[d.id] ?? ''}
                    onChange={(e) => setNotes((p) => ({ ...p, [d.id]: e.target.value }))}
                    rows={2}
                    placeholder="What you found and what you did (at least 10 letters)"
                    className="mt-2 text-sm"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1" onClick={() => close(d, 'resolved')}>
                      <Check className="h-3.5 w-3.5" /> Corrected
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => close(d, 'rejected')}
                    >
                      <X className="h-3.5 w-3.5" /> Figures were right
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <MerchantReconcileDialog
        position={fixing}
        open={!!fixing}
        onOpenChange={(v) => !v && setFixing(null)}
      />
    </div>
  );
}
