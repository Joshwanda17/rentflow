import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';

export function PartnerCapitalFlow() {
  const { data } = useQuery({
    queryKey: ['partner-capital-flow'],
    queryFn: async () => {
      const [{ data: portfolios }, { data: withdrawals }, { data: roiPayments }] = await Promise.all([
        supabase.from('investor_portfolios')
          .select('investment_amount, total_roi_earned, status, created_at')
          .in('status', ['active', 'matured', 'pending_approval']),
        supabase.from('investment_withdrawal_requests')
          .select('amount, status, created_at, user_id')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('supporter_roi_payments')
          .select('roi_amount, due_date, status')
          .order('payment_date', { ascending: false })
          .limit(500),
      ]);

      const totalDeployed = (portfolios || []).filter(p => p.status === 'active').reduce((s, p) => s + (p.investment_amount || 0), 0);
      const totalROIPaid = (roiPayments || []).filter(p => p.status === 'paid').reduce((s, p) => s + (p.roi_amount || 0), 0);
      const pendingWithdrawals = (withdrawals || []).filter(w => w.status === 'pending' || w.status === 'approved').reduce((s, w) => s + (w.amount || 0), 0);
      const completedWithdrawals = (withdrawals || []).filter(w => w.status === 'completed' || w.status === 'disbursed').reduce((s, w) => s + (w.amount || 0), 0);

      // Last 14 days capital inflow trend
      const days14 = Array.from({ length: 14 }, (_, i) => {
        const day = startOfDay(subDays(new Date(), 13 - i));
        const dayStr = format(day, 'yyyy-MM-dd') as string;
        const inflow = (portfolios || [])
          .filter(p => p.created_at && format(new Date(p.created_at), 'yyyy-MM-dd') === dayStr)
          .reduce((s, p) => s + (p.investment_amount || 0), 0);
        const outflow = (withdrawals || [])
          .filter(w => w.created_at && format(new Date(w.created_at), 'yyyy-MM-dd') === dayStr)
          .reduce((s, w) => s + (w.amount || 0), 0);
        return { day: format(day, 'dd MMM'), inflow, outflow, net: inflow - outflow };
      });

      // Net direction
      const recentNet = days14.slice(-7).reduce((s, d) => s + d.net, 0);

      return { totalDeployed, totalROIPaid, pendingWithdrawals, completedWithdrawals, trend: days14, netDirection: recentNet >= 0 ? 'positive' : 'negative', recentNet };
    },
    staleTime: 600000,
  });

  const fmt = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Capital Flow
          <Badge variant="outline" className={`ml-auto text-[10px] ${data.netDirection === 'positive' ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300'}`}>
            {data.netDirection === 'positive' ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
            7d Net: {fmt(Math.abs(data.recentNet))}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-green-500/10 p-2.5">
            <p className="text-[10px] text-muted-foreground">Deployed Capital</p>
            <p className="text-lg font-bold text-green-600">{fmt(data.totalDeployed)}</p>
          </div>
          <div className="rounded-lg bg-blue-500/10 p-2.5">
            <p className="text-[10px] text-muted-foreground">Total ROI Paid</p>
            <p className="text-lg font-bold text-blue-600">{fmt(data.totalROIPaid)}</p>
          </div>
          <div className="rounded-lg bg-amber-500/10 p-2.5">
            <p className="text-[10px] text-muted-foreground">Pending Withdrawals</p>
            <p className="text-lg font-bold text-amber-600">{fmt(data.pendingWithdrawals)}</p>
          </div>
          <div className="rounded-lg bg-muted p-2.5">
            <p className="text-[10px] text-muted-foreground">Completed Exits</p>
            <p className="text-lg font-bold text-foreground">{fmt(data.completedWithdrawals)}</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] text-muted-foreground mb-1">14-Day Capital Movement</p>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={data.trend}>
              <XAxis dataKey="day" tick={{ fontSize: 9 }} />
              <YAxis hide />
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => fmt(v)} />
              <Area type="monotone" dataKey="inflow" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="outflow" stroke="hsl(0 84% 60%)" fill="hsl(0 84% 60% / 0.1)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 text-[9px] text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />Inflow</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Outflow</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
