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
import { Loader2, Plus, Wallet } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface AddBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  currentBalance: number;
  onSuccess?: () => void;
}

export default function AddBalanceDialog({
  open,
  onOpenChange,
  userId,
  userName,
  currentBalance,
  onSuccess
}: AddBalanceDialogProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddBalance = async () => {
    const amountNum = parseFloat(amount);
    
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid amount');
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
        // Create wallet if doesn't exist
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert({ user_id: userId, balance: 0 })
          .select('id, balance')
          .single();

        if (createError) throw createError;
        wallet = newWallet;
      }

      // Update wallet balance
      const newBalance = wallet.balance + amountNum;
      const { error: updateError } = await supabase
        .from('wallets')
        .update({ 
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // Log the action in audit_logs
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.from('audit_logs').insert({
          action_type: 'balance_adjustment',
          table_name: 'wallets',
          record_id: wallet.id,
          performed_by: currentUser.id,
          reason: reason || 'Manager balance adjustment',
          old_values: { balance: wallet.balance },
          new_values: { balance: newBalance },
          metadata: { 
            target_user_id: userId,
            target_user_name: userName,
            amount_added: amountNum
          }
        });
      }

      toast.success(`Added ${formatUGX(amountNum)} to ${userName}'s wallet`);
      setAmount('');
      setReason('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error adding balance:', error);
      toast.error('Failed to add balance');
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = [5000, 10000, 50000, 100000];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Add Balance
          </DialogTitle>
          <DialogDescription>
            Add funds to <strong>{userName}</strong>'s wallet.
            Current balance: <strong>{formatUGX(currentBalance)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (UGX)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              className="h-12 text-lg font-semibold"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {quickAmounts.map((quickAmount) => (
              <Button
                key={quickAmount}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount(quickAmount.toString())}
                className="flex-1 min-w-[70px]"
              >
                {formatUGX(quickAmount)}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              placeholder="Why are you adding this balance?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          {amount && parseFloat(amount) > 0 && (
            <div className="p-3 bg-success/10 rounded-lg border border-success/30">
              <p className="text-sm text-muted-foreground">New balance will be:</p>
              <p className="text-lg font-bold text-success">
                {formatUGX(currentBalance + parseFloat(amount))}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleAddBalance} 
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add Balance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
