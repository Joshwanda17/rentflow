import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import { format, isToday, isThisWeek, endOfMonth, startOfMonth, addMonths, isBefore, isAfter, isEqual } from 'date-fns';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
};

interface Portfolio {
  id: string;
  investment_amount: number;
  roi_percentage: number;
  next_roi_date: string | null;
  status: string;
  investor_id: string | null;
}

type Period = 'today' | 'this_week' | 'this_month' | 'next_month';

export function ROIPayableForecast() {
  const [expanded, setExpanded] = useState(false);
  const [activePeriod, setActivePeriod] = useState<Period | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['roi-payable-forecast'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investor_portfolios')
        .select('id, investment_amount, roi_percentage, next_roi_date, status, investor_id')
        .eq('status', 'active')
        .not('next_roi_date', 'is', null);
      if (error) throw error;
      return (data || []) as Portfolio[];
    },
  });

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const thisMonthEnd = endOfMonth(now);
  const nextMonthStart = startOfMonth(addMonths(now, 1));
  const nextMonthEnd = endOfMonth(addMonths(now, 1));

  const calcROI = (p: Portfolio) => (p.investment_amount * p.roi_percentage) / 100;

  const buckets: Record<Period, { total: number; count: number; portfolios: Portfolio[] }> = {
    today: { total: 0, count: 0, portfolios: [] },
    this_week: { total: 0, count: 0, portfolios: [] },
    this_month: { total: 0, count: 0, portfolios: [] },
    next_month: { total: 0, count: 0, portfolios: [] },
  };

  (data || []).forEach(p => {
    if (!p.next_roi_date) return;
    const d = new Date(p.next_roi_date);
    const roi = calcROI(p);

    if (isToday(d)) {
      buckets.today.total += roi;
      buckets.today.count++;
      buckets.today.portfolios.push(p);
    }
    if (isThisWeek(d, { weekStartsOn: 1 })) {
      buckets.this_week.total += roi;
      buckets.this_week.count++;
      buckets.this_week.portfolios.push(p);
    }
    if ((isAfter(d, startOfMonth(now)) || isEqual(d, startOfMonth(now))) && (isBefore(d, thisMonthEnd) || isEqual(d, thisMonthEnd))) {
      buckets.this_month.total += roi;
      buckets.this_month.count++;
      buckets.this_month.portfolios.push(p);
    }
    if ((isAfter(d, nextMonthStart) || isEqual(d, nextMonthStart)) && (isBefore(d, nextMonthEnd) || isEqual(d, nextMonthEnd))) {
      buckets.next_month.total += roi;
      buckets.next_month.count++;
      buckets.next_month.portfolios.push(p);
    }
  });

  const periods: { key: Period; label: string; color: string }[] = [
    { key: 'today', label: 'Today', color: 'text-destructive' },
    { key: 'this_week', label: 'This Week', color: 'text-amber-600' },
    { key: 'this_month', label: 'This Month', color: 'text-blue-600' },
    { key: 'next_month', label: 'Next Month', color: 'text-muted-foreground' },
  ];

  const activePortfolios = activePeriod ? buckets[activePeriod].portfolios : [];

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between mb-3"
        >
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              ROI Payable Forecast
            </p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        <div className="grid grid-cols-2 gap-2">
          {periods.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => {
                setExpanded(true);
                setActivePeriod(activePeriod === key ? null : key);
              }}
              className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm ${activePeriod === key ? 'border-primary bg-primary/5' : ''}`}
            >
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className={`text-sm font-bold font-mono tabular-nums ${color}`}>
                {fmtShort(buckets[key].total)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {buckets[key].count} portfolio{buckets[key].count !== 1 ? 's' : ''}
              </p>
            </button>
          ))}
        </div>

        {expanded && activePeriod && activePortfolios.length > 0 && (
          <div className="mt-3 border-t pt-3 space-y-2 max-h-48 overflow-y-auto">
            {activePortfolios.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs gap-2">
                <div className="min-w-0">
                  <span className="text-muted-foreground">{p.next_roi_date ? format(new Date(p.next_roi_date), 'dd MMM') : '—'}</span>
                  <span className="mx-1.5">·</span>
                  <span className="text-foreground">{p.roi_percentage}% of {fmtShort(p.investment_amount)}</span>
                </div>
                <Badge variant="outline" className="font-mono shrink-0">
                  {fmt(calcROI(p))}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
