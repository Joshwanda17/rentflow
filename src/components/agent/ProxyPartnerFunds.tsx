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
  totalReceived: number;
  totalWithdrawn: number;
  available: number;
}

interface PendingWithdrawal {
  partnerId: string;
  status: string;
}

export function ProxyPartnerFunds() {
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string; phone: string }>>({});
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
      // Fetch ledger entries
      const { data: entries, error } = await supabase
        .from('general_ledger')
        .select('*')
        .eq('user_id', user.id)
        .not('linked_party', 'is', null)
        .in('category', ['roi_payout', 'proxy_partner_withdrawal'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLedgerEntries(entries || []);

      // Get unique partner IDs
      const partnerIds = [...new Set((entries || []).map(e => e.linked_party).filter(Boolean))];

      if (partnerIds.length > 0) {
        // Fetch profiles and pending withdrawals in parallel
        const [profileRes, withdrawalRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, phone')
            .in('id', partnerIds),
          supabase
            .from('withdrawal_requests')
            .select('linked_party, status, reason')
            .eq('user_id', user.id)
            .in('status', ['pending', 'approved', 'processing'])
        ]);

        const profileMap: Record<string, { full_name: string; phone: string }> = {};
        (profileRes.data || []).forEach(p => {
          profileMap[p.id] = { full_name: p.full_name || 'Unknown', phone: p.phone || '' };
        });
        setProfiles(profileMap);

        // Build status map - use the most recent/active status per partner
        const statusMap: Record<string, string> = {};
        (withdrawalRes.data || []).forEach((w: any) => {
          if (w.linked_party) {
            // Priority: pending > processing > approved
            const existing = statusMap[w.linked_party];
            if (!existing || w.status === 'pending') {
              statusMap[w.linked_party] = w.status;
            }
          }
        });
        setPartnerWithdrawalStatus(statusMap);
      }
    } catch (err) {
      console.error('Error loading proxy funds:', err);
    } finally {
      setLoading(false);
    }
  };

  const partnerBalances = useMemo<PartnerBalance[]>(() => {
    const grouped: Record<string, { received: number; withdrawn: number }> = {};

    ledgerEntries.forEach(entry => {
      const pid = entry.linked_party;
      if (!pid) return;
      if (!grouped[pid]) grouped[pid] = { received: 0, withdrawn: 0 };

      const amt = Number(entry.amount) || 0;
      if (entry.category === 'roi_payout' && entry.direction === 'cash_in') {
        grouped[pid].received += amt;
      }
      if (entry.category === 'proxy_partner_withdrawal' && entry.direction === 'cash_out') {
        grouped[pid].withdrawn += amt;
      }
    });

    return Object.entries(grouped).map(([partnerId, totals]) => ({
      partnerId,
      partnerName: profiles[partnerId]?.full_name || 'Unknown Partner',
      partnerPhone: profiles[partnerId]?.phone || '',
      totalReceived: totals.received,
      totalWithdrawn: totals.withdrawn,
      available: totals.received - totals.withdrawn,
    })).sort((a, b) => b.available - a.available);
  }, [ledgerEntries, profiles]);

  const handleWithdraw = async (partner: PartnerBalance) => {
    setSelectedPartnerId(partner.partnerId);
    setPrefillAmount(partner.available);
    setPrefillReason(`Proxy payout delivery for ${partner.partnerName}`);
    setWithdrawOpen(true);

    try {
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: 'proxy_partner_withdrawal',
        description: `Initiated proxy withdrawal of ${formatAmount(partner.available)} for partner ${partner.partnerName}`,
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
    // Reload to pick up new pending status
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
    if (status === 'approved' || status === 'processing') {
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
          <p className="text-sm font-medium">No proxy partner funds</p>
          <p className="text-xs mt-1">Partner payout credits will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground px-1">
        Funds received on behalf of your assigned partners. Withdraw to deliver to partner.
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
                  <p className="text-[10px] text-muted-foreground">Received</p>
                  <p className="text-xs font-bold text-success tabular-nums">{formatAmount(partner.totalReceived)}</p>
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

              {partner.available <= 0 && (
                <div className="text-center">
                  <Badge variant="secondary" className="text-xs">Fully delivered</Badge>
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
