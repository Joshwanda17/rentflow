import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Loader2, Plus, Minus, Wallet } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useAuth } from '@/hooks/useAuth';

interface AddBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  currentBalance: number;
  onSuccess?: () => void;
}

type AdjustmentType = 'credit' | 'debit';

export default function AddBalanceDialog({
  open,
  onOpenChange,
  userId,
  userName,
  currentBalance,
  onSuccess
}: AddBalanceDialogProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<AdjustmentType>('credit');

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

    if (type === 'debit' && amountNum > currentBalance) {
      toast.error(`Cannot debit more than the current balance (${formatUGX(currentBalance)})`);
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
          .insert({ user_id: userId, balance: 0 })
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

      // Queue for manager approval instead of direct wallet update
      const { error: queueError } = await supabase.from('pending_wallet_operations').insert({
        user_id: userId,
        amount: amountNum,
        direction: type === 'credit' ? 'cash_in' : 'cash_out',
        category: type === 'credit' ? 'manager_credit' : 'manager_debit',
        source_table: 'wallets',
        source_id: wallet.id,
        description: `Manager adjustment (${type}): ${reason.trim()}`,
        reference_id: referenceId,
        linked_party: user?.email || 'Manager',
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
          amount: amountNum,
          reason: reason.trim(),
          previous_balance: currentBalance,
          reference_id: referenceId,
          manager_email: user.email,
        },
      });

      toast.success(`Balance adjustment queued for approval (${formatUGX(amountNum)} ${type})`);
      setAmount('');
      setReason('');
      setType('credit');
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
      ? currentBalance + parseFloat(amount)
      : Math.max(0, currentBalance - parseFloat(amount))
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
            Current balance: <strong>{formatUGX(currentBalance)}</strong>
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
              <p className="text-sm text-muted-foreground">New balance will be:</p>
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
