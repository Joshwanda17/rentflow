import { useMemo } from 'react';
import { usePartnerPortfolios } from '@/hooks/usePartnerPortfolios';
import { computeAccrual, normalizePortfolioState } from '@/lib/portfolioAccrual';
import { ActivePortfolioCard } from './ActivePortfolioCard';
import { PortfolioSkeleton, PortfolioEmptyState, PortfolioErrorState } from './PortfolioStates';

interface Props {
  /** Opens the existing portfolio/deployed-capital drawer */
  onViewPortfolios: (portfolioId?: string) => void;
  /** Scrolls to the existing Capital Opportunities section */
  onExploreOpportunities: () => void;
}

export function PartnerPortfolioSection({ onViewPortfolios, onExploreOpportunities }: Props) {
  const { portfolios, loading, error, refetch } = usePartnerPortfolios();

  /**
   * Dashboard list = ACTIVE portfolios only (matured / withdrawn / paused live in
   * the full portfolio drawer). Newest first. Pending ones are only used as a
   * fallback list so a partner awaiting activation still sees their capital.
   */
  const active = useMemo(() => {
    return portfolios
      .filter(p => normalizePortfolioState(p.status) === 'active')
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [portfolios]);

  const pending = useMemo(() => {
    return portfolios
      .filter(p => normalizePortfolioState(p.status) === 'pending')
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [portfolios]);

  

  const list = active.length > 0 ? active : pending;
  const shown = list.slice(0, 3);
  const hasMore = list.length > 3;
  return (
    <div id="your-portfolio" className="space-y-3 scroll-mt-4">
      {loading ? (
        <PortfolioSkeleton />
      ) : error ? (
        <PortfolioErrorState onRetry={refetch} />
      ) : list.length === 0 ? (
        <PortfolioEmptyState onExplore={onExploreOpportunities} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <h3 className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              {active.length > 0 ? 'YOUR ACTIVE PORTFOLIOS' : 'YOUR PENDING PORTFOLIOS'}
            </h3>
            <span className="text-[10px] font-bold text-muted-foreground">{list.length}</span>
          </div>

          <div className="space-y-3">
            {shown.map(p => (
              <ActivePortfolioCard key={p.id} portfolio={p} onView={() => onViewPortfolios(p.id)} />
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => onViewPortfolios()}
              className="w-full py-2.5 rounded-xl border border-border/60 text-xs font-bold text-foreground active:scale-[0.98] transition-transform touch-manipulation min-h-[44px]"
            >
              View all {list.length} portfolios →
            </button>
          )}
        </>
      )}
    </div>
  );
}
