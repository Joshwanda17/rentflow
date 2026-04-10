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
  source_id: string | null;
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
  const [approvedPartnerIds, setApprovedPartnerIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string; phone: string }>>({});
  const [ledgerCredits, setLedgerCredits] = useState<LedgerCredit[]>([]);
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
        setLedgerCredits([]);
        setCompletedWithdrawals([]);
        setPortfolios([]);
        setPartnerWithdrawalStatus({});
        setLoading(false);
        return;
      }

      // Step 2: Fetch profiles, ledger credits (with source_id), completed withdrawals, active withdrawals, and portfolios
      const [profileRes, ledgerRes, completedRes, activeWithdrawalRes, portfolioRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', approvedIds),
        // Actual approved ROI entries from the ledger for this agent (include source_id for portfolio mapping)
        supabase
          .from('general_ledger')
          .select('user_id, linked_party, amount, direction, category, source_id')
          .eq('user_id', user.id)
          .in('category', ['roi_payout', 'balance_correction']),
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
        // Portfolios for approved partners
        supabase
          .from('investor_portfolios')
          .select('id, portfolio_code, account_name, investor_id')
          .in('investor_id', approvedIds),
      ]);

      const profileMap: Record<string, { full_name: string; phone: string }> = {};
      (profileRes.data || []).forEach(p => {
        profileMap[p.id] = { full_name: p.full_name || 'Unknown', phone: p.phone || '' };
      });
      setProfiles(profileMap);
      setLedgerCredits((ledgerRes.data || []) as LedgerCredit[]);
      setCompletedWithdrawals((completedRes.data || []).filter(w => approvedIds.includes(w.linked_party)));
      setPortfolios((portfolioRes.data || []) as PortfolioInfo[]);

      // Build active withdrawal status map keyed by partnerId-portfolioId
      const statusMap: Record<string, string> = {};
      (activeWithdrawalRes.data || []).forEach((w: any) => {
        const meta = (w.metadata || {}) as Record<string, any>;
        const portfolioKey = meta.portfolio_id
          ? `${w.linked_party}-${meta.portfolio_id}`
          : w.linked_party;

        if (w.linked_party && approvedIds.includes(w.linked_party)) {
          if (portfolioKey) {
            const existing = statusMap[portfolioKey];
            if (!existing || w.status === 'pending') {
              statusMap[portfolioKey] = w.status;
            }
          }
          // Also set partner-level status for backward compat
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

  // Build a map of portfolio id -> portfolio info
  const portfolioMap = useMemo(() => {
    const map: Record<string, PortfolioInfo> = {};
    portfolios.forEach(p => { map[p.id] = p; });
    return map;
  }, [portfolios]);

  const partnerBalances = useMemo<PartnerBalance[]>(() => {
    // Group ledger entries by (linked_party, source_id)
    const groupMap: Record<string, { partnerId: string; portfolioId: string | null; entries: LedgerCredit[] }> = {};

    ledgerCredits.forEach((entry) => {
      if (!entry.linked_party || !approvedPartnerIds.includes(entry.linked_party)) return;
      const key = `${entry.linked_party}-${entry.source_id || 'no_portfolio'}`;
      if (!groupMap[key]) {
        groupMap[key] = { partnerId: entry.linked_party, portfolioId: entry.source_id, entries: [] };
      }
      groupMap[key].entries.push(entry);
    });

    // Group completed withdrawals by linked_party (portfolio-level tracking will apply to new withdrawals)
    const withdrawalsByPartner: Record<string, number> = {};
    completedWithdrawals.forEach(w => {
      withdrawalsByPartner[w.linked_party] = (withdrawalsByPartner[w.linked_party] || 0) + (Number(w.amount) || 0);
    });

    // STEP 1: Compute partner-level net balance (source of truth)
    // Sum ALL entries per partner — no grouping by source_id, no clamping
    const partnerNet: Record<string, number> = {};
    Object.values(groupMap).forEach(g => {
      const groupNet = g.entries.reduce((s, e) => s + (e.direction === 'cash_out' ? -Number(e.amount) : Number(e.amount)), 0);
      partnerNet[g.partnerId] = (partnerNet[g.partnerId] || 0) + groupNet;
    });

    // Single clamp at partner level AFTER subtracting withdrawals
    const partnerAvailable: Record<string, number> = {};
    Object.keys(partnerNet).forEach(partnerId => {
      const totalWithdrawn = withdrawalsByPartner[partnerId] || 0;
      partnerAvailable[partnerId] = Math.max(0, partnerNet[partnerId] - totalWithdrawn);
    });

    // STEP 2: Compute per-group net for proportional display
    const groupNets: Record<string, number> = {};
    const positiveGroupSumByPartner: Record<string, number> = {};
    Object.entries(groupMap).forEach(([key, g]) => {
      const groupNet = g.entries.reduce((s, e) => s + (e.direction === 'cash_out' ? -Number(e.amount) : Number(e.amount)), 0);
      groupNets[key] = groupNet;
      if (groupNet > 0) {
        positiveGroupSumByPartner[g.partnerId] = (positiveGroupSumByPartner[g.partnerId] || 0) + groupNet;
      }
    });

    // STEP 3: Build display entries — distribute partnerAvailable proportionally across positive groups
    return Object.entries(groupMap)
      .filter(([key]) => groupNets[key] > 0) // Only show positive-net groups
      .map(([key, group]) => {
        const positiveSum = positiveGroupSumByPartner[group.partnerId] || 1;
        const proportion = groupNets[key] / positiveSum;
        const available = Math.round(partnerAvailable[group.partnerId] * proportion);
        const totalWithdrawn = Math.round((withdrawalsByPartner[group.partnerId] || 0) * proportion);

        const pInfo = group.portfolioId ? portfolioMap[group.portfolioId] : null;

        return {
          partnerId: group.partnerId,
          partnerName: profiles[group.partnerId]?.full_name || 'Unknown Partner',
          partnerPhone: profiles[group.partnerId]?.phone || '',
          portfolioId: group.portfolioId,
          portfolioCode: pInfo?.portfolio_code || null,
          accountName: pInfo?.account_name || null,
          totalReturns: Math.round(Math.max(0, partnerNet[group.partnerId]) * proportion),
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
  }, [approvedPartnerIds, ledgerCredits, completedWithdrawals, profiles, portfolioMap]);

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
                  Withdrawal {partnerWithdrawalStatus[statusKey] === 'pending' ? 'Pending Approval' : 'Processing'}
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
