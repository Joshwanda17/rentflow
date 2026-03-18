import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, PlusCircle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

interface FundInvestmentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: {
    id: string;
    portfolio_code: string;
    account_name: string | null;
    investment_amount: number;
    investor_id: string | null;
    agent_id: string;
    investor_name?: string;
  } | null;
  onSuccess: () => void;
}

export function FundInvestmentAccountDialog({ open, onOpenChange, account, onSuccess }: FundInvestmentAccountDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleTopUp = async () => {
    if (!account || !amount) return;
    const topUpAmount = parseFloat(amount);
    if (isNaN(topUpAmount) || topUpAmount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const newTotal = account.investment_amount + topUpAmount;

      const { error } = await supabase.from('investor_portfolios')
        .update({ investment_amount: newTotal })
        .eq('id', account.id);
      if (error) throw error;

      // Double-entry ledger: record the top-up
      const groupId = crypto.randomUUID();
      const userId = account.investor_id || account.agent_id;

      await supabase.from('general_ledger').insert([
        {
          user_id: userId,
          amount: topUpAmount,
          direction: 'cash_in',
          category: 'investment_topup',
          source_table: 'investor_portfolios',
          source_id: account.id,
          description: `Top-up: ${account.account_name || account.portfolio_code}`,
          ledger_scope: 'platform',
          transaction_group_id: groupId,
          transaction_date: new Date().toISOString(),
        },
        {
          user_id: null,
          amount: topUpAmount,
          direction: 'cash_out',
          category: 'investment_topup',
          source_table: 'investor_portfolios',
          source_id: account.id,
          description: `Top-up to portfolio: ${account.portfolio_code}`,
          ledger_scope: 'platform',
          transaction_group_id: groupId,
          transaction_date: new Date().toISOString(),
        },
      ]);

      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'topup_portfolio',
        table_name: 'investor_portfolios',
        record_id: account.id,
        metadata: { amount: topUpAmount, new_total: newTotal, notes },
      });

      toast({ title: `${formatUGX(topUpAmount)} added to ${account.account_name || account.portfolio_code}` });
      setAmount('');
      setNotes('');
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Top-up failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-success" />
            Top Up Portfolio
          </DialogTitle>
        </DialogHeader>

        {account && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border p-3 bg-muted/30">
              <p className="text-sm font-semibold text-foreground">{account.account_name || account.portfolio_code}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Current: {formatUGX(account.investment_amount)}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Top-Up Amount (UGX)</Label>
              <Input
                type="number"
                min={1}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 5000000"
                className="h-9"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for top-up" className="h-9" />
            </div>

            {amount && parseFloat(amount) > 0 && (
              <div className="rounded-lg bg-success/10 border border-success/20 p-2.5 text-center">
                <p className="text-xs text-muted-foreground">New Total</p>
                <p className="text-lg font-bold text-success">{formatUGX(account.investment_amount + parseFloat(amount))}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleTopUp} disabled={saving || !amount || parseFloat(amount) <= 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Confirm Top-Up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
