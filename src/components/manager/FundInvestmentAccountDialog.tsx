import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Wallet, Users, CheckCircle2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

type PaymentMethod = 'wallet' | 'proxy_agent';

interface ProxyAgentInfo {
  agentId: string;
  agentName: string;
  walletBalance: number;
}

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wallet');
  const [saving, setSaving] = useState(false);
  const [partnerWalletBalance, setPartnerWalletBalance] = useState<number | null>(null);
  const [proxyAgent, setProxyAgent] = useState<ProxyAgentInfo | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Fetch partner wallet balance AND proxy agent info when dialog opens
  useEffect(() => {
    if (!open || !account) {
      setPartnerWalletBalance(null);
      setProxyAgent(null);
      return;
    }
    const partnerId = account.investor_id || account.agent_id;
    if (!partnerId) return;
    setLoadingBalance(true);

    const fetchData = async () => {
      try {
        // Fetch partner wallet + proxy agent assignment in parallel
        const [walletRes, proxyRes] = await Promise.all([
          supabase.from('wallets').select('balance').eq('user_id', partnerId).maybeSingle(),
          supabase.from('proxy_agent_assignments')
            .select('agent_id')
            .eq('beneficiary_id', partnerId)
            .eq('is_active', true)
            .eq('approval_status', 'approved')
            .limit(1)
            .maybeSingle(),
        ]);

        setPartnerWalletBalance(walletRes.data ? Number(walletRes.data.balance) : 0);

        if (proxyRes.data?.agent_id) {
          // Fetch agent profile + wallet
          const [profileRes, agentWalletRes] = await Promise.all([
            supabase.from('profiles').select('full_name').eq('id', proxyRes.data.agent_id).single(),
            supabase.from('wallets').select('balance').eq('user_id', proxyRes.data.agent_id).maybeSingle(),
          ]);
          setProxyAgent({
            agentId: proxyRes.data.agent_id,
            agentName: profileRes.data?.full_name || 'Agent',
            walletBalance: agentWalletRes.data ? Number(agentWalletRes.data.balance) : 0,
          });
        } else {
          setProxyAgent(null);
        }
      } catch {
        setPartnerWalletBalance(0);
        setProxyAgent(null);
      } finally {
        setLoadingBalance(false);
      }
    };
    fetchData();
  }, [open, account]);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setAmount('');
      setNotes('');
      setPaymentMethod('wallet');
    }
    onOpenChange(isOpen);
  };

  const selectedBalance = paymentMethod === 'wallet' ? partnerWalletBalance : proxyAgent?.walletBalance ?? null;
  const parsedAmount = parseFloat(amount) || 0;
  const insufficient = selectedBalance !== null && parsedAmount > selectedBalance;

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
    if (paymentMethod === 'proxy_agent' && !proxyAgent) {
      toast({ title: 'No proxy agent assigned', variant: 'destructive' });
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
          source_wallet_user_id: paymentMethod === 'proxy_agent' ? proxyAgent?.agentId : undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast({
        title: `${formatUGX(topUpAmount)} top-up processed`,
        description: `Deducted from ${paymentMethod === 'wallet' ? 'partner wallet' : proxyAgent?.agentName + "'s wallet"}. Applied at maturity.`,
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

  const canSubmit = !saving && parsedAmount >= 1000 && notes.trim().length >= 10 && !insufficient &&
    (paymentMethod === 'wallet' || !!proxyAgent);

  const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Wallet; description: string; disabled?: boolean }[] = [
    { value: 'wallet', label: 'Wallet', icon: Wallet, description: 'Partner wallet' },
    { value: 'proxy_agent', label: 'Proxy Agent', icon: Users, description: proxyAgent ? proxyAgent.agentName : 'No agent assigned', disabled: !proxyAgent },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
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
              <Label className="text-xs">Funding Source</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const selected = paymentMethod === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => setPaymentMethod(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-all text-center",
                        opt.disabled
                          ? "border-border bg-muted/30 opacity-50 cursor-not-allowed"
                          : selected
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border bg-background hover:border-muted-foreground/30 cursor-pointer"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("text-xs font-medium", selected ? "text-primary" : "text-muted-foreground")}>{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                    </button>
                  );
                })}
              </div>

              {/* Balance display */}
              <div className="mt-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {paymentMethod === 'wallet' ? 'Partner Wallet Balance' : `${proxyAgent?.agentName || 'Agent'} Wallet`}
                </span>
                <span className="text-sm font-bold text-foreground">
                  {loadingBalance ? '...' : selectedBalance !== null ? formatUGX(selectedBalance) : '—'}
                </span>
              </div>
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
              {insufficient && (
                <p className="text-[10px] text-destructive font-medium">
                  Insufficient wallet balance ({formatUGX(selectedBalance || 0)} available)
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (required, min 10 chars)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for this portfolio top-up" className="h-9" />
            </div>

            {/* Preview */}
            {parsedAmount >= 1000 && notes.trim().length >= 10 && !insufficient && (
              <div className="rounded-lg bg-accent/50 border border-accent p-3 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Top-up amount</span>
                  <span className="font-bold text-foreground">{formatUGX(parsedAmount)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Source</span>
                  <span className="font-medium text-foreground">
                    {paymentMethod === 'wallet' ? 'Partner Wallet' : `${proxyAgent?.agentName} (Proxy Agent)`}
                  </span>
                </div>
                <div className="flex items-start gap-1.5 pt-1 border-t border-border/50">
                  <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <p className="text-[10px] text-muted-foreground">
                    Instant deduction — funds will be applied to portfolio capital at maturity.
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
