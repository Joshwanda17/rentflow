import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatUGX } from '@/lib/rentCalculations';
import { format, subDays, startOfDay } from 'date-fns';
import { Scale, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function ReconciliationDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['reconciliation-7d'],
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { data: ledger } = await supabase
        .from('general_ledger')
        .select('amount, direction, transaction_date, ledger_scope')
        .gte('transaction_date', since)
        .order('transaction_date', { ascending: true });

      if (!ledger) return { days: [], totals: { cashIn: 0, cashOut: 0, net: 0 }, discrepancies: [] };

      // Group by day
      const dayMap = new Map<string, { cashIn: number; cashOut: number; count: number }>();
      let totalIn = 0, totalOut = 0;

      for (const tx of ledger) {
        const day = tx.transaction_date.split('T')[0];
        const entry = dayMap.get(day) || { cashIn: 0, cashOut: 0, count: 0 };
        if (tx.direction === 'cash_in') {
          entry.cashIn += tx.amount;
          totalIn += tx.amount;
        } else {
          entry.cashOut += tx.amount;
          totalOut += tx.amount;
        }
        entry.count++;
        dayMap.set(day, entry);
      }

      const days = Array.from(dayMap.entries()).map(([date, vals]) => ({
        date: format(new Date(date), 'MMM d'),
        rawDate: date,
        cashIn: vals.cashIn,
        cashOut: vals.cashOut,
        net: vals.cashIn - vals.cashOut,
        count: vals.count,
      }));

      // Flag discrepancies: days where outflow > inflow by more than 20%
      const discrepancies = days.filter(d => d.cashOut > d.cashIn * 1.2 && d.cashOut > 100000);

      return {
        days,
        totals: { cashIn: totalIn, cashOut: totalOut, net: totalIn - totalOut },
        discrepancies,
      };
    },
    staleTime: 60000,
  });

  const isHealthy = (data?.totals.net ?? 0) >= 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-emerald-500/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[11px] text-muted-foreground font-medium">7-Day Cash In</span>
            </div>
            <p className="text-lg font-black text-emerald-600 tabular-nums">
              {isLoading ? '—' : formatUGX(data?.totals.cashIn || 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              <span className="text-[11px] text-muted-foreground font-medium">7-Day Cash Out</span>
            </div>
            <p className="text-lg font-black text-destructive tabular-nums">
              {isLoading ? '—' : formatUGX(data?.totals.cashOut || 0)}
            </p>
          </CardContent>
        </Card>
        <Card className={isHealthy ? 'border-emerald-500/20' : 'border-destructive/20'}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              {isHealthy ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              <span className="text-[11px] text-muted-foreground font-medium">Net Position</span>
            </div>
            <p className={`text-lg font-black tabular-nums ${isHealthy ? 'text-emerald-600' : 'text-destructive'}`}>
              {isLoading ? '—' : `${isHealthy ? '+' : ''}${formatUGX(data?.totals.net || 0)}`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Waterfall Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" /> Daily Cash Flow (7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            {data?.days.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.days} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip
                    formatter={(value: number) => formatUGX(value)}
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="cashIn" name="Cash In" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cashOut" name="Cash Out" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                {isLoading ? 'Loading chart…' : 'No data for the last 7 days'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Discrepancy Alerts */}
      {data?.discrepancies && data.discrepancies.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" /> Discrepancy Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.discrepancies.map(d => (
                <div key={d.rawDate} className="flex items-center justify-between p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <div>
                    <p className="text-sm font-medium">{d.date}</p>
                    <p className="text-[11px] text-muted-foreground">{d.count} transactions</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-destructive font-semibold">
                      Outflow exceeds inflow by {formatUGX(d.cashOut - d.cashIn)}
                    </p>
                    <Badge variant="outline" className="text-[10px]">Review recommended</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
