import { motion } from 'framer-motion';
import { TrendingUp, ChevronRight, Users, UserCheck, Loader2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useOpportunitySummary } from '@/hooks/useOpportunitySummary';

interface OpportunityHeroButtonProps {
  onClick: () => void;
}

export function OpportunityHeroButton({ onClick }: OpportunityHeroButtonProps) {
  const { summary, loading } = useOpportunitySummary();

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="w-full rounded-2xl bg-gradient-to-r from-primary via-primary/90 to-primary/80 text-primary-foreground p-5 shadow-xl shadow-primary/25 touch-manipulation text-left relative overflow-hidden"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10">
        {/* Top row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-white/20">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="font-bold text-base">OPPORTUNITIES</span>
          </div>
          <ChevronRight className="h-5 w-5 opacity-70" />
        </div>

        {/* Main amount */}
        {loading ? (
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-5 w-5 animate-spin opacity-60" />
            <span className="text-sm opacity-70">Loading...</span>
          </div>
        ) : summary ? (
          <>
            <p className="text-sm opacity-80 mb-1">Total Rent Requests</p>
            <p className="text-3xl font-black tracking-tight mb-3">
              {formatUGX(Number(summary.total_rent_requested))}
            </p>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs opacity-80">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {summary.total_requests} requests
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {summary.total_landlords} landlords
              </span>
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                {summary.total_agents} agents
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm opacity-80 mb-1">Total Rent Requests</p>
            <p className="text-2xl font-black tracking-tight mb-1">
              View Opportunities
            </p>
            <p className="text-xs opacity-60">Tap to explore available opportunities</p>
          </>
        )}
      </div>
    </motion.button>
  );
}
