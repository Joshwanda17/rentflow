import { useCFOOverviewData } from '@/hooks/useCFOOverviewData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Banknote, Wallet, TrendingUp, ArrowUpDown, ShieldAlert, Users, Smartphone, Building2, HandCoins, ArrowDownToLine, PiggyBank, ReceiptText, AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { AgentPerformanceRankings } from '@/components/cfo/AgentPerformanceRankings';
import { WalletRetractionsFeed } from '@/components/cfo/WalletRetractionsFeed';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CFOOverviewDashboardProps {
  onTabChange?: (tab: string) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
};

const pct = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 100));

export function CFOOverviewDashboard({ onTabChange }: CFOOverviewDashboardProps) {
  const { channelBalances, liabilities, revenue, moneyFlow, receivables, cashFlowByPurpose, isLoading } = useCFOOverviewData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalCash = channelBalances?.totalCash ?? 0;
  const totalReceivables = receivables?.totalReceivables ?? 0;
  const totalLiabilities = liabilities?.totalLiabilities ?? 0;
  const solvencyRatio = totalLiabilities > 0 ? ((totalCash + totalReceivables) / totalLiabilities) * 100 : 100;

  const solvencyColor =
    solvencyRatio >= 100 ? 'text-emerald-600' : solvencyRatio >= 80 ? 'text-yellow-600' : 'text-red-600';
  const solvencyBg =
    solvencyRatio >= 100
      ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
      : solvencyRatio >= 80
        ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800'
        : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800';

  const channels = channelBalances?.channels ?? {};
  const channelIcons: Record<string, React.ReactNode> = {
    MTN: <Smartphone className="h-5 w-5 text-yellow-500" />,
    Airtel: <Smartphone className="h-5 w-5 text-red-500" />,
    Bank: <Building2 className="h-5 w-5 text-blue-600" />,
    Cash: <Banknote className="h-5 w-5 text-emerald-600" />,
  };

  const negativeChannels = Object.entries(channels).filter(([, v]) => v.deposits - v.withdrawals < 0);

  const liabilityItems = [
    { label: 'Tenant Funds', value: liabilities?.tenantFunds ?? 0, icon: <Wallet className="h-4 w-4" /> },
    { label: 'Agent Payables', value: liabilities?.agentPayables ?? 0, icon: <Users className="h-4 w-4" /> },
    { label: 'Landlord Payables', value: liabilities?.landlordPayables ?? 0, icon: <Building2 className="h-4 w-4" /> },
    { label: 'ROI Obligations', value: liabilities?.roiObligations ?? 0, icon: <HandCoins className="h-4 w-4" /> },
    { label: 'Pending Withdrawals', value: liabilities?.pendingWithdrawals ?? 0, icon: <ArrowDownToLine className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* SECTION 0: KPI Header Bar */}
      <div className="pb-3 pt-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            label="Total Cash"
            value={fmt(totalCash)}
            subtitle="Across all channels"
            accent="border-l-blue-500"
            icon={<Banknote className="h-5 w-5 text-blue-500" />}
            onClick={() => onTabChange?.('reconciliation')}
          />
          <KPICard
            label="Total Receivables"
            value={fmt(totalReceivables)}
            subtitle="Money expected back"
            accent="border-l-purple-500"
            icon={<ReceiptText className="h-5 w-5 text-purple-500" />}
          />
          <KPICard
            label="Total Liabilities"
            value={fmt(totalLiabilities)}
            subtitle="User funds owed"
            accent="border-l-yellow-500"
            icon={<Wallet className="h-5 w-5 text-yellow-500" />}
            onClick={() => onTabChange?.('solvency')}
          />
          <div
            className={`rounded-2xl border-l-4 border ${solvencyBg} p-4 cursor-pointer hover:shadow-md transition-shadow`}
            onClick={() => onTabChange?.('solvency')}
          >
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className={`h-5 w-5 ${solvencyColor}`} />
              <span className="text-sm font-medium text-muted-foreground">Solvency Ratio</span>
            </div>
            <p className={`text-base sm:text-2xl font-bold font-mono truncate ${solvencyColor}`}>{solvencyRatio.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">(Cash + Receivables) / Liabilities</p>
          </div>
        </div>
      </div>

      {/* SECTION 1: Cash & Liquidity */}
      <SectionCard title="Cash & Liquidity" icon={<Banknote className="h-5 w-5 text-blue-500" />} accent="border-l-blue-500">
        {negativeChannels.length > 0 && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              ⚠️ Negative balance detected in: {negativeChannels.map(([n]) => n).join(', ')}. Immediate attention required.
            </AlertDescription>
          </Alert>
        )}
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">Total Cash</p>
          <p className="text-xl sm:text-3xl font-bold font-mono truncate">{fmt(totalCash)}</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Object.entries(channels).map(([name, vals]) => {
            const balance = vals.deposits - vals.withdrawals;
            return (
              <div key={name} className={`rounded-xl border p-3 ${balance < 0 ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20' : 'bg-muted/30'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {channelIcons[name]}
                  <span className="text-sm font-medium">{name}</span>
                </div>
                <p className={`text-base sm:text-lg font-bold font-mono truncate ${balance < 0 ? 'text-red-600' : ''}`}>{fmt(balance)}</p>
                <p className="text-xs text-muted-foreground truncate">In: {fmtShort(vals.deposits)} · Out: {fmtShort(vals.withdrawals)}</p>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-blue-50/50 dark:bg-blue-950/20 p-3">
            <p className="text-xs text-muted-foreground">Available Cash</p>
            <p className="text-base sm:text-lg font-bold font-mono truncate text-blue-600">{fmt(Math.max(0, totalCash - totalLiabilities))}</p>
          </div>
          <div className="rounded-xl border bg-yellow-50/50 dark:bg-yellow-950/20 p-3">
            <p className="text-xs text-muted-foreground">Restricted (User Funds)</p>
            <p className="text-base sm:text-lg font-bold font-mono truncate text-yellow-600">{fmt(Math.min(totalCash, totalLiabilities))}</p>
          </div>
        </div>
      </SectionCard>

      {/* SECTION 2: Assets / Receivables */}
      <SectionCard title="Assets (Money Expected Back)" icon={<ReceiptText className="h-5 w-5 text-purple-500" />} accent="border-l-purple-500">
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">Total Receivables</p>
          <p className="text-xl sm:text-3xl font-bold font-mono truncate text-purple-600">{fmt(totalReceivables)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border bg-purple-50/50 dark:bg-purple-950/20 p-3">
            <p className="text-xs text-muted-foreground">Tenant Outstanding</p>
            <p className="text-base sm:text-lg font-bold font-mono truncate">{fmt(receivables?.tenantOutstanding ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{pct(receivables?.tenantOutstanding ?? 0, totalReceivables)}% of total</p>
          </div>
          <div className="rounded-xl border bg-purple-50/50 dark:bg-purple-950/20 p-3">
            <p className="text-xs text-muted-foreground">Advances Outstanding</p>
            <p className="text-base sm:text-lg font-bold font-mono truncate">{fmt(receivables?.advancesOutstanding ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{pct(receivables?.advancesOutstanding ?? 0, totalReceivables)}% of total</p>
          </div>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Aging (Coming Soon)</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="font-medium">0–30 days</p>
              <p className="text-sm font-mono mt-1">—</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="font-medium">30–60 days</p>
              <p className="text-sm font-mono mt-1">—</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="font-medium">60+ days</p>
              <p className="text-sm font-mono mt-1">—</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* SECTION 3: Liabilities / User Funds */}
      <SectionCard title="User Funds (Liabilities)" icon={<Wallet className="h-5 w-5 text-yellow-500" />} accent="border-l-yellow-500">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          {liabilityItems.map((item) => (
            <div key={item.label} className="rounded-xl border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                {item.icon}
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
              <p className="text-base sm:text-lg font-bold font-mono truncate">{fmt(item.value)}</p>
              <p className="text-xs text-muted-foreground">{pct(item.value, totalLiabilities)}% of total</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Liability Breakdown</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {liabilityItems
              .filter((i) => i.value > 0)
              .map((item, idx) => {
                const colors = ['bg-yellow-400', 'bg-orange-400', 'bg-amber-500', 'bg-rose-400', 'bg-red-400'];
                return (
                  <div
                    key={item.label}
                    className={`${colors[idx]} transition-all`}
                    style={{ width: `${pct(item.value, totalLiabilities)}%` }}
                    title={`${item.label}: ${pct(item.value, totalLiabilities)}%`}
                  />
                );
              })}
          </div>
        </div>
      </SectionCard>

      {/* SECTION 4: Platform Earnings */}
      <SectionCard title="Platform Earnings & Profit" icon={<PiggyBank className="h-5 w-5 text-emerald-500" />} accent="border-l-emerald-500">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <MiniKPI label="Revenue" value={fmt(revenue?.totalRevenue ?? 0)} />
          <MiniKPI label="Fees" value={fmt(0)} muted />
          <MiniKPI label="Expenses" value={fmt(revenue?.totalExpenses ?? 0)} />
          <MiniKPI label="Net Profit" value={fmt(revenue?.netProfit ?? 0)} highlight />
        </div>
        {revenue?.trend && revenue.trend.length > 0 && (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue.trend}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtShort} width={45} />
                <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(l) => `Date: ${l}`} />
                <Area type="monotone" dataKey="amount" stroke="hsl(142, 76%, 36%)" fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* SECTION 5: Cash Flow Engine */}
      <SectionCard title="Cash Flow by Purpose" icon={<ArrowUpDown className="h-5 w-5 text-indigo-500" />} accent="border-l-indigo-500">
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          {/* Cash In */}
          <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowDownRight className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">CASH IN</span>
              <span className="ml-auto text-sm font-bold font-mono text-emerald-600">{fmt(cashFlowByPurpose?.totalIn ?? 0)}</span>
            </div>
            <div className="space-y-2">
              <FlowRow label="Partner Funding" value={cashFlowByPurpose?.cashIn.partnerFunding ?? 0} />
              <FlowRow label="Tenant Repayments" value={cashFlowByPurpose?.cashIn.tenantRepayments ?? 0} />
              <FlowRow label="Other Income" value={cashFlowByPurpose?.cashIn.other ?? 0} />
            </div>
          </div>
          {/* Cash Out */}
          <div className="rounded-xl border bg-red-50/50 dark:bg-red-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpRight className="h-4 w-4 text-red-600" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">CASH OUT</span>
              <span className="ml-auto text-sm font-bold font-mono text-red-600">{fmt(cashFlowByPurpose?.totalOut ?? 0)}</span>
            </div>
            <div className="space-y-2">
              <FlowRow label="Rent Payments" value={cashFlowByPurpose?.cashOut.rentPayments ?? 0} />
              <FlowRow label="ROI Payouts" value={cashFlowByPurpose?.cashOut.roiPayouts ?? 0} />
              <FlowRow label="Advances" value={cashFlowByPurpose?.cashOut.advances ?? 0} />
              <FlowRow label="Other Costs" value={cashFlowByPurpose?.cashOut.other ?? 0} />
            </div>
          </div>
        </div>
        {/* Net Cash Movement */}
        <div className="rounded-xl border bg-indigo-50/50 dark:bg-indigo-950/20 p-4 mb-4">
          <p className="text-xs text-muted-foreground">Net Cash Movement</p>
          <p className={`text-xl sm:text-2xl font-bold font-mono truncate ${(cashFlowByPurpose?.netMovement ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {fmt(cashFlowByPurpose?.netMovement ?? 0)}
          </p>
        </div>
        {/* 30-day trend */}
        {moneyFlow?.trend && moneyFlow.trend.length > 0 && (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={moneyFlow.trend}>
                <defs>
                  <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtShort} width={45} />
                <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={(l) => `Date: ${l}`} />
                <Area type="monotone" dataKey="inflow" stroke="hsl(142, 76%, 36%)" fill="url(#inflowGrad)" name="Inflows" />
                <Area type="monotone" dataKey="outflow" stroke="hsl(0, 84%, 60%)" fill="url(#outflowGrad)" name="Outflows" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* SECTION 6: Risk & Control */}
      <SectionCard title="Risk & Control" icon={<ShieldAlert className="h-5 w-5 text-red-500" />} accent="border-l-red-500">
        {/* Section A: Channel Reconciliation */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Channel Reconciliation</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {Object.entries(channels).map(([name, vals]) => {
            const systemBalance = vals.deposits - vals.withdrawals;
            const actualBalance = systemBalance;
            const variance = systemBalance - actualBalance;
            const status = Math.abs(variance) < 1 ? 'ok' : Math.abs(variance) < systemBalance * 0.05 ? 'warning' : 'critical';
            return (
              <div key={name} className="rounded-xl border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {channelIcons[name]}
                    <span className="text-sm font-medium">{name}</span>
                  </div>
                  <Badge variant={status === 'ok' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'} className="text-[10px]">
                    {status === 'ok' ? '✅ OK' : status === 'warning' ? '⚠️ Warn' : '❌ Critical'}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">System</span><span className="font-mono">{fmtShort(systemBalance)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Actual</span><span className="font-mono">{fmtShort(actualBalance)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Variance</span><span className="font-mono">{fmtShort(variance)}</span></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Section B: Solvency Breakdown */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Solvency Breakdown</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl border bg-blue-50/50 dark:bg-blue-950/20 p-3">
            <p className="text-xs text-muted-foreground">Cash</p>
            <p className="text-base sm:text-lg font-bold font-mono truncate text-blue-600">{fmt(totalCash)}</p>
          </div>
          <div className="rounded-xl border bg-purple-50/50 dark:bg-purple-950/20 p-3">
            <p className="text-xs text-muted-foreground">Receivables</p>
            <p className="text-base sm:text-lg font-bold font-mono truncate text-purple-600">{fmt(totalReceivables)}</p>
          </div>
          <div className="rounded-xl border bg-yellow-50/50 dark:bg-yellow-950/20 p-3">
            <p className="text-xs text-muted-foreground">Liabilities</p>
            <p className="text-base sm:text-lg font-bold font-mono truncate text-yellow-600">{fmt(totalLiabilities)}</p>
          </div>
          <div className={`rounded-xl border p-3 ${solvencyBg}`}>
            <p className="text-xs text-muted-foreground">Coverage</p>
            <p className={`text-base sm:text-lg font-bold font-mono ${solvencyColor}`}>{solvencyRatio.toFixed(1)}%</p>
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${solvencyBg}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Solvency Indicator</span>
            <span className={`text-xl font-bold font-mono ${solvencyColor}`}>{solvencyRatio.toFixed(1)}%</span>
          </div>
          <Progress value={Math.min(solvencyRatio, 100)} className="h-3" />
          <p className="text-xs text-muted-foreground mt-1">
            {solvencyRatio >= 100 ? '✅ Fully covered' : solvencyRatio >= 80 ? '⚠️ Warning zone — monitor closely' : '❌ Critical: underfunded — immediate action needed'}
          </p>
        </div>

        {/* Section C: Alerts */}
        {(negativeChannels.length > 0 || solvencyRatio < 80) && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Alerts</p>
            {negativeChannels.map(([name]) => (
              <Alert key={name} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>🔴 {name} channel has a negative balance. Investigate immediately.</AlertDescription>
              </Alert>
            ))}
            {solvencyRatio < 80 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>🔴 Solvency below 80%. Platform is underfunded — liquidity risk is high.</AlertDescription>
              </Alert>
            )}
            {solvencyRatio >= 80 && solvencyRatio < 100 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>🟡 Solvency below 100%. Not all liabilities are fully covered by cash + receivables.</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </SectionCard>

      {/* SECTION 7: Operations */}
      <SectionCard title="Operations" icon={<Users className="h-5 w-5 text-muted-foreground" />} accent="border-l-muted-foreground/40">
        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">Top Agents</h3>
            <AgentPerformanceRankings compact />
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Recent Activity</h3>
            <WalletRetractionsFeed compact />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// --- Sub-components ---

function KPICard({ label, value, subtitle, accent, icon, onClick }: {
  label: string; value: string; subtitle: string; accent: string; icon: React.ReactNode; onClick?: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-border/60 bg-card p-3 sm:p-4 border-l-4 ${accent} cursor-pointer hover:shadow-md transition-shadow`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-base sm:text-2xl font-bold font-mono truncate">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  );
}

function SectionCard({ title, icon, accent, children }: {
  title: string; icon: React.ReactNode; accent: string; children: React.ReactNode;
}) {
  return (
    <Card className={`border-l-4 ${accent}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function MiniKPI({ label, value, highlight, muted: isMuted }: { label: string; value: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold font-mono ${highlight ? 'text-emerald-600' : isMuted ? 'text-muted-foreground' : ''}`}>{value}</p>
    </div>
  );
}

function FlowRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{fmt(value)}</span>
    </div>
  );
}
