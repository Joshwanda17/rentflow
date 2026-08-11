import { ChevronRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { hapticTap } from '@/lib/haptics';
import type { PortfolioRecord } from '@/hooks/useCapitalOpportunities';
import { computeAccrual, type PortfolioState } from '@/lib/portfolioAccrual';

const stateStyles: Record<PortfolioState, { label: string; text: string; dot: string }> = {
  active: { label: 'ACTIVE', text: 'text-success', dot: 'bg-success' },
  pending: { label: 'PENDING', text: 'text-warning', dot: 'bg-warning' },
  matured: { label: 'MATURED', text: 'text-primary', dot: 'bg-primary' },
  paused: { label: 'PAUSED', text: 'text-muted-foreground', dot: 'bg-muted-foreground/50' },
  withdrawn: { label: 'WITHDRAWN', text: 'text-muted-foreground', dot: 'bg-muted-foreground/40' },
};

export function ActivePortfolioCard({ portfolio, onView }: { portfolio: PortfolioRecord; onView: () => void }) {
  const a = computeAccrual(portfolio);
  const s = stateStyles[a.state];
  const reference = portfolio.portfolio_code || portfolio.account_name || 'Portfolio';
  const isActive = a.state === 'active';
  const progressPct = Math.round(a.cycleProgress * 100);
  const roiPeriodLabel = a.isMonthlyCycle ? 'Monthly ROI' : `${a.cycleDays}-day ROI`;

  const remainingLabel = (() => {
    if (a.daysToPayout === null) return null;
    if (a.daysToPayout <= 0) return 'Cycle completing today';
    return `${a.daysToPayout} day${a.daysToPayout === 1 ? '' : 's'} remaining`;
  })();

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground">TENANT CAPITAL</p>
          <p className="text-sm font-bold text-foreground truncate">{reference}</p>
        </div>
        <span className={`flex items-center gap-1.5 text-[10px] font-semibold shrink-0 ${s.text}`}>
          {s.label}
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
        </span>
      </div>

      <div>
        <p className="text-xl font-bold tracking-tight text-foreground break-words leading-tight">
          {formatUGX(a.deployed)}
        </p>
        <p className="text-[10px] text-muted-foreground">Principal</p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-success break-words">
            {isActive ? `+ ${formatUGX(a.dailyAccrual)}` : '—'}
          </p>
          <p className="text-[10px] text-muted-foreground">Accrued today</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold text-foreground">{a.monthlyRoiPct}%</p>
          <p className="text-[10px] text-muted-foreground">{roiPeriodLabel}</p>
        </div>
      </div>

      {isActive && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">Cycle progress</p>
          <div
            className="h-1.5 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label="Payout cycle progress"
          >
            <div className="h-full bg-success/70 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
          {remainingLabel && <p className="text-[10px] text-muted-foreground">{remainingLabel}</p>}
        </div>
      )}

      <button
        onClick={() => { hapticTap(); onView(); }}
        className="w-full flex items-center justify-center gap-1 py-2.5 rounded-xl border border-border/60 text-xs font-bold text-foreground active:scale-[0.98] transition-transform touch-manipulation min-h-[40px]"
      >
        View portfolio <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
