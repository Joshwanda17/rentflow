import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllAgentIds, batchedQuery } from '@/lib/supabaseBatchUtils';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, Clock, ShieldAlert, UserX } from 'lucide-react';

interface AlertItem {
  id: string;
  type: 'float_depleted' | 'dormant_agent' | 'duplicate_collection' | 'missed_target' | 'payout_stuck';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  agentName?: string;
  timestamp: string;
}

const SEVERITY_STYLES = {
  critical: 'border-destructive/30 bg-destructive/5',
  warning: 'border-amber-500/30 bg-amber-500/5',
  info: 'border-blue-500/30 bg-blue-500/5',
};

const SEVERITY_BADGE = {
  critical: 'destructive' as const,
  warning: 'secondary' as const,
  info: 'outline' as const,
};

const ALERT_ICONS = {
  float_depleted: TrendingDown,
  dormant_agent: UserX,
  duplicate_collection: ShieldAlert,
  missed_target: Clock,
  payout_stuck: AlertTriangle,
};

export function AgentAlertFeed() {
  const { data: alerts, isLoading } = useQuery({
    queryKey: ['agent-ops-alerts'],
    queryFn: async () => {
      const alertItems: AlertItem[] = [];

      // 1. Agents with depleted/low float
      const { data: lowFloat } = await supabase.from('agent_float_limits')
        .select('agent_id, float_limit, collected_today')
        .lt('float_limit', 2000);

      if (lowFloat && lowFloat.length > 0) {
        const floatAgentIds = lowFloat.map(f => f.agent_id);
        const { data: floatProfiles } = await supabase.from('profiles')
          .select('id, full_name').in('id', floatAgentIds);
        const nameMap: Record<string, string> = {};
        (floatProfiles || []).forEach(p => { nameMap[p.id] = p.full_name; });

        lowFloat.forEach(f => {
          alertItems.push({
            id: `float-${f.agent_id}`,
            type: 'float_depleted',
            severity: f.float_limit <= 0 ? 'critical' : 'warning',
            message: `Float at UGX ${f.float_limit.toLocaleString()} — cannot process collections`,
            agentName: nameMap[f.agent_id] || f.agent_id.substring(0, 8),
            timestamp: new Date().toISOString(),
          });
        });
      }

      // 2. Pending payouts older than 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: stuckPayouts } = await supabase.from('agent_commission_payouts')
        .select('agent_id, amount, created_at')
        .eq('status', 'pending')
        .lt('created_at', sevenDaysAgo)
        .limit(10);

      if (stuckPayouts) {
        const payoutIds = stuckPayouts.map(p => p.agent_id);
        const { data: payoutProfiles } = await supabase.from('profiles')
          .select('id, full_name').in('id', payoutIds);
        const nameMap2: Record<string, string> = {};
        (payoutProfiles || []).forEach(p => { nameMap2[p.id] = p.full_name; });

        stuckPayouts.forEach(p => {
          const daysAgo = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
          alertItems.push({
            id: `payout-${p.agent_id}-${p.created_at}`,
            type: 'payout_stuck',
            severity: daysAgo > 14 ? 'critical' : 'warning',
            message: `UGX ${p.amount.toLocaleString()} payout pending for ${daysAgo} days`,
            agentName: nameMap2[p.agent_id] || p.agent_id.substring(0, 8),
            timestamp: p.created_at,
          });
        });
      }

      // 3. Dormant agents (no activity in 30+ days) — sample
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const allAgentIds = await fetchAllAgentIds();

      if (allAgentIds.length > 0) {
        // Only check a sample for dormancy alerts (limit 5)
        const { data: dormantProfiles } = await supabase.from('profiles')
          .select('id, full_name, last_active_at')
          .lt('last_active_at', thirtyDaysAgo)
          .limit(5);

        (dormantProfiles || []).forEach(p => {
          const daysAgo = p.last_active_at 
            ? Math.floor((Date.now() - new Date(p.last_active_at).getTime()) / 86400000)
            : 999;
          alertItems.push({
            id: `dormant-${p.id}`,
            type: 'dormant_agent',
            severity: daysAgo > 60 ? 'critical' : 'warning',
            message: `Inactive for ${daysAgo} days — consider follow-up or suspension`,
            agentName: p.full_name || p.id.substring(0, 8),
            timestamp: p.last_active_at || new Date().toISOString(),
          });
        });
      }

      // Sort by severity then time
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return alertItems.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    },
    staleTime: 300000,
  });

  const criticalCount = (alerts || []).filter(a => a.severity === 'critical').length;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          🚨 Alert Feed
          {criticalCount > 0 && (
            <Badge variant="destructive" className="text-[10px]">{criticalCount} critical</Badge>
          )}
        </h3>
        <Badge variant="outline" className="text-[10px]">{(alerts || []).length} alerts</Badge>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Scanning for issues...</p>
      ) : (alerts || []).length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-2xl mb-1">✅</p>
          <p className="text-sm font-medium">All clear</p>
          <p className="text-xs">No active alerts</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {(alerts || []).slice(0, 20).map(alert => {
            const Icon = ALERT_ICONS[alert.type];
            return (
              <div
                key={alert.id}
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${SEVERITY_STYLES[alert.severity]}`}
              >
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold truncate">{alert.agentName}</span>
                    <Badge variant={SEVERITY_BADGE[alert.severity]} className="text-[9px] px-1 py-0">
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
