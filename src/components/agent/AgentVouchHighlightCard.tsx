import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, ShieldCheck, Sparkles, ChevronRight, ChevronDown, Info, Clock } from 'lucide-react';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { generateWelileAiId } from '@/lib/welileAiId';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
}

/**
 * Premium "Welile Vouches" highlight card on the Agent dashboard.
 * - Headline: vouch amount (borrowing_limit_ugx)
 * - Sub: trust score + tier
 * - Expandable section: explains the calculation (healthy ratio, collection rate, tier)
 * - AI ID chip: navigates to /profile/WEL-XXXXXX
 */
export function AgentVouchHighlightCard({ userId }: Props) {
  const navigate = useNavigate();
  const aiId = userId ? generateWelileAiId(userId) : undefined;
  const { profile, loading } = useTrustProfile(aiId);
  const [expanded, setExpanded] = useState(false);

  if (loading && !profile) return null;
  if (!profile) return null;

  const vouch = profile.trust.borrowing_limit_ugx ?? 0;
  const score = Math.round(profile.trust.score ?? 0);
  const tier = profile.trust.tier || 'building';
  const isTopAgent = !!profile.agent_performance?.top_performing;
  const ap = profile.agent_performance;

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  const healthyPct = ap ? Math.round(ap.healthy_ratio * 100) : 0;
  const collectionPct = ap ? Math.round(ap.collection_rate * 100) : 0;
  const monthlyBook = ap?.monthly_book ?? 0;
  const agentTerm = ap ? Math.round(monthlyBook * ap.healthy_ratio * 0.4) : 0;
  const qualifying = ap?.qualifying_tenants ?? 0;
  const healthy = ap?.healthy_tenants ?? 0;

  // Tier thresholds (must mirror trust scoring scale)
  const tierThresholds = [
    { key: 'excellent', label: 'Excellent', min: 80 },
    { key: 'good', label: 'Good', min: 60 },
    { key: 'fair', label: 'Fair', min: 40 },
    { key: 'building', label: 'Building', min: 0 },
  ];
  const currentTier = tierThresholds.find((t) => score >= t.min) ?? tierThresholds[3];
  const nextTier = [...tierThresholds].reverse().find((t) => t.min > score);

  const goToProfile = () => {
    hapticTap();
    if (aiId) navigate(`/profile/${aiId}`);
  };

  // Data freshness — `generated_at` is when the trust RPC computed this snapshot.
  const generatedAt = profile.generated_at ? new Date(profile.generated_at) : null;
  const fmtFull = (d: Date) =>
    d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  const fmtRelative = (d: Date) => {
    const diffMs = Date.now() - d.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticTap();
    setExpanded((v) => !v);
  };

  return (
    <div className="w-full rounded-2xl relative overflow-hidden border border-primary/25 bg-gradient-to-br from-primary/12 via-primary/[0.06] to-emerald-500/10">
      {/* Decorative shimmer */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-emerald-500/15 blur-2xl" />

      {/* Header row — tappable for expand */}
      <button
        onClick={toggle}
        aria-expanded={expanded}
        className="relative w-full text-left p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <div className="h-12 w-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
          <ShieldCheck className="h-6 w-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-primary/80">
              Welile Vouches For You
            </p>
            {isTopAgent && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                <Sparkles className="h-2.5 w-2.5" />
                TOP AGENT
              </span>
            )}
          </div>
          <p className="text-[clamp(1.1rem,5vw,1.6rem)] font-black tracking-tight leading-none mt-1 text-foreground truncate">
            {vouch > 0 ? `Up to ${formatUGX(vouch)}` : 'Build your vouch limit'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 truncate flex items-center gap-1">
            Trust Score <span className="font-semibold text-foreground">{score}</span>
            <span>·</span>
            <span className="font-semibold text-foreground">{tierLabel}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-0.5 text-primary font-medium">
              {expanded ? 'Hide details' : 'How it works'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
            </span>
          </p>
        </div>

        {/* AI ID chip — separate tap target */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); goToProfile(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); goToProfile(); } }}
          className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-full bg-primary/15 border border-primary/25 hover:bg-primary/25 transition-colors cursor-pointer"
        >
          <Fingerprint className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">AI ID</span>
          <ChevronRight className="h-3 w-3 text-primary" />
        </span>
      </button>

      {/* Expandable explainer */}
      {expanded && (
        <div className="relative border-t border-primary/15 bg-background/40 backdrop-blur-sm px-4 py-3.5 space-y-3">
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-px" />
            <span>
              Your vouch limit grows when your tenants pay on schedule. Welile uses three signals from your portfolio:
            </span>
          </p>

          {/* Healthy ratio */}
          <MetricRow
            label="Healthy tenants"
            sub={qualifying >= 3
              ? `${healthy} of ${qualifying} paying ≥50% of daily expectation`
              : `Need ≥3 tenants active 30+ days (you have ${qualifying})`}
            value={qualifying >= 3 ? `${healthyPct}%` : '—'}
            pct={qualifying >= 3 ? healthyPct : 0}
            tone={healthyPct >= 80 ? 'good' : healthyPct >= 50 ? 'mid' : 'low'}
          />

          {/* Collection rate */}
          <MetricRow
            label="Collection rate (30d)"
            sub="Total collected vs. expected across qualifying tenants"
            value={qualifying >= 3 ? `${collectionPct}%` : '—'}
            pct={qualifying >= 3 ? collectionPct : 0}
            tone={collectionPct >= 80 ? 'good' : collectionPct >= 50 ? 'mid' : 'low'}
          />

          {/* Tier ladder */}
          <div className="rounded-xl border border-border/50 bg-card/60 p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Trust Tier</p>
              <p className="text-[11px] font-bold text-foreground">
                {currentTier.label}
                <span className="text-muted-foreground font-normal"> · {score}/100</span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              {tierThresholds.slice().reverse().map((t) => {
                const reached = score >= t.min;
                const active = t.key === currentTier.key;
                return (
                  <div
                    key={t.key}
                    className={cn(
                      'flex-1 text-center rounded-md py-1 text-[9px] font-bold uppercase tracking-wider border',
                      active && 'bg-primary text-primary-foreground border-primary',
                      !active && reached && 'bg-primary/10 text-primary border-primary/30',
                      !reached && 'bg-muted/40 text-muted-foreground border-border/50',
                    )}
                  >
                    {t.label}
                  </div>
                );
              })}
            </div>
            {nextTier && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {nextTier.min - score} more points to reach <span className="font-semibold text-foreground">{nextTier.label}</span>
              </p>
            )}
          </div>

          {/* Vouch math */}
          {qualifying >= 3 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-400 mb-1">
                Why your vouch is {formatUGX(vouch)}
              </p>
              <p className="text-[11px] text-foreground/80 leading-relaxed">
                Monthly tenant book <span className="font-semibold">{formatUGX(monthlyBook)}</span>
                <span className="mx-1">×</span>
                healthy ratio <span className="font-semibold">{healthyPct}%</span>
                <span className="mx-1">×</span>
                <span className="font-semibold">40%</span>
                <span className="mx-1">=</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatUGX(agentTerm)}</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Welile vouches the larger of this number and your other trust signals.
              </p>
            </div>
          )}

          <button
            onClick={goToProfile}
            className="w-full mt-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-wider active:scale-95 transition-transform"
          >
            <Fingerprint className="h-3.5 w-3.5" />
            Open full Trust Profile
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

interface MetricRowProps {
  label: string;
  sub: string;
  value: string;
  pct: number;
  tone: 'good' | 'mid' | 'low';
}

function MetricRow({ label, sub, value, pct, tone }: MetricRowProps) {
  const barColor =
    tone === 'good' ? 'bg-emerald-500' : tone === 'mid' ? 'bg-primary' : 'bg-amber-500';
  const valueColor =
    tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'mid' ? 'text-primary' : 'text-amber-600 dark:text-amber-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-foreground">{label}</p>
        <p className={cn('text-[11px] font-bold tabular-nums', valueColor)}>{value}</p>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

export default AgentVouchHighlightCard;
