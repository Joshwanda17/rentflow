import { ArrowDownToLine, ArrowUpFromLine, Target, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';
import { useCFOWalletMission } from '@/hooks/useCFOWalletMission';

// July is monthIndex 6 (0-based). Board-facing CFO mission snapshot.
export function CFOJulyMissionCard() {
  const { data, isLoading } = useCFOWalletMission(2026, 6);

  return (
    <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-center gap-2 mb-1">
        <Target className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">CFO Mission — July 2026</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Show the Board of Directors how much money went into wallets and how much came out of wallets.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-lg bg-background/70 border border-emerald-500/20 p-3">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Money into wallets</span>
            </div>
            <p className="text-base font-black text-foreground mt-1">{formatUGX(data?.intoWallets ?? 0)}</p>
          </div>
          <div className="rounded-lg bg-background/70 border border-amber-500/20 p-3">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Money out of wallets</span>
            </div>
            <p className="text-base font-black text-foreground mt-1">{formatUGX(data?.outOfWallets ?? 0)}</p>
          </div>
        </div>
      )}

      {!isLoading && data && (
        <div className="flex items-center gap-1.5 mt-2.5 text-xs">
          {data.net >= 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className="text-muted-foreground">Net wallet flow:</span>
          <span className={cn('font-bold', data.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
            {data.net >= 0 ? '+' : '−'}{formatUGX(Math.abs(data.net))}
          </span>
        </div>
      )}
    </div>
  );
}
