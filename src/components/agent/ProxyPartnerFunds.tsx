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
  portfolioId: string | null;
  portfolioCode: string | null;
  accountName: string | null;
  totalReturns: number;
  totalWithdrawn: number;
  available: number;
}

interface PwoEntry {
  id: string;
  amount: number;
  linked_party: string | null;
  source_id: string | null;
  description: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface PortfolioInfo {
  id: string;
  portfolio_code: string | null;
  account_name: string | null;
  investor_id: string;
}

export function ProxyPartnerFunds() {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [approvedOps, setApprovedOps] = useState<PwoEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string; phone: string }>>({});
  const [completedWithdrawals, setCompletedWithdrawals] = useState<any[]>([]);
  const [portfolios, setPortfolios] = useState<PortfolioInfo[]>([]);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [prefillAmount, setPrefillAmount] = useState<number>(0);
  const [prefillReason, setPrefillReason] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [partnerWithdrawalStatus, setPartnerWithdrawalStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    loadProxyFunds();
  }, [user?.id]);

  // Real-time subscription: auto-refresh when withdrawal statuses change
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('proxy-withdrawal-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'withdrawal_requests',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadProxyFunds();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const loadProxyFunds = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Step 1: Get CFO-approved ROI payouts directed to this proxy agent's wallet
      // This is the SOLE source of truth — only CFO-approved entries appear
      const { data: pwoData, error: pwoError } = await supabase
        .from('pending_wallet_operations')
        .select('id, amount, linked_party, source_id, description, metadata, created_at')
        .eq('target_wallet_user_id', user.id)
        .in('category', ['roi_payout', 'supporter_platform_rewards'])
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (pwoError) throw pwoError;

      const ops = (pwoData || []) as PwoEntry[];
      setApprovedOps(ops);

      if (ops.length === 0) {
        setProfiles({});
        setCompletedWithdrawals([]);
        setPortfolios([]);
        setPartnerWithdrawalStatus({});
        setLoading(false);
        return;
      }

      // Step 2: Collect portfolio IDs first to resolve actual partner (investor) IDs
      const portfolioIds = new Set<string>();
      ops.forEach(op => {
        if (op.source_id) portfolioIds.add(op.source_id);
      });
      const uniquePortfolioIds = [...portfolioIds];

      // Fetch portfolios first so we can resolve partner IDs
      let fetchedPortfolios: PortfolioInfo[] = [];
      if (uniquePortfolioIds.length > 0) {
        const { data: portfolioData } = await supabase
          .from('investor_portfolios')
          .select('id, portfolio_code, account_name, investor_id')
          .in('id', uniquePortfolioIds);
        fetchedPortfolios = (portfolioData || []) as PortfolioInfo[];
      }
      setPortfolios(fetchedPortfolios);

      // Build portfolio→investor map
      const portfolioToInvestor: Record<string, string> = {};
      fetchedPortfolios.forEach(p => { portfolioToInvestor[p.id] = p.investor_id; });

      // Extract unique partner IDs: prefer portfolio investor_id, then metadata.initiated_by (if not self), then linked_party (if not self)
      const partnerIds = new Set<string>();
      ops.forEach(op => {
        const meta = op.metadata || {};
        // Best source: portfolio investor_id
        if (op.source_id && portfolioToInvestor[op.source_id]) {
          partnerIds.add(portfolioToInvestor[op.source_id]);
          return;
        }
        // Fallback: metadata.initiated_by if it's not the agent
        const initiatedBy = meta.initiated_by as string | null;
        if (initiatedBy && initiatedBy !== user.id) {
          partnerIds.add(initiatedBy);
          return;
        }
        // Last resort: linked_party if not self
        if (op.linked_party && op.linked_party !== user.id) {
          partnerIds.add(op.linked_party);
        }
      });

      const uniquePartnerIds = [...partnerIds];

      if (uniquePartnerIds.length === 0) {
        setProfiles({});
        setCompletedWithdrawals([]);
        setPartnerWithdrawalStatus({});
        setLoading(false);
        return;
      }

      // Step 4: Fetch profiles, completed withdrawals, active withdrawals in parallel
      const [profileRes, completedRes, activeWithdrawalRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', uniquePartnerIds),
        // Completed withdrawals for these partners (already delivered)
        supabase
          .from('withdrawal_requests')
          .select('linked_party, amount, status, reason')
          .eq('user_id', user.id)
          .eq('status', 'completed')
          .not('linked_party', 'is', null),
        // Active (pending/processing) withdrawal requests
        supabase
          .from('withdrawal_requests')
          .select('linked_party, status, reason, metadata')
          .eq('user_id', user.id)
          .in('status', ['pending', 'approved', 'processing', 'manager_approved']),
      ]);

      const profileMap: Record<string, { full_name: string; phone: string }> = {};
      (profileRes.data || []).forEach(p => {
        profileMap[p.id] = { full_name: p.full_name || 'Unknown', phone: p.phone || '' };
      });
      setProfiles(profileMap);
      setCompletedWithdrawals((completedRes.data || []).filter(w => uniquePartnerIds.includes(w.linked_party)));

      // Build active withdrawal status map
      const statusMap: Record<string, string> = {};
      (activeWithdrawalRes.data || []).forEach((w: any) => {
        const meta = (w.metadata || {}) as Record<string, any>;
        const portfolioKey = meta.portfolio_id
          ? `${w.linked_party}-${meta.portfolio_id}`
          : w.linked_party;

        if (w.linked_party && uniquePartnerIds.includes(w.linked_party)) {
          if (portfolioKey) {
            const existing = statusMap[portfolioKey];
            if (!existing || w.status === 'pending') {
              statusMap[portfolioKey] = w.status;
            }
          }
          const existing = statusMap[w.linked_party];
          if (!existing || w.status === 'pending') {
            statusMap[w.linked_party] = w.status;
          }
        }
        // Fallback: match by reason containing partner name
        if (!w.linked_party && w.reason) {
          for (const pid of uniquePartnerIds) {
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

  // Build portfolio lookup map
  const portfolioMap = useMemo(() => {
    const map: Record<string, PortfolioInfo> = {};
    portfolios.forEach(p => { map[p.id] = p; });
    return map;
  }, [portfolios]);

  const partnerBalances = useMemo<PartnerBalance[]>(() => {
    if (!user?.id) return [];

    // Group PWO entries by (partnerId, portfolioId)
    const groupMap: Record<string, { partnerId: string; portfolioId: string | null; totalAmount: number }> = {};

    approvedOps.forEach((op) => {
      const meta = op.metadata || {};
      // Determine partner ID: prefer metadata.initiated_by, fallback to linked_party (if not self)
      let partnerId = meta.initiated_by as string | null;
      if (!partnerId || partnerId === user.id) {
        partnerId = op.linked_party !== user.id ? op.linked_party : null;
      }
      // If still no partner, try to get from portfolio investor mapping
      if (!partnerId && op.source_id && portfolioMap[op.source_id]) {
        partnerId = portfolioMap[op.source_id].investor_id;
      }
      if (!partnerId) return;

      const key = `${partnerId}-${op.source_id || 'no_portfolio'}`;
      if (!groupMap[key]) {
        groupMap[key] = { partnerId, portfolioId: op.source_id, totalAmount: 0 };
      }
      groupMap[key].totalAmount += Number(op.amount) || 0;
    });

    // Group completed withdrawals by linked_party
    const withdrawalsByPartner: Record<string, number> = {};
    completedWithdrawals.forEach(w => {
      withdrawalsByPartner[w.linked_party] = (withdrawalsByPartner[w.linked_party] || 0) + (Number(w.amount) || 0);
    });

    // Compute partner-level totals
    const partnerTotals: Record<string, number> = {};
    Object.values(groupMap).forEach(g => {
      partnerTotals[g.partnerId] = (partnerTotals[g.partnerId] || 0) + g.totalAmount;
    });

    // Single clamp at partner level after subtracting withdrawals
    const partnerAvailable: Record<string, number> = {};
    Object.keys(partnerTotals).forEach(partnerId => {
      const totalWithdrawn = withdrawalsByPartner[partnerId] || 0;
      partnerAvailable[partnerId] = Math.max(0, partnerTotals[partnerId] - totalWithdrawn);
    });

    // Build display entries — distribute proportionally across portfolio groups
    return Object.entries(groupMap)
      .filter(([, g]) => g.totalAmount > 0)
      .map(([, group]) => {
        const partnerTotal = partnerTotals[group.partnerId] || 1;
        const proportion = group.totalAmount / partnerTotal;
        const available = Math.round(partnerAvailable[group.partnerId] * proportion);
        const totalWithdrawn = Math.round((withdrawalsByPartner[group.partnerId] || 0) * proportion);

        const pInfo = group.portfolioId ? portfolioMap[group.portfolioId] : null;
        // Use metadata partner_name as fallback if profile not found
        const partnerName = profiles[group.partnerId]?.full_name
          || approvedOps.find(op => {
            const m = op.metadata || {};
            return m.initiated_by === group.partnerId || op.linked_party === group.partnerId;
          })?.metadata?.partner_name as string
          || 'Unknown Partner';

        return {
          partnerId: group.partnerId,
          partnerName,
          partnerPhone: profiles[group.partnerId]?.phone || '',
          portfolioId: group.portfolioId,
          portfolioCode: pInfo?.portfolio_code || null,
          accountName: pInfo?.account_name || null,
          totalReturns: Math.round(group.totalAmount),
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
  }, [approvedOps, completedWithdrawals, profiles, portfolioMap, user?.id]);

  const handleWithdraw = async (partner: PartnerBalance) => {
    setSelectedPartnerId(partner.partnerId);
    setPrefillAmount(partner.available);

    const portfolioLabel = partner.portfolioCode
      ? ` (Portfolio: ${partner.accountName || partner.portfolioCode})`
      : '';
    setPrefillReason(`Proxy payout delivery for ${partner.partnerName}${portfolioLabel}`);
    setWithdrawOpen(true);

    try {
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'proxy_partner_withdrawal',
        table_name: 'withdrawal_requests',
        metadata: {
          partner_id: partner.partnerId,
          partner_name: partner.partnerName,
          portfolio_id: partner.portfolioId,
          portfolio_code: partner.portfolioCode,
          account_name: partner.accountName,
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

  const getStatusKey = (partner: PartnerBalance) => {
    if (partner.portfolioId) {
      const portfolioKey = `${partner.partnerId}-${partner.portfolioId}`;
      if (partnerWithdrawalStatus[portfolioKey]) return portfolioKey;
    }
    return partner.partnerId;
  };

  const getStatusBadge = (partner: PartnerBalance) => {
    const key = getStatusKey(partner);
    const status = partnerWithdrawalStatus[key];
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
          <p className="text-sm font-medium">No proxy partner payouts ready</p>
          <p className="text-xs mt-1">CFO-approved ROI returns for your proxy partners will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground px-1">
        CFO-approved returns ready for delivery to your proxy partners.
      </p>

      {partnerBalances.map((partner) => {
        const statusKey = getStatusKey(partner);
        const hasPending = !!partnerWithdrawalStatus[statusKey];
        const statusBadge = getStatusBadge(partner);
        const cardKey = `${partner.partnerId}-${partner.portfolioId || 'none'}`;

        return (
          <Card key={cardKey} className="border-border/50 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm text-foreground">{partner.partnerName}</p>
                  {(partner.portfolioCode || partner.accountName) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      📁 {partner.accountName || partner.portfolioCode}
                      {partner.portfolioCode && partner.accountName ? (
                        <span className="text-[10px] text-muted-foreground/60 ml-1">({partner.portfolioCode})</span>
                      ) : null}
                    </p>
                  )}
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
                  <p className="text-xs font-bold tabular-nums">{formatAmount(partner.totalWithdrawn)}</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2">
                  <p className="text-[10px] text-muted-foreground">To Withdraw</p>
                  <p className="text-xs font-bold text-primary tabular-nums">{formatAmount(partner.available)}</p>
                </div>
              </div>

              <Button
                size="sm"
                className="w-full gap-1"
                onClick={() => handleWithdraw(partner)}
                disabled={partner.available <= 0 || hasPending}
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                {hasPending ? 'Withdrawal In Progress' : `Withdraw ${formatAmount(partner.available)}`}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      <WithdrawRequestDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        onSuccess={handleWithdrawSuccess}
        prefillAmount={prefillAmount}
        prefillReason={prefillReason}
        linkedParty={selectedPartnerId}
      />
    </div>
  );
}
