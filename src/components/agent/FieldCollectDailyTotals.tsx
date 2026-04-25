import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getEntries, onFieldCollectChange, type FieldEntry } from '@/lib/fieldCollectStore';
import { formatUGX } from '@/lib/rentCalculations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, Clock, AlertCircle, FileWarning, CalendarDays, RefreshCcw, Download, FileText, FileSpreadsheet, CalendarIcon, Settings2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldCollectDailyDetailsSheet } from '@/components/agent/FieldCollectDailyDetailsSheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { FieldCollectReconciliationSheet } from '@/components/agent/FieldCollectReconciliationSheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportDailyTotalsCsv, exportDailyTotalsPdf } from '@/lib/fieldCollectExport';
import { format, isSameDay } from 'date-fns';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

interface Bucket {
  label: string;
  count: number;
  total: number;
}

interface SessionCutoffs {
  morningEnd: number;   // hour (0-23). Morning = [0, morningEnd)
  afternoonEnd: number; // hour (0-23). Afternoon = [morningEnd, afternoonEnd). Evening = [afternoonEnd, 24)
}

const DEFAULT_CUTOFFS: SessionCutoffs = { morningEnd: 12, afternoonEnd: 17 };
const CUTOFFS_STORAGE_KEY = 'welile.fieldCollect.sessionCutoffs';

function loadCutoffs(): SessionCutoffs {
  try {
    const raw = localStorage.getItem(CUTOFFS_STORAGE_KEY);
    if (!raw) return DEFAULT_CUTOFFS;
    const parsed = JSON.parse(raw) as Partial<SessionCutoffs>;
    const m = Number(parsed.morningEnd);
    const a = Number(parsed.afternoonEnd);
    if (!Number.isFinite(m) || !Number.isFinite(a)) return DEFAULT_CUTOFFS;
    if (m < 1 || m > 23 || a < 1 || a > 23 || m >= a) return DEFAULT_CUTOFFS;
    return { morningEnd: Math.floor(m), afternoonEnd: Math.floor(a) };
  } catch {
    return DEFAULT_CUTOFFS;
  }
}

