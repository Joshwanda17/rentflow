import { formatUGX } from '@/lib/rentCalculations';

interface Props {
  totalDeployed: number;
  activeCount: number;
  accruedToday: number;
  cycleAccrued: number;
  expectedMonthlyReturn: number;
  monthlyWording: boolean;
}

export function PortfolioSummary({
  totalDeployed, activeCount, accruedToday, cycleAccrued, expectedMonthlyReturn, monthlyWording,
}: Props) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">Your capital is working</p>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-success">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          Capital working
        </span>
      </div>

      <div>
        <p className="text-2xl font-bold tracking-tight text-foreground">{formatUGX(totalDeployed)}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Currently deployed</p>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div>
          <p className="text-sm font-bold text-success">+ {formatUGX(accruedToday)}</p>
          <p className="text-[10px] text-muted-foreground">Accrued today</p>
        </div>
        <div>
          <p className="text-sm font-bold text-success">+ {formatUGX(cycleAccrued)}</p>
          <p className="text-[10px] text-muted-foreground">{monthlyWording ? 'This month' : 'This cycle'}</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <p className="text-[11px] text-muted-foreground">
          {activeCount} active portfolio{activeCount === 1 ? '' : 's'}
        </p>
        <p className="text-[11px] font-semibold text-foreground">
          {formatUGX(expectedMonthlyReturn)}/mo expected
        </p>
      </div>
    </div>
  );
}
