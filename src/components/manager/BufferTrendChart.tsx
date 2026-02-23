import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Calendar, AlertTriangle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { format } from 'date-fns';

interface WeeklyData {
  week: string;
  cashIn: number;
  cashOut: number;
  netFlow: number;
  cumulativeBuffer: number;
}

export function BufferTrendChart() {
  const [data, setData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrendData();
  }, []);

  const fetchTrendData = async () => {
    setLoading(true);
    const { data: ledger } = await supabase
      .from('general_ledger')
      .select('direction, amount, transaction_date')
      .order('transaction_date', { ascending: true });

    if (!ledger || ledger.length === 0) {
      setLoading(false);
      return;
    }

    // Group by week
    const weekMap = new Map<string, { cashIn: number; cashOut: number }>();
    for (const entry of ledger) {
      const date = new Date(entry.transaction_date);
      // Week label: start of the week (Monday)
      const dayOfWeek = date.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - diff);
      const key = format(weekStart, 'MMM dd');

      if (!weekMap.has(key)) weekMap.set(key, { cashIn: 0, cashOut: 0 });
      const w = weekMap.get(key)!;
      if (entry.direction === 'credit') w.cashIn += Number(entry.amount);
      else if (entry.direction === 'debit') w.cashOut += Number(entry.amount);
    }

    let cumulative = 0;
    const weeks: WeeklyData[] = [];
    for (const [week, vals] of weekMap) {
      const netFlow = vals.cashIn - vals.cashOut;
      cumulative += netFlow;
      weeks.push({ week, cashIn: vals.cashIn, cashOut: vals.cashOut, netFlow, cumulativeBuffer: cumulative });
    }

    // Keep last 12 weeks max
    setData(weeks.slice(-12));
    setLoading(false);
  };

  const forecast = useMemo(() => {
    if (data.length < 2) return null;
    // Average weekly net flow from last 4 weeks
    const recent = data.slice(-4);
    const avgNetFlow = recent.reduce((s, d) => s + d.netFlow, 0) / recent.length;
    const currentBuffer = data[data.length - 1].cumulativeBuffer;

    if (avgNetFlow >= 0) return { type: 'growing' as const, weeksUntilDepletion: null, avgNetFlow };

    const weeksUntilDepletion = Math.ceil(Math.abs(currentBuffer / avgNetFlow));
    return { type: 'declining' as const, weeksUntilDepletion, avgNetFlow };
  }, [data]);

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  if (data.length < 2) {
    return (
      <Card className="border border-border/60">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          Not enough data for trend analysis yet. Trends appear after 2+ weeks of activity.
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-background border border-border rounded-lg p-2.5 shadow-lg text-xs space-y-1">
        <p className="font-bold">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {formatUGX(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Forecast Banner */}
      {forecast && (
        <Card className={cn(
          "border-2",
          forecast.type === 'growing'
            ? 'border-success/40 bg-success/5'
            : forecast.weeksUntilDepletion! <= 4
              ? 'border-destructive/50 bg-destructive/5'
              : 'border-warning/40 bg-warning/5'
        )}>
          <CardContent className="p-3.5 flex items-center gap-3">
            {forecast.type === 'growing' ? (
              <TrendingUp className="h-5 w-5 text-success shrink-0" />
            ) : (
              <AlertTriangle className={cn("h-5 w-5 shrink-0", forecast.weeksUntilDepletion! <= 4 ? 'text-destructive' : 'text-warning')} />
            )}
            <div className="flex-1">
              <p className="text-sm font-bold">
                {forecast.type === 'growing'
                  ? '📈 Buffer Growing'
                  : `⚠️ Buffer depletes in ~${forecast.weeksUntilDepletion} weeks`}
              </p>
              <p className="text-xs text-muted-foreground">
                Avg weekly net flow: <span className={cn("font-bold", forecast.avgNetFlow >= 0 ? 'text-success' : 'text-destructive')}>
                  {forecast.avgNetFlow >= 0 ? '+' : ''}{formatUGX(forecast.avgNetFlow)}
                </span>
              </p>
            </div>
            {forecast.type === 'declining' && forecast.weeksUntilDepletion! <= 4 && (
              <Badge variant="destructive" className="text-[9px] animate-pulse">URGENT</Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cash Flow Bar Chart */}
      <Card className="border border-border/60">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-bold">Weekly Cash Flow</h4>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="week" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="cashIn" name="Cash In" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cashOut" name="Cash Out" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Cumulative Buffer Trend */}
      <Card className="border border-border/60">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            <h4 className="text-sm font-bold">Buffer Balance Trend</h4>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="week" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <defs>
                  <linearGradient id="bufferGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="cumulativeBuffer"
                  name="Buffer Balance"
                  stroke="hsl(var(--primary))"
                  fill="url(#bufferGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
