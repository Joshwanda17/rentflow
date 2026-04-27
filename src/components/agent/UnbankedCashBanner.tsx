import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  Banknote, AlertTriangle, ChevronRight, ShieldAlert,
  ChevronDown, Clock, FileText, User as UserIcon,
  Camera, Loader2, CheckCircle2, X, Upload, Pencil, Check,
  Layers,
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
  type DepositChannel,
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
  const [bulkOpen, setBulkOpen] = useState(false);

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
                <div className="px-4 pt-2.5 pb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-destructive truncate">
                      Deposit batches · {awaitingBatches.length}
                    </span>
                  </div>
                  {stillAwaiting.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => { hapticTap(); setBulkOpen(true); }}
                      className="inline-flex items-center gap-1 rounded-full bg-destructive text-destructive-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-destructive/90 transition-colors shrink-0"
                      title="Submit proof for several awaiting batches at once"
                    >
                      <Layers className="h-3 w-3" />
                      Bulk submit ({stillAwaiting.length})
                    </button>
                  )}
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
      {bulkOpen && (
        <BulkProofDialog
          batches={stillAwaiting}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); refresh(); }}
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

/**
 * Per-channel reference format guidance. `pattern` is a SOFT validator —
 * it only drives the inline warning chip and does NOT block submission,
 * since real-world telco/bank reference formats drift over time.
 */
const CHANNEL_REF_HINT: Record<
  DepositChannel,
  { label: string; placeholder: string; example: string; pattern: RegExp; help: string }
