import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  Banknote, AlertTriangle, ChevronRight, ShieldAlert,
  ChevronDown, Clock, FileText, User as UserIcon,
  Camera, Loader2, CheckCircle2, X, Upload, Pencil, Check,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import {
  listAgentBatches,
  listUnbatchedFieldCollections,
  listBatchItems,
  submitProofForBatch,
  updateBatchDeclaredTotal,
  type FieldDepositBatch,
  type UnbatchedFieldCollection,
  type BatchItemDetail,
  type BatchStatus,
  channelLabel,
} from '@/lib/fieldDepositBatches';
import { FieldDepositWizardDialog } from '@/components/agent/FieldDepositWizardDialog';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AwaitingBatchWithItems extends FieldDepositBatch {
  items: BatchItemDetail[];
}

/** Batch statuses we surface in the banner. Past 'verified'/'rejected' rows
 *  are kept around briefly so the agent sees their proof landed. */
const VISIBLE_STATUSES: BatchStatus[] = [
  'awaiting_proof',
  'pending_finops_verification',
  'verified',
  'rejected',
];

/** How long after verification/rejection we keep the row visible. */
const RESOLVED_VISIBILITY_MS = 24 * 60 * 60 * 1000; // 24h

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
  const [unbatched, setUnbatched] = useState<UnbatchedFieldCollection[]>([]);
  const [awaitingBatches, setAwaitingBatches] = useState<AwaitingBatchWithItems[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [proofForBatch, setProofForBatch] = useState<FieldDepositBatch | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [unbatchedRows, batches] = await Promise.all([
        listUnbatchedFieldCollections(user.id),
        listAgentBatches(user.id, 25),
      ]);
      const visible = batches.filter((b) => {
        if (!VISIBLE_STATUSES.includes(b.status)) return false;
        // Hide resolved batches that are older than RESOLVED_VISIBILITY_MS.
        if (b.status === 'verified' || b.status === 'rejected') {
          const ts = b.finops_verified_at ?? b.updated_at;
          if (ts && Date.now() - new Date(ts).getTime() > RESOLVED_VISIBILITY_MS) {
            return false;
          }
        }
        return true;
      });
      // Pull items per visible batch so the drill-down can show tenant + amount.
      const withItems: AwaitingBatchWithItems[] = await Promise.all(
        visible.map(async (b) => {
          try {
            const items = await listBatchItems(b.id);
            return { ...b, items };
          } catch {
            return { ...b, items: [] };
          }
        }),
      );
      setUnbatched(unbatchedRows);
      setAwaitingBatches(withItems);
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

  const unbatchedTotal = unbatched.reduce((s, r) => s + Number(r.amount || 0), 0);
  const unbatchedCount = unbatched.length;
  // "Hanging" cash = only batches still awaiting agent proof. Once submitted,
  // the money is in Finance's court so it doesn't count against the agent.
  const stillAwaiting = awaitingBatches.filter((b) => b.status === 'awaiting_proof');
  const awaitingTotal = stillAwaiting.reduce(
    (s, b) => s + Number(b.declared_total || 0),
    0,
  );
  const grandTotal = unbatchedTotal + awaitingTotal;
  const grandCount = unbatchedCount + stillAwaiting.length;
  const hasResolvedRows = awaitingBatches.length > stillAwaiting.length;

  // Nothing hanging AND nothing recently resolved → render nothing.
  if (!loaded || (grandTotal <= 0 && !hasResolvedRows)) return null;

  const oldestAwaiting = stillAwaiting[stillAwaiting.length - 1];
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
          {stillAwaiting.length > 0 && (
            <button
              type="button"
              onClick={() => { hapticTap(); setProofForBatch(stillAwaiting[0]); }}
              className="flex items-center justify-between gap-2 rounded-xl border-2 border-foreground/20 bg-background px-3 py-2.5 text-left hover:bg-accent transition-all active:scale-[0.98] min-h-[48px]"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Add proof
                </p>
                <p className="text-sm font-semibold truncate">
                  {formatUGX(Number(stillAwaiting[0].declared_total))} · oldest deposit
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Drill-down toggle */}
        <button
          type="button"
          onClick={() => { hapticTap(); setExpanded(v => !v); }}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border/60 bg-background/40 hover:bg-background/70 transition-colors text-left"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          aria-expanded={expanded}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {expanded ? 'Hide' : 'See'} every entry ({unbatchedCount + awaitingBatches.length})
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform shrink-0',
              expanded && 'rotate-180',
            )}
          />
        </button>

        {/* Drill-down list */}
        {expanded && (
          <div className="border-t border-border/60 divide-y divide-border/60 bg-background/30">
            {/* Group A: not yet deposited */}
            {unbatched.length > 0 && (
              <div>
                <div className="px-4 pt-2.5 pb-1 flex items-center gap-1.5">
                  <Banknote className="h-3 w-3 text-warning" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-warning">
                    Not yet deposited · {unbatched.length}
                  </span>
                </div>
                <ul className="divide-y divide-border/40">
                  {unbatched.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => { hapticTap(); setWizardOpen(true); }}
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-accent/40 transition-colors min-h-[56px]"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <div className="h-8 w-8 rounded-lg bg-warning/15 text-warning flex items-center justify-center shrink-0">
                          <UserIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">
                            {row.tenant_name || 'Walk-up tenant'}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDateTime(row.captured_at)}
                            <span className="opacity-50">·</span>
                            <span className="font-mono">#{row.id.slice(0, 8)}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">{formatUGX(row.amount)}</p>
                          <p className="text-[9px] uppercase tracking-wider text-warning font-semibold">
                            Bank now →
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Group B: awaiting proof — grouped by batch */}
            {awaitingBatches.length > 0 && (
              <div>
                <div className="px-4 pt-2.5 pb-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">
                    Deposit batches · {awaitingBatches.length}
                  </span>
                </div>
                <ul className="divide-y divide-border/40">
                  {awaitingBatches.map((b) => (
                    <AwaitingBatchRow
                      key={b.id}
                      batch={b}
                      onOpenWizard={() => setProofForBatch(b)}
                      onProofSubmitted={refresh}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* Status pill metadata used by AwaitingBatchRow */
function getStatusBadge(status: BatchStatus): {
  label: string;
  cls: string;
  textCls: string;
  Icon: typeof CheckCircle2;
} {
  switch (status) {
    case 'awaiting_proof':
      return {
        label: 'Awaiting proof',
        cls: 'bg-destructive/15 text-destructive border-destructive/30',
        textCls: 'text-destructive',
        Icon: AlertTriangle,
      };
    case 'pending_finops_verification':
      return {
        label: 'Proof pending review',
        cls: 'bg-warning/15 text-warning border-warning/30',
        textCls: 'text-warning',
        Icon: Clock,
      };
    case 'verified':
      return {
        label: 'Verified',
        cls: 'bg-success/15 text-success border-success/30',
        textCls: 'text-success',
        Icon: CheckCircle2,
      };
    case 'rejected':
      return {
        label: 'Rejected',
        cls: 'bg-destructive/20 text-destructive border-destructive/40',
        textCls: 'text-destructive',
        Icon: X,
      };
    default:
      return {
        label: status,
        cls: 'bg-muted text-muted-foreground border-border',
        textCls: 'text-muted-foreground',
        Icon: FileText,
      };
  }
}

/* ---------------------------------------------------------------------- */
/* Inline awaiting-batch row with quick-proof entry                        */
/* ---------------------------------------------------------------------- */

interface AwaitingBatchRowProps {
  batch: AwaitingBatchWithItems;
  /** Open the full wizard (fallback for users who want all options). */
  onOpenWizard: () => void;
  /** Called after a successful inline proof submission. */
  onProofSubmitted: () => void;
}

function AwaitingBatchRow({ batch, onOpenWizard, onProofSubmitted }: AwaitingBatchRowProps) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState<string>(
    String(Math.round(Number(batch.declared_total) || 0)),
  );
  const [savingAmount, setSavingAmount] = useState(false);

  /* Thumbnail preview URL for the selected receipt photo. Created via
   * URL.createObjectURL and revoked on change/unmount to avoid memory leaks. */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const batchAge = Math.floor(
    (Date.now() - new Date(batch.created_at).getTime()) / 3_600_000,
  );
  const isOverdue = batchAge >= 24;

  /* Status-driven UI gating */
  const isAwaiting = batch.status === 'awaiting_proof';
  const isPending = batch.status === 'pending_finops_verification';
  const isVerified = batch.status === 'verified';
  const isRejected = batch.status === 'rejected';
  const canEditAmount = isAwaiting;
  const canAddProof = isAwaiting;
  const status = getStatusBadge(batch.status);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Receipt image must be under 5 MB');
      return;
    }
    setFile(f);
  };

  const handleSaveAmount = async () => {
    const next = Number(amountDraft.replace(/[^\d]/g, ''));
    if (!Number.isFinite(next) || next <= 0) {
      toast.error('Enter a valid banked amount');
      return;
    }
    if (next === Number(batch.declared_total)) {
      setEditingAmount(false);
      return;
    }
    setSavingAmount(true);
    try {
      await updateBatchDeclaredTotal(batch.id, next);
      toast.success(`Updated · banked ${formatUGX(next)}`);
      setEditingAmount(false);
      onProofSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update amount');
    } finally {
      setSavingAmount(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard 1: client-side status gate (covers stale UI / double-clicks)
    if (!isAwaiting) {
      toast.error('This batch already has proof submitted and cannot be resubmitted');
      onProofSubmitted();
      return;
    }
    if (submitting) return; // Guard 2: in-flight double-submit
    const ref = reference.trim();
    if (ref.length < 4 && !file) {
      toast.error('Enter a transaction ID / reference, or attach a receipt photo');
      return;
    }
    setSubmitting(true);
    try {
      // Guard 3: server-side freshness check — re-read status before uploading
      // anything, in case another tab/device already submitted proof for this batch.
      const { data: fresh, error: freshErr } = await supabase
        .from('field_deposit_batches')
        .select('status')
        .eq('id', batch.id)
        .single();
      if (freshErr) throw freshErr;
      if (fresh?.status !== 'awaiting_proof') {
        toast.error(
          fresh?.status === 'pending_finops_verification'
            ? 'Proof was already submitted for this batch and is awaiting Finance review'
            : `This batch is now '${fresh?.status}' and cannot accept new proof`,
        );
        onProofSubmitted();
        return;
      }
      let imageUrl: string | null = null;
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `field-deposit-proofs/${batch.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('receipts')
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }
      // submitProofForBatch requires a non-empty reference. If the agent only
      // attached a photo with no reference, use a placeholder marker.
      const finalRef = ref.length >= 4 ? ref : `RECEIPT-${batch.id.slice(0, 8)}`;
      await submitProofForBatch(batch.id, finalRef, imageUrl);
      toast.success('Proof submitted · Finance has been notified');
      setOpen(false);
      setReference('');
      setFile(null);
      onProofSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit proof');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <li>
      <div className="px-4 py-2.5">
        {/* Header row — left side toggles inline form, right side edits banked amount */}
        <div className="w-full flex items-center gap-3">
          <button
            type="button"
            onClick={() => { hapticTap(); setOpen(v => !v); }}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-expanded={open}
          >
            <div className="h-8 w-8 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">
                {channelLabel(batch.channel)}
              </p>
              {/* Status pill — always visible so the agent can see proof has landed */}
              <p className="mt-1 flex flex-wrap items-center gap-1">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border',
                    status.cls,
                  )}
                >
                  <status.Icon className="h-2.5 w-2.5" />
                  {status.label}
                </span>
                {batch.proof_reference && (isPending || isVerified) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/70 border border-border px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground max-w-[140px] truncate">
                    {batch.proof_reference.startsWith('RECEIPT-') ? '📷 Receipt' : `Ref ${batch.proof_reference}`}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatDateTime(batch.created_at)}
                {batchAge > 0 && (
                  <>
                    <span className="opacity-50">·</span>
                    <span className={cn(isOverdue && isAwaiting && 'text-destructive font-semibold')}>
                      {batchAge}h old
                    </span>
                  </>
                )}
                <span className="opacity-50">·</span>
                <span className="font-mono">#{batch.id.slice(0, 8)}</span>
              </p>
            </div>
          </button>

          {/* Editable banked amount */}
          <div className="text-right shrink-0">
            {editingAmount && canEditAmount ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amountDraft}
                  onChange={(e) => setAmountDraft(e.target.value.replace(/[^\d]/g, ''))}
                  className="h-8 w-24 px-2 rounded-md border border-border bg-background text-sm font-bold text-right focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={savingAmount}
                  autoFocus
                  aria-label="Banked amount in UGX"
                />
                <button
                  type="button"
                  onClick={handleSaveAmount}
                  disabled={savingAmount}
                  className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50"
                  aria-label="Save banked amount"
                >
                  {savingAmount ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingAmount(false);
                    setAmountDraft(String(Math.round(Number(batch.declared_total) || 0)));
                  }}
                  disabled={savingAmount}
                  className="h-8 w-8 rounded-md border border-border bg-background flex items-center justify-center hover:bg-accent/40 disabled:opacity-50"
                  aria-label="Cancel edit"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                {canEditAmount ? (
                  <button
                    type="button"
                    onClick={() => { hapticTap(); setEditingAmount(true); }}
                    className="inline-flex items-center gap-1 text-sm font-bold hover:text-primary transition-colors"
                    title="Edit banked amount"
                  >
                    {formatUGX(Number(batch.declared_total))}
                    <Pencil className="h-3 w-3 opacity-60" />
                  </button>
                ) : (
                  <p className="text-sm font-bold">{formatUGX(Number(batch.declared_total))}</p>
                )}
                {canAddProof ? (
                  <button
                    type="button"
                    onClick={() => { hapticTap(); setOpen(v => !v); }}
                    className="block text-[9px] uppercase tracking-wider text-destructive font-semibold flex items-center justify-end gap-0.5 ml-auto"
                  >
                    {open ? 'Close' : 'Add proof'}
                    <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
                  </button>
                ) : (
                  <p className={cn('text-[9px] uppercase tracking-wider font-semibold', status.textCls)}>
                    {isPending && 'Awaiting Finance'}
                    {isVerified && 'Float credited'}
                    {isRejected && 'See Finance note'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Items */}
        {batch.items.length > 0 && !open && (
          <ul className="mt-2 pl-11 space-y-0.5">
            {batch.items.slice(0, 5).map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-muted-foreground">
                  · {it.tenant_name || 'Walk-up'}
                </span>
                <span className="font-mono shrink-0">{formatUGX(it.amount)}</span>
              </li>
            ))}
            {batch.items.length > 5 && (
              <li className="text-[10px] text-muted-foreground italic">
                + {batch.items.length - 5} more…
              </li>
            )}
          </ul>
        )}

        {/* Inline proof form */}
        {open && canAddProof && (
          <form onSubmit={handleSubmit} className="mt-3 ml-11 space-y-2.5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Transaction ID / bank reference
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. MTN12345ABC, EQB-9988…"
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={submitting}
                inputMode="text"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Receipt photo (optional)
              </label>
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
                  {previewUrl ? (
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative h-14 w-14 shrink-0 rounded-md overflow-hidden border border-border bg-muted block"
                      title="Tap to view full size"
                    >
                      <img
                        src={previewUrl}
                        alt={`Receipt preview for ${file.name}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-md bg-muted flex items-center justify-center">
                      <Camera className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="truncate font-medium">{file.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {(file.size / 1024).toFixed(0)} KB · tap thumbnail to preview
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    disabled={submitting}
                    className="h-7 w-7 rounded-md hover:bg-accent flex items-center justify-center shrink-0"
                    aria-label="Remove receipt"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label
                  className={cn(
                    'flex items-center justify-center gap-2 h-10 rounded-lg border-2 border-dashed border-border bg-background cursor-pointer hover:bg-accent/30 transition-colors',
                    submitting && 'opacity-50 pointer-events-none',
                  )}
                >
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Tap to add receipt photo
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={handleFileChange}
                    disabled={submitting}
                  />
                </label>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold uppercase tracking-wider hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Submit proof
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => { hapticTap(); onOpenWizard(); }}
                disabled={submitting}
                className="h-10 px-3 rounded-lg border border-border bg-background text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-accent/40 transition-colors"
                title="Open the full deposit wizard"
              >
                More options
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground leading-snug">
              At least one of <span className="font-semibold">reference</span> or{' '}
              <span className="font-semibold">receipt photo</span> is required.
              Finance will verify before float and commission post.
            </p>
          </form>
        )}

        {/* Rejection note */}
        {isRejected && batch.rejection_reason && (
          <div className="mt-2 ml-11 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-destructive">
              Finance rejected this batch
            </p>
            <p className="text-[11px] text-foreground/80 mt-0.5">
              {batch.rejection_reason}
            </p>
          </div>
        )}
      </div>
    </li>
  );
}