function formatHour(h: number): string {
  const hh = String(h).padStart(2, '0');
  return `${hh}:00`;
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
  const [initialLoading, setInitialLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [dupPopoverOpen, setDupPopoverOpen] = useState(false);
  const [cutoffs, setCutoffs] = useState<SessionCutoffs>(() => loadCutoffs());
  const [cutoffsOpen, setCutoffsOpen] = useState(false);
  const [draftMorning, setDraftMorning] = useState<string>(String(cutoffs.morningEnd));
  const [draftAfternoon, setDraftAfternoon] = useState<string>(String(cutoffs.afternoonEnd));
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      setEntries(await getEntries(user.id));
      setLastRefreshed(Date.now());
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
    if (!live) return;
    const iv = window.setInterval(refresh, 4000);
    return () => window.clearInterval(iv);
  }, [refresh, live]);

  /**
   * Instant refresh on save/update/delete from anywhere in the app
   * (e.g. TenantFieldCollectDialog, FieldCollectDialog, sync worker).
   * Decoupled via the field-collect change event bus.
   */
  useEffect(() => {
    return onFieldCollectChange((detail) => {
      if (detail.agentId && user?.id && detail.agentId !== user.id) return;
      refresh();
    });
  }, [refresh, user?.id]);

  const isToday = isSameDay(selectedDate, new Date());

  const today = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return entries.filter(e => e.capturedAt >= start.getTime() && e.capturedAt <= end.getTime());
  }, [entries, selectedDate]);

  const handleExport = useCallback((kind: 'csv' | 'pdf') => {
    const agentName = (user?.user_metadata as any)?.full_name || user?.email || null;
    const payload = { date: selectedDate, agentName, entries: today };
    try {
      if (kind === 'csv') exportDailyTotalsCsv(payload);
      else exportDailyTotalsPdf(payload);
      toast.success(`Exported ${today.length} entr${today.length === 1 ? 'y' : 'ies'} as ${kind.toUpperCase()}`);
    } catch (err) {
      console.error('[fieldCollect] export failed', err);
      toast.error('Export failed');
    }
  }, [selectedDate, today, user]);

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
      if (h < cutoffs.morningEnd) morn.push(e);
      else if (h < cutoffs.afternoonEnd) aft.push(e);
      else eve.push(e);
    }
    const sum = (arr: FieldEntry[]) => arr.reduce((s, e) => s + Number(e.amount || 0), 0);
    return [
      { label: `Morning (until ${formatHour(cutoffs.morningEnd)})`, count: morn.length, total: sum(morn) },
      { label: `Afternoon (until ${formatHour(cutoffs.afternoonEnd)})`, count: aft.length, total: sum(aft) },
      { label: `Evening (from ${formatHour(cutoffs.afternoonEnd)})`, count: eve.length, total: sum(eve) },
    ];
  }, [today, cutoffs]);

  const saveCutoffs = useCallback(() => {
    const m = Math.floor(Number(draftMorning));
    const a = Math.floor(Number(draftAfternoon));
    if (!Number.isFinite(m) || !Number.isFinite(a)) {
      toast.error('Enter valid hours (0-23)');
      return;
    }
    if (m < 1 || m > 23 || a < 1 || a > 23) {
      toast.error('Hours must be between 1 and 23');
      return;
    }
    if (m >= a) {
      toast.error('Afternoon end must be after morning end');
      return;
    }
    const next = { morningEnd: m, afternoonEnd: a };
    setCutoffs(next);
    try { localStorage.setItem(CUTOFFS_STORAGE_KEY, JSON.stringify(next)); } catch {}
    setCutoffsOpen(false);
    toast.success('Session cutoffs updated');
  }, [draftMorning, draftAfternoon]);

  const resetCutoffs = useCallback(() => {
    setCutoffs(DEFAULT_CUTOFFS);
    setDraftMorning(String(DEFAULT_CUTOFFS.morningEnd));
    setDraftAfternoon(String(DEFAULT_CUTOFFS.afternoonEnd));
    try { localStorage.removeItem(CUTOFFS_STORAGE_KEY); } catch {}
    toast.success('Session cutoffs reset to defaults');
  }, []);

  const isInline = variant === 'inline';

  const dateLabel = isToday ? "Today's totals" : format(selectedDate, 'PPP');

  // Initial-load skeleton: matches the real layout to avoid jump
  if (initialLoading) {
    return (
      <div
        className={cn(
          'space-y-3',
          !isInline && 'rounded-2xl border bg-card p-4',
          className,
        )}
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex gap-1.5">
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div>
          <Skeleton className="h-3 w-20 mb-1.5" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-4 w-24 mx-auto" />
      </div>
    );
  }

  const dateSelector = (
    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px] gap-1"
          aria-label="Pick date"
        >
          <CalendarIcon className="h-3 w-3" />
          {isToday ? 'Today' : format(selectedDate, 'MMM d')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(d) => {
            if (d) {
              const nd = new Date(d);
              nd.setHours(0, 0, 0, 0);
              setSelectedDate(nd);
              setDatePickerOpen(false);
            }
          }}
          disabled={(d) => d > new Date()}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );

  const exportMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px] gap-1"
          aria-label="Export daily totals"
        >
          <Download className="h-3 w-3" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[11px]">
          {format(selectedDate, 'PPP')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleExport('csv')} className="gap-2 text-xs">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('pdf')} className="gap-2 text-xs">
          <FileText className="h-3.5 w-3.5" />
          Download PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
        {isToday ? 'No field collections yet today' : `No field collections on ${format(selectedDate, 'PPP')}`}
        <div className="mt-2 flex items-center justify-center gap-1.5 flex-wrap">
          {dateSelector}
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
            {dateLabel}
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
            <Popover open={dupPopoverOpen} onOpenChange={setDupPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`${breakdown.duplicate.count} duplicate receipts — click to review`}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                >
                  <FileWarning className="h-3 w-3" />
                  {breakdown.duplicate.count} dup
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="px-3 py-2 border-b">
                  <p className="text-xs font-semibold">Duplicate receipts</p>
                  <p className="text-[11px] text-muted-foreground">
                    Server already has these receipts. Reconcile to keep one or both.
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {today.filter(e => e.syncState === 'duplicate').map(e => {
                    const ref = e.duplicateOfServerId
                      ? `#${e.duplicateOfServerId.slice(0, 8)}`
                      : `#${e.id.slice(0, 8)}`;
                    const snap = e.duplicateServerSnapshot;
                    return (
                      <div key={e.id} className="px-3 py-2 border-b last:border-0 text-[11px] space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{e.tenantName || 'Walk-up'}</span>
                          <span className="text-muted-foreground font-mono text-[10px]">{ref}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Local: {formatUGX(e.amount)}</span>
                          {snap && <span>Server: {formatUGX(snap.amount)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-3 py-2 border-t">
                  <Button
                    type="button"
                    size="sm"
                    className="w-full h-8 text-xs gap-1"
                    onClick={() => {
                      setDupPopoverOpen(false);
                      setReconcileOpen(true);
                    }}
                  >
                    <FileWarning className="h-3.5 w-3.5" />
                    Open reconciliation
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {dateSelector}
          {exportMenu}
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
      {(() => {
        const pendingCount =
          breakdown.pending.count + breakdown.failed.count + breakdown.duplicate.count;
        const pendingTotal =
          breakdown.pending.total + breakdown.failed.total + breakdown.duplicate.total;
        const syncedPct = breakdown.count > 0
          ? Math.round((breakdown.synced.count / breakdown.count) * 100)
          : 0;
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-2">
                <div className="flex items-center justify-between gap-1 text-emerald-700 dark:text-emerald-400 text-[10px] uppercase tracking-wide font-medium">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Synced
                  </span>
                  <span className="tabular-nums">
                    {breakdown.synced.count}/{breakdown.count}
                  </span>
                </div>
                <p className="font-semibold mt-0.5">{formatUGX(breakdown.synced.total)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {breakdown.synced.count} confirmed
                </p>
              </div>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
                <div className="flex items-center justify-between gap-1 text-amber-700 dark:text-amber-400 text-[10px] uppercase tracking-wide font-medium">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Pending
                  </span>
                  <span className="tabular-nums">
                    {pendingCount}/{breakdown.count}
                  </span>
                </div>
                <p className="font-semibold mt-0.5">{formatUGX(pendingTotal)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-1.5">
                  {breakdown.pending.count > 0 && <span>{breakdown.pending.count} queued</span>}
                  {breakdown.failed.count > 0 && <span>· {breakdown.failed.count} failed</span>}
                  {breakdown.duplicate.count > 0 && <span>· {breakdown.duplicate.count} dup</span>}
                  {pendingCount === 0 && <span>none waiting</span>}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={syncedPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${syncedPct}% of entries synced`}
            >
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${syncedPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {syncedPct}% synced · {pendingCount} entr{pendingCount === 1 ? 'y' : 'ies'} still pending
            </p>
          </div>
        );
      })()}

      {/* Time-of-day sessions */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">By session</p>
          <Popover open={cutoffsOpen} onOpenChange={(o) => {
            setCutoffsOpen(o);
            if (o) {
              setDraftMorning(String(cutoffs.morningEnd));
              setDraftAfternoon(String(cutoffs.afternoonEnd));
            }
          }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Configure session cutoffs"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings2 className="h-3 w-3" />
                Cutoffs
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold">Session cutoffs</p>
                <p className="text-[11px] text-muted-foreground">
                  Set the hour each session ends (24-hour clock).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="morning-end" className="text-[11px]">Morning ends at</Label>
                  <Input
                    id="morning-end"
                    type="number"
                    min={1}
                    max={23}
                    value={draftMorning}
                    onChange={(e) => setDraftMorning(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="afternoon-end" className="text-[11px]">Afternoon ends at</Label>
                  <Input
                    id="afternoon-end"
                    type="number"
                    min={1}
                    max={23}
                    value={draftAfternoon}
                    onChange={(e) => setDraftAfternoon(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Morning: 00:00–{formatHour(Number(draftMorning) || cutoffs.morningEnd)} ·
                Afternoon: {formatHour(Number(draftMorning) || cutoffs.morningEnd)}–{formatHour(Number(draftAfternoon) || cutoffs.afternoonEnd)} ·
                Evening: {formatHour(Number(draftAfternoon) || cutoffs.afternoonEnd)}–24:00
              </p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={resetCutoffs}
                  className="h-8 text-[11px] gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveCutoffs}
                  className="h-8 text-[11px]"
                >
                  Save
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {sessions.map(s => (
            <div key={s.label} className={cn(
              'rounded-lg border px-2 py-1.5 text-center',
              s.count === 0 ? 'opacity-50' : 'bg-muted/30'
            )}>
              <p className="text-[10px] text-muted-foreground truncate" title={s.label}>{s.label.split(' (')[0]}</p>
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
      <FieldCollectReconciliationSheet open={reconcileOpen} onOpenChange={setReconcileOpen} />
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