import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAgentCapacityMap, DAILY_ELIGIBILITY_THRESHOLD } from '@/hooks/useAgentCapacityMap';
import { formatUGX } from '@/lib/rentCalculations';
import { TrendingUp, TrendingDown, Minus, Layers, Target, CheckCircle2, Lock, Loader2 } from 'lucide-react';

/**
 * Plain-English breakdown panel shown directly under "My Rent-Request Capacity".
 * Answers the three questions agents ask before allocating:
 *   1. How much have I collected today vs my target?
 *   2. How does that compare to yesterday?
 *   3. How many more allocations (slots) can I still make?
 * Ends with a clear can / can't allocate verdict and the reason.
 */
export function AgentCapacityBreakdownPanel() {
  const { user } = useAuth();
  const ids = useMemo(() => (user?.id ? [user.id] : []), [user?.id]);
  const { data, isLoading } = useAgentCapacityMap(ids);
  const cap = user?.id ? data?.get(user.id) : undefined;

  if (!user?.id) return null;

  if (isLoading && !cap) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading capacity breakdown…</span>
      </div>
    );
  }
  if (!cap) return null;

  const todayPct = cap.expected_daily > 0
    ? Math.min(100, Math.round((cap.paid_today / cap.expected_daily) * 100))
    : 0;
  const todayBar = todayPct >= 50 ? 'bg-emerald-500' : todayPct >= 20 ? 'bg-amber-500' : 'bg-destructive';
  const remainingUGX = Math.max(0, cap.expected_daily - cap.paid_today);

  // Yesterday comparison
  const diff = cap.paid_today - cap.paid_yesterday;
  const trendTone = diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-destructive' : 'text-muted-foreground';
  const TrendIcon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const trendLabel = diff > 0
    ? `${formatUGX(Math.abs(diff))} more than yesterday`
    : diff < 0
      ? `${formatUGX(Math.abs(diff))} less than yesterday`
      : 'Same as yesterday';

  // Remaining slots = how many more per-tenant allocations the headroom allows
  const canPost = cap.can_post_rent_today;
  const remainingSlots = canPost && cap.per_tenant_max > 0
    ? Math.floor(cap.headroom / cap.per_tenant_max)
    : 0;

  const threshold = Math.round(DAILY_ELIGIBILITY_THRESHOLD * 100);
  const unlockNeeded = Math.max(0, Math.round(cap.expected_daily * DAILY_ELIGIBILITY_THRESHOLD) - cap.paid_today);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-bold text-foreground">Why you can / can&apos;t allocate</h4>
      </div>

      {/* 1. Collected today vs target */}
      <div className="rounded-xl border border-border bg-background/70 p-3">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Target className="h-4 w-4 text-primary" />
          Collected today vs target
        </div>
        <div className="mt-1 text-base font-extrabold tabular-nums text-foreground">
          {formatUGX(cap.paid_today)}
          <span className="text-muted-foreground font-semibold"> / {formatUGX(cap.expected_daily)}</span>
        </div>
        <div className="mt-1.5 h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${todayBar} transition-all`} style={{ width: `${todayPct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {todayPct}% of today&apos;s target
          {remainingUGX > 0 && <> · <strong className="text-foreground">{formatUGX(remainingUGX)}</strong> still to go</>}
        </p>
      </div>

      {/* 2. Yesterday comparison + 3. Remaining slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-background/70 p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Vs yesterday</div>
          <div className="mt-1 text-base font-extrabold tabular-nums text-foreground">
            {formatUGX(cap.paid_yesterday)}
          </div>
          <div className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${trendTone}`}>
            <TrendIcon className="h-4 w-4 shrink-0" />
            <span>{trendLabel}</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background/70 p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Remaining slots</div>
          <div className="mt-1 text-base font-extrabold tabular-nums text-foreground">
            {remainingSlots}
            <span className="text-muted-foreground font-semibold"> {remainingSlots === 1 ? 'allocation' : 'allocations'}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {canPost
              ? <>Up to {formatUGX(cap.per_tenant_max)} per tenant · {formatUGX(cap.headroom)} headroom left</>
              : <>Unlock allocations first to use your headroom</>}
          </p>
        </div>
      </div>

      {/* Verdict */}
      <div
        className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${
          canPost ? 'bg-emerald-500/10 text-emerald-700' : 'bg-destructive/10 text-destructive'
        }`}
      >
        {canPost ? (
          <>
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              You can allocate today — you have met the {threshold}% daily target and have{' '}
              {remainingSlots > 0 ? `${remainingSlots} ${remainingSlots === 1 ? 'slot' : 'slots'} of` : ''} headroom available.
            </span>
          </>
        ) : (
          <>
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              You can&apos;t allocate yet — collect{' '}
              <strong>{formatUGX(unlockNeeded)}</strong> more today to reach the {threshold}% daily target and unlock new allocations.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default AgentCapacityBreakdownPanel;