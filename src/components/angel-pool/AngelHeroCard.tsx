import { TrendingUp, Plus, ChevronRight, Sparkles, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TOTAL_POOL_UGX, POOL_PERCENT, TOTAL_SHARES, PRICE_PER_SHARE } from './constants';
import { MOCK_TOTAL_RAISED } from './mockData';

const formatCompact = (n: number) => {
  if (n >= 1_000_000_000) return `UGX ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}K`;
  return `UGX ${n}`;
};

interface AngelHeroCardProps {
  onInvest: () => void;
  onViewPool: () => void;
}

export function AngelHeroCard({ onInvest, onViewPool }: AngelHeroCardProps) {
  const raised = MOCK_TOTAL_RAISED;
  const sharesSold = raised / PRICE_PER_SHARE;
  const sharesRemaining = TOTAL_SHARES - sharesSold;
  const progress = (raised / TOTAL_POOL_UGX) * 100;

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/80 p-5 shadow-2xl shadow-primary/25">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/30 blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/20 blur-2xl translate-y-1/2 -translate-x-1/2" />
        </div>

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-white/80">Angel Pool</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 text-amber-300" />
              <span className="text-xs font-bold text-white">{POOL_PERCENT}% Equity</span>
            </div>
          </div>

          {/* Main balance */}
          <div className="mb-5">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {formatCompact(raised)}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <ArrowUpRight className="h-4 w-4 text-emerald-300" />
              <span className="text-sm font-semibold text-emerald-300">
                {progress.toFixed(1)}% of {formatCompact(TOTAL_POOL_UGX)}
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm text-center">
              <p className="text-lg font-black text-white">{sharesSold.toLocaleString()}</p>
              <p className="text-[10px] font-medium text-white/70 uppercase tracking-wider">Sold</p>
            </div>
            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm text-center">
              <p className="text-lg font-black text-amber-300">{sharesRemaining.toLocaleString()}</p>
              <p className="text-[10px] font-medium text-white/70 uppercase tracking-wider">Left</p>
            </div>
            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm text-center">
              <p className="text-lg font-black text-white">{formatCompact(PRICE_PER_SHARE)}</p>
              <p className="text-[10px] font-medium text-white/70 uppercase tracking-wider">/Share</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              onClick={onInvest}
              className="flex-1 h-12 rounded-2xl bg-white text-primary font-bold text-sm shadow-lg hover:bg-white/95 active:scale-[0.98] transition-all duration-200 gap-2"
            >
              <Plus className="h-4 w-4" />
              Invest Now
            </Button>
            <Button
              onClick={onViewPool}
              variant="ghost"
              className="h-12 px-5 rounded-2xl bg-white/15 text-white font-bold text-sm hover:bg-white/25 active:scale-[0.98] transition-all duration-200 gap-2"
            >
              Pool
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
