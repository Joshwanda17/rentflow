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
  usePostMerchantAdjustment,
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
  const { data: history } = useMerchantFloatAdjustments(position?.deskId);
  const post = usePostMerchantAdjustment();

  if (!position) return null;

  const numericAmount = Number(amount.replace(/[^\d.-]/g, ''));
  const valid = Number.isFinite(numericAmount) && numericAmount !== 0 && reason.trim().length >= 10;

  const submit = async () => {
    try {
      await post.mutateAsync({
        deskId: position.deskId,
        agentId: position.agentId,
        adjustmentType: type,
        amount: numericAmount,
        reason,
        evidenceNote: evidence,
      });
      toast.success('Correction recorded');
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
            change their wallet.
          </DialogDescription>
        </DialogHeader>

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
                ? 'Reduces what we treat as paid out by this merchant.'
                : 'Increases the reimbursement already recognised for this merchant.'}{' '}
              Use a negative amount to reverse an earlier correction.
            </p>
          </div>

          <div>
            <Label className="text-xs">Reason (min 10 characters)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why this correction is being made"
              className="mt-1 text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">{reason.trim().length}/10</p>
          </div>

          <div>
            <Label className="text-xs">Evidence reference (optional)</Label>
            <Input
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="MoMo transaction ID, statement line, approval note"
              className="mt-1 h-9 text-sm"
            />
          </div>

          <Button onClick={submit} disabled={!valid || post.isPending} className="w-full">
            {post.isPending ? 'Recording…' : 'Record correction'}
          </Button>
        </div>

        {!!history?.length && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Correction history
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
