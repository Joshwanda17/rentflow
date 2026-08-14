import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import {
  MERCHANT_ADJUSTMENT_LABELS,
  MerchantAdjustmentType,
  MerchantFloatPosition,
  useMerchantFloatAdjustments,
  useMerchantFloatLedgerVariance,
  usePostMerchantAdjustment,
  usePostMerchantOpeningFloatLedger,
} from '@/hooks/useMerchantFloat';

/**
 * Professional correction path for a single merchant agent's settlement
 * position. Nothing here touches wallets or the ledger — corrections are
 * recorded in `merchant_float_reconciliations` with a mandatory reason and are
 * folded into the position math by `get_merchant_float_positions()`.
 */
export function MerchantReconcileDialog({
  position,
  open,
  onOpenChange,
}: {
  position: MerchantFloatPosition | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [type, setType] = useState<MerchantAdjustmentType>('opening_balance');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  // Opening balances are ALWAYS recognised on the BOOKS: balanced legs (agent
  // float cash_in + platform cash_out) plus the float bucket moved by the sole
  // wallet writer. Board-only opening balances are no longer allowed — they
  // read as a false success because they can never move the float figure.
  const [postToLedger, setPostToLedger] = useState(true);
  const { data: history } = useMerchantFloatAdjustments(position?.deskId);
  const { data: variances } = useMerchantFloatLedgerVariance(open);
  const post = usePostMerchantAdjustment();
  const postLedger = usePostMerchantOpeningFloatLedger();

  if (!position) return null;

  const truth = variances?.find((v) => v.deskId === position.deskId);
  const numericAmount = Number(amount.replace(/[^\d.-]/g, ''));
  const ledgerMode = type === 'opening_balance' && postToLedger;
  const valid =
    Number.isFinite(numericAmount) &&
    (ledgerMode ? numericAmount > 0 : numericAmount !== 0) &&
    reason.trim().length >= 10;
  const busy = post.isPending || postLedger.isPending;

  // What a recorded fix can and cannot move. Every adjustment type folds into
  // `adjustments_total` (which moves "Money we paid them back" and "We owe
  // them"). NOTHING here can move "They're holding our money" or the board vs
  // books gap — both read the agent's ledger-backed float bucket directly.
  const signedAmount = type === 'payout_correction' ? -numericAmount : numericAmount;
  const projectedReimbursed = position.reimbursed + signedAmount;
  const projectedOwed = Math.max(position.paidOut - projectedReimbursed, 0);

  const submit = async () => {
    try {
      if (ledgerMode) {
        const res = await postLedger.mutateAsync({
          deskId: position.deskId,
          agentId: position.agentId,
          adjustmentType: 'opening_balance',
          amount: numericAmount,
          reason,
          evidenceNote: evidence,
        });
        toast.success('Recorded on the books', {
          description: `Balanced legs posted. "They're holding our money" is now ${formatUGX(
            position.companyCashWithAgent + Math.round(numericAmount),
          )} (was ${formatUGX(position.companyCashWithAgent)}). Ledger group ${String(
            res.ledger_group_id,
          ).slice(0, 8)}.`,
        });
        setAmount('');
        setReason('');
        setEvidence('');
        setPostToLedger(false);
        onOpenChange(false);
        return;
      }
      const row = await post.mutateAsync({
        deskId: position.deskId,
        agentId: position.agentId,
        adjustmentType: type,
        amount: numericAmount,
        reason,
        evidenceNote: evidence,
      });
      if (!row?.id) {
        toast.error('The fix was not saved. Nothing changed.');
        return;
      }
      toast.success('Fix recorded', {
        description: `We owe them is now ${formatUGX(projectedOwed)}. "They're holding our money" (${formatUGX(
          position.companyCashWithAgent,
        )}) is unchanged — that figure comes from the books, not from fixes.`,
      });
      setAmount('');
      setReason('');
      setEvidence('');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not record the correction');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Fix balance for {position.agentName || position.label || 'this agent'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            This only fixes what the board shows for this agent. It does not move any real money or
            change their wallet. The books stay the truth.
          </DialogDescription>
        </DialogHeader>

        {truth && (
          <div
            className={`rounded-lg border px-3 py-2 ${
              truth.varianceState === 'aligned'
                ? 'border-border bg-muted/20'
                : 'border-destructive/40 bg-destructive/5'
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Float held: board vs books
            </p>
            <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
              <Stat label="Board" value={truth.storedFloat} />
              <Stat label="Books" value={truth.ledgerFloat} />
              <Stat label="Gap" value={truth.variance} muted={truth.varianceState === 'aligned'} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {truth.varianceState === 'aligned'
                ? 'The board matches the books for this agent.'
                : 'The board does not match the books. A fix here will NOT close this gap — the books have to be corrected.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Stat label="Money they paid out" value={position.paidOut} />
          <Stat label="Money we paid them back" value={position.reimbursed} />
          <Stat label="Float we sent them" value={position.floatCredits} />
          <Stat label="Payment messages matched" value={position.emailMatched} muted />
          <Stat label="Fixes already made" value={position.adjustments} muted />
          <Stat
            label={position.companyCashWithAgent > 0 ? "They're holding our money" : 'We owe them'}
            value={position.companyCashWithAgent > 0 ? position.companyCashWithAgent : position.owedToAgent}
          />
        </div>

        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs">What kind of fix</Label>
            <Select value={type} onValueChange={(v) => setType(v as MerchantAdjustmentType)}>
              <SelectTrigger className="mt-1 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MERCHANT_ADJUSTMENT_LABELS) as MerchantAdjustmentType[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {MERCHANT_ADJUSTMENT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Amount (UGX)</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 2500000"
              className="mt-1 h-9 text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {type === 'payout_correction'
                ? 'Lowers what we count as paid out by this agent.'
                : type === 'opening_balance'
                  ? 'Counts float the agent already held before the board started, so we stop showing it as owed to them.'
                  : type === 'write_off'
                    ? 'Closes the balance we agreed to let go with this agent.'
                    : 'Adds to the money we already count as paid back to this agent.'}{' '}
              {ledgerMode
                ? 'Must be a positive amount — to reduce float, use CFO Direct Debit.'
                : 'Use a minus amount to undo an earlier fix.'}
            </p>
          </div>

          {type === 'opening_balance' && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-[11px] leading-snug">
                <span className="font-semibold text-foreground">
                  Recorded on the books — required
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  Posts real balanced entries (agent float in, company float out) and raises their
                  float balance. Board-only opening balances are not allowed: they never move
                  "They're holding our money".
                </span>
              </span>
            </div>
          )}

          <div>
            <Label className="text-xs">Why (at least 10 letters)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why you are making this fix"
              className="mt-1 text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">{reason.trim().length}/10</p>
          </div>

          <div>
            <Label className="text-xs">Proof (optional)</Label>
            <Input
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="MoMo transaction ID, statement line, or approval note"
              className="mt-1 h-9 text-sm"
            />
          </div>

          <Button onClick={submit} disabled={!valid || busy} className="w-full">
            {busy ? 'Saving…' : ledgerMode ? 'Post to the books' : 'Save fix'}
          </Button>

          {valid && ledgerMode && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                What this will change
              </p>
              <p className="text-[11px] text-foreground">
                They're holding our money: {formatUGX(position.companyCashWithAgent)} →{' '}
                <span className="font-semibold">
                  {formatUGX(position.companyCashWithAgent + Math.round(numericAmount))}
                </span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                Two balanced legs are posted (their float in, company float out) and their float
                balance moves through the normal wallet writer. Fully audited and reversible only by
                a further ledger entry.
              </p>
            </div>
          )}

          {valid && !ledgerMode && (
            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                What this fix will change
              </p>
              <p className="text-[11px] text-foreground">
                Money we paid them back: {formatUGX(position.reimbursed)} →{' '}
                <span className="font-semibold">{formatUGX(projectedReimbursed)}</span>
              </p>
              <p className="text-[11px] text-foreground">
                We owe them: {formatUGX(Math.max(position.paidOut - position.reimbursed, 0))} →{' '}
                <span className="font-semibold">{formatUGX(projectedOwed)}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                Will NOT change: "They're holding our money" ({formatUGX(position.companyCashWithAgent)})
                or the board vs books gap. Those come from the agent's float in the books and can only
                be corrected on the books.
              </p>
            </div>
          )}
        </div>

        {!!history?.length && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Past fixes
            </p>
            {history.map((h) => (
              <div key={h.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-foreground truncate">
                    {MERCHANT_ADJUSTMENT_LABELS[h.adjustment_type as MerchantAdjustmentType] ??
                      h.adjustment_type}
                  </p>
                  <p className="font-mono text-[11px] font-bold tabular-nums shrink-0">
                    {formatUGX(Number(h.amount))}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(h.created_at).toLocaleString()} · {h.reason}
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 font-mono text-xs font-bold tabular-nums break-all ${
          muted ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {formatUGX(value)}
      </p>
    </div>
  );
}
