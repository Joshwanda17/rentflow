import { useState, useCallback, useMemo } from 'react';
import { useCFOOverviewData } from '@/hooks/useCFOOverviewData';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, ArrowDownRight, ArrowUpRight, Scale, Wallet, HandCoins, Users, TrendingUp, Banknote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { KPIBreakdownSheet } from '@/components/cfo/KPIBreakdownSheet';
import { GroupedKPIBreakdownSheet } from '@/components/cfo/GroupedKPIBreakdownSheet';

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
    platformCash, liabilities, revenue, receivables,
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

  const totalCash = platformCash?.totalCash ?? 0;
  const totalReceivables = receivables?.totalReceivables ?? 0;
  const totalLiabilities = liabilities?.totalLiabilities ?? 0;
  const platformEarnings = revenue?.netProfit ?? 0;
  const walletTotal = liabilities?.tenantFunds ?? 0;
  const solvencyRatio = totalLiabilities > 0 ? ((totalCash + totalReceivables) / totalLiabilities) * 100 : 100;
  const netToday = todayCashFlow?.netToday ?? 0;

  const liabilityItems = [
    { label: 'Tenant Funds', value: liabilities?.tenantFunds ?? 0, icon: <Wallet className="h-4 w-4" /> },
    { label: 'Agent Payables', value: liabilities?.agentPayables ?? 0, icon: <Users className="h-4 w-4" /> },
    { label: 'Landlord Payables', value: liabilities?.landlordPayables ?? 0 },
    { label: 'ROI Obligations', value: liabilities?.roiObligations ?? 0, icon: <HandCoins className="h-4 w-4" /> },
    { label: 'Pending Withdrawals', value: liabilities?.pendingWithdrawals ?? 0 },
  ];

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

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

      {/* ── 3 KEY NUMBERS ── */}
      <div className="grid grid-cols-1 gap-3">
        <MetricCard
          icon={<div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><Banknote className="h-5 w-5 text-blue-600" /></div>}
          label="Money We Have"
          sublabel="From funders, repayments, collections & wallets"
          value={fmt(totalCash)}
          detail={`Free to use: ${fmtShort(Math.max(0, totalCash - totalLiabilities))}`}
          onClick={() => setActiveBreakdown('cash')}
        />
        <MetricCard
          icon={<div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Wallet className="h-5 w-5 text-amber-600" /></div>}
          label="Money We Owe"
          sublabel="User wallets we need to cover"
          value={fmt(walletTotal)}
          detail={`All debts: ${fmtShort(totalLiabilities)}`}
          onClick={() => setActiveBreakdown('wallets')}
        />
        <MetricCard
          icon={<div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>}
          label="Our Profit"
          sublabel="What we've earned after costs"
          value={fmt(platformEarnings)}
          detail={`Income: ${fmtShort(revenue?.totalRevenue ?? 0)} · Costs: ${fmtShort(revenue?.totalExpenses ?? 0)}`}
          valueColor={platformEarnings >= 0 ? 'text-emerald-600' : 'text-destructive'}
          onClick={() => setActiveBreakdown('earnings')}
        />
      </div>

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
            Our cash should equal what we owe users + our profit.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap text-center">
            <ValueChip label="Cash" value={fmtShort(totalCash)} variant="blue" />
            <span className="text-lg font-bold text-muted-foreground">=</span>
            <ValueChip label="We Owe" value={fmtShort(walletTotal)} variant="amber" />
            <span className="text-lg font-bold text-muted-foreground">+</span>
            <ValueChip label="Profit" value={fmtShort(platformEarnings)} variant="emerald" />
          </div>
          {(() => {
            const diff = totalCash - walletTotal - platformEarnings;
            const diffPct = totalCash > 0 ? Math.abs(diff / totalCash) * 100 : 0;
            return (
              <p className={`text-xs text-center mt-3 font-medium ${diffPct > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {diffPct > 1 ? `⚠️ ${diffPct.toFixed(1)}% difference (${fmtShort(diff)}) — check recent transactions` : `✅ Balanced (${diffPct.toFixed(1)}% variance)`}
              </p>
            );
          })()}
        </CardContent>
      </Card>

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
      <GroupedKPIBreakdownSheet
        open={activeBreakdown === 'cash'}
        onOpenChange={(o) => !o && setActiveBreakdown(null)}
        title="💰 Money We Have — Sources"
        total={totalCash}
        groups={cashSourceGroups}
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
        title="Profit Breakdown"
        total={platformEarnings}
        items={[
          { label: 'Total Income', value: revenue?.totalRevenue ?? 0, icon: <ArrowDownRight className="h-4 w-4 text-emerald-500" /> },
          { label: 'Total Costs', value: -(revenue?.totalExpenses ?? 0), icon: <ArrowUpRight className="h-4 w-4 text-destructive" /> },
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
    </div>
  );
}

/* ── Sub-components ── */

function MetricCard({ icon, label, sublabel, value, detail, valueColor, onClick }: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  value: string;
  detail: string;
  valueColor?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border bg-card p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-all hover:shadow-md"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-[11px] text-muted-foreground">{sublabel}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-lg font-bold font-mono tabular-nums ${valueColor || ''}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{detail}</p>
      </div>
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
