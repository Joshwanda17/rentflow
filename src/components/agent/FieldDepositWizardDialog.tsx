import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Banknote, Smartphone, Building2, HandCoins, ArrowLeft, ArrowRight, CheckCircle2,
  Loader2, Receipt, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';
import {
  type DepositChannel, type FieldDepositBatch, type UnbatchedFieldCollection,
  channelLabel, listUnbatchedFieldCollections, createBatchWithItems, submitProofForBatch,
} from '@/lib/fieldDepositBatches';

interface FieldDepositWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, dialog jumps straight to step 3 to add proof to an existing batch. */
  attachProofTo?: FieldDepositBatch;
}

const CHANNELS: { value: DepositChannel; label: string; hint: string; icon: React.ElementType }[] = [
  { value: 'mtn', label: 'MTN MoMo Merchant', hint: 'Deposit at any MTN agent code', icon: Smartphone },
  { value: 'airtel', label: 'Airtel Money Merchant', hint: 'Deposit at any Airtel agent code', icon: Smartphone },
  { value: 'bank', label: 'Bank Deposit (Equity)', hint: 'Deposit slip / online ref', icon: Building2 },
  { value: 'cash_merchant', label: 'Cash to Cash Agent', hint: 'Hand cash & get receipt #', icon: HandCoins },
];

const REF_LABEL: Record<DepositChannel, string> = {
  mtn: 'MTN Transaction ID',
  airtel: 'Airtel Transaction ID',
  bank: 'Bank reference number',
  cash_merchant: 'Cash agent receipt number',
};

type Step = 1 | 2 | 3;

