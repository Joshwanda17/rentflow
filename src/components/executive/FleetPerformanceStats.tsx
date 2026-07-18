import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { ACTIVE_RENT_STATUSES } from '@/hooks/useAgentCapacityMap';
import {
  Target, Banknote, Percent, Loader2, ArrowUpDown, ArrowUp, ArrowDown,
  Search, Share2, ChevronDown, ChevronLeft, ChevronRight, X, Download, Receipt,
  Info, AlertTriangle, Eye, SlidersHorizontal, ShieldCheck, CheckCircle2,
} from 'lucide-react';
import { CalendarRange } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipProvider as UiTooltipProvider,
  TooltipTrigger as UiTooltipTrigger,
} from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQualifyingAgentIds } from '@/hooks/useQualifyingAgentIds';
import { useQueryClient } from '@tanstack/react-query';
import { LastUpdatedChip } from './LastUpdatedChip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

type PeriodKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'last_month' | 'all' | 'custom';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last week' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'all', label: 'All time' },
];

/** Earliest date used as the lower bound for the "All time" range. */
const ALL_TIME_START = new Date(2023, 0, 1);

const STORAGE_KEY = 'fleet-perf-range';

/** Safely read a string from localStorage. */
function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

/** Safely write a string to localStorage. */
function writeStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
}

/** Parse a persisted sort value like "when:desc" into key + direction. */
function parsePersistedSort<T extends string>(raw: string | null, validKeys: readonly T[], defaultKey: T, defaultDir: 'asc' | 'desc') {
  if (!raw) return { key: defaultKey, dir: defaultDir };
  const [k, d] = raw.split(':');
  const key = validKeys.includes(k as T) ? (k as T) : defaultKey;
  const dir = d === 'asc' || d === 'desc' ? d : defaultDir;
  return { key, dir };
}

type TrendGranularity = 'hour' | 'day' | 'month';

function granularityFor(days: number): TrendGranularity {
  if (days <= 1) return 'hour';
  if (days <= 92) return 'day';
  return 'month';
}

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

