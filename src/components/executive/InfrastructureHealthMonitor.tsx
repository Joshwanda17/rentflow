import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Server, Users, AlertTriangle, CheckCircle, ArrowUp, Activity, Wifi, Clock } from 'lucide-react';
import { subHours, subMinutes } from 'date-fns';
import { cn } from '@/lib/utils';

interface HealthMetric {
  label: string;
  value: string | number;
  status: 'healthy' | 'warning' | 'critical';
  hint?: string;
}

const INSTANCE_LIMITS = {
  mini: { connections: 20, concurrentUsers: 15, label: 'Mini' },
  small: { connections: 50, concurrentUsers: 40, label: 'Small' },
  medium: { connections: 100, concurrentUsers: 80, label: 'Medium' },
  large: { connections: 200, concurrentUsers: 150, label: 'Large' },
};

export function InfrastructureHealthMonitor() {
  // Concurrent users: active in last 15 minutes
  const { data: concurrentUsers, isLoading: loadingConcurrent } = useQuery({
    queryKey: ['cto-concurrent-users'],
    queryFn: async () => {
      const since = subMinutes(new Date(), 15).toISOString();
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('last_active_at', since);
      return count || 0;
    },
    staleTime: 60000, // 1 min
    refetchInterval: 60000,
  });

  // Active in last 1 hour
  const { data: hourlyActive } = useQuery({
    queryKey: ['cto-hourly-active'],
    queryFn: async () => {
      const since = subHours(new Date(), 1).toISOString();
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('last_active_at', since);
      return count || 0;
    },
    staleTime: 120000,
  });

  // DB latency probe
  const { data: latency } = useQuery({
    queryKey: ['cto-infra-latency'],
    queryFn: async () => {
      const t0 = performance.now();
      await supabase.from('profiles').select('id', { count: 'exact', head: true });
      return Math.round(performance.now() - t0);
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  // Peak concurrent in last 24h (approximate from hourly snapshots)
  const { data: peakUsers } = useQuery({
    queryKey: ['cto-peak-users-24h'],
    queryFn: async () => {
      // Check user_locations entries in last 24h as a proxy for peak activity
      const since = subHours(new Date(), 24).toISOString();
      const { count } = await supabase
        .from('user_locations')
        .select('*', { count: 'exact', head: true })
        .gte('captured_at', since);
      // Each location capture = 1 active user session, so unique users = rough peak
      const { data: uniqueUsers } = await supabase
        .from('user_locations')
        .select('user_id')
        .gte('captured_at', since)
        .limit(100);
      const unique = new Set(uniqueUsers?.map(u => u.user_id) || []);
      return unique.size;
    },
    staleTime: 300000,
  });

  const currentInstance = INSTANCE_LIMITS.mini;
  const concurrent = concurrentUsers || 0;
  const utilizationPct = Math.round((concurrent / currentInstance.concurrentUsers) * 100);

  // Determine health metrics
  const metrics: HealthMetric[] = [
    {
      label: 'Concurrent Users (15m)',
      value: loadingConcurrent ? '...' : concurrent,
      status: concurrent > currentInstance.concurrentUsers * 0.8 ? 'critical' :
              concurrent > currentInstance.concurrentUsers * 0.5 ? 'warning' : 'healthy',
      hint: `Limit: ~${currentInstance.concurrentUsers} on ${currentInstance.label}`,
    },
    {
      label: 'Hourly Active',
      value: hourlyActive || 0,
      status: (hourlyActive || 0) > currentInstance.concurrentUsers * 1.5 ? 'warning' : 'healthy',
    },
    {
      label: 'DB Latency',
      value: latency ? `${latency}ms` : '...',
      status: (latency || 0) > 1000 ? 'critical' : (latency || 0) > 500 ? 'warning' : 'healthy',
      hint: latency && latency > 500 ? 'High latency — instance may be overloaded' : undefined,
    },
    {
      label: 'Peak Users (24h)',
      value: peakUsers || 0,
      status: (peakUsers || 0) > currentInstance.concurrentUsers ? 'critical' : 'healthy',
    },
  ];

  // Upgrade recommendation logic
  const shouldUpgrade = 
    concurrent > currentInstance.concurrentUsers * 0.7 ||
    (latency || 0) > 800 ||
    (peakUsers || 0) > currentInstance.concurrentUsers;

  const upgradeReasons: string[] = [];
  if (concurrent > currentInstance.concurrentUsers * 0.7) {
    upgradeReasons.push(`Concurrent users (${concurrent}) approaching limit (${currentInstance.concurrentUsers})`);
  }
  if ((latency || 0) > 800) {
    upgradeReasons.push(`DB latency (${latency}ms) is high — queries may be queuing`);
  }
  if ((peakUsers || 0) > currentInstance.concurrentUsers) {
    upgradeReasons.push(`Peak users in 24h (${peakUsers}) exceeded instance capacity`);
  }

  const statusColor = (s: HealthMetric['status']) => {
    if (s === 'critical') return 'bg-destructive/10 text-destructive border-destructive/30';
    if (s === 'warning') return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
    return 'bg-green-500/10 text-green-700 border-green-500/30';
  };

  const statusIcon = (s: HealthMetric['status']) => {
    if (s === 'critical') return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (s === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    return <CheckCircle className="h-4 w-4 text-green-600" />;
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-500/10">
            <Server className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Infrastructure Health Monitor</h3>
            <p className="text-xs text-muted-foreground">
              Instance: <span className="font-medium text-foreground">Mini</span> · 
              Capacity: <span className={cn('font-medium', utilizationPct > 80 ? 'text-destructive' : utilizationPct > 50 ? 'text-amber-600' : 'text-green-600')}>
                {utilizationPct}%
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Utilization Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Instance Utilization</span>
          <span>{utilizationPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              utilizationPct > 80 ? 'bg-destructive' :
              utilizationPct > 50 ? 'bg-amber-500' : 'bg-green-500'
            )}
            style={{ width: `${Math.min(utilizationPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0</span>
          <span className="text-amber-600">50%</span>
          <span className="text-destructive">80%</span>
          <span>{currentInstance.concurrentUsers}</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className={cn('rounded-xl border p-3 text-center', statusColor(m.status))}>
            <div className="flex items-center justify-center gap-1 mb-1">
              {statusIcon(m.status)}
            </div>
            <p className="text-lg font-bold">{m.value}</p>
            <p className="text-[10px] font-medium">{m.label}</p>
            {m.hint && <p className="text-[9px] mt-1 opacity-70">{m.hint}</p>}
          </div>
        ))}
      </div>

      {/* Upgrade Recommendation */}
      {shouldUpgrade ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ArrowUp className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-700">Upgrade Recommended → Small Instance</p>
          </div>
          <ul className="text-xs text-amber-700/80 space-y-1 list-disc list-inside">
            {upgradeReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <p className="text-[10px] text-muted-foreground">
            Go to Cloud → Advanced settings to change instance size
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <div>
            <p className="text-sm font-semibold text-green-700">Mini Instance — Sufficient</p>
            <p className="text-[10px] text-muted-foreground">
              No upgrade needed. Utilization is within healthy limits.
            </p>
          </div>
        </div>
      )}

      {/* When to Upgrade Guide */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
          📖 When should I upgrade?
        </summary>
        <div className="mt-2 space-y-1.5 text-muted-foreground pl-4">
          <p>🔴 <strong>Upgrade immediately</strong> if: DB latency consistently &gt;1s, users report timeouts, or concurrent users exceed {currentInstance.concurrentUsers}</p>
          <p>🟡 <strong>Consider upgrading</strong> if: Latency is 500ms–1s, utilization regularly &gt;70%, or edge functions timeout during peaks</p>
          <p>🟢 <strong>Stay on Mini</strong> if: Latency &lt;300ms, concurrent users &lt;{Math.round(currentInstance.concurrentUsers * 0.5)}, and no timeouts reported</p>
        </div>
      </details>
    </div>
  );
}
