import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CompactAmount } from '@/components/ui/CompactAmount';
import { Trophy, TrendingUp, Users, Target, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { startOfMonth } from 'date-fns';

export function MyCollectionPerformance() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['my-collection-performance', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const monthStart = startOfMonth(new Date()).toISOString();

      // My requests this month
      const { data: myRequests } = await supabase
        .from('rent_requests')
        .select('id, total_repayment, amount_repaid, tenant_id')
        .eq('agent_id', user.id)
        .gte('created_at', monthStart)
        .limit(500);

      // All agents' totals for ranking
      const { data: allRequests } = await supabase
        .from('rent_requests')
        .select('agent_id, amount_repaid')
        .not('agent_id', 'is', null)
        .gte('created_at', monthStart)
        .limit(1000);

      const myTotal = (myRequests || []).reduce((s, r) => s + (r.amount_repaid || 0), 0);
      const myDue = (myRequests || []).reduce((s, r) => s + (r.total_repayment || 0), 0);
      const myTenants = new Set((myRequests || []).map(r => r.tenant_id)).size;
      const rate = myDue > 0 ? Math.round((myTotal / myDue) * 100) : 0;

      // Rank among peers
      const agentTotals = new Map<string, number>();
      (allRequests || []).forEach(r => {
        if (!r.agent_id) return;
        agentTotals.set(r.agent_id, (agentTotals.get(r.agent_id) || 0) + (r.amount_repaid || 0));
      });
      const sorted = [...agentTotals.entries()].sort((a, b) => b[1] - a[1]);
      const rank = sorted.findIndex(([id]) => id === user.id) + 1;
      const totalAgents = sorted.length;

      return { myTotal, myDue, rate, myTenants, rank, totalAgents, requestCount: (myRequests || []).length };
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          My Collection Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rank Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">
              {data.rank <= 3 ? ['🥇', '🥈', '🥉'][data.rank - 1] : `#${data.rank}`}
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Your Rank</p>
              <p className="text-xs text-muted-foreground">out of {data.totalAgents} agents</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">This Month</p>
            <CompactAmount value={data.myTotal} className="text-lg font-bold text-primary" />
          </div>
        </div>

        {/* Collection Rate */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Collection Rate</span>
            <Badge variant={data.rate >= 80 ? 'default' : data.rate >= 50 ? 'secondary' : 'destructive'} className="text-[10px]">
              {data.rate}%
            </Badge>
          </div>
          <Progress value={data.rate} className="h-2" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/40">
            <Users className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-bold">{data.myTenants}</p>
            <p className="text-[10px] text-muted-foreground">Tenants</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40">
            <Target className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-bold">{data.requestCount}</p>
            <p className="text-[10px] text-muted-foreground">Requests</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/40">
            <TrendingUp className="h-3 w-3 mx-auto mb-1 text-muted-foreground" />
            <CompactAmount value={data.myDue} className="text-sm font-bold" />
            <p className="text-[10px] text-muted-foreground">Total Due</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
