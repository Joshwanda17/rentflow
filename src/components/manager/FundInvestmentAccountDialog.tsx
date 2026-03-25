import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ArrowRightLeft, Wallet, AlertTriangle } from 'lucide-react';
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
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);

  // Fetch partner wallet balance when dialog opens
  const fetchWalletBalance = async () => {
    if (!account) return;
    const partnerId = account.investor_id || account.agent_id;
    setLoadingWallet(true);
    const { data } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', partnerId)
      .single();
    setWalletBalance(data?.balance ?? 0);
    setLoadingWallet(false);
  };

  // Fetch on open
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && account) {
      fetchWalletBalance();
      setAmount('');
      setNotes('');
    }
    onOpenChange(isOpen);
  };

  const handleTopUp = async () => {
    if (!account || !amount) return;
    const topUpAmount = parseFloat(amount);
    if (isNaN(topUpAmount) || topUpAmount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (topUpAmount < 1000) {
      toast({ title: 'Minimum top-up is UGX 1,000', variant: 'destructive' });
      return;
    }
    if (notes.trim().length < 10) {
      toast({ title: 'Please add a reason (min 10 characters)', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manager-portfolio-topup', {
        body: {
          portfolio_id: account.id,
          amount: topUpAmount,
          notes: notes.trim(),
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast({
        title: `${formatUGX(topUpAmount)} deducted — pending until maturity`,
        description: `Deposit secured for ${account.account_name || account.portfolio_code}. Will be added at portfolio maturity.`,
      });
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

  const parsedAmount = parseFloat(amount) || 0;
  const insufficientFunds = walletBalance !== null && parsedAmount > walletBalance;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            Wallet → Portfolio Top-Up
          </DialogTitle>
        </DialogHeader>

        {account && (
          <div className="space-y-4 py-2">
            {/* Partner wallet balance */}
            <div className="rounded-lg border border-border p-3 bg-muted/30 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Partner Wallet</p>
                <p className="text-sm font-semibold text-foreground">{account.investor_name || 'Partner'}</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                  {loadingWallet ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="font-bold text-sm text-foreground">{formatUGX(walletBalance ?? 0)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Portfolio info */}
            <div className="rounded-lg border border-primary/20 p-3 bg-primary/5">
              <p className="text-sm font-semibold text-foreground">{account.account_name || account.portfolio_code}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Current Capital: {formatUGX(account.investment_amount)}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Top-Up Amount (UGX)</Label>
              <Input
                type="number"
                min={1000}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 5000000"
                className="h-9"
                autoFocus
              />
              {insufficientFunds && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Exceeds partner's wallet balance
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Reason (required, min 10 chars)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for this wallet-to-portfolio transfer" className="h-9" />
            </div>

            {parsedAmount > 0 && !insufficientFunds && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Wallet after</span>
                  <span className="font-medium text-foreground">{formatUGX((walletBalance ?? 0) - parsedAmount)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>⏳ Pending until maturity</span>
                  <span className="font-bold text-amber-600">{formatUGX(parsedAmount)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Funds will be deducted now but added to portfolio capital at maturity.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleTopUp}
            disabled={saving || !amount || parsedAmount <= 0 || parsedAmount < 1000 || insufficientFunds || notes.trim().length < 10}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Confirm Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
