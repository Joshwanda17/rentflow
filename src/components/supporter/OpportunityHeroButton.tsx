import { motion } from 'framer-motion';
import { TrendingUp, ChevronRight, Shield, Zap, Loader2 } from 'lucide-react';
import { useOpportunitySummary } from '@/hooks/useOpportunitySummary';
import { useCurrency } from '@/hooks/useCurrency';

interface OpportunityHeroButtonProps {
  onClick: () => void;
}

export function OpportunityHeroButton({ onClick }: OpportunityHeroButtonProps) {
  const { summary, loading } = useOpportunitySummary();
  const { formatAmount } = useCurrency();

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="w-full rounded-2xl bg-gradient-to-r from-primary via-primary/90 to-primary/80 text-primary-foreground p-5 shadow-xl shadow-primary/25 touch-manipulation text-left relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-white/20">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="font-bold text-sm uppercase tracking-wide">Capital Opportunity</span>
          </div>
          <ChevronRight className="h-5 w-5 opacity-70" />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-5 w-5 animate-spin opacity-60" />
            <span className="text-sm opacity-70">Loading...</span>
          </div>
        ) : summary ? (
          <>
            <p className="text-xs opacity-70 mb-0.5">Active Rent Demand</p>
            <p className="text-3xl font-black tracking-tight mb-1">
              {formatAmount(Number(summary.total_rent_requested))}
            </p>
            <p className="text-[10px] opacity-60 mb-2">
              Last updated {new Date(summary.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>

            <div className="flex items-center gap-4 text-[11px] opacity-80">
              <span className="flex items-center gap-1 font-semibold">
                <TrendingUp className="h-3 w-3" />
                Up to 15% monthly
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                24–72h deploy
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Verified
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm opacity-80 mb-1">Deploy Capital for Returns</p>
            <p className="text-2xl font-black tracking-tight mb-1">View Opportunities</p>
            <p className="text-xs opacity-60">Tap to explore verified rent requests</p>
          </>
        )}
      </div>
    </motion.button>
  );
}
