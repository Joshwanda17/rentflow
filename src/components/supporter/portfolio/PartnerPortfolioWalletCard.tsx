import { useMemo } from 'react';
import { ArrowUp, Check, CreditCard, Menu, Plus } from 'lucide-react';
import { usePartnerPortfolios } from '@/hooks/usePartnerPortfolios';
import { computeAccrual, normalizePortfolioState } from '@/lib/portfolioAccrual';
import { formatUGX } from '@/lib/rentCalculations';
import { generateWelileAiId } from '@/lib/welileAiId';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
const welileLogo = '/welile-colored.png';

const NOTCH_PATH =
  'M 20,0 L 334,0 A 20,20 0 0 1 354,20 L 354,119 A 8,8 0 0 1 346,127 L 241,127 A 8,8 0 0 0 233,135 L 233,145 A 20,20 0 0 1 213,165 L 20,165 A 20,20 0 0 1 0,145 L 0,20 A 20,20 0 0 1 20,0 Z';

interface Props {
  onAddCard?: () => void;
  onSend?: () => void;
  onRequest?: () => void;
  onTopUp?: () => void;
  onMore?: () => void;
}

function ActionButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1">
      <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-card flex items-center justify-center text-foreground/80 shadow-sm border border-border/60 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        {icon}
      </span>
      <span className="text-[10px] sm:text-[11px] font-semibold text-foreground/80">{label}</span>
    </button>
  );
}

/**
 * Premium bank-card style summary of the partner's deployed capital.
 * Additive card — does not replace the wallet hero card.
 */
export function PartnerPortfolioWalletCard({ onAddCard, onSend, onRequest, onTopUp, onMore }: Props) {
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
  const name = (profile?.full_name || '').trim().toUpperCase();

  if (loading) {
    return <div className="w-full aspect-[354/165] rounded-[20px] bg-muted animate-pulse" />;
  }

  return (
    <div className="w-full space-y-3">
      {/* CARD */}
      <div
        className="relative w-full aspect-[354/165]"
        style={{ filter: 'drop-shadow(0px 8px 22px rgba(99, 26, 186, 0.30))', containerType: 'inline-size' }}
      >
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 354 190"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="welilePurpleCardGrad" x1="0" y1="0" x2="354" y2="190" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#7321d4" />
              <stop offset="45%" stopColor="#631aba" />
              <stop offset="85%" stopColor="#6219bb" />
              <stop offset="100%" stopColor="#500fa3" />
            </linearGradient>
          </defs>
          <path d={NOTCH_PATH} fill="url(#welilePurpleCardGrad)" />
        </svg>

        {/* CONTENT */}
        <div
          className="relative z-10 w-full h-full flex flex-col justify-between text-white select-none"
          style={{ padding: '1.4cqw 4.5cqw 3.8cqw' }}
        >
          <div className="flex items-center justify-between">
            <img
              src={welileLogo}
              alt="Welile"
              className="w-auto brightness-0 invert object-contain block"
              style={{ height: '3cqw' }}
            />
            <span
              className="font-medium tracking-widest text-white/80 uppercase whitespace-nowrap"
              style={{ fontSize: '2.2cqw', paddingRight: '0.5cqw' }}
            >
              {aiId}
            </span>
          </div>

          <div className="flex items-end justify-between" style={{ marginTop: '-0.5cqw' }}>
            <div className="flex flex-col">
              <span
                className="font-medium tracking-wider text-white/70 uppercase whitespace-nowrap"
                style={{ fontSize: '2.25cqw', marginBottom: '0.6cqw' }}
              >
                TOTAL PORTFOLIO PRINCIPAL
              </span>
              <div
                className="font-extrabold text-white tracking-tight leading-none whitespace-nowrap"
                style={{ fontSize: '6.8cqw' }}
              >
                {formatUGX(totalPrincipal)}
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0" style={{ paddingLeft: '2cqw', paddingRight: '0.5cqw' }}>
              <span
                className="font-medium tracking-wider text-white/70 uppercase text-right whitespace-nowrap"
                style={{ fontSize: '2.25cqw', marginBottom: '0.6cqw' }}
              >
                NEXT PAYOUT
              </span>
              <div
                className="font-bold text-white/90 leading-none whitespace-nowrap"
                style={{ fontSize: '2.9cqw' }}
              >
                {payoutLabel}
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between" style={{ marginTop: '-0.5cqw' }}>
            <div className="flex flex-col">
              <span
                className="font-medium tracking-wider text-white/70 uppercase whitespace-nowrap"
                style={{ fontSize: '2cqw', marginBottom: '0.4cqw' }}
              >
                PARTNER NAME
              </span>
              <span
                className="font-bold tracking-wide text-white uppercase truncate whitespace-nowrap"
                style={{ fontSize: '2.9cqw', maxWidth: '52cqw' }}
              >
                {name || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* ADD CARD PILL */}
        <button
          type="button"
          onClick={onAddCard}
          className="absolute z-20 bg-black hover:bg-neutral-900 rounded-full flex items-center justify-center border border-white/10 shadow-sm transition active:scale-95"
          style={{
            bottom: '0.8cqw',
            right: '1.1cqw',
            width: '30cqw',
            height: '8.6cqw',
            gap: '1.4cqw',
            paddingInline: '2cqw',
          }}
        >
          <span
            className="rounded-full bg-white flex items-center justify-center shrink-0"
            style={{ width: '5.4cqw', height: '5.4cqw' }}
          >
            <Plus className="text-black" strokeWidth={3.5} style={{ width: '3.4cqw', height: '3.4cqw' }} />
          </span>
          <span
            className="tracking-tight text-white font-bold whitespace-nowrap"
            style={{ fontSize: '3.4cqw' }}
          >
            Add Card
          </span>
        </button>
      </div>

      {/* ACTION ROW */}
      <div className="bg-muted/70 backdrop-blur rounded-2xl p-2.5 shadow-md border border-border/70 flex items-center justify-around">
        <ActionButton label="Send" onClick={onSend} icon={<ArrowUp className="w-4 h-4 rotate-45" />} />
        <ActionButton label="Request" onClick={onRequest} icon={<Check className="w-4 h-4" />} />
        <ActionButton label="TopUp" onClick={onTopUp} icon={<CreditCard className="w-4 h-4" />} />
        <ActionButton label="More" onClick={onMore} icon={<Menu className="w-4 h-4" />} />
      </div>
    </div>
  );
}
