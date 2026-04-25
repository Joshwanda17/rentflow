import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Banknote, ChevronRight, Clock, CheckCircle2, AlertCircle, Send, Wallet } from 'lucide-react';
import {
  listAgentBatches,
  type FieldDepositBatch,
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

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className={cn(
        'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
        isVerified && 'bg-emerald-500/10 text-emerald-600',
        isRejected && 'bg-red-500/10 text-red-600',
        isAwaiting && 'bg-amber-500/10 text-amber-600',
        isPending && 'bg-blue-500/10 text-blue-600',
        isCancelled && 'bg-muted text-muted-foreground',
      )}>
        {isVerified ? <CheckCircle2 className="h-4 w-4" /> :
         isRejected ? <AlertCircle className="h-4 w-4" /> :
         isPending ? <Send className="h-4 w-4" /> :
         <Banknote className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm truncate">{formatUGX(Number(batch.declared_total))}</p>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0">
            {channelLabel(batch.channel)}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {statusLabel(batch.status)}
          {batch.proof_reference ? ` · Ref ${batch.proof_reference}` : ''}
        </p>
      </div>
      {isAwaiting ? (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={onSubmitProof}>
          Add proof
          <ChevronRight className="h-3 w-3" />
        </Button>
      ) : null}
    </div>
  );
}

export default FieldDepositQueueCard;
