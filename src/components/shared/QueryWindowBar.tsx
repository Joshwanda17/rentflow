import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CalendarRange, X } from 'lucide-react';

/**
 * Shared "honest window" helpers for truncated ops queues.
 *
 * Every list that caps its fetch (500 / 200 / 1000 rows) must (a) let the
 * operator narrow the window with an explicit date range and (b) say plainly
 * when the cap was hit, so the badge count and the rendered rows always
 * describe the same window. Presentation only — no business logic here.
 */

/** Africa/Kampala (UTC+3) start-of-day for a `yyyy-MM-dd` input value. */
export function kampalaDayStartISO(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00+03:00`).toISOString();
}

/** Africa/Kampala (UTC+3) end-of-day for a `yyyy-MM-dd` input value. */
export function kampalaDayEndISO(dateIso: string): string {
  return new Date(`${dateIso}T23:59:59.999+03:00`).toISOString();
}

interface DateWindowFilterProps {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  /** Which timestamp the window applies to, e.g. "last activity". */
  fieldLabel?: string;
  className?: string;
}

export function DateWindowFilter({
  from,
  to,
  onFromChange,
  onToChange,
  fieldLabel,
  className = '',
}: DateWindowFilterProps) {
  const hasWindow = !!from || !!to;
  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
          <CalendarRange className="h-3 w-3" />
          From{fieldLabel ? ` (${fieldLabel})` : ''}
        </Label>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-8 w-[150px] text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase text-muted-foreground">To</Label>
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
          className="h-8 w-[150px] text-xs"
        />
      </div>
      {hasWindow && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-[11px]"
          onClick={() => {
            onFromChange('');
            onToChange('');
          }}
        >
          <X className="h-3 w-3" />
          Clear dates
        </Button>
      )}
    </div>
  );
}

interface TruncationNoticeProps {
  /** How many rows actually came back. */
  fetched: number;
  /** The server-side cap that was applied. */
  limit: number;
  /** What the rows are, e.g. "records", "actions". */
  noun?: string;
  /** Extra hint appended to the notice. */
  hint?: string;
}

export function TruncationNotice({
  fetched,
  limit,
  noun = 'records',
  hint = 'Narrow the date range to see the rest.',
}: TruncationNoticeProps) {
  if (fetched < limit) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Showing the first {limit.toLocaleString()} {noun} only — more exist outside this
        window. {hint}
      </span>
    </div>
  );
}

interface WindowSummaryProps {
  /** Rows currently rendered after local search/filters. */
  visible: number;
  /** Rows loaded for the fetched window. */
  loaded: number;
  from?: string;
  to?: string;
  noun?: string;
}

/** One-line, literal description of what the numbers above refer to. */
export function WindowSummary({ visible, loaded, from, to, noun = 'records' }: WindowSummaryProps) {
  const window =
    from && to
      ? `${from} → ${to}`
      : from
        ? `from ${from}`
        : to
          ? `up to ${to}`
          : 'all dates';
  return (
    <p className="text-[10px] text-muted-foreground">
      Showing {visible.toLocaleString()} of {loaded.toLocaleString()} loaded {noun} · window:{' '}
      {window}
    </p>
  );
}
