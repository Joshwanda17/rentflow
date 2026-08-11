import { ChevronRight } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { formatDateOnlyForDisplay } from '@/lib/portfolioDates';
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
  const name = portfolio.account_name || portfolio.portfolio_code || 'Tenant Support Portfolio';
  const isActive = a.state === 'active';

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground">TENANT CAPITAL</p>
          <p className="text-sm font-bold text-foreground truncate">{name}</p>
        </div>
        <span className={`flex items-center gap-1.5 text-[10px] font-semibold shrink-0 ${s.text}`}>
          {s.label}
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xl font-bold tracking-tight text-foreground">{formatUGX(a.deployed)}</p>
          <p className="text-[10px] text-muted-foreground">Deployed capital</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold text-foreground">{a.monthlyRoiPct}%</p>
          <p className="text-[10px] text-muted-foreground">Monthly ROI</p>
        </div>
      </div>

      {isActive && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm font-bold text-success">+ {formatUGX(a.dailyAccrual)}</p>
            <p className="text-[10px] text-muted-foreground">Accrued today</p>
          </div>
          <div>
            <p className="text-sm font-bold text-success">+ {formatUGX(a.cycleAccrued)}</p>
            <p className="text-[10px] text-muted-foreground">{a.isMonthlyCycle ? 'This month' : 'This cycle'}</p>
          </div>
        </div>
      )}

      <div className="space-y-1.5 pt-1 border-t border-border/40">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Expected monthly return</span>
          <span className="text-[11px] font-bold text-foreground">{formatUGX(a.expectedMonthlyReturn)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {a.state === 'matured' ? 'Matured' : 'Next payout'}
          </span>
          <span className="text-[11px] font-bold text-foreground">
            {a.state === 'matured'
              ? formatDateOnlyForDisplay(portfolio.maturity_date)
              : formatDateOnlyForDisplay(portfolio.next_roi_date)}
          </span>
        </div>
        {isActive && a.daysToPayout !== null && a.daysToPayout >= 0 && (
          <p className="text-[10px] text-muted-foreground">
            {a.daysToPayout === 0 ? 'Due today' : `${a.daysToPayout} day${a.daysToPayout === 1 ? '' : 's'} remaining`}
          </p>
        )}
      </div>

      {isActive && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Cycle progress</p>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-success/70 rounded-full" style={{ width: `${Math.round(a.cycleProgress * 100)}%` }} />
          </div>
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