> = {
  mtn: {
    label: 'MTN MoMo Transaction ID',
    placeholder: 'e.g. 12345678901 or MP240115.1530.A12345',
    example: '12345678901',
    // MTN: 10–14 digit txn ID, or alphanumeric MP-style reference
    pattern: /^([0-9]{10,14}|MP[0-9]{6}\.[0-9]{4}\.[A-Z0-9]{5,8})$/i,
    help: '10–14 digit Transaction ID from the MTN SMS, or full MP reference.',
  },
  airtel: {
    label: 'Airtel Money Transaction ID',
    placeholder: 'e.g. CI240115.1530.A12345 or 1234567890',
    example: 'CI240115.1530.A12345',
    pattern: /^([0-9]{10,14}|[A-Z]{2}[0-9]{6}\.[0-9]{4}\.[A-Z0-9]{5,8})$/i,
    help: '10–14 digit ID from the Airtel SMS, or full CI reference.',
  },
  bank: {
    label: 'Bank deposit slip / reference',
    placeholder: 'e.g. EQB-9988-7766 or slip number',
    example: 'EQB-9988-7766',
    // Bank: alphanumeric + dashes/slashes, 6–24 chars
    pattern: /^[A-Z0-9][A-Z0-9\-/]{4,22}[A-Z0-9]$/i,
    help: 'Slip / reference printed on the bank deposit receipt (letters, digits, dashes).',
  },
  cash_merchant: {
    label: 'Cash agent receipt number',
    placeholder: 'e.g. RCPT-2024-00123',
    example: 'RCPT-2024-00123',
    pattern: /^[A-Z0-9][A-Z0-9\-/]{3,22}[A-Z0-9]$/i,
    help: 'Receipt number printed on the cash agent slip.',
  },
};

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
            {(() => {
              const hint = CHANNEL_REF_HINT[batch.channel];
              const trimmed = reference.trim();
              const hasInput = trimmed.length > 0;
              const isValidShape = hasInput && hint.pattern.test(trimmed);
              const isTooShort = hasInput && trimmed.length < 4;
              return (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {hint.label}
                    </label>
                    <button
                      type="button"
                      onClick={() => { hapticTap(); setReference(hint.example); }}
                      disabled={submitting}
                      className="text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
                      title="Fill the example format"
                    >
                      Use example
                    </button>
                  </div>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={hint.placeholder}
                    className={cn(
                      'w-full h-10 px-3 rounded-lg border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary transition-colors',
                      hasInput && isValidShape && 'border-success/60',
                      hasInput && !isValidShape && !isTooShort && 'border-warning/60',
                      !hasInput && 'border-border',
                    )}
                    disabled={submitting}
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby={`ref-hint-${batch.id}`}
                  />
                  <div
                    id={`ref-hint-${batch.id}`}
                    className="flex items-start gap-1.5 text-[10px] leading-snug"
                  >
                    {!hasInput && (
                      <span className="text-muted-foreground">{hint.help}</span>
                    )}
                    {hasInput && isTooShort && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-warning" />
                        Too short — most {channelLabel(batch.channel)} references are 8+ chars.
                      </span>
                    )}
                    {hasInput && !isTooShort && isValidShape && (
                      <span className="text-success flex items-center gap-1 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        Looks like a valid {channelLabel(batch.channel)} reference.
                      </span>
                    )}
                    {hasInput && !isTooShort && !isValidShape && (
                      <span className="text-warning flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Format unusual — double-check, then submit. Expected like{' '}
                        <span className="font-mono font-semibold">{hint.example}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

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

/* ---------------------------------------------------------------------- */
/* Bulk-proof submission dialog                                            */
/* ---------------------------------------------------------------------- */

interface BulkProofDialogProps {
  /** Only awaiting_proof batches should be passed in. */
  batches: AwaitingBatchWithItems[];
  onClose: () => void;
  onDone: () => void;
}

type BulkRowState = 'pending' | 'submitting' | 'done' | 'error';

/** Per-batch outcome captured during the bulk submit run. Lives in state so
 *  we can render an in-dialog summary after submission completes — agents
 *  often need to screenshot the result or copy a reference for follow-up. */
type BulkResult = {
  batchId: string;
  channel: DepositChannel;
  declaredTotal: number;
  status: 'done' | 'error' | 'skipped';
  /** The reference string actually sent to submitProofForBatch (after
   *  fallback to `RECEIPT-<id>` if the agent left it blank). */
  refUsed: string | null;
  /** True if the shared receipt photo was attached to this batch. */
  photoAttached: boolean;
  /** Failure reason, if any. */
  errorMsg?: string;
};
/** 'shared' = one reference for all selected batches. 'per_batch' = each
 *  selected batch gets its own input (typical when each batch was deposited
 *  via a different mobile money / bank transaction). */
type RefMode = 'shared' | 'per_batch';

/* ---------------------------------------------------------------------- */
/* Bulk results summary panel                                              */
/* ---------------------------------------------------------------------- */

interface BulkResultsSummaryProps {
  results: BulkResult[];
  batches: AwaitingBatchWithItems[];
  /** True if a shared receipt photo was uploaded for this run. */
  photoAttached: boolean;
  /** Local object-URL preview of the uploaded receipt (lives only as long
   *  as the dialog session). Used so the agent can re-verify what was sent. */
  photoPreviewUrl: string | null;
  onRetryFailures: () => void;
}

/**
 * Post-submission breakdown shown in place of the form once the agent
 * finishes a bulk submit. Lists every selected batch with its outcome,
 * the reference Finance will see, and whether the shared photo was
 * attached — so agents can screenshot or copy details before closing.
 */
function BulkResultsSummary({
  results,
  photoAttached,
  photoPreviewUrl,
  onRetryFailures,
}: BulkResultsSummaryProps) {
  const okResults = results.filter((r) => r.status === 'done');
  const failResults = results.filter((r) => r.status !== 'done');
  const okTotal = okResults.reduce((s, r) => s + r.declaredTotal, 0);
  const failTotal = failResults.reduce((s, r) => s + r.declaredTotal, 0);

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Top-line counters */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-success/80">
            Submitted
          </div>
          <div className="text-lg font-bold text-success leading-tight">
            {okResults.length}
          </div>
          <div className="text-[10px] text-success/80 font-mono mt-0.5">
            {formatUGX(okTotal)}
          </div>
        </div>
        <div
          className={cn(
            'rounded-lg border px-3 py-2',
            failResults.length > 0
              ? 'border-destructive/40 bg-destructive/10'
              : 'border-border bg-muted/30',
          )}
        >
          <div
            className={cn(
              'text-[10px] font-bold uppercase tracking-wider',
              failResults.length > 0 ? 'text-destructive/80' : 'text-muted-foreground',
            )}
          >
            Failed / skipped
          </div>
          <div
            className={cn(
              'text-lg font-bold leading-tight',
              failResults.length > 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {failResults.length}
          </div>
          <div
            className={cn(
              'text-[10px] font-mono mt-0.5',
              failResults.length > 0 ? 'text-destructive/80' : 'text-muted-foreground',
            )}
          >
            {formatUGX(failTotal)}
          </div>
        </div>
      </div>

      {/* Shared photo recap */}
      {photoAttached && (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2">
          {photoPreviewUrl && (
            <a
              href={photoPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative h-10 w-10 shrink-0 rounded-md overflow-hidden border border-border bg-muted block"
            >
              <img
                src={photoPreviewUrl}
                alt="Submitted receipt"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </a>
          )}
          <div className="text-[11px] leading-snug">
            <span className="font-semibold">Shared receipt photo</span> attached to every
            submitted batch.
          </div>
        </div>
      )}

      {/* Per-batch breakdown */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Per-batch breakdown
        </div>
        <ul className="space-y-1.5">
          {results.map((r) => {
            const isOk = r.status === 'done';
            const isSkipped = r.status === 'skipped';
            return (
              <li
                key={r.batchId}
                className={cn(
                  'rounded-lg border bg-background p-2.5',
                  isOk && 'border-success/40',
                  !isOk && !isSkipped && 'border-destructive/40 bg-destructive/5',
                  isSkipped && 'border-warning/40 bg-warning/5',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="shrink-0 mt-0.5">
                    {isOk ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : isSkipped ? (
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    ) : (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-mono text-muted-foreground">
                        #{r.batchId.slice(0, 8)}
                      </span>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="truncate">{channelLabel(r.channel)}</span>
                      <span className="text-muted-foreground/60">·</span>
                      <span className="font-mono font-semibold">
                        {formatUGX(r.declaredTotal)}
                      </span>
                    </div>
                    {/* Reference used */}
                    {r.refUsed ? (
                      <div className="mt-1 text-[10px] flex items-baseline gap-1.5">
                        <span className="text-muted-foreground shrink-0">Ref:</span>
                        <span className="font-mono font-semibold break-all">
                          {r.refUsed}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1 text-[10px] text-muted-foreground italic">
                        No reference recorded
                      </div>
                    )}
                    {/* Photo flag (only meaningful when one was uploaded) */}
                    {photoAttached && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground inline-flex items-center gap-1">
                        <Camera className="h-3 w-3" />
                        Shared photo attached
                      </div>
                    )}
                    {/* Error / skipped reason */}
                    {!isOk && r.errorMsg && (
                      <div
                        className={cn(
                          'mt-1 text-[10px] font-medium',
                          isSkipped ? 'text-warning' : 'text-destructive',
                        )}
                      >
                        {r.errorMsg}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Retry CTA — only relevant when at least one batch didn't go through. */}
      {failResults.length > 0 && (
        <button
          type="button"
          onClick={onRetryFailures}
          className="w-full h-9 rounded-lg border border-border bg-background text-xs font-bold uppercase tracking-wider hover:bg-accent/40 inline-flex items-center justify-center gap-2"
        >
          <Upload className="h-3.5 w-3.5" />
          Retry {failResults.length} failed
        </button>
      )}
    </div>
  );
}

function BulkProofDialog({ batches, onClose, onDone }: BulkProofDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(batches.map((b) => b.id)),
  );
  const [mode, setMode] = useState<RefMode>('shared');
  const [sharedRef, setSharedRef] = useState('');
  const [perBatchRef, setPerBatchRef] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rowState, setRowState] = useState<Record<string, { state: BulkRowState; msg?: string }>>({});
  /** Per-batch outcomes from the most recent submit. Empty until the agent
   *  runs the submission at least once. Used to render the in-dialog
   *  results summary that replaces the form when `hasRun` is true. */
  const [results, setResults] = useState<BulkResult[]>([]);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const toggle = (id: string) => {
    if (submitting) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => !submitting && setSelected(new Set(batches.map((b) => b.id)));
  const clearAll = () => !submitting && setSelected(new Set());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error('Receipt image must be under 5 MB'); return; }
    setFile(f);
  };

  const totalSelected = batches
    .filter((b) => selected.has(b.id))
    .reduce((s, b) => s + Number(b.declared_total || 0), 0);

  /**
   * In per-batch mode, find references that the agent has typed into MORE
   * than one selected row. Same reference across multiple batches is almost
   * always a copy-paste mistake — Finance reconciles 1 reference → 1 deposit,
   * so a duplicate would point to the wrong amount on at least one batch.
   *
   * - Comparison is case-insensitive and whitespace-trimmed.
   * - Empty values are ignored (those are caught by the "missing" check).
   * - Returns: `dupSet` (the set of duplicated reference strings, normalized)
   *   and `dupBatchIds` (the batch IDs whose ref is duplicated).
   */
  const { dupSet, dupBatchIds } = useMemo(() => {
    if (mode !== 'per_batch') {
      return { dupSet: new Set<string>(), dupBatchIds: new Set<string>() };
    }
    const counts = new Map<string, string[]>(); // normalized ref -> batch ids
    for (const id of selected) {
      const raw = (perBatchRef[id] ?? '').trim();
      if (raw.length < 4) continue;
      const key = raw.toLowerCase();
      const list = counts.get(key) ?? [];
      list.push(id);
      counts.set(key, list);
    }
    const dupSet = new Set<string>();
    const dupBatchIds = new Set<string>();
    for (const [key, ids] of counts) {
      if (ids.length > 1) {
        dupSet.add(key);
        ids.forEach((id) => dupBatchIds.add(id));
      }
    }
    return { dupSet, dupBatchIds };
  }, [mode, selected, perBatchRef]);
  const hasDuplicates = dupBatchIds.size > 0;

  /**
   * Selected batches in per-batch mode whose reference is empty or shorter
   * than 4 chars AND that have no shared receipt photo to fall back on.
   * Used to (a) hard-disable the submit button, (b) light up the offending
   * rows in red, and (c) show an inline banner explaining what's missing.
   *
   * In shared mode, the single shared reference / photo combo is checked
   * separately by `validateBeforeSubmit` — this memo intentionally returns
   * an empty set so per-row hints don't fire in that mode.
   */
  const missingRefIds = useMemo(() => {
    if (mode !== 'per_batch') return new Set<string>();
    if (file) return new Set<string>(); // a shared photo covers any missing ref
    const out = new Set<string>();
    for (const id of selected) {
      const r = (perBatchRef[id] ?? '').trim();
      if (r.length < 4) out.add(id);
    }
    return out;
  }, [mode, selected, perBatchRef, file]);

  /** Submission is hard-blocked while ANY required reference is missing. */
  const hasMissingRefs = missingRefIds.size > 0;
  const sharedModeBlocked =
    mode === 'shared' && selected.size > 0 && sharedRef.trim().length < 4 && !file;
  const submitBlocked = selected.size === 0 || hasMissingRefs || sharedModeBlocked;

  /** Resolve the reference for a batch given the current mode. */
  const refForBatch = (id: string): string => {
    if (mode === 'shared') return sharedRef.trim();
    return (perBatchRef[id] ?? '').trim();
  };

  /** Pre-validate inputs before any upload happens. */
  const validateBeforeSubmit = (): string | null => {
    if (selected.size === 0) return 'Pick at least one batch';
    if (mode === 'shared') {
      if (sharedRef.trim().length < 4 && !file) {
        return 'Enter a shared reference or attach a receipt photo';
      }
    } else {
      // per_batch: every selected batch needs a reference OR the shared photo.
      // Reuse the memoized set so this stays in lock-step with the inline UI.
      if (missingRefIds.size > 0) {
        return `Add a reference (or attach a photo) for ${missingRefIds.size} batch${missingRefIds.size === 1 ? '' : 'es'}`;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const err = validateBeforeSubmit();
    if (err) { toast.error(err); return; }
    // Soft-block on duplicate per-batch references — let the agent confirm
    // if they really want to proceed (rare but possible: e.g., one big bank
    // transfer covering multiple batches that they're STILL splitting).
    if (mode === 'per_batch' && hasDuplicates) {
      const ok = window.confirm(
        `${dupBatchIds.size} batches share the same reference. Finance usually matches one reference to one deposit. Submit anyway?`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      // Upload the photo ONCE; reuse the same public URL for every batch.
      let imageUrl: string | null = null;
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `field-deposit-proofs/bulk/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('receipts')
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) throw upErr;
        imageUrl = supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl;
      }

      const ids = Array.from(selected);
      let okCount = 0;
      let failCount = 0;
      const runResults: BulkResult[] = [];
      const photoAttached = !!imageUrl;
      for (const id of ids) {
        setRowState((s) => ({ ...s, [id]: { state: 'submitting' } }));
        const meta = batches.find((b) => b.id === id);
        try {
          const { data: fresh, error: freshErr } = await supabase
            .from('field_deposit_batches')
            .select('status')
            .eq('id', id)
            .single();
          if (freshErr) throw freshErr;
          if (fresh?.status !== 'awaiting_proof') {
            setRowState((s) => ({ ...s, [id]: { state: 'error', msg: `Already ${fresh?.status ?? 'changed'}` } }));
            failCount++;
            runResults.push({
              batchId: id,
              channel: meta?.channel ?? 'cash_merchant',
              declaredTotal: Number(meta?.declared_total ?? 0),
              status: 'skipped',
              refUsed: null,
              photoAttached,
              errorMsg: `Already ${fresh?.status ?? 'changed'} — skipped`,
            });
            continue;
          }
          const ref = refForBatch(id);
          const finalRef = ref.length >= 4 ? ref : `RECEIPT-${id.slice(0, 8)}`;
          await submitProofForBatch(id, finalRef, imageUrl);
          setRowState((s) => ({ ...s, [id]: { state: 'done' } }));
          okCount++;
          runResults.push({
            batchId: id,
            channel: meta?.channel ?? 'cash_merchant',
            declaredTotal: Number(meta?.declared_total ?? 0),
            status: 'done',
            refUsed: finalRef,
            photoAttached,
          });
        } catch (innerErr) {
          setRowState((s) => ({ ...s, [id]: { state: 'error', msg: innerErr instanceof Error ? innerErr.message : 'Failed' } }));
          failCount++;
          runResults.push({
            batchId: id,
            channel: meta?.channel ?? 'cash_merchant',
            declaredTotal: Number(meta?.declared_total ?? 0),
            status: 'error',
            refUsed: refForBatch(id) || null,
            photoAttached,
            errorMsg: innerErr instanceof Error ? innerErr.message : 'Failed',
          });
        }
      }
      setResults(runResults);
      setHasRun(true);
      if (okCount > 0 && failCount === 0) {
        toast.success(`Submitted proof for ${okCount} batch${okCount === 1 ? '' : 'es'}`);
        // Don't auto-close — let the agent review the in-dialog summary and
        // close manually via the Done button. We still notify the parent so
        // the underlying list refreshes in the background.
        onDone();
      } else if (okCount > 0) {
        toast.warning(`Submitted ${okCount} · ${failCount} failed — see list`);
      } else {
        toast.error('No batches were submitted');
      }
    } catch (outerErr) {
      toast.error(outerErr instanceof Error ? outerErr.message : 'Bulk submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Bulk submit proof"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full sm:max-w-lg bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Bulk submit proof
            </p>
            <h2 className="text-base font-bold leading-tight truncate">
              {selected.size} of {batches.length} selected · {formatUGX(totalSelected)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-8 w-8 rounded-md hover:bg-accent flex items-center justify-center shrink-0 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode toggle (hidden once we have a results summary to show) */}
        {!hasRun && <div className="px-4 pt-3">
          <div className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-0.5 text-[11px] font-bold uppercase tracking-wider">
            <button
              type="button"
              onClick={() => !submitting && setMode('shared')}
              disabled={submitting}
              className={cn(
                'flex-1 h-8 rounded-md transition-colors',
                mode === 'shared' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              One shared reference
            </button>
            <button
              type="button"
              onClick={() => !submitting && setMode('per_batch')}
              disabled={submitting}
              className={cn(
                'flex-1 h-8 rounded-md transition-colors',
                mode === 'per_batch' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Different per batch
            </button>
          </div>
        </div>}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          {hasRun ? (
            /* ─────── Post-submission summary ─────── */
            <BulkResultsSummary
              results={results}
              batches={batches}
              photoAttached={results.some((r) => r.photoAttached)}
              photoPreviewUrl={previewUrl}
              onRetryFailures={() => {
                // Re-arm the dialog with only the failed batches selected so
                // the agent can fix references and resubmit. We keep their
                // existing per-batch refs intact (refs that worked stay).
                const failedIds = results
                  .filter((r) => r.status !== 'done')
                  .map((r) => r.batchId);
                if (failedIds.length === 0) return;
                setSelected(new Set(failedIds));
                setRowState({});
                setResults([]);
                setHasRun(false);
              }}
            />
          ) : (<>
          {/* Selection list */}
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Pick batches to clear
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={selectAll} disabled={submitting} className="text-[10px] font-medium text-primary hover:underline disabled:opacity-50">
                  All
                </button>
                <span className="text-muted-foreground/50 text-[10px]">·</span>
                <button type="button" onClick={clearAll} disabled={submitting} className="text-[10px] font-medium text-muted-foreground hover:underline disabled:opacity-50">
                  None
                </button>
              </div>
            </div>
            <ul className="space-y-1.5">
              {batches.map((b) => {
                const isPicked = selected.has(b.id);
                const rs = rowState[b.id];
                return (
                  <li key={b.id}>
                    <div
                      className={cn(
                        'rounded-lg border bg-background transition-colors',
                        isPicked ? 'border-primary/60 bg-primary/5' : 'border-border',
                      )}
                    >
                      <label
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2',
                          submitting ? 'cursor-default' : 'cursor-pointer',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isPicked}
                          onChange={() => toggle(b.id)}
                          disabled={submitting}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono text-muted-foreground">#{b.id.slice(0, 8)}</span>
                            <span className="text-muted-foreground/60">·</span>
                            <span className="truncate">{channelLabel(b.channel)}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {b.items.length} entr{b.items.length === 1 ? 'y' : 'ies'} · {formatDateTime(b.created_at)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold font-mono">{formatUGX(Number(b.declared_total))}</div>
                          {rs && (
                            <div className="text-[10px] mt-0.5 flex items-center justify-end gap-1">
                              {rs.state === 'submitting' && (
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Sending
                                </span>
                              )}
                              {rs.state === 'done' && (
                                <span className="text-success flex items-center gap-1 font-semibold">
                                  <CheckCircle2 className="h-3 w-3" /> Sent
                                </span>
                              )}
                              {rs.state === 'error' && (
                                <span className="text-destructive flex items-center gap-1 font-semibold" title={rs.msg}>
                                  <X className="h-3 w-3" /> {rs.msg ?? 'Failed'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </label>

                      {/* Per-batch reference field — only when picked AND per-batch mode */}
                      {isPicked && mode === 'per_batch' && (() => {
                        const hint = CHANNEL_REF_HINT[b.channel];
                        const raw = perBatchRef[b.id] ?? '';
                        const trimmed = raw.trim();
                        const hasInput = trimmed.length > 0;
                        const isValidShape = hasInput && hint.pattern.test(trimmed);
                        const isTooShort = hasInput && trimmed.length < 4;
                        const isDuplicate = dupBatchIds.has(b.id);
                        // Hard-blocked when ref is unusable (empty / <4 chars)
                        // AND no shared photo can cover it. Wins over duplicate
                        // styling because it's a stricter blocker.
                        const isMissingRequired = missingRefIds.has(b.id);
                        return (
                          <div className="px-3 pb-2 -mt-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-medium text-muted-foreground truncate">
                                {hint.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  hapticTap();
                                  setPerBatchRef((p) => ({ ...p, [b.id]: hint.example }));
                                }}
                                disabled={submitting}
                                className="text-[10px] font-medium text-primary hover:underline disabled:opacity-50 shrink-0"
                                title="Fill the example format"
                              >
                                Use example
                              </button>
                            </div>
                            <input
                              type="text"
                              value={raw}
                              onChange={(e) =>
                                setPerBatchRef((p) => ({ ...p, [b.id]: e.target.value }))
                              }
                              placeholder={hint.placeholder}
                              className={cn(
                                'w-full h-9 px-3 rounded-md border bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary transition-colors',
                                isMissingRequired && 'border-destructive/70 ring-1 ring-destructive/40',
                                !isMissingRequired && isDuplicate && 'border-destructive/70 ring-1 ring-destructive/30',
                                !isMissingRequired && !isDuplicate && hasInput && isValidShape && 'border-success/60',
                                !isMissingRequired && !isDuplicate && hasInput && !isValidShape && !isTooShort && 'border-warning/60',
                                !isMissingRequired && !isDuplicate && !hasInput && 'border-border',
                              )}
                              disabled={submitting}
                              inputMode="text"
                              autoComplete="off"
                              spellCheck={false}
                              aria-describedby={`bulk-ref-hint-${b.id}`}
                              aria-invalid={isMissingRequired || isDuplicate || undefined}
                              aria-required={isMissingRequired || undefined}
                            />
                            <div
                              id={`bulk-ref-hint-${b.id}`}
                              className="text-[10px] leading-snug"
                            >
                              {isMissingRequired && (
                                <span className="text-destructive inline-flex items-center gap-1 font-semibold">
                                  <AlertTriangle className="h-3 w-3" />
                                  Reference required — add one or attach a shared receipt photo below.
                                </span>
                              )}
                              {!isMissingRequired && isDuplicate && (
                                <span className="text-destructive inline-flex items-center gap-1 font-semibold">
                                  <AlertTriangle className="h-3 w-3" />
                                  Same reference used on another selected batch — each deposit needs its own.
                                </span>
                              )}
                              {!isMissingRequired && !isDuplicate && !hasInput && (
                                <span className="text-muted-foreground">{hint.help}</span>
                              )}
                              {!isMissingRequired && !isDuplicate && hasInput && isTooShort && (
                                <span className="text-muted-foreground inline-flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3 text-warning" />
                                  Too short — most {channelLabel(b.channel)} references are 8+ chars.
                                </span>
                              )}
                              {!isMissingRequired && !isDuplicate && hasInput && !isTooShort && isValidShape && (
                                <span className="text-success inline-flex items-center gap-1 font-medium">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Looks like a valid {channelLabel(b.channel)} reference.
                                </span>
                              )}
                              {!isMissingRequired && !isDuplicate && hasInput && !isTooShort && !isValidShape && (
                                <span className="text-warning inline-flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Format unusual — expected like{' '}
                                  <span className="font-mono font-semibold">{hint.example}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Shared inputs section */}
          <div className="px-4 py-3 mt-2 border-t border-border space-y-3">
            {mode === 'shared' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Shared transaction ID / reference
                </label>
                <input
                  type="text"
                  value={sharedRef}
                  onChange={(e) => setSharedRef(e.target.value)}
                  placeholder="Used for every selected batch"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={submitting}
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Same reference is attached to every selected batch. Switch to <span className="font-semibold">Different per batch</span> if each deposit had its own transaction.
                </p>
              </div>
            )}
            {mode === 'per_batch' && (
              <div className="-mt-1 space-y-1.5">
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Enter the transaction ID / reference next to each selected batch above. Leave a row blank only if you'll cover it with the shared receipt photo below.
                </p>
                {hasMissingRefs && (
                  <div
                    className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-2.5 py-2"
                    role="alert"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    <div className="text-[11px] text-destructive leading-snug">
                      <span className="font-bold">
                        {missingRefIds.size} batch{missingRefIds.size === 1 ? '' : 'es'} missing a reference
                      </span>{' '}
                      · Add a transaction ID for each, or attach a shared receipt photo below to cover them all.
                    </div>
                  </div>
                )}
                {hasDuplicates && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    <div className="text-[11px] text-destructive leading-snug">
                      <span className="font-bold">Duplicate reference detected</span> ·{' '}
                      {dupBatchIds.size} batch{dupBatchIds.size === 1 ? '' : 'es'} share{dupBatchIds.size === 1 ? 's' : ''} the same reference. Each deposit needs its own transaction ID so Finance can match the right amount.
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Receipt photo (optional · shared)
              </label>
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
                  {previewUrl && (
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative h-12 w-12 shrink-0 rounded-md overflow-hidden border border-border bg-muted block"
                    >
                      <img src={previewUrl} alt="Receipt preview" className="h-full w-full object-cover" loading="lazy" />
                    </a>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="truncate font-medium">{file.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {(file.size / 1024).toFixed(0)} KB · attached to each selected batch
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
                    Tap to add a single receipt photo
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
          </div>
          </>)}

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center gap-2">
            {hasRun ? (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </button>
            ) : (<>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="h-10 px-4 rounded-lg border border-border bg-background text-xs font-bold uppercase tracking-wider hover:bg-accent/40 disabled:opacity-50"
              >
                {submitting ? 'Working…' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting || selected.size === 0}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold uppercase tracking-wider hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting {selected.size}…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Submit proof for {selected.size || 0} batch{selected.size === 1 ? '' : 'es'}
                  </>
                )}
              </button>
            </>)}
          </div>
        </form>
      </div>
    </div>
  );
}
