import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidateOpsWallet } from '@/hooks/ops/useOpsDataLayer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Plus, Minus, Wallet, Landmark, Banknote } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useAuth } from '@/hooks/useAuth';
import { extractFromErrorObject } from '@/lib/extractEdgeFunctionError';

interface AddBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  currentBalance: number;
  onSuccess?: () => void;
}

type AdjustmentType = 'credit' | 'debit';
// Which bucket of the user's wallet the money moves in/out of.
// 'withdrawable' = the user's own money (they can cash it out).
// 'float' = company-controlled operational float (e.g. agent rent-collection float).
type WalletBucket = 'withdrawable' | 'float';

export default function AddBalanceDialog({
  open,
  onOpenChange,
  userId,
  userName,
  currentBalance,
  onSuccess
}: AddBalanceDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<AdjustmentType>('credit');
  const [bucket, setBucket] = useState<WalletBucket>('withdrawable');
  const [bucketBalances, setBucketBalances] = useState<{ withdrawable: number; float: number }>({ withdrawable: 0, float: 0 });

  // Bucket-specific balances so the debit check and preview reflect the
  // actual bucket being touched, not the wallet's combined total.
  useEffect(() => {
    if (!open) return;
    supabase
      .from('wallets')
      .select('withdrawable_balance, float_balance')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setBucketBalances({
          withdrawable: Number(data?.withdrawable_balance ?? 0),
          float: Number(data?.float_balance ?? 0),
        });
      });
  }, [open, userId]);

  const selectedBucketBalance = bucket === 'float' ? bucketBalances.float : bucketBalances.withdrawable;

  const handleAdjustBalance = async () => {
    const amountNum = parseFloat(amount);

    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!reason.trim()) {
      toast.error('A reason is required for every adjustment');
      return;
    }

    if (type === 'debit' && amountNum > selectedBucketBalance) {
      toast.error(`Cannot debit more than the ${bucket} balance (${formatUGX(selectedBucketBalance)})`);
      return;
    }

    setLoading(true);

    try {
      // Get or create wallet
      let { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('user_id', userId)
        .maybeSingle();

      if (walletError) throw walletError;

      if (!wallet) {
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          // `wallets` is now a view backed by an INSTEAD OF trigger that routes
          // INSERTs to wallets_physical. Generated types mark views read-only,
          // so cast through `any` to keep the (still-functional) write.
          .insert({ user_id: userId, balance: 0 } as any)
          .select('id, balance')
          .single();
        if (createError) throw createError;
        wallet = newWallet;
      }

      // Generate reference ID: WBA + YYMMDD + random 4 digits
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const seq = String(Math.floor(1000 + Math.random() * 9000));
      const referenceId = `WBA${yy}${mm}${dd}${seq}`;

      // Queue for manager approval instead of direct wallet update.
      // `account` carries the CTO's explicit bucket choice (withdrawable vs
      // float) through to approve-wallet-operation, which stamps it onto the
      // ledger leg's recipient_type/wallet_bucket — the same mechanism the
      // CFO Direct Credit tool uses (Wallet Routing v2).
      const { error: queueError } = await supabase.from('pending_wallet_operations').insert({
        user_id: userId,
        amount: amountNum,
        direction: type === 'credit' ? 'cash_in' : 'cash_out',
        category: type === 'credit' ? 'manager_credit' : 'manager_debit',
        source_table: 'wallets',
        source_id: wallet.id,
        description: `Manager adjustment (${type}, ${bucket}): ${reason.trim()}`,
        reference_id: referenceId,
        linked_party: user?.email || 'Manager',
        account: bucket,
        status: 'pending',
      });

      if (queueError) throw queueError;

      // Log to audit_logs for manager edit tracking
      await supabase.from('audit_logs').insert({
        action_type: 'manager_fund_edit',
        user_id: user.id,
        record_id: userId,
        table_name: 'wallets',
        metadata: {
          target_user_name: userName,
          adjustment_type: type,
          wallet_bucket: bucket,
          amount: amountNum,
          reason: reason.trim(),
          previous_balance: currentBalance,
          previous_bucket_balance: selectedBucketBalance,
          reference_id: referenceId,
          manager_email: user.email,
        },
      });

      toast.success(`Balance adjustment queued for approval (${formatUGX(amountNum)} ${type} · ${bucket})`);
      // Ensure every consumer of the shared wallet cache refreshes once the
      // adjustment is approved and applied. Also invalidate now so pending-op
      // banners re-hydrate immediately.
      invalidateOpsWallet(qc, userId);
      setAmount('');
      setReason('');
      setType('credit');
      setBucket('withdrawable');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error adjusting balance:', error);
      toast.error('Failed to adjust balance. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = [5000, 10000, 50000, 100000];
  const previewBalance = amount && parseFloat(amount) > 0
    ? type === 'credit'
      ? selectedBucketBalance + parseFloat(amount)
      : Math.max(0, selectedBucketBalance - parseFloat(amount))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Adjust Balance
          </DialogTitle>
          <DialogDescription>
            Credit or debit <strong>{userName}</strong>'s wallet.
            Withdrawable: <strong>{formatUGX(bucketBalances.withdrawable)}</strong> · Float: <strong>{formatUGX(bucketBalances.float)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Credit / Debit Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === 'credit' ? 'default' : 'outline'}
              className={`h-14 text-base font-bold gap-2 ${type === 'credit' ? 'bg-success hover:bg-success/90 text-white' : ''}`}
              onClick={() => setType('credit')}
            >
              <Plus className="h-5 w-5" />
              Credit
            </Button>
            <Button
              type="button"
              variant={type === 'debit' ? 'default' : 'outline'}
              className={`h-14 text-base font-bold gap-2 ${type === 'debit' ? 'bg-destructive hover:bg-destructive/90 text-white' : ''}`}
              onClick={() => setType('debit')}
            >
              <Minus className="h-5 w-5" />
              Debit
            </Button>
          </div>

          {/* Bucket Toggle — which pool of the wallet this touches */}
          <div className="space-y-2">
            <Label>Bucket</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={bucket === 'withdrawable' ? 'default' : 'outline'}
                className="h-14 text-sm font-semibold gap-2 flex-col"
                onClick={() => setBucket('withdrawable')}
              >
                <Banknote className="h-4 w-4" />
                Withdrawable
                <span className="text-[10px] font-normal opacity-80">User-owned</span>
              </Button>
              <Button
                type="button"
                variant={bucket === 'float' ? 'default' : 'outline'}
                className="h-14 text-sm font-semibold gap-2 flex-col"
                onClick={() => setBucket('float')}
              >
                <Landmark className="h-4 w-4" />
                Float
                <span className="text-[10px] font-normal opacity-80">Operational</span>
              </Button>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (UGX)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '' || (Number(val) >= 0 && !isNaN(Number(val)))) {
                  setAmount(val);
                }
              }}
              min={1}
              className="h-12 text-lg font-semibold"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {quickAmounts.map((q) => (
              <Button
                key={q}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount(q.toString())}
                className="flex-1 min-w-[70px]"
              >
                {formatUGX(q)}
              </Button>
            ))}
          </div>

          {/* Reason — required */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Why are you adjusting this balance? (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          {/* Preview */}
          {previewBalance !== null && (
            <div className={`p-3 rounded-lg border ${type === 'credit' ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'}`}>
              <p className="text-sm text-muted-foreground">New {bucket} balance will be:</p>
              <p className={`text-lg font-bold ${type === 'credit' ? 'text-success' : 'text-destructive'}`}>
                {formatUGX(previewBalance)}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdjustBalance}
            disabled={loading || !amount || parseFloat(amount) <= 0 || !reason.trim()}
            className={`gap-2 ${type === 'debit' ? 'bg-destructive hover:bg-destructive/90' : ''}`}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : type === 'credit' ? (
              <Plus className="h-4 w-4" />
            ) : (
              <Minus className="h-4 w-4" />
            )}
            {type === 'credit' ? 'Credit' : 'Debit'} Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