export function FieldDepositWizardDialog({ open, onOpenChange, attachProofTo }: FieldDepositWizardDialogProps) {
  const { user } = useAuth();

  /* Step state */
  const [step, setStep] = useState<Step>(1);
  const [channel, setChannel] = useState<DepositChannel>('mtn');
  const [declared, setDeclared] = useState<string>('');
  const [notes, setNotes] = useState('');

  /* Step 2 */
  const [available, setAvailable] = useState<UnbatchedFieldCollection[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  /* Step 3 */
  const [proofRef, setProofRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdBatch, setCreatedBatch] = useState<FieldDepositBatch | null>(null);
  const [proofDeferred, setProofDeferred] = useState(false);

  /* Reset / preset on open */
  useEffect(() => {
    if (!open) return;
    if (attachProofTo) {
      setStep(3);
      setChannel(attachProofTo.channel);
      setDeclared(String(attachProofTo.declared_total));
      setCreatedBatch(attachProofTo);
      setProofRef('');
      setProofDeferred(false);
    } else {
      setStep(1);
      setChannel('mtn');
      setDeclared('');
      setNotes('');
      setPicked(new Set());
      setProofRef('');
      setCreatedBatch(null);
      setProofDeferred(false);
    }
  }, [open, attachProofTo]);

  /* Load unbatched collections when entering step 2 */
  useEffect(() => {
    if (!open || step !== 2 || !user?.id || attachProofTo) return;
    let cancelled = false;
    setLoadingList(true);
    listUnbatchedFieldCollections(user.id)
      .then(rows => { if (!cancelled) setAvailable(rows); })
      .catch(e => toast.error(e instanceof Error ? e.message : 'Failed to load collections'))
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [open, step, user?.id, attachProofTo]);

  const declaredNum = Number(declared) || 0;
  const taggedTotal = useMemo(
    () => available.filter(r => picked.has(r.id)).reduce((s, r) => s + Number(r.amount || 0), 0),
    [available, picked],
  );
  const surplus = Math.max(declaredNum - taggedTotal, 0);
  const overTagged = taggedTotal > declaredNum;

  const togglePick = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pickAll = () => {
    // Select greedy until we'd exceed declared.
    const next = new Set<string>();
    let running = 0;
    for (const r of available) {
      if (running + Number(r.amount) > declaredNum) break;
      next.add(r.id);
      running += Number(r.amount);
    }
    setPicked(next);
  };

  /* Step 2 → create batch then either ask for proof or finish */
  const handleCreateBatch = async (submitProofNow: boolean) => {
    if (!user?.id) return;
    if (overTagged) { toast.error('Tagged collections exceed declared deposit'); return; }
    setSubmitting(true);
    try {
      const itemAmounts: Record<string, number> = {};
      for (const r of available) if (picked.has(r.id)) itemAmounts[r.id] = Number(r.amount);
      const batch = await createBatchWithItems({
        agentId: user.id,
        channel,
        declaredTotal: declaredNum,
        collectionIds: Array.from(picked),
        itemAmounts,
        notes: notes.trim() || null,
      });
      setCreatedBatch(batch);
      if (submitProofNow) {
        setStep(3);
      } else {
        setProofDeferred(true);
        toast.success('Deposit batch saved · add proof when ready');
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create deposit batch');
    } finally {
      setSubmitting(false);
    }
  };

  /* Step 3 → submit proof */
  const handleSubmitProof = async () => {
    if (!createdBatch) return;
    const ref = proofRef.trim();
    if (ref.length < 4) { toast.error('Enter the full transaction reference'); return; }
    setSubmitting(true);
    try {
      await submitProofForBatch(createdBatch.id, ref);
      toast.success('Proof submitted · Finance has been notified');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit proof');
    } finally {
      setSubmitting(false);
    }
  };

  const ChannelIcon = CHANNELS.find(c => c.value === channel)?.icon ?? Banknote;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-3 sticky top-0 bg-background z-10 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            {attachProofTo ? 'Submit deposit proof' : 'Deposit collected cash'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {attachProofTo
              ? `${channelLabel(attachProofTo.channel)} · ${formatUGX(Number(attachProofTo.declared_total))}`
              : 'Bank the cash you collected from tenants. Finance will verify before float and commission post.'}
          </DialogDescription>
          {!attachProofTo && (
            <div className="flex items-center gap-1.5 pt-2">
              {[1, 2, 3].map(n => (
                <div key={n}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors',
                    n <= step ? 'bg-primary' : 'bg-muted',
                  )} />
              ))}
            </div>
          )}
        </DialogHeader>

        {/* ─────────── STEP 1 ─────────── */}
        {step === 1 && !attachProofTo && (
          <div className="px-5 py-4 space-y-4">
            <div>
              <Label className="text-sm font-semibold">How did you deposit?</Label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {CHANNELS.map(c => {
                  const Icon = c.icon;
                  const active = channel === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setChannel(c.value)}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                        active ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:bg-muted/40',
                      )}
                    >
                      <div className={cn(
                        'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm">{c.label}</p>
                        <p className="text-[11px] text-muted-foreground">{c.hint}</p>
                      </div>
                      {active && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">How much did you deposit? (UGX)</Label>
              <Input
                value={declared}
                onChange={e => setDeclared(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="e.g. 850000"
                className="text-lg font-semibold mt-2"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Enter the exact amount you handed over or sent.
              </p>
            </div>

            <div>
              <Label className="text-sm font-semibold">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Anything Finance should know"
                maxLength={280}
                rows={2}
                className="mt-2"
              />
            </div>

            <Button
              className="w-full gap-2"
              size="lg"
              disabled={declaredNum <= 0}
              onClick={() => setStep(2)}
            >
              Next: tag collections
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* ─────────── STEP 2 ─────────── */}
        {step === 2 && !attachProofTo && (
          <div className="px-5 py-4 space-y-4">
            <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-primary/5 p-3">
              <div className="flex items-center gap-2">
                <ChannelIcon className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold">{channelLabel(channel)}</p>
              </div>
              <p className="text-2xl font-bold mt-1">{formatUGX(declaredNum)}</p>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Tag tenant collections</Label>
              <button
                type="button"
                className="text-[11px] font-semibold text-primary hover:underline"
                onClick={pickAll}
                disabled={available.length === 0}
              >
                Auto-fill up to {formatUGX(declaredNum)}
              </button>
            </div>

            {loadingList ? (
              <div className="space-y-2">
                <div className="h-12 rounded-lg bg-muted animate-pulse" />
                <div className="h-12 rounded-lg bg-muted animate-pulse" />
                <div className="h-12 rounded-lg bg-muted animate-pulse" />
              </div>
            ) : available.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                No synced field collections waiting for a deposit.
                <br />
                <span className="text-[10px]">Capture collections in <span className="font-semibold">Field Collect</span> first, then sync.</span>
              </div>
            ) : (
              <ScrollArea className="max-h-64 rounded-lg border">
                <ul className="divide-y">
                  {available.map(r => {
                    const checked = picked.has(r.id);
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Checkbox checked={checked} onCheckedChange={() => togglePick(r.id)} />
                        <button
                          type="button"
                          onClick={() => togglePick(r.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="text-sm font-semibold truncate">{r.tenant_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {new Date(r.captured_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            {r.tenant_phone ? ` · ${r.tenant_phone}` : ''}
                          </p>
                        </button>
                        <p className="text-sm font-bold text-right shrink-0">{formatUGX(Number(r.amount))}</p>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}

            {/* Reconciliation strip */}
            <div className="rounded-xl border p-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Tagged</span>
                <span className="font-semibold">{formatUGX(taggedTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Declared deposit</span>
                <span className="font-semibold">{formatUGX(declaredNum)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-xs">
                <span className={cn('font-semibold', overTagged && 'text-red-600')}>
                  {overTagged ? 'Over-tagged' : 'Surplus → stays as float'}
                </span>
                <span className={cn('font-bold', overTagged && 'text-red-600')}>
                  {overTagged ? `−${formatUGX(taggedTotal - declaredNum)}` : formatUGX(surplus)}
                </span>
              </div>
              {overTagged && (
                <p className="text-[10px] text-red-600 flex items-center gap-1 pt-1">
                  <AlertTriangle className="h-3 w-3" />
                  Untag some collections — total can't exceed your deposit.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setStep(1)} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={submitting || overTagged || declaredNum <= 0}
                onClick={() => handleCreateBatch(false)}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & add proof later'}
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={submitting || overTagged || declaredNum <= 0}
                onClick={() => handleCreateBatch(true)}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Add proof now <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </div>
          </div>
        )}

        {/* ─────────── STEP 3 ─────────── */}
        {step === 3 && createdBatch && (
          <div className="px-5 py-4 space-y-4">
            <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-primary/5 p-3">
              <div className="flex items-center gap-2">
                <ChannelIcon className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold">{channelLabel(createdBatch.channel)}</p>
              </div>
              <p className="text-2xl font-bold mt-1">{formatUGX(Number(createdBatch.declared_total))}</p>
              <p className="text-[11px] text-muted-foreground">
                Tagged {formatUGX(Number(createdBatch.tagged_total))} · surplus {formatUGX(Number(createdBatch.surplus_total))}
              </p>
            </div>

            <div>
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                {REF_LABEL[createdBatch.channel]}
              </Label>
              <Input
                value={proofRef}
                onChange={e => setProofRef(e.target.value)}
                placeholder="e.g. MP240425.1234.A12345"
                className="mt-2 font-mono"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Finance must enter the exact same reference to verify. Money posts to your float and commission posts the moment it's verified.
              </p>
            </div>

            <Button
              className="w-full gap-2"
              size="lg"
              disabled={submitting || proofRef.trim().length < 4}
              onClick={handleSubmitProof}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send to Finance <ArrowRight className="h-4 w-4" /></>}
            </Button>

            {!attachProofTo && (
              <button
                type="button"
                className="w-full text-[11px] text-muted-foreground hover:underline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                I'll add the reference later
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default FieldDepositWizardDialog;
