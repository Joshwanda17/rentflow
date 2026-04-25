import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getEntries, type FieldEntry } from '@/lib/fieldCollectStore';
import { formatUGX } from '@/lib/rentCalculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Clock, AlertCircle, FileWarning, CalendarDays, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldCollectDailyDetailsSheet } from '@/components/agent/FieldCollectDailyDetailsSheet';

interface Bucket {
  label: string;
  count: number;
  total: number;
}

interface Props {
  /** Compact card for embedding inside dashboards / dialogs. */
  variant?: 'card' | 'inline';
  className?: string;
  /** When true, polls IndexedDB for live updates (used on dashboard). */
  live?: boolean;
}

/**
 * Aggregates today's field-collection entries into time-of-day sessions
 * (Morning <12:00, Afternoon 12-17, Evening ≥17) and shows synced vs pending totals.
 * Reads exclusively from the local IndexedDB queue so it works offline.
 */
export function FieldCollectDailyTotals({ variant = 'card', className, live = false }: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<FieldEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());
  const [detailsOpen, setDetailsOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      setEntries(await getEntries(user.id));
      setLastRefreshed(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
    if (!live) return;
    const iv = window.setInterval(refresh, 4000);
    return () => window.clearInterval(iv);
  }, [refresh, live]);

  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return entries.filter(e => e.capturedAt >= start.getTime());
  }, [entries]);

  const breakdown = useMemo(() => {
    const synced = today.filter(e => e.syncState === 'synced');
    const pending = today.filter(e => e.syncState === 'queued');
    const failed = today.filter(e => e.syncState === 'error');
    const dup = today.filter(e => e.syncState === 'duplicate');
    const sum = (arr: FieldEntry[]) => arr.reduce((s, e) => s + Number(e.amount || 0), 0);
    return {
      total: sum(today),
      count: today.length,
      synced: { count: synced.length, total: sum(synced) },
      pending: { count: pending.length, total: sum(pending) },
      failed: { count: failed.length, total: sum(failed) },
      duplicate: { count: dup.length, total: sum(dup) },
    };
  }, [today]);

  const sessions: Bucket[] = useMemo(() => {
    const morn: FieldEntry[] = [], aft: FieldEntry[] = [], eve: FieldEntry[] = [];
    for (const e of today) {
      const h = new Date(e.capturedAt).getHours();
      if (h < 12) morn.push(e);
      else if (h < 17) aft.push(e);
      else eve.push(e);
    }
    const sum = (arr: FieldEntry[]) => arr.reduce((s, e) => s + Number(e.amount || 0), 0);
    return [
      { label: 'Morning', count: morn.length, total: sum(morn) },
      { label: 'Afternoon', count: aft.length, total: sum(aft) },
      { label: 'Evening', count: eve.length, total: sum(eve) },
    ];
  }, [today]);

  const isInline = variant === 'inline';

  if (breakdown.count === 0) {
    return (
      <div
        className={cn(
          'text-xs text-muted-foreground text-center py-4',
          !isInline && 'rounded-2xl border bg-muted/30 px-4',
          className,
        )}
      >
        <CalendarDays className="h-4 w-4 mx-auto mb-1 opacity-60" />
        No field collections yet today
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={refreshing}
            className="h-7 px-2 text-[11px] gap-1"
          >
            <RefreshCcw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
            Refresh totals
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-3',
        !isInline && 'rounded-2xl border bg-card p-4',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Today's totals
          </div>
          <p className="text-2xl font-bold tracking-tight mt-0.5">{formatUGX(breakdown.total)}</p>
          <p className="text-[11px] text-muted-foreground">
            {breakdown.count} entr{breakdown.count === 1 ? 'y' : 'ies'} captured · updated {formatRelative(lastRefreshed)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end max-w-[55%]">
          {breakdown.synced.count > 0 && (
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10">
              <CheckCircle2 className="h-3 w-3" />
              {breakdown.synced.count} synced
            </Badge>
          )}
          {breakdown.pending.count > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">
              <Clock className="h-3 w-3" />
              {breakdown.pending.count} pending
            </Badge>
          )}
          {breakdown.failed.count > 0 && (
            <Badge variant="outline" className="gap-1 border-red-500/40 text-red-700 dark:text-red-400 bg-red-500/10">
              <AlertCircle className="h-3 w-3" />
              {breakdown.failed.count} failed
            </Badge>
          )}
          {breakdown.duplicate.count > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">
              <FileWarning className="h-3 w-3" />
              {breakdown.duplicate.count} dup
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={refresh}
            disabled={refreshing}
            className="h-7 px-2 text-[11px] gap-1"
            aria-label="Refresh totals"
          >
            <RefreshCcw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <Separator />

      {/* Sync split */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-2">
          <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-[10px] uppercase tracking-wide font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Synced
          </div>
          <p className="font-semibold mt-0.5">{formatUGX(breakdown.synced.total)}</p>
        </div>
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
          <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-[10px] uppercase tracking-wide font-medium">
            <Clock className="h-3 w-3" />
            Pending
          </div>
          <p className="font-semibold mt-0.5">
            {formatUGX(breakdown.pending.total + breakdown.failed.total + breakdown.duplicate.total)}
          </p>
        </div>
      </div>

      {/* Time-of-day sessions */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">By session</p>
        <div className="grid grid-cols-3 gap-2">
          {sessions.map(s => (
            <div key={s.label} className={cn(
              'rounded-lg border px-2 py-1.5 text-center',
              s.count === 0 ? 'opacity-50' : 'bg-muted/30'
            )}>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className="text-sm font-semibold leading-tight">{formatUGX(s.total)}</p>
              <p className="text-[10px] text-muted-foreground">{s.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* View details */}
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className="w-full text-xs font-medium text-primary hover:underline pt-1"
      >
        View details →
      </button>
      <FieldCollectDailyDetailsSheet open={detailsOpen} onOpenChange={setDetailsOpen} />
    </div>
  );
}

function formatRelative(ts: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}