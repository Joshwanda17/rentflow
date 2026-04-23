import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Banknote, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, subHours, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DateRange } from '../AgentOpsHomeView';

const PAGE_SIZE = 25;

function getRangeStart(range: DateRange): Date {
  if (range === '24h') return subHours(new Date(), 24);
  if (range === '7d') return subDays(new Date(), 7);
  return subDays(new Date(), 30);
}

interface EarningRow {
  id: string;
  created_at: string;
  amount: number;
  earning_type: string | null;
  description: string | null;
  agent_id: string;
  agent_name: string | null;
}

export function CommissionList({ range }: { range: DateRange }) {
  const rangeStart = useMemo(() => getRangeStart(range).toISOString(), [range]);
  const [page, setPage] = useState(0);
  const [liveRows, setLiveRows] = useState<EarningRow[]>([]);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPage(0);
    setLiveRows([]);
  }, [range]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agent-ops-drill', 'commission', range, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: earnings, error } = await supabase
        .from('agent_earnings')
        .select('id, created_at, amount, earning_type, description, agent_id')
        .gte('created_at', rangeStart)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      const ids = Array.from(new Set((earnings ?? []).map((e: any) => e.agent_id).filter(Boolean)));
      const nameMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);
        (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.full_name));
      }
      const rows: EarningRow[] = (earnings ?? []).map((e: any) => ({
        id: e.id,
        created_at: e.created_at,
        amount: Number(e.amount ?? 0),
        earning_type: e.earning_type,
        description: e.description,
        agent_id: e.agent_id,
        agent_name: e.agent_id ? nameMap.get(e.agent_id) ?? null : null,
      }));
      return { rows, hasMore: rows.length === PAGE_SIZE };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`drill-commission-${range}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_earnings' },
        async (payload) => {
          const e = payload.new as any;
          if (new Date(e.created_at) < new Date(rangeStart)) return;
          let agentName: string | null = null;
          if (e.agent_id) {
            const { data: p } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', e.agent_id)
              .maybeSingle();
            agentName = (p as any)?.full_name ?? null;
          }
          const row: EarningRow = {
            id: e.id,
            created_at: e.created_at,
            amount: Number(e.amount ?? 0),
            earning_type: e.earning_type,
            description: e.description,
            agent_id: e.agent_id,
            agent_name: agentName,
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
        <p className="text-sm text-muted-foreground">Failed to load earnings.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (allRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
        <Banknote className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No commission in this window yet.</p>
        <p className="text-xs text-muted-foreground">New entries appear here live.</p>
      </div>
    );
  }

  const totalSum = allRows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-2 overflow-y-auto max-h-[50vh] pr-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>{allRows.length} entr{allRows.length === 1 ? 'y' : 'ies'}</span>
        <span className="font-semibold text-foreground tabular-nums">
          UGX {totalSum.toLocaleString()}
        </span>
      </div>
      {allRows.map((r) => (
        <div
          key={r.id}
          className={cn(
            'flex items-center gap-3 p-2.5 rounded-xl border border-border/50 bg-card min-h-[44px] transition-colors',
            highlightIds.has(r.id) && 'bg-emerald-500/10 border-emerald-500/30',
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {r.agent_name || 'Unknown agent'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate capitalize">
              {r.earning_type?.replace(/_/g, ' ') || r.description || '—'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-foreground tabular-nums">
              UGX {r.amount.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
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