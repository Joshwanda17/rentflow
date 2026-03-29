import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowDownToLine, ArrowUpFromLine, Activity, AlertTriangle, RefreshCw, Banknote } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { Button } from '@/components/ui/button';

interface PulseMetric {
  label: string;
  value: number;
  amount?: number;
  icon: typeof Activity;
  color: string;
  bgColor: string;
}

export function FinancialOpsPulseStrip() {
  const { data: metrics, isLoading, refetch } = useQuery({
    queryKey: ['financial-ops-pulse'],
    queryFn: async () => {
      // Single RPC call instead of 5 separate queries - handles 1M+ scale
      const { data, error } = await supabase.rpc('get_financial_ops_pulse');
      if (error) throw error;
      const d = data as any;
      return {
        pendingDeposits: d.pending_deposits,
        pendingWithdrawals: d.pending_withdrawals,
        pendingWalletWithdrawals: d.pending_wallet_withdrawals,
        pendingWalletOps: d.pending_wallet_ops,
        todayVolume: d.today_volume,
      };
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const pulseItems: PulseMetric[] = [
    {
      label: 'Deposits',
      value: metrics?.pendingDeposits.count || 0,
      amount: metrics?.pendingDeposits.amount,
      icon: ArrowDownToLine,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Cash Out',
      value: metrics?.pendingWalletWithdrawals.count || 0,
      amount: metrics?.pendingWalletWithdrawals.amount,
      icon: Banknote,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      label: "Today",
      value: metrics?.todayVolume.count || 0,
      amount: metrics?.todayVolume.amount,
      icon: Activity,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-500/10',
    },
    {
      label: 'Wallet Ops',
      value: metrics?.pendingWalletOps.count || 0,
      amount: metrics?.pendingWalletOps.amount,
      icon: AlertTriangle,
      color: 'text-amber-600',
      bgColor: 'bg-amber-500/10',
    },
    {
      label: 'Invest W/D',
      value: metrics?.pendingWithdrawals.count || 0,
      amount: metrics?.pendingWithdrawals.amount,
      icon: ArrowUpFromLine,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
    },
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Live</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 w-7 p-0 sm:w-auto sm:px-2 sm:gap-1">
          <RefreshCw className="h-3 w-3" />
          <span className="hidden sm:inline text-xs">Refresh</span>
        </Button>
      </div>
      <div className="grid grid-cols-5 gap-1 sm:gap-2">
        {pulseItems.map((item) => {
          const Icon = item.icon;
          const isUrgent = item.value > 0 && item.label !== 'Today';
          return (
            <div
              key={item.label}
              className={`rounded-lg sm:rounded-xl border p-1.5 sm:p-3 transition-all ${
                isUrgent ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <div className={`p-0.5 sm:p-1.5 rounded ${item.bgColor}`}>
                  <Icon className={`h-2.5 sm:h-3.5 w-2.5 sm:w-3.5 ${item.color}`} />
                </div>
                <span className="text-[8px] sm:text-[11px] text-muted-foreground font-medium truncate leading-tight">{item.label}</span>
              </div>
              <p className={`text-base sm:text-2xl font-black tabular-nums ${isLoading ? 'animate-pulse' : ''}`}>
                {isLoading ? '—' : item.value.toLocaleString()}
              </p>
              {item.amount !== undefined && item.amount > 0 && (
                <p className="text-[8px] sm:text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                  {formatUGX(item.amount)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
