import { AgentCapacity, AGENT_RENT_CAP_UGX } from '@/hooks/useAgentCapacityMap';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

const TIER_TONE: Record<AgentCapacity['tier'], string> = {
  Premium: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  Reliable: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
  Building: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  Starter: 'bg-violet-500/15 text-violet-700 border-violet-500/30',
  Defaulting: 'bg-destructive/15 text-destructive border-destructive/30',
};

function fmtShort(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

/**
 * Compact inline capacity chip designed to sit next to an agent's name.
 * Variants:
 *  - "chip"   : single pill (tier + used/100M%)
 *  - "stack"  : two-line stacked (chip + tiny progress bar)
 */
export function AgentCapacityBadge({
  capacity,
  loading,
  variant = 'chip',
  className,
}: {
  capacity?: AgentCapacity;
  loading?: boolean;
  variant?: 'chip' | 'stack';
  className?: string;
}) {
  if (loading) {
    return (
      <span
        className={cn(
          'inline-flex h-4 w-16 rounded-full bg-muted animate-pulse',
          className,
        )}
      />
    );
  }
  if (!capacity) return null;

  const { tier, used, pct, headroom, per_tenant_max, repayment_rate } = capacity;
  const tone = TIER_TONE[tier];
  const barTone =
    pct >= 95 ? 'bg-destructive' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  const title =
    `Tier: ${tier}\n` +
    `Active exposure: UGX ${formatUGX(used)} / ${formatUGX(AGENT_RENT_CAP_UGX)} (${pct}%)\n` +
    `Headroom: UGX ${formatUGX(headroom)}\n` +
    `Repayment rate (180d): ${Math.round(repayment_rate * 100)}%\n` +
    `Per-tenant rent limit: UGX ${formatUGX(per_tenant_max)}`;

  if (variant === 'stack') {
    return (
      <div className={cn('flex flex-col gap-0.5 min-w-[90px]', className)} title={title}>
        <span
          className={cn(
            'inline-flex items-center gap-1 self-start px-1.5 py-0 rounded-full border text-[10px] font-bold leading-4',
            tone,
          )}
        >
          {tier} · {pct}%
        </span>
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div className={cn('h-full transition-all', barTone)} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums leading-3">
          {fmtShort(used)}/{fmtShort(AGENT_RENT_CAP_UGX)} · room {fmtShort(headroom)}
        </span>
      </div>
    );
  }

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0 rounded-full border text-[10px] font-bold leading-4',
        tone,
        className,
      )}
    >
      {tier}
      <span className="opacity-70 font-semibold">· {pct}%</span>
    </span>
  );
}

export default AgentCapacityBadge;