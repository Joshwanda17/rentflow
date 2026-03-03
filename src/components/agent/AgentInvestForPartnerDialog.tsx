import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { Loader2, HandCoins, Search, Wallet, CalendarDays, TrendingUp, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentInvestForPartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface PartnerOption {
  id: string;
  full_name: string;
  phone: string;
  balance: number;
}

export function AgentInvestForPartnerDialog({ open, onOpenChange, onSuccess }: AgentInvestForPartnerDialogProps) {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [amount, setAmount] = useState('');
  const [payoutDay, setPayoutDay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [totalRentRequested, setTotalRentRequested] = useState(0);
  const [success, setSuccess] = useState<{ reference_id: string; partner_name: string; monthly_reward: number; first_payout_date: string } | null>(null);

  const selectedPartner = useMemo(() => partners.find(p => p.id === selectedPartnerId), [partners, selectedPartnerId]);
  const parsedAmount = Number(amount) || 0;
  const monthlyReward = Math.round(parsedAmount * 0.15);

  useEffect(() => {
    if (open) {
      fetchPartners();
      fetchOpportunitySummary();
      setSelectedPartnerId('');
      setAmount('');
      setPayoutDay('');
      setSuccess(null);
      setSearchQuery('');
    }
  }, [open]);

  const fetchPartners = async () => {
    setLoadingPartners(true);
    try {
      // Get supporter user_ids
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'supporter');

      if (!roles || roles.length === 0) {
        setPartners([]);
        return;
      }

      const supporterIds = roles.map(r => r.user_id);

      // Get profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', supporterIds);

      // Get wallets
      const { data: wallets } = await supabase
        .from('wallets')
        .select('user_id, balance')
        .in('user_id', supporterIds);

      const walletMap = new Map(wallets?.map(w => [w.user_id, w.balance]) || []);

      setPartners(
        (profiles || []).map(p => ({
          id: p.id,
          full_name: p.full_name,
          phone: p.phone,
          balance: walletMap.get(p.id) ?? 0,
        }))
      );
    } catch {
      toast.error('Failed to load partners');
    } finally {
      setLoadingPartners(false);
    }
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

  const filteredPartners = useMemo(() => {
    if (!searchQuery.trim()) return partners;
    const q = searchQuery.toLowerCase();
    return partners.filter(p =>
      p.full_name.toLowerCase().includes(q) || p.phone.includes(q)
    );
  }, [partners, searchQuery]);

  const handleSubmit = async () => {
    if (!selectedPartnerId || parsedAmount < 50000 || !payoutDay) {
      toast.error('Please fill all fields correctly');
      return;
    }

    const day = Number(payoutDay);
    if (day < 1 || day > 28) {
      toast.error('Payout day must be between 1 and 28');
      return;
    }

    if (selectedPartner && parsedAmount > selectedPartner.balance) {
      toast.error('Amount exceeds partner wallet balance');
      return;
    }

    if (totalRentRequested > 0 && parsedAmount > totalRentRequested) {
      toast.error('Amount exceeds current rent demand');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-invest-for-partner', {
        body: {
          partner_id: selectedPartnerId,
          amount: parsedAmount,
          summary_id: summaryId,
          payout_day: day,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSuccess({
        reference_id: data.reference_id,
        partner_name: data.partner_name,
        monthly_reward: data.monthly_reward,
        first_payout_date: data.first_payout_date,
      });
      toast.success('Investment completed successfully!');
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message || 'Investment failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="font-bold text-lg">Investment Successful!</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Invested on behalf of <strong className="text-foreground">{success.partner_name}</strong></p>
              <p>Monthly reward: <strong className="text-success">{formatUGX(success.monthly_reward)}</strong></p>
              <p>First payout: <strong className="text-foreground">{success.first_payout_date}</strong></p>
              <p className="font-mono text-xs">Ref: {success.reference_id}</p>
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-emerald-600" />
            Invest for Partner
          </DialogTitle>
          <DialogDescription>
            Fund the rent pool on behalf of a partner/supporter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
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
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-1">
                {filteredPartners.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No partners found</p>
                ) : (
                  filteredPartners.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPartnerId(p.id)}
                      className={cn(
                        "w-full text-left p-2.5 rounded-lg transition-colors text-sm",
                        selectedPartnerId === p.id
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <p className="font-medium truncate">{p.full_name}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{p.phone}</span>
                        <span className="flex items-center gap-1">
                          <Wallet className="h-3 w-3" />
                          {formatUGX(p.balance)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected Partner Balance */}
          {selectedPartner && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
              <Wallet className="h-4 w-4 text-success" />
              <span className="text-sm">Partner Balance:</span>
              <span className="font-bold text-success ml-auto">{formatUGX(selectedPartner.balance)}</span>
            </div>
          )}

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
              Monthly Payout Day (1–28)
            </Label>
            <Input
              type="number"
              placeholder="e.g. 15"
              value={payoutDay}
              onChange={(e) => setPayoutDay(e.target.value)}
              min={1}
              max={28}
            />
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
            onClick={handleSubmit}
            disabled={submitting || !selectedPartnerId || parsedAmount < 50000 || !payoutDay}
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
    </Dialog>
  );
}
