import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, ArrowUpRight, Clock, CheckCircle2, XCircle, AlertCircle, Info, Hourglass, Download, X, CheckSquare, Eye, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useCurrency } from '@/hooks/useCurrency';
import { WithdrawRequestDialog } from '@/components/wallet/WithdrawRequestDialog';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

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

const ACTIVE_PROXY_WITHDRAWAL_STATUSES = [
  'pending',
  'requested',
  'manager_approved',
  'cfo_approved',
  'processing',
] as const;

// Terminal/disbursed statuses — funds have already been deducted from the agent
// wallet via the approve-withdrawal edge function. These count as "delivered"
// against the per-partner ROI balance.
const COMPLETED_PROXY_WITHDRAWAL_STATUSES = [
  'completed',
  'approved',
  'fin_ops_approved',
] as const;

// Terminal statuses that did NOT result in a payout. The ROI is therefore still
// available; the partner simply needs the agent to re-request a payout.
const TERMINAL_UNPAID_STATUSES = ['rejected', 'expired', 'cancelled'] as const;

type FilterMode = 'all' | 'reattempt' | 'fresh';

interface LastTerminal {
  status: string;
  reason: string | null;
  at: string; // ISO date
}

interface Dismissal {
  partner_id: string;
  portfolio_id: string | null;
  snapshot_amount: number;
  dismissed_at: string;
  reason: string | null;
}

