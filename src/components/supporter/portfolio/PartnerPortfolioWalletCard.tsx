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
    return <div className="w-full aspect-[354/165] max-h-[240px] rounded-[20px] bg-muted animate-pulse" />;
  }

  return (
    <div className="w-full space-y-3">
      {/* CARD */}
      <div
        className="relative w-full aspect-[354/165] min-h-[150px] max-h-[240px] mx-auto"
        style={{
          filter: 'drop-shadow(0px 8px 22px rgba(99, 26, 186, 0.30))',
          containerType: 'inline-size',
        }}
      >
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 354 165"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="welilePurpleCardGrad" x1="0" y1="0" x2="354" y2="165" gradientUnits="userSpaceOnUse">
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
          style={{ padding: 'min(1.4cqw, 8px) min(4.5cqw, 26px) min(3.8cqw, 22px)' }}
        >
          <div className="flex items-center justify-between">
            <img
              src={welileLogo}
              alt="Welile"
              className="w-auto brightness-0 invert object-contain block"
              style={{ height: 'clamp(12px, 3cqw, 20px)' }}
            />
            <span
              className="font-medium tracking-widest text-white/80 uppercase whitespace-nowrap"
              style={{ fontSize: 'clamp(9px, 2.2cqw, 14px)', paddingRight: 'min(0.5cqw, 4px)' }}
            >
              {aiId}
            </span>
          </div>

          <div className="flex items-end justify-between gap-2" style={{ marginTop: 'min(-0.5cqw, -2px)' }}>
            <div className="flex flex-col">
              <span
                className="font-medium tracking-wider text-white/70 uppercase whitespace-nowrap"
                style={{ fontSize: 'clamp(8px, 2.25cqw, 13px)', marginBottom: 'min(0.6cqw, 4px)' }}
              >
                ACTIVE RENT PRINCIPAL
              </span>
              <div
                className="font-black text-white tracking-tight leading-none whitespace-nowrap"
                style={{
                  fontSize: 'clamp(20px, 6.8cqw, 40px)',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro", "Segoe UI", Roboto, sans-serif',
                }}
              >
                {formatUGX(totalPrincipal)}
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0" style={{ paddingRight: 'min(0.5cqw, 4px)' }}>
              <span
                className="font-medium tracking-wider text-white/70 uppercase text-right whitespace-nowrap"
                style={{ fontSize: 'clamp(8px, 2.25cqw, 13px)', marginBottom: 'min(0.6cqw, 4px)' }}
              >
                NEXT PAYOUT
              </span>
              <div
                className="font-bold text-white/90 leading-none whitespace-nowrap"
                style={{ fontSize: 'clamp(11px, 2.9cqw, 17px)' }}
              >
                {payoutLabel}
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between" style={{ marginTop: 'min(-0.5cqw, -2px)' }}>
            <div className="flex flex-col">
              <span
                className="font-medium tracking-wider text-white/70 uppercase whitespace-nowrap"
                style={{ fontSize: 'clamp(8px, 2cqw, 12px)', marginBottom: 'min(0.4cqw, 3px)' }}
              >
                PARTNER NAME
              </span>
              <span
                className="font-bold tracking-wide text-white uppercase truncate whitespace-nowrap"
                style={{ fontSize: 'clamp(11px, 2.9cqw, 17px)', maxWidth: '52cqw' }}
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
            bottom: 'min(0.8cqw, 6px)',
            right: 'min(1.1cqw, 8px)',
            width: 'clamp(96px, 30cqw, 172px)',
            height: 'clamp(30px, 8.6cqw, 48px)',
            gap: 'min(1.4cqw, 8px)',
            paddingInline: 'min(2cqw, 12px)',
          }}
        >
          <span
            className="rounded-full bg-white flex items-center justify-center shrink-0"
            style={{ width: 'clamp(18px, 5.4cqw, 28px)', height: 'clamp(18px, 5.4cqw, 28px)' }}
          >
            <Plus className="text-black" strokeWidth={3.5} style={{ width: 'clamp(11px, 3.4cqw, 18px)', height: 'clamp(11px, 3.4cqw, 18px)' }} />
          </span>
          <span
            className="tracking-tight text-white font-bold whitespace-nowrap"
            style={{ fontSize: 'clamp(12px, 3.4cqw, 18px)' }}
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
