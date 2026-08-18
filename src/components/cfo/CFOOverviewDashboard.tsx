import { useState, useCallback } from 'react';
import { useCFOOverviewData } from '@/hooks/useCFOOverviewData';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Loader2, ArrowDownRight, ArrowUpRight, Scale, Wallet, HandCoins, Users, TrendingUp,
  Banknote, FileSpreadsheet, ShieldCheck, AlertTriangle, Timer, Percent, Landmark,
  Receipt, Activity, ClipboardCheck, ChevronRight, Info, CalendarDays, Download,
  PiggyBank, Flame, BarChart3, Package, LineChart as LineChartIcon,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  Line, ComposedChart,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KPIBreakdownSheet } from '@/components/cfo/KPIBreakdownSheet';
import { CashSourcesSheet } from '@/components/cfo/CashSourcesSheet';
import { ROIPayableForecast } from '@/components/cfo/ROIPayableForecast';
import { CFOActionsLog } from '@/components/cfo/CFOActionsLog';
import { LedgerMaintenancePanel } from '@/components/cfo/LedgerMaintenancePanel';
import { AgentAdvancesStatsCard } from '@/components/cfo/AgentAdvancesStatsCard';

interface CFOOverviewDashboardProps {
  onTabChange?: (tab: string) => void;
}

const fmt = (n: number) =>
  `${n < 0 ? '-' : ''}UGX ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(n))}`;

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
};

