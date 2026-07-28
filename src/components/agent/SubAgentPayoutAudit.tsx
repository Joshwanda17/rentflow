import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wallet,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { applyCustomerWalletLedgerFilters, isCustomerWalletLedgerEntryVisible } from '@/lib/customerWalletHistory';

/**
 * Agent payout audit: lists each sub-agent earning leg and links it to the
 * matching withdrawable wallet credit in the general ledger so the agent can
 * confirm the money actually landed in their withdrawable bucket.
 *
 * Read-only / presentation. Earning legs come from recruiter_override_events
 * and sub-agent rows in agent_earnings; the matching wallet credit is the
 * general_ledger row (category=agent_commission, ledger_scope=wallet,
 * recipient_type=user) linked by source_id + amount.
 */

type MatchStatus = 'withdrawable' | 'other_scope' | 'unmatched';

interface WalletLeg {
  id: string;
  amount: number;
  category: string;
  ledger_scope: string | null;
  recipient_type: string | null;
  wallet_bucket: string | null;
  source_id: string | null;
  transaction_date: string;
  description: string | null;
  classification?: string | null;
  source_table?: string | null;
  reference_id?: string | null;
}

interface EarningLeg {
  key: string;
  kind: 'Recruiter override' | 'Sub-agent earning' | 'Rent override (2%)';
  label: string;
  subAgentName: string | null;
  amount: number;
  occurredAt: string;
  sourceId: string | null;
}

interface AuditRow extends EarningLeg {
  status: MatchStatus;
  walletLeg: WalletLeg | null;
}

const SUBAGENT_EARNING_TYPES = [
  'subagent_commission',
  'subagent_override',
  'subagent_registration',
];

/** recipient_type='user' routes to the withdrawable bucket per Wallet Routing v2. */
function resolveBucket(leg: WalletLeg): string {
  if (leg.wallet_bucket) return leg.wallet_bucket;
  if (leg.recipient_type === 'user' && leg.ledger_scope === 'wallet') return 'withdrawable';
  return leg.ledger_scope === 'wallet' ? 'wallet' : (leg.ledger_scope || '—');
}

function classify(leg: WalletLeg | null): MatchStatus {
  if (!leg) return 'unmatched';
  return resolveBucket(leg) === 'withdrawable' ? 'withdrawable' : 'other_scope';
}

