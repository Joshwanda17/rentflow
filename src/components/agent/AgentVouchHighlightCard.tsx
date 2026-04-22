import { useNavigate } from 'react-router-dom';
import { Fingerprint, ShieldCheck, Sparkles, ChevronRight } from 'lucide-react';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { generateWelileAiId } from '@/lib/welileAiId';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';

interface Props {
  userId: string;
}

/**
 * Premium "Welile Vouches" highlight card on the Agent dashboard.
 * Surfaces the trust-score-derived vouch amount as the headline number
 * and invites the agent to tap into their full Welile Trust Profile.
 *
 * - Headline: vouch amount (borrowing_limit_ugx) from welile_trust_score_cache
 * - Sub: trust score / tier
 * - CTA: "Open AI ID" → /profile/WEL-XXXXXX
 */
export function AgentVouchHighlightCard({ userId }: Props) {
  const navigate = useNavigate();
  const aiId = userId ? generateWelileAiId(userId) : undefined;
  const { profile, loading } = useTrustProfile(aiId);

  if (loading && !profile) return null;
  if (!profile) return null;

  const vouch = profile.trust.borrowing_limit_ugx ?? 0;
  const score = Math.round(profile.trust.score ?? 0);
  const tier = profile.trust.tier || 'building';
  const isTopAgent = !!profile.agent_performance?.top_performing;

  const handleOpen = () => {
    hapticTap();
    if (aiId) navigate(`/profile/${aiId}`);
  };

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <button
      onClick={handleOpen}
      className="w-full text-left rounded-2xl p-4 relative overflow-hidden border border-primary/25 bg-gradient-to-br from-primary/12 via-primary/[0.06] to-emerald-500/10 hover:border-primary/40 active:scale-[0.985] transition-all"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Decorative shimmer */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-emerald-500/15 blur-2xl" />

      <div className="relative flex items-center gap-3">
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
          <p className="text-[11px] text-muted-foreground mt-1 truncate">
            Trust Score <span className="font-semibold text-foreground">{score}</span>
            <span className="mx-1">·</span>
            <span className="font-semibold text-foreground">{tierLabel}</span>
            <span className="mx-1">·</span>
            Tap to view full profile
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-full bg-primary/15 border border-primary/25">
          <Fingerprint className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">AI ID</span>
          <ChevronRight className="h-3 w-3 text-primary" />
        </div>
      </div>
    </button>
  );
}

export default AgentVouchHighlightCard;
