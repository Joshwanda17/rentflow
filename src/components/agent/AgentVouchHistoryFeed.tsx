import { useEffect, useState } from 'react';
import { History, ArrowUpRight, ArrowDownRight, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

/**
 * AgentVouchHistoryFeed
 * ---------------------------------------------------------------------
 * Lists every collection-driven adjustment to the agent's earned vouch
 * limit (insert, update, delete/reversal). Sourced from the
 * `agent_vouch_limit_history` audit table populated by
 * `recompute_agent_earned_vouch`. RLS already gates rows to
 * `agent_id = auth.uid()`.
 */

interface HistoryRow {
  id: string;
  change_source: string;
  collection_id: string | null;
  collection_amount: number | null;
  previous_effective_limit_ugx: number | null;
  new_effective_limit_ugx: number | null;
  delta_ugx: number | null;
  created_at: string;
}

interface Props {
  agentId: string;
  limit?: number;
}

export function AgentVouchHistoryFeed({ agentId, limit = 10 }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!agentId) { setLoading(false); return; }
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('agent_vouch_limit_history')
          .select('id, change_source, collection_id, collection_amount, previous_effective_limit_ugx, new_effective_limit_ugx, delta_ugx, created_at')
          .eq('agent_id', agentId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (cancelled) return;
        if (error) {
          setRows([]);
        } else {
          setRows((data ?? []) as HistoryRow[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  const visible = showAll ? rows : rows.slice(0, limit);

  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <History className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
          Vouch history
        </p>
      </div>

      {loading && (
        <p className="text-[11px] text-muted-foreground py-2">Loading…</p>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-[11px] text-muted-foreground py-2 leading-snug">
          No collection adjustments yet. Each cash you collect will appear here
          with the resulting vouch change.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <ul className="divide-y divide-border/50">
          {visible.map((r) => (
            <HistoryItem key={r.id} row={r} />
          ))}
        </ul>
      )}

      {!loading && rows.length > limit && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full mt-2 text-[10px] uppercase tracking-wider font-bold text-primary hover:underline"
        >
          {showAll ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

function HistoryItem({ row }: { row: HistoryRow }) {
  const delta = Number(row.delta_ugx ?? 0);
  const isReversal = row.change_source === 'collection_delete';
  const isUpdate = row.change_source === 'collection_update';
  const isPositive = delta > 0;
  const isNeutral = delta === 0;

  const Icon = isReversal ? RotateCcw : isPositive ? ArrowUpRight : ArrowDownRight;
  const tone = isReversal
    ? 'text-amber-600 dark:text-amber-400'
    : isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : isNeutral
        ? 'text-muted-foreground'
        : 'text-rose-600 dark:text-rose-400';

  const label = isReversal
    ? 'Collection reversed'
    : isUpdate
      ? 'Collection updated'
      : row.change_source === 'collection_insert'
        ? 'Collection recorded'
        : row.change_source === 'backfill'
          ? 'Historical backfill'
          : 'Manual recompute';

  const date = new Date(row.created_at);
  const dateStr = date.toLocaleString(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const amount = Number(row.collection_amount ?? 0);
  const newLimit = Number(row.new_effective_limit_ugx ?? 0);

  return (
    <li className="py-2 flex items-start gap-2">
      <div className={cn('h-7 w-7 shrink-0 rounded-lg bg-muted/60 flex items-center justify-center', tone)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-foreground truncate">{label}</p>
          <p className={cn('text-[11px] font-bold tabular-nums shrink-0', tone)}>
            {delta > 0 ? '+' : ''}{formatUGX(delta)}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-[10px] text-muted-foreground">
            {amount > 0 && (
              <>Cash {formatUGX(amount)} <span className="mx-1">·</span></>
            )}
            {dateStr}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            New: <span className="font-semibold text-foreground">{formatUGX(newLimit)}</span>
          </p>
        </div>
      </div>
    </li>
  );
}

export default AgentVouchHistoryFeed;