export function SubAgentPayoutAudit() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [subAgentFilter, setSubAgentFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) return;
    if (opts?.silent) setRefreshing(true); else setLoading(true);

    const [overridesRes, earningsRes, recruiterRes, ledgerRes] = await Promise.all([
      supabase
        .from('recruiter_override_events')
        .select('id, sub_agent_id, label, amount, source_id, occurred_at, event_type')
        .eq('recruiter_id', user.id)
        .order('occurred_at', { ascending: false })
        .limit(200),
      supabase
        .from('agent_earnings')
        .select('id, amount, earning_type, description, source_user_id, rent_request_id, created_at')
        .eq('agent_id', user.id)
        .in('earning_type', SUBAGENT_EARNING_TYPES)
        .order('created_at', { ascending: false })
        .limit(200),
      // 2% rent override — since the April 2026 commission-engine rewrite this
      // is written to commission_accrual_ledger (commission_role='recruiter'),
      // NOT agent_earnings. Without it the audit silently undercounts real
      // 2% rent payouts that DID reach the wallet.
      supabase
        .from('commission_accrual_ledger')
        .select('id, amount, tenant_id, earned_at, description')
        .eq('agent_id', user.id)
        .eq('commission_role', 'recruiter')
        .order('earned_at', { ascending: false })
        .limit(200),
      applyCustomerWalletLedgerFilters(supabase
        .from('general_ledger')
        .select('id, amount, category, ledger_scope, recipient_type, wallet_bucket, source_id, transaction_date, description, classification, source_table, reference_id')
        .eq('user_id', user.id)
        .in('category', ['agent_commission', 'agent_commission_earned'])
        .eq('ledger_scope', 'wallet'))
        .order('transaction_date', { ascending: false })
        .limit(500),
    ]);

    const overrides = overridesRes.data || [];
    const earnings = earningsRes.data || [];
    const recruiterRows = recruiterRes.data || [];
    const walletLegs: WalletLeg[] = (ledgerRes.data || []).filter(isCustomerWalletLedgerEntryVisible).map((l) => ({
      id: l.id,
      amount: Number(l.amount),
      category: l.category,
      ledger_scope: l.ledger_scope,
      recipient_type: l.recipient_type,
      wallet_bucket: l.wallet_bucket,
      source_id: l.source_id ? String(l.source_id) : null,
      transaction_date: l.transaction_date,
      description: l.description,
    }));

    // Map each recruiter rent-override tenant back to the sub-agent who manages
    // them (commission_accrual_ledger stores tenant_id, not the sub-agent id).
    const recruiterTenantIds = [
      ...new Set(recruiterRows.filter((r) => r.tenant_id).map((r) => r.tenant_id as string)),
    ];
    const tenantToSub: Record<string, string> = {};
    if (recruiterTenantIds.length > 0) {
      const { data: rr } = await supabase
        .from('rent_requests')
        .select('tenant_id, agent_id')
        .in('tenant_id', recruiterTenantIds);
      (rr || []).forEach((r) => {
        if (r.tenant_id && r.agent_id) tenantToSub[r.tenant_id] = r.agent_id;
      });
    }

    // Resolve names for sub-agents (override events + earning source users).
    const profileIds = [
      ...new Set([
        ...overrides.filter((o) => o.sub_agent_id).map((o) => o.sub_agent_id as string),
        ...earnings.filter((e) => e.source_user_id).map((e) => e.source_user_id as string),
        ...Object.values(tenantToSub),
      ]),
    ];
    const nameMap: Record<string, string> = {};
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', profileIds);
      (profiles || []).forEach((p) => { nameMap[p.id] = p.full_name || 'Unknown'; });
    }

    const earningLegs: EarningLeg[] = [
      ...overrides.map((o) => ({
        key: `roe-${o.id}`,
        kind: 'Recruiter override' as const,
        label: o.label || (o.event_type ? String(o.event_type).replace(/_/g, ' ') : 'Recruiter override'),
        subAgentName: o.sub_agent_id ? (nameMap[o.sub_agent_id] || null) : null,
        amount: Number(o.amount),
        occurredAt: o.occurred_at,
        sourceId: o.source_id ? String(o.source_id) : null,
      })),
      ...earnings.map((e) => ({
        key: `ae-${e.id}`,
        kind: 'Sub-agent earning' as const,
        label: e.description || String(e.earning_type).replace(/_/g, ' '),
        subAgentName: e.source_user_id ? (nameMap[e.source_user_id] || null) : null,
        amount: Number(e.amount),
        occurredAt: e.created_at,
        sourceId: null,
      })),
      ...recruiterRows.map((rc) => ({
        key: `cal-${rc.id}`,
        kind: 'Rent override (2%)' as const,
        label: rc.description || 'Rent commission (2%)',
        subAgentName: rc.tenant_id ? (nameMap[tenantToSub[rc.tenant_id]] || null) : null,
        amount: Number(rc.amount),
        occurredAt: rc.earned_at,
        sourceId: null,
      })),
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    // Match each earning leg to a wallet credit (source_id first, then amount + time).
    const used = new Set<string>();
    const matched: AuditRow[] = earningLegs.map((leg) => {
      let candidates = walletLegs.filter((w) => !used.has(w.id));
      // Prefer exact source_id match.
      let pick: WalletLeg | null = null;
      if (leg.sourceId) {
        pick = candidates.find((w) => w.source_id === leg.sourceId && Math.abs(w.amount - leg.amount) < 1) || null;
      }
      // Fallback: same amount within a 5-minute window of the earning event.
      if (!pick) {
        const t = new Date(leg.occurredAt).getTime();
        pick = candidates
          .filter((w) => Math.abs(w.amount - leg.amount) < 1 && Math.abs(new Date(w.transaction_date).getTime() - t) < 5 * 60 * 1000)
          .sort((a, b) => Math.abs(new Date(a.transaction_date).getTime() - t) - Math.abs(new Date(b.transaction_date).getTime() - t))[0] || null;
      }
      if (pick) used.add(pick.id);
      return { ...leg, walletLeg: pick, status: classify(pick) };
    });

    setRows(matched);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Unique filter options
  const subAgentOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.subAgentName).filter(Boolean)));
    return names.sort() as string[];
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const cats = Array.from(new Set(rows.map((r) => r.kind)));
    return cats.sort();
  }, [rows]);

  // Apply filters client-side (instant)
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const t = parseISO(r.occurredAt);
      if (dateFrom && !isWithinInterval(t, { start: startOfDay(parseISO(dateFrom)), end: endOfDay(dateTo ? parseISO(dateTo) : new Date(3000, 0, 1)) })) return false;
      if (dateTo && !isWithinInterval(t, { start: startOfDay(dateFrom ? parseISO(dateFrom) : new Date(1970, 0, 1)), end: endOfDay(parseISO(dateTo)) })) return false;
      if (subAgentFilter !== 'all' && r.subAgentName !== subAgentFilter) return false;
      if (categoryFilter !== 'all' && r.kind !== categoryFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, dateFrom, dateTo, subAgentFilter, categoryFilter, statusFilter]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const withdrawable = filteredRows.filter((r) => r.status === 'withdrawable').length;
    const otherScope = filteredRows.filter((r) => r.status === 'other_scope').length;
    const unmatched = filteredRows.filter((r) => r.status === 'unmatched').length;
    const earned = filteredRows.reduce((s, r) => s + r.amount, 0);
    const landed = filteredRows.filter((r) => r.status === 'withdrawable').reduce((s, r) => s + r.amount, 0);
    return { total, withdrawable, otherScope, unmatched, earned, landed };
  }, [filteredRows]);

  const hasActiveFilters = dateFrom || dateTo || subAgentFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all';

  return (
    <Card id="subagent-audit" className="scroll-mt-28 border-border/60 shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-orange-500" />
            Payout Audit
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className={cn('h-8 text-xs gap-1.5', hasActiveFilters && 'border-primary/60 text-primary')}
              onClick={() => setShowFilters((s) => !s)}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {hasActiveFilters && <span className="ml-0.5 rounded-full bg-primary text-primary-foreground w-4 h-4 flex items-center justify-center text-[9px]">•</span>}
              {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => load({ silent: true })}
              disabled={loading || refreshing}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Every sub-agent earning leg matched to its withdrawable wallet credit.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters panel */}
        {showFilters && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-3">
            {/* Date range */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs"
                />
              </div>
            </div>

            {/* Sub-agent */}
            {subAgentOptions.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">Sub-agent</label>
                <select
                  value={subAgentFilter}
                  onChange={(e) => setSubAgentFilter(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs"
                >
                  <option value="all">All sub-agents</option>
                  {subAgentOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Category & Status */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">Category</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs"
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs"
                >
                  <option value="all">All statuses</option>
                  <option value="withdrawable">Withdrawable</option>
                  <option value="other_scope">Wrong scope</option>
                  <option value="unmatched">No credit</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[10px] w-full"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setSubAgentFilter('all');
                  setCategoryFilter('all');
                  setStatusFilter('all');
                }}
              >
                Clear all filters
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filteredRows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            {hasActiveFilters
              ? 'No results match the selected filters.'
              : 'No sub-agent earnings yet. Once your team earns, each payout will appear here with its wallet credit.'}
          </p>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border/60 p-2.5">
                <p className="text-[10px] text-muted-foreground">Earned (legs)</p>
                <p className="text-sm font-bold">{formatUGX(summary.earned)}</p>
                <p className="text-[10px] text-muted-foreground">{summary.total} legs</p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                <p className="text-[10px] text-muted-foreground">Landed in withdrawable</p>
                <p className="text-sm font-bold text-emerald-600">{formatUGX(summary.landed)}</p>
                <p className="text-[10px] text-muted-foreground">{summary.withdrawable} matched</p>
              </div>
            </div>
            {(summary.otherScope > 0 || summary.unmatched > 0) && (
              <div className="flex flex-wrap gap-2">
                {summary.otherScope > 0 && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                    {summary.otherScope} wrong scope
                  </Badge>
                )}
                {summary.unmatched > 0 && (
                  <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                    {summary.unmatched} no wallet credit
                  </Badge>
                )}
              </div>
            )}

            {/* Rows */}
            <div className="space-y-2">
              {filteredRows.map((row) => (
                <AuditRowCard key={row.key} row={row} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: MatchStatus }) {
  if (status === 'withdrawable') {
    return (
      <Badge className="text-[10px] gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 border-0">
        <CheckCircle2 className="h-3 w-3" /> Withdrawable
      </Badge>
    );
  }
  if (status === 'other_scope') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-600">
        <AlertTriangle className="h-3 w-3" /> Wrong scope
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-destructive/40 text-destructive">
      <XCircle className="h-3 w-3" /> No credit
    </Badge>
  );
}

function AuditRowCard({ row }: { row: AuditRow }) {
  const leg = row.walletLeg;
  return (
    <div className="rounded-xl border border-border/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-tight truncate">{row.label}</p>
          <p className="text-[10px] text-muted-foreground">
            {row.kind}
            {row.subAgentName ? ` • ${row.subAgentName}` : ''}
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <div className="flex items-stretch gap-2">
        {/* Earning leg */}
        <div className="flex-1 rounded-lg bg-muted/40 p-2">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Earning leg</p>
          <p className="text-sm font-bold">{formatUGX(row.amount)}</p>
          <p className="text-[10px] text-muted-foreground">
            {format(new Date(row.occurredAt), 'MMM d, yyyy • h:mm a')}
          </p>
        </div>

        <div className="flex items-center text-muted-foreground">
          <ArrowRight className="h-4 w-4" />
        </div>

        {/* Wallet credit */}
        <div className={cn(
          'flex-1 rounded-lg p-2',
          leg ? 'bg-emerald-500/5' : 'bg-destructive/5',
        )}>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Wallet className="h-2.5 w-2.5" /> Wallet credit
          </p>
          {leg ? (
            <>
              <p className="text-sm font-bold">{formatUGX(leg.amount)}</p>
              <p className="text-[10px] text-muted-foreground">
                {format(new Date(leg.transaction_date), 'MMM d, yyyy • h:mm a')}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-destructive font-medium mt-0.5">Never reached wallet</p>
          )}
        </div>
      </div>

      {/* Ledger metadata */}
      {leg && (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-[9px] font-normal">cat: {leg.category}</Badge>
          <Badge variant="secondary" className="text-[9px] font-normal">scope: {leg.ledger_scope || '—'}</Badge>
          <Badge variant="secondary" className="text-[9px] font-normal">recipient: {leg.recipient_type || '—'}</Badge>
          <Badge variant="secondary" className="text-[9px] font-normal">bucket: {resolveBucket(leg)}</Badge>
        </div>
      )}
    </div>
  );
}