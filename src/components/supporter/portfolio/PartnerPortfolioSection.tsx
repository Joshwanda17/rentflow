import { useMemo } from 'react';
import { usePartnerPortfolios } from '@/hooks/usePartnerPortfolios';
import { computeAccrual, summarizeAccruals, normalizePortfolioState } from '@/lib/portfolioAccrual';
import { PortfolioSummary } from './PortfolioSummary';
import { ActivePortfolioCard } from './ActivePortfolioCard';
import { PortfolioSkeleton, PortfolioEmptyState, PortfolioErrorState } from './PortfolioStates';

interface Props {
  /** Opens the existing portfolio/deployed-capital drawer */
  onViewPortfolios: () => void;
  /** Scrolls to the existing Capital Opportunities section */
  onExploreOpportunities: () => void;
}

export function PartnerPortfolioSection({ onViewPortfolios, onExploreOpportunities }: Props) {
  const { portfolios, loading, error, refetch } = usePartnerPortfolios();

  const visible = useMemo(() => {
    const order = { active: 0, pending: 1, paused: 2, matured: 3, withdrawn: 4 } as const;
    return portfolios
      .filter(p => normalizePortfolioState(p.status) !== 'withdrawn')
      .sort((a, b) => order[normalizePortfolioState(a.status)] - order[normalizePortfolioState(b.status)]);
  }, [portfolios]);

  const summary = useMemo(() => summarizeAccruals(visible.map(computeAccrual)), [visible]);

  const showViewAll = visible.length > 1;

  return (
    <div id="your-portfolio" className="space-y-3 scroll-mt-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-success" />
          <h2 className="text-sm font-black text-foreground tracking-tight">Your Portfolio</h2>
        </div>
        {showViewAll && !loading && !error && (
          <button onClick={onViewPortfolios} className="text-[11px] font-semibold text-primary touch-manipulation">
            View all
          </button>
        )}
      </div>

      {loading ? (
        <PortfolioSkeleton />
      ) : error ? (
        <PortfolioErrorState onRetry={refetch} />
      ) : visible.length === 0 ? (
        <PortfolioEmptyState onExplore={onExploreOpportunities} />
      ) : (
        <>
          {summary.activeCount > 0 && (
            <PortfolioSummary
              totalDeployed={summary.totalDeployed}
              activeCount={summary.activeCount}
              accruedToday={summary.accruedToday}
              cycleAccrued={summary.cycleAccrued}
              expectedMonthlyReturn={summary.expectedMonthlyReturn}
              monthlyWording={summary.allMonthly}
            />
          )}

          {visible.length === 1 ? (
            <ActivePortfolioCard portfolio={visible[0]} onView={onViewPortfolios} />
          ) : (
            <div className="-mx-3 xs:-mx-4 px-3 xs:px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visible.map(p => (
                <div key={p.id} className="snap-start shrink-0 w-[86%]">
                  <ActivePortfolioCard portfolio={p} onView={onViewPortfolios} />
                </div>
              ))}
            </div>
          )}

          {showViewAll && (
            <button
              onClick={onViewPortfolios}
              className="w-full py-2.5 rounded-xl border border-border/60 text-xs font-bold text-foreground active:scale-[0.98] transition-transform touch-manipulation min-h-[40px]"
            >
              View all portfolios ({visible.length})
            </button>
          )}
        </>
      )}
    </div>
  );
}
