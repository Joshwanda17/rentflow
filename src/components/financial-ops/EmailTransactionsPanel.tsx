import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, RefreshCw, Loader2, CheckCircle2, AlertCircle, Smartphone, Bug, ShieldAlert, Copy, Check, Wifi, WifiOff, ShieldCheck, History, LinkIcon, ChevronDown, ChevronUp, FileDown, FileText, AlertTriangle } from 'lucide-react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { downloadCsv } from '@/lib/csvExport';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend } from 'recharts';

interface GmailTx {
  id: string;
  gmail_message_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  snippet: string | null;
  amount: number | null;
  transaction_id: string | null;
  parsed: boolean;
  internal_date: string | null;
  direction: string | null;
  channel: string | null;
  counterparty: string | null;
  fee: number | null;
  balance: number | null;
}

interface PollState {
  last_polled_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

const fmtUgx = (n: number | null) =>
  n === null || n === undefined ? '—' : `UGX ${Math.round(n).toLocaleString()}`;

/**
 * Convert a wall-clock date+time string (e.g. "2026-05-18", "00:00:00") interpreted
 * in the given IANA timezone into a UTC epoch ms. Uses Intl.DateTimeFormat to
 * discover the zone's offset at that instant — no dependency on date-fns-tz.
 */
function zonedWallClockToUtcMs(dateStr: string, timeStr: string, tz: string): number {
  const naiveUtc = new Date(`${dateStr}T${timeStr}Z`).getTime();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(naiveUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offsetMs = asUtc - naiveUtc;
  return naiveUtc - offsetMs;
}

/** Format an instant as "yyyy-MM-dd" in the given timezone. */
function dateKeyInTz(d: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(d); // en-CA gives YYYY-MM-DD
}

const TIMEZONE_OPTIONS = [
  'Africa/Kampala',
  'Africa/Nairobi',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'UTC',
];

/**
 * Validate a parsed Gmail transaction row against its own raw email text.
 * A row is considered "flagged" (excluded from totals) when any of:
 *   - parsed=true but amount is null / non-finite / ≤ 0
 *   - parsed=true but no direction was extracted (can't classify in/out)
 *   - the parsed amount cannot be located inside the subject/snippet
 *     (means the parser & email disagree)
 * Returns { valid: true } for unparsed rows (they never count toward totals).
 */
function validateGmailTx(r: GmailTx): { valid: boolean; reason?: string } {
  if (!r.parsed) return { valid: true };
  if (r.amount === null || r.amount === undefined || !Number.isFinite(r.amount) || r.amount <= 0) {
    return { valid: false, reason: 'Parsed flag set but amount is missing or non-positive' };
  }
  if (!r.direction) {
    return { valid: false, reason: 'Missing direction (in / out / charge) — cannot classify' };
  }
  // Cross-check: the parsed amount should appear (with or without commas/decimals)
  // somewhere in the subject or snippet. Tolerate small rounding by matching
  // the integer part only.
  const haystack = `${r.subject ?? ''}\n${r.snippet ?? ''}`.replace(/[,\s]/g, '');
  if (haystack.length > 0) {
    const intPart = Math.round(r.amount).toString();
    if (!haystack.includes(intPart)) {
      return { valid: false, reason: `Parsed amount ${intPart} not found in email body` };
    }
  }
  return { valid: true };
}

/**
 * Live feed of transaction confirmation emails extracted from the
 * connected Gmail inbox. A background cron polls every minute; this
 * panel mirrors the table in real time and exposes a manual "Poll now".
 */
export function EmailTransactionsPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<GmailTx[]>([]);
  const [state, setState] = useState<PollState | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem('gmail_last_success_at') : null)
  );
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  // Date-range filter (inclusive). Empty string = unbounded on that side.
  // Persisted in localStorage so the selection survives a page refresh.
  const [fromDate, setFromDate] = useState<string>(() =>
    typeof window === 'undefined' ? '' : (localStorage.getItem('gmail_filter_from') || '')
  );
  const [toDate, setToDate] = useState<string>(() =>
    typeof window === 'undefined' ? '' : (localStorage.getItem('gmail_filter_to') || '')
  );
  useEffect(() => { try { localStorage.setItem('gmail_filter_from', fromDate); } catch {} }, [fromDate]);
  useEffect(() => { try { localStorage.setItem('gmail_filter_to', toDate); } catch {} }, [toDate]);
  // Timezone in which `fromDate`/`toDate` are interpreted and daily buckets are grouped.
  const browserTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  const [tz, setTz] = useState<string>(() => {
    if (typeof window === 'undefined') return browserTz || 'Africa/Kampala';
    return localStorage.getItem('gmail_filter_tz') || browserTz || 'Africa/Kampala';
  });
  useEffect(() => { try { localStorage.setItem('gmail_filter_tz', tz); } catch {} }, [tz]);
  // Configurable warning threshold for |net|. Persisted in localStorage. Default 1,000,000 UGX.
  const [netThreshold, setNetThreshold] = useState<number>(() => {
    if (typeof window === 'undefined') return 1_000_000;
    const raw = localStorage.getItem('gmail_net_threshold');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1_000_000;
  });
  useEffect(() => {
    try { localStorage.setItem('gmail_net_threshold', String(netThreshold)); } catch {}
  }, [netThreshold]);

  const load = async () => {
    const [{ data: txs }, { data: ps }] = await Promise.all([
      (supabase.from('gmail_transactions') as any)
        .select('id,gmail_message_id,from_email,from_name,subject,snippet,amount,transaction_id,parsed,internal_date,direction,channel,counterparty,fee,balance')
        .order('internal_date', { ascending: false, nullsFirst: false })
        .limit(200),
      supabase.from('gmail_poll_state').select('last_polled_at,last_status,last_error').eq('id', 1).maybeSingle(),
    ]);
    setRows((txs as unknown as GmailTx[]) ?? []);
    setState((ps as PollState) ?? null);
    const psTyped = ps as PollState | null;
    if (psTyped?.last_status === 'ok' && psTyped.last_polled_at) {
      setLastSuccessAt(psTyped.last_polled_at);
      try { localStorage.setItem('gmail_last_success_at', psTyped.last_polled_at); } catch {}
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('gmail_transactions_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gmail_transactions' }, (payload) => {
        setRows((cur) => [payload.new as GmailTx, ...cur].slice(0, 200));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const pollNow = async () => {
    setPolling(true);
    const { data, error } = await supabase.functions.invoke('gmail-poll-transactions', { body: {} });
    setPolling(false);
    if (error) {
      const friendly = friendlyPollError(error.message);
      toast({ title: friendly.title, description: friendly.description, variant: 'destructive' });
      await load(); // refresh state so banner shows the new error
    } else {
      const inserted = (data as any)?.inserted ?? 0;
      const scanned = (data as any)?.scanned ?? 0;
      toast({ title: `Scanned ${scanned} emails`, description: `Imported ${inserted} new transaction${inserted === 1 ? '' : 's'}.` });
      await load();
    }
  };

  // Apply date-range filter to everything that drives totals / breakdown / exports.
  // Dates are interpreted in the chosen timezone so the user sees stable bucketing
  // regardless of where the browser is running.
  const fromTs = fromDate ? zonedWallClockToUtcMs(fromDate, '00:00:00', tz) : null;
  const toTs = toDate ? zonedWallClockToUtcMs(toDate, '23:59:59', tz) : null;
  const inRange = (r: GmailTx) => {
    if (!fromTs && !toTs) return true;
    if (!r.internal_date) return false;
    const t = new Date(r.internal_date).getTime();
    if (fromTs && t < fromTs) return false;
    if (toTs && t > toTs) return false;
    return true;
  };
  const filteredRows = rows.filter(inRange);
  const rangeActive = Boolean(fromTs || toTs);
  const parsedCount = filteredRows.filter((r) => r.parsed).length;
  // Compute validity once per row so totals, breakdowns and the list agree.
  const validity = new Map<string, { valid: boolean; reason?: string }>();
  for (const r of rows) validity.set(r.id, validateGmailTx(r));
  const flaggedCount = filteredRows.filter((r) => r.parsed && !validity.get(r.id)!.valid).length;
  // Flagged rows are kept in totals (only highlighted in the UI). A row counts
  // toward totals as long as it's parsed and has a usable amount.
  const isCountable = (r: GmailTx) =>
    r.parsed && r.amount !== null && Number.isFinite(r.amount as number) && (r.amount as number) > 0;
  const totalAmount = filteredRows.filter(isCountable).reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalIn = filteredRows
    .filter((r) => isCountable(r) && r.direction === 'in')
    .reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalOut = filteredRows
    .filter((r) => isCountable(r) && (r.direction === 'out' || r.direction === 'charge'))
    .reduce((s, r) => s + (r.amount ?? 0), 0);
  const netAmount = totalIn - totalOut;

  // Per-channel breakdown with counts and totals per direction.
  const channelBreakdown = (() => {
    const map = new Map<
      string,
      { inCount: number; inTotal: number; outCount: number; outTotal: number }
    >();
    for (const r of filteredRows) {
      if (!isCountable(r)) continue;
      const key = (r.channel && r.channel !== 'other' ? r.channel : 'other').replace('_', ' ');
      const cur = map.get(key) ?? { inCount: 0, inTotal: 0, outCount: 0, outTotal: 0 };
      const amt = r.amount ?? 0;
      if (r.direction === 'in') {
        cur.inCount += 1;
        cur.inTotal += amt;
      } else if (r.direction === 'out' || r.direction === 'charge') {
        cur.outCount += 1;
        cur.outTotal += amt;
      }
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([channel, v]) => ({ channel, ...v, net: v.inTotal - v.outTotal }))
      .sort((a, b) => b.inTotal + b.outTotal - (a.inTotal + a.outTotal));
  })();

  // Daily in vs out series for the selected timeframe.
  const dailySeries = (() => {
    const map = new Map<string, { date: string; in: number; out: number; net: number }>();
    for (const r of filteredRows) {
      if (!isCountable(r) || !r.internal_date) continue;
      const key = dateKeyInTz(new Date(r.internal_date), tz);
      const cur = map.get(key) ?? { date: key, in: 0, out: 0, net: 0 };
      const amt = r.amount ?? 0;
      if (r.direction === 'in') cur.in += amt;
      else if (r.direction === 'out' || r.direction === 'charge') cur.out += amt;
      cur.net = cur.in - cur.out;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
            <Mail className="h-6 w-6 text-primary" /> Email Transaction Extractor
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live feed from the connected Gmail inbox. Polls every minute and parses MoMo, Airtel & bank confirmation emails.
          </p>
        </div>
        <Button onClick={pollNow} disabled={polling} className="gap-2">
          {polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Poll now
        </Button>
        <Button
          variant="outline"
          onClick={() => exportTotalsCsv({ rows: filteredRows, totalIn, totalOut, netAmount, channelBreakdown })}
          disabled={filteredRows.length === 0}
          className="gap-2"
        >
          <FileDown className="h-4 w-4" /> Export CSV
        </Button>
        <Button
          variant="outline"
          onClick={() => exportTotalsPdf({ rows: filteredRows, totalIn, totalOut, netAmount, channelBreakdown })}
          disabled={filteredRows.length === 0}
          className="gap-2"
        >
          <FileText className="h-4 w-4" /> Export PDF
        </Button>
        <ReconnectGmailDialog />
        <DebugPollDialog />
        <SmsSetupGuide />
      </div>

      {/* Date-range selector — recomputes totals/breakdown/exports for the chosen period. */}
      <div className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Date range</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {rangeActive
              ? `Showing ${filteredRows.length} of ${rows.length} emails — totals recomputed for ${fromDate || '…'} → ${toDate || '…'} (${tz})`
              : `No range selected — showing all ${rows.length} emails · timezone ${tz}`}
          </p>
        </div>
        <div className="flex flex-col">
          <label
            className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1"
            title="Date boundaries and daily buckets are interpreted in this timezone."
          >
            Timezone
          </label>
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {TIMEZONE_OPTIONS.includes(tz) ? null : <option value={tz}>{tz}</option>}
            {TIMEZONE_OPTIONS.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
            {browserTz && !TIMEZONE_OPTIONS.includes(browserTz) && (
              <option value={browserTz}>{browserTz} (browser)</option>
            )}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">To</label>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label
            className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1"
            title="Warn when the absolute Net (in − out) exceeds this amount — flags potentially unusual parsing."
          >
            Net warning ≥
          </label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">UGX</span>
            <input
              type="number"
              min={0}
              step={10000}
              value={netThreshold}
              onChange={(e) => {
                const v = Number(e.target.value);
                setNetThreshold(Number.isFinite(v) && v >= 0 ? v : 0);
              }}
              className="h-9 w-36 rounded-md border border-input bg-background pl-10 pr-2 text-sm tabular-nums"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {[
            { label: '7d', days: 7 },
            { label: '30d', days: 30 },
            { label: '90d', days: 90 },
          ].map((p) => (
            <Button
              key={p.label}
              variant="outline"
              size="sm"
              onClick={() => {
                // Anchor presets to "today" as seen in the selected timezone.
                const todayKey = dateKeyInTz(new Date(), tz);
                const [y, m, d] = todayKey.split('-').map(Number);
                const toUtc = Date.UTC(y, m - 1, d);
                const fromUtc = toUtc - (p.days - 1) * 86_400_000;
                const fmtKey = (ms: number) => {
                  const dt = new Date(ms);
                  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
                };
                setFromDate(fmtKey(fromUtc));
                setToDate(fmtKey(toUtc));
              }}
            >
              {p.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFromDate(''); setToDate(''); }}
            disabled={!rangeActive}
          >
            Clear
          </Button>
        </div>
      </div>

      <GmailConnectionStatus
        state={state}
        lastSuccessAt={lastSuccessAt}
        onRetry={pollNow}
        retrying={polling}
      />

      <GmailReconnectAuditPanel />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
        <StatCard label="Emails captured" value={rows.length.toString()} />
        <StatCard label="Parsed transactions" value={parsedCount.toString()} />
        <StatCard label="Total amount (parsed)" value={fmtUgx(totalAmount)} />
        <StatCard
          label="Total in (received)"
          value={fmtUgx(totalIn)}
          sub={<span className="text-[10px] text-emerald-600">↓ money received</span>}
        />
        <StatCard
          label="Total out (sent + charges)"
          value={fmtUgx(totalOut)}
          sub={<span className="text-[10px] text-rose-600">↑ money sent</span>}
        />
        <StatCard
          label="Net (in − out)"
          value={`${netAmount < 0 ? '-' : ''}${fmtUgx(Math.abs(netAmount))}`}
          info={
            <div className="space-y-1.5 text-xs leading-relaxed">
              <p className="font-semibold">How Net is calculated</p>
              <p>
                <span className="font-mono">Net = Total in − Total out</span>
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li><span className="text-emerald-300">Total in</span> = sum of <code>amount</code> for rows where <code>direction = 'in'</code> (money received).</li>
                <li><span className="text-rose-300">Total out</span> = sum of <code>amount</code> for rows where <code>direction = 'out'</code> or <code>'charge'</code> (sent + fees).</li>
              </ul>
              <p className="pt-1 border-t border-border/40">
                Only counts rows that are <strong>parsed</strong> and <strong>not flagged</strong> (amount present, direction known, amount found in email body), and that fall inside the selected date range.
              </p>
              <p className="text-muted-foreground">
                Currently: {fmtUgx(totalIn)} − {fmtUgx(totalOut)} = {netAmount < 0 ? '-' : ''}{fmtUgx(Math.abs(netAmount))}
              </p>
            </div>
          }
          sub={
            <div className="flex flex-col gap-1">
              <span className={`text-[10px] ${netAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {netAmount >= 0 ? 'net inflow' : 'net outflow'}
              </span>
              {netThreshold > 0 && Math.abs(netAmount) >= netThreshold && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1 w-fit"
                  title={`|Net| ${fmtUgx(Math.abs(netAmount))} ≥ threshold ${fmtUgx(netThreshold)}. Review parsed emails for duplicates, misclassified direction, or unusually large amounts.`}
                >
                  <AlertTriangle className="h-3 w-3" /> unusual · review
                </Badge>
              )}
            </div>
          }
        />
        <StatCard
          label="Last poll"
          value={state?.last_polled_at ? format(new Date(state.last_polled_at), 'HH:mm:ss') : '—'}
          sub={state?.last_status === 'error' ? (
            <span className="inline-flex items-center gap-1 text-destructive text-xs"><AlertCircle className="h-3 w-3" /> {state.last_error?.slice(0, 60)}</span>
          ) : state?.last_status === 'ok' ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="h-3 w-3" /> ok</span>
          ) : null}
        />
        <StatCard
          label="Flagged (review)"
          value={flaggedCount.toString()}
          sub={
            flaggedCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-600 text-[10px]">
                <AlertTriangle className="h-3 w-3" /> counted, but verify
              </span>
            ) : (
              <span className="text-[10px] text-emerald-600">all parsed rows valid</span>
            )
          }
        />
      </div>

      {channelBreakdown.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Breakdown by channel</h3>
            <span className="text-[11px] text-muted-foreground">parsed transactions only</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Channel</th>
                  <th className="text-right px-4 py-2 font-semibold">In (count)</th>
                  <th className="text-right px-4 py-2 font-semibold text-emerald-700">Total in</th>
                  <th className="text-right px-4 py-2 font-semibold">Out (count)</th>
                  <th className="text-right px-4 py-2 font-semibold text-rose-700">Total out</th>
                  <th className="text-right px-4 py-2 font-semibold">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {channelBreakdown.map((b) => (
                  <tr key={b.channel} className="hover:bg-muted/30">
                    <td className="px-4 py-2 capitalize font-medium">{b.channel}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{b.inCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-mono text-emerald-700">{fmtUgx(b.inTotal)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{b.outCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-mono text-rose-700">{fmtUgx(b.outTotal)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-mono font-semibold ${b.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {b.net < 0 ? '-' : ''}{fmtUgx(Math.abs(b.net))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 font-semibold">
                <tr>
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{channelBreakdown.reduce((s, b) => s + b.inCount, 0)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-mono text-emerald-700">{fmtUgx(totalIn)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{channelBreakdown.reduce((s, b) => s + b.outCount, 0)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-mono text-rose-700">{fmtUgx(totalOut)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-mono ${netAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {netAmount < 0 ? '-' : ''}{fmtUgx(Math.abs(netAmount))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {dailySeries.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">In vs Out — daily</h3>
            <span className="text-[11px] text-muted-foreground">
              {dailySeries.length} day{dailySeries.length === 1 ? '' : 's'}
              {rangeActive ? ' in selected range' : ''}
            </span>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySeries} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => format(new Date(v), 'MMM d')}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}k` : `${v}`)}
                  width={50}
                />
                <RTooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => format(new Date(v as string), 'PPP')}
                  formatter={(v: number, name) => [fmtUgx(v), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="in" name="In" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="out" name="Out" stroke="hsl(0 72% 51%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" name="Net" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-sm">Recent emails</h3>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground space-y-2">
            <Mail className="h-8 w-8 mx-auto opacity-30" />
            <p>No transaction emails captured yet.</p>
            <p className="text-xs">Click <strong>Poll now</strong> to fetch from Gmail, or wait for the next minute.</p>
          </div>
        ) : (
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {filteredRows.map((r) => (
              <div
                key={r.id}
                className={`p-4 transition-colors ${
                  r.parsed && !validity.get(r.id)!.valid
                    ? 'bg-amber-500/5 hover:bg-amber-500/10 border-l-2 border-l-amber-500'
                    : 'hover:bg-muted/30'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{r.from_name || r.from_email || 'Unknown'}</span>
                      {r.parsed ? (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">parsed</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">unparsed</Badge>
                      )}
                      {r.parsed && !validity.get(r.id)!.valid && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1"
                          title={validity.get(r.id)!.reason}
                        >
                          <AlertTriangle className="h-3 w-3" /> flagged · excluded
                        </Badge>
                      )}
                      {r.channel && r.channel !== 'other' && (
                        <Badge variant="outline" className="text-[10px] capitalize">{r.channel.replace('_',' ')}</Badge>
                      )}
                      {r.direction && (
                        <Badge variant="outline" className={`text-[10px] capitalize ${
                          r.direction === 'in' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                          : r.direction === 'out' ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                        }`}>{r.direction === 'in' ? 'received' : r.direction === 'out' ? 'sent' : 'charge'}</Badge>
                      )}
                      {r.transaction_id && <Badge variant="outline" className="text-[10px] font-mono">{r.transaction_id}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.subject || '(no subject)'}</p>
                    {(r.counterparty || r.fee || r.balance !== null) && (
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5 flex flex-wrap gap-x-3">
                        {r.counterparty && <span>↔ <strong className="text-foreground/80">{r.counterparty}</strong></span>}
                        {r.fee ? <span>fee {fmtUgx(r.fee)}</span> : null}
                        {r.balance !== null && r.balance !== undefined ? <span>bal {fmtUgx(r.balance)}</span> : null}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-1">{r.snippet}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-mono font-semibold text-sm ${r.amount ? 'text-emerald-600' : 'text-muted-foreground'}`}>{fmtUgx(r.amount)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {r.internal_date ? format(new Date(r.internal_date), 'MMM d, HH:mm') : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DedupAuditPanel />
    </div>
  );
}

function StatCard({ label, value, sub, info }: { label: string; value: string; sub?: React.ReactNode; info?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
        {label}
        {info && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="How this is calculated"
                  className="inline-flex items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors"
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-xs">
                {info}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </p>
      <p className="font-black text-lg mt-1">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

/**
 * Maps a raw poll error message into a friendly headline + description.
 * Covers the common Gmail / gateway failure modes operators encounter.
 */
function friendlyPollError(raw: string | null | undefined): { title: string; description: string; kind: 'expired' | 'scope' | 'rate' | 'network' | 'config' | 'gmail' | 'unknown' } {
  const m = (raw || '').toLowerCase();
  if (m.includes('google_mail_api_key') || m.includes('not connected') || m.includes('not configured')) {
    return { title: 'Gmail isn\'t connected', description: 'Connect a Gmail account in Lovable Cloud → Connectors before polling.', kind: 'config' };
  }
  if (m.includes('invalid credentials') || m.includes('unauthenticated') || m.includes('[401]') || m.includes(' 401')) {
    return { title: 'Gmail session expired', description: 'The OAuth token is no longer valid. Click Reconnect Gmail to re-authenticate.', kind: 'expired' };
  }
  if (m.includes('insufficient') || m.includes('scope') || m.includes('[403]') || m.includes(' 403')) {
    return { title: 'Missing Gmail permission', description: 'The connection lacks a required scope. Reconnect Gmail and approve all requested permissions.', kind: 'scope' };
  }
  if (m.includes('429') || m.includes('rate') || m.includes('quota')) {
    return { title: 'Gmail rate limit hit', description: 'Google is throttling requests. Wait a minute, then click Retry.', kind: 'rate' };
  }
  if (m.includes('502') || m.includes('503') || m.includes('504') || m.includes('timeout') || m.includes('fetch')) {
    return { title: 'Network or gateway hiccup', description: 'A transient error reached the Gmail gateway. Click Retry to try again.', kind: 'network' };
  }
  if (m.startsWith('gmail ') || m.includes('gmail /')) {
    return { title: 'Gmail rejected the request', description: raw?.slice(0, 200) || 'Unknown Gmail API error.', kind: 'gmail' };
  }
  return { title: 'Polling failed', description: raw?.slice(0, 200) || 'Unknown error. Click Retry to try again.', kind: 'unknown' };
}

function GmailConnectionStatus({
  state,
  lastSuccessAt,
  onRetry,
  retrying,
}: {
  state: PollState | null;
  lastSuccessAt: string | null;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
}) {
  const { toast } = useToast();
  const [verifying, setVerifying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [copiedDetails, setCopiedDetails] = useState(false);

  const verifyNow = async (action: 'verify' | 'reconnect_initiated') => {
    setVerifying(true);
    const { data, error } = await supabase.functions.invoke('gmail-verify-connection', { body: { action } });
    setVerifying(false);
    if (error) {
      toast({ title: 'Verify failed', description: error.message, variant: 'destructive' });
      return;
    }
    const oc = (data as any)?.outcome;
    const ms = (data as any)?.latency_ms;
    if (oc === 'verified' || oc === 'skipped') {
      toast({ title: `Gmail ${oc}`, description: ms ? `${ms}ms — logged to audit.` : 'Logged to audit.' });
    } else {
      toast({
        title: `Gmail ${oc ?? 'error'}`,
        description: ((data as any)?.error || 'See audit log for details.').slice(0, 200),
        variant: 'destructive',
      });
    }
    window.dispatchEvent(new CustomEvent('gmail-reconnect-audit-refresh'));
  };

  const isError = state?.last_status === 'error';
  const isOk = state?.last_status === 'ok';
  const friendly = isError ? friendlyPollError(state?.last_error) : null;
  const isExpired = friendly?.kind === 'expired' || friendly?.kind === 'scope';

  // Try to extract an HTTP status code from the raw error (e.g. "[401]", "status 403", "HTTP 429").
  const statusCode = (() => {
    if (!state?.last_error) return null;
    const m = state.last_error.match(/\b(?:HTTP\s*|status\s*|code\s*|\[)(\d{3})\b/i);
    return m ? m[1] : null;
  })();

  const tone = isExpired
    ? 'border-destructive/40 bg-destructive/5 text-destructive'
    : isError
      ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400'
      : isOk
        ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
        : 'border-border bg-muted/30 text-muted-foreground';

  const Icon = isExpired || isError ? WifiOff : isOk ? Wifi : Wifi;
  const label = isError
    ? friendly!.title
    : isOk
      ? 'Gmail connected'
      : 'Gmail status unknown';

  const copyDetails = async () => {
    if (!state?.last_error) return;
    try {
      await navigator.clipboard.writeText(state.last_error);
      setCopiedDetails(true);
      setTimeout(() => setCopiedDetails(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2 ${tone}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate flex items-center gap-2">
            {label}
            {isError && statusCode && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-current/30 bg-background/40">
                HTTP {statusCode}
              </span>
            )}
          </p>
          {isError && friendly && (
            <p className="text-[11px] opacity-80 line-clamp-2">{friendly.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] sm:text-xs shrink-0">
        <span className="opacity-80">
          Last successful poll:{' '}
          <strong className="font-mono">
            {lastSuccessAt ? format(new Date(lastSuccessAt), 'MMM d, HH:mm:ss') : 'never'}
          </strong>
        </span>
        {isError && state?.last_error && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 gap-1.5 text-[11px]"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
          >
            {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showDetails ? 'Hide details' : 'Show details'}
          </Button>
        )}
        {isError && onRetry && (
          <Button
            size="sm"
            variant="default"
            className="h-7 px-2 gap-1.5 text-[11px]"
            onClick={() => onRetry()}
            disabled={retrying}
          >
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Retry
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 gap-1.5 text-[11px]"
          onClick={() => verifyNow('verify')}
          disabled={verifying}
        >
          {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          Verify
        </Button>
        {(isExpired || isError) && (
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-2 gap-1.5 text-[11px]"
            onClick={() => verifyNow('reconnect_initiated')}
            disabled={verifying}
          >
            <RefreshCw className="h-3 w-3" />
            Log reconnect
          </Button>
        )}
      </div>
      </div>
      {isError && showDetails && state?.last_error && (
        <div className="rounded-lg border border-current/20 bg-background/60 text-foreground p-2.5 mt-1">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              Last poll error
              {state?.last_polled_at && (
                <span className="ml-2 font-mono normal-case tracking-normal">
                  · {format(new Date(state.last_polled_at), 'MMM d, HH:mm:ss')}
                </span>
              )}
              {statusCode && <span className="ml-2 font-mono">· HTTP {statusCode}</span>}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 gap-1 text-[10px]"
              onClick={copyDetails}
            >
              {copiedDetails ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiedDetails ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
            {state.last_error}
          </pre>
        </div>
      )}
    </div>
  );
}

interface ReconnectAuditRow {
  id: string;
  action: string;
  outcome: string;
  latency_ms: number | null;
  error_message: string | null;
  initiated_by_email: string | null;
  created_at: string;
}

function GmailReconnectAuditPanel() {
  const [rows, setRows] = useState<ReconnectAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await (supabase.from('gmail_reconnect_audit') as any)
      .select('id,action,outcome,latency_ms,error_message,initiated_by_email,created_at')
      .order('created_at', { ascending: false })
      .limit(25);
    setRows((data as ReconnectAuditRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener('gmail-reconnect-audit-refresh', onRefresh);
    const ch = supabase
      .channel('gmail_reconnect_audit_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gmail_reconnect_audit' },
        (payload) => setRows((cur) => [payload.new as ReconnectAuditRow, ...cur].slice(0, 25)),
      )
      .subscribe();
    return () => {
      window.removeEventListener('gmail-reconnect-audit-refresh', onRefresh);
      supabase.removeChannel(ch);
    };
  }, []);

  const outcomeBadge = (oc: string) => {
    const map: Record<string, string> = {
      verified: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
      skipped: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
      initiated: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
      failed: 'bg-rose-500/10 text-rose-700 border-rose-500/20',
      error: 'bg-destructive/10 text-destructive border-destructive/20',
    };
    return map[oc] ?? 'bg-muted text-muted-foreground';
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Gmail reconnect / verify audit log</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">last 25</span>
      </div>
      {loading ? (
        <div className="p-6 flex justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No verify or reconnect attempts recorded yet.
        </div>
      ) : (
        <div className="divide-y max-h-[320px] overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="p-3 text-sm flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] capitalize ${outcomeBadge(r.outcome)}`}>
                    {r.outcome}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {r.action.replace('_', ' ')}
                  </Badge>
                  {r.latency_ms !== null && (
                    <span className="text-[10px] font-mono text-muted-foreground">{r.latency_ms}ms</span>
                  )}
                  {r.initiated_by_email && (
                    <span className="text-[11px] text-muted-foreground truncate">by {r.initiated_by_email}</span>
                  )}
                </div>
                {r.error_message && (
                  <p className="text-[11px] text-destructive/90 mt-1 line-clamp-2">{r.error_message}</p>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
                {format(new Date(r.created_at), 'MMM d, HH:mm:ss')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SmsSetupGuide() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Smartphone className="h-4 w-4" /> SMS → Gmail setup
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Auto-forward SMS to Gmail</DialogTitle>
          <DialogDescription>
            One-time phone setup. After this, every incoming SMS is forwarded to the connected Gmail and appears here within 1 minute.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-1">Android (recommended)</p>
            <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
              <li>Install <strong>SMS Forwarder</strong> by Hannes Petri (free, open-source) from the Play Store.</li>
              <li>Open the app → tap <strong>Add rule</strong>.</li>
              <li>Sender filter: leave blank, or restrict to shortcodes like <code className="text-xs">MTNMoMo</code>, <code className="text-xs">Airtel</code>, <code className="text-xs">Stanbic</code>.</li>
              <li>Action: <strong>Email</strong>. Set the recipient to the Gmail address connected to Welile.</li>
              <li>Subject: <code className="text-xs">SMS from {'{sender}'}</code> &nbsp;|&nbsp; Body: <code className="text-xs">{'{content}'}</code></li>
              <li>Grant SMS permission and disable battery optimisation for the app.</li>
              <li>Send a test SMS to confirm it lands in Gmail and appears in this feed.</li>
            </ol>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="font-semibold mb-1">iPhone</p>
            <p className="text-muted-foreground">iOS does not allow apps to read SMS, so true auto-forwarding isn't possible. Use a dedicated Android device for the SIM, or route the SIM through a GSM gateway.</p>
          </div>
          <p className="text-xs text-muted-foreground">
            The poller already matches subjects starting with <code>SMS from…</code> and emails from any sender containing <code>smsforwarder</code>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface DebugItem {
  id: string;
  decision: string;
  reason?: string;
  from?: string | null;
  from_name?: string | null;
  subject?: string | null;
  snippet?: string | null;
  internal_date?: string | null;
  last_cutoff?: string | null;
  extracted?: Record<string, any>;
  parser_notes?: string[];
}

function DebugPollDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DebugItem[] | null>(null);
  const [meta, setMeta] = useState<{ scanned: number; query: string; last_cutoff: string | null } | null>(null);
  const [filter, setFilter] = useState<'all' | 'parsed' | 'unparsed' | 'skipped'>('all');

  const runDebug = async () => {
    setRunning(true); setReport(null);
    const { data, error } = await supabase.functions.invoke('gmail-poll-transactions', { body: { debug: true } });
    setRunning(false);
    if (error) {
      toast({ title: 'Debug poll failed', description: error.message, variant: 'destructive' });
      return;
    }
    const d = data as any;
    setReport((d?.debug ?? []) as DebugItem[]);
    setMeta({ scanned: d?.scanned ?? 0, query: d?.query ?? '', last_cutoff: d?.last_cutoff ?? null });
  };

  const filtered = (report ?? []).filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'skipped') return r.decision === 'skipped';
    if (filter === 'parsed') return r.decision === 'would_insert_parsed';
    if (filter === 'unparsed') return r.decision === 'would_insert_unparsed';
    return true;
  });

  const counts = {
    parsed: (report ?? []).filter((r) => r.decision === 'would_insert_parsed').length,
    unparsed: (report ?? []).filter((r) => r.decision === 'would_insert_unparsed').length,
    skipped: (report ?? []).filter((r) => r.decision === 'skipped').length,
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Bug className="h-4 w-4" /> Debug poll
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gmail poll debug report</DialogTitle>
          <DialogDescription>
            Runs the poller in dry-run mode and shows why each scanned email was matched, rejected, or only partially parsed. Nothing is written to the database.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={runDebug} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
            Run dry-run
          </Button>
          {report && (
            <>
              <Badge variant="outline">scanned {meta?.scanned ?? 0}</Badge>
              <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">parsed {counts.parsed}</Badge>
              <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/20">unparsed {counts.unparsed}</Badge>
              <Badge variant="secondary">skipped {counts.skipped}</Badge>
              <div className="ml-auto flex gap-1">
                {(['all','parsed','unparsed','skipped'] as const).map((f) => (
                  <Button key={f} size="sm" variant={filter === f ? 'default' : 'ghost'} onClick={() => setFilter(f)} className="h-7 text-xs capitalize">{f}</Button>
                ))}
              </div>
            </>
          )}
        </div>
        {meta?.last_cutoff && (
          <p className="text-[11px] text-muted-foreground">
            Last poll cutoff: <code>{meta.last_cutoff}</code> — emails older than this are skipped.
          </p>
        )}
        <div className="max-h-[55vh] overflow-y-auto space-y-2 -mx-1 px-1">
          {!report && !running && (
            <p className="text-sm text-muted-foreground py-8 text-center">Click <strong>Run dry-run</strong> to inspect the next 50 emails Gmail returns for the query.</p>
          )}
          {running && (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {report && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">No emails match this filter.</p>
          )}
          {filtered.map((item) => {
            const tone = item.decision === 'would_insert_parsed' ? 'border-emerald-500/30 bg-emerald-500/5'
              : item.decision === 'would_insert_unparsed' ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-muted bg-muted/30';
            const label = item.decision === 'would_insert_parsed' ? 'parsed'
              : item.decision === 'would_insert_unparsed' ? 'unparsed'
              : `skipped • ${item.reason ?? ''}`;
            return (
              <div key={item.id} className={`rounded-lg border p-3 text-xs ${tone}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{item.from_name || item.from || 'Unknown sender'}</p>
                    <p className="text-muted-foreground truncate">{item.subject || '(no subject)'}</p>
                    {item.snippet && <p className="text-muted-foreground/80 line-clamp-2 mt-1">{item.snippet}</p>}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{label}</Badge>
                </div>
                {item.extracted && (
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 font-mono text-[10px]">
                    {Object.entries(item.extracted).map(([k, v]) => (
                      <div key={k} className="truncate">
                        <span className="text-muted-foreground">{k}:</span> <span className={v == null ? 'text-rose-600' : 'text-foreground'}>{v == null ? '—' : String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {item.parser_notes && item.parser_notes.length > 0 && (
                  <p className="mt-2 text-[10px] text-amber-700">Notes: {item.parser_notes.join(', ')}</p>
                )}
                {item.reason === 'older_than_last_poll' && item.internal_date && (
                  <p className="mt-1 text-[10px] text-muted-foreground">internal_date {item.internal_date} ≤ cutoff {item.last_cutoff}</p>
                )}
              </div>
            );
          })}
        </div>
        {meta?.query && (
          <details className="text-[10px] text-muted-foreground">
            <summary className="cursor-pointer">Gmail search query</summary>
            <pre className="mt-1 whitespace-pre-wrap break-all bg-muted p-2 rounded">{meta.query}</pre>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}
interface DedupAuditRow {
  id: string;
  gmail_message_id: string;
  dedup_hash: string | null;
  matched_transaction_id: string | null;
  matched_row_id: string | null;
  reason: string;
  from_email: string | null;
  subject: string | null;
  snippet: string | null;
  internal_date: string | null;
  created_at: string;
}

function DedupAuditPanel() {
  const [rows, setRows] = useState<DedupAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<'all' | 'transaction_id_match' | 'dedup_hash_match'>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await (supabase.from('gmail_dedup_audit') as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setRows((data as DedupAuditRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('gmail_dedup_audit_feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gmail_dedup_audit' }, (payload) => {
        setRows((cur) => [payload.new as DedupAuditRow, ...cur].slice(0, 100));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const counts = {
    all: rows.length,
    transaction_id_match: rows.filter((r) => r.reason === 'transaction_id_match').length,
    dedup_hash_match: rows.filter((r) => r.reason === 'dedup_hash_match').length,
  };

  const filtered = rows.filter((r) => {
    if (filter !== 'all' && r.reason !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [r.from_email, r.subject, r.snippet, r.matched_transaction_id, r.dedup_hash, r.gmail_message_id]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const copySnippet = async (r: DedupAuditRow) => {
    const text = [
      `From: ${r.from_email || 'Unknown'}`,
      `Subject: ${r.subject || '(no subject)'}`,
      `Reason: ${r.reason}`,
      `Matched TID: ${r.matched_transaction_id || '—'}`,
      `Hash: ${r.dedup_hash || '—'}`,
      `Gmail ID: ${r.gmail_message_id}`,
      `Date: ${r.internal_date ? format(new Date(r.internal_date), 'yyyy-MM-dd HH:mm:ss') : '—'}`,
      `---`,
      r.snippet || '',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(r.id);
      setTimeout(() => setCopiedId((cur) => (cur === r.id ? null : cur)), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 border-b flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <h3 className="font-semibold text-sm">Dedup audit log</h3>
          <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <>
          <div className="p-3 border-b flex flex-wrap items-center gap-2 bg-muted/20">
            {([
              { id: 'all', label: 'All' },
              { id: 'transaction_id_match', label: 'TID match' },
              { id: 'dedup_hash_match', label: 'Hash match' },
            ] as const).map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={filter === f.id ? 'default' : 'outline'}
                onClick={() => setFilter(f.id)}
                className="h-7 text-xs gap-1.5"
              >
                {f.label}
                <Badge variant="secondary" className="text-[10px] h-4 px-1">{counts[f.id]}</Badge>
              </Button>
            ))}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sender, subject, TID, hash…"
              className="ml-auto h-7 text-xs px-2 rounded border bg-background w-full sm:w-64"
            />
          </div>
          {loading ? (
            <div className="p-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {rows.length === 0
                ? 'No deduplicated emails yet. Skipped duplicates will appear here in real time.'
                : 'No entries match the current filters.'}
            </div>
          ) : (
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {filtered.map((r) => (
                <div key={r.id} className="p-3 text-xs hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{r.from_email || 'Unknown sender'}</p>
                      <p className="text-muted-foreground truncate">{r.subject || '(no subject)'}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] ${
                        r.reason === 'transaction_id_match'
                          ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                      }`}
                    >
                      {r.reason.replace('_', ' ')}
                    </Badge>
                  </div>
                  {r.snippet && (
                    <div className="mt-2 relative">
                      <pre className="p-2 rounded bg-muted/60 border border-border/50 text-[11px] text-muted-foreground whitespace-pre-wrap break-words font-mono leading-snug pr-8">
                        {r.snippet.slice(0, 200)}{r.snippet.length > 200 ? '…' : ''}
                      </pre>
                      <button
                        type="button"
                        onClick={() => copySnippet(r)}
                        className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedId === r.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
                    {r.matched_transaction_id && (
                      <span>matched TID: <span className="text-foreground">{r.matched_transaction_id}</span></span>
                    )}
                    {r.dedup_hash && (
                      <span title={r.dedup_hash}>hash: <span className="text-foreground">{r.dedup_hash.slice(0, 12)}…</span></span>
                    )}
                    <span>msg: {r.gmail_message_id.slice(0, 14)}…</span>
                    <span>{format(new Date(r.created_at), 'MMM d HH:mm:ss')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type ChannelBreakdownRow = {
  channel: string;
  inCount: number;
  inTotal: number;
  outCount: number;
  outTotal: number;
  net: number;
};

type ExportPayload = {
  rows: GmailTx[];
  totalIn: number;
  totalOut: number;
  netAmount: number;
  channelBreakdown: ChannelBreakdownRow[];
};

function buildPerDayBreakdown(rows: GmailTx[]) {
  const map = new Map<string, { inCount: number; inTotal: number; outCount: number; outTotal: number }>();
  for (const r of rows) {
    if (!r.parsed) continue;
    const day = r.internal_date ? format(new Date(r.internal_date), 'yyyy-MM-dd') : 'unknown';
    const cur = map.get(day) ?? { inCount: 0, inTotal: 0, outCount: 0, outTotal: 0 };
    const amt = r.amount ?? 0;
    if (r.direction === 'in') { cur.inCount += 1; cur.inTotal += amt; }
    else if (r.direction === 'out' || r.direction === 'charge') { cur.outCount += 1; cur.outTotal += amt; }
    map.set(day, cur);
  }
  return Array.from(map.entries())
    .map(([day, v]) => ({ day, ...v, net: v.inTotal - v.outTotal }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

function exportTotalsCsv({ rows, totalIn, totalOut, netAmount, channelBreakdown }: ExportPayload) {
  const perDay = buildPerDayBreakdown(rows);
  const stamp = format(new Date(), 'yyyy-MM-dd_HHmm');

  const allRows: (string | number)[][] = [];
  allRows.push(['Section', 'Key', 'In count', 'Total in (UGX)', 'Out count', 'Total out (UGX)', 'Net (UGX)']);
  allRows.push(['Summary', 'All parsed', rows.filter(r => r.parsed && r.direction === 'in').length, Math.round(totalIn),
    rows.filter(r => r.parsed && (r.direction === 'out' || r.direction === 'charge')).length, Math.round(totalOut), Math.round(netAmount)]);
  allRows.push(['', '', '', '', '', '', '']);
  for (const c of channelBreakdown) {
    allRows.push(['Channel', c.channel, c.inCount, Math.round(c.inTotal), c.outCount, Math.round(c.outTotal), Math.round(c.net)]);
  }
  allRows.push(['', '', '', '', '', '', '']);
  for (const d of perDay) {
    allRows.push(['Day', d.day, d.inCount, Math.round(d.inTotal), d.outCount, Math.round(d.outTotal), Math.round(d.net)]);
  }
  downloadCsv(`email-transactions-totals_${stamp}.csv`, allRows[0] as string[], allRows.slice(1));
}

async function exportTotalsPdf({ rows, totalIn, totalOut, netAmount, channelBreakdown }: ExportPayload) {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = (autoTableModule as any).default ?? (autoTableModule as any);

  const perDay = buildPerDayBreakdown(rows);
  const stamp = format(new Date(), 'yyyy-MM-dd HH:mm');
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('Email Transactions — Totals Report', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Generated ${stamp}`, 14, 25);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    head: [['Metric', 'Value']],
    body: [
      ['Total in (received)', `UGX ${Math.round(totalIn).toLocaleString()}`],
      ['Total out (sent + charges)', `UGX ${Math.round(totalOut).toLocaleString()}`],
      ['Net (in − out)', `UGX ${Math.round(netAmount).toLocaleString()}`],
      ['Parsed transactions', String(rows.filter(r => r.parsed).length)],
      ['Emails captured', String(rows.length)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  if (channelBreakdown.length > 0) {
    autoTable(doc, {
      head: [['Channel', 'In #', 'Total in', 'Out #', 'Total out', 'Net']],
      body: channelBreakdown.map(c => [
        c.channel,
        c.inCount,
        `UGX ${Math.round(c.inTotal).toLocaleString()}`,
        c.outCount,
        `UGX ${Math.round(c.outTotal).toLocaleString()}`,
        `UGX ${Math.round(c.net).toLocaleString()}`,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  if (perDay.length > 0) {
    autoTable(doc, {
      head: [['Day', 'In #', 'Total in', 'Out #', 'Total out', 'Net']],
      body: perDay.map(d => [
        d.day,
        d.inCount,
        `UGX ${Math.round(d.inTotal).toLocaleString()}`,
        d.outCount,
        `UGX ${Math.round(d.outTotal).toLocaleString()}`,
        `UGX ${Math.round(d.net).toLocaleString()}`,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  doc.save(`email-transactions-totals_${format(new Date(), 'yyyy-MM-dd_HHmm')}.pdf`);
}

function ReconnectGmailDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);

  const logReconnectAttempt = async () => {
    setLogging(true);
    const { error } = await supabase.functions.invoke('gmail-verify-connection', {
      body: { action: 'reconnect_initiated' },
    });
    setLogging(false);
    if (error) {
      toast({ title: 'Audit log failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Reconnect attempt logged',
      description: 'Now ask the AI in chat to reconnect Gmail to complete OAuth.',
    });
    window.dispatchEvent(new CustomEvent('gmail-reconnect-audit-refresh'));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <LinkIcon className="h-4 w-4" /> Reconnect Gmail
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" /> Reconnect Gmail
          </DialogTitle>
          <DialogDescription>
            Use this when polling has stopped because the Gmail connection's OAuth token has
            expired or scopes have changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
            <li>
              Click <strong className="text-foreground">Log &amp; open chat</strong> below — this
              records the attempt in the audit log.
            </li>
            <li>
              In the Lovable chat, type{' '}
              <code className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[11px]">
                Reconnect Gmail
              </code>{' '}
              and approve the OAuth prompt that appears.
            </li>
            <li>
              Return here and click <strong className="text-foreground">Verify</strong> on the
              status banner to confirm the new token works.
            </li>
          </ol>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-700 dark:text-amber-400">
            OAuth must complete in the Lovable chat surface — browsers can't initiate the
            reconnect directly from this page.
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={logReconnectAttempt} disabled={logging} className="gap-2">
            {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Log &amp; open chat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
