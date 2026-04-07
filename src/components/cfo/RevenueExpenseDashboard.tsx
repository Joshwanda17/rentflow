import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, subDays, startOfDay } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { cn } from '@/lib/utils';

const REVENUE_CATEGORIES = ['tenant_access_fee', 'tenant_request_fee', 'platform_service_income', 'access_fee_collected', 'registration_fee_collected'];
const EXPENSE_CATEGORIES = ['supporter_platform_rewards', 'agent_commission_payout', 'transaction_platform_expenses', 'operational_expenses'];

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(142, 76%, 36%)', 'hsl(var(--warning))', 'hsl(var(--destructive))'];

export function RevenueExpenseDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['revenue-expense-dashboard'],
    queryFn: async () => {
      const startDate = startOfDay(subDays(new Date(), 29)).toISOString();

      const { data: ledger, error } = await supabase
        .from('general_ledger')
        .select('amount, direction, category, transaction_date')
        .gte('transaction_date', startDate)
        .eq('ledger_scope', 'platform');
      if (error) throw error;

      // Totals
      let totalRevenue = 0, totalExpenses = 0;
      const revBreakdown: Record<string, number> = {};
      const expBreakdown: Record<string, number> = {};

      for (const e of ledger || []) {
        if (REVENUE_CATEGORIES.includes(e.category)) {
          totalRevenue += e.amount;
          revBreakdown[e.category] = (revBreakdown[e.category] || 0) + e.amount;
        }
        if (EXPENSE_CATEGORIES.includes(e.category)) {
          totalExpenses += e.amount;
          expBreakdown[e.category] = (expBreakdown[e.category] || 0) + e.amount;
        }
      }

      // Daily trend (last 30 days)
      const dailyData: any[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = subDays(new Date(), i);
        const dateStr = format(d, 'yyyy-MM-dd');
        const dayEntries = (ledger || []).filter(e => e.transaction_date?.startsWith(dateStr));
        const rev = dayEntries.filter(e => REVENUE_CATEGORIES.includes(e.category)).reduce((s, e) => s + e.amount, 0);
        const exp = dayEntries.filter(e => EXPENSE_CATEGORIES.includes(e.category)).reduce((s, e) => s + e.amount, 0);
        dailyData.push({ date: format(d, 'dd MMM'), revenue: rev, expenses: exp, profit: rev - exp });
      }

      const revPie = Object.entries(revBreakdown).map(([k, v]) => ({ name: formatCategoryLabel(k), value: v }));
      const expPie = Object.entries(expBreakdown).map(([k, v]) => ({ name: formatCategoryLabel(k), value: v }));

      return { totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses, dailyData, revPie, expPie };
    },
    staleTime: 120_000,
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const margin = data.totalRevenue > 0 ? ((data.netIncome / data.totalRevenue) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-2 border-success/30"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground uppercase tracking-wider">Revenue (30d)</p><p className="text-xl font-bold font-mono text-success">{formatUGX(data.totalRevenue)}</p></CardContent></Card>
        <Card className="border-2 border-destructive/30"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground uppercase tracking-wider">Expenses (30d)</p><p className="text-xl font-bold font-mono text-destructive">{formatUGX(data.totalExpenses)}</p></CardContent></Card>
        <Card className={cn('border-2', data.netIncome >= 0 ? 'border-primary/30' : 'border-destructive/30')}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Net Income</p>
            <div className="flex items-center justify-center gap-1">
              {data.netIncome >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
              <p className={cn('text-xl font-bold font-mono', data.netIncome >= 0 ? 'text-primary' : 'text-destructive')}>{formatUGX(data.netIncome)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2"><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground uppercase tracking-wider">Margin</p><p className="text-2xl font-bold">{margin}%</p></CardContent></Card>
      </div>

      {/* Trend */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" />Revenue vs Expenses (30 Days)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.dailyData}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <RechartsTooltip formatter={(v: number) => formatUGX(v)} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Revenue" />
              <Line type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="Expenses" />
              <Line type="monotone" dataKey="profit" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} strokeDasharray="5 5" name="Net" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Breakdown Pies */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue Breakdown</CardTitle></CardHeader>
          <CardContent>
            {data.revPie.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">No revenue data</p> : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.revPie} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name }) => name}>
                    {data.revPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v: number) => formatUGX(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Expense Breakdown</CardTitle></CardHeader>
          <CardContent>
            {data.expPie.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">No expense data</p> : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.expPie} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name }) => name}>
                    {data.expPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v: number) => formatUGX(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatCategoryLabel(cat: string): string {
  return cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
