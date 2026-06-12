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
}

interface EarningLeg {
  key: string;
  kind: 'Recruiter override' | 'Sub-agent earning';
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

    const [overridesRes, earningsRes, ledgerRes] = await Promise.all([
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
      supabase
        .from('general_ledger')
        .select('id, amount, category, ledger_scope, recipient_type, wallet_bucket, source_id, transaction_date, description')
        .eq('user_id', user.id)
        .eq('category', 'agent_commission')
        .eq('ledger_scope', 'wallet')
        .neq('classification', 'admin_correction')
        .neq('category', 'system_balance_correction')
        .order('transaction_date', { ascending: false })
        .limit(500),
    ]);

    const overrides = overridesRes.data || [];
    const earnings = earningsRes.data || [];
    const walletLegs: WalletLeg[] = (ledgerRes.data || []).map((l) => ({
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

    // Resolve names for sub-agents (override events + earning source users).
    const profileIds = [
      ...new Set([
        ...overrides.filter((o) => o.sub_agent_id).map((o) => o.sub_agent_id as string),
        ...earnings.filter((e) => e.source_user_id).map((e) => e.source_user_id as string),
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

  const summary = useMemo(() => {
    const total = rows.length;
    const withdrawable = rows.filter((r) => r.status === 'withdrawable').length;
    const otherScope = rows.filter((r) => r.status === 'other_scope').length;
    const unmatched = rows.filter((r) => r.status === 'unmatched').length;
    const earned = rows.reduce((s, r) => s + r.amount, 0);
    const landed = rows.filter((r) => r.status === 'withdrawable').reduce((s, r) => s + r.amount, 0);
    return { total, withdrawable, otherScope, unmatched, earned, landed };
  }, [rows]);

  return (
    <Card id="subagent-audit" className="scroll-mt-28 border-border/60 shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-orange-500" />
            Payout Audit
          </CardTitle>
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
        <p className="text-[11px] text-muted-foreground">
          Every sub-agent earning leg matched to its withdrawable wallet credit.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No sub-agent earnings yet. Once your team earns, each payout will appear here with its wallet credit.
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
              {rows.map((row) => (
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