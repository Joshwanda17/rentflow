import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Banknote, AlertTriangle, ChevronRight, ShieldAlert } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import {
  listAgentBatches,
  listUnbatchedFieldCollections,
  type FieldDepositBatch,
} from '@/lib/fieldDepositBatches';
import { FieldDepositWizardDialog } from '@/components/agent/FieldDepositWizardDialog';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';

/**
 * Persistent, top-of-dashboard banner that surfaces field cash the agent has
 * recorded but NOT yet handed to Welile. Two buckets count as "unbanked":
 *
 *   1. `field_collections` rows confirmed on the server but not yet attached
 *      to any deposit batch (they were taken in cash, period).
 *   2. `field_deposit_batches` already created but still `awaiting_proof`
 *      (the agent claimed they deposited the money but never produced a
 *      transaction ID / bank reference / merchant receipt).
 *
 * The banner is intentionally LOUD and non-dismissable — until proof of
 * deposit is submitted, the cash is hanging on the agent's name.
 */
export function UnbankedCashBanner() {
  const { user } = useAuth();
  const [unbatchedTotal, setUnbatchedTotal] = useState(0);
  const [unbatchedCount, setUnbatchedCount] = useState(0);
  const [awaitingBatches, setAwaitingBatches] = useState<FieldDepositBatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [proofForBatch, setProofForBatch] = useState<FieldDepositBatch | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [unbatched, batches] = await Promise.all([
        listUnbatchedFieldCollections(user.id),
        listAgentBatches(user.id, 25),
      ]);
      const total = unbatched.reduce((s, r) => s + Number(r.amount || 0), 0);
      setUnbatchedTotal(total);
      setUnbatchedCount(unbatched.length);
      setAwaitingBatches(batches.filter(b => b.status === 'awaiting_proof'));
    } catch {
      /* silent — banner just stays hidden if we can't load */
    } finally {
      setLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const awaitingTotal = awaitingBatches.reduce(
    (s, b) => s + Number(b.declared_total || 0),
    0,
  );
  const grandTotal = unbatchedTotal + awaitingTotal;
  const grandCount = unbatchedCount + awaitingBatches.length;

  // Nothing hanging → render nothing.
  if (!loaded || grandTotal <= 0) return null;

  const oldestAwaiting = awaitingBatches[awaitingBatches.length - 1];
  const ageHours = oldestAwaiting
    ? Math.floor((Date.now() - new Date(oldestAwaiting.created_at).getTime()) / 3_600_000)
    : 0;
  const isOverdue = ageHours >= 24;

  return (
    <>
      <div
        className={cn(
          'rounded-2xl border-2 overflow-hidden shadow-sm',
          isOverdue
            ? 'border-destructive/50 bg-destructive/10'
            : 'border-warning/50 bg-warning/10',
        )}
        role="alert"
      >
        {/* Top row */}
        <div className="px-4 py-3 flex items-start gap-3">
          <div
            className={cn(
              'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
              isOverdue ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning',
            )}
          >
            {isOverdue ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider',
                isOverdue ? 'text-destructive' : 'text-warning',
              )}
            >
              {isOverdue ? 'Overdue · proof required' : 'Cash on hand · proof required'}
            </p>
            <p className="text-lg font-bold leading-tight mt-0.5">
              {formatUGX(grandTotal)}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                across {grandCount} entr{grandCount === 1 ? 'y' : 'ies'}
              </span>
            </p>
            <p className="text-[12px] text-foreground/80 leading-snug mt-1">
              You collected this cash from the field. Submit a{' '}
              <span className="font-semibold">transaction ID, bank reference, or receipt</span>{' '}
              to clear it from your name.
            </p>
          </div>
        </div>

        {/* Breakdown chips */}
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {unbatchedTotal > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/70 border border-border px-2 py-0.5 text-[10px] font-medium">
              <Banknote className="h-3 w-3" />
              Not yet deposited · {formatUGX(unbatchedTotal)}
            </span>
          )}
          {awaitingTotal > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/70 border border-border px-2 py-0.5 text-[10px] font-medium">
              <AlertTriangle className="h-3 w-3" />
              Awaiting proof · {formatUGX(awaitingTotal)}
              {ageHours > 0 && (
                <span className="text-muted-foreground">· {ageHours}h old</span>
              )}
            </span>
          )}
        </div>

        {/* Action row */}
        <div className="px-4 pb-3 pt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {unbatchedTotal > 0 && (
            <button
              type="button"
              onClick={() => { hapticTap(); setWizardOpen(true); }}
              className={cn(
                'flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.98] min-h-[48px]',
                isOverdue
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-warning text-warning-foreground hover:bg-warning/90',
              )}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                  Bank the cash
                </p>
                <p className="text-sm font-semibold truncate">
                  Submit deposit + reference
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          )}
          {awaitingBatches.length > 0 && (
            <button
              type="button"
              onClick={() => { hapticTap(); setProofForBatch(awaitingBatches[0]); }}
              className="flex items-center justify-between gap-2 rounded-xl border-2 border-foreground/20 bg-background px-3 py-2.5 text-left hover:bg-accent transition-all active:scale-[0.98] min-h-[48px]"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Add proof
                </p>
                <p className="text-sm font-semibold truncate">
                  {formatUGX(Number(awaitingBatches[0].declared_total))} · oldest deposit
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <FieldDepositWizardDialog
        open={wizardOpen}
        onOpenChange={(open) => { setWizardOpen(open); if (!open) refresh(); }}
      />
      {proofForBatch && (
        <FieldDepositWizardDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setProofForBatch(null);
              refresh();
            }
          }}
          attachProofTo={proofForBatch}
        />
      )}
    </>
  );
}
