import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, CheckCircle, Clock, FileText, Wallet, ArrowUpRight } from 'lucide-react';
import { subDays, differenceInHours, format } from 'date-fns';

export function MyPerformanceCard() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: stats, isLoading } = useQuery({
    queryKey: ['my-performance', userId],
    queryFn: async () => {
      if (!userId) return null;
      const since = subDays(new Date(), 30).toISOString();

      const [auditRes, depositRes, payoutRes, withdrawalRes] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('action_type, created_at', { count: 'exact', head: false })
          .eq('user_id', userId)
          .gte('created_at', since)
          .limit(500),
        supabase
          .from('deposit_requests')
          .select('created_at, approved_at, status')
          .eq('processed_by', userId)
          .gte('created_at', since)
          .limit(500),
        supabase
          .from('agent_commission_payouts')
          .select('requested_at, processed_at, status')
          .eq('processed_by', userId)
          .gte('created_at', since)
          .limit(500),
        supabase
          .from('investment_withdrawal_requests')
          .select('requested_at, processed_at, status')
          .eq('processed_by', userId)
          .gte('created_at', since)
          .limit(500),
      ]);

      const auditLogs = auditRes.data || [];
      const deposits = depositRes.data || [];
      const payouts = payoutRes.data || [];
      const withdrawals = withdrawalRes.data || [];

      // Calculate avg response time
      const responseTimes: number[] = [];
      deposits.forEach(d => {
        if (d.approved_at && d.created_at) {
          responseTimes.push(differenceInHours(new Date(d.approved_at), new Date(d.created_at)));
        }
      });
      payouts.forEach(p => {
        if (p.processed_at && p.requested_at) {
          responseTimes.push(differenceInHours(new Date(p.processed_at), new Date(p.requested_at)));
        }
      });

      const avgResponseHrs = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null;

      // Last active
      const lastLog = auditLogs.length > 0 ? auditLogs[0].created_at : null;

      return {
        totalActions: auditLogs.length,
        depositsProcessed: deposits.length,
        payoutsProcessed: payouts.length,
        withdrawalsProcessed: withdrawals.length,
        avgResponseHrs,
        lastActive: lastLog,
      };
    },
    enabled: !!userId,
    staleTime: 300000,
  });

  if (isLoading) {
    return (
      <Card className="glass-card border-border/50 shadow-elevated">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-56 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const statItems = [
    { icon: Activity, label: 'Total Actions', value: stats.totalActions, color: 'text-primary' },
    { icon: FileText, label: 'Deposits Processed', value: stats.depositsProcessed, color: 'text-green-500' },
    { icon: Wallet, label: 'Payouts Processed', value: stats.payoutsProcessed, color: 'text-amber-500' },
    { icon: ArrowUpRight, label: 'Withdrawals Processed', value: stats.withdrawalsProcessed, color: 'text-blue-500' },
  ];

  return (
    <Card className="glass-card border-border/50 shadow-elevated overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          My Performance
        </CardTitle>
        <CardDescription>Your activity over the last 30 days</CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {statItems.map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="rounded-xl bg-muted/40 p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </div>
              <span className="text-xl font-bold">{value}</span>
            </div>
          ))}
        </div>

        {/* SLA & Last Active */}
        <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Avg Response Time</span>
          </div>
          <span className={`text-sm font-semibold ${
            stats.avgResponseHrs !== null && stats.avgResponseHrs <= 24 ? 'text-green-500' :
            stats.avgResponseHrs !== null && stats.avgResponseHrs <= 48 ? 'text-amber-500' :
            stats.avgResponseHrs !== null ? 'text-destructive' : 'text-muted-foreground'
          }`}>
            {stats.avgResponseHrs !== null ? `${stats.avgResponseHrs}h` : '—'}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Last Active</span>
          </div>
          <span className="text-sm font-medium">
            {stats.lastActive ? format(new Date(stats.lastActive), 'dd MMM, HH:mm') : 'No activity'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
