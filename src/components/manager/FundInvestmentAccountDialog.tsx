import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Banknote, Clock, CheckCircle2, Wallet, UserCheck } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

type WalletSource = 'partner_wallet' | 'proxy_agent_wallet';

interface ProxyAgent {
  agent_id: string;
  agent_name: string;
  agent_balance: number;
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
  const [walletSource, setWalletSource] = useState<WalletSource>('partner_wallet');
  const [saving, setSaving] = useState(false);
  const [partnerWalletBalance, setPartnerWalletBalance] = useState<number | null>(null);
  const [proxyAgent, setProxyAgent] = useState<ProxyAgent | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch partner wallet balance and proxy agent info when dialog opens
  useEffect(() => {
    if (!open || !account) {
      setPartnerWalletBalance(null);
      setProxyAgent(null);
      return;
    }
    const partnerId = account.investor_id || account.agent_id;
    if (!partnerId) return;

    setLoading(true);
    const fetchData = async () => {
      try {
        // Fetch partner wallet and proxy agent in parallel
        const [walletRes, proxyRes] = await Promise.all([
          supabase.from('wallets').select('balance').eq('user_id', partnerId).maybeSingle(),
          supabase.from('proxy_agent_assignments')
            .select('agent_id, agent:agent_id(full_name)')
            .eq('beneficiary_id', partnerId)
            .eq('is_active', true)
            .maybeSingle(),
        ]);

        setPartnerWalletBalance(walletRes.data ? Number(walletRes.data.balance) : 0);

        if (proxyRes.data) {
          // Fetch proxy agent wallet balance
          const { data: agentWallet } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', proxyRes.data.agent_id)
            .maybeSingle();

          setProxyAgent({
            agent_id: proxyRes.data.agent_id,
            agent_name: (proxyRes.data as any).agent?.full_name || 'Proxy Agent',
            agent_balance: agentWallet ? Number(agentWallet.balance) : 0,
          });
        } else {
          setProxyAgent(null);
        }
      } catch {
        setPartnerWalletBalance(0);
        setProxyAgent(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [open, account]);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setAmount('');
      setNotes('');
      setWalletSource('partner_wallet');
    }
    onOpenChange(isOpen);
  };

  const activeBalance = walletSource === 'proxy_agent_wallet' && proxyAgent
    ? proxyAgent.agent_balance
    : partnerWalletBalance ?? 0;

  const parsedAmount = parseFloat(amount) || 0;
  const insufficientBalance = parsedAmount > activeBalance;

  const handleSubmit = async () => {
    if (!account || !amount) return;
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (parsedAmount < 1000) {
      toast({ title: 'Minimum top-up is UGX 1,000', variant: 'destructive' });
      return;
    }
    if (notes.trim().length < 10) {
      toast({ title: 'Please add a reason (min 10 characters)', variant: 'destructive' });
      return;
    }
    if (insufficientBalance) {
      toast({ title: 'Insufficient wallet balance', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('manager-portfolio-topup', {
        body: {
          portfolio_id: account.id,
          amount: parsedAmount,
          notes: notes.trim(),
          payment_method: 'wallet',
          wallet_source: walletSource,
          proxy_agent_id: walletSource === 'proxy_agent_wallet' ? proxyAgent?.agent_id : undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const sourceLabel = walletSource === 'proxy_agent_wallet'
        ? `from proxy agent (${proxyAgent?.agent_name})`
        : 'from partner wallet';

      toast({
        title: `${formatUGX(parsedAmount)} top-up submitted`,
        description: `${sourceLabel} — pending verification for ${account.account_name || account.portfolio_code}.`,
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

  const canSubmit = !saving && parsedAmount >= 1000 && notes.trim().length >= 10 && !insufficientBalance;

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

            {/* Wallet source selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">Fund From</Label>
              <div className={cn("grid gap-2", proxyAgent ? "grid-cols-2" : "grid-cols-1")}>
                {/* Partner Wallet option */}
                <button
                  type="button"
                  onClick={() => setWalletSource('partner_wallet')}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all text-center",
                    walletSource === 'partner_wallet'
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-background hover:border-muted-foreground/30"
                  )}
                >
                  <Wallet className={cn("h-5 w-5", walletSource === 'partner_wallet' ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-xs font-medium", walletSource === 'partner_wallet' ? "text-primary" : "text-muted-foreground")}>
                    Partner Wallet
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {loading ? '...' : formatUGX(partnerWalletBalance ?? 0)}
                  </span>
                </button>

                {/* Proxy Agent option — only if partner has one */}
                {proxyAgent && (
                  <button
                    type="button"
                    onClick={() => setWalletSource('proxy_agent_wallet')}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all text-center",
                      walletSource === 'proxy_agent_wallet'
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-background hover:border-muted-foreground/30"
                    )}
                  >
                    <UserCheck className={cn("h-5 w-5", walletSource === 'proxy_agent_wallet' ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-xs font-medium", walletSource === 'proxy_agent_wallet' ? "text-primary" : "text-muted-foreground")}>
                      Proxy Agent
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate max-w-full">
                      {proxyAgent.agent_name} · {loading ? '...' : formatUGX(proxyAgent.agent_balance)}
                    </span>
                  </button>
                )}
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
              {insufficientBalance && parsedAmount > 0 && (
                <p className="text-[10px] text-destructive font-medium">
                  Insufficient balance ({formatUGX(activeBalance)} available)
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (required, min 10 chars)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for this portfolio top-up" className="h-9" />
            </div>

            {/* Preview */}
            {parsedAmount >= 1000 && !insufficientBalance && (
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
                  <span>Source</span>
                  <span className="font-medium text-foreground">
                    {walletSource === 'proxy_agent_wallet' ? `Proxy: ${proxyAgent?.agent_name}` : 'Partner Wallet'}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Balance after</span>
                  <span className="font-medium text-foreground">{formatUGX(activeBalance - parsedAmount)}</span>
                </div>
                <div className="flex items-start gap-1.5 pt-1 border-t border-border/50">
                  <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <p className="text-[10px] text-muted-foreground">
                    Funds will be deducted from {walletSource === 'proxy_agent_wallet' ? 'proxy agent' : 'partner'} wallet and parked until next ROI cycle.
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
