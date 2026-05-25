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
  /**
   * Amount the agent has already pulled into a pending/processing withdrawal
   * for this partner. When > 0 the card is treated as "in flight" — hidden
   * from the default All view but reachable via the In flight filter pill.
   */
  inFlightAmount: number;
}

interface PwoEntry {
  id: string;
  amount: number;
  linked_party: string | null;
  source_id: string | null;
  target_wallet_user_id: string | null;
  description: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface PortfolioInfo {
  id: string;
  portfolio_code: string | null;
  account_name: string | null;
  investor_id: string;
  payment_method?: 'mobile_money' | 'bank_transfer' | 'cash' | null;
  mobile_network?: 'MTN' | 'Airtel' | null;
  mobile_money_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  account_number?: string | null;
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

type FilterMode = 'all' | 'inflight' | 'reattempt' | 'fresh';

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
  const [prefillPayout, setPrefillPayout] = useState<any>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [partnerWithdrawalStatus, setPartnerWithdrawalStatus] = useState<Record<string, string>>({});
  const [partnerWithdrawalIds, setPartnerWithdrawalIds] = useState<Record<string, string>>({});
  const [strictWithdrawableByPartner, setStrictWithdrawableByPartner] = useState<Record<string, number>>({});
  // Set of partner IDs whose proxy assignment to this agent is a MANAGED
  // account. For managed accounts, ROI funds land in the AGENT's wallet on
  // disbursement (not the partner's), per the Managed-Proxy Payout Routing
  // contract. The partner's strict withdrawable will stay at 0 by design,
  // so we must NOT clamp the card's open balance against it.
  const [managedPartnerIds, setManagedPartnerIds] = useState<Set<string>>(() => new Set());
  // Sum of in-flight (pending/processing/manager_approved/cfo_approved/requested)
  // withdrawal amounts per partner. Treated as already-paid for display so the
  // card disappears from the default view the instant Caro initiates.
  const [activeWithdrawalsByPartner, setActiveWithdrawalsByPartner] = useState<Record<string, number>>({});
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
  // Custody V2: partner UUIDs we currently render. Used to scope a second
  // realtime channel (withdrawal_requests rows now belong to the partner,
  // not the agent — `user_id=eq.<agent>` no longer catches them).
  const [partnerIdsForRealtime, setPartnerIdsForRealtime] = useState<string[]>([]);
  const [portfolioIdsForRealtime, setPortfolioIdsForRealtime] = useState<string[]>([]);
  // Optimistic submit lock: partner ids whose Withdraw button has just been
  // submitted. Prevents double-tap before realtime/settlement catches up.
  const [submittingPartnerIds, setSubmittingPartnerIds] = useState<Set<string>>(new Set());
  const partnerRealtimeKey = partnerIdsForRealtime.join(',');
  const portfolioRealtimeKey = portfolioIdsForRealtime.join(',');
  useEffect(() => {
    if (!user?.id) return;
    loadProxyFunds();
  }, [user?.id]);

  // Real-time subscription: auto-refresh when withdrawal statuses change.
  // Covers BOTH legacy agent-owned rows (`user_id = agent`) AND Custody V2
  // rows where the partner is the legal owner (`user_id = partner`). Without
  // the second filter, withdrawal cards never disappear after submission
  // because the partner-owned insert doesn't match the agent filter.
  useEffect(() => {
    if (!user?.id) return;

    const reload = () => loadProxyFunds(false);

    const agentChannel = supabase
      .channel(`proxy-withdrawal-updates-agent-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proxy_agent_assignments',
          filter: `agent_id=eq.${user.id}`,
        },
        reload,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_proxy_card_dismissals',
          filter: `agent_id=eq.${user.id}`,
        },
        reload,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_wallet_operations',
          filter: `target_wallet_user_id=eq.${user.id}`,
        },
        reload,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawal_requests',
          filter: `user_id=eq.${user.id}`,
        },
        reload,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawal_requests',
          filter: `agent_id=eq.${user.id}`,
        },
        reload,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proxy_payout_settlements',
          filter: `agent_id=eq.${user.id}`,
        },
        reload,
      )
      .subscribe();

    // Per-partner channel — re-subscribed whenever the partner set changes.
    let partnerChannel: ReturnType<typeof supabase.channel> | null = null;
    if (partnerIdsForRealtime.length > 0 || portfolioIdsForRealtime.length > 0) {
      partnerChannel = supabase.channel(
        `proxy-withdrawal-updates-partners-${user.id}`,
      );
      partnerIdsForRealtime.forEach((pid) => {
        partnerChannel!.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'withdrawal_requests',
            filter: `user_id=eq.${pid}`,
          },
          reload,
        );
      });
      portfolioIdsForRealtime.forEach((portfolioId) => {
        partnerChannel!.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'pending_wallet_operations',
            filter: `source_id=eq.${portfolioId}`,
          },
          reload,
        );
      });
      partnerChannel.subscribe();
    }

    return () => {
      supabase.removeChannel(agentChannel);
      if (partnerChannel) supabase.removeChannel(partnerChannel);
    };
  }, [user?.id, partnerRealtimeKey, portfolioRealtimeKey]);

  const loadProxyFunds = async (showSpinner = true) => {
    if (!user?.id) return;
    if (showSpinner) setLoading(true);
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
        setActiveWithdrawalsByPartner({});
        setLastTerminalByPartner({});
        setStrictWithdrawableByPartner({});
        setPartnerIdsForRealtime([]);
        setPortfolioIdsForRealtime([]);
        setLoading(false);
        return;
      }
      // Two sources of CFO-approved ROI payouts the agent should see:
      //
      //   (A) LEGACY custody — `pending_wallet_operations.target_wallet_user_id
      //       = agent.id`. The credit was parked on the agent's wallet and
      //       the agent withdraws on behalf of the partner.
      //
      //   (B) PROXY CUSTODY v2 — credit lands directly on the partner's
      //       wallet (target_wallet_user_id IS NULL or = partner.id). The
      //       agent is bridged to the partner via an active, approved row
      //       in `proxy_agent_assignments`. Without this branch, partners
      //       like SSENKAALI PIUS never appear in the proxy list after CFO
      //       approval.
      //
      // Both branches require: category='roi_payout', status='approved',
      // metadata.coo_approved_by NOT NULL (full Partner Ops → COO → CFO
      // chain), and source_id resolving to an `investor_portfolios` row.
      // Branch (A) additionally requires reviewed_by ∈ CFO ids; branch (B)
      // trusts the proxy_agent_assignments approval as the bridge.

      // Resolve active proxy partners delegated to this agent (Custody v2).
      const { data: proxyAssignments } = await supabase
        .from('proxy_agent_assignments')
        .select('beneficiary_id, is_managed_account')
        .eq('agent_id', user.id)
        .eq('is_active', true)
        .eq('approval_status', 'approved');
      const proxyPartnerIds = Array.from(
        new Set((proxyAssignments || []).map((r: any) => r.beneficiary_id).filter(Boolean)),
      ) as string[];
      const managedSet = new Set<string>(
        (proxyAssignments || [])
          .filter((r: any) => r.is_managed_account && r.beneficiary_id)
          .map((r: any) => r.beneficiary_id as string),
      );
      setManagedPartnerIds(managedSet);

      // Source IDs (portfolios) belonging to those proxy partners.
      let v2PortfolioIds: string[] = [];
      if (proxyPartnerIds.length > 0) {
        const { data: v2Portfolios } = await supabase
          .from('investor_portfolios')
          .select('id')
          .in('investor_id', proxyPartnerIds);
        v2PortfolioIds = (v2Portfolios || []).map((p: any) => p.id);
      }

      const [legacyRes, v2Res] = await Promise.all([
        supabase
          .from('pending_wallet_operations')
          .select('id, amount, linked_party, source_id, target_wallet_user_id, description, metadata, created_at')
          .eq('target_wallet_user_id', user.id)
          .eq('category', 'roi_payout')
          .eq('status', 'approved')
          .in('reviewed_by', cfoIds)
          .not('metadata->coo_approved_by', 'is', null)
          .not('source_id', 'is', null)
          .order('created_at', { ascending: false }),
        v2PortfolioIds.length > 0
          ? supabase
              .from('pending_wallet_operations')
              .select('id, amount, linked_party, source_id, target_wallet_user_id, description, metadata, created_at')
              .eq('category', 'roi_payout')
              .eq('status', 'approved')
              .not('metadata->coo_approved_by', 'is', null)
              .in('source_id', v2PortfolioIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (legacyRes.error) throw legacyRes.error;
      if ((v2Res as any).error) throw (v2Res as any).error;

      const mergedById = new Map<string, PwoEntry>();
      ((legacyRes.data || []) as PwoEntry[]).forEach((op) => mergedById.set(op.id, op));
      ((v2Res as any).data || []).forEach((op: PwoEntry) => mergedById.set(op.id, op));
      let rawOps = Array.from(mergedById.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      // ── Settlement filter ─────────────────────────────────────────────
      // Drop any approval already settled by a delivered withdrawal.
      // This is the SOLE source of truth for "this approval is closed" — no
      // more guessing from balance math.
      if (rawOps.length > 0) {
        const { data: settledRows } = await supabase
          .from('proxy_payout_settlements')
          .select('approval_id')
          .in('approval_id', rawOps.map((o) => o.id));
        const settledIds = new Set((settledRows || []).map((r: any) => r.approval_id));
        if (settledIds.size > 0) {
          rawOps = rawOps.filter((o) => !settledIds.has(o.id));
        }
      }
      setPortfolioIdsForRealtime(v2PortfolioIds);

      if (rawOps.length === 0) {
        setProfiles({});
        setCompletedWithdrawals([]);
        setPortfolios([]);
        setPartnerWithdrawalStatus({});
        setActiveWithdrawalsByPartner({});
        setLastTerminalByPartner({});
        setStrictWithdrawableByPartner({});
        setPartnerIdsForRealtime([]);
        setApprovedOps([]);
        setLoading(false);
        return;
      }

      // Step 2: Collect portfolio IDs first to resolve actual partner (investor) IDs
      const portfolioIds = new Set<string>();
      rawOps.forEach(op => {
        if (op.source_id) portfolioIds.add(op.source_id);
      });
      const uniquePortfolioIds = [...portfolioIds];

      // Fetch portfolios first so we can resolve partner IDs
      let fetchedPortfolios: PortfolioInfo[] = [];
      if (uniquePortfolioIds.length > 0) {
        const { data: portfolioData } = await supabase
          .from('investor_portfolios')
          .select('id, portfolio_code, account_name, investor_id, payment_method, mobile_network, mobile_money_number, bank_name, bank_account_name, account_number')
          .in('id', uniquePortfolioIds);
        fetchedPortfolios = (portfolioData || []) as PortfolioInfo[];
      }
      setPortfolios(fetchedPortfolios);

      // Build portfolio→investor map
      const portfolioToInvestor: Record<string, string> = {};
      fetchedPortfolios.forEach(p => { portfolioToInvestor[p.id] = p.investor_id; });

      const validProxyPartnerIds = new Set(proxyPartnerIds);
      const ops = rawOps.filter((op) => {
        const investor = op.source_id ? portfolioToInvestor[op.source_id] : null;
        const targetWalletUserId = op.target_wallet_user_id;
        const belongsToCurrentAgent = !targetWalletUserId
          || targetWalletUserId === user.id
          || targetWalletUserId === investor;
        return !!investor
          && investor !== user.id
          && validProxyPartnerIds.has(investor)
          && belongsToCurrentAgent;
      });
      setApprovedOps(ops);

      if (ops.length === 0) {
        setProfiles({});
        setCompletedWithdrawals([]);
        setPartnerWithdrawalStatus({});
        setActiveWithdrawalsByPartner({});
        setLastTerminalByPartner({});
        setStrictWithdrawableByPartner({});
        setPartnerIdsForRealtime([]);
        setLoading(false);
        return;
      }

      // Partner identity is ALWAYS the portfolio's investor_id. Any op whose
      // source_id no longer maps to a portfolio is dropped — it cannot be
      // tied to a real CFO-approved partner return.
      const partnerIds = new Set<string>();
      ops.forEach(op => {
        const investor = op.source_id ? portfolioToInvestor[op.source_id] : null;
        if (investor && investor !== user.id) partnerIds.add(investor);
      });

      const uniquePartnerIds = [...partnerIds];
      // Publish the partner set so the realtime effect can subscribe to
      // `user_id=eq.<partner>` — that's where Custody V2 rows live.
      setPartnerIdsForRealtime(uniquePartnerIds);

      if (uniquePartnerIds.length === 0) {
        setProfiles({});
        setCompletedWithdrawals([]);
        setPartnerWithdrawalStatus({});
        setActiveWithdrawalsByPartner({});
        setLastTerminalByPartner({});
        setLoading(false);
        return;
      }

      // Step 4: Fetch profiles, completed withdrawals, active withdrawals, and
      // terminal-unpaid history in parallel
      const [profileRes, completedRes, activeWithdrawalRes, terminalRes, strictBalanceRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', uniquePartnerIds),
        // Completed withdrawals for these partners (already delivered)
        // Custody V2: partner-owned rows (`user_id = partner`, no
        // `linked_party`). Legacy: agent-owned rows (`user_id = agent`,
        // `linked_party = partner`). Pull both, dedupe in JS.
        supabase
          .from('withdrawal_requests')
          .select('id, user_id, linked_party, amount, status, reason, updated_at, created_at')
          .in('user_id', [user.id, ...uniquePartnerIds])
          .in('status', [...COMPLETED_PROXY_WITHDRAWAL_STATUSES])
          .or(`linked_party.not.is.null,agent_id.eq.${user.id}`),
        // Active (pending/processing) withdrawal requests — same dual scope.
        supabase
          .from('withdrawal_requests')
          .select('id, user_id, linked_party, status, reason, amount, updated_at, created_at, agent_id')
          .in('user_id', [user.id, ...uniquePartnerIds])
          .in('status', [...ACTIVE_PROXY_WITHDRAWAL_STATUSES])
          .or(`linked_party.not.is.null,agent_id.eq.${user.id}`),
        // Terminal-unpaid: rejected / expired / cancelled.
        supabase
          .from('withdrawal_requests')
          .select('id, user_id, linked_party, status, rejection_reason, updated_at, created_at, agent_id')
          .in('user_id', [user.id, ...uniquePartnerIds])
          .in('status', [...TERMINAL_UNPAID_STATUSES])
          .or(`linked_party.not.is.null,agent_id.eq.${user.id}`)
          // Defense-in-depth: only consider terminal events from the last 7 days
          // so old rejections naturally fall off Caro's view.
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('updated_at', { ascending: false })
          .limit(500),
        supabase
          .from('v_user_wallet_strict')
          .select('user_id, withdrawable')
          // Include the AGENT's own row so the managed-proxy clamp can use
          // the agent's strict withdrawable (managed funds land in agent
          // wallet, not partner wallet).
          .in('user_id', [user.id, ...uniquePartnerIds]),
      ]);

      const profileMap: Record<string, { full_name: string; phone: string }> = {};
      (profileRes.data || []).forEach(p => {
        profileMap[p.id] = { full_name: p.full_name || 'Unknown', phone: p.phone || '' };
      });
      setProfiles(profileMap);
      const strictMap: Record<string, number> = {};
      (strictBalanceRes.data || []).forEach((row: any) => {
        strictMap[row.user_id] = Number(row.withdrawable) || 0;
      });
      setStrictWithdrawableByPartner(strictMap);
      // Resolve a partner key for every row: prefer linked_party (legacy
      // custody), fall back to user_id when it matches a known partner
      // (Custody V2). Anything that doesn't resolve is dropped.
      const resolvePartnerKey = (w: any): string | null => {
        if (w.linked_party && uniquePartnerIds.includes(w.linked_party)) {
          return w.linked_party;
        }
        if (w.user_id && uniquePartnerIds.includes(w.user_id)) {
          return w.user_id;
        }
        return null;
      };
      const completedNormalized = (completedRes.data || [])
        .map((w: any) => ({ ...w, linked_party: resolvePartnerKey(w) }))
        .filter((w: any) => !!w.linked_party);
      setCompletedWithdrawals(completedNormalized);

      // Build active withdrawal status map + ID map
      const statusMap: Record<string, string> = {};
      const idMap: Record<string, string> = {};
      // Sum of in-flight amounts per partner — used to silently hide cards from
      // the default view once Caro has initiated a withdrawal for them.
      const activeAmountByPartner: Record<string, number> = {};
      // Track the most recent active-withdrawal timestamp per partner so we
      // can suppress stale terminal banners that have been superseded.
      const lastActiveAtByPartner: Record<string, string> = {};
      (activeWithdrawalRes.data || []).forEach((w: any) => {
        const partnerKey = resolvePartnerKey(w);
        // Preserve original portfolio key behavior (legacy uses linked_party
        // as the per-portfolio key when present; Custody V2 has no portfolio
        // hint so we fall back to the partner UUID).
        const portfolioKey = w.linked_party || partnerKey;
        const wAmt = Number(w.amount) || 0;

        if (partnerKey) {
          const ts = w.updated_at || w.created_at;
          if (ts && (!lastActiveAtByPartner[partnerKey] || ts > lastActiveAtByPartner[partnerKey])) {
            lastActiveAtByPartner[partnerKey] = ts;
          }
          activeAmountByPartner[partnerKey] =
            (activeAmountByPartner[partnerKey] || 0) + wAmt;
          if (portfolioKey) {
            const existing = statusMap[portfolioKey];
            if (!existing || w.status === 'pending') {
              statusMap[portfolioKey] = w.status;
              idMap[portfolioKey] = w.id;
            }
          }
          const existing = statusMap[partnerKey];
          if (!existing || w.status === 'pending') {
            statusMap[partnerKey] = w.status;
            idMap[partnerKey] = w.id;
          }
          return;
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
              activeAmountByPartner[pid] = (activeAmountByPartner[pid] || 0) + wAmt;
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
      setActiveWithdrawalsByPartner(activeAmountByPartner);

      // Track the most recent successful (delivered) withdrawal timestamp per
      // partner — a terminal event older than this means Caro already
      // re-requested and got paid, so the destructive banner is outdated.
      const lastSuccessAtByPartner: Record<string, string> = {};
      (completedRes.data || []).forEach((w: any) => {
        const pid = resolvePartnerKey(w);
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
        const pid = resolvePartnerKey(w);
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

      // Load this agent's dismissals (cards she has manually cleared)
      const { data: dismissalRows } = await supabase
        .from('agent_proxy_card_dismissals')
        .select('partner_id, portfolio_id, snapshot_amount, dismissed_at, reason')
        .eq('agent_id', user.id);
      setDismissals((dismissalRows || []) as Dismissal[]);
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

  // Dismissal lookup by `${partnerId}-${portfolioId || 'none'}`
  const dismissalMap = useMemo(() => {
    const map: Record<string, Dismissal> = {};
    dismissals.forEach(d => {
      const key = `${d.partner_id}-${d.portfolio_id || 'none'}`;
      map[key] = d;
    });
    return map;
  }, [dismissals]);

  const partnerBalances = useMemo<PartnerBalance[]>(() => {
    if (!user?.id) return [];

    // Build partner-level approved ROI history, then allocate ONLY the live
    // unsettled amount (strict withdrawable + in-flight holds) onto the newest
    // CFO-approved ROI items first. This prevents old paid approvals from being
    // revived by later balances and showing as stale proxy cards.
    const opsByPartner: Record<string, Array<{ portfolioId: string; amount: number; createdAt: string; op: PwoEntry }>> = {};
    approvedOps.forEach((op) => {
      if (!op.source_id) return;
      const portfolio = portfolioMap[op.source_id];
      if (!portfolio) return;
      const partnerId = portfolio.investor_id;
      const amount = Number(op.amount) || 0;
      if (!partnerId || partnerId === user.id || amount <= 0) return;
      if (!opsByPartner[partnerId]) opsByPartner[partnerId] = [];
      opsByPartner[partnerId].push({
        portfolioId: op.source_id,
        amount,
        createdAt: op.created_at,
        op,
      });
    });

    // NOTE: We intentionally do NOT subtract `completedWithdrawals` from the
    // approved total here. `proxy_payout_settlements` is the sole source of
    // truth for "this approval is closed" and `loadProxyFunds` already drops
    // any approval whose id appears in that table (see the settlement filter
    // above). Subtracting completed withdrawal_requests on top of that
    // double-counts unrelated legacy deliveries against an open approval —
    // e.g. a settled 806,400 legacy payout was eating into an unrelated
    // 7,180,000 Custody-v2 approval, showing 6,373,600 instead of 7,180,000.
    // The `liveOpen` clamp below (strict withdrawable + in-flight) is the
    // live ceiling that keeps the card honest.

    const groupMap: Record<string, {
      partnerId: string;
      portfolioId: string | null;
      totalAmount: number;
      availableAmount: number;
      inFlightAmount: number;
    }> = {};

    Object.entries(opsByPartner).forEach(([partnerId, rows]) => {
      const totalApproved = rows.reduce((sum, row) => sum + row.amount, 0);
      const totalInFlight = activeWithdrawalsByPartner[partnerId] || 0;
      const historicalOpen = Math.max(0, totalApproved);
      // For MANAGED proxy partners the disbursement lands in the agent's
      // wallet (per Managed-Proxy Payout Routing) — the partner's strict
      // withdrawable stays at 0 by design. Clamping against it would hide
      // the card forever. Use the agent's strict withdrawable as the live
      // ceiling in that case; for non-managed partners keep clamping
      // against their own wallet (existing behaviour).
      const isManaged = managedPartnerIds.has(partnerId);
      const ceilingSource = isManaged
        ? (strictWithdrawableByPartner[user?.id ?? ''] ?? historicalOpen)
        : (strictWithdrawableByPartner[partnerId] ?? historicalOpen);
      const liveOpen = Math.max(
        0,
        Math.min(historicalOpen, ceilingSource + totalInFlight),
      );
      if (liveOpen <= 50) return;

      let remainingOpen = liveOpen;
      let remainingInFlight = Math.min(totalInFlight, liveOpen);
      rows
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .forEach((row) => {
          if (remainingOpen <= 50) return;
          const allocated = Math.min(row.amount, remainingOpen);
          const inFlightAllocated = Math.min(allocated, remainingInFlight);
          const availableAllocated = allocated - inFlightAllocated;
          remainingOpen -= allocated;
          remainingInFlight -= inFlightAllocated;

          const key = `${partnerId}-${row.portfolioId}`;
          if (!groupMap[key]) {
            groupMap[key] = {
              partnerId,
              portfolioId: row.portfolioId,
              totalAmount: 0,
              availableAmount: 0,
              inFlightAmount: 0,
            };
          }
          groupMap[key].totalAmount += allocated;
          groupMap[key].availableAmount += availableAllocated;
          groupMap[key].inFlightAmount += inFlightAllocated;
        });
    });

    return Object.entries(groupMap)
      .filter(([, g]) => g.totalAmount > 0)
      .map(([, group]) => {
        const pInfo = group.portfolioId ? portfolioMap[group.portfolioId] : null;
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
          totalWithdrawn: 0,
          available: Math.round(group.availableAmount),
          inFlightAmount: Math.round(group.inFlightAmount),
        };
      })
      // Auto-hide cards with negligible balance (rounding dust) and apply
      // agent-side dismissal: once Caro dismisses a card it stays hidden
      // permanently. New ROI accrual no longer un-hides it — she must
      // explicitly Restore it from the "Show N hidden cards" sheet. This is
      // intentional: dismissals carry a written reason ("ALREADY PAID AND
      // EXPIRED" etc.) that should not be silently overridden by a tiny
      // ledger accrual.
      .filter((partner) => {
        // Keep zero-balance cards that are zero ONLY because of an in-flight
        // withdrawal — they need to remain reachable via the In flight pill so
        // Caro can cancel a mistaken withdrawal.
        if (partner.available <= 50 && partner.inFlightAmount <= 50) return false;
        const dKey = `${partner.partnerId}-${partner.portfolioId || 'none'}`;
        const d = dismissalMap[dKey];
        if (d) return false;
        return true;
      })
      .sort((a, b) => {
        if (b.available !== a.available) return b.available - a.available;
        if (b.totalReturns !== a.totalReturns) return b.totalReturns - a.totalReturns;
        return a.partnerName.localeCompare(b.partnerName);
      });
  }, [approvedOps, completedWithdrawals, activeWithdrawalsByPartner, strictWithdrawableByPartner, managedPartnerIds, profiles, portfolioMap, dismissalMap, user?.id]);

  const handleWithdraw = async (partner: PartnerBalance) => {
    setSelectedPartnerId(partner.partnerId);
    setPrefillAmount(partner.available);

    const portfolioLabel = partner.portfolioCode
      ? ` (Portfolio: ${partner.accountName || partner.portfolioCode})`
      : '';
    setPrefillReason(`Proxy payout delivery for ${partner.partnerName}${portfolioLabel}`);

    // Auto-populate payout destination from the portfolio's saved payment
    // details (set by Partner Ops). If a portfolio has its own payment
    // method configured, the agent's withdrawal form will pre-fill MoMo /
    // bank details so they don't re-key.
    const pInfo = partner.portfolioId ? portfolioMap[partner.portfolioId] : null;
    if (pInfo?.payment_method) {
      if (pInfo.payment_method === 'mobile_money') {
        setPrefillPayout({
          payoutMode: pInfo.mobile_network === 'Airtel' ? 'airtel' : 'mtn',
          momoNumber: pInfo.mobile_money_number || '',
          momoName: pInfo.account_name || partner.partnerName || '',
        });
      } else if (pInfo.payment_method === 'bank_transfer') {
        setPrefillPayout({
          payoutMode: 'bank',
          bankName: pInfo.bank_name || '',
          bankAccountName: pInfo.bank_account_name || partner.partnerName || '',
          bankAccountNumber: pInfo.account_number || '',
        });
      } else if (pInfo.payment_method === 'cash') {
        setPrefillPayout({ payoutMode: 'cash' });
      } else {
        setPrefillPayout(null);
      }
    } else {
      setPrefillPayout(null);
    }

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
    // Optimistic lock: instantly disable Withdraw on this partner's card so
    // the agent can't double-submit before realtime catches up.
    if (selectedPartnerId) {
      setSubmittingPartnerIds((prev) => {
        const next = new Set(prev);
        next.add(selectedPartnerId);
        return next;
      });
    }
    // Refresh immediately for snappy UX, then again shortly after to catch
    // any trigger-side updates (audit log, status forwarding, etc.) that
    // commit a beat after the insert.
    loadProxyFunds();
    setTimeout(() => loadProxyFunds(), 800);
    setTimeout(() => loadProxyFunds(), 2500);
    // Release the optimistic lock after a generous window — by then DB
    // realtime + settlement insert has resolved the card.
    setTimeout(() => {
      setSubmittingPartnerIds((prev) => {
        const next = new Set(prev);
        if (selectedPartnerId) next.delete(selectedPartnerId);
        return next;
      });
    }, 5000);
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

  // Card key used for selection / dismissal storage
  const getCardKey = (partner: PartnerBalance) =>
    `${partner.partnerId}-${partner.portfolioId || 'none'}`;

  const toggleSelect = (partner: PartnerBalance) => {
    const key = getCardKey(partner);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openClearDialog = (partners: PartnerBalance[]) => {
    if (partners.length === 0) return;
    setClearTargets(partners.map(p => ({
      partnerId: p.partnerId,
      portfolioId: p.portfolioId,
      amount: p.available,
      partnerName: p.partnerName,
    })));
    setClearReason('');
    setClearConfirmOpen(true);
  };

  const confirmClear = async () => {
    if (!user?.id || clearTargets.length === 0) return;
    setClearing(true);
    try {
      const rows = clearTargets.map(t => ({
        agent_id: user.id,
        partner_id: t.partnerId,
        portfolio_id: t.portfolioId,
        snapshot_amount: t.amount,
        reason: clearReason.trim() || null,
      }));
      const { error } = await supabase
        .from('agent_proxy_card_dismissals')
        .upsert(rows, { onConflict: 'agent_id,partner_id,portfolio_id' });
      if (error) throw error;

      // Audit + system event (fire-and-forget)
      try {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action_type: 'agent_proxy_card_dismissed',
          table_name: 'agent_proxy_card_dismissals',
          metadata: {
            count: clearTargets.length,
            partners: clearTargets.map(t => t.partnerName),
            reason: clearReason.trim() || 'No reason provided by agent.',
          },
        });
      } catch (e) {
        console.warn('audit log failed', e);
      }

      toast.success(`Cleared ${clearTargets.length} card${clearTargets.length === 1 ? '' : 's'}`, {
        description: 'They will reappear if new returns accrue for the partner.',
      });
      setSelectedKeys(new Set());
      setSelectMode(false);
      setClearConfirmOpen(false);
      setClearTargets([]);
      setClearReason('');
      loadProxyFunds();
    } catch (err: any) {
      toast.error('Failed to clear', { description: err.message });
    } finally {
      setClearing(false);
    }
  };

  const restoreDismissal = async (partnerId: string, portfolioId: string | null) => {
    if (!user?.id) return;
    const restoreKey = `${partnerId}-${portfolioId || 'none'}`;
    setRestoringKey(restoreKey);
    try {
      let q = supabase
        .from('agent_proxy_card_dismissals')
        .delete()
        .eq('agent_id', user.id)
        .eq('partner_id', partnerId);
      q = portfolioId ? q.eq('portfolio_id', portfolioId) : q.is('portfolio_id', null);
      const { error } = await q;
      if (error) throw error;
      toast.success('Card restored');
      loadProxyFunds();
    } catch (err: any) {
      toast.error('Failed to restore', { description: err.message });
    } finally {
      setRestoringKey(null);
    }
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
    | { kind: 'inflight' }
    | { kind: 'reattempt'; terminal: LastTerminal }
    | { kind: 'fresh' } => {
    const key = getStatusKey(partner);
    if (partnerWithdrawalStatus[key]) return { kind: 'active' };
    // Card has zero available because Caro already initiated — surface it
    // under the In flight pill but hide it from the default All view.
    if (partner.inFlightAmount > 50 && partner.available <= 50) {
      return { kind: 'inflight' };
    }
    const t = lastTerminalByPartner[partner.partnerId];
    if (t) return { kind: 'reattempt', terminal: t };
    return { kind: 'fresh' };
  };

  const inFlightCount = partnerBalances.filter((p) => {
    const kind = classify(p).kind;
    return kind === 'inflight' || kind === 'active';
  }).length;
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
    const c = classify(p);
    // Default All view hides in-flight/active cards — once Caro initiates a
    // withdrawal the partner is treated as paid and the card disappears.
    if (filterMode === 'all') return c.kind !== 'inflight' && c.kind !== 'active';
    if (filterMode === 'inflight') return c.kind === 'inflight' || c.kind === 'active';
    if (filterMode === 'reattempt') return c.kind === 'reattempt';
    if (filterMode === 'fresh') return c.kind === 'fresh';
    return true;
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground px-1">
        Mirrors the CFO ROI Payout Queue 1:1 — every card here is a return the CFO
        has signed off for delivery to your proxy partner. Balances shown are
        <span className="font-medium text-foreground"> withdrawable now</span>.
      </p>

      <div className="flex flex-wrap gap-1.5 px-1">
        <Button
          size="sm"
          variant={filterMode === 'all' ? 'default' : 'outline'}
          className="h-7 text-xs gap-1"
          onClick={() => setFilterMode('all')}
        >
          All ({partnerBalances.length - inFlightCount})
        </Button>
        <Button
          size="sm"
          variant={filterMode === 'inflight' ? 'default' : 'outline'}
          className="h-7 text-xs gap-1"
          onClick={() => setFilterMode('inflight')}
          disabled={inFlightCount === 0}
        >
          <Hourglass className="h-3 w-3" />
          In flight ({inFlightCount})
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
        <Button
          size="sm"
          variant={selectMode ? 'default' : 'outline'}
          className="h-7 text-xs gap-1"
          onClick={() => {
            setSelectMode(s => !s);
            setSelectedKeys(new Set());
          }}
          disabled={visibleBalances.length === 0}
        >
          <CheckSquare className="h-3 w-3" />
          {selectMode ? 'Cancel select' : 'Select to clear'}
        </Button>
      </div>

      {selectMode && (
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-xs">
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => {
              const allKeys = new Set(visibleBalances.map(p => getCardKey(p)));
              const allSelected = visibleBalances.every(p => selectedKeys.has(getCardKey(p)));
              setSelectedKeys(allSelected ? new Set() : allKeys);
            }}
          >
            {visibleBalances.every(p => selectedKeys.has(getCardKey(p))) && selectedKeys.size > 0
              ? 'Unselect all'
              : `Select all visible (${visibleBalances.length})`}
          </button>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs gap-1"
            disabled={selectedKeys.size === 0}
            onClick={() => openClearDialog(
              visibleBalances.filter(p => selectedKeys.has(getCardKey(p)))
            )}
          >
            <Trash2 className="h-3 w-3" />
            Clear {selectedKeys.size} selected
          </Button>
        </div>
      )}

      {visibleBalances.map((partner) => {
        const statusKey = getStatusKey(partner);
        const hasPending = !!partnerWithdrawalStatus[statusKey];
        const statusBadge = getStatusBadge(partner);
        const cardKey = `${partner.partnerId}-${partner.portfolioId || 'none'}`;
        const currentStatus = partnerWithdrawalStatus[statusKey];
        const canCancel = currentStatus ? ACTIVE_PROXY_WITHDRAWAL_STATUSES.includes(currentStatus as typeof ACTIVE_PROXY_WITHDRAWAL_STATUSES[number]) : false;
        const classification = classify(partner);
        const isSubmitting = submittingPartnerIds.has(partner.partnerId);

        return (
          <Card
            key={cardKey}
            className={`border-border/50 shadow-sm ${selectMode && selectedKeys.has(cardKey) ? 'ring-2 ring-primary' : ''}`}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  {selectMode && (
                    <Checkbox
                      checked={selectedKeys.has(cardKey)}
                      onCheckedChange={() => toggleSelect(partner)}
                      className="mt-0.5"
                    />
                  )}
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
                  {!selectMode && !hasPending && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="Clear this card"
                      onClick={() => openClearDialog([partner])}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
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

              {(hasPending && canCancel) || isSubmitting ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1"
                    disabled
                  >
                    {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                    {isSubmitting
                      ? 'Submitting…'
                      : currentStatus === 'pending' || currentStatus === 'requested'
                      ? 'Withdrawal Pending'
                      : 'Withdrawal In Progress'}
                  </Button>
                  {hasPending && canCancel && !isSubmitting && (
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
                  )}
                </div>
              ) : (
                <Button
                  size="sm"
                  className="w-full gap-1"
                  onClick={() => handleWithdraw(partner)}
                  disabled={partner.available <= 0 || hasPending || isSubmitting}
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
        prefillPayout={prefillPayout}
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

      {/* Hidden cards footer */}
      {dismissals.length > 0 && (
        <button
          type="button"
          onClick={() => setHiddenSheetOpen(true)}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 underline-offset-2 hover:underline"
        >
          <Eye className="inline h-3 w-3 mr-1" />
          Show {dismissals.length} hidden card{dismissals.length === 1 ? '' : 's'}
        </button>
      )}

      {/* Hidden cards sheet */}
      <Sheet open={hiddenSheetOpen} onOpenChange={setHiddenSheetOpen}>
        <SheetContent side="bottom" className="h-[70dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Hidden Partner Cards</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2 overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">
              These cards are hidden from your main list. They will reappear automatically if new returns accrue above the snapshot amount.
            </p>
            {dismissals.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No hidden cards.</p>
            )}
            {dismissals.map(d => {
              const restoreKey = `${d.partner_id}-${d.portfolio_id || 'none'}`;
              const profile = profiles[d.partner_id];
              const portfolio = d.portfolio_id ? portfolioMap[d.portfolio_id] : null;
              return (
                <div key={restoreKey} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{profile?.full_name || 'Unknown partner'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {portfolio?.account_name || portfolio?.portfolio_code || '—'} · Snapshot {formatAmount(Number(d.snapshot_amount))}
                    </p>
                    {d.reason && (
                      <p className="text-[10px] text-muted-foreground/80 italic truncate">"{d.reason}"</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 shrink-0"
                    disabled={restoringKey === restoreKey}
                    onClick={() => restoreDismissal(d.partner_id, d.portfolio_id)}
                  >
                    {restoringKey === restoreKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Restore
                  </Button>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Clear confirmation dialog */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={(open) => {
        setClearConfirmOpen(open);
        if (!open) { setClearTargets([]); setClearReason(''); }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear {clearTargets.length} card{clearTargets.length === 1 ? '' : 's'} from your list?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This only hides {clearTargets.length === 1 ? 'this card' : 'these cards'} from your view. No financial records are deleted. The card will reappear if new returns accrue for the partner.
                </p>
                {clearTargets.length <= 5 && (
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                    {clearTargets.map(t => (
                      <li key={`${t.partnerId}-${t.portfolioId || 'none'}`}>
                        <span className="text-foreground font-medium">{t.partnerName}</span> — {formatAmount(t.amount)}
                      </li>
                    ))}
                  </ul>
                )}
                <div>
                  <Label className="text-xs font-medium">Reason (optional)</Label>
                  <Textarea
                    placeholder="e.g. Already paid in cash / partner contacted / awaiting partner response"
                    value={clearReason}
                    onChange={e => setClearReason(e.target.value)}
                    maxLength={300}
                    rows={2}
                    className="mt-1"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Keep on list</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClear}
              disabled={clearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
              Yes, clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
