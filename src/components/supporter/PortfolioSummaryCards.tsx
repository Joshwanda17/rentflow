import { useState } from 'react';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { InvestmentBreakdownSheet } from '@/components/supporter/InvestmentBreakdownSheet';
import { hapticTap } from '@/lib/haptics';
import { formatUGX } from '@/lib/rentCalculations';

interface PortfolioSummaryCardsProps {
  housesFunded: number;
  rentSecured: number;
  walletBalance: number;
  portfolioHealth: 'stable' | 'at_risk' | 'growing';
}

export function PortfolioSummaryCards({ housesFunded, rentSecured, walletBalance }: PortfolioSummaryCardsProps) {
  const [showWallet, setShowWallet] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const totalReturn = rentSecured * 0.15;

  return (
    <>
      <div className="portfolio-summary-card rounded-3xl p-4 xs:p-5 sm:p-6 relative overflow-hidden">
        {/* Decorative circles — pure CSS */}
        <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/[0.08] pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-white/[0.05] pointer-events-none" />

        <div className="relative z-10 space-y-3 xs:space-y-4 sm:space-y-5">
          {/* Main balance */}
          <div>
            <p className="wallet-label-text text-xs xs:text-sm uppercase tracking-widest font-bold mb-1.5">
              💰 Wallet Balance
            </p>
            <button
              onClick={() => { hapticTap(); setShowWallet(true); }}
              className="flex items-center gap-2 group cursor-pointer min-h-[44px]"
            >
              <svg className="h-6 w-6 xs:h-7 xs:w-7 wallet-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
              </svg>
              <p className="wallet-balance-text text-2xl xs:text-3xl sm:text-4xl font-black tracking-tight break-all">
                {formatUGX(walletBalance)}
              </p>
            </button>
          </div>

          {/* Stats row — pure CSS grid */}
          <div className="grid grid-cols-3 gap-1 xs:gap-1.5 sm:gap-2.5">
            <div className="portfolio-stat-cell flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 py-2 xs:px-2 xs:py-2.5 sm:px-3 sm:py-3 rounded-xl xs:rounded-2xl">
              <span className="text-base xs:text-lg sm:text-xl">🏠</span>
              <p className="wallet-balance-text text-lg xs:text-xl sm:text-2xl font-black leading-none">{housesFunded}</p>
              <p className="wallet-label-text text-[8px] xs:text-[9px] sm:text-[11px] uppercase tracking-wider font-semibold">Houses</p>
            </div>

            <div className="portfolio-stat-cell flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 py-2 xs:px-2 xs:py-2.5 sm:px-3 sm:py-3 rounded-xl xs:rounded-2xl">
              <span className="text-base xs:text-lg sm:text-xl">📈</span>
              <p className="wallet-balance-text text-xs xs:text-sm sm:text-lg font-black leading-none break-all">{formatUGX(totalReturn)}</p>
              <p className="wallet-label-text text-[8px] xs:text-[9px] sm:text-[11px] uppercase tracking-wider font-semibold">Return</p>
            </div>

            <button
              onClick={() => { hapticTap(); setShowBreakdown(true); }}
              className="portfolio-stat-cell flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 py-2 xs:px-2 xs:py-2.5 sm:px-3 sm:py-3 rounded-xl xs:rounded-2xl hover:bg-white/25 active:scale-95 transition-all cursor-pointer"
            >
              <span className="text-base xs:text-lg sm:text-xl">🏦</span>
              <p className="wallet-balance-text text-xs xs:text-sm sm:text-base font-black leading-none break-all">{formatUGX(rentSecured)}</p>
              <p className="wallet-label-text text-[8px] xs:text-[9px] sm:text-[11px] uppercase tracking-wider font-semibold">Invested ›</p>
            </button>
          </div>
        </div>
      </div>

      {showWallet && <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />}
      {showBreakdown && <InvestmentBreakdownSheet open={showBreakdown} onOpenChange={setShowBreakdown} />}
    </>
  );
}
