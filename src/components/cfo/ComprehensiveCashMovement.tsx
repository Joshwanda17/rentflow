import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, subDays, subMonths, subYears, addDays, addWeeks, addMonths, differenceInCalendarDays } from 'date-fns';
import { Loader2, RefreshCw, Calendar, FileSpreadsheet, FileText, ArrowUpRight, ArrowDownRight, ArrowDownLeft, ExternalLink, X, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Info, Users, ArrowLeftRight, Check, AlertTriangle, TrendingUp, MinusCircle, Share2, Image as ImageIcon, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatDynamic as formatUGX } from '@/lib/currencyFormat';
import { CATEGORY_DESCRIPTIONS } from '@/lib/ledgerConstants';
import { downloadCsv } from '@/lib/csvExport';
import { useAuth } from '@/hooks/useAuth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Lock } from 'lucide-react';

// Roles allowed to drill into individual ledger entries and export raw movement data
const LEDGER_DETAIL_ROLES = new Set(['cfo', 'ceo', 'coo', 'super_admin', 'cto', 'manager']);

// ─────────────────────────────────────────────────────────────
// Periods & granularity
// ─────────────────────────────────────────────────────────────

type PeriodKey =
  | '24h' | 'today' | '7d' | '14d' | '30d' | '90d' | '120d' | '180d'
  | '1y' | 'ytd' | 'all';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: '24h',    label: 'Last 24h' },
  { value: 'today',  label: 'Today' },
  { value: '7d',     label: '7 Days' },
  { value: '14d',    label: '14 Days' },
  { value: '30d',    label: '30 Days' },
  { value: '90d',    label: '3 Months' },
  { value: '120d',   label: '4 Months' },
  { value: '180d',   label: '6 Months' },
  { value: '1y',     label: '1 Year' },
  { value: 'ytd',    label: 'YTD' },
  { value: 'all',    label: 'All Time' },
];

type Granularity = 'daily' | 'weekly' | 'monthly';
const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function periodRange(p: PeriodKey): { from: Date | null; to: Date } {
  const now = new Date();
  switch (p) {
    case '24h':   return { from: subDays(now, 1), to: now };
    case 'today': return { from: startOfDay(now), to: now };
    case '7d':    return { from: subDays(now, 7), to: now };
    case '14d':   return { from: subDays(now, 14), to: now };
    case '30d':   return { from: subDays(now, 30), to: now };
    case '90d':   return { from: subMonths(now, 3), to: now };
    case '120d':  return { from: subMonths(now, 4), to: now };
    case '180d':  return { from: subMonths(now, 6), to: now };
    case '1y':    return { from: subYears(now, 1), to: now };
    case 'ytd':   return { from: startOfYear(now), to: now };
    case 'all':   return { from: null, to: now };
  }
}

