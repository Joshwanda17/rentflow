import { motion } from 'framer-motion';
import { useCurrency } from '@/hooks/useCurrency';
import { TrendingUp, Home, Shield } from 'lucide-react';

interface PortfolioSummaryCardsProps {
  housesFunded: number;
  rentSecured: number;
  portfolioHealth: 'stable' | 'at_risk' | 'growing';
}

export function PortfolioSummaryCards({ housesFunded, rentSecured, portfolioHealth }: PortfolioSummaryCardsProps) {
  const { formatAmount } = useCurrency();

  const healthConfig = {
    stable: { label: 'Stable', color: 'text-success', dot: 'bg-success', bg: 'bg-success/10' },
    growing: { label: 'Growing', color: 'text-primary', dot: 'bg-primary', bg: 'bg-primary/10' },
    at_risk: { label: 'At Risk', color: 'text-destructive', dot: 'bg-destructive', bg: 'bg-destructive/10' },
  };

  const health = healthConfig[portfolioHealth];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-3xl bg-gradient-to-br from-primary via-primary/95 to-primary/85 text-primary-foreground p-5 shadow-xl shadow-primary/20 relative overflow-hidden"
    >
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-28 h-28 bg-white/8 rounded-full" />
      <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-white/5 rounded-full" />

      <div className="relative z-10">
        {/* Main balance */}
        <p className="text-xs opacity-70 uppercase tracking-widest font-semibold mb-1">Total Rent Secured</p>
        <p className="text-3xl font-black tracking-tight mb-4">{formatAmount(rentSecured)}</p>

        {/* Stats row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/12 backdrop-blur-sm">
            <Home className="h-4 w-4 opacity-80" />
            <div>
              <p className="text-lg font-black leading-none">{housesFunded}</p>
              <p className="text-[9px] opacity-60 uppercase tracking-wider">Houses</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/12 backdrop-blur-sm">
            <TrendingUp className="h-4 w-4 opacity-80" />
            <div>
              <p className="text-lg font-black leading-none">{formatAmount(rentSecured * 0.12)}</p>
              <p className="text-[9px] opacity-60 uppercase tracking-wider">Est. Return</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/12 backdrop-blur-sm">
            <Shield className="h-4 w-4 opacity-80" />
            <div>
              <div className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${health.dot} animate-pulse`} />
                <p className="text-xs font-bold leading-none">{health.label}</p>
              </div>
              <p className="text-[9px] opacity-60 uppercase tracking-wider">Health</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