export function CFOOverviewDashboard({ onTabChange }: CFOOverviewDashboardProps) {
  const [exportingCommissions, setExportingCommissions] = useState(false);
  const [activeBreakdown, setActiveBreakdown] = useState<string | null>(null);
  const { user } = useAuth();
  const {
    platformCash, liabilities, revenue, receivables, moneyFlow,
    todayCashFlow, integrityChecks, pendingApprovals, treasuryControls, refetchControls,
    isLoading
  } = useCFOOverviewData();

  const handleToggleControl = useCallback(async (controlKey: string, newValue: boolean) => {
    const { error } = await supabase
      .from('treasury_controls' as any)
      .update({ enabled: newValue, updated_at: new Date().toISOString() } as any)
      .eq('control_key', controlKey);
    if (error) {
      toast.error(`Failed to update ${controlKey}`);
    } else {
      toast.success(`${controlKey.replace(/_/g, ' ')} ${newValue ? 'enabled' : 'disabled'}`);
      refetchControls();
    }
  }, [refetchControls]);

  const handleExportCommissions = useCallback(async () => {
    setExportingCommissions(true);
    try {
      // Fetch all commission records with agent names
      const { data, error } = await supabase
        .from('commission_accrual_ledger')
        .select('id, agent_id, source_type, source_id, amount, status, earned_at, approved_at, paid_at, description, percentage, event_type, commission_role, repayment_amount, rent_request_id')
        .order('earned_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast.info('No commission records found');
        setExportingCommissions(false);
        return;
      }

      // Get unique agent IDs and fetch names
      const agentIds = [...new Set(data.map(r => r.agent_id).filter(Boolean))] as string[];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', agentIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      // Build CSV
      const headers = ['Agent Name', 'Phone', 'Amount (UGX)', 'Status', 'Commission Role', 'Event Type', 'Source Type', 'Percentage (%)', 'Repayment Amount', 'Description', 'Earned At', 'Approved At', 'Paid At'];
      const rows = data.map(r => {
        const profile = profileMap.get(r.agent_id || '');
        return [
          profile?.full_name || 'Unknown',
          profile?.phone || '',
          r.amount,
          r.status,
          r.commission_role || '',
          r.event_type || '',
          r.source_type || '',
          r.percentage || '',
          r.repayment_amount || '',
          (r.description || '').replace(/,/g, ';'),
          r.earned_at ? new Date(r.earned_at).toLocaleDateString() : '',
          r.approved_at ? new Date(r.approved_at).toLocaleDateString() : '',
          r.paid_at ? new Date(r.paid_at).toLocaleDateString() : '',
        ].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent_commission_report_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.length} commission records`);
    } catch (e: any) {
      toast.error(e.message || 'Export failed');
    } finally {
      setExportingCommissions(false);
    }
  }, []);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalCash = platformCash?.totalCash ?? 0;
  const totalReceivables = receivables?.totalReceivables ?? 0;
  const totalLiabilities = liabilities?.totalLiabilities ?? 0;
  const walletTotal = liabilities?.tenantFunds ?? 0;
  const moneyWeCanUse = Math.max(0, totalCash - walletTotal);
  const solvencyRatio = totalLiabilities > 0 ? ((totalCash + totalReceivables) / totalLiabilities) * 100 : 100;
  const netToday = todayCashFlow?.netToday ?? 0;

  /* ── CFO command-deck derivations (reporting layer only) ── */
  const revenueTotal = revenue?.totalRevenue ?? 0;
  const expenseTotal = revenue?.totalExpenses ?? 0;
  const netProfit = revenue?.netProfit ?? 0;
  const netMargin = revenueTotal > 0 ? (netProfit / revenueTotal) * 100 : 0;

  const liquidityCoverage = walletTotal > 0 ? (totalCash / walletTotal) * 100 : 100;
  const netWorkingCapital = totalCash + totalReceivables - totalLiabilities;

  const burn30d = moneyFlow?.totalOutflows ?? 0;
  const dailyBurn = burn30d / 30;
  const runwayDays = dailyBurn > 0 ? moneyWeCanUse / dailyBurn : null;

  const advancesIssued = receivables?.advancesPrincipal ?? 0;
  const advancesOutstandingAll = receivables?.advancesOutstandingAll ?? 0;
  const recoveryRate = advancesIssued > 0
    ? ((receivables?.advancesRecovered ?? 0) / advancesIssued) * 100
    : 100;

  const controlBreaches =
    (integrityChecks?.walletDriftCount ?? 0) +
    (integrityChecks?.missingGroupCount ?? 0) +
    (integrityChecks?.negativeLedgerCount ?? 0);

  const trend = revenue?.trend ?? [];
  const trendMax = Math.max(1, ...trend.map((t) => t.amount));

  const statusTone = (ok: boolean, warn: boolean) =>
    warn ? 'text-amber-600' : ok ? 'text-emerald-600' : 'text-destructive';

  const liabilityItems = [
    { label: 'Total Wallet Balances', value: liabilities?.tenantFunds ?? 0, icon: <Wallet className="h-4 w-4" /> },
  ];

  /* ── presentation-only derivations (no new data sources) ── */
  const firstName = (() => {
    const raw = (user?.user_metadata as any)?.full_name || user?.email || '';
    const first = String(raw).split(/[\s@.]+/)[0] || '';
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there';
  })();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const actionTrail = [
    {
      label: 'Payouts Awaiting Approval',
      severity: (pendingApprovals?.count ?? 0) > 0 ? 'High' : 'Low',
      count: pendingApprovals?.count ?? 0,
      amount: pendingApprovals?.totalAmount ?? 0,
      tab: 'withdrawals',
    },
    {
      label: 'Reconciliation Exceptions',
      severity: (integrityChecks?.missingGroupCount ?? 0) > 0 ? 'High' : 'Low',
      count: integrityChecks?.missingGroupCount ?? 0,
      amount: null as number | null,
      tab: 'reconciliation',
    },
    {
      label: 'Wallet Drift',
      severity: (integrityChecks?.walletDriftCount ?? 0) > 0 ? 'Medium' : 'Low',
      count: integrityChecks?.walletDriftCount ?? 0,
      amount: null as number | null,
      tab: 'ledger-health',
    },
    {
      label: 'Negative Balances',
      severity: (integrityChecks?.negativeLedgerCount ?? 0) > 0 ? 'High' : 'Low',
      count: integrityChecks?.negativeLedgerCount ?? 0,
      amount: null as number | null,
      tab: 'ledger-health',
    },
    {
      label: 'Advances Outstanding',
      severity: 'Medium',
      count: null as number | null,
      amount: advancesOutstandingAll,
      tab: 'advances',
    },
  ];

  const trendChartData = trend.map((t) => ({
    label: t.date.slice(5),
    revenue: t.amount,
  }));

  const advancesChartData = [
    { label: 'Issued', disbursed: advancesIssued, recovered: 0 },
    { label: 'Recovered', disbursed: 0, recovered: receivables?.advancesRecovered ?? 0 },
    { label: 'Outstanding', disbursed: advancesOutstandingAll, recovered: 0 },
  ];

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ══════════════ GREETING HEADER ══════════════ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {greeting}, {firstName} <span aria-hidden>👋</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here's what's happening with Welile today.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-card text-xs font-medium">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {todayLabel}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl gap-2 text-xs"
            onClick={handleExportCommissions}
            disabled={exportingCommissions}
          >
            {exportingCommissions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </Button>
        </div>
      </div>

      {/* ── PAY TO WALLET ── */}
      {onTabChange && (
        <button
          onClick={() => onTabChange('wallet-payout')}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-left shadow-lg"
        >
          <div className="h-11 w-11 rounded-xl bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Send Money to a Wallet</p>
            <p className="text-xs opacity-80">Credit or debit any user instantly</p>
          </div>
          <ArrowUpRight className="h-5 w-5 opacity-60 shrink-0" />
        </button>
      )}

      {/* ══════════════ THREE HEADLINE CARDS ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HeroCard
          icon={<PiggyBank className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50 dark:bg-emerald-950/40"
          title="Money We Have"
          value={fmt(totalCash)}
          valueColor="text-emerald-600"
          items={[
            { dot: 'bg-emerald-500', label: 'Platform / Treasury Balance', value: fmt(platformCash?.a1 ?? 0) },
            { dot: 'bg-emerald-500', label: 'Cash in Transit (A5)', value: fmt(platformCash?.a5 ?? 0) },
          ]}
          footer="Total available across all accounts"
          footerTone="bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
          onClick={() => setActiveBreakdown('cash')}
        />
        <HeroCard
          icon={<Package className="h-5 w-5 text-orange-600" />}
          iconBg="bg-orange-50 dark:bg-orange-950/40"
          title="Money We Owe"
          value={fmt(walletTotal)}
          valueColor="text-orange-600"
          items={[
            { dot: 'bg-orange-500', label: 'Withdrawable User Wallets', value: fmt(walletTotal) },
            { dot: 'bg-orange-500', label: 'All Recorded Liabilities', value: fmt(totalLiabilities) },
          ]}
          footer="Commitments not yet paid out"
          footerTone="bg-orange-50/70 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400"
          onClick={() => setActiveBreakdown('wallets')}
        />
        <HeroCard
          icon={<BarChart3 className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50 dark:bg-blue-950/40"
          title="Money We Can Use"
          value={fmt(moneyWeCanUse)}
          valueColor={moneyWeCanUse >= 0 ? 'text-blue-600' : 'text-destructive'}
          items={[
            { dot: 'bg-blue-500', label: 'Available for Operations', value: fmt(moneyWeCanUse) },
          ]}
          footer="After obligations and restrictions"
          footerTone="bg-blue-50/70 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
          onClick={() => setActiveBreakdown('earnings')}
        />
      </div>

      {/* ══════════════ CFO ACTION TRAIL ══════════════ */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <ClipboardCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">CFO Action Trail</p>
                <p className="text-xs text-muted-foreground">Items that need your attention</p>
              </div>
            </div>
            {onTabChange && (
              <button
                onClick={() => onTabChange('reconciliation')}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
              >
                View all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 divide-y xl:divide-y-0 xl:divide-x divide-border">
            {actionTrail.map((item) => (
              <TrailItem
                key={item.label}
                label={item.label}
                severity={item.severity}
                count={item.count}
                amount={item.amount}
                amountLabel={item.amount === null ? null : fmt(item.amount)}
                onClick={onTabChange ? () => onTabChange(item.tab) : undefined}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ══════════════ KPI STRIP ══════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiTile icon={<Banknote className="h-4 w-4 text-emerald-600" />} iconBg="bg-emerald-50 dark:bg-emerald-950/40" label="Cash Balance" value={fmt(totalCash)} caption="Bank + in transit" />
        <KpiTile icon={<Flame className="h-4 w-4 text-destructive" />} iconBg="bg-red-50 dark:bg-red-950/40" label="Daily Burn" value={fmt(dailyBurn)} caption="30-day average" />
        <KpiTile icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} iconBg="bg-emerald-50 dark:bg-emerald-950/40" label="Revenue" value={fmt(revenueTotal)} caption="Life to date" />
        <KpiTile icon={<Receipt className="h-4 w-4 text-orange-600" />} iconBg="bg-orange-50 dark:bg-orange-950/40" label="Total Expenses" value={fmt(expenseTotal)} caption="Life to date" />
        <KpiTile icon={<Scale className="h-4 w-4 text-blue-600" />} iconBg="bg-blue-50 dark:bg-blue-950/40" label="Net Working Capital" value={fmt(netWorkingCapital)} caption="Cash + receivables − debt" valueColor={netWorkingCapital >= 0 ? undefined : 'text-destructive'} />
        <KpiTile icon={<Banknote className="h-4 w-4 text-emerald-600" />} iconBg="bg-emerald-50 dark:bg-emerald-950/40" label="Net Result" value={fmt(netProfit)} caption="Revenue − expenses" valueColor={netProfit >= 0 ? 'text-emerald-600' : 'text-destructive'} />
        <KpiTile icon={<Percent className="h-4 w-4 text-purple-600" />} iconBg="bg-purple-50 dark:bg-purple-950/40" label="Net Margin" value={`${netMargin.toFixed(1)}%`} caption="Net ÷ revenue" valueColor={netMargin >= 0 ? undefined : 'text-destructive'} />
        <KpiTile icon={<Users className="h-4 w-4 text-amber-600" />} iconBg="bg-amber-50 dark:bg-amber-950/40" label="Receivables" value={fmt(totalReceivables)} caption="Tenant + advances" />
      </div>

      {/* ══════════════ CHARTS ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <p className="font-semibold text-sm">Revenue — Last 7 Days</p>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <LineChartIcon className="h-3.5 w-3.5" /> UGX
              </span>
            </div>
            {trendChartData.length > 0 ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tickFormatter={(v: number) => fmtShort(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={52} />
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar name="Revenue (UGX)" dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={22} />
                    <Line name="Trend" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-10 text-center">No revenue recorded in the last 7 days.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <p className="font-semibold text-sm">Advances — Disbursed vs Recovered</p>
              <span className="text-[11px] text-muted-foreground">{recoveryRate.toFixed(0)}% recovered</span>
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={advancesChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tickFormatter={(v: number) => fmtShort(v)} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={52} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Disbursed (UGX)" dataKey="disbursed" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                  <Bar name="Recovered (UGX)" dataKey="recovered" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ══════════════ CFO COMMAND DECK ══════════════ */}

      {/* 1. LIQUIDITY & SOLVENCY — the first thing a global CFO checks */}
      <Card className="rounded-2xl border-primary/20">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Liquidity &amp; Solvency</p>
              <p className="text-[11px] text-muted-foreground">Can we meet every obligation today?</p>
            </div>
            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-muted ${statusTone(liquidityCoverage >= 110, liquidityCoverage >= 100 && liquidityCoverage < 110)}`}>
              {liquidityCoverage >= 110 ? 'Healthy' : liquidityCoverage >= 100 ? 'Watch' : 'Breach'}
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <DeckStat
              icon={<Percent className="h-4 w-4" />}
              label="Liquidity coverage"
              value={`${liquidityCoverage.toFixed(0)}%`}
              caption="Cash ÷ withdrawable obligations"
              tone={statusTone(liquidityCoverage >= 110, liquidityCoverage >= 100 && liquidityCoverage < 110)}
            />
            <DeckStat
              icon={<Scale className="h-4 w-4" />}
              label="Solvency ratio"
              value={`${solvencyRatio.toFixed(0)}%`}
              caption="(Cash + receivables) ÷ liabilities"
              tone={statusTone(solvencyRatio >= 120, solvencyRatio >= 100 && solvencyRatio < 120)}
            />
            <DeckStat
              icon={<Landmark className="h-4 w-4" />}
              label="Net working capital"
              value={fmtShort(netWorkingCapital)}
              caption="Cash + receivables − liabilities"
              tone={netWorkingCapital >= 0 ? 'text-emerald-600' : 'text-destructive'}
            />
            <DeckStat
              icon={<Timer className="h-4 w-4" />}
              label="Cash runway"
              value={runwayDays === null ? '∞' : `${runwayDays.toFixed(0)}d`}
              caption={`Burn ${fmtShort(dailyBurn)}/day (30d avg)`}
              tone={statusTone((runwayDays ?? 999) >= 60, (runwayDays ?? 999) >= 30 && (runwayDays ?? 999) < 60)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 2. PROFITABILITY — revenue, cost, margin, 7-day revenue shape */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Profitability (life to date)</p>
            <p className="text-[11px] text-muted-foreground">Platform-scope revenue against cost of doing business.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <DeckStat icon={<TrendingUp className="h-4 w-4" />} label="Revenue" value={fmtShort(revenueTotal)} caption="all recognised inflow" tone="text-emerald-600" />
            <DeckStat icon={<Receipt className="h-4 w-4" />} label="Cost & expenses" value={fmtShort(expenseTotal)} caption="all recognised outflow" tone="text-destructive" />
            <DeckStat icon={<Banknote className="h-4 w-4" />} label="Net result" value={fmtShort(netProfit)} caption="revenue − expenses" tone={netProfit >= 0 ? 'text-emerald-600' : 'text-destructive'} />
            <DeckStat icon={<Percent className="h-4 w-4" />} label="Net margin" value={`${netMargin.toFixed(1)}%`} caption="net ÷ revenue" tone={netMargin >= 0 ? 'text-emerald-600' : 'text-destructive'} />
          </div>
          {trend.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Revenue, last 7 days</p>
              <div className="flex items-end gap-1.5 h-16">
                {trend.map((t) => (
                  <div key={t.date} className="flex-1 flex flex-col items-center gap-1" title={`${t.date}: ${fmt(t.amount)}`}>
                    <div
                      className="w-full rounded-t bg-primary/70"
                      style={{ height: `${Math.max(2, (t.amount / trendMax) * 100)}%` }}
                    />
                    <span className="text-[9px] text-muted-foreground">{t.date.slice(8)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. RECEIVABLES & CREDIT QUALITY */}
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Receivables &amp; credit quality</p>
            <p className="text-[11px] text-muted-foreground">What the field owes us, and how well it comes back.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <DeckStat icon={<HandCoins className="h-4 w-4" />} label="Total receivables" value={fmtShort(totalReceivables)} caption="tenant + active advances" tone="text-amber-600" />
            <DeckStat icon={<Users className="h-4 w-4" />} label="Tenant outstanding" value={fmtShort(receivables?.tenantOutstanding ?? 0)} caption="accumulated rent debt" tone="text-amber-600" />
            <DeckStat icon={<HandCoins className="h-4 w-4" />} label="Advances outstanding" value={fmtShort(advancesOutstandingAll)} caption={`of ${fmtShort(advancesIssued)} issued`} tone="text-amber-600" />
            <DeckStat icon={<ShieldCheck className="h-4 w-4" />} label="Recovery rate" value={`${recoveryRate.toFixed(0)}%`} caption="advances repaid to date" tone={statusTone(recoveryRate >= 80, recoveryRate >= 60 && recoveryRate < 80)} />
          </div>
        </CardContent>
      </Card>

      {/* 4. CONTROL TOWER — integrity + what is waiting on the CFO's signature */}
      <Card className={`rounded-2xl ${controlBreaches > 0 ? 'border-destructive/40' : ''}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Control tower</p>
              <p className="text-[11px] text-muted-foreground">Ledger integrity and decisions waiting on you.</p>
            </div>
            {controlBreaches > 0 ? (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {controlBreaches} issue{controlBreaches === 1 ? '' : 's'}</span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" /> Clean</span>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <DeckStat icon={<Activity className="h-4 w-4" />} label="Wallet drift" value={`${integrityChecks?.walletDriftCount ?? 0}`} caption="cache vs ledger pivot" tone={(integrityChecks?.walletDriftCount ?? 0) > 0 ? 'text-destructive' : 'text-emerald-600'} />
            <DeckStat icon={<Scale className="h-4 w-4" />} label="Unbalanced groups" value={`${integrityChecks?.missingGroupCount ?? 0}`} caption="legs missing a counterpart" tone={(integrityChecks?.missingGroupCount ?? 0) > 0 ? 'text-destructive' : 'text-emerald-600'} />
            <DeckStat icon={<AlertTriangle className="h-4 w-4" />} label="Negative balances" value={`${integrityChecks?.negativeLedgerCount ?? 0}`} caption="overdrawn wallets" tone={(integrityChecks?.negativeLedgerCount ?? 0) > 0 ? 'text-destructive' : 'text-emerald-600'} />
            <DeckStat icon={<ClipboardCheck className="h-4 w-4" />} label="Awaiting approval" value={`${pendingApprovals?.count ?? 0}`} caption={`${fmtShort(pendingApprovals?.totalAmount ?? 0)} at stake`} tone={(pendingApprovals?.count ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          </div>
          {onTabChange && (
            <div className="flex flex-wrap gap-2 pt-1">
              <DeckLink label="Reconciliation" onClick={() => onTabChange('reconciliation')} />
              <DeckLink label="Ledger health" onClick={() => onTabChange('ledger-health')} />
              <DeckLink label="Withdrawals" onClick={() => onTabChange('withdrawals')} />
              <DeckLink label="Balance sheet" onClick={() => onTabChange('statements')} />
              <DeckLink label="Cashflow forecast" onClick={() => onTabChange('cashflow-forecast')} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── AGENT ADVANCES ── */}
      {(receivables?.advancesPrincipal ?? 0) > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-purple-600" /> Agent Advances
            </p>
            <span className="text-xs text-muted-foreground">
              {Object.entries(receivables?.advanceStatusCounts ?? {})
                .map(([s, c]) => `${c} ${s}`)
                .join(' · ')}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[11px] text-muted-foreground">Issued</p>
              <p className="text-sm font-semibold">{fmtShort(receivables?.advancesPrincipal ?? 0)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Recovered</p>
              <p className="text-sm font-semibold text-emerald-600">{fmtShort(receivables?.advancesRecovered ?? 0)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Outstanding</p>
              <p className="text-sm font-semibold text-amber-600">{fmtShort(receivables?.advancesOutstandingAll ?? 0)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── TODAY'S MOVEMENT ── */}
      <Card className="rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Today's Money Flow</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            <FlowCell
              label="Came In"
              value={fmtShort(todayCashFlow?.cashInToday ?? 0)}
              color="text-emerald-600"
              icon={<ArrowDownRight className="h-4 w-4" />}
              onClick={() => setActiveBreakdown('cashIn')}
            />
            <FlowCell
              label="Went Out"
              value={fmtShort(todayCashFlow?.cashOutToday ?? 0)}
              color="text-destructive"
              icon={<ArrowUpRight className="h-4 w-4" />}
              onClick={() => setActiveBreakdown('cashOut')}
            />
            <FlowCell
              label="Net Change"
              value={`${netToday >= 0 ? '+' : ''}${fmtShort(netToday)}`}
              color={netToday >= 0 ? 'text-emerald-600' : 'text-destructive'}
              icon={<Scale className="h-4 w-4" />}
              onClick={() => setActiveBreakdown('netCash')}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── BALANCE CHECK ── */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Balance Check
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            Our cash should equal what we owe users + what we can use.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap text-center">
            <ValueChip label="Cash" value={fmtShort(totalCash)} variant="blue" />
            <span className="text-lg font-bold text-muted-foreground">=</span>
            <ValueChip label="We Owe" value={fmtShort(walletTotal)} variant="amber" />
            <span className="text-lg font-bold text-muted-foreground">+</span>
            <ValueChip label="We Can Use" value={fmtShort(moneyWeCanUse)} variant="emerald" />
          </div>
          {(() => {
            const diff = totalCash - walletTotal - moneyWeCanUse;
            const diffPct = totalCash > 0 ? Math.abs(diff / totalCash) * 100 : 0;
            return (
              <p className={`text-xs text-center mt-3 font-medium ${diffPct > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {diffPct > 1 ? `⚠️ ${diffPct.toFixed(1)}% difference (${fmtShort(diff)}) — check recent transactions` : `✅ Balanced (${diffPct.toFixed(1)}% variance)`}
              </p>
            );
          })()}
        </CardContent>
      </Card>

      {/* ── ROI PAYABLE FORECAST ── */}
      <ROIPayableForecast />

      {/* ── CFO ACTIONS LOG ── */}
      <CFOActionsLog />

      {/* ── LEDGER MAINTENANCE WINDOW ── */}
      <LedgerMaintenancePanel />

      {/* ── EXPORT COMMISSION REPORT ── */}
      <Button
        variant="outline"
        className="w-full gap-2 rounded-2xl h-12"
        onClick={handleExportCommissions}
        disabled={exportingCommissions}
      >
        {exportingCommissions ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        {exportingCommissions ? 'Exporting...' : 'Download Agent Commission Report'}
      </Button>

      {/* ── SOURCES OF CASH (replaces channel breakdown) ── */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Where Our Money Comes From</p>
          <div className="space-y-1.5">
            {(platformCash?.increases ?? []).slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate text-foreground">{item.label}</span>
                  <span className="text-muted-foreground shrink-0">({item.count})</span>
                </div>
                <span className="font-mono font-semibold text-emerald-600 shrink-0">+{fmtShort(item.value)}</span>
              </div>
            ))}
          </div>
          {(platformCash?.increases?.length ?? 0) > 6 && (
            <button onClick={() => setActiveBreakdown('cash')} className="text-xs text-primary mt-2 hover:underline">
              View all sources →
            </button>
          )}
        </CardContent>
      </Card>

      {/* ── AUTO-PAYOUTS ── */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Automatic Payments</p>
          <p className="text-xs text-muted-foreground mb-4">Toggle which payouts happen automatically. Each is checked against available cash first.</p>
          <div className="space-y-3">
            {[
              { key: 'auto_roi', label: 'Investor Returns', desc: 'Pay investors automatically' },
              { key: 'auto_salaries', label: 'Staff Salaries', desc: 'Monthly payroll' },
              { key: 'auto_commissions', label: 'Agent Commissions', desc: 'Agent earnings payouts' },
              { key: 'auto_advances', label: 'Advance Payments', desc: 'Pre-approved advances' },
            ].map((ctrl) => (
              <div key={ctrl.key} className="flex items-center justify-between py-2 px-1">
                <div>
                  <p className="text-sm font-medium">{ctrl.label}</p>
                  <p className="text-xs text-muted-foreground">{ctrl.desc}</p>
                </div>
                <Switch
                  checked={treasuryControls?.[ctrl.key] ?? false}
                  onCheckedChange={(val) => handleToggleControl(ctrl.key, val)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── BREAKDOWNS ── */}
      <CashSourcesSheet
        open={activeBreakdown === 'cash'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        totalCash={totalCash}
        a1={platformCash?.a1 ?? 0}
        a5={platformCash?.a5 ?? 0}
        increases={platformCash?.increases ?? []}
        decreases={platformCash?.decreases ?? []}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'wallets'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="What We Owe — Breakdown"
        total={totalLiabilities}
        items={liabilityItems}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'earnings'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="Money We Can Use — Breakdown"
        total={moneyWeCanUse}
        items={[
          { label: 'Total Cash (Money We Have)', value: totalCash, icon: <ArrowDownRight className="h-4 w-4 text-emerald-500" /> },
          { label: 'User Wallets (Money We Owe)', value: -walletTotal, icon: <ArrowUpRight className="h-4 w-4 text-destructive" /> },
        ]}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'cashIn'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="Money In Today"
        total={todayCashFlow?.cashInToday ?? 0}
        items={Object.entries(todayCashFlow?.inflowCategories ?? {}).map(([cat, val]) => ({
          label: cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: val,
        }))}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'cashOut'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="Money Out Today"
        total={todayCashFlow?.cashOutToday ?? 0}
        items={Object.entries(todayCashFlow?.outflowCategories ?? {}).map(([cat, val]) => ({
          label: cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: val,
        }))}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'netCash'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="Net Change Today"
        total={todayCashFlow?.netToday ?? 0}
        items={[
          { label: 'Money In', value: todayCashFlow?.cashInToday ?? 0, icon: <ArrowDownRight className="h-4 w-4 text-emerald-500" /> },
          { label: 'Money Out', value: -(todayCashFlow?.cashOutToday ?? 0), icon: <ArrowUpRight className="h-4 w-4 text-destructive" /> },
        ]}
      />
      {/* ── FLOATING PAY FAB (mobile only) ── */}
      {onTabChange && (
        <button
          onClick={() => onTabChange('wallet-payout')}
          className="fixed bottom-6 right-6 z-50 lg:hidden h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Send Money"
        >
          <Wallet className="h-6 w-6" />
        </button>
      )}

      {/* ── AGENT ADVANCES — FULL PORTFOLIO STATS & CHART (bottom) ── */}
      <AgentAdvancesStatsCard />
    </div>
  );
}

/* ── Sub-components ── */

function HeroCard({ icon, iconBg, title, value, valueColor, items, footer, footerTone, onClick }: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  value: string;
  valueColor: string;
  items: { dot: string; label: string; value: string }[];
  footer: string;
  footerTone: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-border bg-card overflow-hidden hover:shadow-md active:scale-[0.995] transition-all"
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
            <p className="font-semibold text-sm truncate">{title}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
        <p className={`mt-4 text-xl sm:text-2xl font-bold font-mono tabular-nums tracking-tight ${valueColor}`}>{value}</p>
        <div className="mt-4 pt-4 border-t border-border space-y-2.5">
          {items.map((it) => (
            <div key={it.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2 min-w-0 text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${it.dot}`} />
                <span className="truncate">{it.label}</span>
              </span>
              <span className="font-mono tabular-nums font-medium shrink-0">{it.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={`flex items-center justify-between gap-2 px-4 sm:px-5 py-2.5 text-[11px] font-medium ${footerTone}`}>
        <span className="truncate">{footer}</span>
        <Info className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </div>
    </button>
  );
}

function TrailItem({ label, severity, count, amount, amountLabel, onClick }: {
  label: string;
  severity: string;
  count: number | null;
  amount: number | null;
  amountLabel: string | null;
  onClick?: () => void;
}) {
  const tone =
    severity === 'High'
      ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
      : severity === 'Medium'
        ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
        : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400';
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left px-0 xl:px-4 py-3 xl:py-0 hover:bg-muted/30 transition-colors min-w-0"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${tone}`}>{severity}</span>
          <span className="text-xs font-medium truncate">{label}</span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground font-mono tabular-nums">
        {count !== null && <>{count} item{count === 1 ? '' : 's'}</>}
        {count !== null && amountLabel ? ' · ' : ''}
        {amountLabel}
      </p>
    </button>
  );
}

function KpiTile({ icon, iconBg, label, value, caption, valueColor }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; caption: string; valueColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
        <p className="text-[11px] font-medium text-muted-foreground truncate">{label}</p>
      </div>
      <p className={`text-sm font-bold font-mono tabular-nums leading-tight break-words ${valueColor || ''}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{caption}</p>
    </div>
  );
}

function DeckStat({ icon, label, value, caption, tone }: {
  icon: React.ReactNode; label: string; value: string; caption: string; tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <span className="shrink-0">{icon}</span>
        <p className="text-[10px] font-semibold uppercase tracking-wide truncate">{label}</p>
      </div>
      <p className={`text-lg font-bold font-mono tabular-nums leading-tight ${tone || ''}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{caption}</p>
    </div>
  );
}

function DeckLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full border border-border bg-muted/50 text-xs font-semibold hover:bg-muted transition-colors"
    >
      {label} →
    </button>
  );
}

function FlowCell({ label, value, color, icon, onClick }: {
  label: string; value: string; color: string; icon: React.ReactNode; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 py-4 px-2 hover:bg-muted/30 transition-colors">
      <div className={`${color}`}>{icon}</div>
      <p className={`text-lg font-bold font-mono tabular-nums ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
    </button>
  );
}

function ValueChip({ label, value, variant }: { label: string; value: string; variant: 'blue' | 'amber' | 'emerald' }) {
  const colors = {
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30',
  };
  return (
    <div className={`rounded-xl px-4 py-2 ${colors[variant]}`}>
      <p className="text-[10px] uppercase font-semibold opacity-70">{label}</p>
      <p className="text-lg font-bold font-mono tabular-nums">{value}</p>
    </div>
  );
}
