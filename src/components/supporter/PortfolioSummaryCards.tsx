import { useState } from 'react';
import { motion } from 'framer-motion';
import { useCurrency } from '@/hooks/useCurrency';
import { TrendingUp, Home, Shield, Wallet } from 'lucide-react';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { hapticTap } from '@/lib/haptics';

interface PortfolioSummaryCardsProps {
  housesFunded: number;
  rentSecured: number;
  portfolioHealth: 'stable' | 'at_risk' | 'growing';
}

export function PortfolioSummaryCards({ housesFunded, rentSecured, portfolioHealth }: PortfolioSummaryCardsProps) {
  const { formatAmount } = useCurrency();
  const [showWallet, setShowWallet] = useState(false);

  const healthConfig = {
    stable: { label: 'Stable', color: 'text-success', dot: 'bg-success', bg: 'bg-success/10' },
    growing: { label: 'Growing', color: 'text-primary', dot: 'bg-primary', bg: 'bg-primary/10' },
    at_risk: { label: 'At Risk', color: 'text-destructive', dot: 'bg-destructive', bg: 'bg-destructive/10' },
  };

  const health = healthConfig[portfolioHealth];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-3xl bg-gradient-to-br from-primary via-primary/95 to-primary/85 text-primary-foreground p-6 shadow-xl shadow-primary/20 relative overflow-hidden"
      >
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-28 h-28 bg-white/8 rounded-full" />
        <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-white/5 rounded-full" />

        <div className="relative z-10 space-y-5">
          {/* Main balance with wallet icon */}
          <div>
            <p className="text-sm opacity-80 uppercase tracking-widest font-bold mb-2">💰 Total Rent Contributed</p>
            <button
              onClick={() => { hapticTap(); setShowWallet(true); }}
              className="flex items-center gap-2 group cursor-pointer"
            >
              <Wallet className="h-5 w-5 opacity-70 group-hover:opacity-100 transition-opacity" />
              <p className="text-4xl font-black tracking-tight">{formatAmount(rentSecured)}</p>
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl bg-white/15 backdrop-blur-sm">
              <Home className="h-6 w-6 opacity-90" />
              <p className="text-2xl font-black leading-none">{housesFunded}</p>
              <p className="text-[11px] opacity-70 uppercase tracking-wider font-semibold">Houses</p>
            </div>

            <div className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl bg-white/15 backdrop-blur-sm">
              <TrendingUp className="h-6 w-6 opacity-90" />
              <p className="text-lg font-black leading-none">{formatAmount(rentSecured * 0.12)}</p>
              <p className="text-[11px] opacity-70 uppercase tracking-wider font-semibold">Return</p>
            </div>

            <div className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl bg-white/15 backdrop-blur-sm">
              <Shield className="h-6 w-6 opacity-90" />
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${health.dot} animate-pulse`} />
                <p className="text-base font-black leading-none">{health.label}</p>
              </div>
              <p className="text-[11px] opacity-70 uppercase tracking-wider font-semibold">Health</p>
            </div>
          </div>
        </div>
      </motion.div>

      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />
    </>
  );
}
