import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Loader2, TrendingUp, TrendingDown, ArrowRight, Wallet } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '@/lib/utils';

export function DailyCashPositionReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['daily-cash-position'],
    queryFn: async () => {
      const today = new Date();
      const days: any[] = [];

      // Get last 7 days of ledger data
      const startDate = startOfDay(subDays(today, 6)).toISOString();
      const { data: ledger, error } = await supabase
        .from('general_ledger')
        .select('amount, direction, transaction_date')
        .gte('transaction_date', startDate)
        .eq('ledger_scope', 'platform');
      if (error) throw error;

      // Get current wallet totals (platform cash)
      const { data: wallets } = await supabase
        .from('wallets')
        .select('balance')
        .gt('balance', 0);
      const totalCash = (wallets || []).reduce((s, w) => s + w.balance, 0);

      // Get pending obligations
      const { data: pendingRent } = await supabase
        .from('rent_requests')
        .select('amount')
        .in('status', ['coo_approved', 'cfo_approved']);
      const pendingObligations = (pendingRent || []).reduce((s, r) => s + r.amount, 0);

      // Aggregate by day
      for (let i = 6; i >= 0; i--) {
        const d = subDays(today, i);
        const dateStr = format(d, 'yyyy-MM-dd');
        const dayEntries = (ledger || []).filter(e => e.transaction_date?.startsWith(dateStr));
        const inflows = dayEntries.filter(e => e.direction === 'cash_in').reduce((s, e) => s + e.amount, 0);
        const outflows = dayEntries.filter(e => e.direction === 'cash_out').reduce((s, e) => s + e.amount, 0);
        days.push({
          date: format(d, 'dd MMM'),
          dateStr,
          inflows,
          outflows,
          net: inflows - outflows,
        });
      }

      const todayData = days[days.length - 1];
      return { days, totalCash, pendingObligations, today: todayData };
    },
    staleTime: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const { days, totalCash, pendingObligations, today } = data;
  const availableCash = totalCash - pendingObligations;

  return (
    <div className="space-y-4">
      {/* Top KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-2 border-primary/20">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Cash</p>
            <p className="text-xl font-bold font-mono text-primary">{formatUGX(totalCash)}</p>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending Obligations</p>
            <p className="text-xl font-bold font-mono text-warning">{formatUGX(pendingObligations)}</p>
          </CardContent>
        </Card>
        <Card className={cn('border-2', availableCash < 0 ? 'border-destructive/30' : 'border-success/30')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Available Cash</p>
            <p className={cn('text-xl font-bold font-mono', availableCash < 0 ? 'text-destructive' : 'text-success')}>{formatUGX(availableCash)}</p>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Today Net</p>
            <div className="flex items-center justify-center gap-1">
              {today.net >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
              <p className={cn('text-xl font-bold font-mono', today.net >= 0 ? 'text-success' : 'text-destructive')}>
                {today.net >= 0 ? '+' : ''}{formatUGX(today.net)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Snapshot */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Today's Cash Position — {format(new Date(), 'dd MMMM yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-around py-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Inflows</p>
              <p className="text-lg font-bold text-success font-mono">{formatUGX(today.inflows)}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Outflows</p>
              <p className="text-lg font-bold text-destructive font-mono">{formatUGX(today.outflows)}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Net</p>
              <p className={cn('text-lg font-bold font-mono', today.net >= 0 ? 'text-success' : 'text-destructive')}>
                {today.net >= 0 ? '+' : ''}{formatUGX(today.net)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 7-Day Chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">7-Day Cash Flow Trend</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={days}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <RechartsTooltip formatter={(v: number) => formatUGX(v)} />
              <Bar dataKey="inflows" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Inflows" />
              <Bar dataKey="outflows" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Outflows" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
