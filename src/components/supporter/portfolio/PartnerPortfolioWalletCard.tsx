import { useMemo } from 'react';
import { usePartnerPortfolios } from '@/hooks/usePartnerPortfolios';
import { computeAccrual, normalizePortfolioState } from '@/lib/portfolioAccrual';
import { formatUGX } from '@/lib/rentCalculations';
import { generateWelileAiId } from '@/lib/welileAiId';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import welileLogo from '@/assets/welile-logo.png';

/**
 * Premium bank-card style summary of the partner's deployed capital.
 * Additive card — does not replace the wallet hero card.
 */
export function PartnerPortfolioWalletCard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { portfolios, loading } = usePartnerPortfolios();

  const active = useMemo(
    () => portfolios.filter(p => normalizePortfolioState(p.status) === 'active'),
    [portfolios]
  );

  const totalPrincipal = useMemo(
    () => active.reduce((sum, p: any) => sum + Number(p.investment_amount || 0), 0),
    [active]
  );

  const nextPayout = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dates = active
      .map(p => computeAccrual(p).nextPayoutDate)
      .filter((d): d is Date => !!d && d.getTime() >= today.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    return dates[0] ?? null;
  }, [active]);

  const payoutLabel = nextPayout
    ? `${String(nextPayout.getDate()).padStart(2, '0')}/${String(nextPayout.getMonth() + 1).padStart(2, '0')}`
    : '--/--';

  const aiId = user?.id ? generateWelileAiId(user.id) : '';
  const name = (profile?.full_name || '').trim();

  if (loading) {
    return <div className="w-full aspect-[16/9] max-h-[210px] rounded-[20px] bg-muted animate-pulse" />;
  }

  return (
    <div
      className="w-full aspect-[16/9] max-h-[210px] rounded-[20px] p-[18px] flex flex-col justify-between shadow-md text-white overflow-hidden"
      style={{ background: 'linear-gradient(135deg, hsl(262 78% 58%) 0%, hsl(272 72% 46%) 100%)' }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <img
          src={welileLogo}
          alt="Welile"
          className="h-5 w-auto object-contain brightness-0 invert"
        />
        <p className="text-[10px] font-semibold tracking-[0.12em] text-white/75 text-right">
          WELILE AI ID {aiId}
        </p>
      </div>

      {/* Amount + next payout */}
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-none">
          {formatUGX(totalPrincipal)}
        </p>
        <div className="text-right shrink-0">
          <p className="text-[9px] font-semibold tracking-[0.14em] text-white/70 leading-none mb-1">NEXT PAYOUT</p>
          <p className="text-sm font-bold leading-none">{payoutLabel}</p>
        </div>
      </div>

      {/* Partner name */}
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/90 truncate">
        {name}
      </p>
    </div>
  );
}