function bucketKey(d: Date, g: Granularity): string {
  if (g === 'daily')   return format(startOfDay(d), 'yyyy-MM-dd');
  if (g === 'weekly')  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-'W'II");
  return format(startOfMonth(d), 'yyyy-MM');
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type LedgerRow = {
  id?: string;
  transaction_date: string;
  amount: number | string;
  direction: 'cash_in' | 'cash_out';
  category: string;
  ledger_scope: 'platform' | 'wallet' | 'bridge' | string;
  classification: string | null;
  reference_id?: string | null;
  description?: string | null;
  linked_party?: string | null;
  user_id?: string | null;
  transaction_group_id?: string | null;
  source_table?: string | null;
  source_id?: string | null;
};

type GroupKey = string; // `${category}|${ledger_scope}`

type Aggregate = {
  category: string;
  scope: string;
  cashIn: number;
  cashOut: number;
  net: number;
  count: number;
  buckets: Record<string, { in: number; out: number }>;
};

const SCOPE_LABEL: Record<string, string> = {
  platform: 'Company',
  wallet:   'User Wallets',
  bridge:   'Transfers',
};

const SCOPE_BADGE: Record<string, string> = {
  platform: 'bg-primary/10 text-primary border-primary/30',
  wallet:   'bg-amber-500/10 text-amber-600 border-amber-500/30',
  bridge:   'bg-purple-500/10 text-purple-600 border-purple-500/30',
};

function prettifyCategory(c: string): string {
  return c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

// ─────────────────────────────────────────────────────────────
// Friendly labels for the minimalist Wallet Money Movement panel.
// Maps raw ledger categories to plain-English descriptions of what
// physically moved in or out of a user/operational wallet.
// ─────────────────────────────────────────────────────────────
const WALLET_FLOW_LABEL_IN: Record<string, string> = {
  deposit: 'User & proxy-agent deposits',
  agent_float_deposit: 'Operational float deposits (agents)',
  landlord_float_deposit: 'Landlord float deposits (CFO)',
  rent_payment: 'Rent collected into agent float',
  partner_commission: 'Partner commissions credited',
  agent_commission: 'Agent commissions credited',
  business_advance_commission: 'Advance commissions credited',
  roi_payout: 'Returns paid to supporters',
  roi_wallet_credit: 'Returns paid to supporters',
  payroll: 'Payroll credited',
  payroll_growth: 'Payroll growth credited',
  tenant_placement_bonus: 'Tenant placement bonuses',
  system_balance_correction: 'Balance corrections (in)',
};
const WALLET_FLOW_LABEL_OUT: Record<string, string> = {
  withdrawal: 'Personal wallet withdrawals',
  partner_funding: 'Float swept to company (partner)',
  agent_float_allocation: 'Float allocated to tenants/landlords',
  rent_repayment: 'Rent repaid from wallet',
  advance_recovery: 'Advance auto-recovery',
  system_balance_correction: 'Balance corrections (out)',
};
function friendlyWalletLabel(category: string, direction: 'cash_in' | 'cash_out'): string {
  const map = direction === 'cash_in' ? WALLET_FLOW_LABEL_IN : WALLET_FLOW_LABEL_OUT;
  return map[category] || prettifyCategory(category);
}

// ─────────────────────────────────────────────────────────────
// Wallet-impact map — explains which wallet buckets move (or don't)
// when a Capital Inflows category posts. The Comprehensive view shows
// the PLATFORM cash_in leg only; the wallet effect is the *paired*
// movement on the related user/operational wallet (if any).
// ─────────────────────────────────────────────────────────────
type WalletImpact = {
  moves: { bucket: 'withdrawable_balance' | 'float_balance' | 'advance_balance' | 'portfolio_principal'; party: string; direction: '↑' | '↓'; note?: string }[];
  unchanged: ('withdrawable_balance' | 'float_balance' | 'advance_balance')[];
  summary: string;
};
const WALLET_IMPACT: Record<string, WalletImpact> = {
  partner_funding: {
    summary: 'Partner sweeps proxy-agent float into platform capital. No user withdrawable bucket moves.',
    moves: [
      { bucket: 'float_balance', party: 'Proxy agent', direction: '↓', note: 'Source of the swept capital' },
    ],
    unchanged: ['withdrawable_balance', 'advance_balance'],
  },
  pending_portfolio_topup: {
    summary: 'Supporter top-up parked on platform until CFO/COO clicks "Apply Top-up". No wallet bucket moves yet.',
    moves: [
      { bucket: 'portfolio_principal', party: 'Supporter (on merge)', direction: '↑', note: 'Only after Apply Top-up; ROI accrues from merge date' },
    ],
    unchanged: ['withdrawable_balance', 'float_balance', 'advance_balance'],
  },
  partner_commission: {
    summary: '2% instant commission to partner on a proxy-agent deposit. Credited as withdrawable cash.',
    moves: [
      { bucket: 'withdrawable_balance', party: 'Partner', direction: '↑' },
    ],
    unchanged: ['float_balance', 'advance_balance'],
  },
  deposit: {
    summary: 'User cash/MoMo deposit. Routes by recipient_type (Wallet Routing v2).',
    moves: [
      { bucket: 'withdrawable_balance', party: 'User (recipient_type=user)', direction: '↑' },
      { bucket: 'float_balance', party: 'Operational wallet (recipient_type=operational_wallet)', direction: '↑' },
    ],
    unchanged: ['advance_balance'],
  },
  rent_payment: {
    summary: 'Tenant rent collected by an agent. Platform recognizes revenue; agent commission posts separately.',
    moves: [
      { bucket: 'float_balance', party: 'Collecting agent', direction: '↑', note: 'Company money; not withdrawable' },
      { bucket: 'withdrawable_balance', party: 'Agent (10% commission, separate txn)', direction: '↑' },
    ],
    unchanged: ['advance_balance'],
  },
  roi_payout: {
    summary: 'Returns paid to supporter — credited as withdrawable cash on the supporter wallet.',
    moves: [
      { bucket: 'withdrawable_balance', party: 'Supporter', direction: '↑' },
    ],
    unchanged: ['float_balance', 'advance_balance'],
  },
};
const DEFAULT_WALLET_IMPACT: WalletImpact = {
  summary: 'Platform-scope cash_in leg. Wallet bucket impact depends on the paired transaction (recipient_type per Wallet Routing v2). No automatic withdrawable credit from this category alone.',
  moves: [],
  unchanged: ['withdrawable_balance', 'float_balance', 'advance_balance'],
};
function getWalletImpact(category: string): WalletImpact {
  return WALLET_IMPACT[category] || DEFAULT_WALLET_IMPACT;
}
function WalletImpactTooltipContent({ category }: { category: string }) {
  const impact = getWalletImpact(category);
  return (
    <div className="max-w-[300px] space-y-2 text-[11px]">
      <div className="font-semibold text-foreground">{prettifyCategory(category)} · Wallet Impact</div>
      <div className="text-muted-foreground leading-snug">{impact.summary}</div>
      {impact.moves.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Buckets that move</div>
          {impact.moves.map((m, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className={cn('font-mono font-semibold', m.direction === '↑' ? 'text-emerald-500' : 'text-rose-500')}>{m.direction}</span>
              <div className="flex-1">
                <div><span className="font-mono">{m.bucket}</span> <span className="text-muted-foreground">— {m.party}</span></div>
                {m.note && <div className="text-[10px] text-muted-foreground italic">{m.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {impact.unchanged.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Unchanged</div>
          <div className="flex flex-wrap gap-1">
            {impact.unchanged.map(b => (
              <span key={b} className="font-mono text-[10px] rounded bg-muted px-1 py-0.5 text-muted-foreground">{b}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Highlight occurrences of `query` inside `text` (case-insensitive). Used to
// surface drill-down search matches in the ledger table cells.
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function Highlight({ text, query }: { text: string | null | undefined; query: string }) {
  const value = text ?? '';
  const q = query.trim();
  if (!q || !value) return <>{value}</>;
  const parts = value.split(new RegExp(`(${escapeRegex(q)})`, 'ig'));
  const lower = q.toLowerCase();
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lower
          ? <mark key={i} className="bg-primary/20 text-primary rounded-sm px-0.5">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function ComprehensiveCashMovement() {
  const { role, roles } = useAuth();
  const canViewLedgerDetail = useMemo(() => {
    if (role && LEDGER_DETAIL_ROLES.has(role)) return true;
    return (roles || []).some(r => LEDGER_DETAIL_ROLES.has(r));
  }, [role, roles]);

  const [period, setPeriod] = useState<PeriodKey>('24h');
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [includeAdjustments, setIncludeAdjustments] = useState(false);
  // Plain-English / "Simple" mode — hides accounting jargon, big tables,
  // and matrix views so a non-tech reader sees just the friendly summary.
  // Persisted; defaults to ON for phone-sized screens.
  const [simpleMode, setSimpleMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem('welile.cashMovement.simpleMode');
    if (saved === '1') return true;
    if (saved === '0') return false;
    return window.matchMedia?.('(max-width: 640px)').matches ?? true;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('welile.cashMovement.simpleMode', simpleMode ? '1' : '0');
  }, [simpleMode]);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'platform' | 'wallet' | 'bridge'>('all');
  const [directionQuickFilter, setDirectionQuickFilter] = useState<'all' | 'cash_in' | 'cash_out' | 'net_positive' | 'net_negative'>('all');
  const [categoryQuickFilter, setCategoryQuickFilter] = useState<string | null>(null);
  // Controls how many categories the Top Categories widget surfaces.
  // Pure UI state — does not change aggregation or table filters.
  const [topCategoriesLimit, setTopCategoriesLimit] = useState<5 | 10>(5);
  // Page-level party filter — narrows totals and aggregates to a single
  // counterparty (resolved by user_id). `null` = everyone. Surfaced via the
  // big thumb-friendly Party button at the top of the page.
  const [partyQuickFilter, setPartyQuickFilter] = useState<string | null>(null);
  // Bottom-sheet open states for the thumb-friendly Date/Direction/Party
  // pickers. Each opens a full-width sheet that's easy to tap on a phone.
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [directionSheetOpen, setDirectionSheetOpen] = useState(false);
  const [partySheetOpen, setPartySheetOpen] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  // "Tap to see details" — how many rows of the page-level transaction
  // drilldown list are currently rendered. Starts small for phone perf,
  // grows in chunks when the user taps "Show more".
  const [pageDrillVisible, setPageDrillVisible] = useState<number>(25);
  // Controls the page-level "Tap to see details" drilldown so the
  // three "See where this comes from" tile links can open it
  // programmatically and scroll it into view.
  const [pageDrillOpen, setPageDrillOpen] = useState<boolean>(false);
  const pageDrillRef = useRef<HTMLDivElement | null>(null);
  const openPageDrill = useCallback(
    (dir: 'all' | 'cash_in' | 'cash_out' | 'net_positive' | 'net_negative') => {
      setDirectionQuickFilter(dir);
      setPageDrillVisible(25);
      setPageDrillOpen(true);
      setTimeout(() => {
        pageDrillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    },
    [],
  );
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [drill, setDrill] = useState<null | { category: string; scope: string; bucket: string | null; direction?: 'cash_in' | 'cash_out'; dateFrom?: string; dateTo?: string }>(null);
  const [partyNames, setPartyNames] = useState<Record<string, string>>({});
  const [drillQuery, setDrillQuery] = useState('');
  const [debouncedDrillQuery, setDebouncedDrillQuery] = useState('');
  const [drillPage, setDrillPage] = useState(0);
  const [drillPageSize, setDrillPageSize] = useState<number>(100);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  // Drill date filter chips — narrow expanded transactions by a relative or custom range
  type DrillDatePreset = 'inherit' | '1d' | '2d' | '3d' | '5d' | '7d' | '30d' | 'custom';
  const [drillDatePreset, setDrillDatePreset] = useState<DrillDatePreset>('inherit');
  const [drillCustomFrom, setDrillCustomFrom] = useState<string>('');
  const [drillCustomTo, setDrillCustomTo] = useState<string>('');
  const effectiveDrillRange = useMemo<{ from?: string; to?: string }>(() => {
    if (drillDatePreset === 'inherit') return {};
    if (drillDatePreset === 'custom') {
      return { from: drillCustomFrom || undefined, to: drillCustomTo || undefined };
    }
    const days = parseInt(drillDatePreset, 10);
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - (days - 1));
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
    return { from: fmt(from), to: fmt(today) };
  }, [drillDatePreset, drillCustomFrom, drillCustomTo]);

  // ── Capital Inflows callout (platform-scope cash_in for selected categories)
  const CAPITAL_INFLOW_DEFAULT = ['partner_funding', 'pending_portfolio_topup'];
  const CAPITAL_INFLOW_STORAGE = 'welile-capital-inflow-categories';
  const [capitalCategories, setCapitalCategories] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(CAPITAL_INFLOW_STORAGE);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {}
    return new Set(CAPITAL_INFLOW_DEFAULT);
  });
  const [capitalPickerOpen, setCapitalPickerOpen] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(CAPITAL_INFLOW_STORAGE, JSON.stringify(Array.from(capitalCategories))); } catch {}
  }, [capitalCategories]);

  // Optional sub-range filter scoped to the Capital Inflows callout (and its
  // drill-downs). Dates are inclusive `yyyy-MM-dd` strings; empty means
  // "use the full loaded period".
  const [capitalFrom, setCapitalFrom] = useState<string>('');
  const [capitalTo, setCapitalTo] = useState<string>('');
  // Toggle: also surface the matching wallet-scope legs (cash_in/cash_out on
  // agent/partner wallets) that share a transaction_group_id with each
  // selected platform.cash_in entry. Off = pure platform-only inflow view.
  const [includeWalletLegs, setIncludeWalletLegs] = useState<boolean>(false);
  const capitalRangeActive = !!(capitalFrom || capitalTo);
  const inCapitalRange = (iso: string) => {
    if (!capitalRangeActive) return true;
    const d = iso.slice(0, 10);
    if (capitalFrom && d < capitalFrom) return false;
    if (capitalTo && d > capitalTo) return false;
    return true;
  };

  const generate = async () => {
    setLoading(true);
    try {
      const { from } = periodRange(period);
      // Page through to bypass 1000-row default limit
      const PAGE = 1000;
      let acc: LedgerRow[] = [];
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = supabase
          .from('general_ledger')
          .select('id, transaction_date, amount, direction, category, ledger_scope, classification, reference_id, description, linked_party, user_id, transaction_group_id, source_table, source_id')
          .order('transaction_date', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (from) q = q.gte('transaction_date', from.toISOString());
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data || []) as LedgerRow[];
        acc = acc.concat(batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
        if (offset > 200_000) break; // safety cap
      }
      setRows(acc);
      setGeneratedAt(new Date());
    } catch (err: any) {
      console.error('[CashMovement] load failed', err);
      toast.error('Failed to load ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { generate(); /* eslint-disable-next-line */ }, [period]);

  // Auto-refresh every 60s when enabled (skip while a fetch is in flight,
  // and skip while a drill-down sheet is open to avoid disturbing the user).
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (!loading && !drill) generate();
    }, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, loading, drill, period]);

  // Reset search + pagination when opening a new drill
  useEffect(() => {
    setDrillQuery('');
    setDebouncedDrillQuery('');
    setDrillPage(0);
    setDrillDatePreset('inherit');
    setDrillCustomFrom('');
    setDrillCustomTo('');
  }, [drill?.category, drill?.scope, drill?.bucket]);
  useEffect(() => { setDrillPage(0); }, [debouncedDrillQuery, drillPageSize]);

  // Debounce the drill-down search so filtering doesn't run on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDrillQuery(drillQuery), 200);
    return () => clearTimeout(t);
  }, [drillQuery]);

  // Drill-down filtered rows
  const drillRows = useMemo(() => {
    if (!drill) return [] as LedgerRow[];
    const effFrom = effectiveDrillRange.from ?? drill.dateFrom;
    const effTo = effectiveDrillRange.to ?? drill.dateTo;
    return rows.filter(r => {
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) return false;
      if (r.category !== drill.category || r.ledger_scope !== drill.scope) return false;
      if (drill.direction && r.direction !== drill.direction) return false;
      if (effFrom && r.transaction_date.slice(0, 10) < effFrom) return false;
      if (effTo && r.transaction_date.slice(0, 10) > effTo) return false;
      if (drill.bucket) {
        const bk = bucketKey(new Date(r.transaction_date), granularity);
        if (bk !== drill.bucket) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  }, [rows, drill, includeAdjustments, granularity, effectiveDrillRange]);

  // Apply search filter (reference id, transaction group, party name, user id, source table, linked party, description)
  const filteredDrillRows = useMemo(() => {
    const q = debouncedDrillQuery.trim().toLowerCase();
    if (!q) return drillRows;
    return drillRows.filter(r => {
      const name = r.user_id ? (partyNames[r.user_id] || '').toLowerCase() : '';
      return (
        (r.reference_id || '').toLowerCase().includes(q) ||
        (r.transaction_group_id || '').toLowerCase().includes(q) ||
        (r.user_id || '').toLowerCase().includes(q) ||
        (r.source_table || '').toLowerCase().includes(q) ||
        (r.source_id || '').toLowerCase().includes(q) ||
        (r.linked_party || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        name.includes(q)
      );
    });
  }, [drillRows, debouncedDrillQuery, partyNames]);

  // Resolve user names for drill-down list
  useEffect(() => {
    const ids = Array.from(new Set(drillRows.map(r => r.user_id).filter((x): x is string => !!x && !partyNames[x])));
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, phone').in('id', ids.slice(0, 200));
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      for (const p of data as any[]) {
        next[p.id] = p.full_name || p.phone || p.id.slice(0, 8);
      }
      setPartyNames(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [drillRows, partyNames]);

  // Aggregate
  const { aggregates, bucketLabels, totals } = useMemo(() => {
    const map = new Map<GroupKey, Aggregate>();
    const bucketSet = new Set<string>();
    let totIn = 0, totOut = 0;

    for (const r of rows) {
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
      if (scopeFilter !== 'all' && r.ledger_scope !== scopeFilter) continue;
      if (partyQuickFilter && r.user_id !== partyQuickFilter) continue;

      const amt = Number(r.amount) || 0;
      const key: GroupKey = `${r.category}|${r.ledger_scope}`;
      let a = map.get(key);
      if (!a) {
        a = { category: r.category, scope: r.ledger_scope, cashIn: 0, cashOut: 0, net: 0, count: 0, buckets: {} };
        map.set(key, a);
      }
      const bk = bucketKey(new Date(r.transaction_date), granularity);
      bucketSet.add(bk);
      const cell = a.buckets[bk] || { in: 0, out: 0 };
      if (r.direction === 'cash_in')  { a.cashIn  += amt; cell.in  += amt; totIn  += amt; }
      else                            { a.cashOut += amt; cell.out += amt; totOut += amt; }
      a.buckets[bk] = cell;
      a.count += 1;
      a.net = a.cashIn - a.cashOut;
    }

    const aggregates = Array.from(map.values()).sort((a, b) => (Math.abs(b.cashIn + b.cashOut) - Math.abs(a.cashIn + a.cashOut)));
    const bucketLabels = Array.from(bucketSet).sort();
    return { aggregates, bucketLabels, totals: { cashIn: totIn, cashOut: totOut, net: totIn - totOut } };
  }, [rows, granularity, includeAdjustments, scopeFilter, partyQuickFilter]);

  const filteredAggregates = useMemo(() => {
    return aggregates.filter(a => {
      if (directionQuickFilter === 'cash_in' && a.cashIn <= 0) return false;
      if (directionQuickFilter === 'cash_out' && a.cashOut <= 0) return false;
      if (directionQuickFilter === 'net_positive' && a.net <= 0) return false;
      if (directionQuickFilter === 'net_negative' && a.net >= 0) return false;
      if (categoryQuickFilter && a.category !== categoryQuickFilter) return false;
      return true;
    });
  }, [aggregates, directionQuickFilter, categoryQuickFilter]);

  const topCategoryChips = useMemo(() => {
    return aggregates
      .slice()
      .sort((a, b) => Math.abs(b.cashIn + b.cashOut) - Math.abs(a.cashIn + a.cashOut))
      .slice(0, 6)
      .map(a => a.category);
  }, [aggregates]);

  // Top Categories summary: merges per-category aggregates across ledger scopes
  // for the current filters and surfaces the biggest movers so users can tap
  // a chip to filter the Categories table without scrolling. Pure derivation.
  const topCategoriesSummary = useMemo(() => {
    const map = new Map<string, { category: string; cashIn: number; cashOut: number; count: number }>();
    for (const a of aggregates) {
      const cur = map.get(a.category) || { category: a.category, cashIn: 0, cashOut: 0, count: 0 };
      cur.cashIn += a.cashIn;
      cur.cashOut += a.cashOut;
      cur.count += a.count;
      map.set(a.category, cur);
    }
    const all = Array.from(map.values()).map(c => ({ ...c, total: c.cashIn + c.cashOut, net: c.cashIn - c.cashOut }));
    const grandTotal = all.reduce((s, c) => s + c.total, 0) || 1;
    return {
      top: all.sort((a, b) => b.total - a.total).slice(0, topCategoriesLimit).map(c => ({ ...c, share: c.total / grandTotal })),
      categoryCount: all.length,
    };
  }, [aggregates, topCategoriesLimit]);

  // Top parties for the thumb-friendly Party picker. Aggregates the loaded
  // ledger rows by `user_id` (ignoring rows without one), totalling cash flow
  // so the most-active counterparties surface first. Pure UI/derivation —
  // does not mutate any business state.
  const topParties = useMemo(() => {
    const map = new Map<string, { id: string; cashIn: number; cashOut: number; count: number }>();
    for (const r of rows) {
      if (!r.user_id) continue;
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
      const amt = Number(r.amount) || 0;
      const cur = map.get(r.user_id) || { id: r.user_id, cashIn: 0, cashOut: 0, count: 0 };
      if (r.direction === 'cash_in') cur.cashIn += amt; else cur.cashOut += amt;
      cur.count += 1;
      map.set(r.user_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => (b.cashIn + b.cashOut) - (a.cashIn + a.cashOut));
  }, [rows, includeAdjustments]);

  // Resolve display names for the top parties (limit 50 so the picker is fast).
  useEffect(() => {
    const ids = topParties.slice(0, 50).map(p => p.id).filter(id => !partyNames[id]);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, phone').in('id', ids);
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      for (const p of data as any[]) {
        next[p.id] = p.full_name || p.phone || p.id.slice(0, 8);
      }
      setPartyNames(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [topParties, partyNames]);

  const partyLabel = partyQuickFilter
    ? (partyNames[partyQuickFilter] || `${partyQuickFilter.slice(0, 8)}…`)
    : 'Everyone';
  const directionLabel =
    directionQuickFilter === 'cash_in' ? 'Money In only' :
    directionQuickFilter === 'cash_out' ? 'Money Out only' :
    directionQuickFilter === 'net_positive' ? 'Net positive' :
    directionQuickFilter === 'net_negative' ? 'Net negative' :
    'In + Out';

  // ── Plain-language anomaly alerts ──────────────────────────────
  // Scans the loaded rows day-by-day within the selected period and
  // flags two kinds of unusual behavior in everyday language:
  //   1. SPIKES — a single day where Money In or Money Out is far
  //      above the period's typical daily level (>2σ above mean and
  //      >1.5× the mean, with a UGX 50K noise floor).
  //   2. GAPS — a day with NO money movement sandwiched between
  //      active days inside the selected window.
  // Honors `includeAdjustments`, `scopeFilter`, and `partyQuickFilter`
  // so it stays consistent with the numbers shown above. Purely
  // read-only — never mutates state, never writes to the ledger.
  const anomalyAlerts = useMemo(() => {
    const rng = periodRange(period);
    if (!rng.from) return [] as Array<{ kind: 'spike' | 'gap'; date: string; label: string; detail: string }>;
    const fromIso = rng.from.toISOString().slice(0, 10);
    const toIso = rng.to.toISOString().slice(0, 10);
    // Group by day
    const byDay = new Map<string, { in: number; out: number; count: number }>();
    for (const r of rows) {
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
      if (scopeFilter !== 'all' && r.ledger_scope !== scopeFilter) continue;
      if (partyQuickFilter && r.user_id !== partyQuickFilter) continue;
      const d = r.transaction_date.slice(0, 10);
      if (d < fromIso || d > toIso) continue;
      const amt = Number(r.amount) || 0;
      const cur = byDay.get(d) || { in: 0, out: 0, count: 0 };
      if (r.direction === 'cash_in') cur.in += amt; else cur.out += amt;
      cur.count += 1;
      byDay.set(d, cur);
    }
    // Build a full day series from fromIso → toIso
    const days: string[] = [];
    {
      const cur = new Date(fromIso + 'T00:00:00Z');
      const end = new Date(toIso + 'T00:00:00Z');
      while (cur.getTime() <= end.getTime()) {
        days.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    if (days.length < 3) return []; // not enough span to call anomalies

    const out: Array<{ kind: 'spike' | 'gap'; date: string; label: string; detail: string }> = [];
    const NOISE_FLOOR = 50_000;

    const stats = (vals: number[]) => {
      const n = vals.length || 1;
      const mean = vals.reduce((a, b) => a + b, 0) / n;
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
      return { mean, std: Math.sqrt(variance) };
    };

    for (const metric of ['in', 'out'] as const) {
      const vals = days.map(d => (byDay.get(d)?.[metric] ?? 0));
      const { mean, std } = stats(vals);
      if (mean < NOISE_FLOOR) continue; // tiny period, skip
      const threshold = Math.max(mean + 2 * std, mean * 1.5, NOISE_FLOOR);
      days.forEach((d, i) => {
        const v = vals[i];
        if (v > threshold && v > 0) {
          const factor = mean > 0 ? (v / mean).toFixed(1) : '∞';
          out.push({
            kind: 'spike',
            date: d,
            label: metric === 'in'
              ? `Unusual Money In spike on ${format(new Date(d + 'T00:00:00'), 'EEE dd MMM')}`
              : `Unusual Money Out spike on ${format(new Date(d + 'T00:00:00'), 'EEE dd MMM')}`,
            detail: `${formatUGX(v)} — about ${factor}× the period's daily average of ${formatUGX(Math.round(mean))}.`,
          });
        }
      });
    }

    // Gaps: zero-activity day sandwiched between active days
    const activeDays = days.filter(d => {
      const e = byDay.get(d);
      return e && (e.in > 0 || e.out > 0);
    });
    if (activeDays.length >= 3) {
      const firstActiveIdx = days.indexOf(activeDays[0]);
      const lastActiveIdx = days.indexOf(activeDays[activeDays.length - 1]);
      // Find consecutive runs of inactive days strictly inside the active span
      let i = firstActiveIdx + 1;
      while (i < lastActiveIdx) {
        const e = byDay.get(days[i]);
        if (!e || (e.in === 0 && e.out === 0)) {
          let j = i;
          while (j < lastActiveIdx) {
            const ej = byDay.get(days[j]);
            if (ej && (ej.in > 0 || ej.out > 0)) break;
            j += 1;
          }
          const runLen = j - i;
          if (runLen >= 1) {
            out.push({
              kind: 'gap',
              date: days[i],
              label: runLen === 1
                ? `Quiet day on ${format(new Date(days[i] + 'T00:00:00'), 'EEE dd MMM')}`
                : `Quiet stretch · ${runLen} days from ${format(new Date(days[i] + 'T00:00:00'), 'dd MMM')}`,
              detail: runLen === 1
                ? 'No money moved in or out on this day, but the days around it were active.'
                : `No money moved on ${runLen} days in a row, between otherwise active days.`,
            });
          }
          i = j;
        } else {
          i += 1;
        }
      }
    }

    // Sort by date desc (newest first), cap to 5 to avoid overwhelm
    return out
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 5);
  }, [rows, period, includeAdjustments, scopeFilter, partyQuickFilter]);

  // ── Capital Inflows: platform-scope cash_in totals per category (from raw rows,
  // independent of scopeFilter so the callout always reflects true inbound capital.
  // Per-bucket totals follow the current `granularity` so the callout stays in sync
  // with the time-series matrix shown in the table below.
  const capitalInflow = useMemo(() => {
    const perCat = new Map<string, { total: number; count: number; buckets: Record<string, number>; groupIds: Set<string>; walletIn: number; walletOut: number; walletCount: number }>();
    const bucketSet = new Set<string>();
    for (const r of rows) {
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
      if (r.ledger_scope !== 'platform' || r.direction !== 'cash_in') continue;
      if (!inCapitalRange(r.transaction_date)) continue;
      const amt = Number(r.amount) || 0;
      const bk = bucketKey(new Date(r.transaction_date), granularity);
      bucketSet.add(bk);
      const cur = perCat.get(r.category) || { total: 0, count: 0, buckets: {}, groupIds: new Set<string>(), walletIn: 0, walletOut: 0, walletCount: 0 };
      cur.total += amt;
      cur.count += 1;
      cur.buckets[bk] = (cur.buckets[bk] || 0) + amt;
      if (r.transaction_group_id) cur.groupIds.add(r.transaction_group_id);
      perCat.set(r.category, cur);
    }

    // Second pass — fold in matching wallet-scope legs when toggle is on.
    // We pair by transaction_group_id (the canonical balanced-leg link).
    if (includeWalletLegs && perCat.size > 0) {
      // Build reverse index: group_id -> array of categories it belongs to
      const groupToCats = new Map<string, string[]>();
      for (const [cat, v] of perCat.entries()) {
        for (const gid of v.groupIds) {
          const arr = groupToCats.get(gid) || [];
          arr.push(cat);
          groupToCats.set(gid, arr);
        }
      }
      for (const r of rows) {
        if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
        if (r.ledger_scope !== 'wallet') continue;
        if (!r.transaction_group_id) continue;
        const cats = groupToCats.get(r.transaction_group_id);
        if (!cats) continue;
        const amt = Number(r.amount) || 0;
        for (const cat of cats) {
          const cur = perCat.get(cat)!;
          if (r.direction === 'cash_in') cur.walletIn += amt;
          else                            cur.walletOut += amt;
          cur.walletCount += 1;
        }
      }
    }

    const availableCategories = Array.from(perCat.entries())
      .map(([category, v]) => ({
        category,
        total: v.total,
        count: v.count,
        buckets: v.buckets,
        walletIn: v.walletIn,
        walletOut: v.walletOut,
        walletNet: v.walletIn - v.walletOut,
        walletCount: v.walletCount,
      }))
      .sort((a, b) => b.total - a.total);
    const selected = availableCategories.filter(c => capitalCategories.has(c.category));
    const total = selected.reduce((s, c) => s + c.total, 0);
    const entries = selected.reduce((s, c) => s + c.count, 0);
    const walletInTotal  = selected.reduce((s, c) => s + c.walletIn,  0);
    const walletOutTotal = selected.reduce((s, c) => s + c.walletOut, 0);
    const walletEntries  = selected.reduce((s, c) => s + c.walletCount, 0);
    const bucketLabels = Array.from(bucketSet).sort();
    const bucketTotals: Record<string, number> = {};
    for (const b of bucketLabels) {
      bucketTotals[b] = selected.reduce((s, c) => s + (c.buckets[b] || 0), 0);
    }
    const peakBucket = bucketLabels.reduce((max, b) => bucketTotals[b] > (bucketTotals[max] || 0) ? b : max, bucketLabels[0] || '');
    return {
      availableCategories, selected, total, entries,
      bucketLabels, bucketTotals, peakBucket,
      walletInTotal, walletOutTotal, walletEntries,
      walletNetTotal: walletInTotal - walletOutTotal,
    };
  }, [rows, includeAdjustments, capitalCategories, granularity, capitalFrom, capitalTo, includeWalletLegs]);

  const handleExport = () => {
    if (!canViewLedgerDetail) { toast.error('You do not have permission to export ledger data'); return; }
    if (!aggregates.length) { toast.error('Nothing to export'); return; }
    const headers = ['Category', 'Scope', 'Description', 'Cash In', 'Cash Out', 'Net', 'Entries', ...bucketLabels.flatMap(b => [`${b} In`, `${b} Out`])];
    const data = aggregates.map(a => {
      const base = [
        prettifyCategory(a.category),
        SCOPE_LABEL[a.scope] || a.scope,
        CATEGORY_DESCRIPTIONS[a.category] || '',
        a.cashIn,
        a.cashOut,
        a.net,
        a.count,
      ];
      const cells = bucketLabels.flatMap(b => {
        const c = a.buckets[b];
        return [c?.in ?? 0, c?.out ?? 0];
      });
      return [...base, ...cells];
    });
    downloadCsv(`welile-cash-movement-${period}-${granularity}-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, data);
    toast.success('CSV downloaded');
  };

  const handleExportPdf = () => {
    if (!canViewLedgerDetail) { toast.error('You do not have permission to export ledger data'); return; }
    if (!aggregates.length) { toast.error('Nothing to export'); return; }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const periodLabel = PERIODS.find(p => p.value === period)?.label || period;
    const granLabel = GRANULARITIES.find(g => g.value === granularity)?.label || granularity;

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Welile · Comprehensive Cash Movement', 40, 36);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${periodLabel}  ·  Bucket: ${granLabel}  ·  Scope: ${scopeFilter === 'all' ? 'All' : (SCOPE_LABEL[scopeFilter] || scopeFilter)}  ·  Adjustments: ${includeAdjustments ? 'Included' : 'Excluded'}`, 40, 52);
    doc.text(rangeLabel, 40, 66);
    doc.text(`Generated ${format(new Date(), 'dd MMM yyyy HH:mm')}  ·  ${rows.length.toLocaleString()} ledger entries`, 40, 80);

    // Totals strip
    autoTable(doc, {
      startY: 92,
      head: [['Total Cash In', 'Total Cash Out', 'Net Movement']],
      body: [[formatUGX(totals.cashIn), `(${formatUGX(totals.cashOut)})`, `${totals.net >= 0 ? '+' : ''}${formatUGX(totals.net)}`]],
      theme: 'grid',
      styles: { fontSize: 10, halign: 'right' },
      headStyles: { fillColor: [30, 30, 30], halign: 'right' },
      margin: { left: 40, right: 40 },
    });

    // Category breakdown
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 16,
      head: [['Category', 'Scope', 'Cash In', 'Cash Out', 'Net', 'Entries']],
      body: aggregates.map(a => [
        prettifyCategory(a.category),
        SCOPE_LABEL[a.scope] || a.scope,
        a.cashIn ? formatUGX(a.cashIn) : '—',
        a.cashOut ? `(${formatUGX(a.cashOut)})` : '—',
        `${a.net >= 0 ? '+' : ''}${formatUGX(a.net)}`,
        String(a.count),
      ]),
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 40, right: 40 },
    });

    // Time-series net matrix (chunked across pages if many buckets)
    if (bucketLabels.length > 0) {
      const CHUNK = 12;
      for (let i = 0; i < bucketLabels.length; i += CHUNK) {
        const slice = bucketLabels.slice(i, i + CHUNK);
        doc.addPage();
        doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text(`${granLabel} Net Movement by Category  (${i + 1}–${Math.min(i + CHUNK, bucketLabels.length)} of ${bucketLabels.length})`, 40, 36);
        autoTable(doc, {
          startY: 48,
          head: [['Category · Scope', ...slice]],
          body: aggregates.map(a => [
            `${prettifyCategory(a.category)} · ${SCOPE_LABEL[a.scope] || a.scope}`,
            ...slice.map(b => {
              const c = a.buckets[b];
              if (!c || (c.in === 0 && c.out === 0)) return '·';
              const net = (c.in || 0) - (c.out || 0);
              return `${net >= 0 ? '+' : ''}${formatUGX(net)}`;
            }),
          ]),
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 3 },
          headStyles: { fillColor: [30, 30, 30], fontSize: 7 },
          columnStyles: Object.fromEntries(slice.map((_, k) => [k + 1, { halign: 'right' }])) as any,
          margin: { left: 40, right: 40 },
        });
      }
    }

    // Footer page numbers
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Welile Cash Movement · Page ${p} / ${pageCount}`, pageW - 40, doc.internal.pageSize.getHeight() - 16, { align: 'right' });
    }

    doc.save(`welile-cash-movement-${period}-${granularity}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF downloaded');
  };

  const handleExportDrill = () => {
    if (!canViewLedgerDetail) { toast.error('You do not have permission to export ledger data'); return; }
    if (!drill || filteredDrillRows.length === 0) return;
    const headers = ['Date', 'Reference ID', 'Transaction Group', 'Direction', 'Amount', 'Linked Party', 'User ID', 'User Name', 'Source Table', 'Source ID', 'Classification', 'Description'];
    const data = filteredDrillRows.map(r => [
      format(new Date(r.transaction_date), 'yyyy-MM-dd HH:mm:ss'),
      r.reference_id || '',
      r.transaction_group_id || '',
      r.direction,
      Number(r.amount) || 0,
      r.linked_party || '',
      r.user_id || '',
      (r.user_id && partyNames[r.user_id]) || '',
      r.source_table || '',
      r.source_id || '',
      r.classification || '',
      (r.description || '').replace(/\s+/g, ' ').slice(0, 500),
    ]);
    const tag = `${drill.category}_${drill.scope}${drill.bucket ? '_' + drill.bucket : ''}`;
    downloadCsv(`welile-ledger-${tag}-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, data);
    toast.success('Ledger entries exported');
  };

  // PDF export of the currently filtered drill-down ledger entries
  const handleExportDrillPdf = () => {
    if (!canViewLedgerDetail) { toast.error('You do not have permission to export ledger data'); return; }
    if (!drill || filteredDrillRows.length === 0) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const periodLabel = PERIODS.find(p => p.value === period)?.label || period;
    const granLabel = GRANULARITIES.find(g => g.value === granularity)?.label || granularity;

    let cIn = 0, cOut = 0;
    for (const r of filteredDrillRows) {
      const a = Number(r.amount) || 0;
      if (r.direction === 'cash_in') cIn += a; else cOut += a;
    }
    const net = cIn - cOut;

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Welile · Ledger Drill-Down', 40, 36);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(
      `Category: ${prettifyCategory(drill.category)}  ·  Scope: ${SCOPE_LABEL[drill.scope] || drill.scope}` +
      (drill.bucket ? `  ·  Bucket: ${drill.bucket}` : '') +
      `  ·  Period: ${periodLabel}  ·  Granularity: ${granLabel}`,
      40, 52,
    );
    if (debouncedDrillQuery) {
      doc.text(`Search filter: "${debouncedDrillQuery}"`, 40, 66);
    }
    doc.text(
      `Generated ${format(new Date(), 'dd MMM yyyy HH:mm')}  ·  ${filteredDrillRows.length.toLocaleString()} of ${drillRows.length.toLocaleString()} entries`,
      40, debouncedDrillQuery ? 80 : 66,
    );

    const startY = debouncedDrillQuery ? 92 : 78;
    autoTable(doc, {
      startY,
      head: [['Cash In', 'Cash Out', 'Net']],
      body: [[formatUGX(cIn), `(${formatUGX(cOut)})`, `${net >= 0 ? '+' : ''}${formatUGX(net)}`]],
      theme: 'grid',
      styles: { fontSize: 10, halign: 'right' },
      headStyles: { fillColor: [30, 30, 30], halign: 'right' },
      margin: { left: 40, right: 40 },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 16,
      head: [['Date', 'Reference / Tx', 'Party', 'Source', 'Dir', 'Amount']],
      body: filteredDrillRows.map(r => {
        const isIn = r.direction === 'cash_in';
        const amt = Number(r.amount) || 0;
        const partyName = (r.user_id && partyNames[r.user_id]) || (r.linked_party ? prettifyCategory(r.linked_party) : '—');
        const refLine = r.reference_id || (r.id ? r.id.slice(0, 8) + '…' : '—');
        const grp = r.transaction_group_id ? `\ngrp: ${r.transaction_group_id.slice(0, 8)}…` : '';
        const src = [r.source_table, r.source_id ? r.source_id.slice(0, 8) + '…' : ''].filter(Boolean).join(':') || '—';
        return [
          format(new Date(r.transaction_date), 'dd MMM yyyy HH:mm'),
          `${refLine}${grp}`,
          `${partyName}${r.user_id ? `\n${r.user_id.slice(0, 8)}…` : ''}`,
          src,
          isIn ? 'IN' : 'OUT',
          `${isIn ? '+' : '−'}${formatUGX(amt)}`,
        ];
      }),
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 30, 30], fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 150 },
        2: { cellWidth: 160 },
        3: { cellWidth: 130 },
        4: { cellWidth: 30, halign: 'center' },
        5: { halign: 'right' },
      },
      margin: { left: 40, right: 40 },
    });

    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Welile Ledger Drill-Down · Page ${p} / ${pageCount}`, pageW - 40, pageH - 16, { align: 'right' });
    }

    const tag = `${drill.category}_${drill.scope}${drill.bucket ? '_' + drill.bucket : ''}`;
    doc.save(`welile-ledger-${tag}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF downloaded');
  };

  // Export the full drill-down (raw ledger entries) for the currently selected
  // period, granularity, scope and adjustments toggle — bypassing any open drill.
  const handleExportAllEntries = () => {
    if (!canViewLedgerDetail) { toast.error('You do not have permission to export ledger data'); return; }
    const filtered = rows.filter(r => {
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) return false;
      if (scopeFilter !== 'all' && r.ledger_scope !== scopeFilter) return false;
      return true;
    });
    if (!filtered.length) { toast.error('Nothing to export'); return; }
    const headers = [
      'Date', 'Bucket', 'Category', 'Scope', 'Direction', 'Amount',
      'Reference ID', 'Transaction Group', 'Linked Party', 'User ID', 'User Name',
      'Source Table', 'Source ID', 'Classification', 'Description',
    ];
    const data = filtered
      .slice()
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
      .map(r => [
        format(new Date(r.transaction_date), 'yyyy-MM-dd HH:mm:ss'),
        bucketKey(new Date(r.transaction_date), granularity),
        prettifyCategory(r.category),
        SCOPE_LABEL[r.ledger_scope] || r.ledger_scope,
        r.direction,
        Number(r.amount) || 0,
        r.reference_id || '',
        r.transaction_group_id || '',
        r.linked_party || '',
        r.user_id || '',
        (r.user_id && partyNames[r.user_id]) || '',
        r.source_table || '',
        r.source_id || '',
        r.classification || '',
        (r.description || '').replace(/\s+/g, ' ').slice(0, 500),
      ]);
    downloadCsv(
      `welile-cash-movement-entries-${period}-${granularity}-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      headers,
      data,
    );
    toast.success(`${filtered.length.toLocaleString()} ledger entries exported`);
  };

  const range = periodRange(period);
  const rangeLabel = range.from ? `${format(range.from, 'dd MMM yyyy')} → ${format(range.to, 'dd MMM yyyy')}` : `Inception → ${format(range.to, 'dd MMM yyyy')}`;

  // ────────────────────────────────────────────────────────────
  // Shareable plain-English summary export
  // ────────────────────────────────────────────────────────────
  // Renders the same headline narrative the user reads in Simple
  // mode (period, Money In, Money Out, Difference, top anomalies)
  // into a portrait canvas suitable for download/share. Pure render
  // — never touches the ledger or wallet state.
  const buildSummaryCanvas = useCallback((): HTMLCanvasElement => {
    const W = 1080;
    const H = 1350;
    const cvs = document.createElement('canvas');
    cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext('2d')!;
    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0b1220');
    grad.addColorStop(1, '#111827');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // Card
    const PAD = 56;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    const cardX = PAD, cardY = PAD, cardW = W - PAD * 2, cardH = H - PAD * 2;
    const r = 28;
    ctx.beginPath();
    ctx.moveTo(cardX + r, cardY);
    ctx.arcTo(cardX + cardW, cardY, cardX + cardW, cardY + cardH, r);
    ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, r);
    ctx.arcTo(cardX, cardY + cardH, cardX, cardY, r);
    ctx.arcTo(cardX, cardY, cardX + cardW, cardY, r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    let y = cardY + 60;
    // Brand
    ctx.fillStyle = '#22d3ee';
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.fillText('WELILE · CASH MOVEMENTS', cardX + 40, y);
    y += 18;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '400 18px system-ui, -apple-system, sans-serif';
    ctx.fillText(rangeLabel, cardX + 40, y + 16);
    y += 70;

    // Title
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 44px system-ui, -apple-system, sans-serif';
    ctx.fillText('Money In & Out', cardX + 40, y);
    y += 12;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '400 20px system-ui, -apple-system, sans-serif';
    const periodLbl = PERIODS.find(p => p.value === period)?.label || period;
    ctx.fillText(`Period: ${periodLbl}  ·  ${rangeLabel}`, cardX + 40, y + 24);
    y += 50;
    // Applied filters line — Direction + Party so the export matches
    // exactly what the on-screen totals are filtered by.
    const dirLbl =
      directionQuickFilter === 'cash_in' ? 'Money In only' :
      directionQuickFilter === 'cash_out' ? 'Money Out only' :
      directionQuickFilter === 'net_positive' ? 'Net positive' :
      directionQuickFilter === 'net_negative' ? 'Net negative' :
      'All directions';
    const partyLbl = partyQuickFilter
      ? (partyNames[partyQuickFilter] || `${partyQuickFilter.slice(0, 8)}…`)
      : 'Anyone';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 17px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Filters · Direction: ${dirLbl}  ·  Party: ${partyLbl}`, cardX + 40, y + 24);
    y += 60;

    // Three big tiles
    const tileGap = 18;
    const tileW = (cardW - 80 - tileGap * 2) / 3;
    const tileH = 160;
    const drawTile = (i: number, label: string, value: string, color: string, bg: string) => {
      const x = cardX + 40 + i * (tileW + tileGap);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(x + 16, y);
      ctx.arcTo(x + tileW, y, x + tileW, y + tileH, 16);
      ctx.arcTo(x + tileW, y + tileH, x, y + tileH, 16);
      ctx.arcTo(x, y + tileH, x, y, 16);
      ctx.arcTo(x, y, x + tileW, y, 16);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '600 18px system-ui, -apple-system, sans-serif';
      ctx.fillText(label, x + 20, y + 36);
      ctx.fillStyle = color;
      ctx.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(value, x + 20, y + 96);
    };
    drawTile(0, 'MONEY IN',    formatUGX(totals.cashIn),                       '#34d399', 'rgba(16, 185, 129, 0.12)');
    drawTile(1, 'MONEY OUT',   formatUGX(totals.cashOut),                      '#f87171', 'rgba(239, 68, 68, 0.12)');
    drawTile(2, 'DIFFERENCE',  `${totals.net >= 0 ? '+' : ''}${formatUGX(totals.net)}`,
             totals.net >= 0 ? '#34d399' : '#f87171',
             totals.net >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)');
    y += tileH + 40;

    // Plain English sentence (word-wrapped)
    const sentence = (totals.cashIn === 0 && totals.cashOut === 0)
      ? 'No money moved during this period.'
      : `${formatUGX(totals.cashIn)} came IN and ${formatUGX(totals.cashOut)} went OUT. ${
          totals.net > 0 ? `Welile gained ${formatUGX(totals.net)} overall.`
          : totals.net < 0 ? `Welile spent ${formatUGX(Math.abs(totals.net))} more than it received.`
          : 'Money in and out balanced exactly.'
        }`;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '500 26px system-ui, -apple-system, sans-serif';
    const wrap = (text: string, maxWidth: number) => {
      const words = text.split(' '); const lines: string[] = []; let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth) { if (cur) lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const lines = wrap(sentence, cardW - 80);
    for (const ln of lines) { ctx.fillText(ln, cardX + 40, y); y += 36; }
    y += 20;

    // Anomalies (top 3)
    if (anomalyAlerts.length > 0) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(`HEADS UP · ${anomalyAlerts.length} unusual ${anomalyAlerts.length === 1 ? 'pattern' : 'patterns'}`, cardX + 40, y);
      y += 30;
      ctx.font = '500 20px system-ui, -apple-system, sans-serif';
      for (const a of anomalyAlerts.slice(0, 3)) {
        ctx.fillStyle = '#f1f5f9';
        const labelLines = wrap(`• ${a.label}`, cardW - 80);
        for (const ln of labelLines) { ctx.fillText(ln, cardX + 40, y); y += 26; }
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '400 18px system-ui, -apple-system, sans-serif';
        const detailLines = wrap(a.detail, cardW - 100);
        for (const ln of detailLines) { ctx.fillText(ln, cardX + 56, y); y += 22; }
        ctx.font = '500 20px system-ui, -apple-system, sans-serif';
        y += 8;
        if (y > cardY + cardH - 120) break;
      }
    }

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '400 16px system-ui, -apple-system, sans-serif';
    const stamp = `Generated ${format(new Date(), 'dd MMM yyyy · HH:mm')} · All amounts in UGX`;
    ctx.fillText(stamp, cardX + 40, cardY + cardH - 30);
    return cvs;
  }, [period, rangeLabel, totals, anomalyAlerts, directionQuickFilter, partyQuickFilter, partyNames]);

  const summaryFilename = (ext: string) =>
    `welile-cash-summary-${period}-${format(new Date(), 'yyyy-MM-dd-HHmm')}.${ext}`;

  const handleDownloadSummaryPng = useCallback(() => {
    try {
      const cvs = buildSummaryCanvas();
      cvs.toBlob((blob) => {
        if (!blob) { toast.error('Could not build image'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = summaryFilename('png');
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        toast.success('Summary image saved');
      }, 'image/png');
    } catch (e: any) {
      console.error('[CashMovement] summary png failed', e);
      toast.error('Could not save summary image');
    }
  }, [buildSummaryCanvas, period]);

  const handleDownloadSummaryPdf = useCallback(() => {
    try {
      const cvs = buildSummaryCanvas();
      const img = cvs.toDataURL('image/png');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const ratio = cvs.height / cvs.width;
      const margin = 32;
      const imgW = pw - margin * 2;
      const imgH = Math.min(ph - margin * 2, imgW * ratio);
      doc.addImage(img, 'PNG', margin, margin, imgW, imgH);
      doc.save(summaryFilename('pdf'));
      toast.success('Summary PDF saved');
    } catch (e: any) {
      console.error('[CashMovement] summary pdf failed', e);
      toast.error('Could not save summary PDF');
    }
  }, [buildSummaryCanvas, period]);

  const handleShareSummary = useCallback(async () => {
    try {
      const cvs = buildSummaryCanvas();
      const blob: Blob | null = await new Promise(res => cvs.toBlob(res, 'image/png'));
      if (!blob) { toast.error('Could not build image'); return; }
      const file = new File([blob], summaryFilename('png'), { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
        await nav.share({
          files: [file],
          title: 'Welile · Cash Movements',
          text: `${PERIODS.find(p => p.value === period)?.label || period} · ${rangeLabel}`,
        });
        return;
      }
      // Fallback to download
      handleDownloadSummaryPng();
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // user cancelled share sheet
      console.error('[CashMovement] share failed', e);
      toast.error('Sharing not supported — image saved instead');
      handleDownloadSummaryPng();
    }
  }, [buildSummaryCanvas, handleDownloadSummaryPng, period, rangeLabel]);

  return (
    <Card>
      <CardContent className="pt-4 pb-6 space-y-4 px-3 sm:px-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base sm:text-sm font-semibold">Money In & Out</h3>
            <p className="text-[11px] text-muted-foreground">
              {simpleMode
                ? 'A simple picture of money flowing in and out of Welile, in plain English.'
                : 'All money flowing in and out of Welile — updated live from the books.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{rangeLabel}</Badge>
            <Button
              size="sm"
              variant={simpleMode ? 'default' : 'outline'}
              className="h-7 text-[11px] px-2 gap-1"
              onClick={() => setSimpleMode(v => !v)}
              title={simpleMode ? 'Switch to full detail view' : 'Switch to a simple, plain-English view'}
              aria-pressed={simpleMode}
            >
              {simpleMode ? '😊 Simple view' : 'Detailed view'}
            </Button>
          </div>
        </div>

        {/* ─── Sticky on-page navigator ────────────────────────────
            Quick anchors to the major sections of the page. Sticks
            to the top of the viewport while scrolling so users can
            jump between Glance, the totals, categories, and the
            transactions list without endless scrolling. The list of
            anchors adapts to Simple vs Detailed view (hides anchors
            for sections that aren't rendered). */}
        <nav
          aria-label="Jump to section"
          className="sticky top-0 z-30 -mx-3 sm:-mx-6 px-3 sm:px-6 py-1.5 bg-card/95 backdrop-blur border-y border-border"
        >
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0 mr-1">
              Jump to:
            </span>
            {([
              simpleMode ? { id: 'cm-glance',       label: 'Glance',       emoji: '👀' } : null,
              { id: 'cm-totals',       label: 'Money In / Out', emoji: '⇅' },
              !simpleMode ? { id: 'cm-inflows',    label: 'New money',     emoji: '⬆️' } : null,
              !simpleMode ? { id: 'cm-categories', label: 'Categories',    emoji: '📂' } : null,
              { id: 'cm-transactions', label: 'Transactions',  emoji: '🧾' },
            ].filter(Boolean) as Array<{ id: string; label: string; emoji: string }>).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  const el = document.getElementById(item.id);
                  if (!el) return;
                  // Open the transactions collapsible automatically so the
                  // "Transactions" anchor lands on visible content, not on
                  // a closed trigger.
                  if (item.id === 'cm-transactions') setPageDrillOpen(true);
                  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
                }}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-background hover:bg-accent hover:text-accent-foreground px-2.5 py-1 text-[11px] font-medium transition-colors"
              >
                <span aria-hidden="true">{item.emoji}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* ─── Thumb-friendly filter bar ──────────────────────────
            Three large tap targets (≥56px tall) for the filters non-tech
            users reach for most: Date, Direction, and Party. Each opens a
            full-width bottom sheet on phones so options are easy to scan
            and tap with a thumb. Existing chip rows below remain for
            power users and are unchanged. */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              key: 'date' as const,
              icon: <Calendar className="h-5 w-5" />,
              label: 'Date',
              value: PERIODS.find(p => p.value === period)?.label || period,
              active: true,
              onClick: () => setDateSheetOpen(true),
            },
            {
              key: 'dir' as const,
              icon: <ArrowLeftRight className="h-5 w-5" />,
              label: 'Direction',
              value: directionLabel,
              active: directionQuickFilter !== 'all',
              onClick: () => setDirectionSheetOpen(true),
            },
            {
              key: 'party' as const,
              icon: <Users className="h-5 w-5" />,
              label: 'Party',
              value: partyLabel,
              active: !!partyQuickFilter,
              onClick: () => setPartySheetOpen(true),
            },
          ].map(btn => (
            <button
              key={btn.key}
              type="button"
              onClick={btn.onClick}
              className={cn(
                'min-h-[64px] rounded-xl border-2 px-2.5 py-2 text-left flex flex-col gap-0.5 transition-colors',
                'active:scale-[0.98] touch-manipulation',
                btn.active
                  ? 'border-primary bg-primary/10 hover:bg-primary/15'
                  : 'border-border bg-card hover:bg-muted/60',
              )}
              aria-label={`${btn.label}: ${btn.value}. Tap to change.`}
            >
              <span className={cn(
                'flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold',
                btn.active ? 'text-primary' : 'text-muted-foreground',
              )}>
                {btn.icon}
                {btn.label}
              </span>
              <span className="text-[12px] sm:text-sm font-semibold leading-tight truncate">
                {btn.value}
              </span>
            </button>
          ))}
        </div>
        {(directionQuickFilter !== 'all' || partyQuickFilter) && (
          <button
            type="button"
            onClick={() => { setDirectionQuickFilter('all'); setPartyQuickFilter(null); }}
            className="-mt-2 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}

        {/* Period — horizontal scroll on mobile so it never crams */}
        <div>
          <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Show me
          </div>
          <div className="flex gap-1.5 items-center overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {PERIODS.map(p => (
              <Button key={p.value} size="sm" variant={period === p.value ? 'default' : 'outline'} className="text-xs h-8 shrink-0 snap-start" onClick={() => setPeriod(p.value)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Group by + Where + adjustments */}
        <div className="space-y-2">
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Group by</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {GRANULARITIES.map(g => (
                <Button key={g.value} size="sm" variant={granularity === g.value ? 'default' : 'outline'} className="text-xs h-8 shrink-0" onClick={() => setGranularity(g.value)}>
                  {g.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Where</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {(['all','platform','wallet','bridge'] as const).map(s => (
                <Button key={s} size="sm" variant={scopeFilter === s ? 'default' : 'outline'} className="text-xs h-8 shrink-0" onClick={() => setScopeFilter(s)}>
                  {s === 'all' ? 'Everywhere' : SCOPE_LABEL[s] || s}
                </Button>
              ))}
              <Button size="sm" variant={includeAdjustments ? 'default' : 'outline'} className="text-xs h-8 shrink-0 ml-2" onClick={() => setIncludeAdjustments(v => !v)}>
                {includeAdjustments ? '✓ Showing fixes' : 'Show fixes'}
              </Button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={generate} disabled={loading} size="sm" className="gap-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {loading ? 'Loading…' : 'Reload'}
          </Button>
          <Button
            onClick={() => setAutoRefresh(v => !v)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
            title={autoRefresh ? 'Auto-refresh every 60s — click to stop' : 'Refresh every 60 seconds'}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', autoRefresh && 'animate-spin-slow')} />
            {autoRefresh ? 'Auto · 1m' : 'Auto-refresh'}
          </Button>
          <Button
            onClick={handleExport}
            variant="outline" size="sm" className="gap-2"
            disabled={!aggregates.length || !canViewLedgerDetail}
            title={!canViewLedgerDetail ? 'Only finance leaders can download these reports' : undefined}
          >
            {canViewLedgerDetail ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            <span className="hidden xs:inline">Download </span>CSV
          </Button>
          <Button
            onClick={handleExportPdf}
            variant="outline" size="sm" className="gap-2"
            disabled={!aggregates.length || !canViewLedgerDetail}
            title={!canViewLedgerDetail ? 'Only finance leaders can download these reports' : undefined}
          >
            {canViewLedgerDetail ? <FileText className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            <span className="hidden xs:inline">Download </span>PDF
          </Button>
          <Button
            onClick={handleExportAllEntries}
            variant="outline" size="sm" className="gap-2"
            disabled={!rows.length || !canViewLedgerDetail}
            title={!canViewLedgerDetail
              ? 'Only finance leaders can download these reports'
              : 'Download every single transaction in this period'}
          >
            {canViewLedgerDetail ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            All transactions
          </Button>
          {!canViewLedgerDetail && (
            <span className="text-[11px] text-muted-foreground self-center ml-1 inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> Downloads locked
            </span>
          )}
          {generatedAt && (
            <span className="text-[11px] text-muted-foreground self-center ml-1 w-full sm:w-auto">
              Updated {format(generatedAt, 'dd MMM HH:mm')} · {rows.length.toLocaleString()} transactions
            </span>
          )}
        </div>

        {/* ─── Wallet Money Movement (minimalist) ───
            Primary view: money flowing INTO and OUT OF user/operational wallets
            in the selected period. Shown first by default. */}
        {!simpleMode && (
          <WalletMovementSummary rows={rows} includeAdjustments={includeAdjustments} period={period} />
        )}

        {/* Plain-English summary — one friendly sentence anyone can read.
            Shown only in Simple mode so non-tech / non-accounting users get
            the headline without scrolling through tables and matrices. */}
        {/* ─── Glance hero (Simple mode only) ─────────────────────
            For people who don't want to read details: one giant
            emoji verdict, one giant headline number, and three
            huge tap-targets to either jump to the relevant
            transactions or share the summary. Pure presentation —
            uses existing handlers (openPageDrill, handleShareSummary). */}
        {simpleMode && (
          (() => {
            const quiet = totals.cashIn === 0 && totals.cashOut === 0;
            const verdictEmoji = quiet ? '💤' : totals.net > 0 ? '🟢' : totals.net < 0 ? '🔴' : '⚖️';
            const verdictWord = quiet ? 'Quiet' : totals.net > 0 ? 'Gained' : totals.net < 0 ? 'Spent more' : 'Balanced';
            const headlineNumber = quiet
              ? '—'
              : totals.net === 0
                ? formatUGX(0)
                : `${totals.net > 0 ? '+' : '−'}${formatUGX(Math.abs(totals.net))}`;
            const verdictColor =
              quiet ? 'text-muted-foreground'
              : totals.net > 0 ? 'text-success'
              : totals.net < 0 ? 'text-destructive'
              : 'text-foreground';
            const verdictBg =
              quiet ? 'bg-muted/40 border-border'
              : totals.net > 0 ? 'bg-success/10 border-success/40'
              : totals.net < 0 ? 'bg-destructive/10 border-destructive/40'
              : 'bg-muted/40 border-border';
            return (
              <div id="cm-glance" className={cn('scroll-mt-24 rounded-2xl border-2 p-4 sm:p-5 space-y-4', verdictBg)}>
                <div className="text-center space-y-1">
                  <div className="text-6xl sm:text-7xl leading-none" aria-hidden="true">{verdictEmoji}</div>
                  <div className={cn('text-xs sm:text-sm uppercase tracking-widest font-semibold', verdictColor)}>
                    {verdictWord} · {PERIODS.find(p => p.value === period)?.label || period}
                  </div>
                  <div className={cn('font-mono font-bold text-3xl sm:text-5xl break-all', verdictColor)}>
                    {headlineNumber}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => openPageDrill('cash_in')}
                    className="rounded-xl border-2 border-success/40 bg-success/10 hover:bg-success/15 active:scale-[0.98] transition px-2 py-3 min-h-[88px] flex flex-col items-center justify-center gap-1"
                    aria-label="See money coming in"
                  >
                    <span className="text-3xl leading-none" aria-hidden="true">💰</span>
                    <span className="text-[11px] sm:text-xs font-semibold text-foreground">Money in</span>
                    <span className="text-[10px] font-mono text-success truncate max-w-full">{formatUGX(totals.cashIn)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openPageDrill('cash_out')}
                    className="rounded-xl border-2 border-destructive/40 bg-destructive/10 hover:bg-destructive/15 active:scale-[0.98] transition px-2 py-3 min-h-[88px] flex flex-col items-center justify-center gap-1"
                    aria-label="See money going out"
                  >
                    <span className="text-3xl leading-none" aria-hidden="true">💸</span>
                    <span className="text-[11px] sm:text-xs font-semibold text-foreground">Money out</span>
                    <span className="text-[10px] font-mono text-destructive truncate max-w-full">{formatUGX(totals.cashOut)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareSummary}
                    className="rounded-xl border-2 border-primary/40 bg-primary/10 hover:bg-primary/15 active:scale-[0.98] transition px-2 py-3 min-h-[88px] flex flex-col items-center justify-center gap-1"
                    aria-label="Share this summary"
                  >
                    <span className="text-3xl leading-none" aria-hidden="true">📤</span>
                    <span className="text-[11px] sm:text-xs font-semibold text-foreground">Share</span>
                    <span className="text-[10px] text-muted-foreground">image · PDF</span>
                  </button>
                </div>
                <p className="text-[11px] text-center text-muted-foreground">
                  Tap a tile to see what's behind the number.
                </p>
              </div>
            );
          })()
        )}
        {/* ─── Tap-to-drill shortcuts (Simple mode) ───────────────
            Two big rows directly under the Glance hero that jump
            straight to the filtered transaction list (Money in or
            Money out) without scrolling. Shows live counts so users
            see how many entries they'll land on. */}
        {simpleMode && (() => {
          const inCount = rows.reduce((n, r) => n + (r.direction === 'cash_in' ? 1 : 0), 0);
          const outCount = rows.reduce((n, r) => n + (r.direction === 'cash_out' ? 1 : 0), 0);
          return (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
                Tap to drill down
              </div>
              <button
                type="button"
                onClick={() => openPageDrill('cash_in')}
                className="w-full flex items-center gap-3 rounded-xl border-2 border-success/40 bg-success/5 hover:bg-success/10 active:scale-[0.99] transition px-3 py-3 min-h-[64px] text-left"
                aria-label={`See every Money-In transaction (${inCount.toLocaleString()})`}
              >
                <span className="text-2xl shrink-0" aria-hidden="true">💰</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">See every Money-In transaction</div>
                  <div className="text-[11px] text-muted-foreground">
                    {inCount.toLocaleString()} {inCount === 1 ? 'entry' : 'entries'} · jumps straight to the list
                  </div>
                </div>
                <span className="text-success text-lg shrink-0" aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                onClick={() => openPageDrill('cash_out')}
                className="w-full flex items-center gap-3 rounded-xl border-2 border-destructive/40 bg-destructive/5 hover:bg-destructive/10 active:scale-[0.99] transition px-3 py-3 min-h-[64px] text-left"
                aria-label={`See every Money-Out transaction (${outCount.toLocaleString()})`}
              >
                <span className="text-2xl shrink-0" aria-hidden="true">💸</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">See every Money-Out transaction</div>
                  <div className="text-[11px] text-muted-foreground">
                    {outCount.toLocaleString()} {outCount === 1 ? 'entry' : 'entries'} · jumps straight to the list
                  </div>
                </div>
                <span className="text-destructive text-lg shrink-0" aria-hidden="true">→</span>
              </button>
            </div>
          );
        })()}
        {simpleMode && (
          <div className={cn(
            'rounded-lg border-2 p-3 sm:p-4 space-y-2',
            totals.net >= 0 ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5'
          )}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              In plain English · {PERIODS.find(p => p.value === period)?.label || period}
            </div>
            <p className="text-sm sm:text-base leading-relaxed">
              {totals.cashIn === 0 && totals.cashOut === 0 ? (
                <>No money moved during this period.</>
              ) : (
                <>
                  <span className="font-semibold text-success">{formatUGX(totals.cashIn)}</span>
                  {' came '}<span className="font-semibold">IN</span>{' and '}
                  <span className="font-semibold text-destructive">{formatUGX(totals.cashOut)}</span>
                  {' went '}<span className="font-semibold">OUT</span>{'. '}
                  {totals.net > 0 ? (
                    <>Welile <span className="font-semibold text-success">gained {formatUGX(totals.net)}</span> overall.</>
                  ) : totals.net < 0 ? (
                    <>Welile <span className="font-semibold text-destructive">spent {formatUGX(Math.abs(totals.net))}</span> more than it received.</>
                  ) : (
                    <>Money in and out balanced exactly.</>
                  )}
                </>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Tap <span className="font-semibold">Detailed view</span> at the top for the full breakdown, tables, and downloads.
            </p>
          </div>
        )}

        {/* Totals strip (full ledger scope: platform + wallet) */}
        {/* ─── Applied filters chips ──────────────────────────────
            At-a-glance summary of what the totals below are filtered
            by (Date period, Direction, Party). The Date chip is
            informational; Direction & Party chips are clearable with
            the ✕. Purely presentational — read from existing state. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-0.5">
            Showing:
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground"
            title={`Date period: ${rangeLabel}`}
          >
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Date:</span>
            <span className="truncate max-w-[180px] sm:max-w-none">{PERIODS.find(p => p.value === period)?.label || period}</span>
          </span>
          {directionQuickFilter !== 'all' ? (
            <button
              type="button"
              onClick={() => setDirectionQuickFilter('all')}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-primary/15"
              title="Clear direction filter"
            >
              {directionQuickFilter === 'cash_in' ? (
                <ArrowUpRight className="h-3 w-3 text-success" />
              ) : directionQuickFilter === 'cash_out' ? (
                <ArrowDownRight className="h-3 w-3 text-destructive" />
              ) : (
                <Filter className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="text-muted-foreground">Direction:</span>
              <span>{directionLabel}</span>
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-transparent px-2.5 py-1 text-[11px] text-muted-foreground">
              <Filter className="h-3 w-3" />
              <span>Direction:</span>
              <span>All</span>
            </span>
          )}
          {partyQuickFilter ? (
            <button
              type="button"
              onClick={() => setPartyQuickFilter(null)}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-primary/15"
              title="Clear party filter"
            >
              <Users className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Party:</span>
              <span className="truncate max-w-[140px]">{partyLabel}</span>
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-transparent px-2.5 py-1 text-[11px] text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>Party:</span>
              <span>Anyone</span>
            </span>
          )}
          {(directionQuickFilter !== 'all' || partyQuickFilter) && (
            <button
              type="button"
              onClick={() => { setDirectionQuickFilter('all'); setPartyQuickFilter(null); }}
              className="ml-auto text-[10px] font-semibold uppercase text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              title="Clear Direction and Party filters"
            >
              Clear filters
            </button>
          )}
        </div>

        <div id="cm-totals" className="scroll-mt-24 grid grid-cols-3 gap-1.5 sm:gap-2">
          <div className="rounded-lg border border-border bg-success/5 p-2 sm:p-3">
            <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><ArrowUpRight className="h-3 w-3 text-success" /> Money In</div>
            <div className="font-mono font-semibold text-success text-xs sm:text-base break-all">{formatUGX(totals.cashIn)}</div>
            <button
              type="button"
              onClick={() => openPageDrill('cash_in')}
              className="mt-1 text-[10px] sm:text-[11px] font-medium text-success/90 hover:text-success underline-offset-2 hover:underline inline-flex items-center gap-0.5"
              aria-label="See where Money In comes from — open the transaction list filtered to cash in"
            >
              See where this comes from →
            </button>
          </div>
          <div className="rounded-lg border border-border bg-destructive/5 p-2 sm:p-3">
            <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><ArrowDownRight className="h-3 w-3 text-destructive" /> Money Out</div>
            <div className="font-mono font-semibold text-destructive text-xs sm:text-base break-all">{formatUGX(totals.cashOut)}</div>
            <button
              type="button"
              onClick={() => openPageDrill('cash_out')}
              className="mt-1 text-[10px] sm:text-[11px] font-medium text-destructive/90 hover:text-destructive underline-offset-2 hover:underline inline-flex items-center gap-0.5"
              aria-label="See where Money Out comes from — open the transaction list filtered to cash out"
            >
              See where this comes from →
            </button>
          </div>
          <div className={cn('rounded-lg border border-border p-2 sm:p-3', totals.net >= 0 ? 'bg-success/5' : 'bg-destructive/5')}>
            <div className="text-[10px] uppercase text-muted-foreground">Difference</div>
            <div className={cn('font-mono font-semibold text-xs sm:text-base break-all', totals.net >= 0 ? 'text-success' : 'text-destructive')}>
              {totals.net >= 0 ? '+' : ''}{formatUGX(totals.net)}
            </div>
            <button
              type="button"
              onClick={() => openPageDrill('all')}
              className={cn(
                'mt-1 text-[10px] sm:text-[11px] font-medium underline-offset-2 hover:underline inline-flex items-center gap-0.5',
                totals.net >= 0 ? 'text-success/90 hover:text-success' : 'text-destructive/90 hover:text-destructive',
              )}
              aria-label="See where the Difference comes from — open the full transaction list"
            >
              See where this comes from →
            </button>
          </div>
        </div>

        {/* ─── Top Categories summary ───────────────────────────
            Shows the biggest categories for the current filters.
            Tapping a chip toggles `categoryQuickFilter`, filtering
            the Categories table below, and smooth-scrolls to it.
            Pure presentation — no ledger writes. */}
        {topCategoriesSummary.top.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs sm:text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
                <span aria-hidden>🏷️</span> Top categories
                <span className="text-[10px] font-normal text-muted-foreground">
                  · {topCategoriesSummary.categoryCount} total
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  role="group"
                  aria-label="Number of top categories to show"
                  className="inline-flex rounded-md border border-border overflow-hidden"
                >
                  {[5, 10].map(n => {
                    const active = topCategoriesLimit === n;
                    const disabled = n === 10 && topCategoriesSummary.categoryCount <= 5;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setTopCategoriesLimit(n as 5 | 10)}
                        disabled={disabled}
                        aria-pressed={active}
                        className={cn(
                          'px-2 py-0.5 text-[11px] font-medium transition-colors',
                          active ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted',
                          disabled && 'opacity-40 cursor-not-allowed',
                        )}
                        title={disabled ? `Only ${topCategoriesSummary.categoryCount} categories available` : `Show top ${n}`}
                      >
                        Top {n}
                      </button>
                    );
                  })}
                </div>
                {categoryQuickFilter && (
                <button
                  type="button"
                  onClick={() => setCategoryQuickFilter(null)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1"
                  aria-label="Clear category filter"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topCategoriesSummary.top.map(c => {
                const active = categoryQuickFilter === c.category;
                return (
                  <button
                    key={c.category}
                    type="button"
                    onClick={() => {
                      setCategoryQuickFilter(f => f === c.category ? null : c.category);
                      requestAnimationFrame(() => {
                        document.getElementById('cm-categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      });
                    }}
                    aria-pressed={active}
                    title={`${prettifyCategory(c.category)} · ${c.count} entr${c.count === 1 ? 'y' : 'ies'} · tap to filter the table`}
                    className={cn(
                      'group flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-all active:scale-[0.98]',
                      'min-w-[120px] max-w-full',
                      active
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/40',
                    )}
                  >
                    <span className="text-[11px] font-medium truncate max-w-full">
                      {prettifyCategory(c.category)}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-foreground">
                      {formatUGX(c.total)}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      {(c.share * 100).toFixed(0)}% · {c.count} entr{c.count === 1 ? 'y' : 'ies'}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Tap a category to filter the table below.
            </div>
          </div>
        )}

        {/* ─── Share / Download summary ───────────────────────────
            Exports the same plain-English summary (period, In, Out,
            Difference, any anomalies) as a portrait image, a PDF, or
            via the native share sheet on supported devices. Pure
            client-side render — never touches the ledger. */}
        <div className="rounded-xl border border-border bg-muted/30 p-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mr-1">
            <Share2 className="h-3.5 w-3.5" /> Share / save this summary
          </span>
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-9 gap-1.5"
            onClick={handleShareSummary}
            title="Share via your phone's share sheet (or save as image if not supported)"
          >
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={handleDownloadSummaryPng}
            title="Save the summary as a PNG image"
          >
            <ImageIcon className="h-3.5 w-3.5" /> Save image
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={handleDownloadSummaryPdf}
            title="Download the summary as a PDF"
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>

        {/* ─── Anomaly alerts (plain language) ───────────────────
            Surfaces unusual spikes and quiet gaps in the selected
            period so non-accounting readers notice them at a glance.
            Read-only — derived from `rows` in `anomalyAlerts`. */}
        {anomalyAlerts.length > 0 && (
          <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-sm font-semibold text-foreground">
                Heads up — {anomalyAlerts.length} unusual {anomalyAlerts.length === 1 ? 'pattern' : 'patterns'} in this period
              </div>
            </div>
            <ul className="space-y-1.5">
              {anomalyAlerts.map((a, idx) => (
                <li
                  key={`${a.kind}-${a.date}-${idx}`}
                  className="flex items-start gap-2 rounded-lg bg-card border border-border px-2.5 py-2"
                >
                  <div className={cn(
                    'mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0',
                    a.kind === 'spike' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground',
                  )}>
                    {a.kind === 'spike' ? <TrendingUp className="h-3.5 w-3.5" /> : <MinusCircle className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] sm:text-sm font-semibold leading-tight">{a.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-snug">{a.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground px-0.5">
              "Unusual" means a day that's far above the period's typical daily flow, or a quiet day sandwiched between busy ones. This is a hint, not an error.
            </p>
          </div>
        )}

        {/* ─── Tap to see details ──────────────────────────────────
            A simple, mobile-friendly list of individual cash-in /
            cash-out transactions for the current filters. Each row
            shows date, amount, category and party — no jargon, no
            tables, just a tappable list. Read-only view derived from
            the same `rows` everything else on the page uses. */}
        {(() => {
          const pageDrillRows = rows
            .filter(r => {
              if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) return false;
              if (scopeFilter !== 'all' && r.ledger_scope !== scopeFilter) return false;
              if (partyQuickFilter && r.user_id !== partyQuickFilter) return false;
              if (directionQuickFilter === 'cash_in' && r.direction !== 'cash_in') return false;
              if (directionQuickFilter === 'cash_out' && r.direction !== 'cash_out') return false;
              return true;
            })
            .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
          const visible = pageDrillRows.slice(0, pageDrillVisible);
          return (
            <Collapsible
              open={pageDrillOpen}
              onOpenChange={(o) => { setPageDrillOpen(o); if (o) setPageDrillVisible(25); }}
            >
              <div id="cm-transactions" ref={pageDrillRef} className="scroll-mt-24" />
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 px-3 py-3 text-left transition-colors min-h-[56px]"
                  aria-label="Tap to see every transaction"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Filter className="h-4 w-4 text-primary" />
                    Tap to see details
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {pageDrillRows.length.toLocaleString()} {pageDrillRows.length === 1 ? 'transaction' : 'transactions'}
                    </Badge>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                {pageDrillRows.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
                    No transactions match the current filters.
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                      {visible.map(r => {
                        const isIn = r.direction === 'cash_in';
                        const name = r.user_id
                          ? (partyNames[r.user_id] || `${r.user_id.slice(0, 8)}…`)
                          : (r.linked_party ? prettifyCategory(r.linked_party) : '—');
                        return (
                          <li key={r.id} className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors">
                            <div className={cn(
                              'mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0',
                              isIn ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
                            )}>
                              {isIn ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <div className="text-sm font-semibold truncate">{name}</div>
                                <div className={cn(
                                  'font-mono text-sm font-semibold whitespace-nowrap',
                                  isIn ? 'text-success' : 'text-destructive',
                                )}>
                                  {isIn ? '+' : '−'}{formatUGX(Number(r.amount) || 0)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                                <span>{format(new Date(r.transaction_date), 'dd MMM yyyy · HH:mm')}</span>
                                <span>·</span>
                                <span className="truncate">{prettifyCategory(r.category)}</span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {pageDrillRows.length > visible.length ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 h-10"
                        onClick={() => setPageDrillVisible(n => n + 50)}
                      >
                        Show 50 more · {(pageDrillRows.length - visible.length).toLocaleString()} left
                      </Button>
                    ) : (
                      <div className="text-[10px] text-muted-foreground text-center mt-2">
                        End of list · {pageDrillRows.length.toLocaleString()} {pageDrillRows.length === 1 ? 'transaction' : 'transactions'} shown
                      </div>
                    )}
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })()}

        {/* "What this number means" — plain-language help that explains the
            three headline numbers without accounting jargon. Collapsible so it
            doesn't push real data down the page on small screens. */}
        <Collapsible defaultOpen={simpleMode}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 px-3 py-2 text-left transition-colors"
              aria-label="What do these numbers mean?"
            >
              <span className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-foreground">
                <Info className="h-3.5 w-3.5 text-primary" />
                What do these numbers mean?
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform data-[state=open]:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-md border border-success/30 bg-success/5 p-2.5 space-y-1">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-success">
                  <ArrowUpRight className="h-3 w-3" /> Money In
                </div>
                <p className="text-[11px] leading-snug text-foreground/90">
                  Cash that <span className="font-semibold">came into</span> Welile during this period — like deposits from users, rent collected by agents, and money landlords or partners sent us.
                </p>
                <p className="text-[10px] text-muted-foreground italic">
                  Think of it as: <span className="font-semibold">"What we received."</span>
                </p>
              </div>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 space-y-1">
                <div className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
                  <ArrowDownRight className="h-3 w-3" /> Money Out
                </div>
                <p className="text-[11px] leading-snug text-foreground/90">
                  Cash that <span className="font-semibold">left</span> Welile during this period — like withdrawals to users, payouts to landlords, partner commissions, and supplier payments.
                </p>
                <p className="text-[10px] text-muted-foreground italic">
                  Think of it as: <span className="font-semibold">"What we paid out."</span>
                </p>
              </div>
              <div className={cn(
                'rounded-md border p-2.5 space-y-1',
                totals.net >= 0 ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'
              )}>
                <div className={cn('flex items-center gap-1 text-[11px] font-semibold', totals.net >= 0 ? 'text-success' : 'text-destructive')}>
                  = Difference
                </div>
                <p className="text-[11px] leading-snug text-foreground/90">
                  Money In <span className="font-mono">−</span> Money Out. A <span className="text-success font-semibold">+ plus</span> means Welile gained money. A <span className="text-destructive font-semibold">− minus</span> means we paid out more than we received.
                </p>
                <p className="text-[10px] text-muted-foreground italic">
                  Think of it as: <span className="font-semibold">"Did we end up richer or lighter?"</span>
                </p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 px-0.5">
              All amounts are in <span className="font-semibold">UGX</span> and only count the period selected above ({PERIODS.find(p => p.value === period)?.label || period}). Transfers between Welile's own wallets cancel out and don't inflate these numbers.
            </p>
          </CollapsibleContent>
        </Collapsible>

        {/* Quick filter chips — power-user shortcuts, hidden in Simple view. */}
        {!simpleMode && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> Quick find
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            <Button
              size="sm"
              variant={directionQuickFilter === 'cash_in' ? 'default' : 'outline'}
              className="text-xs h-8 shrink-0 snap-start"
              onClick={() => setDirectionQuickFilter(f => f === 'cash_in' ? 'all' : 'cash_in')}
            >
              <ArrowUpRight className="h-3 w-3 mr-1" /> Money In
            </Button>
            <Button
              size="sm"
              variant={directionQuickFilter === 'cash_out' ? 'default' : 'outline'}
              className="text-xs h-8 shrink-0 snap-start"
              onClick={() => setDirectionQuickFilter(f => f === 'cash_out' ? 'all' : 'cash_out')}
            >
              <ArrowDownRight className="h-3 w-3 mr-1" /> Money Out
            </Button>
            <Button
              size="sm"
              variant={directionQuickFilter === 'net_positive' ? 'default' : 'outline'}
              className="text-xs h-8 shrink-0 snap-start"
              onClick={() => setDirectionQuickFilter(f => f === 'net_positive' ? 'all' : 'net_positive')}
            >
              Difference +
            </Button>
            <Button
              size="sm"
              variant={directionQuickFilter === 'net_negative' ? 'default' : 'outline'}
              className="text-xs h-8 shrink-0 snap-start"
              onClick={() => setDirectionQuickFilter(f => f === 'net_negative' ? 'all' : 'net_negative')}
            >
              Difference −
            </Button>
            {topCategoryChips.map(cat => (
              <Button
                key={cat}
                size="sm"
                variant={categoryQuickFilter === cat ? 'default' : 'outline'}
                className="text-xs h-8 shrink-0 snap-start"
                onClick={() => setCategoryQuickFilter(f => f === cat ? null : cat)}
              >
                {prettifyCategory(cat)}
              </Button>
            ))}
            {(directionQuickFilter !== 'all' || categoryQuickFilter) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-8 shrink-0 snap-start text-muted-foreground"
                onClick={() => { setDirectionQuickFilter('all'); setCategoryQuickFilter(null); }}
              >
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          {filteredAggregates.length !== aggregates.length && (
            <div className="text-[10px] text-muted-foreground px-1">
              Showing {filteredAggregates.length} of {aggregates.length} types
            </div>
          )}
        </div>
        )}

        {/* Capital Inflows callout — new money into the company. Hidden in Simple view. */}
        {!simpleMode && (
        <div id="cm-inflows" className="scroll-mt-24 rounded-lg border-2 border-primary/30 bg-primary/5 p-2.5 sm:p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-primary" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New money coming into Welile</div>
                <div className="font-mono text-lg font-bold text-primary break-all">{formatUGX(capitalInflow.total)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {capitalInflow.selected.length} type{capitalInflow.selected.length === 1 ? '' : 's'} ·
                  {' '}{capitalInflow.entries.toLocaleString()} transaction{capitalInflow.entries === 1 ? '' : 's'} · {rangeLabel} ·
                  {' '}grouped {(GRANULARITIES.find(g => g.value === granularity)?.label || granularity).toLowerCase()}
                </div>
                {includeWalletLegs && (
                  <div className="text-[10px] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-muted-foreground">Matching wallet activity:</span>
                    <span><span className="text-muted-foreground">in</span> <span className="font-mono text-emerald-500">+{formatUGX(capitalInflow.walletInTotal)}</span></span>
                    <span><span className="text-muted-foreground">out</span> <span className="font-mono text-rose-500">−{formatUGX(capitalInflow.walletOutTotal)}</span></span>
                    <span><span className="text-muted-foreground">net</span> <span className={cn('font-mono', capitalInflow.walletNetTotal >= 0 ? 'text-emerald-500' : 'text-rose-500')}>{capitalInflow.walletNetTotal >= 0 ? '+' : '−'}{formatUGX(Math.abs(capitalInflow.walletNetTotal))}</span></span>
                    <span className="text-muted-foreground">· {capitalInflow.walletEntries.toLocaleString()} moves</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <label
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 h-7 text-[11px] cursor-pointer transition-colors',
                  includeWalletLegs ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border bg-background hover:bg-muted/50',
                )}
                title="Off: only Welile's own books. On: also show what changed in agent/partner wallets at the same time."
              >
                <Checkbox
                  checked={includeWalletLegs}
                  onCheckedChange={(v) => setIncludeWalletLegs(!!v)}
                  className="h-3.5 w-3.5"
                />
                <span>Show wallet matches</span>
              </label>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 gap-1"
                disabled={!capitalInflow.selected.length}
                onClick={() => {
                  if (!canViewLedgerDetail) { toast.error('You do not have permission to export ledger data'); return; }
                  if (!capitalInflow.selected.length) { toast.error('No categories selected'); return; }
                  const headers = ['Category', 'Description', 'Cash In (UGX)', 'Entries', ...capitalInflow.bucketLabels];
                  const data = capitalInflow.selected.map(c => [
                    prettifyCategory(c.category),
                    CATEGORY_DESCRIPTIONS[c.category] || '',
                    c.total,
                    c.count,
                    ...capitalInflow.bucketLabels.map(b => c.buckets[b] || 0),
                  ]);
                  // Totals row
                  data.push([
                    'TOTAL',
                    `${capitalInflow.selected.length} categories · ${rangeLabel}`,
                    capitalInflow.total,
                    capitalInflow.entries,
                    ...capitalInflow.bucketLabels.map(b => capitalInflow.bucketTotals[b] || 0),
                  ]);
                  downloadCsv(
                    `welile-capital-inflows-${period}-${granularity}-${format(new Date(), 'yyyy-MM-dd')}.csv`,
                    headers,
                    data,
                  );
                  toast.success('Capital Inflows CSV downloaded');
                }}
                title="Download the new-money-in totals as a spreadsheet"
              >
                <FileSpreadsheet className="h-3 w-3" />
                Download
              </Button>
              <Collapsible open={capitalPickerOpen} onOpenChange={setCapitalPickerOpen}>
                <CollapsibleTrigger asChild>
                  <Button size="sm" variant="outline" className="text-xs h-7">
                    {capitalPickerOpen ? 'Hide' : 'Pick types'}
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
          </div>

          {/* Selected category chips with per-category totals */}
          {capitalInflow.selected.length > 0 && (
            <TooltipProvider delayDuration={150}>
              <div className="flex flex-wrap gap-1.5">
                {capitalInflow.selected.map(c => (
                  <Tooltip key={c.category}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setDrill({
                          category: c.category,
                          scope: 'platform',
                          bucket: null,
                          direction: 'cash_in',
                          dateFrom: capitalFrom || undefined,
                          dateTo: capitalTo || undefined,
                        })}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background hover:bg-primary/10 hover:border-primary/40 px-2 py-0.5 text-[11px] font-normal transition-colors"
                      >
                        <span className="font-medium">{prettifyCategory(c.category)}</span>
                        <span className="font-mono text-primary">{formatUGX(c.total)}</span>
                        <span className="text-muted-foreground">({c.count})</span>
                        {includeWalletLegs && (c.walletIn > 0 || c.walletOut > 0) && (
                          <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-muted/60 px-1 text-[10px]">
                            <span className="text-muted-foreground">w:</span>
                            <span className="font-mono text-emerald-500">+{formatUGX(c.walletIn)}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="font-mono text-rose-500">−{formatUGX(c.walletOut)}</span>
                          </span>
                        )}
                        <Info className="h-3 w-3 text-muted-foreground" />
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" className="bg-popover border-border">
                      <WalletImpactTooltipContent category={c.category} />
                      <div className="mt-2 pt-1 border-t border-border text-[10px] text-muted-foreground">
                        Click to drill into Platform cash_in entries{capitalRangeActive ? ` · ${capitalFrom || '…'} → ${capitalTo || '…'}` : ''}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          )}

          {/* Per-bucket strip — synced to current granularity */}
          {capitalInflow.selected.length > 0 && capitalInflow.bucketLabels.length > 0 && (
            <div className="pt-2 border-t border-primary/20 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>By {(GRANULARITIES.find(g => g.value === granularity)?.label || granularity).toLowerCase()}</span>
                {capitalInflow.peakBucket && (
                  <span>Best day: <span className="text-primary font-mono">{capitalInflow.peakBucket}</span> · {formatUGX(capitalInflow.bucketTotals[capitalInflow.peakBucket] || 0)}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {capitalInflow.bucketLabels.map(b => {
                  const val = capitalInflow.bucketTotals[b] || 0;
                  const isPeak = b === capitalInflow.peakBucket && val > 0;
                  return (
                    <div
                      key={b}
                      className={cn(
                        'rounded border px-1.5 py-0.5 text-[10px] font-mono',
                        val === 0
                          ? 'border-border bg-background text-muted-foreground/60'
                          : isPeak
                            ? 'border-primary/50 bg-primary/15 text-primary font-semibold'
                            : 'border-primary/20 bg-background text-foreground',
                      )}
                      title={`${b}: ${formatUGX(val)}`}
                    >
                      <span className="text-muted-foreground mr-1">{b}</span>
                      {val > 0 ? formatUGX(val) : '·'}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Collapsible open={capitalPickerOpen} onOpenChange={setCapitalPickerOpen}>
            <CollapsibleContent className="space-y-2 pt-2 border-t border-primary/20">
              {/* Date sub-range filter — scopes Capital Inflows totals & drill-downs */}
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-primary/20 bg-background/60 p-2">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</label>
                  <Input
                    type="date"
                    value={capitalFrom}
                    max={capitalTo || undefined}
                    onChange={(e) => setCapitalFrom(e.target.value)}
                    className="h-7 text-[11px] w-[140px]"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</label>
                  <Input
                    type="date"
                    value={capitalTo}
                    min={capitalFrom || undefined}
                    onChange={(e) => setCapitalTo(e.target.value)}
                    className="h-7 text-[11px] w-[140px]"
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] gap-1"
                  disabled={!capitalRangeActive}
                  onClick={() => { setCapitalFrom(''); setCapitalTo(''); }}
                  title="Clear sub-range and use the full loaded period"
                >
                  <X className="h-3 w-3" />
                  Clear
                </Button>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {capitalRangeActive
                    ? <>Filter active · totals & drill-downs scoped to <span className="font-mono text-primary">{capitalFrom || '…'} → {capitalTo || '…'}</span></>
                    : <>No sub-range · using full period ({rangeLabel})</>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Tick the types of money you want to count above. We remember your choice on this device.
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                    onClick={() => setCapitalCategories(new Set(capitalInflow.availableCategories.map(c => c.category)))}>
                    All
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                    onClick={() => setCapitalCategories(new Set())}>None</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] gap-1 border-primary/40 text-primary hover:bg-primary/10"
                    onClick={() => {
                      setCapitalCategories(new Set(CAPITAL_INFLOW_DEFAULT));
                      toast.success('Reset to default categories: ' + CAPITAL_INFLOW_DEFAULT.map(prettifyCategory).join(', '));
                    }}
                    title={`Reset to default selection (${CAPITAL_INFLOW_DEFAULT.map(prettifyCategory).join(' + ')})`}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Reset
                  </Button>
                </div>
              </div>
              {capitalInflow.availableCategories.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No new money came in during this period.</p>
              ) : (
                <TooltipProvider delayDuration={150}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
                    {capitalInflow.availableCategories.map(c => {
                      const checked = capitalCategories.has(c.category);
                      return (
                        <label key={c.category}
                          className={cn(
                            'flex items-center gap-2 rounded border px-2 py-1.5 text-[11px] cursor-pointer',
                            checked ? 'border-primary/40 bg-primary/10' : 'border-border bg-background hover:bg-muted/50',
                          )}>
                          <Checkbox checked={checked} onCheckedChange={(v) => {
                            setCapitalCategories(prev => {
                              const next = new Set(prev);
                              if (v) next.add(c.category); else next.delete(c.category);
                              return next;
                            });
                          }} />
                          <span className="flex-1 truncate">{prettifyCategory(c.category)}</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" onClick={(e) => e.preventDefault()} className="text-muted-foreground hover:text-primary">
                                <Info className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="bg-popover border-border">
                              <WalletImpactTooltipContent category={c.category} />
                            </TooltipContent>
                          </Tooltip>
                          <span className="font-mono text-muted-foreground">{formatUGX(c.total)}</span>
                        </label>
                      );
                    })}
                  </div>
                </TooltipProvider>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
        )}

        {/* Category table — full breakdown, hidden in Simple view. */}
        {!simpleMode && (loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading ledger…
          </div>
        ) : filteredAggregates.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">No money moved in this period.</div>
        ) : (
          <div id="cm-categories" className="scroll-mt-24 border border-border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">What kind of money</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Out</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAggregates.map(a => (
                  <TableRow
                    key={`${a.category}|${a.scope}`}
                    className={cn(canViewLedgerDetail ? 'cursor-pointer hover:bg-muted/60' : 'cursor-default')}
                    onClick={() => {
                      if (!canViewLedgerDetail) { toast.error('Ledger drill-down restricted to finance leadership'); return; }
                      setDrill({ category: a.category, scope: a.scope, bucket: null });
                    }}
                  >
                    <TableCell>
                      <div className="font-medium text-sm">{prettifyCategory(a.category)}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{a.category}</div>
                      {CATEGORY_DESCRIPTIONS[a.category] && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 max-w-md">{CATEGORY_DESCRIPTIONS[a.category]}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px]', SCOPE_BADGE[a.scope])}>
                        {SCOPE_LABEL[a.scope] || a.scope}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-success text-sm">{a.cashIn ? formatUGX(a.cashIn) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-destructive text-sm">{a.cashOut ? `(${formatUGX(a.cashOut)})` : '—'}</TableCell>
                    <TableCell className={cn('text-right font-mono text-sm font-semibold', a.net >= 0 ? 'text-success' : 'text-destructive')}>
                      {a.net >= 0 ? '+' : ''}{formatUGX(a.net)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground hidden sm:table-cell">{a.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}

        {/* Time-series matrix — hidden in Simple view. */}
        {!simpleMode && filteredAggregates.length > 0 && bucketLabels.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">{granularity === 'daily' ? 'Daily' : granularity === 'weekly' ? 'Weekly' : 'Monthly'} difference by type</h4>
            <p className="text-[11px] text-muted-foreground">Money In minus Money Out for each {granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month'}. Swipe sideways to see more.</p>
            <div className="border border-border rounded-lg overflow-auto max-h-[480px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[160px] sticky left-0 bg-background z-20">Type · Where</TableHead>
                    {bucketLabels.map(b => (
                      <TableHead key={b} className="text-right whitespace-nowrap text-[10px]">{b}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAggregates.map(a => (
                    <TableRow key={`ts-${a.category}|${a.scope}`}>
                      <TableCell
                        className={cn('sticky left-0 bg-background z-10', canViewLedgerDetail && 'cursor-pointer hover:text-primary')}
                        onClick={() => {
                          if (!canViewLedgerDetail) { toast.error('Ledger drill-down restricted to finance leadership'); return; }
                          setDrill({ category: a.category, scope: a.scope, bucket: null });
                        }}
                      >
                        <div className="text-xs font-medium">{prettifyCategory(a.category)}</div>
                        <div className="text-[10px] text-muted-foreground">{SCOPE_LABEL[a.scope] || a.scope}</div>
                      </TableCell>
                      {bucketLabels.map(b => {
                        const c = a.buckets[b];
                        const net = (c?.in || 0) - (c?.out || 0);
                        if (!c || (c.in === 0 && c.out === 0)) return <TableCell key={b} className="text-right text-muted-foreground/40 text-xs">·</TableCell>;
                        return (
                          <TableCell
                            key={b}
                            onClick={() => {
                              if (!canViewLedgerDetail) { toast.error('Ledger drill-down restricted to finance leadership'); return; }
                              setDrill({ category: a.category, scope: a.scope, bucket: b });
                            }}
                            className={cn('text-right font-mono text-[11px] whitespace-nowrap', canViewLedgerDetail && 'cursor-pointer hover:bg-primary/10 hover:underline', net >= 0 ? 'text-success' : 'text-destructive')}
                          >
                            {net >= 0 ? '+' : ''}{formatUGX(net)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Drill-down sheet */}
        <Sheet open={!!drill} onOpenChange={(o) => { if (!o) setDrill(null); }}>
          <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-3 sm:p-5">
            {drill && (
              <>
                <SheetHeader className="space-y-1">
                  <SheetTitle className="text-base flex items-center gap-2 flex-wrap">
                    {prettifyCategory(drill.category)}
                    <Badge variant="outline" className={cn('text-[10px]', SCOPE_BADGE[drill.scope])}>
                      {SCOPE_LABEL[drill.scope] || drill.scope}
                    </Badge>
                    {drill.bucket && <Badge variant="secondary" className="text-[10px]">{drill.bucket}</Badge>}
                  </SheetTitle>
                  <SheetDescription className="text-xs">
                    {CATEGORY_DESCRIPTIONS[drill.category] || 'Every transaction of this type, one by one.'}
                  </SheetDescription>
                </SheetHeader>

                {/* Summary */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-4">
                  {(() => {
                    const cIn  = filteredDrillRows.filter(r => r.direction === 'cash_in').reduce((s, r) => s + (Number(r.amount) || 0), 0);
                    const cOut = filteredDrillRows.filter(r => r.direction === 'cash_out').reduce((s, r) => s + (Number(r.amount) || 0), 0);
                    const net  = cIn - cOut;
                    return (
                      <>
                        <div className="rounded border border-border bg-success/5 p-2">
                          <div className="text-[10px] uppercase text-muted-foreground">In</div>
                          <div className="font-mono text-success text-xs sm:text-sm font-semibold break-all">{formatUGX(cIn)}</div>
                        </div>
                        <div className="rounded border border-border bg-destructive/5 p-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Out</div>
                          <div className="font-mono text-destructive text-xs sm:text-sm font-semibold break-all">{formatUGX(cOut)}</div>
                        </div>
                        <div className={cn('rounded border border-border p-2', net >= 0 ? 'bg-success/5' : 'bg-destructive/5')}>
                          <div className="text-[10px] uppercase text-muted-foreground">Difference</div>
                          <div className={cn('font-mono text-xs sm:text-sm font-semibold break-all', net >= 0 ? 'text-success' : 'text-destructive')}>
                            {net >= 0 ? '+' : ''}{formatUGX(net)}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-between mt-4 mb-2 gap-2 flex-wrap">
                  <div className="text-[11px] text-muted-foreground">
                    Showing {filteredDrillRows.length.toLocaleString()} of {drillRows.length.toLocaleString()} transaction{drillRows.length === 1 ? '' : 's'}
                    {drillQuery && <span className="ml-1 text-primary">· searching "{drillQuery}"</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-2 text-xs h-7" onClick={handleExportDrill} disabled={filteredDrillRows.length === 0}>
                      <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                    </Button>
                    <Button size="sm" variant="outline" className="gap-2 text-xs h-7" onClick={handleExportDrillPdf} disabled={filteredDrillRows.length === 0}>
                      <FileText className="h-3.5 w-3.5" /> PDF
                    </Button>
                  </div>
                </div>

                <div className="relative mb-2">
                  <Input
                    value={drillQuery}
                    onChange={(e) => setDrillQuery(e.target.value)}
                    placeholder="Search by name, reference, or transaction ID…"
                    className="h-8 text-xs pr-8"
                  />
                  {drillQuery && (
                    <button
                      type="button"
                      onClick={() => setDrillQuery('')}
                      aria-label="Clear search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Date filter chips — narrow drill-down by recent window or custom range */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Date</span>
                  {([
                    { v: 'inherit', label: 'All' },
                    { v: '1d', label: 'Today' },
                    { v: '2d', label: '2d' },
                    { v: '3d', label: '3d' },
                    { v: '5d', label: '5d' },
                    { v: '7d', label: '7d' },
                    { v: '30d', label: '30d' },
                    { v: 'custom', label: 'Custom' },
                  ] as { v: DrillDatePreset; label: string }[]).map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setDrillDatePreset(opt.v)}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        drillDatePreset === opt.v
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-muted'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {drillDatePreset === 'custom' && (
                    <div className="flex items-center gap-1 ml-1">
                      <Input
                        type="date"
                        value={drillCustomFrom}
                        onChange={(e) => setDrillCustomFrom(e.target.value)}
                        className="h-7 text-[11px] w-[130px]"
                      />
                      <span className="text-[11px] text-muted-foreground">→</span>
                      <Input
                        type="date"
                        value={drillCustomTo}
                        onChange={(e) => setDrillCustomTo(e.target.value)}
                        className="h-7 text-[11px] w-[130px]"
                      />
                    </div>
                  )}
                  {drillDatePreset !== 'inherit' && (effectiveDrillRange.from || effectiveDrillRange.to) && (
                    <span className="text-[10px] text-muted-foreground ml-1 font-mono">
                      {effectiveDrillRange.from || '…'} → {effectiveDrillRange.to || '…'}
                    </span>
                  )}
                </div>

                {filteredDrillRows.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    {drillQuery ? 'Nothing matches your search.' : 'No transactions to show.'}
                  </div>
                ) : (
                  <div className="border border-border rounded-lg overflow-x-auto">
                    <div className="block sm:hidden space-y-2">
                      {filteredDrillRows
                        .slice(drillPage * drillPageSize, drillPage * drillPageSize + drillPageSize)
                        .map((r, i) => {
                          const amt = Number(r.amount) || 0;
                          const isIn = r.direction === 'cash_in';
                          const name = r.user_id ? partyNames[r.user_id] : null;
                          const cardKey = r.id || `${r.reference_id}-${i}`;
                          const isExpanded = expandedCards.has(cardKey);
                          return (
                            <button
                              key={cardKey}
                              type="button"
                              onClick={() => {
                                setExpandedCards(prev => {
                                  const next = new Set(prev);
                                  if (next.has(cardKey)) next.delete(cardKey);
                                  else next.add(cardKey);
                                  return next;
                                });
                              }}
                              className="w-full text-left rounded-lg border border-border bg-card p-3 space-y-1.5 active:bg-muted/40 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] text-muted-foreground">{format(new Date(r.transaction_date), 'dd MMM yyyy · HH:mm')}</div>
                                <div className="flex items-center gap-1.5">
                                  <div className={cn('font-mono text-sm font-semibold', isIn ? 'text-success' : 'text-destructive')}>
                                    {isIn ? '+' : '−'}{formatUGX(amt)}
                                  </div>
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                                </div>
                              </div>
                              <div className="font-mono text-[11px]">
                                {r.id && canViewLedgerDetail ? (
                                  <Link
                                    to={`/cfo/ledger/${r.id}`}
                                    target="_blank"
                                    rel="noopener"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-primary hover:underline inline-flex items-center gap-1"
                                  >
                                    <Highlight text={r.reference_id || r.id.slice(0, 8) + '…'} query={debouncedDrillQuery} />
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </Link>
                                ) : (
                                  <Highlight text={r.reference_id || '—'} query={debouncedDrillQuery} />
                                )}
                              </div>
                              <div className="text-[11px]">
                                <Highlight text={name || (r.linked_party ? prettifyCategory(r.linked_party) : '—')} query={debouncedDrillQuery} />
                                {r.user_id && <span className="text-muted-foreground font-mono text-[10px] ml-1">· <Highlight text={r.user_id.slice(0, 8) + '…'} query={debouncedDrillQuery} /></span>}
                              </div>

                              {/* Expanded details */}
                              {isExpanded && (
                                <div className="pt-2 mt-1 border-t border-border space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">Type</span>
                                    <span className="text-[11px] font-medium">{prettifyCategory(r.category)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">Direction</span>
                                    <span className={cn('text-[11px] font-medium inline-flex items-center gap-1', isIn ? 'text-success' : 'text-destructive')}>
                                      {isIn ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                      {isIn ? 'Money In' : 'Money Out'}
                                    </span>
                                  </div>
                                  {r.description && (
                                    <div className="flex items-start gap-2">
                                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0 pt-0.5">Notes</span>
                                      <span className="text-[11px] text-muted-foreground leading-snug"><Highlight text={r.description} query={debouncedDrillQuery} /></span>
                                    </div>
                                  )}
                                  {r.transaction_group_id && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">Group</span>
                                      <span className="text-[10px] font-mono text-muted-foreground">{r.transaction_group_id}</span>
                                    </div>
                                  )}
                                  {r.classification && r.classification !== 'production' && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">Tag</span>
                                      <Badge variant="outline" className="text-[9px]">{r.classification}</Badge>
                                    </div>
                                  )}
                                  {r.source_table && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-16 shrink-0">Source</span>
                                      <span className="text-[10px] text-muted-foreground">
                                        <Highlight text={r.source_table} query={debouncedDrillQuery} />
                                        {r.source_id && <>:<Highlight text={r.source_id} query={debouncedDrillQuery} /></>}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </button>
                          );
                        })}
                    </div>
                    <div className="hidden sm:block">
                      <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Reference</TableHead>
                          <TableHead className="text-xs hidden sm:table-cell">Who</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDrillRows
                          .slice(drillPage * drillPageSize, drillPage * drillPageSize + drillPageSize)
                          .map((r, i) => {
                          const amt = Number(r.amount) || 0;
                          const isIn = r.direction === 'cash_in';
                          const name = r.user_id ? partyNames[r.user_id] : null;
                          return (
                            <TableRow key={r.id || `${r.reference_id}-${i}`} className="group">
                              <TableCell className="text-[11px] whitespace-nowrap align-top">
                                <div>{format(new Date(r.transaction_date), 'dd MMM yyyy')}</div>
                                <div className="text-muted-foreground">{format(new Date(r.transaction_date), 'HH:mm:ss')}</div>
                              </TableCell>
                              <TableCell className="text-[11px] align-top">
                                <div className="font-mono flex items-center gap-1">
                                  {r.id && canViewLedgerDetail ? (
                                    <Link
                                      to={`/cfo/ledger/${r.id}`}
                                      target="_blank"
                                      rel="noopener"
                                      className="text-primary hover:underline inline-flex items-center gap-1"
                                      title="Open ledger entry detail in new tab"
                                    >
                                      <Highlight text={r.reference_id || (r.id.slice(0, 8) + '…')} query={debouncedDrillQuery} />
                                      <ExternalLink className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                                    </Link>
                                  ) : (
                                    <Highlight text={r.reference_id || '—'} query={debouncedDrillQuery} />
                                  )}
                                </div>
                                {r.transaction_group_id && (
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    grp: <Highlight text={r.transaction_group_id} query={debouncedDrillQuery} />
                                  </div>
                                )}
                                {r.source_table && (
                                  <div className="text-[10px] text-muted-foreground">
                                    <Highlight text={r.source_table} query={debouncedDrillQuery} />
                                    {r.source_id && (
                                      <>:<Highlight text={r.source_id} query={debouncedDrillQuery} /></>
                                    )}
                                  </div>
                                )}
                                {r.description && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 max-w-[260px]">
                                    <Highlight text={r.description} query={debouncedDrillQuery} />
                                  </div>
                                )}
                                {r.classification && r.classification !== 'production' && (
                                  <Badge variant="outline" className="text-[9px] mt-0.5">{r.classification}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-[11px] align-top hidden sm:table-cell">
                                <div>
                                  <Highlight
                                    text={name || (r.linked_party ? prettifyCategory(r.linked_party) : '—')}
                                    query={debouncedDrillQuery}
                                  />
                                </div>
                                {r.user_id && (
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    <Highlight text={r.user_id} query={debouncedDrillQuery} />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className={cn('text-right font-mono text-xs whitespace-nowrap align-top font-semibold', isIn ? 'text-success' : 'text-destructive')}>
                                {isIn ? '+' : '−'}{formatUGX(amt)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    </div>
                    {(() => {
                      const total = filteredDrillRows.length;
                      const totalPages = Math.max(1, Math.ceil(total / drillPageSize));
                      const page = Math.min(drillPage, totalPages - 1);
                      const start = page * drillPageSize;
                      const end = Math.min(start + drillPageSize, total);
                      return (
                        <div className="flex items-center justify-between gap-2 py-2 px-3 border-t border-border bg-muted/20">
                          <div className="text-[10px] text-muted-foreground">
                            Showing <span className="font-mono">{(start + 1).toLocaleString()}–{end.toLocaleString()}</span> of <span className="font-mono">{total.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground mr-1">Per page:</span>
                            {[50, 100, 250, 500].map(size => (
                              <Button key={size} size="sm" variant={drillPageSize === size ? 'default' : 'outline'}
                                className="h-6 px-2 text-[10px]" onClick={() => setDrillPageSize(size)}>
                                {size}
                              </Button>
                            ))}
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] ml-2"
                              disabled={page === 0} onClick={() => setDrillPage(0)}>« First</Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                              disabled={page === 0} onClick={() => setDrillPage(p => Math.max(0, p - 1))}>‹ Prev</Button>
                            <span className="text-[10px] text-muted-foreground px-1 font-mono">{page + 1} / {totalPages}</span>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                              disabled={page >= totalPages - 1} onClick={() => setDrillPage(p => Math.min(totalPages - 1, p + 1))}>Next ›</Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                              disabled={page >= totalPages - 1} onClick={() => setDrillPage(totalPages - 1)}>Last »</Button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* ─── Date picker sheet (thumb-friendly) ─── */}
        <Sheet open={dateSheetOpen} onOpenChange={setDateSheetOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Pick a date range</SheetTitle>
              <SheetDescription className="text-xs">
                Currently showing: <span className="font-semibold">{rangeLabel}</span>
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-2 gap-2 pb-4">
              {PERIODS.map(p => {
                const selected = period === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { setPeriod(p.value); setDateSheetOpen(false); }}
                    className={cn(
                      'min-h-[56px] rounded-xl border-2 px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors active:scale-[0.98]',
                      selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60',
                    )}
                  >
                    <span className="text-sm font-semibold">{p.label}</span>
                    {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>

        {/* ─── Direction picker sheet (thumb-friendly) ─── */}
        <Sheet open={directionSheetOpen} onOpenChange={setDirectionSheetOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Show which direction?</SheetTitle>
              <SheetDescription className="text-xs">Narrow the page to money coming in, going out, or both.</SheetDescription>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-1 gap-2 pb-4">
              {([
                { v: 'all',           label: 'In + Out',      hint: 'Everything (default)',                icon: <ArrowLeftRight className="h-5 w-5" /> },
                { v: 'cash_in',       label: 'Money In only', hint: 'Cash that came into Welile',         icon: <ArrowUpRight className="h-5 w-5 text-success" /> },
                { v: 'cash_out',      label: 'Money Out only',hint: 'Cash that left Welile',              icon: <ArrowDownRight className="h-5 w-5 text-destructive" /> },
                { v: 'net_positive',  label: 'Net positive',  hint: 'Categories where In beat Out',       icon: <ArrowUpRight className="h-5 w-5 text-success" /> },
                { v: 'net_negative',  label: 'Net negative',  hint: 'Categories where Out beat In',       icon: <ArrowDownRight className="h-5 w-5 text-destructive" /> },
              ] as const).map(opt => {
                const selected = directionQuickFilter === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => { setDirectionQuickFilter(opt.v); setDirectionSheetOpen(false); }}
                    className={cn(
                      'min-h-[60px] rounded-xl border-2 px-3 py-2 text-left flex items-center gap-3 transition-colors active:scale-[0.98]',
                      selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60',
                    )}
                  >
                    {opt.icon}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground">{opt.hint}</div>
                    </div>
                    {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>

        {/* ─── Party picker sheet (thumb-friendly) ─── */}
        <Sheet open={partySheetOpen} onOpenChange={(o) => { setPartySheetOpen(o); if (!o) setPartySearch(''); }}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Pick a party</SheetTitle>
              <SheetDescription className="text-xs">
                Filter the page to a single counterparty. {topParties.length.toLocaleString()} found in this period.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 sticky top-0 bg-background pb-2 z-10">
              <Input
                value={partySearch}
                onChange={(e) => setPartySearch(e.target.value)}
                placeholder="Search name or user id…"
                className="h-11 text-sm"
                inputMode="search"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 pb-4">
              <button
                type="button"
                onClick={() => { setPartyQuickFilter(null); setPartySheetOpen(false); }}
                className={cn(
                  'min-h-[56px] rounded-xl border-2 px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors active:scale-[0.98]',
                  !partyQuickFilter ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60',
                )}
              >
                <div>
                  <div className="text-sm font-semibold">Everyone</div>
                  <div className="text-[11px] text-muted-foreground">Show all parties (no filter)</div>
                </div>
                {!partyQuickFilter && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
              {topParties
                .filter(p => {
                  const q = partySearch.trim().toLowerCase();
                  if (!q) return true;
                  const name = (partyNames[p.id] || '').toLowerCase();
                  return name.includes(q) || p.id.toLowerCase().includes(q);
                })
                .slice(0, 80)
                .map(p => {
                  const selected = partyQuickFilter === p.id;
                  const name = partyNames[p.id] || `${p.id.slice(0, 8)}…`;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPartyQuickFilter(p.id); setPartySheetOpen(false); }}
                      className={cn(
                        'min-h-[60px] rounded-xl border-2 px-3 py-2 text-left flex items-center gap-2 transition-colors active:scale-[0.98]',
                        selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{name}</div>
                        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                          <span className="text-success">In {formatUGX(p.cashIn)}</span>
                          <span className="text-destructive">Out {formatUGX(p.cashOut)}</span>
                          <span>· {p.count} tx</span>
                        </div>
                      </div>
                      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              {topParties.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-6">
                  No parties in this period. Try a wider date range.
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// WalletMovementSummary
// Minimalist breakdown of money INTO and OUT OF wallets for the
// currently loaded period. Pure read view — never mutates anything.
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Read-only ledger client — safety guard
// ─────────────────────────────────────────────────────────────
// The bucket-flow panel and its prior-period loader MUST be a pure
// read view: they may never change wallet balances, call RPCs, or
// write to ledger / wallet tables. This Proxy wraps the Supabase
// query builder and throws if any mutating method is invoked. It is
// the only Supabase entry point used by WalletMovementSummary.
const WALLET_PANEL_FORBIDDEN_METHODS = new Set([
  'insert', 'update', 'delete', 'upsert', 'rpc',
]);
function readOnlyLedger() {
  const builder = supabase.from('general_ledger');
  const guard: ProxyHandler<typeof builder> = {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && WALLET_PANEL_FORBIDDEN_METHODS.has(prop)) {
        throw new Error(
          `[WalletMovementSummary] forbidden mutation '${prop}' attempted — bucket flow panel must remain read-only`
        );
      }
      const value = Reflect.get(target, prop, receiver);
      // Re-wrap chainable builder methods so the guard survives the chain.
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args);
          return out && typeof out === 'object' && 'then' in (out as object) === false
            ? new Proxy(out as typeof builder, guard)
            : out;
        };
      }
      return value;
    },
  };
  return new Proxy(builder, guard);
}

function WalletMovementSummary({
  rows,
  includeAdjustments,
  period,
}: {
  rows: LedgerRow[];
  includeAdjustments: boolean;
  period: PeriodKey;
}) {
  // Tracks which (direction|category) rows are expanded to reveal underlying
  // ledger transactions for the currently loaded period.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // Net-flow KPI drill-down — opens a sheet listing every wallet-scope
  // cash_in / cash_out transaction that makes up Into − Out for the period.
  const [netDrill, setNetDrill] = useState<null | { direction: 'all' | 'cash_in' | 'cash_out'; from?: number; to?: number; label?: string; bucket?: 'withdrawable' | 'operational_float' | 'landlord_float' }>(null);
  const [netDrillQuery, setNetDrillQuery] = useState('');
  const [netDrillPage, setNetDrillPage] = useState(0);
  const NET_DRILL_PAGE_SIZE = 100;
  useEffect(() => {
    setNetDrillPage(0);
    setNetDrillQuery('');
  }, [netDrill?.direction, netDrill?.from, netDrill?.to, netDrill?.bucket]);

  const summary = useMemo(() => {
    // Clamp to the page's selected period so the totals here can never
    // include rows outside the visible date range (e.g. when the parent
    // over-fetches with only a lower bound).
    const { from, to } = periodRange(period);
    const fromTs = from ? from.getTime() : -Infinity;
    const toTs = to.getTime();
    const inMap = new Map<string, number>();
    const outMap = new Map<string, number>();
    let totalIn = 0;
    let totalOut = 0;
    for (const r of rows) {
      if (r.ledger_scope !== 'wallet') continue;
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
      const t = new Date(r.transaction_date).getTime();
      if (t < fromTs || t > toTs) continue;
      const amt = Number(r.amount) || 0;
      if (r.direction === 'cash_in') {
        inMap.set(r.category, (inMap.get(r.category) || 0) + amt);
        totalIn += amt;
      } else if (r.direction === 'cash_out') {
        outMap.set(r.category, (outMap.get(r.category) || 0) + amt);
        totalOut += amt;
      }
    }
    const sortDesc = (m: Map<string, number>) =>
      Array.from(m.entries())
        .filter(([, amt]) => amt > 0) // hide zero-total rows to keep the panel minimal
        .sort((a, b) => b[1] - a[1]);
    return {
      inRows: sortDesc(inMap),
      outRows: sortDesc(outMap),
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    };
  }, [rows, includeAdjustments, period]);

  // ── Wallet-bucket breakdown ─────────────────────────────────
  // Classifies every wallet-scope ledger row into one of three buckets
  // (Withdrawable, Operational float, Landlord float) and tallies cash_in
  // / cash_out separately. Pure read-only aggregation — does not alter
  // any wallet figures or RPC behavior. The classifier is hoisted so the
  // drill-down filter can reuse it.
  const classifyBucket = useCallback((cat: string): 'withdrawable' | 'operational_float' | 'landlord_float' => {
    const c = (cat || '').toLowerCase();
    if (c.includes('landlord_float') || c.includes('landlord_payout')) return 'landlord_float';
    if (
      c.includes('agent_float') ||
      c.includes('partner_float') ||
      c.includes('float_topup') ||
      c.includes('float_swept') ||
      c.includes('proxy_float') ||
      c === 'rent_payment' ||
      c === 'rent_collection'
    ) return 'operational_float';
    return 'withdrawable';
  }, []);
  const bucketBreakdown = useMemo(() => {
    type BucketKey = 'withdrawable' | 'operational_float' | 'landlord_float';
    const buckets: Record<BucketKey, { in: number; out: number; inCount: number; outCount: number }> = {
      withdrawable: { in: 0, out: 0, inCount: 0, outCount: 0 },
      operational_float: { in: 0, out: 0, inCount: 0, outCount: 0 },
      landlord_float: { in: 0, out: 0, inCount: 0, outCount: 0 },
    };
    // Clamp to the same period window as the rest of the cash-movement page.
    const { from, to } = periodRange(period);
    const fromTs = from ? from.getTime() : -Infinity;
    const toTs = to.getTime();
    let scannedRows = 0;
    let walletScopeRows = 0;
    let adjustmentsSkipped = 0;
    let outOfWindow = 0;
    for (const r of rows) {
      scannedRows++;
      if (r.ledger_scope !== 'wallet') continue;
      walletScopeRows++;
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) {
        adjustmentsSkipped++;
        continue;
      }
      const t = new Date(r.transaction_date).getTime();
      if (t < fromTs || t > toTs) { outOfWindow++; continue; }
      const amt = Number(r.amount) || 0;
      if (amt <= 0) continue;
      const b = classifyBucket(r.category);
      if (r.direction === 'cash_in') { buckets[b].in += amt; buckets[b].inCount++; }
      else if (r.direction === 'cash_out') { buckets[b].out += amt; buckets[b].outCount++; }
    }
    return {
      ...buckets,
      meta: {
        from,
        to,
        scannedRows,
        walletScopeRows,
        adjustmentsSkipped,
        outOfWindow,
      },
    };
  }, [rows, includeAdjustments, classifyBucket, period]);

  // ── Previous-period comparison ──────────────────────────────
  // Computes a same-length window immediately preceding the current period and
  // pulls only wallet-scope ledger rows (small slice). "All time" has no prior
  // window so comparison is skipped.
  const priorRange = useMemo(() => {
    const cur = periodRange(period);
    if (!cur.from) return null;
    const lengthMs = cur.to.getTime() - cur.from.getTime();
    if (lengthMs <= 0) return null;
    const priorTo = cur.from;
    const priorFrom = new Date(cur.from.getTime() - lengthMs);
    return { from: priorFrom, to: priorTo };
  }, [period]);

  const [priorTotals, setPriorTotals] = useState<{
    inByCat: Map<string, number>;
    outByCat: Map<string, number>;
    totalIn: number;
    totalOut: number;
  } | null>(null);
  const [priorLoading, setPriorLoading] = useState(false);

  useEffect(() => {
    if (!priorRange) { setPriorTotals(null); return; }
    let cancelled = false;
    setPriorLoading(true);
    (async () => {
      try {
        const PAGE = 1000;
        let offset = 0;
        const inByCat = new Map<string, number>();
        const outByCat = new Map<string, number>();
        let totalIn = 0;
        let totalOut = 0;
        // Only wallet-scope rows are needed for this comparison.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await readOnlyLedger()
            .select('amount, direction, category, classification')
            .eq('ledger_scope', 'wallet')
            .gte('transaction_date', priorRange.from.toISOString())
            .lt('transaction_date', priorRange.to.toISOString())
            .order('transaction_date', { ascending: true })
            .range(offset, offset + PAGE - 1);
          if (error) throw error;
          const batch = (data || []) as Array<Pick<LedgerRow, 'amount' | 'direction' | 'category' | 'classification'>>;
          for (const r of batch) {
            if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
            const amt = Number(r.amount) || 0;
            if (r.direction === 'cash_in') {
              inByCat.set(r.category, (inByCat.get(r.category) || 0) + amt);
              totalIn += amt;
            } else if (r.direction === 'cash_out') {
              outByCat.set(r.category, (outByCat.get(r.category) || 0) + amt);
              totalOut += amt;
            }
          }
          if (batch.length < PAGE) break;
          offset += PAGE;
          if (offset > 200_000) break;
        }
        if (!cancelled) setPriorTotals({ inByCat, outByCat, totalIn, totalOut });
      } catch (err) {
        console.error('[WalletMovementSummary] prior period load failed', err);
        if (!cancelled) setPriorTotals(null);
      } finally {
        if (!cancelled) setPriorLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [priorRange, includeAdjustments]);

  const formatDelta = (current: number, prior: number | undefined) => {
    if (prior === undefined) return null;
    const diff = current - prior;
    const absLabel = diff === 0
      ? ''
      : `${diff > 0 ? '+' : '−'}${formatUGX(Math.abs(diff))}`;
    if (prior === 0 && diff === 0) return { label: 'no change', absLabel: '', diff, tone: 'muted' as const, arrow: '·' };
    if (prior === 0) return { label: 'new', absLabel, diff, tone: 'pos' as const, arrow: '▲' };
    const pct = (diff / prior) * 100;
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '·';
    const tone = diff > 0 ? 'pos' as const : diff < 0 ? 'neg' as const : 'muted' as const;
    return { label: `${arrow} ${Math.abs(pct).toFixed(0)}%`, absLabel, diff, tone, arrow };
  };
  const toneClass = (tone: 'pos' | 'neg' | 'muted', context: 'in' | 'out') => {
    // For inflows: up is good (success). For outflows: up is bad (destructive).
    if (tone === 'muted') return 'text-muted-foreground';
    if (context === 'in') return tone === 'pos' ? 'text-success' : 'text-destructive';
    return tone === 'pos' ? 'text-destructive' : 'text-success';
  };

  // Pre-bucket the underlying wallet-scope transactions per (direction|category)
  // so expanded rows render instantly without re-scanning the full ledger.
  const txByKey = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const r of rows) {
      if (r.ledger_scope !== 'wallet') continue;
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
      if (r.direction !== 'cash_in' && r.direction !== 'cash_out') continue;
      const key = `${r.direction}|${r.category}`;
      const list = map.get(key);
      if (list) list.push(r); else map.set(key, [r]);
    }
    // Newest first within each bucket.
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
    }
    return map;
  }, [rows, includeAdjustments]);

  const renderCategoryRow = (
    cat: string,
    amt: number,
    direction: 'cash_in' | 'cash_out',
  ) => {
    const key = `${direction}|${cat}`;
    const isOpen = expanded.has(key);
    const txs = txByKey.get(key) || [];
    const amountClass = direction === 'cash_in' ? 'text-success' : 'text-destructive';
    const priorAmt = priorTotals
      ? (direction === 'cash_in' ? priorTotals.inByCat.get(cat) : priorTotals.outByCat.get(cat))
      : undefined;
    const delta = priorTotals ? formatDelta(amt, priorAmt ?? 0) : null;
    const context = direction === 'cash_in' ? 'in' as const : 'out' as const;
    return (
      <div key={key} className="rounded border border-transparent hover:border-border/60">
        <button
          type="button"
          onClick={() => toggleExpanded(key)}
          aria-expanded={isOpen}
          className="w-full flex items-center justify-between gap-2 text-[12px] py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors text-left"
        >
          <span className="flex items-center gap-1 min-w-0">
            {isOpen
              ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
            <span className="text-muted-foreground truncate">{friendlyWalletLabel(cat, direction)}</span>
            <span className="text-[10px] text-muted-foreground/70 shrink-0">· {txs.length}</span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {delta && (
              <span
                className={cn('flex items-center gap-1 text-[10px] font-mono', toneClass(delta.tone, context))}
                title={`Previous period: ${formatUGX(priorAmt ?? 0)}`}
              >
                {delta.absLabel && <span>{delta.absLabel}</span>}
                <span className="opacity-80">{delta.label}</span>
              </span>
            )}
            <span className={cn('font-mono', amountClass)}>{formatUGX(amt)}</span>
          </span>
        </button>
        {isOpen && (
          <div className="mt-1 mb-2 ml-4 border-l border-border/60 pl-2 space-y-1 max-h-72 overflow-y-auto">
            {txs.length === 0 && (
              <div className="text-[11px] text-muted-foreground italic">No transactions.</div>
            )}
            {txs.map((t, i) => (
              <div key={t.id || `${t.transaction_date}-${i}`} className="flex items-start justify-between gap-2 text-[11px]">
                <div className="min-w-0 flex-1">
                  <div className="text-foreground/80">
                    {format(new Date(t.transaction_date), 'dd MMM HH:mm')}
                    {t.linked_party && (
                      <span className="text-muted-foreground"> · {t.linked_party}</span>
                    )}
                  </div>
                  {t.description && (
                    <div className="text-muted-foreground truncate">{t.description}</div>
                  )}
                  {(t.reference_id || t.source_table) && (
                    <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
                      {t.source_table && <span>{t.source_table}</span>}
                      {t.source_table && t.reference_id && <span> · </span>}
                      {t.reference_id && <span>{t.reference_id}</span>}
                    </div>
                  )}
                </div>
                <div className={cn('font-mono shrink-0', amountClass)}>
                  {formatUGX(Number(t.amount) || 0)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const priorWindowLabel = priorRange
    ? `${format(priorRange.from, 'dd MMM')} – ${format(priorRange.to, 'dd MMM')}`
    : null;
  const totalInDelta = priorTotals ? formatDelta(summary.totalIn, priorTotals.totalIn) : null;
  const totalOutDelta = priorTotals ? formatDelta(summary.totalOut, priorTotals.totalOut) : null;

  // ── Net-flow trend buckets ─────────────────────────────────
  // Bucket wallet-scope rows by calendar day / week / month across the
  // currently loaded period, summing net per bucket. Powers the sparkline
  // shown under the Net Flow KPI so trend/momentum is visible at a glance.
  type TrendGroup = 'daily' | 'weekly' | 'monthly';
  const defaultTrendGroup: TrendGroup = useMemo(() => {
    const cur = periodRange(period);
    const days = Math.max(1, differenceInCalendarDays(cur.to, cur.from ?? cur.to) + 1);
    if (days <= 60) return 'daily';
    if (days <= 365) return 'weekly';
    return 'monthly';
  }, [period]);
  const [trendGroup, setTrendGroup] = useState<TrendGroup>(defaultTrendGroup);
  // Keep grouping sensible when the user switches periods.
  useEffect(() => { setTrendGroup(defaultTrendGroup); }, [defaultTrendGroup]);

  const netTrend = useMemo(() => {
    const cur = periodRange(period);
    const earliest = cur.from ?? (rows.length
      ? new Date(Math.min(...rows.map(r => new Date(r.transaction_date).getTime())))
      : new Date());
    const startFor = (d: Date) =>
      trendGroup === 'daily'   ? startOfDay(d)
    : trendGroup === 'weekly'  ? startOfWeek(d, { weekStartsOn: 1 })
    :                            startOfMonth(d);
    const advance = (d: Date) =>
      trendGroup === 'daily'   ? addDays(d, 1)
    : trendGroup === 'weekly'  ? addWeeks(d, 1)
    :                            addMonths(d, 1);
    const labelFor = (start: Date, end: Date) =>
      trendGroup === 'daily'   ? format(start, 'dd MMM yyyy')
    : trendGroup === 'weekly'  ? `${format(start, 'dd MMM')} – ${format(addDays(end, -1), 'dd MMM yyyy')}`
    :                            format(start, 'MMM yyyy');

    // Build the bucket index map: aligned bucket-start → array index.
    const starts: Date[] = [];
    let cursor = startFor(earliest);
    const endTs = cur.to.getTime();
    let guard = 0;
    while (cursor.getTime() <= endTs && guard < 2000) {
      starts.push(cursor);
      cursor = advance(cursor);
      guard++;
    }
    if (starts.length === 0) starts.push(startFor(earliest));
    const nets = new Array<number>(starts.length).fill(0);
    const ins = new Array<number>(starts.length).fill(0);
    const outs = new Array<number>(starts.length).fill(0);
    const labels = starts.map((s, i) => labelFor(s, starts[i + 1] ?? advance(s)));
    const idxFor = (t: number) => {
      // binary search for bucket whose start <= t
      let lo = 0, hi = starts.length - 1, ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (starts[mid].getTime() <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      return ans;
    };
    const minTs = starts[0].getTime();
    for (const r of rows) {
      if (r.ledger_scope !== 'wallet') continue;
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
      if (r.direction !== 'cash_in' && r.direction !== 'cash_out') continue;
      const t = new Date(r.transaction_date).getTime();
      if (t < minTs || t > endTs) continue;
      const amt = Number(r.amount) || 0;
      const i = idxFor(t);
      if (r.direction === 'cash_in') { ins[i] += amt; nets[i] += amt; }
      else { outs[i] += amt; nets[i] -= amt; }
    }
    // Linear-regression slope helper on bucket index → value, for momentum labels
    const slopeOf = (arr: number[]) => {
      const n = arr.length;
      if (n <= 1) return 0;
      const meanX = (n - 1) / 2;
      const meanY = arr.reduce((s, v) => s + v, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (i - meanX) * (arr[i] - meanY);
        den += (i - meanX) ** 2;
      }
      return den === 0 ? 0 : num / den;
    };
    const slope = slopeOf(nets);
    const inSlope = slopeOf(ins);
    const outSlope = slopeOf(outs);
    const totalIn = ins.reduce((s, v) => s + v, 0);
    const totalOut = outs.reduce((s, v) => s + v, 0);
    // Bucket ranges (ms) so clicks on sparkline points can open the
    // drill-down sheet scoped to that specific bucket window.
    const ranges = starts.map((s, i) => ({
      from: s.getTime(),
      to: (starts[i + 1] ? starts[i + 1].getTime() : endTs + 1),
    }));
    return { nets, ins, outs, labels, slope, inSlope, outSlope, totalIn, totalOut, ranges };
  }, [rows, includeAdjustments, period, trendGroup]);

  // ── Exports ─────────────────────────────────────────────────
  const currentRange = useMemo(() => periodRange(period), [period]);
  const periodLabel = PERIODS.find(p => p.value === period)?.label ?? period;
  const rangeLabel = currentRange.from
    ? `${format(currentRange.from, 'dd MMM yyyy')} – ${format(currentRange.to, 'dd MMM yyyy')}`
    : `All time – ${format(currentRange.to, 'dd MMM yyyy')}`;

  // Empty-state guard must run AFTER all hooks above to keep hook order stable
  // across renders (otherwise React throws "Rendered more hooks than during the
  // previous render" when rows transition between empty and non-empty).
  if (summary.inRows.length === 0 && summary.outRows.length === 0) {
    return null;
  }

  const buildExportRows = () => {
    const rowsOut: Array<{ section: string; label: string; amount: number; prior: number; count: number }> = [];
    const pushSection = (
      section: string,
      entries: [string, number][],
      priorMap: Map<string, number> | undefined,
      direction: 'cash_in' | 'cash_out',
    ) => {
      for (const [cat, amt] of entries) {
        rowsOut.push({
          section,
          label: friendlyWalletLabel(cat, direction),
          amount: amt,
          prior: priorMap?.get(cat) ?? 0,
          count: (txByKey.get(`${direction}|${cat}`) || []).length,
        });
      }
    };
    pushSection('Into wallets', summary.inRows, priorTotals?.inByCat, 'cash_in');
    pushSection('Out of wallets', summary.outRows, priorTotals?.outByCat, 'cash_out');
    return rowsOut;
  };

  const handleExportCsv = () => {
    const exportRows = buildExportRows();
    const headers = ['Section', 'Category', 'Amount (UGX)', 'Previous period (UGX)', 'Change %', 'Transactions'];
    const body: (string | number)[][] = exportRows.map(r => {
      const pct = r.prior === 0 ? (r.amount === 0 ? '0' : 'new') : (((r.amount - r.prior) / r.prior) * 100).toFixed(1);
      return [r.section, r.label, Math.round(r.amount), Math.round(r.prior), pct, r.count];
    });
    // Totals
    body.push([]);
    body.push(['Totals', 'Into wallets', Math.round(summary.totalIn), Math.round(priorTotals?.totalIn ?? 0), '', '']);
    body.push(['Totals', 'Out of wallets', Math.round(summary.totalOut), Math.round(priorTotals?.totalOut ?? 0), '', '']);
    body.push(['Totals', 'Net into wallets', Math.round(summary.net), Math.round((priorTotals?.totalIn ?? 0) - (priorTotals?.totalOut ?? 0)), '', '']);
    downloadCsv(`wallet-money-movement-${period}-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`, headers, body);
    toast.success('CSV downloaded');
  };

  const handleExportPdf = () => {
    const exportRows = buildExportRows();
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Wallet Money Movement', 14, 16);
    doc.setFontSize(10);
    doc.text(`Period: ${periodLabel} (${rangeLabel})`, 14, 23);
    if (priorWindowLabel) {
      doc.text(`Compared to previous period: ${priorWindowLabel}`, 14, 29);
    }

    const tableStartY = priorWindowLabel ? 35 : 29;
    autoTable(doc, {
      startY: tableStartY,
      head: [['Section', 'Category', 'Amount (UGX)', 'Previous (UGX)', 'Change %', 'Txns']],
      body: exportRows.map(r => {
        const pct = r.prior === 0 ? (r.amount === 0 ? '0%' : 'new') : `${(((r.amount - r.prior) / r.prior) * 100).toFixed(1)}%`;
        return [
          r.section,
          r.label,
          formatUGX(r.amount),
          formatUGX(r.prior),
          pct,
          String(r.count),
        ];
      }),
      foot: [
        ['Totals', 'Into wallets',  formatUGX(summary.totalIn),  formatUGX(priorTotals?.totalIn ?? 0),  '', ''],
        ['Totals', 'Out of wallets', formatUGX(summary.totalOut), formatUGX(priorTotals?.totalOut ?? 0), '', ''],
        ['Totals', 'Net into wallets', formatUGX(summary.net), formatUGX((priorTotals?.totalIn ?? 0) - (priorTotals?.totalOut ?? 0)), '', ''],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 30, 30] },
      footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    });

    doc.save(`wallet-money-movement-${period}-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`);
    toast.success('PDF downloaded');
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold">Wallet Money Movement</h4>
          <p className="text-[11px] text-muted-foreground">
            How money moved between company funds and user/operational wallets. Tap a row to see transactions.
          </p>
          {priorWindowLabel && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              vs previous period: {priorWindowLabel}
              {priorLoading && <span className="ml-1 italic">· loading…</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px] gap-1"
            onClick={handleExportCsv}
            title="Download summary as CSV"
          >
            <FileSpreadsheet className="h-3 w-3" /> CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px] gap-1"
            onClick={handleExportPdf}
            title="Download summary as PDF"
          >
            <FileText className="h-3 w-3" /> PDF
          </Button>
        </div>
      </div>

      {/* Prominent Net Flow KPI — Into minus Out for the selected period */}
      {(() => {
        const priorNet = priorTotals ? priorTotals.totalIn - priorTotals.totalOut : undefined;
        const netDelta = priorTotals ? formatDelta(summary.net, priorNet ?? 0) : null;
        const positive = summary.net >= 0;
        return (
          <button
            type="button"
            onClick={() => setNetDrill({ direction: 'all' })}
            title="View the exact cash-in and cash-out transactions behind this figure"
            className={cn(
              'w-full text-left rounded-xl border p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap transition-colors hover:bg-opacity-80 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring',
              positive
                ? 'bg-success/10 border-success/30 hover:bg-success/15'
                : 'bg-destructive/10 border-destructive/30 hover:bg-destructive/15'
            )}
          >
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Net flow into wallets
              </div>
              <div className="text-[10px] text-muted-foreground/80">
                Into − Out · {periodLabel} · <span className="underline">click to view transactions</span>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <div className={cn(
                'font-mono font-bold text-2xl sm:text-3xl break-all leading-tight',
                positive ? 'text-success' : 'text-destructive'
              )}>
                {positive ? '+' : ''}{formatUGX(summary.net)}
              </div>
              {netDelta ? (
                <div
                  className={cn('flex items-center gap-1.5 text-[11px] font-mono mt-0.5', toneClass(netDelta.tone, 'in'))}
                  title={`Previous period net: ${formatUGX(priorNet ?? 0)}`}
                >
                  {netDelta.absLabel && <span>{netDelta.absLabel}</span>}
                  <span className="opacity-80">{netDelta.label}</span>
                  <span className="text-muted-foreground/70 ml-1">vs prior</span>
                </div>
              ) : priorWindowLabel ? (
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  {priorLoading ? 'Loading prior period…' : 'No prior data'}
                </div>
              ) : null}
            </div>
          </button>
        );
      })()}

      {/* Net-flow sparkline — momentum across the selected period */}
      {(() => {
        const { nets, ins, outs, labels, slope, inSlope, outSlope, totalIn, totalOut, ranges } = netTrend;
        const hasData = nets.some(v => v !== 0);
        if (!hasData) return null;
        const W = 600;
        const H = 56;
        const PAD = 4;
        const min = Math.min(0, ...nets);
        const max = Math.max(0, ...nets);
        const range = Math.max(1, max - min);
        const xStep = (W - PAD * 2) / Math.max(1, nets.length - 1);
        const yFor = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
        const xFor = (i: number) => PAD + i * xStep;
        const zeroY = yFor(0);
        const points = nets.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
        const areaPoints = `${xFor(0).toFixed(1)},${zeroY.toFixed(1)} ${points} ${xFor(nets.length - 1).toFixed(1)},${zeroY.toFixed(1)}`;
        const last = nets[nets.length - 1];
        const lastColor = last >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
        const slopeTone = slope > 0 ? 'text-success' : slope < 0 ? 'text-destructive' : 'text-muted-foreground';
        const slopeLabel = slope > 0 ? '▲ Improving' : slope < 0 ? '▼ Worsening' : '· Flat';
        return (
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Net flow trend · {periodLabel} · {nets.length} {trendGroup === 'daily' ? 'day' : trendGroup === 'weekly' ? 'wk' : 'mo'}
                {nets.length === 1 ? '' : 's'}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 rounded border border-border bg-muted/40 p-0.5">
                  {(['daily', 'weekly', 'monthly'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setTrendGroup(g)}
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded transition-colors',
                        trendGroup === g
                          ? 'bg-background text-foreground shadow-sm font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {g === 'daily' ? 'D' : g === 'weekly' ? 'W' : 'M'}
                    </button>
                  ))}
                </div>
                <div className={cn('text-[10px] font-mono font-semibold', slopeTone)} title="Linear trend across the period">
                  {slopeLabel}
                </div>
              </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-14 block" aria-label="Net flow sparkline">
              <defs>
                <linearGradient id="netSparkGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Zero baseline */}
              <line x1={PAD} x2={W - PAD} y1={zeroY} y2={zeroY} stroke="hsl(var(--border))" strokeDasharray="2 2" strokeWidth="1" />
              {/* Filled area */}
              <polygon points={areaPoints} fill="url(#netSparkGrad)" />
              {/* Line */}
              <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
              {/* Per-bucket clickable hit areas — opens the drill-down filtered to this bucket */}
              {nets.map((v, i) => {
                const r = ranges[i];
                const openBucket = () => setNetDrill({ direction: 'all', from: r.from, to: r.to, label: labels[i] });
                return (
                  <g key={i} style={{ cursor: 'pointer' }} onClick={openBucket}>
                    {/* Wide invisible hit area for easy tapping */}
                    <rect
                      x={Math.max(0, xFor(i) - xStep / 2)}
                      y={0}
                      width={Math.max(6, xStep)}
                      height={H}
                      fill="transparent"
                    />
                    <circle
                      cx={xFor(i)}
                      cy={yFor(v)}
                      r={1.8}
                      fill={v >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                    />
                    <title>{`${labels[i]}\nNet: ${(v >= 0 ? '+' : '−')}${formatUGX(Math.abs(v))}\nClick to view transactions`}</title>
                  </g>
                );
              })}
              {/* Highlight last point */}
              <circle cx={xFor(nets.length - 1)} cy={yFor(last)} r={2.6} fill={lastColor} stroke="hsl(var(--background))" strokeWidth="1" pointerEvents="none" />
            </svg>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1 font-mono">
              <span>{labels[0]?.split(' – ')[0]}</span>
              <span>{labels[labels.length - 1]?.split(' – ')[1]}</span>
            </div>
            {/* Legend — Into vs Out contribution and momentum */}
            <div className="mt-2 pt-2 border-t border-border/60 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
              {(() => {
                const tone = (s: number, positiveGood: boolean) => {
                  if (s === 0) return 'text-muted-foreground';
                  const good = positiveGood ? s > 0 : s < 0;
                  return good ? 'text-success' : 'text-destructive';
                };
                const arrow = (s: number) => (s > 0 ? '▲' : s < 0 ? '▼' : '·');
                return (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-sm bg-success" aria-hidden />
                      <span className="text-muted-foreground">Into</span>
                      <span className="font-mono text-success">{formatUGX(totalIn)}</span>
                      <span className={cn('font-mono font-semibold', tone(inSlope, true))} title="Inflow momentum">
                        {arrow(inSlope)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-sm bg-destructive" aria-hidden />
                      <span className="text-muted-foreground">Out</span>
                      <span className="font-mono text-destructive">{formatUGX(totalOut)}</span>
                      <span className={cn('font-mono font-semibold', tone(outSlope, false))} title="Outflow momentum (rising outflow is worsening)">
                        {arrow(outSlope)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 ml-auto">
                      <span className="inline-block h-[2px] w-3 rounded bg-primary" aria-hidden />
                      <span className="text-muted-foreground">Net</span>
                      <span className={cn('font-mono font-semibold', (totalIn - totalOut) >= 0 ? 'text-success' : 'text-destructive')}>
                        {(totalIn - totalOut) >= 0 ? '+' : '−'}{formatUGX(Math.abs(totalIn - totalOut))}
                      </span>
                      <span className={cn('font-mono font-semibold', tone(slope, true))}>{arrow(slope)}</span>
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* Wallet bucket flow — Withdrawable / Operational float / Landlord float, in & out */}
      {(() => {
        const items: {
          key: 'withdrawable' | 'operational_float' | 'landlord_float';
          label: string;
          sub: string;
          definition: string;
          inExamples: string;
          outExamples: string;
          in: number;
          out: number;
          inCount: number;
          outCount: number;
          accent: string;
        }[] = [
          {
            key: 'withdrawable',
            label: 'Withdrawable balances',
            sub: 'User-spendable cash — what users can withdraw or spend.',
            definition: 'The wallet bucket users can actually withdraw to MoMo or bank. Routed by Wallet Routing v2 when recipient_type = "user". Includes commissions, Returns paid to supporters, partner commissions, and direct user deposits.',
            inExamples: 'User deposits routed to user, commissions earned, Returns paid to supporters, partner commissions, bonuses, payroll credits.',
            outExamples: 'User withdrawals, wallet-funded rent payments, wallet → platform debits (CFO Direct Debit).',
            in: bucketBreakdown.withdrawable.in,
            out: bucketBreakdown.withdrawable.out,
            inCount: bucketBreakdown.withdrawable.inCount,
            outCount: bucketBreakdown.withdrawable.outCount,
            accent: 'text-primary',
          },
          {
            key: 'operational_float',
            label: 'Operational float',
            sub: 'Company money on agent/partner wallets — never withdrawable.',
            definition: 'The float_balance bucket on agent and partner wallets. This is company capital held to facilitate rent collection and allocation. Routed when recipient_type = "operational_wallet". Cannot be withdrawn by the holder.',
            inExamples: 'Rent collected by agents, partner float top-ups, CFO float deposits routed to operational wallets.',
            outExamples: 'Float allocated to tenants/landlords, partner sweeps back to platform capital, agent float used for rent.',
            in: bucketBreakdown.operational_float.in,
            out: bucketBreakdown.operational_float.out,
            inCount: bucketBreakdown.operational_float.inCount,
            outCount: bucketBreakdown.operational_float.outCount,
            accent: 'text-amber-600',
          },
          {
            key: 'landlord_float',
            label: 'Landlord float',
            sub: 'Capital earmarked for landlord rent payouts.',
            definition: 'A dedicated float used to pay landlords. CFO deposits seed it; landlord payouts draw it down. Tracked separately so landlord-payout coverage is visible without mixing with general operational float.',
            inExamples: 'CFO landlord-float deposits, returns swept into landlord-payout reserves.',
            outExamples: 'Landlord payouts sent against allocated tenants.',
            in: bucketBreakdown.landlord_float.in,
            out: bucketBreakdown.landlord_float.out,
            inCount: bucketBreakdown.landlord_float.inCount,
            outCount: bucketBreakdown.landlord_float.outCount,
            accent: 'text-sky-600',
          },
        ];
        const anyActivity = items.some(i => i.in > 0 || i.out > 0);
        if (!anyActivity) return null;
        const meta = bucketBreakdown.meta;
        const fmtDate = (d: Date | null) =>
          d ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
        const windowLabel = meta.from
          ? `${fmtDate(meta.from)} → ${fmtDate(meta.to)}`
          : `All time → ${fmtDate(meta.to)}`;
        return (
          <TooltipProvider delayDuration={150}>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Wallet bucket flow · {periodLabel}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="How this is calculated">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-[11px] leading-snug">
                  <p className="font-semibold mb-1">How this is derived</p>
                  <p>Sums every <span className="font-mono">ledger_scope = 'wallet'</span> entry in <span className="font-mono">general_ledger</span> within the selected period. Each row is classified by category into one of three buckets, then split by direction:</p>
                  <ul className="list-disc ml-4 mt-1 space-y-0.5">
                    <li><span className="font-semibold">In</span> = sum of <span className="font-mono">cash_in</span> legs landing in that bucket.</li>
                    <li><span className="font-semibold">Out</span> = sum of <span className="font-mono">cash_out</span> legs leaving that bucket.</li>
                    <li><span className="font-semibold">Net</span> = In − Out for the period (positive = bucket grew).</li>
                  </ul>
                  <div className="mt-2 pt-1 border-t border-border/60 space-y-0.5 opacity-90">
                    <div><span className="font-semibold">Window:</span> {windowLabel}</div>
                    <div><span className="font-semibold">Rows scanned:</span> {meta.scannedRows.toLocaleString()} → wallet-scope: {meta.walletScopeRows.toLocaleString()}</div>
                    <div><span className="font-semibold">Excluded:</span> {meta.outOfWindow.toLocaleString()} out of window, {meta.adjustmentsSkipped.toLocaleString()} adjustments</div>
                  </div>
                  <p className="mt-1 opacity-80">Admin corrections are excluded unless "Include adjustments" is on. Wallet balances are never mutated by this view.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {items.map(it => {
                const net = it.in - it.out;
                const openDrill = (direction: 'all' | 'cash_in' | 'cash_out') =>
                  setNetDrill({ direction, bucket: it.key, label: it.label });
                return (
                  <div
                    key={it.key}
                    className="rounded-md border border-border bg-background p-2.5 space-y-1.5 hover:border-primary/40 hover:bg-muted/40 transition-colors cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => openDrill('all')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrill('all'); } }}
                    title={`Click to open ${it.label} transactions for ${periodLabel}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-1 min-w-0">
                        <div className={cn('text-[11px] font-semibold truncate', it.accent)}>{it.label}</div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="text-muted-foreground/70 hover:text-foreground shrink-0"
                              aria-label={`What is ${it.label}`}
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-[11px] leading-snug">
                            <p className={cn('font-semibold mb-1', it.accent)}>{it.label}</p>
                            <p>{it.definition}</p>
                            <p className="mt-1"><span className="text-success font-semibold">In:</span> {it.inExamples}</p>
                            <p className="mt-1"><span className="text-destructive font-semibold">Out:</span> {it.outExamples}</p>
                            <div className="mt-2 pt-1 border-t border-border/60 space-y-0.5">
                              <div className="font-semibold">How this bucket is computed</div>
                              <div className="opacity-90">Filter: <span className="font-mono">ledger_scope='wallet'</span> · classified to <span className="font-mono">{it.key}</span> · {periodLabel}</div>
                              <div className="opacity-90">Window: {windowLabel}</div>
                              <div><span className="text-success font-semibold">In</span> = Σ amount of {it.inCount.toLocaleString()} <span className="font-mono">cash_in</span> leg{it.inCount === 1 ? '' : 's'} = <span className="font-mono">{formatUGX(it.in)}</span></div>
                              <div><span className="text-destructive font-semibold">Out</span> = Σ amount of {it.outCount.toLocaleString()} <span className="font-mono">cash_out</span> leg{it.outCount === 1 ? '' : 's'} = <span className="font-mono">{formatUGX(it.out)}</span></div>
                              <div><span className="font-semibold">Net</span> = {formatUGX(it.in)} − {formatUGX(it.out)} = <span className="font-mono">{(it.in - it.out) >= 0 ? '+' : '−'}{formatUGX(Math.abs(it.in - it.out))}</span></div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div
                        className={cn(
                          'font-mono text-[10px] shrink-0',
                          net > 0 ? 'text-success' : net < 0 ? 'text-destructive' : 'text-muted-foreground',
                        )}
                        title={`Net = In (${formatUGX(it.in)}) − Out (${formatUGX(it.out)}) for ${periodLabel}`}
                      >
                        Net {net > 0 ? '+' : ''}{formatUGX(net)}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{it.sub}</div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openDrill('cash_in'); }}
                            className="flex items-center gap-1 text-[10px] text-success hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-success rounded px-1 -mx-1"
                          >
                            <ArrowDownLeft className="h-3 w-3" />
                            <span className="font-mono">In · {formatUGX(it.in)}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-[11px] leading-snug">
                          <p className="font-semibold text-success mb-1">In — money entering {it.label}</p>
                          <p>Sum of every <span className="font-mono">cash_in</span> wallet-scope ledger leg classified to <span className="font-mono">{it.key}</span> within {periodLabel}.</p>
                          <div className="mt-1 space-y-0.5 opacity-90">
                            <div>Window: {windowLabel}</div>
                            <div>Contributing rows: <span className="font-mono">{it.inCount.toLocaleString()}</span></div>
                            <div>Σ amount: <span className="font-mono">{formatUGX(it.in)}</span></div>
                          </div>
                          <p className="mt-1 opacity-80">Click to drill into the underlying transactions.</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openDrill('cash_out'); }}
                            className="flex items-center gap-1 text-[10px] text-destructive hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-destructive rounded px-1 -mx-1"
                          >
                            <ArrowUpRight className="h-3 w-3" />
                            <span className="font-mono">Out · {formatUGX(it.out)}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-[11px] leading-snug">
                          <p className="font-semibold text-destructive mb-1">Out — money leaving {it.label}</p>
                          <p>Sum of every <span className="font-mono">cash_out</span> wallet-scope ledger leg classified to <span className="font-mono">{it.key}</span> within {periodLabel}.</p>
                          <div className="mt-1 space-y-0.5 opacity-90">
                            <div>Window: {windowLabel}</div>
                            <div>Contributing rows: <span className="font-mono">{it.outCount.toLocaleString()}</span></div>
                            <div>Σ amount: <span className="font-mono">{formatUGX(it.out)}</span></div>
                          </div>
                          <p className="mt-1 opacity-80">Click to drill into the underlying transactions.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </TooltipProvider>
        );
      })()}

      {/* Top drivers — top 3 inflow and outflow categories powering the net result */}
      {(summary.inRows.length > 0 || summary.outRows.length > 0) && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
            Top drivers · {periodLabel}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-success mb-1 flex items-center gap-1">
                <ArrowDownLeft className="h-3 w-3" /> Top inflows
              </div>
              {summary.inRows.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic">No inflows.</div>
              ) : (
                <ol className="space-y-1">
                  {summary.inRows.slice(0, 3).map(([cat, amt], i) => {
                    const share = summary.totalIn > 0 ? (amt / summary.totalIn) * 100 : 0;
                    return (
                      <li key={`in-${cat}`} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] text-muted-foreground/70 w-3 shrink-0">{i + 1}.</span>
                          <span className="truncate text-foreground/90">{friendlyWalletLabel(cat, 'cash_in')}</span>
                          <span className="text-[10px] text-muted-foreground/70 shrink-0">· {share.toFixed(0)}%</span>
                        </span>
                        <span className="font-mono text-success shrink-0">{formatUGX(amt)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            <div>
              <div className="text-[10px] font-semibold text-destructive mb-1 flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3" /> Top outflows
              </div>
              {summary.outRows.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic">No outflows.</div>
              ) : (
                <ol className="space-y-1">
                  {summary.outRows.slice(0, 3).map(([cat, amt], i) => {
                    const share = summary.totalOut > 0 ? (amt / summary.totalOut) * 100 : 0;
                    return (
                      <li key={`out-${cat}`} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] text-muted-foreground/70 w-3 shrink-0">{i + 1}.</span>
                          <span className="truncate text-foreground/90">{friendlyWalletLabel(cat, 'cash_out')}</span>
                          <span className="text-[10px] text-muted-foreground/70 shrink-0">· {share.toFixed(0)}%</span>
                        </span>
                        <span className="font-mono text-destructive shrink-0">{formatUGX(amt)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Into wallets */}
        <div className="rounded-lg border border-border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <ArrowDownLeft className="h-3.5 w-3.5" /> Into wallets
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {totalInDelta && (
                <span
                  className={cn('flex items-center gap-1 text-[10px] font-mono', toneClass(totalInDelta.tone, 'in'))}
                  title={`Previous: ${formatUGX(priorTotals?.totalIn ?? 0)}`}
                >
                  {totalInDelta.absLabel && <span>{totalInDelta.absLabel}</span>}
                  <span className="opacity-80">{totalInDelta.label}</span>
                </span>
              )}
              <div className="font-mono text-sm font-semibold text-success break-all">
                {formatUGX(summary.totalIn)}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {summary.inRows.length === 0 && (
              <div className="text-[11px] text-muted-foreground italic">No inflows in this period.</div>
            )}
            {summary.inRows.map(([cat, amt]) => renderCategoryRow(cat, amt, 'cash_in'))}
          </div>
        </div>

        {/* Out of wallets */}
        <div className="rounded-lg border border-border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <ArrowUpRight className="h-3.5 w-3.5" /> Out of wallets
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {totalOutDelta && (
                <span
                  className={cn('flex items-center gap-1 text-[10px] font-mono', toneClass(totalOutDelta.tone, 'out'))}
                  title={`Previous: ${formatUGX(priorTotals?.totalOut ?? 0)}`}
                >
                  {totalOutDelta.absLabel && <span>{totalOutDelta.absLabel}</span>}
                  <span className="opacity-80">{totalOutDelta.label}</span>
                </span>
              )}
              <div className="font-mono text-sm font-semibold text-destructive break-all">
                {formatUGX(summary.totalOut)}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {summary.outRows.length === 0 && (
              <div className="text-[11px] text-muted-foreground italic">No outflows in this period.</div>
            )}
            {summary.outRows.map(([cat, amt]) => renderCategoryRow(cat, amt, 'cash_out'))}
          </div>
        </div>
      </div>

      {/* Net-flow drill-down sheet — lists exact cash_in / cash_out wallet
          transactions that compose Into − Out for the currently loaded period. */}
      <Sheet open={!!netDrill} onOpenChange={(o) => { if (!o) setNetDrill(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {netDrill && (() => {
            const allWalletTxs: LedgerRow[] = [];
            for (const list of txByKey.values()) allWalletTxs.push(...list);
            const dirFiltered = allWalletTxs.filter(r => {
              if (netDrill.direction !== 'all' && r.direction !== netDrill.direction) return false;
              if (netDrill.from !== undefined || netDrill.to !== undefined) {
                const t = new Date(r.transaction_date).getTime();
                if (netDrill.from !== undefined && t < netDrill.from) return false;
                if (netDrill.to !== undefined && t >= netDrill.to) return false;
              }
              if (netDrill.bucket && classifyBucket(r.category) !== netDrill.bucket) return false;
              return true;
            });
            const q = netDrillQuery.trim().toLowerCase();
            const searched = q
              ? dirFiltered.filter(r =>
                  (r.reference_id || '').toLowerCase().includes(q) ||
                  (r.linked_party || '').toLowerCase().includes(q) ||
                  (r.description || '').toLowerCase().includes(q) ||
                  (r.source_table || '').toLowerCase().includes(q) ||
                  (r.category || '').toLowerCase().includes(q)
                )
              : dirFiltered;
            const sorted = [...searched].sort((a, b) =>
              new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
            );
            const sumIn = sorted.filter(r => r.direction === 'cash_in').reduce((s, r) => s + (Number(r.amount) || 0), 0);
            const sumOut = sorted.filter(r => r.direction === 'cash_out').reduce((s, r) => s + (Number(r.amount) || 0), 0);
            const totalPages = Math.max(1, Math.ceil(sorted.length / NET_DRILL_PAGE_SIZE));
            const page = Math.min(netDrillPage, totalPages - 1);
            const slice = sorted.slice(page * NET_DRILL_PAGE_SIZE, (page + 1) * NET_DRILL_PAGE_SIZE);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    Net flow transactions
                    <Badge variant="outline" className="text-[10px]">{periodLabel}</Badge>
                    {netDrill.label && (
                      <Badge variant="secondary" className="text-[10px]">{netDrill.label}</Badge>
                    )}
                  </SheetTitle>
                  <SheetDescription>
                    {netDrill.label
                      ? `Wallet cash-in and cash-out within ${netDrill.label} that compose this bucket's net.`
                      : 'Every wallet-scope cash-in and cash-out that makes up Into − Out for this period.'}
                  </SheetDescription>
                  {(netDrill.label || netDrill.bucket) && (
                    <button
                      type="button"
                      onClick={() => setNetDrill({ direction: netDrill.direction })}
                      className="self-start mt-1 text-[10px] underline text-muted-foreground hover:text-foreground"
                    >
                      Clear bucket filter · show full period
                    </button>
                  )}
                </SheetHeader>

                {/* Direction tabs */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {([
                    { v: 'all', label: `All · ${sorted.length}` },
                    { v: 'cash_in', label: 'Into wallets' },
                    { v: 'cash_out', label: 'Out of wallets' },
                  ] as const).map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setNetDrill({ ...netDrill, direction: opt.v })}
                      className={cn(
                        'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                        netDrill.direction === opt.v
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-muted'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Totals strip */}
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded border border-border p-2">
                    <div className="text-muted-foreground">Into</div>
                    <div className="font-mono font-semibold text-success break-all">{formatUGX(sumIn)}</div>
                  </div>
                  <div className="rounded border border-border p-2">
                    <div className="text-muted-foreground">Out</div>
                    <div className="font-mono font-semibold text-destructive break-all">{formatUGX(sumOut)}</div>
                  </div>
                  <div className="rounded border border-border p-2">
                    <div className="text-muted-foreground">Net</div>
                    <div className={cn('font-mono font-semibold break-all', sumIn - sumOut >= 0 ? 'text-success' : 'text-destructive')}>
                      {sumIn - sumOut >= 0 ? '+' : ''}{formatUGX(sumIn - sumOut)}
                    </div>
                  </div>
                </div>

                {/* Search */}
                <div className="mt-3">
                  <Input
                    placeholder="Search reference, party, category, description…"
                    value={netDrillQuery}
                    onChange={(e) => { setNetDrillQuery(e.target.value); setNetDrillPage(0); }}
                    className="h-8 text-xs"
                  />
                </div>

                {/* List */}
                <div className="mt-3 space-y-1 border-t border-border pt-2">
                  {slice.length === 0 && (
                    <div className="text-[11px] text-muted-foreground italic py-6 text-center">
                      No transactions match.
                    </div>
                  )}
                  {slice.map((t, i) => {
                    const isIn = t.direction === 'cash_in';
                    return (
                      <div
                        key={t.id || `${t.transaction_date}-${i}`}
                        className="flex items-start justify-between gap-2 text-[11px] py-1.5 border-b border-border/40 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-foreground/90">
                            {format(new Date(t.transaction_date), 'dd MMM HH:mm')}
                            <span className="text-muted-foreground"> · {friendlyWalletLabel(t.category, t.direction as 'cash_in' | 'cash_out')}</span>
                            {t.linked_party && (
                              <span className="text-muted-foreground"> · {t.linked_party}</span>
                            )}
                          </div>
                          {t.description && (
                            <div className="text-muted-foreground truncate">{t.description}</div>
                          )}
                          {(t.reference_id || t.source_table) && (
                            <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
                              {t.source_table && <span>{t.source_table}</span>}
                              {t.source_table && t.reference_id && <span> · </span>}
                              {t.reference_id && <span>{t.reference_id}</span>}
                            </div>
                          )}
                        </div>
                        <div className={cn('font-mono shrink-0', isIn ? 'text-success' : 'text-destructive')}>
                          {isIn ? '+' : '−'}{formatUGX(Number(t.amount) || 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {sorted.length > NET_DRILL_PAGE_SIZE && (
                  <div className="mt-3 flex items-center justify-between gap-2 text-[10px]">
                    <div className="text-muted-foreground">
                      {page * NET_DRILL_PAGE_SIZE + 1}–{Math.min((page + 1) * NET_DRILL_PAGE_SIZE, sorted.length)} of {sorted.length.toLocaleString()}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                        disabled={page === 0} onClick={() => setNetDrillPage(p => Math.max(0, p - 1))}>‹ Prev</Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                        disabled={page >= totalPages - 1} onClick={() => setNetDrillPage(p => Math.min(totalPages - 1, p + 1))}>Next ›</Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
