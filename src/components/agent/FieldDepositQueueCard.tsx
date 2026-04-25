import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Banknote, ChevronRight, Clock, CheckCircle2, AlertCircle, Send, Wallet, XCircle, ShieldCheck, ChevronDown, Loader2, Coins, AlertTriangle } from 'lucide-react';
import {
  listAgentBatches,
  type FieldDepositBatch,
  type BatchItemDetail,
  listBatchItems,
  FIELD_DEPOSIT_COMMISSION_RATE,
  channelLabel,
  statusLabel,
} from '@/lib/fieldDepositBatches';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FieldDepositWizardDialog } from '@/components/agent/FieldDepositWizardDialog';

interface FieldDepositQueueCardProps {
  /** Optional: lets the parent open a different "submit proof" dialog. Defaults to opening the wizard pre-bound to that batch. */
  onSubmitProof?: (batch: FieldDepositBatch) => void;
}

/**
 * Agent dashboard card showing the deposit pipeline:
 * cash collected → batched → proof submitted → FinOps verified.
 */
export function FieldDepositQueueCard({ onSubmitProof }: FieldDepositQueueCardProps) {
  const { user } = useAuth();
  const [batches, setBatches] = useState<FieldDepositBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [proofForBatch, setProofForBatch] = useState<FieldDepositBatch | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      setBatches(await listAgentBatches(user.id, 6));
    } catch {
      /* surfaced by toast in wizard; card stays quiet */
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 8000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const awaiting = batches.filter(b => b.status === 'awaiting_proof');
  const pending = batches.filter(b => b.status === 'pending_finops_verification');
  const recent = batches.slice(0, 4);

  const handleProof = (b: FieldDepositBatch) => {
    if (onSubmitProof) onSubmitProof(b);
    else setProofForBatch(b);
  };

  return (
    <>
      <div className="rounded-2xl border bg-card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight">Deposit Queue</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                Bank the cash you collected from the field
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5 shrink-0">
            <Send className="h-3.5 w-3.5" />
            Deposit
          </Button>
        </div>

        {/* Status strip */}
        {!loading && (awaiting.length > 0 || pending.length > 0) && (
          <div className="grid grid-cols-2 gap-px bg-border">
            <StatusTile
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Awaiting proof"
              count={awaiting.length}
              total={awaiting.reduce((s, b) => s + Number(b.declared_total), 0)}
              tone="amber"
            />
            <StatusTile
              icon={<Send className="h-3.5 w-3.5" />}
              label="With Finance"
              count={pending.length}
              total={pending.reduce((s, b) => s + Number(b.declared_total), 0)}
              tone="blue"
            />
          </div>
        )}

        {/* Recent list */}
        <div className="divide-y">
          {loading ? (
            <div className="p-4 space-y-2">
              <div className="h-12 rounded-lg bg-muted animate-pulse" />
              <div className="h-12 rounded-lg bg-muted animate-pulse" />
            </div>
          ) : recent.length === 0 ? (
            <button
              onClick={() => setWizardOpen(true)}
              className="w-full p-5 text-center text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              No deposits yet. Tap <span className="font-semibold text-foreground">Deposit</span> when you're ready to bank collected cash.
            </button>
          ) : (
            recent.map(b => (
              <BatchRow key={b.id} batch={b} onSubmitProof={() => handleProof(b)} />
            ))
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

function StatusTile({
  icon, label, count, total, tone,
}: {
  icon: React.ReactNode; label: string; count: number; total: number;
  tone: 'amber' | 'blue';
}) {
  const toneClass = tone === 'amber'
    ? 'text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/20'
    : 'text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-950/20';
  return (
    <div className={cn('px-3 py-2.5', toneClass)}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
        {icon}{label}
      </div>
      <p className="text-base font-bold leading-tight mt-0.5">{count}</p>
      <p className="text-[10px] opacity-80 leading-tight">{formatUGX(total)}</p>
    </div>
  );
}

function BatchRow({ batch, onSubmitProof }: { batch: FieldDepositBatch; onSubmitProof: () => void }) {
  const isAwaiting = batch.status === 'awaiting_proof';
  const isPending = batch.status === 'pending_finops_verification';
  const isVerified = batch.status === 'verified';
  const isRejected = batch.status === 'rejected';
  const isCancelled = batch.status === 'cancelled';
  const canExpand = !isAwaiting; // only batches with proof/verification have meaningful detail
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<BatchItemDetail[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const toggle = async () => {
    if (!canExpand) return;
    const next = !expanded;
    setExpanded(next);
    if (next && items === null && !loadErr) {
      try {
        setItems(await listBatchItems(batch.id));
      } catch (e: any) {
        setLoadErr(e?.message ?? 'Failed to load items');
      }
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={!canExpand}
        className={cn(
        'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
        isVerified && 'bg-emerald-500/10 text-emerald-600',
        isRejected && 'bg-red-500/10 text-red-600',
        isAwaiting && 'bg-amber-500/10 text-amber-600',
        isPending && 'bg-blue-500/10 text-blue-600',
        isCancelled && 'bg-muted text-muted-foreground',
        canExpand && 'hover:opacity-80 transition-opacity cursor-pointer',
      )}>
        {isVerified ? <CheckCircle2 className="h-4 w-4" /> :
         isRejected ? <XCircle className="h-4 w-4" /> :
         isPending ? <ShieldCheck className="h-4 w-4" /> :
         isAwaiting ? <Clock className="h-4 w-4" /> :
         <Banknote className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={toggle}
        disabled={!canExpand}
        className={cn(
          'min-w-0 flex-1 text-left',
          canExpand && 'hover:opacity-90 transition-opacity cursor-pointer',
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate">{formatUGX(Number(batch.declared_total))}</p>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0">
            {channelLabel(batch.channel)}
          </Badge>
          <StatusPill batch={batch} />
          {canExpand && (
            <ChevronDown
              className={cn(
                'h-3 w-3 text-muted-foreground transition-transform shrink-0',
                expanded && 'rotate-180',
              )}
            />
          )}
        </div>
        {batch.proof_reference && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            Ref <span className="font-mono">{batch.proof_reference}</span>
          </p>
        )}
        {isRejected && batch.rejection_reason && (
          <div className="mt-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Rejection reason
            </p>
            <p className="text-[11px] text-destructive/90 mt-0.5 leading-snug">
              {batch.rejection_reason}
            </p>
          </div>
        )}
      </button>
      {isAwaiting ? (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={onSubmitProof}>
          Add proof
          <ChevronRight className="h-3 w-3" />
        </Button>
      ) : isRejected ? (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={onSubmitProof}>
          Resubmit
          <ChevronRight className="h-3 w-3" />
        </Button>
      ) : null}
      </div>

      {expanded && canExpand && (
        <CommissionBreakdown
          items={items}
          loading={items === null && !loadErr}
          error={loadErr}
          isVerified={isVerified}
          batch={batch}
        />
      )}
    </div>
  );
}

function CommissionBreakdown({
  items,
  loading,
  error,
  isVerified,
  batch,
}: {
  items: BatchItemDetail[] | null;
  loading: boolean;
  error: string | null;
  isVerified: boolean;
  batch: FieldDepositBatch;
}) {
  const ratePct = Math.round(FIELD_DEPOSIT_COMMISSION_RATE * 100);
  const totalRepayment = items?.reduce((s, i) => s + i.amount, 0) ?? 0;
  const totalCommission =
    items?.reduce((s, i) => s + Math.round(i.amount * FIELD_DEPOSIT_COMMISSION_RATE), 0) ?? 0;
  const declared = Number(batch.declared_total || 0);
  const recordedTagged = Number(batch.tagged_total || 0);
  // Match against authoritative batch numbers:
  // - if verified, compare to recorded `tagged_total`; otherwise fall back to declared total.
  const matchTarget = isVerified && recordedTagged > 0 ? recordedTagged : declared;
  const matchTargetLabel = isVerified && recordedTagged > 0 ? 'recorded tagged total' : 'declared total';
  const repaymentDelta = totalRepayment - matchTarget;
  const repaymentMatches = items !== null && Math.abs(repaymentDelta) < 1;

  return (
    <div className="mt-3 ml-12 rounded-lg border bg-muted/30 overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between border-b bg-background/40">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Coins className="h-3 w-3" />
          Commission breakdown · {ratePct}% per repayment
        </div>
        <span className="text-[10px] text-muted-foreground">
          {isVerified ? 'Recorded as expense' : 'Estimate (on verify)'}
        </span>
      </div>

      {loading && (
        <div className="px-3 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading tenants…
        </div>
      )}
      {error && <div className="px-3 py-3 text-xs text-destructive">{error}</div>}

      {items && items.length === 0 && (
        <div className="px-3 py-3 text-xs text-muted-foreground text-center">
          No tenants tagged in this batch.
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b">
            <span>Tenant</span>
            <span className="text-right">Repayment</span>
            <span className="text-right min-w-[80px]">Commission</span>
          </div>
          <ul className="divide-y">
            {items.map((it) => {
              const comm = Math.round(it.amount * FIELD_DEPOSIT_COMMISSION_RATE);
              return (
                <li key={it.id} className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-xs items-center">
                  <span className="truncate font-medium">{it.tenant_name ?? '—'}</span>
                  <span className="font-mono text-right">{formatUGX(it.amount)}</span>
                  <span className="font-mono text-right text-emerald-600 dark:text-emerald-400 min-w-[80px]">
                    +{formatUGX(comm)}
                  </span>
                </li>
              );
            })}
          </ul>
          {/* Totals footer */}
          <div className="border-t bg-background/60">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-xs items-center font-semibold">
              <span>Total ({items.length} tenant{items.length === 1 ? '' : 's'})</span>
              <span className="font-mono text-right">{formatUGX(totalRepayment)}</span>
              <span className="font-mono text-right text-emerald-600 dark:text-emerald-400 min-w-[80px]">
                +{formatUGX(totalCommission)}
              </span>
            </div>

            {/* Reconciliation against batch */}
            <div
              className={cn(
                'px-3 py-2 border-t text-[11px] flex items-start gap-1.5',
                repaymentMatches
                  ? 'bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
              )}
            >
              {repaymentMatches ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                {repaymentMatches ? (
                  <span>
                    Repayments match the {matchTargetLabel} of{' '}
                    <span className="font-mono font-semibold">{formatUGX(matchTarget)}</span>.
                  </span>
                ) : (
                  <span>
                    Repayments {repaymentDelta > 0 ? 'exceed' : 'fall short of'} the {matchTargetLabel} (
                    <span className="font-mono font-semibold">{formatUGX(matchTarget)}</span>) by{' '}
                    <span className="font-mono font-semibold">{formatUGX(Math.abs(repaymentDelta))}</span>
                    {!isVerified && repaymentDelta < 0 ? ' — surplus stays as agent float on verify.' : '.'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusPill({ batch }: { batch: FieldDepositBatch }) {
  const s = batch.status;
  const cfg = (() => {
    switch (s) {
      case 'awaiting_proof':
        return { label: 'Pending proof', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' };
      case 'pending_finops_verification':
        return { label: 'Pending Finance review', cls: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400' };
      case 'verified':
        return { label: 'Verified', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' };
      case 'rejected':
        return { label: 'Rejected', cls: 'border-destructive/30 bg-destructive/10 text-destructive' };
      case 'cancelled':
        return { label: 'Cancelled', cls: 'border-muted-foreground/30 bg-muted text-muted-foreground' };
      default:
        return { label: statusLabel(s), cls: 'border-border bg-muted text-muted-foreground' };
    }
  })();
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 font-medium shrink-0', cfg.cls)}>
      {cfg.label}
    </Badge>
  );
}

export default FieldDepositQueueCard;
