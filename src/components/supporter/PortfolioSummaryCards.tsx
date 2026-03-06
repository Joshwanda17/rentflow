import { useState } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { TrendingUp, Home, Shield, Wallet, PiggyBank } from 'lucide-react';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { hapticTap } from '@/lib/haptics';

interface PortfolioSummaryCardsProps {
  housesFunded: number;
  rentSecured: number;
  walletBalance: number;
  portfolioHealth: 'stable' | 'at_risk' | 'growing';
}

export function PortfolioSummaryCards({ housesFunded, rentSecured, walletBalance, portfolioHealth }: PortfolioSummaryCardsProps) {
  const { formatAmount } = useCurrency();
  const [showWallet, setShowWallet] = useState(false);

  const healthConfig = {
    stable: { label: 'Stable', color: 'text-success', dot: 'bg-success', bg: 'bg-success/10' },
    growing: { label: 'Growing', color: 'text-primary', dot: 'bg-primary', bg: 'bg-primary/10' },
    at_risk: { label: 'At Risk', color: 'text-destructive', dot: 'bg-destructive', bg: 'bg-destructive/10' },
  };

  const health = healthConfig[portfolioHealth];

  // Return is 15% of total rent contributed (cumulative across all investments)
  const totalReturn = rentSecured * 0.15;

  return (
    <>
      <div
        className="rounded-3xl bg-gradient-to-br from-primary via-primary/95 to-primary/85 text-primary-foreground p-4 xs:p-5 sm:p-6 shadow-xl shadow-primary/20 relative overflow-hidden"
      >
        {/* Decorative circles — hidden on save-data */}
        <div className="absolute -top-8 -right-8 w-28 h-28 bg-white/8 rounded-full save-data:hidden" />
        <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-white/5 rounded-full save-data:hidden" />

        <div className="relative z-10 space-y-3 xs:space-y-4 sm:space-y-5">
          {/* Main balance — wallet balance */}
          <div>
            <p className="text-xs xs:text-sm opacity-80 uppercase tracking-widest font-bold mb-1.5">💰 Wallet Balance</p>
            <button
              onClick={() => { hapticTap(); setShowWallet(true); }}
              className="flex items-center gap-2 group cursor-pointer min-h-[44px]"
            >
              <Wallet className="h-6 w-6 xs:h-7 xs:w-7 opacity-70 group-hover:opacity-100 transition-opacity" />
              <p className="text-2xl xs:text-3xl sm:text-4xl font-black tracking-tight break-all">{formatAmount(walletBalance)}</p>
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-1 xs:gap-1.5 sm:gap-2.5">
            <div className="flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 py-2 xs:px-2 xs:py-2.5 sm:px-3 sm:py-3 rounded-xl xs:rounded-2xl bg-white/15">
              <Home className="h-4 w-4 xs:h-5 xs:w-5 sm:h-6 sm:w-6 opacity-90" />
              <p className="text-lg xs:text-xl sm:text-2xl font-black leading-none">{housesFunded}</p>
              <p className="text-[8px] xs:text-[9px] sm:text-[11px] opacity-70 uppercase tracking-wider font-semibold">Houses</p>
            </div>

            <div className="flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 py-2 xs:px-2 xs:py-2.5 sm:px-3 sm:py-3 rounded-xl xs:rounded-2xl bg-white/15">
              <TrendingUp className="h-4 w-4 xs:h-5 xs:w-5 sm:h-6 sm:w-6 opacity-90" />
              <p className="text-xs xs:text-sm sm:text-lg font-black leading-none break-all">{formatAmount(totalReturn)}</p>
              <p className="text-[8px] xs:text-[9px] sm:text-[11px] opacity-70 uppercase tracking-wider font-semibold">Return</p>
            </div>

            <div className="flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 py-2 xs:px-2 xs:py-2.5 sm:px-3 sm:py-3 rounded-xl xs:rounded-2xl bg-white/15">
              <PiggyBank className="h-4 w-4 xs:h-5 xs:w-5 sm:h-6 sm:w-6 opacity-90" />
              <p className="text-xs xs:text-sm sm:text-base font-black leading-none break-all">{formatAmount(rentSecured)}</p>
              <p className="text-[8px] xs:text-[9px] sm:text-[11px] opacity-70 uppercase tracking-wider font-semibold">Invested</p>
            </div>
          </div>
        </div>
      </div>

      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />
    </>
  );
}
