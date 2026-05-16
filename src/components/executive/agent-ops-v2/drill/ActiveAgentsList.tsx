import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/UserAvatar';
import { Activity, AlertCircle, FileText } from 'lucide-react';
import { formatDistanceToNow, subHours, subDays } from 'date-fns';
import type { DateRange } from '../AgentOpsHomeView';

const PAGE_SIZE = 25;
const FETCH_CAP = 1000;

function getRangeStart(range: DateRange): Date {
  if (range === '24h') return subHours(new Date(), 24);
  if (range === '7d') return subDays(new Date(), 7);
  return subDays(new Date(), 30);
}

interface ActiveAgentRow {
  agent_id: string;
  requestCount: number;
  lastRequestAt: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
}

/**
 * Active Agents drill-down — agents who posted ≥1 rent (tenant) request
 * in the selected window. Shows request count and last request time per agent.
 * Source of truth: `rent_requests.created_at` + `rent_requests.agent_id`.
 */
export function ActiveAgentsList({ range }: { range: DateRange }) {
  const rangeStart = useMemo(() => getRangeStart(range).toISOString(), [range]);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agent-ops-drill', 'active-agents-v2', range],
    queryFn: async () => {
      const { data: reqs, error } = await supabase
        .from('rent_requests')
        .select('agent_id, created_at')
        .gte('created_at', rangeStart)
        .not('agent_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(FETCH_CAP);
      if (error) throw error;

      const agg = new Map<string, { count: number; last: string }>();
      (reqs ?? []).forEach((r: any) => {
        const id = r.agent_id as string;
        const existing = agg.get(id);
        if (!existing) {
          agg.set(id, { count: 1, last: r.created_at });
        } else {
          existing.count += 1;
          if (r.created_at > existing.last) existing.last = r.created_at;
        }
      });

      const agentIds = Array.from(agg.keys());
      if (agentIds.length === 0) {
        return { rows: [] as ActiveAgentRow[], capped: (reqs ?? []).length >= FETCH_CAP };
      }

      const profileMap = new Map<string, any>();
      const BATCH = 50;
      for (let i = 0; i < agentIds.length; i += BATCH) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone')
          .in('id', agentIds.slice(i, i + BATCH));
        (profs ?? []).forEach((p: any) => profileMap.set(p.id, p));
      }

      const rows: ActiveAgentRow[] = agentIds
        .map((id) => {
          const a = agg.get(id)!;
          const p = profileMap.get(id);
          return {
            agent_id: id,
            requestCount: a.count,
            lastRequestAt: a.last,
            full_name: p?.full_name ?? null,
            avatar_url: p?.avatar_url ?? null,
            phone: p?.phone ?? null,
          };
        })
        .sort((a, b) => b.requestCount - a.requestCount || b.lastRequestAt.localeCompare(a.lastRequestAt));

      return { rows, capped: (reqs ?? []).length >= FETCH_CAP };
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 overflow-y-auto max-h-[50vh] pr-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load active agents.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
        <Activity className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No active agents in this window yet.</p>
        <p className="text-xs text-muted-foreground">An agent becomes active by posting ≥1 tenant request.</p>
      </div>
    );
  }

  const shown = rows.slice(0, visible);
  const totalReqs = rows.reduce((s, r) => s + r.requestCount, 0);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{rows.length.toLocaleString()}</span> active agents ·
          <span className="font-semibold text-foreground"> {totalReqs.toLocaleString()}</span> tenant requests
        </p>
        {data?.capped && (
          <Badge variant="outline" className="text-[10px]">Showing latest {FETCH_CAP}</Badge>
        )}
      </div>

      <div className="space-y-2 overflow-y-auto max-h-[50vh] pr-1">
        {shown.map((r, idx) => (
          <div
            key={r.agent_id}
            className="flex items-center gap-3 p-2.5 rounded-xl border border-border/50 bg-card min-h-[52px]"
          >
            <div className="text-xs font-semibold text-muted-foreground tabular-nums w-5 text-center shrink-0">
              {idx + 1}
            </div>
            <UserAvatar avatarUrl={r.avatar_url} fullName={r.full_name ?? undefined} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">
                {r.full_name || r.phone || 'Unnamed agent'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Last request {formatDistanceToNow(new Date(r.lastRequestAt), { addSuffix: true })}
              </p>
            </div>
            <Badge
              variant="secondary"
              className="gap-1 text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 shrink-0"
            >
              <FileText className="h-3 w-3" />
              {r.requestCount.toLocaleString()}
            </Badge>
          </div>
        ))}

        {visible < rows.length && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
          >
            Load more ({rows.length - visible} remaining)
          </Button>
        )}
      </div>
    </div>
  );
}
