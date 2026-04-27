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
      const awaiting = batches.filter(b => b.status === 'awaiting_proof');
      // Pull items per awaiting batch so the drill-down can show tenant + amount.
      const withItems: AwaitingBatchWithItems[] = await Promise.all(
        awaiting.map(async (b) => {
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

        {/* Drill-down toggle */}
        <button
          type="button"
          onClick={() => { hapticTap(); setExpanded(v => !v); }}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border/60 bg-background/40 hover:bg-background/70 transition-colors text-left"
          style={{ WebkitTapHighlightColor: 'transparent' }}
          aria-expanded={expanded}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {expanded ? 'Hide' : 'See'} every hanging entry ({grandCount})
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
                    Awaiting proof · {awaitingBatches.length} deposit{awaitingBatches.length === 1 ? '' : 's'}
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

  const batchAge = Math.floor(
    (Date.now() - new Date(batch.created_at).getTime()) / 3_600_000,
  );
  const isOverdue = batchAge >= 24;

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
    const ref = reference.trim();
    if (ref.length < 4 && !file) {
      toast.error('Enter a transaction ID / reference, or attach a receipt photo');
      return;
    }
    setSubmitting(true);
    try {
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
              <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatDateTime(batch.created_at)}
                {batchAge > 0 && (
                  <>
                    <span className="opacity-50">·</span>
                    <span className={cn(isOverdue && 'text-destructive font-semibold')}>
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
            {editingAmount ? (
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
                <button
                  type="button"
                  onClick={() => { hapticTap(); setEditingAmount(true); }}
                  className="inline-flex items-center gap-1 text-sm font-bold hover:text-primary transition-colors"
                  title="Edit banked amount"
                >
                  {formatUGX(Number(batch.declared_total))}
                  <Pencil className="h-3 w-3 opacity-60" />
                </button>
                <button
                  type="button"
                  onClick={() => { hapticTap(); setOpen(v => !v); }}
                  className="block text-[9px] uppercase tracking-wider text-destructive font-semibold flex items-center justify-end gap-0.5 ml-auto"
                >
                  {open ? 'Close' : 'Add proof'}
                  <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
                </button>
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
        {open && (
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
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-xs truncate flex items-center gap-1.5 min-w-0">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <span className="text-muted-foreground text-[10px] shrink-0">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    disabled={submitting}
                    className="h-6 w-6 rounded-md hover:bg-accent flex items-center justify-center shrink-0"
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
      </div>
    </li>
  );
}
