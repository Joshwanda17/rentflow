import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Sunrise, TrendingUp, AlertCircle, UserPlus, Wallet } from 'lucide-react';

export function AgentOpsBrief() {
  const { data: brief, isLoading } = useQuery({
    queryKey: ['agent-ops-daily-brief'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const [
        activeToday,
        newToday,
        earningsToday,
        collectionsToday,
        floatAlerts,
        pendingPayouts,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .gte('last_active_at', today),
        supabase.from('user_roles').select('user_id', { count: 'exact', head: true })
          .eq('role', 'agent').gte('created_at', today),
        supabase.from('agent_earnings').select('amount')
          .gte('created_at', today),
        supabase.from('agent_collections').select('amount')
          .gte('created_at', today),
        supabase.from('agent_float_limits').select('agent_id')
          .lt('float_limit', 5000),
        supabase.from('agent_commission_payouts').select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);

      const todayEarnings = (earningsToday.data || []).reduce((s, e) => s + e.amount, 0);
      const todayCollections = (collectionsToday.data || []).reduce((s, c) => s + c.amount, 0);

      return {
        activeAgentsToday: activeToday.count || 0,
        newAgentsToday: newToday.count || 0,
        earningsToday: todayEarnings,
        collectionsToday: todayCollections,
        lowFloatAgents: (floatAlerts.data || []).length,
        pendingPayouts: pendingPayouts.count || 0,
      };
    },
    staleTime: 300000,
  });

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  const items = [
    { icon: Sunrise, label: 'Active Today', value: brief?.activeAgentsToday || 0, color: 'text-green-600' },
    { icon: UserPlus, label: 'New Agents', value: brief?.newAgentsToday || 0, color: 'text-blue-600' },
    { icon: TrendingUp, label: 'Collected', value: fmt(brief?.collectionsToday || 0), color: 'text-emerald-600' },
    { icon: TrendingUp, label: 'Earned', value: fmt(brief?.earningsToday || 0), color: 'text-amber-600' },
    { icon: Wallet, label: 'Low Float', value: brief?.lowFloatAgents || 0, color: brief?.lowFloatAgents ? 'text-destructive' : 'text-muted-foreground' },
    { icon: AlertCircle, label: 'Pending Payouts', value: brief?.pendingPayouts || 0, color: brief?.pendingPayouts ? 'text-amber-600' : 'text-muted-foreground' },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">☀️ Daily Operations Brief</h3>
        <Badge variant="outline" className="text-[10px]">
          {new Date().toLocaleDateString('en-UG', { weekday: 'short', day: 'numeric', month: 'short' })}
        </Badge>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading brief...</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {items.map(item => (
            <div key={item.label} className="rounded-xl bg-muted/40 p-2.5 text-center">
              <item.icon className={`h-4 w-4 mx-auto mb-1 ${item.color}`} />
              <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
              <p className="text-[9px] text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
