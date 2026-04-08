import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, ArrowUpRight, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/hooks/useCurrency';
import { WithdrawRequestDialog } from '@/components/wallet/WithdrawRequestDialog';

interface PartnerBalance {
  partnerId: string;
  partnerName: string;
  partnerPhone: string;
  totalReturns: number;
  totalWithdrawn: number;
  available: number;
}

interface PendingWithdrawal {
  partnerId: string;
  status: string;
}

interface LedgerCredit {
  user_id: string | null;
  linked_party: string | null;
  amount: number;
  direction: string;
  category: string;
}

export function ProxyPartnerFunds() {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [approvedPartnerIds, setApprovedPartnerIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string; phone: string }>>({});
  const [ledgerCredits, setLedgerCredits] = useState<LedgerCredit[]>([]);
  const [completedWithdrawals, setCompletedWithdrawals] = useState<any[]>([]);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [prefillAmount, setPrefillAmount] = useState<number>(0);
  const [prefillReason, setPrefillReason] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [partnerWithdrawalStatus, setPartnerWithdrawalStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    loadProxyFunds();
  }, [user?.id]);

  const loadProxyFunds = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Step 1: Get approved proxy assignments only
      const { data: assignments, error: assignmentsError } = await supabase
        .from('proxy_agent_assignments')
        .select('beneficiary_id')
        .eq('agent_id', user.id)
        .eq('beneficiary_role', 'supporter')
        .eq('approval_status', 'approved')
        .eq('is_active', true);

      if (assignmentsError) throw assignmentsError;

      const approvedIds = [...new Set((assignments || []).map(a => a.beneficiary_id).filter(Boolean))];
      setApprovedPartnerIds(approvedIds);

      if (approvedIds.length === 0) {
        setProfiles({});
        setPortfolios([]);
        setCompletedWithdrawals([]);
        setPartnerWithdrawalStatus({});
        setLoading(false);
        return;
      }

      // Step 2: Fetch profiles, portfolios, completed withdrawals, and active withdrawal requests
      const portfolioQuery: any = supabase
        .from('investor_portfolios' as any)
        .select('id, investor_id, investment_amount, roi_percentage, status, created_at, maturity_date, total_roi_earned')
        .in('investor_id', approvedIds);

      const [profileRes, portfolioRes, completedRes, activeWithdrawalRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', approvedIds),
        portfolioQuery as any,
        // Completed withdrawals for these partners (delivered)
        supabase
          .from('withdrawal_requests')
          .select('linked_party, amount, status, reason')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .not('linked_party', 'is', null),
        // Active (pending/processing) withdrawal requests
        supabase
          .from('withdrawal_requests')
          .select('linked_party, status, reason')
          .eq('user_id', user.id)
          .in('status', ['pending', 'approved', 'processing', 'manager_approved']),
      ]);

      const profileMap: Record<string, { full_name: string; phone: string }> = {};
      (profileRes.data || []).forEach(p => {
        profileMap[p.id] = { full_name: p.full_name || 'Unknown', phone: p.phone || '' };
      });
      setProfiles(profileMap);
      setPortfolios(((portfolioRes.data || []) as PortfolioRow[]).filter((p) => p.status === 'active'));
      setCompletedWithdrawals((completedRes.data || []).filter(w => approvedIds.includes(w.linked_party)));

      // Build active withdrawal status map
      const statusMap: Record<string, string> = {};
      (activeWithdrawalRes.data || []).forEach((w: any) => {
        if (w.linked_party && approvedIds.includes(w.linked_party)) {
          const existing = statusMap[w.linked_party];
          if (!existing || w.status === 'pending') {
            statusMap[w.linked_party] = w.status;
          }
        }
        // Fallback: match by reason containing partner name
        if (!w.linked_party && w.reason) {
          for (const pid of approvedIds) {
            const name = profileMap[pid]?.full_name;
            if (name && w.reason.includes(name)) {
              const existing = statusMap[pid];
              if (!existing || w.status === 'pending') {
                statusMap[pid] = w.status;
              }
              break;
            }
          }
        }
      });
      setPartnerWithdrawalStatus(statusMap);
    } catch (err) {
      console.error('Error loading proxy funds:', err);
    } finally {
      setLoading(false);
    }
  };

  const partnerBalances = useMemo<PartnerBalance[]>(() => {
    const now = new Date();

    return approvedPartnerIds
      .map((partnerId) => {
        // Calculate accrued ROI from portfolios
        const partnerPortfolios = portfolios.filter(p => p.investor_id === partnerId);
        let totalReturns = 0;

        partnerPortfolios.forEach(portfolio => {
          const trackedReturns = Number(portfolio.total_roi_earned) || 0;
          if (trackedReturns > 0) {
            totalReturns += trackedReturns;
            return;
          }

          const investmentAmount = Number(portfolio.investment_amount) || 0;
          const roiPercentage = Number(portfolio.roi_percentage) || 0;
          const createdAt = new Date(portfolio.created_at);
          const maturityDate = portfolio.maturity_date ? new Date(portfolio.maturity_date) : null;
          const endDate = maturityDate && maturityDate < now ? maturityDate : now;

          const msElapsed = endDate.getTime() - createdAt.getTime();
          const monthsElapsed = Math.max(0, msElapsed / (30 * 24 * 60 * 60 * 1000));

          if (roiPercentage > 100) {
            console.error(`Invalid monthly ROI percentage: ${roiPercentage}% for portfolio`);
            return;
          }
          const monthlyROI = (investmentAmount * roiPercentage) / 100;
          totalReturns += monthlyROI * monthsElapsed;
        });

        totalReturns = Math.round(totalReturns);

        // Calculate completed withdrawals for this partner
        const partnerWithdrawals = completedWithdrawals.filter(w => w.linked_party === partnerId);
        const totalWithdrawn = partnerWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

        const available = Math.max(0, totalReturns - totalWithdrawn);

        return {
          partnerId,
          partnerName: profiles[partnerId]?.full_name || 'Unknown Partner',
          partnerPhone: profiles[partnerId]?.phone || '',
          totalReturns,
          totalWithdrawn,
          available,
        };
      })
      .filter((partner) => partner.available > 0)
      .sort((a, b) => {
        if (b.available !== a.available) return b.available - a.available;
        if (b.totalReturns !== a.totalReturns) return b.totalReturns - a.totalReturns;
        return a.partnerName.localeCompare(b.partnerName);
      });
  }, [approvedPartnerIds, portfolios, completedWithdrawals, profiles]);

  const handleWithdraw = async (partner: PartnerBalance) => {
    setSelectedPartnerId(partner.partnerId);
    setPrefillAmount(partner.available);
    setPrefillReason(`Proxy payout delivery for ${partner.partnerName}`);
    setWithdrawOpen(true);

    try {
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'proxy_partner_withdrawal',
        table_name: 'withdrawal_requests',
        metadata: {
          partner_id: partner.partnerId,
          partner_name: partner.partnerName,
          amount: partner.available,
          agent_id: user?.id,
        },
      });
    } catch (err) {
      console.error('Audit log error:', err);
    }
  };

  const handleWithdrawSuccess = () => {
    loadProxyFunds();
  };

  const getStatusBadge = (partnerId: string) => {
    const status = partnerWithdrawalStatus[partnerId];
    if (!status) return null;

    if (status === 'pending') {
      return (
        <Badge variant="warning" size="sm" className="gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
    }
    if (status === 'approved' || status === 'processing' || status === 'manager_approved') {
      return (
        <Badge variant="success" size="sm" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Approved
        </Badge>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (partnerBalances.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No proxy partners yet</p>
          <p className="text-xs mt-1">Approved partners and their ROI returns will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground px-1">
        Earned returns for your approved proxy partners. Withdraw to deliver to partner.
      </p>

      {partnerBalances.map((partner) => {
        const hasPending = !!partnerWithdrawalStatus[partner.partnerId];
        const statusBadge = getStatusBadge(partner.partnerId);

        return (
          <Card key={partner.partnerId} className="border-border/50 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm text-foreground">{partner.partnerName}</p>
                  {partner.partnerPhone && (
                    <p className="text-xs text-muted-foreground">{partner.partnerPhone}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {statusBadge}
                  <Badge variant="outline" className="text-xs gap-1">
                    <Users className="h-3 w-3" />
                    Proxy
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-success/10 p-2">
                  <p className="text-[10px] text-muted-foreground">Returns Due</p>
                  <p className="text-xs font-bold text-success tabular-nums">{formatAmount(partner.totalReturns)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Delivered</p>
                  <p className="text-xs font-bold text-foreground tabular-nums">{formatAmount(partner.totalWithdrawn)}</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2">
                  <p className="text-[10px] text-muted-foreground">Available</p>
                  <p className="text-xs font-bold text-primary tabular-nums">{formatAmount(partner.available)}</p>
                </div>
              </div>

              {partner.available > 0 && !hasPending && (
                <Button
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => handleWithdraw(partner)}
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Withdraw {formatAmount(partner.available)}
                </Button>
              )}

              {partner.available > 0 && hasPending && (
                <Button
                  size="sm"
                  className="w-full gap-2"
                  variant="outline"
                  disabled
                >
                  <Clock className="h-4 w-4" />
                  Withdrawal {partnerWithdrawalStatus[partner.partnerId] === 'pending' ? 'Pending Approval' : 'Processing'}
                </Button>
              )}

              {partner.available <= 0 && partner.totalReturns > 0 && (
                <div className="text-center">
                  <Badge variant="secondary" className="text-xs">Fully delivered</Badge>
                </div>
              )}

              {partner.available <= 0 && partner.totalReturns === 0 && (
                <div className="text-center">
                  <Badge variant="secondary" className="text-xs">No returns accrued yet</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <WithdrawRequestDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        walletBalance={prefillAmount}
        prefillAmount={prefillAmount}
        prefillReason={prefillReason}
        linkedParty={selectedPartnerId}
        onSuccess={handleWithdrawSuccess}
      />
    </div>
  );
}
