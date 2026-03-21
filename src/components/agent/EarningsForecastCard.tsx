import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { TrendingUp, Zap } from 'lucide-react';

interface Props {
  agentId: string;
}

export function EarningsForecastCard({ agentId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-earnings-forecast', agentId],
    queryFn: async () => {
      // Get active rent requests for this agent
      const { data: requests } = await supabase
        .from('rent_requests')
        .select('daily_repayment, total_repayment, amount_repaid')
        .eq('agent_id', agentId)
        .in('status', ['approved', 'disbursed', 'active']);

      const totalDailyCollectable = (requests || []).reduce((s, r) => s + (r.daily_repayment || 0), 0);
      const totalOutstanding = (requests || []).reduce((s, r) => s + Math.max(0, (r.total_repayment || 0) - (r.amount_repaid || 0)), 0);

      // 5% commission on daily collections
      const dailyCommission = totalDailyCollectable * 0.05;
      const monthlyPotential = dailyCommission * 30;

      // Get streak multiplier
      const { data: streak } = await supabase
        .from('agent_collection_streaks')
        .select('streak_multiplier, current_streak')
        .eq('agent_id', agentId)
        .maybeSingle();

      const multiplier = Number(streak?.streak_multiplier || 1.0);
      const currentStreak = streak?.current_streak || 0;

      return {
        dailyCollectable: totalDailyCollectable,
        dailyCommission,
        monthlyPotential: monthlyPotential * multiplier,
        totalOutstanding,
        multiplier,
        currentStreak,
        tenantCount: (requests || []).length,
      };
    },
    staleTime: 300000,
  });

  if (isLoading || !data) return null;
  if (data.tenantCount === 0) return null;

  return (
    <div className="rounded-xl border border-success/30 bg-gradient-to-r from-success/5 to-success/10 p-3.5 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-success/15">
            <TrendingUp className="h-4 w-4 text-success" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Earnings Forecast</p>
            <p className="font-bold text-lg text-success">{formatUGX(data.monthlyPotential)}<span className="text-[10px] text-muted-foreground font-normal">/mo</span></p>
          </div>
        </div>
        {data.multiplier > 1 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-warning/10 border border-warning/20">
            <Zap className="h-3 w-3 text-warning" />
            <span className="text-[10px] font-bold text-warning">{data.multiplier.toFixed(2)}x</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background/60 p-2">
          <p className="font-bold text-sm">{formatUGX(data.dailyCommission)}</p>
          <p className="text-[9px] text-muted-foreground">Today's 5%</p>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="font-bold text-sm">{data.tenantCount}</p>
          <p className="text-[9px] text-muted-foreground">Active</p>
        </div>
        <div className="rounded-lg bg-background/60 p-2">
          <p className="font-bold text-sm text-destructive">{formatUGX(data.totalOutstanding)}</p>
          <p className="text-[9px] text-muted-foreground">To Collect</p>
        </div>
      </div>

      {data.totalOutstanding > 0 && (
        <p className="text-[10px] text-success font-medium text-center">
          💰 Collect today → earn {formatUGX(data.dailyCommission)} in commissions
        </p>
      )}
    </div>
  );
}
