import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowDownToLine, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';

interface AgentProxyWithdrawalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funderId: string;
  funderName: string;
  funderPhone: string;
  walletBalance: number;
  onSuccess?: () => void;
}

type PayoutMode = 'mtn' | 'airtel' | 'cash';

const PAYOUT_OPTIONS: { value: PayoutMode; label: string; icon: string }[] = [
  { value: 'mtn', label: 'MTN MoMo', icon: '📱' },
  { value: 'airtel', label: 'Airtel Money', icon: '📱' },
  { value: 'cash', label: 'Cash (Agent)', icon: '💵' },
];

export function AgentProxyWithdrawalDialog({
  open, onOpenChange, funderId, funderName, funderPhone, walletBalance, onSuccess,
}: AgentProxyWithdrawalDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(0);
  const [payoutMode, setPayoutMode] = useState<PayoutMode | null>(null);
  const [momoNumber, setMomoNumber] = useState('');
  const [momoName, setMomoName] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(0);
      setPayoutMode(null);
      setMomoNumber(funderPhone || '');
      setMomoName(funderName || '');
      setReason('');
    }
  }, [open, funderPhone, funderName]);

  const isMomo = payoutMode === 'mtn' || payoutMode === 'airtel';
  const ugandaPhoneRegex = /^(0[0-9]{9}|\+256[0-9]{9})$/;

  const isValid =
    amount >= 500 &&
    amount <= walletBalance &&
    !!payoutMode &&
    reason.trim().length >= 10 &&
    (isMomo ? ugandaPhoneRegex.test(momoNumber.trim()) && momoName.trim().length >= 2 : true);

  const handleSubmit = async () => {
    if (!user || !isValid) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('withdrawal_requests').insert({
        user_id: funderId,
        amount,
        status: 'pending' as const,
        mobile_money_number: isMomo ? momoNumber.trim() : null,
        mobile_money_provider: isMomo ? payoutMode : null,
        mobile_money_name: isMomo ? momoName.trim() : null,
        payout_method: payoutMode === 'cash' ? 'cash' : 'mobile_money',
        agent_location: payoutMode === 'cash' ? 'Via proxy agent' : null,
        reason: `[Agent proxy: ${user.id}] ${reason.trim()}`,
      } as any);
      if (error) throw error;

      // Pre-deduct wallet via ledger
      const { data: newRow } = await supabase
        .from('withdrawal_requests')
        .select('id')
        .eq('user_id', funderId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (newRow) {
        await supabase.from('general_ledger').insert({
          user_id: funderId,
          amount,
          direction: 'cash_out',
          category: 'withdrawal_pending',
          description: `Proxy withdrawal by agent ${user.id} – funds held pending approval`,
          currency: 'UGX',
          transaction_group_id: `wallet-withdraw-${newRow.id}`,
          source_table: 'withdrawal_requests',
          source_id: newRow.id,
          ledger_scope: 'platform',
        } as any);
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action_type: 'proxy_withdrawal_request',
        table_name: 'withdrawal_requests',
        record_id: newRow?.id || funderId,
        metadata: {
          funder_id: funderId,
          funder_name: funderName,
          amount,
          payout_method: payoutMode,
          reason: reason.trim(),
        },
      } as any);

      toast.success('Withdrawal request submitted', {
        description: `${formatUGX(amount)} withdrawal for ${funderName} is pending approval`,
          currency: 'UGX',
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error('Failed to submit', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Withdraw for {funderName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Balance */}
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Available Balance</p>
            <p className="text-lg font-bold">{formatUGX(walletBalance)}</p>
          </div>

          {walletBalance < 500 && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Insufficient balance for withdrawal
            </div>
          )}

          {/* Amount */}
          <div>
            <Label className="text-xs">Amount (UGX) *</Label>
            <Input
              type="number"
              placeholder="e.g. 50000"
              value={amount || ''}
              onChange={e => setAmount(Number(e.target.value))}
              min={500}
              max={walletBalance}
            />
            {amount > walletBalance && (
              <p className="text-[10px] text-destructive mt-1">Exceeds available balance</p>
            )}
          </div>

          {/* Payout method */}
          <div>
            <Label className="text-xs">Payout Method *</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {PAYOUT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPayoutMode(opt.value)}
                  className={`rounded-lg border p-2.5 text-center text-xs transition-all ${
                    payoutMode === opt.value
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <span className="text-lg block">{opt.icon}</span>
                  <span className="font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* MoMo details */}
          {isMomo && (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Recipient Name *</Label>
                <Input
                  placeholder="e.g. John Mukasa"
                  value={momoName}
                  onChange={e => setMomoName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div>
                <Label className="text-xs">Phone Number *</Label>
                <Input
                  placeholder="e.g. 0772123456"
                  value={momoNumber}
                  onChange={e => setMomoNumber(e.target.value)}
                  type="tel"
                  maxLength={15}
                />
                {momoNumber && !ugandaPhoneRegex.test(momoNumber.trim()) && (
                  <p className="text-[10px] text-destructive mt-1">Invalid Uganda phone format</p>
                )}
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <Label className="text-xs">Reason (min 10 chars) *</Label>
            <Textarea
              placeholder="e.g. Funder requested cash withdrawal for personal needs"
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={500}
              rows={2}
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">{reason.length}/500</p>
          </div>

          <div className="rounded-lg bg-warning/10 p-2.5 text-[10px] text-warning">
            ⚠️ This withdrawal is submitted on behalf of <strong>{funderName}</strong> and will be audited.
            It requires approval before processing.
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!isValid || loading || walletBalance < 500}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Request Withdrawal – {formatUGX(amount || 0)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
