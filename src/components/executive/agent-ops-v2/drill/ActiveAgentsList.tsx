import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { Activity, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, subHours, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DateRange } from '../AgentOpsHomeView';

const PAGE_SIZE = 25;

function getRangeStart(range: DateRange): Date {
  if (range === '24h') return subHours(new Date(), 24);
  if (range === '7d') return subDays(new Date(), 7);
  return subDays(new Date(), 30);
}

interface ActiveRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  last_active_at: string;
}

export function ActiveAgentsList({ range }: { range: DateRange }) {
  const rangeStart = useMemo(() => getRangeStart(range).toISOString(), [range]);
  const [page, setPage] = useState(0);
  const [liveRows, setLiveRows] = useState<ActiveRow[]>([]);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPage(0);
    setLiveRows([]);
  }, [range]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agent-ops-drill', 'active-agents', range, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      // Get agent ids
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'agent');
      const agentIds = (roles ?? []).map((r: any) => r.user_id);
      if (agentIds.length === 0) return { rows: [] as ActiveRow[], hasMore: false };
      const { data: profs, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, last_active_at')
        .in('id', agentIds)
        .gte('last_active_at', rangeStart)
        .order('last_active_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      const rows: ActiveRow[] = (profs ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        last_active_at: p.last_active_at,
      }));
      return { rows, hasMore: rows.length === PAGE_SIZE };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`drill-active-agents-${range}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        async (payload) => {
          const p = payload.new as any;
          if (!p.last_active_at || new Date(p.last_active_at) < new Date(rangeStart)) return;
          // Only include if agent role
          const { data: role } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('user_id', p.id)
            .eq('role', 'agent')
            .maybeSingle();
          if (!role) return;
          const row: ActiveRow = {
            id: p.id,
            full_name: p.full_name,
            avatar_url: p.avatar_url,
            last_active_at: p.last_active_at,
          };
          setLiveRows((prev) => [row, ...prev.filter((x) => x.id !== row.id)]);
          setHighlightIds((prev) => new Set(prev).add(row.id));
          setTimeout(() => {
            setHighlightIds((prev) => {
              const n = new Set(prev);
              n.delete(row.id);
              return n;
            });
          }, 1500);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [range, rangeStart]);

  const allRows = useMemo(() => {
    const seen = new Set<string>();
    return [...liveRows, ...(data?.rows ?? [])].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, [liveRows, data?.rows]);

  if (isLoading && page === 0) {
    return (
      <div className="space-y-2 overflow-y-auto h-full pr-1">
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
        <p className="text-sm text-muted-foreground">Failed to load agents.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (allRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
        <Activity className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No active agents in this window yet.</p>
        <p className="text-xs text-muted-foreground">Activity appears here live.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-[50vh] pr-1">
      {allRows.map((r) => (
        <div
          key={r.id}
          className={cn(
            'flex items-center gap-3 p-2.5 rounded-xl border border-border/50 bg-card min-h-[44px] transition-colors',
            highlightIds.has(r.id) && 'bg-amber-500/10 border-amber-500/30',
          )}
        >
          <div className="relative">
            <UserAvatar avatarUrl={r.avatar_url} fullName={r.full_name ?? undefined} size="sm" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {r.full_name || 'Unnamed agent'}
            </p>
            <p className="text-xs text-muted-foreground">
              Active {formatDistanceToNow(new Date(r.last_active_at), { addSuffix: true })}
            </p>
          </div>
        </div>
      ))}
      {data?.hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setPage((p) => p + 1)}
        >
          Load more
        </Button>
      )}
    </div>
  );
}