import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import {
  Loader2, Wallet, Landmark, AlertTriangle, RefreshCw,
  Smartphone, Signal, Building2, Banknote,
  TrendingUp, TrendingDown, Minus, ChevronRight, Users
} from 'lucide-react';
import { subDays, startOfMonth } from 'date-fns';

interface Props {
  onNavigate?: (tab: string) => void;
}

const CHANNELS = [
  { key: 'mtn', label: 'MTN Mobile Money', icon: Smartphone, color: 'bg-amber-500' },
  { key: 'airtel', label: 'Airtel Money', icon: Signal, color: 'bg-red-500' },
  { key: 'bank', label: 'Bank Transfer', icon: Building2, color: 'bg-blue-500' },
  { key: 'cash', label: 'Cash Collection', icon: Banknote, color: 'bg-emerald-500' },
];

export function CFODashboardOverview({ onNavigate }: Props) {
  const [agentPeriod, setAgentPeriod] = useState<'daily' | 'monthly'>('monthly');

  // ── Platform vs Wallet data ──
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['cfo-platform-vs-wallets'],
    queryFn: async () => {
      const { data: wallets } = await supabase.from('wallets').select('balance');
      const totalWallets = (wallets || []).reduce((s, w) => s + (w.balance || 0), 0);

      const revenueCategories = ['tenant_access_fee', 'access_fee', 'tenant_request_fee', 'request_fee', 'platform_service_income', 'landlord_platform_fee', 'management_fee'];
      const costCategories = ['supporter_platform_rewards', 'supporter_reward', 'investment_reward', 'roi_payout', 'agent_commission_payout', 'agent_commission', 'agent_payout', 'agent_approval_bonus', 'referral_bonus', 'transaction_platform_expenses', 'operational_expenses', 'platform_expense'];
      const allPlatformRows: any[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: page } = await supabase
          .from('general_ledger')
          .select('amount, direction, category')
          .eq('ledger_scope', 'platform')
          .neq('category', 'opening_balance')
          .range(offset, offset + 999);
        if (page && page.length > 0) {
          allPlatformRows.push(...page);
          offset += 1000;
          hasMore = page.length === 1000;
        } else {
          hasMore = false;
        }
      }
      const sumByCat = (rows: any[], cats: string[]) => rows.filter(r => cats.includes(r.category)).reduce((s, r) => s + Number(r.amount), 0);
      const pIn = allPlatformRows.filter(e => e.direction === 'cash_in');
      const pOut = allPlatformRows.filter(e => e.direction === 'cash_out');
      const rev = sumByCat(pIn, revenueCategories) || sumByCat(pOut, revenueCategories);
      const costs = sumByCat(pOut, costCategories) || sumByCat(pIn, costCategories);
      const platformNet = Math.max(0, rev - costs);

      const { data: allIn } = await supabase
        .from('general_ledger').select('amount')
        .eq('direction', 'cash_in').in('ledger_scope', ['wallet', 'bridge']);
      const allCashIn = (allIn || []).reduce((s, e) => s + (e.amount || 0), 0);

      const { data: allOut } = await supabase
        .from('general_ledger').select('amount')
        .eq('direction', 'cash_out').in('ledger_scope', ['wallet', 'bridge']);
      const allCashOut = (allOut || []).reduce((s, e) => s + (e.amount || 0), 0);

      const ledgerNetWallets = allCashIn - allCashOut;
      const variance = totalWallets - ledgerNetWallets;

      return { totalWallets, platformNet, variance };
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  // ── Channel data ──
  const { data: deposits = [] } = useQuery({
    queryKey: ['channel-deposits-tracker'],
    queryFn: async () => {
      const { data } = await supabase
        .from('deposit_requests')
        .select('amount, provider, status, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(200);
      return data || [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ['channel-withdrawals-tracker'],
    queryFn: async () => {
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('amount, payout_method, status, created_at')
        .eq('status', 'completed')
        .limit(200);
      return data || [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const channelData = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    return CHANNELS.map(ch => {
      const chDeposits = deposits.filter((d: any) => {
        const p = (d.provider || '').toLowerCase();
        if (ch.key === 'mtn') return p.includes('mtn');
        if (ch.key === 'airtel') return p.includes('airtel');
        if (ch.key === 'bank') return p.includes('bank');
        if (ch.key === 'cash') return p.includes('cash') || p.includes('agent') || p.includes('receipt');
        return false;
      });

      const chWithdrawals = withdrawals.filter((w: any) => {
        const m = (w.payout_method || '').toLowerCase();
        if (ch.key === 'mtn') return m.includes('mtn');
        if (ch.key === 'airtel') return m.includes('airtel');
        if (ch.key === 'bank') return m.includes('bank');
        if (ch.key === 'cash') return m.includes('cash') || m.includes('agent');
        return false;
      });

      const totalIn = chDeposits.reduce((s: number, d: any) => s + Number(d.amount), 0);
      const totalOut = chWithdrawals.reduce((s: number, w: any) => s + Number(w.amount), 0);
      const netBalance = totalIn - totalOut;

      const todayTx = chDeposits.filter((d: any) => new Date(d.created_at) >= today).length;

      const weekIn = chDeposits
        .filter((d: any) => new Date(d.created_at) >= weekAgo)
        .reduce((s: number, d: any) => s + Number(d.amount), 0);

      const prevWeekStart = new Date(weekAgo.getTime() - 7 * 86400000);
      const prevWeekIn = chDeposits
        .filter((d: any) => { const dt = new Date(d.created_at); return dt >= prevWeekStart && dt < weekAgo; })
        .reduce((s: number, d: any) => s + Number(d.amount), 0);

      const trend = prevWeekIn > 0 ? ((weekIn - prevWeekIn) / prevWeekIn) * 100 : 0;

      return { ...ch, netBalance, todayTx, trend, txCount: chDeposits.length };
    });
  }, [deposits, withdrawals]);

  // ── Agent performance ──
  const dateFrom = useMemo(() => {
    if (agentPeriod === 'daily') return subDays(new Date(), 1).toISOString();
    return startOfMonth(new Date()).toISOString();
  }, [agentPeriod]);

  const { data: rankings = [], isLoading: rankingsLoading } = useQuery({
    queryKey: ['agent-performance-rankings', dateFrom],
    queryFn: async () => {
      let query = supabase
        .from('rent_requests')
        .select('id, agent_id, tenant_id, total_repayment, amount_repaid, status, created_at')
        .not('agent_id', 'is', null);
      if (dateFrom) query = query.gte('created_at', dateFrom);
      const { data: requests } = await query.limit(1000);
      if (!requests?.length) return [];

      const agentMap = new Map<string, { totalCollected: number; tenants: Set<string>; count: number }>();
      for (const rr of requests) {
        if (!rr.agent_id) continue;
        const existing = agentMap.get(rr.agent_id) || { totalCollected: 0, tenants: new Set<string>(), count: 0 };
        existing.totalCollected += rr.amount_repaid || 0;
        existing.tenants.add(rr.tenant_id);
        existing.count += 1;
        agentMap.set(rr.agent_id, existing);
      }

      const agentIds = [...agentMap.keys()];
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', agentIds);
      const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name || 'Unknown']));

      return agentIds.map(id => {
        const d = agentMap.get(id)!;
        return {
          agentId: id,
          name: nameMap.get(id) || 'Unknown',
          totalCollected: d.totalCollected,
          tenantCount: d.tenants.size,
        };
      }).sort((a, b) => b.totalCollected - a.totalCollected).slice(0, 5);
    },
  });

  const isLoading = summaryLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const totalWallets = summaryData?.totalWallets ?? 0;
  const platformNet = summaryData?.platformNet ?? 0;
  const variance = summaryData?.variance ?? 0;
  const hasVariance = Math.abs(variance) >= 100;

  const tiers = ['Elite', 'Gold', 'Silver', 'Bronze', 'Standard'];
  const getTier = (idx: number) => tiers[Math.min(idx, tiers.length - 1)];

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <div className="space-y-3">
        {/* User Wallets */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">User Wallets</p>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight">{formatUGX(totalWallets)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Live aggregate across all wallets</p>
        </div>

        {/* Platform Ledger */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-accent/10">
              <Landmark className="h-5 w-5 text-accent-foreground" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Platform Ledger</p>
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-emerald-600">{formatUGX(platformNet)}</p>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Syncing in real-time
          </p>
        </div>

        {/* System Variance */}
        <div className={`rounded-2xl p-5 shadow-sm ${hasVariance ? 'bg-gradient-to-br from-red-500/10 via-pink-500/10 to-orange-500/10 border border-red-500/20' : 'border border-border bg-card'}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2.5 rounded-xl ${hasVariance ? 'bg-red-500/15' : 'bg-emerald-500/10'}`}>
              <AlertTriangle className={`h-5 w-5 ${hasVariance ? 'text-red-500' : 'text-emerald-500'}`} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">System Variance</p>
          </div>
          <p className={`text-2xl font-bold font-mono tracking-tight ${hasVariance ? 'text-red-500' : 'text-emerald-600'}`}>
            {formatUGX(Math.abs(variance))}
          </p>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-muted-foreground">
              {hasVariance ? 'Discrepancy detected — action required' : 'System balanced ✓'}
            </p>
            {hasVariance && (
              <button
                onClick={() => onNavigate?.('reconciliation')}
                className="text-[11px] font-semibold text-red-500 hover:text-red-400 flex items-center gap-0.5 transition-colors"
              >
                Reconcile Now <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Active Channels ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Active Channels</h2>
          <button
            onClick={() => onNavigate?.('reconciliation')}
            className="text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
          >
            View All Network Traffic <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-2">
          {channelData.map(ch => {
            const Icon = ch.icon;
            const TrendIcon = ch.trend > 5 ? TrendingUp : ch.trend < -5 ? TrendingDown : Minus;
            const trendColor = ch.trend > 5 ? 'text-emerald-500' : ch.trend < -5 ? 'text-red-500' : 'text-muted-foreground';

            return (
              <div key={ch.key} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
                <div className={`p-2.5 rounded-full ${ch.color} shrink-0`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{ch.label}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {ch.todayTx.toLocaleString()} TRANSACTIONS TODAY
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono">{formatUGX(ch.netBalance)}</p>
                  <span className={`flex items-center justify-end gap-0.5 text-[10px] font-semibold ${trendColor}`}>
                    <TrendIcon className="h-3 w-3" />
                    {ch.trend > 0 ? '+' : ''}{Math.abs(ch.trend).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Agent Performance ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Agent Performance</h2>
          <div className="flex rounded-full border border-border bg-muted/50 p-0.5">
            <button
              onClick={() => setAgentPeriod('daily')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${agentPeriod === 'daily' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Daily
            </button>
            <button
              onClick={() => setAgentPeriod('monthly')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${agentPeriod === 'monthly' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Monthly
            </button>
          </div>
        </div>

        {/* Table header */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Agent Detail</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tenants Managed</p>
        </div>

        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden shadow-sm">
          {rankingsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rankings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No agent data found.</p>
          ) : (
            rankings.map((agent, idx) => (
              <div key={agent.agentId} className="flex items-center gap-3 px-3.5 py-3">
                {/* Rank badge */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${idx < 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {idx + 1}
                </div>
                {/* Avatar placeholder */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {agent.name.charAt(0)}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{agent.name}</p>
                  <p className="text-[10px] text-muted-foreground">{getTier(idx)} Tier</p>
                </div>
                {/* Tenant count */}
                <div className="bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-bold shrink-0">
                  {agent.tenantCount}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