export function ProxyPartnerFunds() {
  const { user } = useAuth();
  const { wallet } = useWallet();
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
  const [partnerWithdrawalIds, setPartnerWithdrawalIds] = useState<Record<string, string>>({});
  const [lastTerminalByPartner, setLastTerminalByPartner] = useState<Record<string, LastTerminal>>({});
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ key: string; withdrawalId: string; partnerName: string; partnerId: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  // Dismissal state
  const [dismissals, setDismissals] = useState<Dismissal[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearTargets, setClearTargets] = useState<Array<{ partnerId: string; portfolioId: string | null; amount: number; partnerName: string }>>([]);
  const [clearReason, setClearReason] = useState('');
  const [clearing, setClearing] = useState(false);
  const [hiddenSheetOpen, setHiddenSheetOpen] = useState(false);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
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
          event: '*',
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
      // Step 1: Get ROI payouts explicitly approved by a CFO-role user
      const { getCfoUserIds } = await import('@/lib/cfoUserIds');
      const cfoIds = await getCfoUserIds();
      if (cfoIds.length === 0) {
        setApprovedOps([]);
        setProfiles({});
        setCompletedWithdrawals([]);
        setPortfolios([]);
        setPartnerWithdrawalStatus({});
        setLoading(false);
        return;
      }
      // Only show records that went through the full Partner Ops → COO → CFO pipeline
      // These records have coo_approved_by stamped in metadata by the COO approval step
      const { data: pwoData, error: pwoError } = await supabase
        .from('pending_wallet_operations')
        .select('id, amount, linked_party, source_id, description, metadata, created_at')
        .eq('target_wallet_user_id', user.id)
        .in('category', ['roi_payout', 'supporter_platform_rewards'])
        .eq('status', 'approved')
        .in('reviewed_by', cfoIds)
        .not('metadata->coo_approved_by', 'is', null)
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
        setLastTerminalByPartner({});
        setLoading(false);
        return;
      }

      // Step 4: Fetch profiles, completed withdrawals, active withdrawals, and
      // terminal-unpaid history in parallel
      const [profileRes, completedRes, activeWithdrawalRes, terminalRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', uniquePartnerIds),
        // Completed withdrawals for these partners (already delivered)
        supabase
          .from('withdrawal_requests')
          .select('linked_party, amount, status, reason, updated_at, created_at')
          .eq('user_id', user.id)
          .in('status', [...COMPLETED_PROXY_WITHDRAWAL_STATUSES])
          .not('linked_party', 'is', null),
        // Active (pending/processing) withdrawal requests
        supabase
          .from('withdrawal_requests')
          .select('id, linked_party, status, reason, updated_at, created_at')
          .eq('user_id', user.id)
          .in('status', [...ACTIVE_PROXY_WITHDRAWAL_STATUSES]),
        // Terminal-unpaid: rejected / expired / cancelled (so we can explain
        // why a balance is still sitting on the card)
        supabase
          .from('withdrawal_requests')
          .select('linked_party, status, rejection_reason, updated_at, created_at')
          .eq('user_id', user.id)
          .in('status', [...TERMINAL_UNPAID_STATUSES])
          // Defense-in-depth: only consider terminal events from the last 30 days
          // so really old rejections never resurface even if a later success was
          // recorded against the same partner with a missing timestamp.
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('updated_at', { ascending: false })
          .limit(500),
      ]);

      const profileMap: Record<string, { full_name: string; phone: string }> = {};
      (profileRes.data || []).forEach(p => {
        profileMap[p.id] = { full_name: p.full_name || 'Unknown', phone: p.phone || '' };
      });
      setProfiles(profileMap);
      setCompletedWithdrawals((completedRes.data || []).filter(w => uniquePartnerIds.includes(w.linked_party)));

      // Build active withdrawal status map + ID map
      const statusMap: Record<string, string> = {};
      const idMap: Record<string, string> = {};
      // Track the most recent active-withdrawal timestamp per partner so we
      // can suppress stale terminal banners that have been superseded.
      const lastActiveAtByPartner: Record<string, string> = {};
      (activeWithdrawalRes.data || []).forEach((w: any) => {
        const portfolioKey = w.linked_party;

        if (w.linked_party && uniquePartnerIds.includes(w.linked_party)) {
          const ts = w.updated_at || w.created_at;
          if (ts && (!lastActiveAtByPartner[w.linked_party] || ts > lastActiveAtByPartner[w.linked_party])) {
            lastActiveAtByPartner[w.linked_party] = ts;
          }
          if (portfolioKey) {
            const existing = statusMap[portfolioKey];
            if (!existing || w.status === 'pending') {
              statusMap[portfolioKey] = w.status;
              idMap[portfolioKey] = w.id;
            }
          }
          const existing = statusMap[w.linked_party];
          if (!existing || w.status === 'pending') {
            statusMap[w.linked_party] = w.status;
            idMap[w.linked_party] = w.id;
          }
        }
        if (!w.linked_party && w.reason) {
          for (const pid of uniquePartnerIds) {
            const name = profileMap[pid]?.full_name;
            if (name && w.reason.includes(name)) {
              const existing = statusMap[pid];
              if (!existing || w.status === 'pending') {
                statusMap[pid] = w.status;
                idMap[pid] = w.id;
              }
              const ts = w.updated_at || w.created_at;
              if (ts && (!lastActiveAtByPartner[pid] || ts > lastActiveAtByPartner[pid])) {
                lastActiveAtByPartner[pid] = ts;
              }
              break;
            }
          }
        }
      });
      setPartnerWithdrawalStatus(statusMap);
      setPartnerWithdrawalIds(idMap);

      // Track the most recent successful (delivered) withdrawal timestamp per
      // partner — a terminal event older than this means Caro already
      // re-requested and got paid, so the destructive banner is outdated.
      const lastSuccessAtByPartner: Record<string, string> = {};
      (completedRes.data || []).forEach((w: any) => {
        const pid = w.linked_party;
        if (!pid || !uniquePartnerIds.includes(pid)) return;
        const ts = w.updated_at || w.created_at;
        if (!ts) return;
        if (!lastSuccessAtByPartner[pid] || ts > lastSuccessAtByPartner[pid]) {
          lastSuccessAtByPartner[pid] = ts;
        }
      });

      // Build last-terminal map: most recent rejected/expired/cancelled per partner
      const terminalMap: Record<string, LastTerminal> = {};
      (terminalRes.data || []).forEach((w: any) => {
        const pid = w.linked_party;
        if (!pid || !uniquePartnerIds.includes(pid)) return;
        if (terminalMap[pid]) return; // already have the most recent (ordered desc)
        terminalMap[pid] = {
          status: w.status,
          reason: w.rejection_reason || null,
          at: w.updated_at || w.created_at,
        };
      });

      // Suppress terminal events that have been superseded by a later
      // successful or in-flight withdrawal — those rejections/cancellations
      // are no longer actionable for the agent.
      Object.keys(terminalMap).forEach((pid) => {
        const terminalAt = terminalMap[pid].at;
        const successAt = lastSuccessAtByPartner[pid];
        const activeAt = lastActiveAtByPartner[pid];
        const supersededBySuccess = successAt && successAt >= terminalAt;
        const supersededByActive = activeAt && activeAt >= terminalAt;
        if (supersededBySuccess || supersededByActive) {
          delete terminalMap[pid];
        }
      });

      setLastTerminalByPartner(terminalMap);
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
      // Determine partner ID: BEST source is portfolio investor_id, then metadata, then linked_party
      let partnerId: string | null = null;
      // 1. Portfolio investor_id (most reliable)
      if (op.source_id && portfolioMap[op.source_id]) {
        partnerId = portfolioMap[op.source_id].investor_id;
      }
      // 2. metadata.initiated_by (if not self)
      if (!partnerId) {
        const initiatedBy = meta.initiated_by as string | null;
        if (initiatedBy && initiatedBy !== user.id) partnerId = initiatedBy;
      }
      // 3. linked_party (if not self)
      if (!partnerId && op.linked_party && op.linked_party !== user.id) {
        partnerId = op.linked_party;
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
    // Small delay to ensure DB write is committed before re-fetching
    setTimeout(() => loadProxyFunds(), 800);
  };

  const handleCancelRequest = (partner: PartnerBalance) => {
    const key = getStatusKey(partner);
    const withdrawalId = partnerWithdrawalIds[key];
    if (!withdrawalId) return;
    setCancelTarget({ key, withdrawalId, partnerName: partner.partnerName, partnerId: partner.partnerId });
    setCancelReason('');
    setCancelConfirmOpen(true);
  };

  const confirmCancel = async () => {
    if (!cancelTarget || !user?.id || cancelReason.trim().length < 10) return;
    setCancellingId(cancelTarget.withdrawalId);
    try {
      // Backend-only flow — edge function validates the proxy assignment,
      // updates withdrawal status, writes a balanced reversal ledger pair,
      // posts audit log, and notifies COO/Ops. The wallet UI refreshes via
      // the realtime `wallets` subscription. The client must NOT touch
      // wallet, general_ledger, or perform any balance math.
      const { data, error } = await supabase.functions.invoke('cancel-proxy-withdrawal', {
        body: {
          withdrawal_id: cancelTarget.withdrawalId,
          reason: cancelReason.trim(),
        },
      });
      if (error) throw new Error(error.message || 'Cancellation failed');
      if (data?.error) throw new Error(data.error);

      const restored = Number(data?.amount || 0);
      toast.success('Withdrawal cancelled', {
        description: `The ROI withdrawal for ${cancelTarget.partnerName} has been cancelled${restored ? ` and ${formatAmount(restored)} restored` : ''}. COO & Partner Ops have been notified.`,
      });
      loadProxyFunds();
    } catch (err: any) {
      toast.error('Failed to cancel', { description: err.message });
    } finally {
      setCancellingId(null);
      setCancelConfirmOpen(false);
      setCancelTarget(null);
      setCancelReason('');
    }
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

    if (status === 'pending' || status === 'requested') {
      return (
        <Badge variant="warning" size="sm" className="gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
    }
    if (status === 'manager_approved' || status === 'cfo_approved' || status === 'approved' || status === 'fin_ops_approved' || status === 'processing') {
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

  // Classify each partner card so the agent can see WHY a balance is sitting here.
  // Priority: active in-flight > last terminal (reject/expire/cancel) > fresh (no prior request).
  const classify = (partner: PartnerBalance):
    | { kind: 'active' }
    | { kind: 'reattempt'; terminal: LastTerminal }
    | { kind: 'fresh' } => {
    const key = getStatusKey(partner);
    if (partnerWithdrawalStatus[key]) return { kind: 'active' };
    const t = lastTerminalByPartner[partner.partnerId];
    if (t) return { kind: 'reattempt', terminal: t };
    return { kind: 'fresh' };
  };

  const reattemptCount = partnerBalances.filter((p) => classify(p).kind === 'reattempt').length;
  const freshCount = partnerBalances.filter((p) => classify(p).kind === 'fresh').length;

  const downloadCsv = (rows: PartnerBalance[]) => {
    const headers = ['Partner Name', 'Phone', 'Account Name', 'Portfolio Code', 'Returns Due', 'Delivered', 'To Withdraw'];
    const escape = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    rows.forEach((p) => {
      lines.push([
        p.partnerName,
        p.partnerPhone,
        p.accountName || '',
        p.portfolioCode || '',
        p.totalReturns,
        p.totalWithdrawn,
        p.available,
      ].map(escape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proxy-partner-funds-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${rows.length} partner${rows.length === 1 ? '' : 's'}`);
  };

  const visibleBalances = partnerBalances.filter((p) => {
    if (filterMode === 'all') return true;
    const c = classify(p);
    if (filterMode === 'reattempt') return c.kind === 'reattempt';
    if (filterMode === 'fresh') return c.kind === 'fresh';
    return true;
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground px-1">
        CFO-approved returns ready for delivery to your proxy partners. Nothing here is stuck —
        balances shown are <span className="font-medium text-foreground">withdrawable now</span>.
      </p>

      <div className="flex flex-wrap gap-1.5 px-1">
        <Button
          size="sm"
          variant={filterMode === 'all' ? 'default' : 'outline'}
          className="h-7 text-xs gap-1"
          onClick={() => setFilterMode('all')}
        >
          All ({partnerBalances.length})
        </Button>
        <Button
          size="sm"
          variant={filterMode === 'reattempt' ? 'default' : 'outline'}
          className="h-7 text-xs gap-1"
          onClick={() => setFilterMode('reattempt')}
          disabled={reattemptCount === 0}
        >
          <AlertCircle className="h-3 w-3" />
          Re-request needed ({reattemptCount})
        </Button>
        <Button
          size="sm"
          variant={filterMode === 'fresh' ? 'default' : 'outline'}
          className="h-7 text-xs gap-1"
          onClick={() => setFilterMode('fresh')}
          disabled={freshCount === 0}
        >
          <Hourglass className="h-3 w-3" />
          New ROI ({freshCount})
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 ml-auto"
          onClick={() => downloadCsv(visibleBalances)}
          disabled={visibleBalances.length === 0}
        >
          <Download className="h-3 w-3" />
          Download
        </Button>
      </div>

      {visibleBalances.map((partner) => {
        const statusKey = getStatusKey(partner);
        const hasPending = !!partnerWithdrawalStatus[statusKey];
        const statusBadge = getStatusBadge(partner);
        const cardKey = `${partner.partnerId}-${partner.portfolioId || 'none'}`;
        const currentStatus = partnerWithdrawalStatus[statusKey];
        const canCancel = currentStatus ? ACTIVE_PROXY_WITHDRAWAL_STATUSES.includes(currentStatus as typeof ACTIVE_PROXY_WITHDRAWAL_STATUSES[number]) : false;
        const classification = classify(partner);

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
                  {!statusBadge && classification.kind === 'reattempt' && (
                    <Badge variant="destructive" size="sm" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {classification.terminal.status === 'rejected'
                        ? 'Last attempt rejected'
                        : classification.terminal.status === 'expired'
                        ? 'Last attempt expired'
                        : 'Last attempt cancelled'}
                    </Badge>
                  )}
                  {!statusBadge && classification.kind === 'fresh' && (
                    <Badge variant="outline" size="sm" className="gap-1 border-primary/40 text-primary">
                      <Hourglass className="h-3 w-3" />
                      Awaiting request
                    </Badge>
                  )}
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

              {!statusBadge && classification.kind === 'reattempt' && (
                <div className="flex items-start gap-1.5 rounded-md bg-destructive/5 border border-destructive/20 px-2 py-1.5">
                  <Info className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-snug text-destructive">
                    Last withdrawal {classification.terminal.status} on{' '}
                    {new Date(classification.terminal.at).toLocaleDateString()}.
                    {classification.terminal.reason ? (
                      <> Reason: <span className="font-medium">{classification.terminal.reason}</span>.</>
                    ) : (
                      <> No reason recorded.</>
                    )}{' '}
                    Funds returned — re-request below.
                  </p>
                </div>
              )}
              {!statusBadge && classification.kind === 'fresh' && (
                <div className="flex items-start gap-1.5 rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
                  <Info className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-snug text-primary">
                    Returns accrued and ready. No withdrawal has been requested yet.
                  </p>
                </div>
              )}

              {hasPending && canCancel ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1"
                    disabled
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {currentStatus === 'pending' || currentStatus === 'requested' ? 'Withdrawal Pending' : 'Withdrawal In Progress'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1"
                    disabled={cancellingId === partnerWithdrawalIds[statusKey]}
                    onClick={() => handleCancelRequest(partner)}
                  >
                    {cancellingId === partnerWithdrawalIds[statusKey] ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="w-full gap-1"
                  onClick={() => handleWithdraw(partner)}
                  disabled={partner.available <= 0 || hasPending}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  {hasPending ? 'Withdrawal In Progress' : `Withdraw ${formatAmount(partner.available)}`}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      <WithdrawRequestDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        // For proxy partner withdrawals, the available balance is the
        // per-partner ROI balance (prefillAmount), NOT the agent's own
        // wallet balance. The agent's wallet may show 0 here even when
        // the partner has unwithdrawn ROI ready to disburse.
        walletBalance={prefillAmount || 0}
        onSuccess={handleWithdrawSuccess}
        prefillAmount={prefillAmount}
        prefillReason={prefillReason}
        linkedParty={selectedPartnerId}
      />

      <AlertDialog open={cancelConfirmOpen} onOpenChange={(open) => {
        setCancelConfirmOpen(open);
        if (!open) setCancelReason('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Withdrawal?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will cancel the pending withdrawal for <strong>{cancelTarget?.partnerName}</strong> and restore the ROI funds to the available balance. COO &amp; Operations will be notified.
                </p>
                <div>
                  <Label className="text-xs font-medium">Cancellation Reason (min 10 chars) *</Label>
                  <Textarea
                    placeholder="e.g. Partner requested to delay payout until next month"
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{cancelReason.length}/500</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Request</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              disabled={cancelReason.trim().length < 10}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Cancel Withdrawal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
