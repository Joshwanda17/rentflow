import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, DollarSign, Wallet } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useConfetti } from '@/components/Confetti';

interface FundInvestmentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: {
    id: string;
    name: string;
    balance: number;
    user_id: string;
    user_name?: string;
  } | null;
  onSuccess: () => void;
}

export function FundInvestmentAccountDialog({
  open,
  onOpenChange,
  account,
  onSuccess
}: FundInvestmentAccountDialogProps) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();

  const handleFund = async () => {
    if (!account || !amount) return;
    
    const fundAmount = parseFloat(amount);
    if (isNaN(fundAmount) || fundAmount <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Get fresh account balance to prevent race conditions
      const { data: freshAccount, error: fetchError } = await supabase
        .from('investment_accounts')
        .select('balance')
        .eq('id', account.id)
        .single();

      if (fetchError || !freshAccount) {
        throw new Error('Failed to fetch account');
      }

      // Update investment account balance with optimistic lock
      const newBalance = freshAccount.balance + fundAmount;
      const { data: updatedAccount, error: updateError } = await supabase
        .from('investment_accounts')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', account.id)
        .eq('balance', freshAccount.balance) // Only update if balance unchanged
        .select()
        .maybeSingle();

      if (updateError) throw updateError;
      if (!updatedAccount) {
        throw new Error('Transaction conflict. Please try again.');
      }

      // Log the transaction
      await supabase.from('investment_transactions').insert({
        account_id: account.id,
        user_id: account.user_id,
        transaction_type: 'top_up',
        amount: fundAmount,
        balance_before: freshAccount.balance,
        balance_after: newBalance,
        description: notes || 'Manager top-up',
        performed_by: user?.id,
        transaction_date: new Date().toISOString()
      });

      // Log to audit
      await supabase.from('audit_logs').insert({
        record_id: account.id,
        table_name: 'investment_accounts',
        action_type: 'fund',
        performed_by: user?.id,
        old_values: { balance: freshAccount.balance },
        new_values: { balance: updatedAccount.balance },
        reason: notes || `Manager added ${formatUGX(fundAmount)} to account`
      });

      // Notify all managers about this funding
      const { data: managers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'manager')
        .eq('enabled', true);

      if (managers) {
        const notifications = managers.map(m => ({
          user_id: m.user_id,
          title: '💰 Investment Account Funded',
          message: `${formatUGX(fundAmount)} was added to "${account.name}" (${account.user_name}). New balance: ${formatUGX(newBalance)}`,
          type: 'investment_funding',
          metadata: { account_id: account.id, amount: fundAmount, new_balance: newBalance }
        }));
        
        await supabase.from('notifications').insert(notifications);
      }

      // Notify the supporter
      await supabase.from('notifications').insert({
        user_id: account.user_id,
        title: '💰 Account Funded!',
        message: `${formatUGX(fundAmount)} has been added to your investment account "${account.name}". New balance: ${formatUGX(newBalance)}`,
        type: 'success',
        metadata: { account_id: account.id, amount: fundAmount, new_balance: newBalance }
      });

      fireSuccess();
      toast({ title: '💰 Account Funded!', description: `${formatUGX(fundAmount)} added successfully` });
      
      setAmount('');
      setNotes('');
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-success" />
            Fund Investment Account
          </DialogTitle>
        </DialogHeader>

        {account && (
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-xl bg-primary/5 border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-sm text-muted-foreground">{account.user_name}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm text-muted-foreground">Current Balance</p>
                <p className="text-xl font-bold text-primary">{formatUGX(account.balance)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount to Add (UGX)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="e.g., 500000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
              />
              {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
                <p className="text-sm text-success">
                  New balance will be: {formatUGX(account.balance + parseFloat(amount))}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Reason for funding..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleFund} 
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="bg-success hover:bg-success/90 gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Funding...
              </>
            ) : (
              <>
                <DollarSign className="h-4 w-4" />
                Fund Account
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
