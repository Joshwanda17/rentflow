import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useMemo } from 'react';

const CHANNELS = [
  { key: 'mtn', label: 'MTN MoMo', color: 'bg-yellow-500', emoji: '📱' },
  { key: 'airtel', label: 'Airtel Money', color: 'bg-red-500', emoji: '📲' },
  { key: 'bank', label: 'Bank Transfer', color: 'bg-blue-500', emoji: '🏦' },
  { key: 'cash', label: 'Agent Cash', color: 'bg-green-500', emoji: '💵' },
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
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Channel Balances</h2>
        <Badge variant="outline" className="text-sm font-bold">
          Net: UGX {grandTotal.toLocaleString()}
        </Badge>
      </div>

      <div className="grid gap-3 grid-cols-2">
        {channelData.map(ch => (
          <Card key={ch.key} className="relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1 h-full ${ch.color}`} />
            <CardContent className="p-3 pl-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{ch.emoji} {ch.label}</span>
                {ch.trend > 5 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                ) : ch.trend < -5 ? (
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <p className="text-lg font-bold text-primary">
                UGX {ch.netBalance.toLocaleString()}
              </p>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>In: {ch.totalIn.toLocaleString()}</span>
                <span>Out: {ch.totalOut.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-green-600">Today: +{ch.todayIn.toLocaleString()}</span>
                <span className="text-muted-foreground">{ch.txCount} txns</span>
              </div>
              {ch.trend !== 0 && (
                <p className={`text-[10px] font-medium ${ch.trend > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {ch.trend > 0 ? '↑' : '↓'} {Math.abs(ch.trend).toFixed(0)}% vs prev week
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
