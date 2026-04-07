import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Banknote, Smartphone, Building2, Clock, CheckCircle2, Wallet } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'wallet';

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Banknote; description: string }[] = [
  { value: 'wallet', label: 'Wallet', icon: Wallet, description: 'From partner wallet' },
  { value: 'cash', label: 'Cash', icon: Banknote, description: 'Physical cash deposit' },
  { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone, description: 'MTN / Airtel MoMo' },
  { value: 'bank', label: 'Bank', icon: Building2, description: 'Bank transfer' },
];

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
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [transactionReference, setTransactionReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [partnerWalletBalance, setPartnerWalletBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Fetch partner wallet balance when dialog opens or account changes
  useEffect(() => {
    if (!open || !account) { setPartnerWalletBalance(null); return; }
    const partnerId = account.investor_id || account.agent_id;
    if (!partnerId) return;
    setLoadingBalance(true);
    const fetchBalance = async () => {
      try {
        const { data } = await supabase.from('wallets').select('balance').eq('user_id', partnerId).maybeSingle();
        setPartnerWalletBalance(data ? Number(data.balance) : 0);
      } catch {
        setPartnerWalletBalance(0);
      } finally {
        setLoadingBalance(false);
      }
    };
    fetchBalance();
  }, [open, account]);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setAmount('');
      setNotes('');
      setPaymentMethod('cash');
      setTransactionReference('');
    }
    onOpenChange(isOpen);
  };

  const isRefValid = () => {
    if (paymentMethod === 'cash' || paymentMethod === 'wallet') return true;
    if (paymentMethod === 'mobile_money') return transactionReference.trim().length >= 8;
    if (paymentMethod === 'bank') return transactionReference.trim().length >= 6;
    return false;
  };

  const walletInsufficient = paymentMethod === 'wallet' && partnerWalletBalance !== null && (parseFloat(amount) || 0) > partnerWalletBalance;

  const handleSubmit = async () => {
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
    if (!isRefValid()) {
      toast({
        title: paymentMethod === 'mobile_money' ? 'TID must be at least 8 characters' : 'Bank reference must be at least 6 characters',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manager-portfolio-topup', {
        body: {
          portfolio_id: account.id,
          amount: topUpAmount,
          notes: notes.trim(),
          payment_method: paymentMethod,
          transaction_reference: paymentMethod !== 'cash' ? transactionReference.trim() : null,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast({
        title: `${formatUGX(topUpAmount)} top-up submitted`,
        description: `Pending verification for ${account.account_name || account.portfolio_code}.`,
      });
      setAmount('');
      setNotes('');
      setTransactionReference('');
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Top-up failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const parsedAmount = parseFloat(amount) || 0;
  const canSubmit = !saving && parsedAmount >= 1000 && notes.trim().length >= 10 && isRefValid() && !walletInsufficient;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" />
            Portfolio Top-Up
          </DialogTitle>
        </DialogHeader>

        {account && (
          <div className="space-y-4 py-2">
            {/* Portfolio info */}
            <div className="rounded-lg border border-primary/20 p-3 bg-primary/5">
              <p className="text-sm font-semibold text-foreground">{account.account_name || account.portfolio_code}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {account.investor_name && <span className="font-medium">{account.investor_name} · </span>}
                Current Capital: {formatUGX(account.investment_amount)}
              </p>
            </div>

            {/* Payment method selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const selected = paymentMethod === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setPaymentMethod(opt.value); setTransactionReference(''); }}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 p-2.5 transition-all text-center",
                        selected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-background hover:border-muted-foreground/30"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("text-[10px] font-medium", selected ? "text-primary" : "text-muted-foreground")}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              {paymentMethod === 'wallet' && (
                <div className="mt-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Partner Wallet Balance</span>
                  <span className="text-sm font-bold text-foreground">
                    {loadingBalance ? '...' : partnerWalletBalance !== null ? formatUGX(partnerWalletBalance) : '—'}
                  </span>
                </div>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (UGX)</Label>
              <Input
                type="number"
                min={1000}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 5,000,000"
                className="h-9"
                autoFocus
              />
              {walletInsufficient && (
                <p className="text-[10px] text-destructive font-medium">
                  Insufficient wallet balance ({formatUGX(partnerWalletBalance || 0)} available)
                </p>
              )}
            </div>

            {/* Conditional reference field */}
            {paymentMethod === 'mobile_money' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Transaction ID (TID)</Label>
                <Input
                  value={transactionReference}
                  onChange={e => setTransactionReference(e.target.value.toUpperCase())}
                  placeholder="e.g. 12345678ABCD"
                  className="h-9 font-mono tracking-wider"
                  maxLength={30}
                />
                <p className="text-[10px] text-muted-foreground">Enter the MoMo transaction ID (min 8 characters)</p>
              </div>
            )}

            {paymentMethod === 'bank' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Bank Reference</Label>
                <Input
                  value={transactionReference}
                  onChange={e => setTransactionReference(e.target.value.toUpperCase())}
                  placeholder="e.g. REF-2025-001234"
                  className="h-9 font-mono tracking-wider"
                  maxLength={50}
                />
                <p className="text-[10px] text-muted-foreground">Enter the bank transfer reference (min 6 characters)</p>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (required, min 10 chars)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for this portfolio top-up" className="h-9" />
            </div>

            {/* Preview */}
            {parsedAmount >= 1000 && isRefValid() && (
              <div className="rounded-lg bg-accent/50 border border-accent p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  Pending Verification
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Top-up amount</span>
                  <span className="font-bold text-foreground">{formatUGX(parsedAmount)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Method</span>
                  <span className="font-medium text-foreground capitalize">
                    {paymentMethod === 'mobile_money' ? 'Mobile Money' : paymentMethod === 'bank' ? 'Bank Transfer' : 'Cash'}
                  </span>
                </div>
                {transactionReference && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{paymentMethod === 'mobile_money' ? 'TID' : 'Reference'}</span>
                    <span className="font-mono text-foreground">{transactionReference}</span>
                  </div>
                )}
                <div className="flex items-start gap-1.5 pt-1 border-t border-border/50">
                  <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <p className="text-[10px] text-muted-foreground">
                    Funds will be verified and added to portfolio capital upon confirmation.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Submit Top-Up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