/** Build a board-ready, color-coded HTML report (cover page + breakdown) and open the print/share dialog. */
function shareAsPdf(opts: {
  periodLabel: string;
  days: number;
  start: Date;
  end: Date;
  totalExpected: number;
  totalCollected: number;
  rate: number;
  rows: { id: string; name: string; expected: number; collected: number; rate: number }[];
}) {
  const { periodLabel, days, start, end, totalExpected, totalCollected, rate, rows } = opts;
  const toneFor = (r: number) => (r >= 100 ? '#059669' : r >= 80 ? '#059669' : r >= 50 ? '#d97706' : '#dc2626');
  const verdict = rate >= 100 ? 'Exceeding target' : rate >= 80 ? 'On track' : rate >= 50 ? 'Needs a push' : 'Falling behind';
  const generated = new Date().toLocaleString();
  const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  // end is exclusive; show the last covered day for human reading
  const lastDay = new Date(end.getTime() - 1);
  const rangeLabel = days <= 1 ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(lastDay)}`;
  const shortfall = Math.max(0, totalExpected - totalCollected);
  const topName = rows[0]?.name || '—';
  const rowsHtml = rows
    .map((r, i) => {
      const c = toneFor(r.rate);
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const overLabel = r.rate > 100 ? ` ↑${r.rate - 100}% over` : '';
      return `<tr>
        <td class="rank">${medal || i + 1}</td>
        <td class="name">${(r.name || '').replace(/</g, '&lt;')}</td>
        <td class="num">${formatUGX(r.expected)}</td>
        <td class="num strong">${formatUGX(r.collected)}</td>
        <td class="rate" style="color:${c}">
          <span class="dot" style="background:${c}"></span>${r.rate}%${overLabel}
        </td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Fleet Performance · ${periodLabel}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 28px; }
      h1 { font-size: 24px; margin: 0 0 2px; }
      .sub { color: #6b7280; font-size: 13px; margin: 0 0 18px; }
      .cards { display: flex; gap: 12px; margin-bottom: 18px; }
      .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; }
      .card .lbl { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; }
      .card .val { font-size: 26px; font-weight: 800; margin-top: 4px; }
      .verdict { display: inline-block; padding: 6px 14px; border-radius: 999px; font-weight: 800; font-size: 15px; color: #fff; margin-bottom: 18px; }
      .barwrap { height: 14px; background: #f1f5f9; border-radius: 999px; overflow: hidden; margin: 10px 0 22px; }
      .bar { height: 100%; border-radius: 999px; }
      table { width: 100%; border-collapse: collapse; font-size: 15px; }
      th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; border-bottom: 2px solid #e5e7eb; padding: 8px 10px; }
      th.num, th.rate { text-align: right; }
      td { padding: 11px 10px; border-bottom: 1px solid #f1f5f9; }
      td.rank { font-weight: 800; width: 44px; font-size: 17px; }
      td.name { font-weight: 700; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
      td.num.strong { font-weight: 800; }
      td.rate { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
      .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
      tr:nth-child(even) td { background: #fafafa; }
      .foot { margin-top: 20px; color: #9ca3af; font-size: 11px; }
      @media print { body { padding: 0; } }
      /* Cover page */
      .cover { min-height: 92vh; display: flex; flex-direction: column; justify-content: center; padding: 8vh 6vw; page-break-after: always; }
      .brand { font-size: 13px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: #2563eb; margin-bottom: 14px; }
      .cover h1 { font-size: 46px; line-height: 1.05; margin: 0 0 10px; }
      .cover .period { font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 4px; }
      .cover .periodsub { font-size: 14px; color: #6b7280; margin: 0 0 28px; }
      .cover .verdict { font-size: 18px; }
      .keytotals { display: flex; gap: 16px; margin-top: 8px; }
      .keytotals .card { background: #fafafa; }
      .keytotals .card .val { font-size: 30px; }
      .cover .gen { margin-top: auto; padding-top: 30px; color: #9ca3af; font-size: 12px; }
      .section-title { font-size: 18px; font-weight: 800; margin: 0 0 14px; }
    </style></head><body>
    <!-- Cover page -->
    <section class="cover">
      <div class="brand">Welile · Executive Report</div>
      <h1>Fleet Performance<br/>Collection Report</h1>
      <p class="period">${periodLabel}</p>
      <p class="periodsub">Reporting period: ${rangeLabel} · ${days} day${days === 1 ? '' : 's'} · ${rows.length} agent${rows.length === 1 ? '' : 's'}</p>
      <div class="verdict" style="background:${toneFor(rate)}">${verdict} — ${rate}% collected</div>
      <div class="keytotals">
        <div class="card"><div class="lbl">Expected</div><div class="val" style="color:#7c3aed">${formatUGX(totalExpected)}</div></div>
        <div class="card"><div class="lbl">Collected</div><div class="val" style="color:#2563eb">${formatUGX(totalCollected)}</div></div>
        <div class="card"><div class="lbl">Shortfall</div><div class="val" style="color:${shortfall > 0 ? '#dc2626' : '#059669'}">${formatUGX(shortfall)}</div></div>
        <div class="card"><div class="lbl">Top agent</div><div class="val" style="font-size:18px;color:#111827">${topName.replace(/</g, '&lt;')}</div></div>
      </div>
      <p class="gen">Generated ${generated}</p>
    </section>

    <!-- Detail page -->
    <h1>Fleet Performance</h1>
    <p class="sub">${periodLabel} · ${rangeLabel} · ${rows.length} agent${rows.length === 1 ? '' : 's'}</p>
    <div class="cards">
      <div class="card"><div class="lbl">Expected</div><div class="val" style="color:#7c3aed">${formatUGX(totalExpected)}</div></div>
      <div class="card"><div class="lbl">Collected</div><div class="val" style="color:#2563eb">${formatUGX(totalCollected)}</div></div>
      <div class="card"><div class="lbl">Collection rate</div><div class="val" style="color:${toneFor(rate)}">${rate}%</div></div>
    </div>
    <div class="barwrap"><div class="bar" style="width:${Math.min(rate, 100)}%;background:${toneFor(rate)}"></div></div>
    <p class="section-title">Agent-by-agent breakdown</p>
    <table>
      <thead><tr><th>#</th><th>Agent</th><th class="num">Expected</th><th class="num">Collected</th><th class="rate">Rate</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:24px">No agent activity in this period.</td></tr>'}</tbody>
    </table>
    <p class="foot">Welile · Agent rent collection report</p>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Build a print-ready PDF of the trend chart data (per hour / day / month) and open the print dialog. */
function shareTrendAsPdf(opts: {
  periodLabel: string;
  granLabel: string;
  rangeLabel: string;
  rows: { label: string; collected: number; expected: number }[];
}) {
  const { periodLabel, granLabel, rangeLabel, rows } = opts;
  const generated = new Date().toLocaleString();
  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const overallRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.collected, r.expected)));
  const toneFor = (r: number) => (r >= 100 ? '#059669' : r >= 50 ? '#d97706' : '#dc2626');
  const rowsHtml = rows
    .map((r) => {
      const rate = r.expected > 0 ? Math.round((r.collected / r.expected) * 100) : 0;
      const c = toneFor(rate);
      const w = Math.round((r.collected / maxVal) * 100);
      const overLabel = rate > 100 ? ` ↑${rate - 100}%` : '';
      return `<tr>
        <td class="lbl">${(r.label || '').replace(/</g, '&lt;')}</td>
        <td class="num">${formatUGX(r.expected)}</td>
        <td class="num strong">${formatUGX(r.collected)}</td>
        <td class="barcell"><div class="minibar"><div class="minifill" style="width:${w}%;background:${c}"></div></div></td>
        <td class="rate" style="color:${c}">${rate}%${overLabel}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Collection Trend · ${granLabel}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 28px; }
      .brand { font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: #2563eb; margin-bottom: 8px; }
      h1 { font-size: 24px; margin: 0 0 2px; }
      .sub { color: #6b7280; font-size: 13px; margin: 0 0 18px; }
      .cards { display: flex; gap: 12px; margin-bottom: 18px; }
      .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; }
      .card .lbl { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; }
      .card .val { font-size: 24px; font-weight: 800; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; border-bottom: 2px solid #e5e7eb; padding: 8px 10px; }
      th.num, th.rate { text-align: right; }
      td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; }
      td.lbl { font-weight: 700; white-space: nowrap; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
      td.num.strong { font-weight: 800; }
      td.rate { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
      td.barcell { width: 28%; }
      .minibar { height: 8px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
      .minifill { height: 100%; border-radius: 999px; }
      tr:nth-child(even) td { background: #fafafa; }
      .foot { margin-top: 20px; color: #9ca3af; font-size: 11px; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <div class="brand">Welile · Executive Report</div>
    <h1>Collection Trend — ${granLabel}</h1>
    <p class="sub">${periodLabel} · ${rangeLabel} · ${rows.length} interval${rows.length === 1 ? '' : 's'}</p>
    <div class="cards">
      <div class="card"><div class="lbl">Expected</div><div class="val" style="color:#7c3aed">${formatUGX(totalExpected)}</div></div>
      <div class="card"><div class="lbl">Collected</div><div class="val" style="color:#2563eb">${formatUGX(totalCollected)}</div></div>
      <div class="card"><div class="lbl">Collection rate</div><div class="val" style="color:${toneFor(overallRate)}">${overallRate}%</div></div>
    </div>
    <table>
      <thead><tr><th>${granLabel}</th><th class="num">Expected</th><th class="num">Collected</th><th>Flow</th><th class="rate">Rate</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:24px">No collection activity in this period.</td></tr>'}</tbody>
    </table>
    <p class="foot">Welile · Collection trend report · Generated ${generated}</p>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Resolve a period to [start, end) and the number of calendar days it spans. */
function resolvePeriod(key: PeriodKey): { start: Date; end: Date; days: number } {
  const now = new Date();
  const today = startOfDay(now);
  switch (key) {
    case 'today':
      return { start: today, end: now, days: 1 };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { start: y, end: today, days: 1 };
    }
    case 'last7': {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { start: s, end: now, days: 7 };
    }
    case 'last30': {
      const s = new Date(today); s.setDate(s.getDate() - 29);
      return { start: s, end: now, days: 30 };
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = Math.floor((today.getTime() - s.getTime()) / 86_400_000) + 1;
      return { start: s, end: now, days };
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = Math.round((e.getTime() - s.getTime()) / 86_400_000);
      return { start: s, end: e, days };
    }
    case 'all': {
      const s = startOfDay(ALL_TIME_START);
      const days = Math.max(1, Math.round((now.getTime() - s.getTime()) / 86_400_000));
      return { start: s, end: now, days };
    }
    default:
      return { start: today, end: now, days: 1 };
  }
}

/** Expected daily collection per agent (period-independent) from active rent requests. */
async function fetchExpectedDailyByAgent(): Promise<Record<string, number>> {
  const byAgent: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('rent_requests')
      .select('agent_id, daily_repayment')
      .in('status', ACTIVE_RENT_STATUSES)
      .not('agent_id', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error('[FleetPerformanceStats] expected page failed', error); break; }
    const rows = data || [];
    rows.forEach((r: any) => {
      if (!r.agent_id) return;
      byAgent[r.agent_id] = (byAgent[r.agent_id] || 0) + (Number(r.daily_repayment) || 0);
    });
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return byAgent;
}

/**
 * Collected per agent for a period.
 *
 * Source of truth: `agent_collections` (canonical daily-capacity source —
 * every tenant-payment RPC and edge fn, including `agent_allocate_tenant_payment`,
 * writes a row here). Reading directly from it gives us real-time,
 * agent-tagged totals without needing a rent_request join, and keeps
 * "Collected" perfectly aligned with the per-agent capacity page.
 */
async function fetchCollectedByAgent(start: Date, end: Date): Promise<Record<string, number>> {
  const byAgent: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('agent_collections')
      .select('agent_id, amount')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .gt('amount', 0)
      .range(from, from + PAGE - 1);
    if (error) { console.error('[FleetPerformanceStats] agent_collections page failed', error); break; }
    const rows = data || [];
    rows.forEach((r: any) => {
      if (!r.agent_id) return;
      byAgent[r.agent_id] = (byAgent[r.agent_id] || 0) + (Number(r.amount) || 0);
    });
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return byAgent;
}

async function fetchAgentNames(agentIds: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const BATCH = 100;
  for (let i = 0; i < agentIds.length; i += BATCH) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', agentIds.slice(i, i + BATCH));
    (data || []).forEach((p: any) => { names[p.id] = p.full_name || p.id.slice(0, 8); });
  }
  return names;
}

/** Local YYYY-MM-DD key for a date. */
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local hour bucket key, e.g. 2026-06-11T14. */
function hourKey(d: Date) {
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}`;
}

/** Local month bucket key, e.g. 2026-06. */
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function bucketKeyFor(d: Date, gran: TrendGranularity) {
  return gran === 'hour' ? hourKey(d) : gran === 'month' ? monthKey(d) : dayKey(d);
}

/** Collected total per time bucket (hour/day/month) across the whole fleet within [start, end). */
async function fetchCollectedBuckets(start: Date, end: Date, gran: TrendGranularity): Promise<Record<string, number>> {
  const byBucket: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('agent_collections')
      .select('amount, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .gt('amount', 0)
      .range(from, from + PAGE - 1);
    if (error) { console.error('[FleetPerformanceStats] bucket agent_collections page failed', error); break; }
    const rows = data || [];
    rows.forEach((r: any) => {
      if (!r.created_at) return;
      const k = bucketKeyFor(new Date(r.created_at), gran);
      byBucket[k] = (byBucket[k] || 0) + (Number(r.amount) || 0);
    });
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return byBucket;
}

export function FleetPerformanceStats({
  detailed = true,
  autoRefreshMs = 0,
}: { detailed?: boolean; autoRefreshMs?: number } = {}) {
  const { agentIds: qualifyingIds, isReady: qualifyingReady } = useQualifyingAgentIds();
  // Restore last-used range from localStorage.
  const restored = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { period?: PeriodKey; from?: string; to?: string };
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const [period, setPeriod] = useState<PeriodKey>(restored?.period || 'today');
  const [sort, setSort] = useState<{ key: 'expected' | 'collected' | 'rate'; dir: 'asc' | 'desc' }>({ key: 'collected', dir: 'desc' });
  const [search, setSearch] = useState('');
  const [customRange, setCustomRange] = useState<DateRange | undefined>(
    restored?.from
      ? { from: new Date(restored.from), to: restored.to ? new Date(restored.to) : undefined }
      : undefined,
  );
  const [rangeOpen, setRangeOpen] = useState(false);
  const isMobile = useIsMobile();
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // "Verify totals" reconciler: independently re-fetches agent_collections in the range
  // and compares row-count + fleet total + per-agent totals against the cached KPI.
  type VerifyResult = {
    at: number;
    rows: number;
    fleetSum: number;
    perAgent: Record<string, number>;
    kpiCollected: number;
    error?: string;
  };
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  // Alerts panel — flag agents whose collection rate falls below a threshold.
  const ALERT_STORAGE_KEY = 'fleet-perf-alerts';
  const restoredAlerts = useMemo(() => {
    try {
      const raw = localStorage.getItem(ALERT_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as { threshold?: number; minExpected?: number };
    } catch { return null; }
  }, []);
  const [alertThreshold, setAlertThreshold] = useState<number>(restoredAlerts?.threshold ?? 50);
  const [alertMinExpected, setAlertMinExpected] = useState<number>(restoredAlerts?.minExpected ?? 10_000);
  const [alertsOpen, setAlertsOpen] = useState<boolean>(true);
  const [alertConfigOpen, setAlertConfigOpen] = useState<boolean>(false);
  useEffect(() => {
    try {
      localStorage.setItem(
        ALERT_STORAGE_KEY,
        JSON.stringify({ threshold: alertThreshold, minExpected: alertMinExpected }),
      );
    } catch { /* ignore */ }
  }, [alertThreshold, alertMinExpected]);

  // Persist the selected range whenever it changes.
  useEffect(() => {
    try {
      const payload: { period: PeriodKey; from?: string; to?: string } = { period };
      if (period === 'custom' && customRange?.from) {
        payload.from = customRange.from.toISOString();
        if (customRange.to) payload.to = customRange.to.toISOString();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore storage failures */
    }
  }, [period, customRange]);

  const { start, end, days } = useMemo(() => {
    if (period === 'custom' && customRange?.from) {
      const s = startOfDay(customRange.from);
      const e = new Date(startOfDay(customRange.to || customRange.from));
      e.setDate(e.getDate() + 1); // make end exclusive of the day after the last selected day
      const d = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000));
      return { start: s, end: e, days: d };
    }
    return resolvePeriod(period);
  }, [period, customRange]);

  // Stable key fragment so custom-range queries refetch when the range changes.
  const rangeKey = period === 'custom' ? `custom:${start.toISOString()}:${end.toISOString()}` : period;

  const granularity = granularityFor(days);

  const queryClient = useQueryClient();
  const { data: expectedByAgent = {}, isLoading: expLoading, dataUpdatedAt: expUpdatedAt, isFetching: expFetching } = useQuery({
    queryKey: ['fleet-perf-expected-by-agent'],
    queryFn: fetchExpectedDailyByAgent,
    staleTime: 60_000,
    refetchInterval: autoRefreshMs || false,
    refetchIntervalInBackground: false,
  });

  const { data: collectedByAgent = {}, isLoading: colLoading, dataUpdatedAt: colUpdatedAt, isFetching: colFetching } = useQuery({
    queryKey: ['fleet-perf-collected-by-agent', rangeKey],
    queryFn: () => fetchCollectedByAgent(start, end),
    staleTime: 30_000,
    refetchInterval: autoRefreshMs || false,
    refetchIntervalInBackground: false,
  });

  const { data: collectedBuckets = {}, isFetching: bucketFetching } = useQuery({
    queryKey: ['fleet-perf-collected-buckets', rangeKey, granularity],
    queryFn: () => fetchCollectedBuckets(start, end, granularity),
    staleTime: 30_000,
    refetchInterval: autoRefreshMs || false,
    refetchIntervalInBackground: false,
  });

  const agentIds = useMemo(() => {
    const set = new Set<string>([...Object.keys(expectedByAgent), ...Object.keys(collectedByAgent)]);
    return Array.from(set).sort();
  }, [expectedByAgent, collectedByAgent]);

  const { data: names = {} } = useQuery({
    queryKey: ['fleet-perf-agent-names', agentIds],
    queryFn: () => fetchAgentNames(agentIds),
    enabled: agentIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const rawRows = useMemo(() => {
    return agentIds
      .map((id) => {
        const expected = (expectedByAgent[id] || 0) * days;
        const collected = collectedByAgent[id] || 0;
        const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
        return { id, name: names[id] || id.slice(0, 8), expected, collected, rate };
      })
      .filter((r) => r.expected > 0 || r.collected > 0)
      // Only qualifying agents (behaviour-based definition) — consistent
      // with every other agent list in the dashboard.
      .filter((r) => !qualifyingReady || qualifyingIds.has(r.id));
  }, [agentIds, expectedByAgent, collectedByAgent, names, days, qualifyingIds, qualifyingReady]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawRows;
    return rawRows.filter((r) =>
      r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
    );
  }, [rawRows, search]);

  const rows = useMemo(() => {
    const { key, dir } = sort;
    const sorted = [...filteredRows].sort((a, b) => {
      let cmp = 0;
      if (key === 'expected') cmp = a.expected - b.expected;
      else if (key === 'collected') cmp = a.collected - b.collected;
      else cmp = a.rate - b.rate;
      return dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredRows, sort]);

  const loading = expLoading || colLoading;
  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const rate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
  const rateTone = rate >= 100 ? 'text-emerald-600' : rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-destructive';
  const barTone = rate >= 100 ? 'bg-emerald-500' : rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-destructive';

  // Pagination for the agent-by-agent breakdown.
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

  // Alerts: agents with meaningful expected but rate below threshold, worst gap first.
  const alertRows = useMemo(() => {
    return rawRows
      .filter((r) => r.expected >= alertMinExpected && r.rate < alertThreshold)
      .map((r) => ({ ...r, gap: Math.max(0, r.expected - r.collected) }))
      .sort((a, b) => b.gap - a.gap);
  }, [rawRows, alertThreshold, alertMinExpected]);

  // Jump to a specific agent row in the breakdown table, expand it, and scroll it into view.
  const focusAgent = (id: string) => {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE));
    setExpandedId(id);
    requestAnimationFrame(() => {
      const el = document.getElementById(`fleet-row-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  // Independent recount: pages through agent_collections in the range and returns
  // per-agent totals + fleet sum + row count. Used by the "Verify totals" control
  // to reconcile the KPI against the raw table for the exact same window.
  const runVerifyTotals = async () => {
    setVerifying(true);
    const perAgent: Record<string, number> = {};
    let fleetSum = 0;
    let rowCount = 0;
    let errMsg: string | undefined;
    try {
      const PAGE = 1000;
      let fromIdx = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('agent_collections')
          .select('agent_id, amount')
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
          .gt('amount', 0)
          .range(fromIdx, fromIdx + PAGE - 1);
        if (error) { errMsg = error.message; break; }
        const chunk = data || [];
        for (const r of chunk as any[]) {
          const amt = Number(r.amount) || 0;
          fleetSum += amt;
          rowCount += 1;
          if (r.agent_id) perAgent[r.agent_id] = (perAgent[r.agent_id] || 0) + amt;
        }
        if (chunk.length < PAGE) break;
        fromIdx += PAGE;
      }
    } catch (e: any) {
      errMsg = e?.message || 'Verify failed';
    }
    setVerifyResult({
      at: Date.now(),
      rows: rowCount,
      fleetSum,
      perAgent,
      kpiCollected: totalCollected,
      error: errMsg,
    });
    setVerifying(false);
    setVerifyOpen(true);
  };

  // Per-agent deltas between the independent recount and the KPI's cached map.
  const verifyDeltas = useMemo(() => {
    if (!verifyResult) return [] as { id: string; name: string; kpi: number; live: number; delta: number }[];
    const ids = new Set<string>([
      ...Object.keys(verifyResult.perAgent),
      ...Object.keys(collectedByAgent),
    ]);
    const list: { id: string; name: string; kpi: number; live: number; delta: number }[] = [];
    ids.forEach((id) => {
      const kpi = collectedByAgent[id] || 0;
      const live = verifyResult.perAgent[id] || 0;
      const delta = live - kpi;
      if (Math.abs(delta) >= 1) {
        list.push({ id, name: names[id] || id.slice(0, 8), kpi, live, delta });
      }
    });
    return list.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [verifyResult, collectedByAgent, names]);

  // Reset to first page whenever the result set changes.
  useEffect(() => {
    setPage(0);
  }, [search, sort, rangeKey]);

  // Daily expected target across the whole fleet (constant per day).
  const expectedPerDay = useMemo(
    () => Object.values(expectedByAgent).reduce((s, v) => s + (Number(v) || 0), 0),
    [expectedByAgent],
  );

  // Trend series of collected vs expected, bucketed by hour / day / month.
  const trendData = useMemo(() => {
    const out: { label: string; collected: number; expected: number }[] = [];
    const endMs = end.getTime();
    if (granularity === 'hour') {
      const cursor = new Date(start);
      cursor.setMinutes(0, 0, 0);
      const expectedPerHour = expectedPerDay / 24;
      while (cursor.getTime() < endMs) {
        const k = hourKey(cursor);
        out.push({ label: format(cursor, 'h a'), collected: collectedBuckets[k] || 0, expected: expectedPerHour });
        cursor.setHours(cursor.getHours() + 1);
      }
    } else if (granularity === 'month') {
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cursor.getTime() < endMs) {
        const k = monthKey(cursor);
        const bucketStart = Math.max(cursor.getTime(), start.getTime());
        const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const bucketEnd = Math.min(nextMonth.getTime(), endMs);
        const dCount = Math.max(1, Math.round((bucketEnd - bucketStart) / 86_400_000));
        out.push({ label: format(cursor, 'MMM yy'), collected: collectedBuckets[k] || 0, expected: expectedPerDay * dCount });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      const cursor = startOfDay(start);
      while (cursor.getTime() < endMs) {
        const k = dayKey(cursor);
        out.push({ label: format(cursor, 'MMM d'), collected: collectedBuckets[k] || 0, expected: expectedPerDay });
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return out;
  }, [start, end, granularity, collectedBuckets, expectedPerDay]);

  const trendTitle =
    granularity === 'hour' ? 'Collection trend · hourly flow vs target'
      : granularity === 'month' ? 'Collection trend · monthly flow vs target'
      : 'Collection trend · daily flow vs target';

  const granLabel = granularity === 'hour' ? 'Hour' : granularity === 'month' ? 'Month' : 'Day';
  const trendRangeLabel = (() => {
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const lastDay = new Date(end.getTime() - 1);
    return days <= 1 ? fmt(start) : `${fmt(start)} – ${fmt(lastDay)}`;
  })();
  const exportTrendPdf = () =>
    shareTrendAsPdf({
      periodLabel: period === 'custom' ? 'Custom range' : PERIODS.find((p) => p.key === period)?.label || '',
      granLabel,
      rangeLabel: trendRangeLabel,
      rows: trendData,
    });

  return (
    <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex flex-col gap-2 mb-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Fleet performance · Expected vs Collected
            </p>
            <LastUpdatedChip
              updatedAt={Math.min(
                expUpdatedAt || Date.now(),
                colUpdatedAt || Date.now(),
              )}
              isFetching={expFetching || colFetching || bucketFetching}
              onRefresh={() => {
                queryClient.invalidateQueries({ queryKey: ['fleet-perf-expected-by-agent'] });
                queryClient.invalidateQueries({ queryKey: ['fleet-perf-collected-by-agent'] });
                queryClient.invalidateQueries({ queryKey: ['fleet-perf-collected-buckets'] });
              }}
              className="mt-1"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              shareAsPdf({
                periodLabel:
                  period === 'custom'
                    ? 'Custom range'
                    : PERIODS.find((p) => p.key === period)?.label || '',
                days,
                start,
                end,
                totalExpected,
                totalCollected,
                rate,
                rows,
              })
            }
            disabled={loading || rows.length === 0}
            className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0 sm:hidden"
          >
            <Share2 className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
        {/* Period selector: horizontally scrollable strip on small screens, wraps on desktop */}
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <button
            type="button"
            onClick={() =>
              shareAsPdf({
                periodLabel:
                  period === 'custom'
                    ? 'Custom range'
                    : PERIODS.find((p) => p.key === period)?.label || '',
                days,
                start,
                end,
                totalExpected,
                totalCollected,
                rate,
                rows,
              })
            }
            disabled={loading || rows.length === 0}
            className="hidden h-7 px-2.5 rounded-lg text-[11px] font-semibold sm:inline-flex items-center gap-1 bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share PDF
          </button>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                period === p.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {p.label}
            </button>
          ))}
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                  period === 'custom'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                {period === 'custom' && customRange?.from
                  ? `${format(customRange.from, 'MMM d')}${customRange.to ? ` – ${format(customRange.to, 'MMM d')}` : ''}`
                  : 'Custom range'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="end">
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={(r) => {
                  setCustomRange(r);
                  if (r?.from) setPeriod('custom');
                  if (r?.from && r?.to) setRangeOpen(false);
                }}
                numberOfMonths={isMobile ? 1 : 2}
                disabled={{ after: new Date() }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={<Target className="h-3.5 w-3.5" />} label="Expected" value={formatUGX(totalExpected)} tone="text-violet-600" />
            <Stat
              icon={<Banknote className="h-3.5 w-3.5" />}
              label="Collected"
              value={formatUGX(totalCollected)}
              tone="text-primary"
              info="Sourced from agent_collections — every tenant payment and landlord-float allocation writes a row here, so this total matches the per-agent capacity page."
              formula={{
                equation: 'Collected = agent_collections',
                components: [
                  { label: 'Tenant payments', description: 'Rent collected from funded tenants (cash, MoMo, bank, etc.)' },
                  { label: 'Landlord-float allocations', description: 'CFO-approved landlord float moved to an agent for disbursement' },
                ],
                footnote: 'Both record an agent_collections row with amount > 0 and tag the responsible agent.',
              }}
            />
            <Stat icon={<Percent className="h-3.5 w-3.5" />} label="Collection rate" value={`${rate}%`} tone={rateTone} />
          </div>
          <div className="mt-2.5 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${barTone} transition-all`} style={{ width: `${Math.min(rate, 100)}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground tabular-nums">
            {formatUGX(totalCollected)} collected of {formatUGX(totalExpected)} expected ({days} day{days === 1 ? '' : 's'} · {rows.length} agent{rows.length === 1 ? '' : 's'})
          </p>

          {/* Verify totals — independent recount of agent_collections for the exact range */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Popover open={verifyOpen} onOpenChange={setVerifyOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); runVerifyTotals(); }}
                  disabled={verifying || loading}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                  title="Independently recount agent_collections for this range and compare with the Collected KPI."
                >
                  {verifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  {verifying ? 'Verifying…' : 'Verify totals'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[320px] p-3 text-[11px]">
                {!verifyResult ? (
                  <p className="text-muted-foreground">Running independent recount…</p>
                ) : verifyResult.error ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-destructive inline-flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Verify failed
                    </p>
                    <p className="text-muted-foreground break-words">{verifyResult.error}</p>
                  </div>
                ) : (
                  (() => {
                    const delta = verifyResult.fleetSum - verifyResult.kpiCollected;
                    const reconciled = Math.abs(delta) < 1;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold uppercase tracking-wide text-muted-foreground">
                            Reconciliation
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                              reconciled
                                ? 'bg-emerald-500/15 text-emerald-600'
                                : 'bg-amber-500/15 text-amber-600'
                            }`}
                          >
                            {reconciled ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                            {reconciled ? 'Reconciled' : 'Drift'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="rounded-md border border-border p-1.5">
                            <p className="text-[10px] text-muted-foreground">KPI Collected</p>
                            <p className="font-semibold tabular-nums">{formatUGX(verifyResult.kpiCollected)}</p>
                          </div>
                          <div className="rounded-md border border-border p-1.5">
                            <p className="text-[10px] text-muted-foreground">Live recount</p>
                            <p className="font-semibold tabular-nums">{formatUGX(verifyResult.fleetSum)}</p>
                          </div>
                          <div className="rounded-md border border-border p-1.5">
                            <p className="text-[10px] text-muted-foreground">Delta</p>
                            <p className={`font-semibold tabular-nums ${reconciled ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {delta > 0 ? '+' : ''}{formatUGX(delta)}
                            </p>
                          </div>
                          <div className="rounded-md border border-border p-1.5">
                            <p className="text-[10px] text-muted-foreground">Rows scanned</p>
                            <p className="font-semibold tabular-nums">{verifyResult.rows.toLocaleString()}</p>
                          </div>
                        </div>
                        {verifyDeltas.length > 0 && (
                          <div className="mt-1 space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Per-agent drift ({verifyDeltas.length})
                            </p>
                            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                              <table className="w-full text-[10px]">
                                <thead className="bg-muted/50 text-muted-foreground">
                                  <tr>
                                    <th className="text-left px-1.5 py-1 font-semibold">Agent</th>
                                    <th className="text-right px-1.5 py-1 font-semibold">Δ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {verifyDeltas.slice(0, 20).map((d) => (
                                    <tr
                                      key={d.id}
                                      className="border-t border-border cursor-pointer hover:bg-muted/40"
                                      onClick={() => { setVerifyOpen(false); focusAgent(d.id); }}
                                    >
                                      <td className="px-1.5 py-1 truncate max-w-[160px]">{d.name}</td>
                                      <td className={`px-1.5 py-1 text-right tabular-nums font-semibold ${d.delta > 0 ? 'text-amber-600' : 'text-destructive'}`}>
                                        {d.delta > 0 ? '+' : ''}{formatUGX(d.delta)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <p className="text-[10px] text-muted-foreground">Click a row to jump to that agent.</p>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          Range {format(start, 'MMM d, HH:mm')} → {format(end, 'MMM d, HH:mm')}. Recounted {format(new Date(verifyResult.at), 'HH:mm:ss')}.
                        </p>
                      </div>
                    );
                  })()
                )}
              </PopoverContent>
            </Popover>
            {verifyResult && !verifyResult.error && (
              <span
                className={`text-[10px] font-semibold inline-flex items-center gap-1 ${
                  Math.abs(verifyResult.fleetSum - verifyResult.kpiCollected) < 1
                    ? 'text-emerald-600'
                    : 'text-amber-600'
                }`}
              >
                {Math.abs(verifyResult.fleetSum - verifyResult.kpiCollected) < 1 ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" /> Reconciled · {verifyResult.rows.toLocaleString()} rows
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3" /> Drift {formatUGX(verifyResult.fleetSum - verifyResult.kpiCollected)}
                  </>
                )}
              </span>
            )}
          </div>

          {/* Collection trend: collected per day vs expected daily target — shown in both summary & detailed modes */}
          {trendData.length > 1 && (
            <div className="mt-3 rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {trendTitle}
                </p>
                <button
                  type="button"
                  onClick={exportTrendPdf}
                  className="h-6 px-2 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 bg-muted text-foreground hover:bg-muted/70 transition-colors"
                >
                  <Share2 className="h-3 w-3" />
                  Trend PDF
                </button>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      interval="preserveStartEnd"
                      minTickGap={16}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                    />
                    <Tooltip
                      formatter={(v: number, n: string) => [formatUGX(Number(v)), n === 'collected' ? 'Collected' : 'Expected']}
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 11,
                        color: 'hsl(var(--popover-foreground))',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="collected" name="Collected" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={26} />
                    <Line
                      type="monotone"
                      dataKey="expected"
                      name="Expected"
                      stroke="hsl(var(--destructive))"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {detailed && (
          <>
          {/* Alerts panel — flags agents whose expected vs collected gap breaches the threshold */}
          <div className="mt-3 rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setAlertsOpen((v) => !v)}
              aria-expanded={alertsOpen}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors ${
                alertRows.length > 0
                  ? 'bg-destructive/10 hover:bg-destructive/15'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/15'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 ${
                    alertRows.length > 0 ? 'text-destructive' : 'text-emerald-600'
                  }`}
                />
                <div className="min-w-0">
                  <p className={`text-[11px] font-bold uppercase tracking-wide ${
                    alertRows.length > 0 ? 'text-destructive' : 'text-emerald-700'
                  }`}>
                    Collection alerts
                    <span className="ml-1 tabular-nums">
                      · {alertRows.length}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    Rate &lt; {alertThreshold}% · Expected ≥ {formatUGX(alertMinExpected)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setAlertConfigOpen((v) => !v); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setAlertConfigOpen((v) => !v);
                    }
                  }}
                  className="h-6 px-1.5 rounded-md inline-flex items-center gap-1 text-[10px] font-semibold bg-background/70 text-foreground hover:bg-background transition-colors"
                  aria-label="Configure alert threshold"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  Threshold
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${alertsOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {alertsOpen && alertConfigOpen && (
              <div className="grid grid-cols-2 gap-2 px-2.5 py-2 border-t border-border bg-muted/40">
                <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Rate below (%)
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
                    className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-normal text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Min expected (UGX)
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={alertMinExpected}
                    onChange={(e) => setAlertMinExpected(Math.max(0, Number(e.target.value) || 0))}
                    className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-normal text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
              </div>
            )}
            {alertsOpen && (
              <div className="divide-y divide-border border-t border-border">
                {alertRows.length === 0 ? (
                  <p className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
                    No agents breach the threshold in this period. 🎉
                  </p>
                ) : (
                  alertRows.slice(0, 25).map((r) => {
                    const tone = r.rate >= 50 ? 'text-amber-600' : 'text-destructive';
                    const barTone = r.rate >= 50 ? 'bg-amber-500' : 'bg-destructive';
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 px-2.5 py-2 hover:bg-muted/40 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-foreground truncate">{r.name}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full ${barTone}`} style={{ width: `${Math.min(r.rate, 100)}%` }} />
                            </div>
                            <span className={`text-[10px] tabular-nums font-bold ${tone}`}>{r.rate}%</span>
                            <span className="text-[10px] tabular-nums text-muted-foreground truncate">
                              gap {formatUGX(r.gap)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => focusAgent(r.id)}
                          className="h-7 px-2 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 bg-foreground text-background hover:opacity-90 transition-opacity shrink-0"
                        >
                          <Eye className="h-3 w-3" />
                          <span className="hidden sm:inline">View contributing transactions</span>
                          <span className="sm:hidden">View</span>
                        </button>
                      </div>
                    );
                  })
                )}
                {alertRows.length > 25 && (
                  <p className="px-2.5 py-1.5 text-center text-[10px] text-muted-foreground bg-muted/40">
                    Showing top 25 of {alertRows.length} alerts — narrow the range or raise the threshold to see fewer.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Search — placed prominently above the agent breakdown */}
          <div className="mt-3 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agent name or ID…"
              className="w-full h-8 pl-8 pr-8 rounded-lg border border-border bg-background text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Agent-by-agent breakdown — mobile-friendly, paginated, expandable rows */}
          <div className="mt-3 rounded-lg border border-border overflow-hidden">
            {/* Sticky header */}
            <div className="sticky top-0 z-10 grid grid-cols-[1.5rem_minmax(0,1fr)_auto_1rem] sm:grid-cols-[2rem_minmax(0,1fr)_auto_auto_auto_1rem] gap-2 px-2.5 py-1.5 bg-muted text-[10px] font-bold uppercase tracking-wide text-muted-foreground items-center border-b border-border">
              <span className="text-center">#</span>
              <span>Agent</span>
              <span className="hidden sm:block">
                <SortHeader label="Expected" sortKey="expected" sort={sort} onChange={setSort} align="right" />
              </span>
              <span className="hidden sm:block">
                <SortHeader label="Collected" sortKey="collected" sort={sort} onChange={setSort} align="right" />
              </span>
              <SortHeader label="Rate" sortKey="rate" sort={sort} onChange={setSort} align="right" />
              <span aria-hidden />
            </div>
            <div className="divide-y divide-border">
              {rows.length === 0 ? (
                <div className="px-2.5 py-4 text-center text-[11px] text-muted-foreground">
                  No agent activity in this period.
                </div>
              ) : (
                pageRows.map((r, idx) => {
                  const rank = pageStart + idx + 1;
                  const tone = r.rate >= 100 ? 'text-emerald-600' : r.rate >= 80 ? 'text-emerald-600' : r.rate >= 50 ? 'text-amber-600' : 'text-destructive';
                  const barTone = r.rate >= 100 ? 'bg-emerald-500' : r.rate >= 80 ? 'bg-emerald-500' : r.rate >= 50 ? 'bg-amber-500' : 'bg-destructive';
                  const overLabel = r.rate > 100 ? ` ↑${r.rate - 100}%` : '';
                  const expanded = expandedId === r.id;
                  return (
                    <div key={r.id} id={`fleet-row-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                        aria-expanded={expanded}
                        className="w-full grid grid-cols-[1.5rem_minmax(0,1fr)_auto_1rem] sm:grid-cols-[2rem_minmax(0,1fr)_auto_auto_auto_1rem] gap-2 px-2.5 py-2 text-[11px] items-center text-left hover:bg-muted/40 transition-colors"
                      >
                        <span className="text-center tabular-nums font-bold text-muted-foreground">{rank}</span>
                        <span className="font-semibold text-foreground truncate">{r.name}</span>
                        <span className="hidden sm:block text-right tabular-nums text-violet-600">{formatUGX(r.expected)}</span>
                        <span className="hidden sm:block text-right tabular-nums text-primary font-semibold">{formatUGX(r.collected)}</span>
                        <div className="flex flex-col items-end gap-0.5 min-w-[3.5rem]">
                          <div className="h-1 w-10 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full ${barTone} ${r.rate > 100 ? 'brightness-110' : ''}`} style={{ width: `${Math.min(r.rate, 100)}%` }} />
                          </div>
                          <span className={`text-right tabular-nums font-bold ${tone}`}>{r.rate}%{overLabel}</span>
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      {expanded && (
                        <div className="px-2.5 pb-2.5 pt-0.5 bg-muted/30">
                          <div className="grid grid-cols-2 gap-2 text-[11px] sm:hidden">
                            <div className="rounded-md border border-border bg-card p-2">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-violet-600">Expected</p>
                              <p className="mt-0.5 tabular-nums font-bold text-foreground">{formatUGX(r.expected)}</p>
                            </div>
                            <div className="rounded-md border border-border bg-card p-2">
                              <p className="text-[9px] font-bold uppercase tracking-wide text-primary">Collected</p>
                              <p className="mt-0.5 tabular-nums font-bold text-foreground">{formatUGX(r.collected)}</p>
                            </div>
                          </div>
                          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div className={`h-full ${barTone} ${r.rate > 100 ? 'brightness-110' : ''}`} style={{ width: `${Math.min(r.rate, 100)}%` }} />
                          </div>
                          <p className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                            <span>{r.rate >= 100 ? `Over target by ${r.rate - 100}%` : `${100 - r.rate}% short of target`}</span>
                            <span className="font-mono text-[9px] opacity-70">{r.id.slice(0, 8)}</span>
                          </p>
                          <AgentCollectionsBreakdown
                            agentId={r.id}
                            agentName={r.name}
                            start={start}
                            end={end}
                            expectedCollected={r.collected}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {/* Pagination footer */}
            {rows.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-t border-border bg-muted/40">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, rows.length)} of {rows.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    className="h-6 px-1.5 rounded-md inline-flex items-center gap-0.5 text-[10px] font-semibold bg-muted text-foreground hover:bg-muted/70 transition-colors disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3 w-3" /> Prev
                  </button>
                  <span className="text-[10px] text-muted-foreground tabular-nums px-1">
                    {safePage + 1}/{totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                    className="h-6 px-1.5 rounded-md inline-flex items-center gap-0.5 text-[10px] font-semibold bg-muted text-foreground hover:bg-muted/70 transition-colors disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
  info,
  formula,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
  info?: string;
  formula?: {
    equation: string;
    components: { label: string; description: string }[];
    footnote?: string;
  };
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
        {icon}
        <span className="truncate">{label}</span>
        {info && !formula && (
          <UiTooltipProvider delayDuration={100}>
            <UiTooltip>
              <UiTooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${label} data source`}
                  className="ml-0.5 inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <Info className="h-3 w-3" />
                </button>
              </UiTooltipTrigger>
              <UiTooltipContent side="top" className="max-w-[16rem] text-[11px] leading-snug">
                {info}
              </UiTooltipContent>
            </UiTooltip>
          </UiTooltipProvider>
        )}
        {formula && (
          <UiTooltipProvider delayDuration={100}>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`${label} formula`}
                  className="ml-0.5 inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <Info className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-72 p-3 text-xs">
                <p className="font-mono font-semibold text-foreground">{formula.equation}</p>
                <div className="mt-2 space-y-2">
                  {formula.components.map((c, i) => (
                    <div key={i} className="rounded-md bg-muted/60 p-2">
                      <p className="font-semibold text-foreground">{c.label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{c.description}</p>
                    </div>
                  ))}
                </div>
                {formula.footnote && (
                  <p className="mt-2 text-[10px] text-muted-foreground leading-snug border-t border-border pt-2">
                    {formula.footnote}
                  </p>
                )}
              </PopoverContent>
            </Popover>
          </UiTooltipProvider>
        )}
      </div>
      <div className="mt-0.5 text-sm font-extrabold tabular-nums text-foreground truncate">{value}</div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onChange,
  align = 'left',
}: {
  label: string;
  sortKey: 'expected' | 'collected' | 'rate';
  sort: { key: 'expected' | 'collected' | 'rate'; dir: 'asc' | 'desc' };
  onChange: (s: { key: 'expected' | 'collected' | 'rate'; dir: 'asc' | 'desc' }) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => {
        if (active) {
          onChange({ key: sortKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
        } else {
          onChange({ key: sortKey, dir: 'desc' });
        }
      }}
      className={`flex items-center gap-1 select-none ${align === 'right' ? 'justify-end' : 'justify-start'} text-muted-foreground hover:text-foreground transition-colors`}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3 opacity-70" />
    </button>
  );
}

export default FleetPerformanceStats;

type CollectionRecord = {
  id: string;
  tenant_id: string | null;
  amount: number;
  created_at: string;
  payment_method: string | null;
};

async function fetchAgentCollectionRecords(agentId: string, start: Date, end: Date) {
  const all: CollectionRecord[] = [];
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('agent_collections')
      .select('id, tenant_id, amount, created_at, payment_method')
      .eq('agent_id', agentId)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .gt('amount', 0)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error('[AgentCollectionsBreakdown] page failed', error); break; }
    const rows = (data || []) as CollectionRecord[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  const tenantIds = Array.from(new Set(all.map((r) => r.tenant_id).filter(Boolean))) as string[];
  const nameById = new Map<string, string>();
  const BATCH = 100;
  for (let i = 0; i < tenantIds.length; i += BATCH) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', tenantIds.slice(i, i + BATCH));
    (data || []).forEach((p: any) => {
      nameById.set(p.id, p.full_name || p.phone || 'Tenant');
    });
  }
  return { rows: all, nameById };
}

function csvEscape(v: string | number) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function AgentCollectionsBreakdown({
  agentId,
  agentName,
  start,
  end,
  expectedCollected,
}: {
  agentId: string;
  agentName: string;
  start: Date;
  end: Date;
  /** The "Collected" figure shown for this agent in the parent row — used for reconciliation. */
  expectedCollected: number;
}) {
  const rangeKey = `${start.toISOString()}:${end.toISOString()}`;
  const { data, isLoading } = useQuery({
    queryKey: ['fleet-perf-agent-records', agentId, rangeKey],
    queryFn: () => fetchAgentCollectionRecords(agentId, start, end),
    staleTime: 30_000,
  });

  const rows = data?.rows || [];
  const nameById = data?.nameById || new Map<string, string>();

  // Filters: free-text search (tenant name / id / record id) + payment method +
  // minimum amount. Applied client-side against the already-loaded record set.
  const [query, setQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  type SortKey = 'when' | 'tenant' | 'method' | 'amount';
  const SORT_KEYS: readonly SortKey[] = ['when', 'tenant', 'method', 'amount'];
  const sortStorageKey = `fleet-perf-sort:${agentId}`;
  const initialSort = useMemo(() => parsePersistedSort<SortKey>(
    readStorage(sortStorageKey),
    SORT_KEYS,
    'when',
    'desc',
  ), [sortStorageKey]);
  const [sortKey, setSortKey] = useState<SortKey>(initialSort.key);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSort.dir);

  // Persist sort choice whenever it changes.
  useEffect(() => {
    writeStorage(sortStorageKey, `${sortKey}:${sortDir}`);
  }, [sortStorageKey, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'amount' || k === 'when' ? 'desc' : 'asc'); }
  };

  const methodOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.payment_method) set.add(r.payment_method); });
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minAmount) || 0;
    return rows.filter((r) => {
      if (methodFilter !== 'all' && (r.payment_method || '') !== methodFilter) return false;
      if (min > 0 && (Number(r.amount) || 0) < min) return false;
      if (q) {
        const tenant = ((r.tenant_id && nameById.get(r.tenant_id)) || '').toLowerCase();
        const hay = `${tenant} ${r.tenant_id || ''} ${r.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, nameById, query, methodFilter, minAmount]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      if (sortKey === 'when') { av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime(); }
      else if (sortKey === 'amount') { av = Number(a.amount) || 0; bv = Number(b.amount) || 0; }
      else if (sortKey === 'method') { av = (a.payment_method || '').toLowerCase(); bv = (b.payment_method || '').toLowerCase(); }
      else if (sortKey === 'tenant') {
        av = ((a.tenant_id && nameById.get(a.tenant_id)) || '').toLowerCase();
        bv = ((b.tenant_id && nameById.get(b.tenant_id)) || '').toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filteredRows, sortKey, sortDir, nameById]);

  const total = filteredRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const rawTotal = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const reconDelta = rawTotal - (Number(expectedCollected) || 0);
  const reconOk = Math.abs(reconDelta) < 1;

  // Per-method subtotals across the currently filtered rows.
  const methodSubtotals = useMemo(() => {
    const m = new Map<string, { count: number; sum: number }>();
    filteredRows.forEach((r) => {
      const key = r.payment_method || 'unspecified';
      const cur = m.get(key) || { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += Number(r.amount) || 0;
      m.set(key, cur);
    });
    return Array.from(m.entries())
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.sum - a.sum);
  }, [filteredRows]);
  const filtersActive = query.trim() !== '' || methodFilter !== 'all' || (Number(minAmount) || 0) > 0;
  const clearFilters = () => { setQuery(''); setMethodFilter('all'); setMinAmount(''); };

  // Read-only detail drawer for a single agent_collections row.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId],
  );
  const selectedTenant = selected?.tenant_id ? nameById.get(selected.tenant_id) || null : null;

  const downloadCsv = () => {
    const s = start.toISOString().slice(0, 10);
    const e = new Date(end.getTime() - 1).toISOString().slice(0, 10);
    const min = Number(minAmount) || 0;
    // Metadata preamble so the downloaded CSV self-documents the view it came from.
    const meta: (string | number)[][] = [
      ['Welile — Agent collections export'],
      ['Agent', agentName],
      ['Agent ID', agentId],
      ['Date range (Africa/Kampala)', `${s} to ${e}`],
      ['Search (tenant name/ID)', query.trim() || '(none)'],
      ['Payment method filter', methodFilter === 'all' ? 'All methods' : methodFilter.replace(/_/g, ' ')],
      ['Minimum amount (UGX)', min > 0 ? min : '(none)'],
      ['Rows exported', filteredRows.length],
      ['Total (UGX)', total],
      ['Generated at', new Date().toISOString()],
      [],
    ];
    const header = ['Date (Africa/Kampala)', 'Tenant', 'Tenant ID', 'Amount UGX', 'Payment method', 'Record ID'];
    const body = filteredRows.map((r) => [
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Kampala',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(r.created_at)),
      (r.tenant_id && nameById.get(r.tenant_id)) || '',
      r.tenant_id || '',
      Number(r.amount) || 0,
      (r.payment_method || '').replace(/_/g, ' '),
      r.id,
    ]);
    const csv = [...meta, header, ...body]
      .map((r) => r.map(csvEscape).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = filtersActive ? '_filtered' : '';
    a.download = `collections_${agentName.replace(/\s+/g, '_')}_${s}_to_${e}${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          <Receipt className="h-3 w-3" /> Underlying records ·{' '}
          {filtersActive ? `${filteredRows.length} of ${rows.length}` : rows.length} ·{' '}
          {formatUGX(total)}
        </p>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={isLoading || filteredRows.length === 0}
          className="h-6 px-2 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 bg-muted text-foreground hover:bg-muted/70 transition-colors disabled:opacity-40"
          title={
            filtersActive
              ? 'Download CSV of the currently filtered rows (filters + search recorded in the file)'
              : 'Download CSV of all rows in the selected date range'
          }
        >
          <Download className="h-3 w-3" />
          {filtersActive ? 'CSV (filtered)' : 'CSV'}
        </button>
      </div>
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 border-b border-border bg-muted/30">
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tenant name or ID…"
              className="w-full h-6 pl-6 pr-2 rounded-md border border-border bg-background text-[11px] outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="h-6 rounded-md border border-border bg-background text-[11px] px-1.5"
            aria-label="Filter by payment method"
          >
            <option value="all">All methods</option>
            {methodOptions.map((m) => (
              <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            placeholder="Min UGX"
            className="h-6 w-[6.5rem] rounded-md border border-border bg-background text-[11px] px-1.5 tabular-nums"
          />
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-6 px-1.5 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
          No collection records for this range.
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
          No records match the current filters.
        </p>
      ) : (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                {([
                  { k: 'when' as const, label: 'When', align: 'left', cls: '' },
                  { k: 'tenant' as const, label: 'Tenant', align: 'left', cls: '' },
                  { k: 'method' as const, label: 'Method', align: 'left', cls: 'hidden sm:table-cell' },
                  { k: 'amount' as const, label: 'Amount', align: 'right', cls: '' },
                ]).map((h) => {
                  const active = sortKey === h.k;
                  const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '↕';
                  return (
                    <th
                      key={h.k}
                      className={`${h.align === 'right' ? 'text-right' : 'text-left'} font-bold uppercase tracking-wide px-2 py-1.5 text-[9px] ${h.cls}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(h.k)}
                        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? 'text-foreground' : ''}`}
                        title={`Sort by ${h.label}`}
                      >
                        {h.label}
                        <span className={`text-[8px] ${active ? 'opacity-100' : 'opacity-40'}`}>{arrow}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedRows.map((r) => {
                const when = new Intl.DateTimeFormat('en-GB', {
                  timeZone: 'Africa/Kampala',
                  month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
                }).format(new Date(r.created_at));
                const tenant = (r.tenant_id && nameById.get(r.tenant_id)) || 'Unknown tenant';
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="cursor-pointer hover:bg-primary/5 focus:bg-primary/10 outline-none"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.id); }
                    }}
                    title="View record details"
                  >
                    <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{when}</td>
                    <td className="px-2 py-1.5 truncate max-w-[10rem]">{tenant}</td>
                    <td className="px-2 py-1.5 text-muted-foreground hidden sm:table-cell">
                      {(r.payment_method || '—').replace(/_/g, ' ')}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-primary">
                      {formatUGX(Number(r.amount) || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur border-t border-border">
              {methodSubtotals.length > 1 && methodSubtotals.map((s) => (
                <tr key={`sub-${s.method}`} className="text-muted-foreground">
                  <td className="px-2 py-1 text-[9px] uppercase tracking-wide" colSpan={2}>
                    Subtotal · {s.method.replace(/_/g, ' ')}
                  </td>
                  <td className="px-2 py-1 text-[10px] tabular-nums hidden sm:table-cell">{s.count}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">{formatUGX(s.sum)}</td>
                </tr>
              ))}
              <tr className="text-foreground">
                <td className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide" colSpan={2}>
                  {filtersActive ? 'Filtered total' : 'Total'} · {filteredRows.length} row{filteredRows.length === 1 ? '' : 's'}
                </td>
                <td className="px-2 py-1.5 hidden sm:table-cell" />
                <td className="px-2 py-1.5 text-right tabular-nums font-bold text-primary">{formatUGX(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {!isLoading && rows.length > 0 && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 border-t text-[10px] ${
            reconOk
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
          }`}
          title="Compares the sum of all underlying agent_collections rows in this date range to the 'Collected' figure shown for the agent."
        >
          <span className="font-semibold uppercase tracking-wide">
            {reconOk ? 'Reconciled' : 'Drift'} vs Collected
          </span>
          <span className="tabular-nums">
            Σ records {formatUGX(rawTotal)} · Collected {formatUGX(Number(expectedCollected) || 0)}
            {!reconOk && (
              <>
                {' '}· Δ {reconDelta > 0 ? '+' : ''}{formatUGX(reconDelta)}
              </>
            )}
          </span>
        </div>
      )}
      <Sheet open={!!selected} onOpenChange={(v) => { if (!v) setSelectedId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">Collection record</SheetTitle>
                <SheetDescription className="text-[11px]">
                  Read-only view of the underlying <code>agent_collections</code> row.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                <DetailStat label="Amount" value={formatUGX(Number(selected.amount) || 0)} accent />
                <DetailStat
                  label="Payment method"
                  value={(selected.payment_method || '—').replace(/_/g, ' ')}
                />
                <DetailStat
                  label="Collected at (Africa/Kampala)"
                  value={new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Africa/Kampala', dateStyle: 'medium', timeStyle: 'short',
                  }).format(new Date(selected.created_at))}
                />
                <DetailStat
                  label="Collected at (UTC)"
                  value={new Date(selected.created_at).toISOString()}
                  mono
                />
                <DetailStat label="Tenant" value={selectedTenant || 'Unknown tenant'} />
                <DetailStat label="Tenant ID" value={selected.tenant_id || '—'} mono />
                <DetailStat label="Agent" value={agentName} />
                <DetailStat label="Agent ID" value={agentId} mono />
                <DetailStat label="Record ID" value={selected.id} mono />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailStat({
  label,
  value,
  mono = false,
  accent = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 break-all text-[12px] ${accent ? 'font-bold text-primary' : 'text-foreground'} ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value}
      </p>
    </div>
  );
}
