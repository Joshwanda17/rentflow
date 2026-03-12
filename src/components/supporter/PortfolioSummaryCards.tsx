import { useState } from 'react';
import { InvestmentBreakdownSheet } from '@/components/supporter/InvestmentBreakdownSheet';
import { WalletDetailsSheet } from '@/components/supporter/WalletDetailsSheet';
import { hapticTap } from '@/lib/haptics';
import { formatUGX } from '@/lib/rentCalculations';
import { Wallet } from 'lucide-react';

interface PortfolioSummaryCardsProps {
  housesFunded: number;
  rentSecured: number;
  walletBalance?: number;
  portfolioHealth: 'stable' | 'at_risk' | 'growing';
  totalReturn?: number;
}

export function PortfolioSummaryCards({ housesFunded, rentSecured, walletBalance = 0, totalReturn = 0 }: PortfolioSummaryCardsProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showWallet, setShowWallet] = useState(false);

  // Calculate houses from investment amount: 1 house per 300,000 UGX invested
  // Use actual houses funded if higher, minimum 1 if any investment exists
  const investmentBasedHouses = rentSecured > 0 ? Math.max(1, Math.floor(rentSecured / 300000)) : 0;
  const displayHouses = Math.max(housesFunded, investmentBasedHouses);

  return (
    <>
      <div className="portfolio-summary-card rounded-3xl p-4 xs:p-5 sm:p-6 relative overflow-hidden">
        {/* Decorative circles — pure CSS */}
        <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/[0.08] pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-white/[0.05] pointer-events-none" />

        <div className="relative z-10 space-y-3 xs:space-y-4 sm:space-y-5">
          {/* Main hero — Wallet Balance */}
          <div>
            <p className="wallet-label-text text-xs xs:text-sm uppercase tracking-widest font-bold mb-1.5 flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Wallet Balance
            </p>
            <button
              onClick={() => {hapticTap();setShowWallet(true);}}
              className="flex items-center gap-2 group cursor-pointer min-h-[44px]">
              
              <Wallet className="h-6 w-6 xs:h-7 xs:w-7 wallet-icon-svg" />
              <p className="wallet-balance-text text-2xl xs:text-3xl sm:text-4xl font-black tracking-tight break-all">
                {formatUGX(walletBalance)}
              </p>
            </button>
          </div>

          {/* Stats row — pure CSS grid */}
          <div className="grid grid-cols-3 gap-1 xs:gap-1.5 sm:gap-2.5">
            <div className="portfolio-stat-cell flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 py-2 xs:px-2 xs:py-2.5 sm:px-3 sm:py-3 rounded-xl xs:rounded-2xl">
              <span className="text-base xs:text-lg sm:text-xl">🏠</span>
              <p className="wallet-balance-text text-lg xs:text-xl sm:text-2xl font-black leading-none">{displayHouses}</p>
              <p className="wallet-label-text text-[8px] xs:text-[9px] sm:text-[11px] uppercase tracking-wider font-semibold">Houses</p>
            </div>

            <div className="portfolio-stat-cell flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 py-2 xs:px-2 xs:py-2.5 sm:px-3 sm:py-3 rounded-xl xs:rounded-2xl">
              <span className="text-base xs:text-lg sm:text-xl">📈</span>
              <p className="wallet-balance-text text-xs xs:text-sm sm:text-lg font-black leading-none break-all">{formatUGX(totalReturn)}</p>
              <p className="wallet-label-text text-[8px] xs:text-[9px] sm:text-[11px] uppercase tracking-wider font-semibold">Return/mo</p>
            </div>

            <button
              onClick={() => {hapticTap();setShowBreakdown(true);}}
              className="portfolio-stat-cell flex flex-col items-center gap-0.5 xs:gap-1 px-1.5 py-2 xs:px-2 xs:py-2.5 sm:px-3 sm:py-3 rounded-xl xs:rounded-2xl hover:bg-white/25 active:scale-95 transition-all cursor-pointer">
              
              <span className="text-base xs:text-lg sm:text-xl">🏦</span>
              <p className="wallet-balance-text text-xs xs:text-sm sm:text-base font-black leading-none break-all">{formatUGX(rentSecured)}</p>
              <p className="wallet-label-text text-[8px] xs:text-[9px] sm:text-[11px] uppercase tracking-wider font-semibold">Supported ›</p>
            </button>
          </div>
        </div>
      </div>

      {showBreakdown && <InvestmentBreakdownSheet open={showBreakdown} onOpenChange={setShowBreakdown} />}
      {showWallet && <WalletDetailsSheet open={showWallet} onOpenChange={setShowWallet} walletBalance={walletBalance} />}
    </>);

}