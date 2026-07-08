import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, UserCheck, Activity, Loader2, Info, Home, FileText, ScrollText, Network } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import type { DateRange } from './AgentOpsHomeView';

interface AgentStats {
  total_users: number;
  total_agents: number;
  active_agents: number;
  operations: number;
  window_days: number;
  criteria: {
    house_listings: number;
    promissory_notes: number;
    behalf_rent_requests: number;
    subagents: number;
  };
  trend: Array<{ day: string; active_agents: number; operations: number }>;
}

function rangeToDays(range: DateRange): number {
  if (range === '24h') return 1;
  if (range === '7d') return 7;
  return 30;
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.min(100, (part / whole) * 100);
}

function fmt(n: number): string {
  return (n ?? 0).toLocaleString();
}

export function AgentDefinitionFunnel({ range }: { range: DateRange }) {
  const days = rangeToDays(range);

  const { data, isLoading } = useQuery({
    queryKey: ['agent-definition-funnel', days],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_agent_ops_agent_stats', { p_days: days });
      if (error) throw error;
      return data as AgentStats;
    },
    staleTime: 60_000,
  });

  const totalUsers = data?.total_users ?? 0;
  const totalAgents = data?.total_agents ?? 0;
  const activeAgents = data?.active_agents ?? 0;

  const trend = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        label: (() => {
          try {
            return format(parseISO(t.day), days <= 7 ? 'EEE' : 'd MMM');
          } catch {
            return t.day;
          }
        })(),
        active: t.active_agents,
        operations: t.operations,
      })),
    [data?.trend, days],
  );

  const funnelSteps = [
    {
      key: 'users',
      label: 'Total Users',
      value: totalUsers,
      sub: 'Everyone on the platform',
      icon: Users,
      accent: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-500/10',
      barBg: 'bg-sky-500',
      shareOf: null as number | null,
    },
    {
      key: 'agents',
      label: 'Agents',
      value: totalAgents,
      sub: 'Meet the agent criteria',
      icon: UserCheck,
      accent: 'text-primary',
      bg: 'bg-primary/10',
      barBg: 'bg-primary',
      shareOf: pct(totalAgents, totalUsers),
    },
    {
      key: 'active',
      label: 'Active Agents',
      value: activeAgents,
      sub: `Operated in last ${data?.window_days ?? days}d`,
      icon: Activity,
      accent: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
      barBg: 'bg-amber-500',
      shareOf: pct(activeAgents, totalAgents),
    },
  ];

  const criteriaChips = [
    { label: 'Listed a house', value: data?.criteria.house_listings ?? 0, icon: Home },
    { label: 'Promissory note', value: data?.criteria.promissory_notes ?? 0, icon: ScrollText },
    { label: 'Rent request for a tenant', value: data?.criteria.behalf_rent_requests ?? 0, icon: FileText },
    { label: 'Added a sub-agent', value: data?.criteria.subagents ?? 0, icon: Network },
  ];

  return (
    <Card className="rounded-2xl border-border/50 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            Who is an Agent?
            <span className="group relative inline-flex">
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </span>
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Users become agents by acting — not by role. Funnel from all users → agents → active.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </Badge>
      </div>

      {/* Funnel + trend side by side on desktop */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 items-stretch">
        {/* Funnel */}
        <div className="flex flex-col gap-2.5">
          {funnelSteps.map((step) => {
            const Icon = step.icon;
            const width = step.key === 'users' ? 100 : step.shareOf ?? 0;
            return (
              <div key={step.key} className="rounded-xl border border-border/50 bg-card/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', step.bg)}>
                      <Icon className={cn('h-4 w-4', step.accent)} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-muted-foreground leading-tight">{step.label}</p>
                      <p className="text-[10px] text-muted-foreground/70 leading-tight truncate">{step.sub}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-bold tabular-nums text-foreground leading-none">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : fmt(step.value)}
                    </p>
                    {step.shareOf !== null && !isLoading && (
                      <p className="text-[10px] font-semibold text-muted-foreground">
                        {step.shareOf.toFixed(step.shareOf < 1 ? 2 : 1)}%
                        <span className="text-muted-foreground/60"> of {step.key === 'agents' ? 'users' : 'agents'}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', step.barBg)} style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}

          {/* Criteria breakdown chips */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {criteriaChips.map((c) => {
              const Icon = c.icon;
              return (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground"
                >
                  <Icon className="h-3 w-3 text-primary" />
                  {c.label}
                  <span className="font-bold text-foreground tabular-nums">{fmt(c.value)}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Trend of active agents & operations */}
        <div className="flex flex-col">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">
            Active agents & operations trend
          </p>
          <div className="h-52 xl:flex-1 xl:min-h-[220px] -mx-2">
            {isLoading ? (
              <div className="h-full w-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            ) : trend.every((t) => t.active === 0 && t.operations === 0) ? (
              <div className="h-full w-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground">No agent operations in this window yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="funnel-active-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(38 92% 50%)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={30} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="operations" name="Operations" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={14} />
                  <Area
                    type="monotone"
                    dataKey="active"
                    name="Active agents"
                    stroke="hsl(38 92% 50%)"
                    strokeWidth={2}
                    fill="url(#funnel-active-fill)"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
