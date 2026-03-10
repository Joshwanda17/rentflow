import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import { Loader2, HandCoins, Search, Wallet, CalendarDays, TrendingUp, CheckCircle2, Copy, Share2, MessageCircle, Link, Smartphone, UserPlus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateUserInviteDialog } from './CreateUserInviteDialog';

interface AgentInvestForPartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface PartnerOption {
  id: string;
  full_name: string;
  phone: string;
}

interface SuccessData {
  reference_id: string;
  partner_name: string;
  monthly_reward: number;
  first_payout_date: string;
  new_balance: number;
  payout_day: number;
  amount: number;
  activation_token: string | null;
  agent_name: string;
}

export function AgentInvestForPartnerDialog({ open, onOpenChange, onSuccess }: AgentInvestForPartnerDialogProps) {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedPartner, setSelectedPartner] = useState<PartnerOption | null>(null);
  const [amount, setAmount] = useState('');
  const [payoutDay, setPayoutDay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [totalRentRequested, setTotalRentRequested] = useState(0);
  const [agentBalance, setAgentBalance] = useState(0);
  const [success, setSuccess] = useState<SuccessData | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  const parsedAmount = Number(amount) || 0;
  const monthlyReward = Math.round(parsedAmount * 0.15);

  // Debounced search for partners using server-side function
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setPartners([]);
      return;
    }

    setLoadingPartners(true);
    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .rpc('search_supporters', {
            search_term: searchQuery.trim(),
            result_limit: 20,
          });

        if (error) throw error;
        setPartners(data?.map((p: any) => ({ id: p.id, full_name: p.full_name, phone: p.phone })) || []);
      } catch {
        toast.error('Failed to search partners');
        setPartners([]);
      } finally {
        setLoadingPartners(false);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    if (open) {
      fetchOpportunitySummary();
      fetchAgentBalance();
      setSelectedPartnerId('');
      setSelectedPartner(null);
      setAmount('');
      setPayoutDay('');
      setSuccess(null);
      setSearchQuery('');
      setShowConfirm(false);
      setPartners([]);
    }
  }, [open]);

  const fetchAgentBalance = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();
    if (data) setAgentBalance(data.balance);
  };

  const fetchOpportunitySummary = async () => {
    const { data } = await supabase
      .from('opportunity_summaries')
      .select('id, total_rent_requested')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setSummaryId(data.id);
      setTotalRentRequested(data.total_rent_requested);
    }
  };

  const selectedPartnerName = selectedPartner?.full_name || '';

  const handleConfirmOpen = () => {
    if (!selectedPartnerId || parsedAmount < 50000 || !payoutDay) {
      toast.error('Please fill all fields correctly');
      return;
    }
    const day = Number(payoutDay);
    if (day < 1 || day > 28) {
      toast.error('Payout day must be between 1 and 28');
      return;
    }
    if (parsedAmount > agentBalance) {
      toast.error('Amount exceeds your wallet balance');
      return;
    }
    if (totalRentRequested > 0 && parsedAmount > totalRentRequested) {
      toast.error('Amount exceeds current rent demand');
      return;
    }
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-invest-for-partner', {
        body: {
          partner_id: selectedPartnerId,
          amount: parsedAmount,
          summary_id: summaryId,
          payout_day: Number(payoutDay),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccess({
        reference_id: data.reference_id,
        partner_name: data.partner_name,
        monthly_reward: data.monthly_reward,
        first_payout_date: data.first_payout_date,
        new_balance: data.new_balance,
        payout_day: data.payout_day,
        amount: parsedAmount,
        activation_token: data.activation_token || null,
        agent_name: data.agent_name || 'Agent',
      });
      setAgentBalance(data.new_balance);
      toast.success('Investment completed successfully!');
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || 'Investment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const buildShareMessage = useCallback((s: SuccessData) => {
    const activationLink = s.activation_token
      ? `${getPublicOrigin()}/join?t=${s.activation_token}`
      : null;

    let msg = `🎉 Your Welile Investment is Ready!\n\nHi ${s.partner_name}, ${s.agent_name} has invested ${formatUGX(s.amount)} on your behalf into the Rent Management Pool.\n\n💰 Monthly Reward: ${formatUGX(s.monthly_reward)} (15%)\n📅 Payout Day: ${s.payout_day}${getOrdinal(s.payout_day)} of each month\n🗓️ First Payout: ${s.first_payout_date}`;

    if (activationLink) {
      msg += `\n\n👉 Activate your account to start receiving rewards:\n${activationLink}`;
    }

    msg += `\n\nRef: ${s.reference_id}`;
    return msg;
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!success) return;
    const msg = buildShareMessage(success);
    await navigator.clipboard.writeText(msg);
    toast.success('Copied to clipboard!');
  }, [success, buildShareMessage]);

  const handleWhatsApp = useCallback(() => {
    if (!success) return;
    const msg = buildShareMessage(success);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }, [success, buildShareMessage]);

  const handleSMS = useCallback(() => {
    if (!success) return;
    const msg = buildShareMessage(success);
    window.open(`sms:?body=${encodeURIComponent(msg)}`, '_self');
  }, [success, buildShareMessage]);

  const handleNativeShare = useCallback(async () => {
    if (!success) return;
    const msg = buildShareMessage(success);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Welile Investment', text: msg });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(msg);
      toast.success('Copied to clipboard!');
    }
  }, [success, buildShareMessage]);

  if (success) {
    const hasToken = !!success.activation_token;
    const activationLink = hasToken
      ? `${getPublicOrigin()}/join?t=${success.activation_token}`
      : null;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="font-bold text-lg">Investment Successful!</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Invested on behalf of <strong className="text-foreground">{success.partner_name}</strong></p>
              <p>Monthly reward: <strong className="text-success">{formatUGX(success.monthly_reward)}</strong></p>
              <p>First payout: <strong className="text-foreground">{success.first_payout_date}</strong></p>
              <p>Your new balance: <strong className="text-foreground">{formatUGX(success.new_balance)}</strong></p>
              <p className="font-mono text-xs">Ref: {success.reference_id}</p>
            </div>

            {/* Share Section */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-center gap-2 text-sm font-medium text-foreground">
                <Link className="h-4 w-4 text-primary" />
                {hasToken ? 'Share Activation Link' : 'Share Confirmation'}
              </div>

              {activationLink && (
                <div className="bg-muted/50 rounded-lg p-2 text-xs font-mono break-all text-muted-foreground">
                  {activationLink}
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyLink} className="flex-col h-auto py-2.5 gap-1">
                  <Copy className="h-4 w-4" />
                  <span className="text-[10px]">Copy</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleWhatsApp} className="flex-col h-auto py-2.5 gap-1 text-green-600 hover:text-green-700 border-green-200 hover:bg-green-50">
                  <MessageCircle className="h-4 w-4" />
                  <span className="text-[10px]">WhatsApp</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleSMS} className="flex-col h-auto py-2.5 gap-1 text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50">
                  <Smartphone className="h-4 w-4" />
                  <span className="text-[10px]">SMS</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleNativeShare} className="flex-col h-auto py-2.5 gap-1">
                  <Share2 className="h-4 w-4" />
                  <span className="text-[10px]">Share</span>
                </Button>
              </div>

              {/* Non-smartphone note */}
              {hasToken && (
                <div className="flex gap-2 p-3 rounded-lg bg-muted/50 border text-left">
                  <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    If your partner doesn't have a smartphone, you can open the activation link on any device and enter the temporary password on their behalf.
                  </p>
                </div>
              )}
            </div>

            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            Invest for Partner
          </DialogTitle>
          <DialogDescription>
            Fund the rent pool on behalf of a partner using your wallet balance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Agent Balance */}
          <div className="p-3 rounded-lg bg-muted/50 border flex items-center gap-3">
            <Wallet className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Your Balance</p>
              <p className="font-bold text-foreground">{formatUGX(agentBalance)}</p>
            </div>
          </div>

          {/* Partner Selection */}
          <div className="space-y-2">
            <Label>Select Partner</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {loadingPartners ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : searchQuery.trim().length < 2 ? (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">
                  {selectedPartner ? (
                    <span>Selected: <strong className="text-foreground">{selectedPartner.full_name}</strong></span>
                  ) : (
                    'Type at least 2 characters to search'
                  )}
                </p>
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-1">
                {partners.length === 0 ? (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      No partners match your search
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setShowRegister(true)}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Register Tenant Supporter Investment
                    </Button>
                  </div>
                ) : (
                  partners.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPartnerId(p.id);
                        setSelectedPartner(p);
                      }}
                      className={cn(
                        "w-full text-left p-2.5 rounded-lg transition-colors text-sm",
                        selectedPartnerId === p.id
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <p className="font-medium truncate">{p.full_name}</p>
                      <div className="flex items-center text-xs text-muted-foreground">
                        <span>{p.phone}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>Investment Amount (UGX)</Label>
            <Input
              type="number"
              placeholder="Min 50,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={50000}
            />
            {parsedAmount > agentBalance && (
              <p className="text-xs text-destructive">Exceeds your wallet balance</p>
            )}
            {totalRentRequested > 0 && (
              <p className="text-xs text-muted-foreground">
                Rent demand available: {formatUGX(totalRentRequested)}
              </p>
            )}
          </div>

          {/* Payout Day */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              Monthly Payout Day
            </Label>
            <select
              value={payoutDay}
              onChange={(e) => setPayoutDay(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select payout day...</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                <option key={day} value={day}>
                  {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of every month
                </option>
              ))}
            </select>
          </div>

          {/* Reward Preview */}
          {parsedAmount >= 50000 && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-success">
                <TrendingUp className="h-4 w-4" />
                15% Monthly Reward Preview
              </div>
              <p className="text-xs text-muted-foreground">
                Monthly: <strong className="text-foreground">{formatUGX(monthlyReward)}</strong> ×12 months = <strong className="text-foreground">{formatUGX(monthlyReward * 12)}</strong>
              </p>
            </div>
          )}

          <Button
            onClick={handleConfirmOpen}
            disabled={submitting || !selectedPartnerId || parsedAmount < 50000 || !payoutDay || parsedAmount > agentBalance}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <HandCoins className="h-4 w-4 mr-2" />
                Invest {parsedAmount >= 50000 ? formatUGX(parsedAmount) : ''} for Partner
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-primary" />
              Confirm Investment
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p className="text-sm text-muted-foreground">Please review the details before proceeding:</p>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Partner</span>
                    <span className="font-medium text-foreground">{selectedPartnerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold text-foreground">{formatUGX(parsedAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Commission (2%)</span>
                    <span className="font-medium text-success">{formatUGX(Math.round(parsedAmount * 0.02))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net deduction</span>
                    <span className="font-medium text-foreground">{formatUGX(parsedAmount - Math.round(parsedAmount * 0.02))}</span>
                  </div>
                  <hr className="border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monthly reward (15%)</span>
                    <span className="font-medium text-success">{formatUGX(monthlyReward)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payout day</span>
                    <span className="font-medium text-foreground">{payoutDay}th of each month</span>
                  </div>
                  <hr className="border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Your balance after</span>
                    <span className="font-bold text-foreground">{formatUGX(agentBalance - parsedAmount + Math.round(parsedAmount * 0.02))}</span>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} className="gap-2">
              <HandCoins className="h-4 w-4" />
              Confirm & Invest
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>

      <CreateUserInviteDialog
        open={showRegister}
        onOpenChange={setShowRegister}
        defaultRole="supporter"
        lockRole
        onSuccess={() => {
          setShowRegister(false);
          // New partner will appear when agent searches for them
        }}
      />
    </>
  );
}

function getOrdinal(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
