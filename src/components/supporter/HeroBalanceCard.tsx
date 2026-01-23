import { TrendingUp, Plus, ChevronRight, Sparkles, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatUGX } from '@/lib/rentCalculations';

interface HeroBalanceCardProps {
  totalInvested: number;
  monthlyReturns: number;
  completedRewards: number;
  activeFundings: number;
  onAddInvestment: () => void;
  onViewPortfolio: () => void;
}

export function HeroBalanceCard({
  totalInvested,
  monthlyReturns,
  completedRewards,
  activeFundings,
  onAddInvestment,
  onViewPortfolio,
}: HeroBalanceCardProps) {
  const roiRate = 15;

  return (
    <div className="relative">
      {/* Glass morphism card with gradient */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/80 p-5 shadow-2xl shadow-primary/25">
        {/* Animated background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/30 blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/20 blur-2xl translate-y-1/2 -translate-x-1/2" />
        </div>

        {/* Content */}
        <div className="relative z-10">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-white/80">Total Portfolio</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 text-amber-300" />
              <span className="text-xs font-bold text-white">{roiRate}% ROI</span>
            </div>
          </div>

          {/* Main balance */}
          <div className="mb-5">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {formatUGX(totalInvested)}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <ArrowUpRight className="h-4 w-4 text-emerald-300" />
              <span className="text-sm font-semibold text-emerald-300">
                +{formatUGX(monthlyReturns)}/month
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm text-center">
              <p className="text-lg font-black text-white">{formatUGX(completedRewards)}</p>
              <p className="text-[10px] font-medium text-white/70 uppercase tracking-wider">Earned</p>
            </div>
            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm text-center">
              <p className="text-lg font-black text-white">{activeFundings}</p>
              <p className="text-[10px] font-medium text-white/70 uppercase tracking-wider">Active</p>
            </div>
            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm text-center">
              <p className="text-lg font-black text-amber-300">{roiRate}%</p>
              <p className="text-[10px] font-medium text-white/70 uppercase tracking-wider">Rate</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              onClick={onAddInvestment}
              className="flex-1 h-12 rounded-2xl bg-white text-primary font-bold text-sm shadow-lg hover:bg-white/95 active:scale-[0.98] transition-all duration-200 gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Money
            </Button>
            <Button
              onClick={onViewPortfolio}
              variant="ghost"
              className="h-12 px-5 rounded-2xl bg-white/15 text-white font-bold text-sm hover:bg-white/25 active:scale-[0.98] transition-all duration-200 gap-2"
            >
              Portfolio
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
