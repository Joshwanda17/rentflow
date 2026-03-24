import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useMemo } from 'react';
import { formatUGX } from '@/lib/rentCalculations';

const CHANNELS = [
  { key: 'mtn', label: 'MTN', color: 'bg-amber-500', emoji: '📱' },
  { key: 'airtel', label: 'Airtel', color: 'bg-red-500', emoji: '📲' },
  { key: 'bank', label: 'Bank', color: 'bg-blue-500', emoji: '🏦' },
  { key: 'cash', label: 'Cash', color: 'bg-emerald-500', emoji: '💵' },
];

export function ChannelBalanceTracker() {
  const { data: deposits = [], isLoading } = useQuery({
    queryKey: ['channel-deposits-tracker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_requests')
        .select('amount, provider, status, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ['channel-withdrawals-tracker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('amount, payout_method, status, created_at')
        .eq('status', 'completed')
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
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

      const todayIn = chDeposits
        .filter((d: any) => new Date(d.created_at) >= today)
        .reduce((s: number, d: any) => s + Number(d.amount), 0);

      const weekIn = chDeposits
        .filter((d: any) => new Date(d.created_at) >= weekAgo)
        .reduce((s: number, d: any) => s + Number(d.amount), 0);

      const prevWeekStart = new Date(weekAgo.getTime() - 7 * 86400000);
      const prevWeekIn = chDeposits
        .filter((d: any) => {
          const dt = new Date(d.created_at);
          return dt >= prevWeekStart && dt < weekAgo;
        })
        .reduce((s: number, d: any) => s + Number(d.amount), 0);

      const trend = prevWeekIn > 0 ? ((weekIn - prevWeekIn) / prevWeekIn) * 100 : 0;

      return { ...ch, totalIn, totalOut, netBalance, todayIn, weekIn, trend, txCount: chDeposits.length };
    });
  }, [deposits, withdrawals]);

  const grandTotal = channelData.reduce((s, c) => s + c.netBalance, 0);

  if (isLoading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Channels</h3>
        <span className="text-xs font-mono font-semibold text-muted-foreground">
          Net {formatUGX(grandTotal)}
        </span>
      </div>

      {/* Channel rows — single column, clean list */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {channelData.map(ch => {
          const TrendIcon = ch.trend > 5 ? TrendingUp : ch.trend < -5 ? TrendingDown : Minus;
          const trendColor = ch.trend > 5 ? 'text-emerald-500' : ch.trend < -5 ? 'text-destructive' : 'text-muted-foreground';

          return (
            <div key={ch.key} className="flex items-center gap-3 px-3 py-2.5">
              {/* Color dot + label */}
              <div className={`w-2 h-2 rounded-full shrink-0 ${ch.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{ch.emoji} {ch.label}</span>
                  <span className="text-xs font-bold font-mono text-foreground">{formatUGX(ch.netBalance)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    +{formatUGX(ch.todayIn)} today · {ch.txCount} txns
                  </span>
                  <span className={`flex items-center gap-0.5 text-[10px] font-medium ${trendColor}`}>
                    <TrendIcon className="h-2.5 w-2.5" />
                    {Math.abs(ch.trend).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
