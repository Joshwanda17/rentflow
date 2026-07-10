import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/agentAdvanceCalculations';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Sparkles, Info, TrendingUp, Users, Network, Wallet, Home, FileText,
  Target, ShieldCheck,
} from 'lucide-react';

const num = (v: any) => Number(v ?? 0);

export interface AgentEvaluation {
  potential_score: number;
  suggested_amount: number;
  current_limit: number;
  direct_subagents: number;
  active_subagents: number;
  grand_subagents: number;
  rent_collected: number;
  collections_count: number;
  house_listings: number;
  rent_requests: number;
  advances_count: number;
  outstanding_total: number;
  repayment_rate: number | null;
  has_active_advance: boolean;
  network_score: number;
  collections_score: number;
  repayment_score: number;
  listings_score: number;
  requests_score: number;
  is_qualifying: boolean;
}

function scoreColor(score: number) {
  if (score >= 75) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-rose-600';
}
function scoreBg(score: number) {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}
function tierLabel(score: number) {
  if (score >= 75) return 'High potential';
  if (score >= 50) return 'Growing';
  return 'Early stage';
}

/** Human-readable likelihood of repayment, blending repayment history + potential. */
function likelihood(e: AgentEvaluation): { label: string; tone: string } {
  if (e.repayment_rate != null) {
    const pct = e.repayment_rate * 100;
    if (pct >= 90) return { label: 'Very likely to repay', tone: 'text-emerald-600' };
    if (pct >= 70) return { label: 'Likely to repay', tone: 'text-emerald-600' };
    if (pct >= 45) return { label: 'Moderate — watch closely', tone: 'text-amber-600' };
    return { label: 'At risk — poor repayment', tone: 'text-rose-600' };
  }
  // No advance history — lean on the potential score.
  if (e.potential_score >= 60) return { label: 'No history — strong profile', tone: 'text-emerald-600' };
  if (e.potential_score >= 35) return { label: 'No history — average profile', tone: 'text-amber-600' };
  return { label: 'No history — thin profile', tone: 'text-rose-600' };
}

export function mapEvaluationRow(r: any): AgentEvaluation {
  return {
    potential_score: num(r.potential_score),
    suggested_amount: num(r.suggested_amount),
    current_limit: num(r.current_limit),
    direct_subagents: num(r.direct_subagents),
    active_subagents: num(r.active_subagents),
    grand_subagents: num(r.grand_subagents),
    rent_collected: num(r.rent_collected),
    collections_count: num(r.collections_count),
    house_listings: num(r.house_listings),
    rent_requests: num(r.rent_requests),
    advances_count: num(r.advances_count),
    outstanding_total: num(r.outstanding_total),
    repayment_rate: r.repayment_rate == null ? null : Number(r.repayment_rate),
    has_active_advance: !!r.has_active_advance,
    network_score: num(r.network_score),
    collections_score: num(r.collections_score),
    repayment_score: num(r.repayment_score),
    listings_score: num(r.listings_score),
    requests_score: num(r.requests_score),
    is_qualifying: !!r.is_qualifying,
  };
}

/** Shared hook — on-demand work evaluation for ANY agent id. */
export function useAgentEvaluation(agentId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['agent-work-evaluation', agentId],
    enabled: !!agentId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_agent_advance_potential_for', {
        _agent_id: agentId,
      });
      if (error) throw error;
      const row = ((data ?? []) as any[])[0];
      return row ? mapEvaluationRow(row) : null;
    },
  });
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="font-medium">{label} <span className="text-muted-foreground">(max {max})</span></span>
        <span className="font-bold">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', scoreBg(pct))} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function StatBlock({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-base font-bold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Reusable "work evaluation" block — the same rich advance-potential analysis
 * used on the advance review desk, so it can appear on the agent 360° profile
 * and anywhere else an agent is shown.
 */
export function AgentEvaluationSection({
  agentId,
  evaluation,
  compact = false,
}: {
  agentId?: string | null;
  /** Pass a pre-fetched evaluation to skip the internal query. */
  evaluation?: AgentEvaluation | null;
  compact?: boolean;
}) {
  const { data: fetched, isLoading } = useAgentEvaluation(agentId, evaluation === undefined);
  const e = evaluation ?? fetched ?? null;

  if (evaluation === undefined && isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!e) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground inline-flex items-center gap-2">
        <Info className="h-4 w-4" /> No evaluation could be generated for this agent yet.
      </div>
    );
  }

  const repayPct = e.repayment_rate == null ? null : Math.round(e.repayment_rate * 100);
  const lk = likelihood(e);

  return (
    <div className="space-y-4">
      {!e.is_qualifying && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" />
          Generated on demand — this agent hasn't met the full agent criteria yet, so we scored them from their live activity.
        </div>
      )}

      {/* Headline: potential + likelihood */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Potential score</p>
          <p className={cn('text-3xl font-extrabold leading-none', scoreColor(e.potential_score))}>
            {e.potential_score.toFixed(0)}<span className="text-base text-muted-foreground">/100</span>
          </p>
          <p className="text-[11px] font-semibold mt-1">{tierLabel(e.potential_score)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Likelihood to repay</p>
          <p className={cn('text-lg font-extrabold leading-tight', lk.tone)}>
            {repayPct == null ? 'New' : `${repayPct}%`}
          </p>
          <p className={cn('text-[11px] font-medium', lk.tone)}>{lk.label}</p>
        </div>
      </div>

      {/* Suggested vs limit */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wide text-emerald-700 flex items-center justify-center gap-1"><Target className="h-3 w-3" />Suggested advance</p>
          <p className="text-lg font-extrabold text-emerald-600 leading-tight">{formatUGX(e.suggested_amount)}</p>
          <p className="text-[10px] text-emerald-700">safe amount</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center justify-center gap-1"><ShieldCheck className="h-3 w-3" />Current limit</p>
          <p className="text-lg font-extrabold leading-tight">{formatUGX(e.current_limit)}</p>
          <p className="text-[10px] text-muted-foreground">approval cap</p>
        </div>
      </div>

      {e.outstanding_total > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Outstanding advance balance: <strong>{formatUGX(e.outstanding_total)}</strong>
          {e.has_active_advance ? ' · has an active advance' : ''}.
        </div>
      )}

      {/* Score breakdown */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-bold flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Performance breakdown</p>
        <ScoreBar label="Sub-agent network" value={e.network_score} max={70} />
        <ScoreBar label="Rent collections" value={e.collections_score} max={15} />
        <ScoreBar label="Repayment performance" value={e.repayment_score} max={5} />
        <ScoreBar label="House listings" value={e.listings_score} max={5} />
        <ScoreBar label="Rent requests" value={e.requests_score} max={5} />
      </div>

      {/* Stats grid */}
      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          <StatBlock icon={Users} label="Direct sub-agents" value={String(e.direct_subagents)} sub={`${e.active_subagents} active`} />
          <StatBlock icon={Network} label="Grand sub-agents" value={String(e.grand_subagents)} sub="Under their subs" />
          <StatBlock icon={Wallet} label="Rent collected" value={formatUGX(e.rent_collected)} sub={`${e.collections_count} collections`} />
          <StatBlock icon={Home} label="Houses listed" value={String(e.house_listings)} />
          <StatBlock icon={FileText} label="Rent requests" value={String(e.rent_requests)} sub="For tenants" />
          <StatBlock icon={TrendingUp} label="Repayment" value={repayPct == null ? 'No history' : `${repayPct}%`} sub={e.advances_count > 0 ? `${e.advances_count} advances` : 'Never taken advance'} />
        </div>
      )}
    </div>
  );
}