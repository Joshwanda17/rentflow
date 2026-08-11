import { ChevronRight, TrendingUp, Building2 } from 'lucide-react';
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
  const isNearComplete = progressPct >= 95;
  const progressBarColor = isNearComplete ? 'bg-success' : 'bg-primary';
  const roiPeriodLabel = a.isMonthlyCycle ? 'Monthly ROI' : `${a.cycleDays}-day ROI`;

  const remainingLabel = (() => {
    if (a.daysToPayout === null) return null;
    if (a.daysToPayout <= 0) return 'Cycle completing today';
    return `${a.daysToPayout} day${a.daysToPayout === 1 ? '' : 's'} remaining`;
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { hapticTap(); onView(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hapticTap(); onView(); } }}
      className="group relative overflow-hidden cursor-pointer rounded-[24px] border border-border/60 bg-card shadow-sm hover:shadow-lg hover:border-primary transition-all p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 touch-manipulation active:scale-[0.99]"
    >
      {/* Left: identity */}
      <div className="flex items-center gap-4 sm:gap-5 flex-1 min-w-0">
        <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl shrink-0 grid place-items-center bg-primary/10 text-primary group-hover:shadow-md group-hover:bg-primary/15 transition-all">
          <Building2 className="w-6 h-6 sm:w-8 sm:h-8 transition-transform duration-500 group-hover:scale-110" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Tenant capital</p>
          <h3 className="font-bold text-foreground text-base truncate group-hover:text-primary transition-colors">
            {reference}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
            <span className={`text-[10px] font-bold uppercase ${s.text}`}>{s.label}</span>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {a.monthlyRoiPct}% · {roiPeriodLabel}
            </span>
          </div>

          {isActive && (
            <div className="mt-3 w-full">
              <div className="flex justify-between text-[10px] font-semibold mb-1">
                <span className="text-muted-foreground">Cycle progress</span>
                {remainingLabel && <span className="text-primary">{remainingLabel}</span>}
              </div>
              <div
                className="w-full h-1.5 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct}
                aria-label="Payout cycle progress"
              >
                <div className={`h-full ${progressBarColor} rounded-full transition-all duration-1000`} style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: value & yield */}
      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
        <div className="sm:text-right min-w-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Principal</p>
          <p className="font-bold text-xl sm:text-2xl tracking-tight text-foreground break-words leading-tight">
            {formatUGX(a.deployed)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs sm:text-sm font-bold bg-success/10 text-success">
            <TrendingUp className="w-3.5 h-3.5" />
            {isActive ? `+${formatUGX(a.dailyAccrual)}` : '—'}
          </span>
          <span className="hidden sm:grid w-8 h-8 place-items-center rounded-full bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
            <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </div>
  );
}
