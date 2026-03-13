import { useState } from 'react';
import { InvestmentBreakdownSheet } from '@/components/supporter/InvestmentBreakdownSheet';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { hapticTap } from '@/lib/haptics';
import { useCurrency } from '@/hooks/useCurrency';
import { formatUGX } from '@/lib/rentCalculations';
import { Wallet, ChevronRight } from 'lucide-react';

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
  const { formatAmount, formatAmountCompact } = useCurrency();

  const investmentBasedHouses = rentSecured > 0 ? Math.max(1, Math.floor(rentSecured / 300000)) : 0;
  const displayHouses = Math.max(housesFunded, investmentBasedHouses);

  return (
    <>
      <div className="portfolio-summary-card rounded-2xl p-4 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/[0.06] pointer-events-none" />

        <div className="relative z-10 space-y-4">
          {/* Rent Money — Hero */}
          <button
            onClick={() => { hapticTap(); setShowWallet(true); }}
            className="w-full text-left min-h-[44px] group"
          >
            <p className="wallet-label-text text-[10px] uppercase tracking-[0.15em] font-semibold mb-1 flex items-center gap-1.5">
              <Wallet className="h-3 w-3 opacity-70" />
              Rent Money
            </p>
            <p className="wallet-balance-text text-[clamp(1.1rem,5.5vw,1.75rem)] font-extrabold tracking-tight leading-none">
              {formatAmount(walletBalance)}
            </p>
          </button>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Houses */}
            <div className="portfolio-stat-cell rounded-xl px-2 py-2.5 text-center">
              <p className="wallet-balance-text text-xl font-extrabold leading-none">{displayHouses}</p>
              <p className="wallet-label-text text-[8px] uppercase tracking-[0.12em] font-semibold mt-1">Houses</p>
            </div>

            {/* Monthly Return */}
            <div className="portfolio-stat-cell rounded-xl px-1.5 py-2.5 text-center overflow-hidden">
              <p className="wallet-balance-text text-sm font-extrabold leading-none truncate" title={formatAmount(totalReturn)}>
                {formatAmount(totalReturn)}
              </p>
              <p className="wallet-label-text text-[8px] uppercase tracking-[0.12em] font-semibold mt-1">Return/mo</p>
            </div>

            {/* Supported — Opens breakdown */}
            <button
              onClick={() => { hapticTap(); setShowBreakdown(true); }}
              className="portfolio-stat-cell rounded-xl px-1.5 py-2.5 text-center overflow-hidden hover:bg-white/25 active:scale-95 transition-all cursor-pointer"
            >
              <p className="wallet-balance-text text-sm font-extrabold leading-none truncate" title={formatAmount(rentSecured)}>
                {formatAmount(rentSecured)}
              </p>
              <p className="wallet-label-text text-[8px] uppercase tracking-[0.12em] font-semibold mt-1 flex items-center justify-center gap-0.5">
                Supported
                <ChevronRight className="h-2.5 w-2.5" />
              </p>
            </button>
          </div>
        </div>
      </div>

      {showBreakdown && <InvestmentBreakdownSheet open={showBreakdown} onOpenChange={setShowBreakdown} />}
      {showWallet && <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />}
    </>
  );
}
