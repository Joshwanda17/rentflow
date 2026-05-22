import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useAgentCapacityMap,
  AGENT_RENT_CAP_UGX,
  AGENT_TIER_THRESHOLDS,
  type AgentCapacity,
} from '@/hooks/useAgentCapacityMap';
import { formatUGX } from '@/lib/rentCalculations';
import { Gauge, TrendingUp, CalendarDays, Info } from 'lucide-react';

const TIER_TONE: Record<AgentCapacity['tier'], string> = {
  Positive:   'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  Fair:       'bg-amber-500/15 text-amber-700 border-amber-500/30',
  Bad:        'bg-orange-500/15 text-orange-700 border-orange-500/30',
  'Very Bad': 'bg-destructive/15 text-destructive border-destructive/30',
  Starter:    'bg-violet-500/15 text-violet-700 border-violet-500/30',
};

/**
 * Agent-facing capacity & tier card. Shows the same numbers Ops sees,
 * plus a plain-English explanation of how the tier was computed.
 */
export function AgentRentCapacitySelfCard() {
  const { user } = useAuth();
  const ids = useMemo(() => (user?.id ? [user.id] : []), [user?.id]);
  const { data, isLoading } = useAgentCapacityMap(ids);
  const cap = user?.id ? data?.get(user.id) : undefined;

  if (!user?.id) return null;

  const ratePct = cap ? Math.round(cap.repayment_rate * 100) : 0;
  const pct = cap ? cap.pct : 0;
  const bar = pct >= 95 ? 'bg-destructive' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-3 sm:p-4 bg-gradient-to-br from-primary/10 via-violet-500/5 to-transparent border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
            <Gauge className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-foreground">My Rent-Request Capacity</h3>
            <p className="text-[11px] text-muted-foreground">
              Hard cap UGX {formatUGX(AGENT_RENT_CAP_UGX)} of active rent exposure per agent
            </p>
          </div>
          {cap && (
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${TIER_TONE[cap.tier]}`}
            >
              {cap.tier}
            </span>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading capacity…</p>
        ) : !cap ? (
          <p className="text-xs text-muted-foreground">
            You have no active rent requests yet. Once you post one, your tier will start at{' '}
            <strong>Starter</strong> with a UGX 500,000 per-tenant limit.
          </p>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold tabular-nums mb-1">
                <span className="text-muted-foreground">
                  Used{' '}
                  <span className="text-foreground">{formatUGX(cap.used)}</span> /{' '}
                  {formatUGX(AGENT_RENT_CAP_UGX)}
                </span>
                <span className="text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1.5 text-muted-foreground">
                <span>
                  Headroom <strong className="text-foreground font-mono">{formatUGX(cap.headroom)}</strong>
                </span>
                <span>
                  Per-tenant max{' '}
                  <strong className="text-foreground font-mono">{formatUGX(cap.per_tenant_max)}</strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-background/70 p-2.5">
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Expected · Last 7 days
                </div>
                <div className="mt-0.5 text-sm font-extrabold tabular-nums text-foreground">
                  {formatUGX(cap.expected_weekly)}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Sum of daily rent × 7 across your active tenants
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-2.5">
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Collected · Last 7 days
                </div>
                <div className="mt-0.5 text-sm font-extrabold tabular-nums text-foreground">
                  {formatUGX(cap.paid_last_week)}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Your weekly collection rate: <strong>{ratePct}%</strong>
                </p>
              </div>
            </div>
          </>
        )}

        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground mb-1.5">
            <Info className="h-3.5 w-3.5 text-primary" />
            How your tier is calculated
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Each day, your tenants are expected to pay the daily amount on every active rent
            request you posted. We add those up across the last 7 days and compare it to what you
            actually collected.
          </p>
          <ul className="mt-2 space-y-1 text-[11px]">
            <li className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <strong className="text-foreground">Positive</strong>
                <span className="text-muted-foreground">
                  ≥ {Math.round(AGENT_TIER_THRESHOLDS.positive * 100)}% collected
                </span>
              </span>
              <span className="font-mono text-foreground">UGX 6,000,000 / tenant</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <strong className="text-foreground">Fair</strong>
                <span className="text-muted-foreground">
                  {Math.round(AGENT_TIER_THRESHOLDS.fair * 100)}–
                  {Math.round(AGENT_TIER_THRESHOLDS.positive * 100) - 1}%
                </span>
              </span>
              <span className="font-mono text-foreground">UGX 3,000,000 / tenant</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-500" />
                <strong className="text-foreground">Bad</strong>
                <span className="text-muted-foreground">
                  {Math.round(AGENT_TIER_THRESHOLDS.bad * 100)}–
                  {Math.round(AGENT_TIER_THRESHOLDS.fair * 100) - 1}%
                </span>
              </span>
              <span className="font-mono text-foreground">UGX 1,000,000 / tenant</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-destructive" />
                <strong className="text-foreground">Very Bad</strong>
                <span className="text-muted-foreground">
                  ≤ {Math.round(AGENT_TIER_THRESHOLDS.bad * 100) - 1}%
                </span>
              </span>
              <span className="font-mono text-destructive">Blocked from new requests</span>
            </li>
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">
            New agents start at <strong>Starter</strong> (UGX 500,000 / tenant) until they have
            active rent collections to measure. Your tier refreshes daily based on the most recent
            7-day window — so a strong week immediately moves you up.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AgentRentCapacitySelfCard;