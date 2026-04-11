import { useState, useCallback } from 'react';
import { useCFOOverviewData } from '@/hooks/useCFOOverviewData';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, Banknote, Wallet, PiggyBank, ArrowDownRight, ArrowUpRight, Scale, Clock, ShieldAlert, CheckCircle2, XCircle, HandCoins, Users, TrendingUp, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KPIBreakdownSheet } from '@/components/cfo/KPIBreakdownSheet';

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

export function CFOOverviewDashboard({ onTabChange }: CFOOverviewDashboardProps) {
  const [activeBreakdown, setActiveBreakdown] = useState<string | null>(null);
  const {
    channelBalances, liabilities, revenue, receivables,
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
  const platformEarnings = revenue?.netProfit ?? 0;
  const walletTotal = liabilities?.tenantFunds ?? 0;
  const solvencyRatio = totalLiabilities > 0 ? ((totalCash + totalReceivables) / totalLiabilities) * 100 : 100;

  const solvencyStatus = solvencyRatio >= 100 ? 'healthy' : solvencyRatio >= 80 ? 'warning' : 'critical';
  const netToday = todayCashFlow?.netToday ?? 0;
  const pendingCount = pendingApprovals?.count ?? 0;

  const channels = channelBalances?.channels ?? {};
  const channelIcons: Record<string, React.ReactNode> = {
    MTN: <span className="text-lg">📱</span>,
    Airtel: <span className="text-lg">📱</span>,
    Bank: <span className="text-lg">🏦</span>,
    Cash: <span className="text-lg">💵</span>,
  };

  const liabilityItems = [
    { label: 'Tenant Funds', value: liabilities?.tenantFunds ?? 0, icon: <Wallet className="h-4 w-4" /> },
    { label: 'Agent Payables', value: liabilities?.agentPayables ?? 0, icon: <Users className="h-4 w-4" /> },
    { label: 'Landlord Payables', value: liabilities?.landlordPayables ?? 0 },
    { label: 'ROI Obligations', value: liabilities?.roiObligations ?? 0, icon: <HandCoins className="h-4 w-4" /> },
    { label: 'Pending Withdrawals', value: liabilities?.pendingWithdrawals ?? 0 },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">

      {/* ── PAY TO WALLET QUICK ACTION ── */}
      {onTabChange && (
        <button
          onClick={() => onTabChange('wallet-payout')}
          className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-primary bg-primary/10 hover:bg-primary/20 transition-colors text-left"
        >
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Wallet className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base">💳 Pay to Wallet</p>
            <p className="text-xs text-muted-foreground">Credit or debit any user's wallet instantly</p>
          </div>
          <ArrowUpRight className="h-5 w-5 text-primary shrink-0" />
        </button>
      )}

      {/* ── HEALTH AT A GLANCE ── */}
      <div className="text-center py-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Platform Health</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-2"
          style={{
            borderColor: solvencyStatus === 'healthy' ? 'hsl(var(--primary))' : solvencyStatus === 'warning' ? 'hsl(45, 93%, 47%)' : 'hsl(0, 84%, 60%)',
            background: solvencyStatus === 'healthy' ? 'hsl(var(--primary) / 0.08)' : solvencyStatus === 'warning' ? 'hsl(45, 93%, 47%, 0.08)' : 'hsl(0, 84%, 60%, 0.08)',
          }}
        >
          {solvencyStatus === 'healthy' && <CheckCircle2 className="h-5 w-5 text-primary" />}
          {solvencyStatus === 'warning' && <AlertTriangle className="h-5 w-5 text-yellow-600" />}
          {solvencyStatus === 'critical' && <XCircle className="h-5 w-5 text-red-600" />}
          <span className="text-lg font-bold">
            {solvencyStatus === 'healthy' ? 'All Good' : solvencyStatus === 'warning' ? 'Needs Attention' : 'Critical'}
          </span>
          <span className="text-sm text-muted-foreground">({solvencyRatio.toFixed(0)}% covered)</span>
        </div>
      </div>


      {/* ── 3 BIG NUMBERS ── */}
      <div className="grid grid-cols-1 gap-3">
        <BigNumber
          emoji="💰"
          label="Money We Have"
          value={fmt(totalCash)}
          sub={`Available: ${fmtShort(Math.max(0, totalCash - totalLiabilities))}`}
          onClick={() => setActiveBreakdown('cash')}
        />
        <BigNumber
          emoji="👛"
          label="Money We Owe"
          value={fmt(walletTotal)}
          sub={`Total liabilities: ${fmtShort(totalLiabilities)}`}
          onClick={() => setActiveBreakdown('wallets')}
        />
        <BigNumber
          emoji="📈"
          label="Our Profit"
          value={fmt(platformEarnings)}
          sub={`Revenue: ${fmtShort(revenue?.totalRevenue ?? 0)} · Costs: ${fmtShort(revenue?.totalExpenses ?? 0)}`}
          onClick={() => setActiveBreakdown('earnings')}
        />
      </div>

      {/* ── TODAY'S MOVEMENT ── */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">Today</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-3" onClick={() => setActiveBreakdown('cashIn')}>
              <ArrowDownRight className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
              <p className="text-lg font-bold font-mono text-emerald-600">{fmtShort(todayCashFlow?.cashInToday ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground">In</p>
            </div>
            <div className="rounded-xl bg-red-50 dark:bg-red-950/20 p-3" onClick={() => setActiveBreakdown('cashOut')}>
              <ArrowUpRight className="h-5 w-5 text-red-500 mx-auto mb-1" />
              <p className="text-lg font-bold font-mono text-red-500">{fmtShort(todayCashFlow?.cashOutToday ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground">Out</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3" onClick={() => setActiveBreakdown('netCash')}>
              <Scale className="h-5 w-5 text-foreground mx-auto mb-1" />
              <p className={`text-lg font-bold font-mono ${netToday >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {netToday >= 0 ? '+' : ''}{fmtShort(netToday)}
              </p>
              <p className="text-[11px] text-muted-foreground">Net</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── GOLDEN RULE (simplified) ── */}
      <Card className="rounded-2xl border-2 border-dashed border-muted-foreground/20">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5" /> Golden Rule Check
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap text-center">
            <Pill label="Cash" value={fmtShort(totalCash)} color="text-blue-600 bg-blue-50 dark:bg-blue-950/30" />
            <span className="text-lg font-bold text-muted-foreground">=</span>
            <Pill label="Wallets" value={fmtShort(walletTotal)} color="text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30" />
            <span className="text-lg font-bold text-muted-foreground">+</span>
            <Pill label="Profit" value={fmtShort(platformEarnings)} color="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" />
          </div>
          {(() => {
            const diff = totalCash - walletTotal - platformEarnings;
            const diffPct = totalCash > 0 ? Math.abs(diff / totalCash) * 100 : 0;
            return diffPct > 1 ? (
              <p className="text-xs text-center mt-2 text-amber-600 font-medium">
                ⚠️ {diffPct.toFixed(1)}% timing difference ({fmtShort(diff)})
              </p>
            ) : (
              <p className="text-xs text-center mt-2 text-emerald-600 font-medium">
                ✅ Balanced ({diffPct.toFixed(1)}% variance)
              </p>
            );
          })()}
        </CardContent>
      </Card>

      {/* ── CHANNEL BALANCES ── */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">Money Channels</p>
          <div className="space-y-2">
            {Object.entries(channels).map(([name, vals]) => {
              const balance = vals.deposits - vals.withdrawals;
              const isNegative = balance < 0;
              return (
                <div key={name} className={`flex items-center gap-3 p-3 rounded-xl border ${isNegative ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : 'bg-muted/30'}`}>
                  <span className="text-xl">{channelIcons[name] || '💳'}</span>
                  <span className="text-sm font-medium flex-1">{name}</span>
                  <span className={`text-base font-bold font-mono ${isNegative ? 'text-red-600' : ''}`}>{fmtShort(balance)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── LEDGER HEALTH ── */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Ledger Health
          </p>
          <div className="space-y-2">
            <HealthRow
              label="Wallet / Ledger Drift"
              count={integrityChecks?.walletDriftCount ?? 0}
              onClick={() => onTabChange?.('reconciliation')}
            />
            <HealthRow label="Missing Group IDs" count={integrityChecks?.missingGroupCount ?? 0} />
            <HealthRow label="Negative Balances" count={integrityChecks?.negativeLedgerCount ?? 0} />
          </div>
        </CardContent>
      </Card>

      {/* ── AUTO-PAYOUT SWITCHES ── */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">Auto-Payouts</p>
          <div className="space-y-3">
            {[
              { key: 'auto_roi', label: 'ROI Payouts', icon: <HandCoins className="h-4 w-4 text-muted-foreground" /> },
              { key: 'auto_salaries', label: 'Salaries', icon: <Users className="h-4 w-4 text-muted-foreground" /> },
              { key: 'auto_commissions', label: 'Commissions', icon: <Banknote className="h-4 w-4 text-muted-foreground" /> },
              { key: 'auto_advances', label: 'Advances', icon: <TrendingUp className="h-4 w-4 text-muted-foreground" /> },
            ].map((ctrl) => (
              <div key={ctrl.key} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2.5">
                  {ctrl.icon}
                  <span className="text-sm font-medium">{ctrl.label}</span>
                </div>
                <Switch
                  checked={treasuryControls?.[ctrl.key] ?? false}
                  onCheckedChange={(val) => handleToggleControl(ctrl.key, val)}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Each payout is validated against cash availability before release.
          </p>
        </CardContent>
      </Card>

      {/* ── BREAKDOWNS ── */}
      <KPIBreakdownSheet
        open={activeBreakdown === 'cash'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="Platform Cash Breakdown"
        total={totalCash}
        items={Object.entries(channels).map(([name, vals]) => ({
          label: name,
          value: vals.deposits - vals.withdrawals,
          icon: channelIcons[name],
        }))}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'wallets'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="User Wallets Breakdown"
        total={totalLiabilities}
        items={liabilityItems}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'earnings'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="Platform Earnings Breakdown"
        total={platformEarnings}
        items={[
          { label: 'Total Revenue', value: revenue?.totalRevenue ?? 0, icon: <ArrowDownRight className="h-4 w-4 text-green-500" /> },
          { label: 'Total Expenses', value: -(revenue?.totalExpenses ?? 0), icon: <ArrowUpRight className="h-4 w-4 text-red-500" /> },
        ]}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'cashIn'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="Cash In Today"
        total={todayCashFlow?.cashInToday ?? 0}
        items={Object.entries(todayCashFlow?.inflowCategories ?? {}).map(([cat, val]) => ({
          label: cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: val,
        }))}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'cashOut'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="Cash Out Today"
        total={todayCashFlow?.cashOutToday ?? 0}
        items={Object.entries(todayCashFlow?.outflowCategories ?? {}).map(([cat, val]) => ({
          label: cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          value: val,
        }))}
      />
      <KPIBreakdownSheet
        open={activeBreakdown === 'netCash'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="Net Cash Today"
        total={todayCashFlow?.netToday ?? 0}
        items={[
          { label: 'Cash In', value: todayCashFlow?.cashInToday ?? 0, icon: <ArrowDownRight className="h-4 w-4 text-green-500" /> },
          { label: 'Cash Out', value: -(todayCashFlow?.cashOutToday ?? 0), icon: <ArrowUpRight className="h-4 w-4 text-red-500" /> },
        ]}
      />
    </div>
  );
}

/* ── Simple sub-components ── */

function BigNumber({ emoji, label, value, sub, onClick }: {
  emoji: string; label: string; value: string; sub: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border bg-card p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-transform hover:shadow-sm"
    >
      <span className="text-3xl">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold font-mono truncate">{value}</p>
        <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
      </div>
    </button>
  );
}

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`rounded-xl px-4 py-2 ${color}`}>
      <p className="text-[10px] uppercase font-semibold opacity-70">{label}</p>
      <p className="text-lg font-bold font-mono">{value}</p>
    </div>
  );
}

function HealthRow({ label, count, onClick }: { label: string; count: number; onClick?: () => void }) {
  const ok = count === 0;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left ${ok ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200' : 'bg-red-50/50 dark:bg-red-950/10 border-red-300'}`}
    >
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className={`text-base font-bold font-mono ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{count}</span>
    </button>
  );
}
