import { useCapitalOpportunities, PortfolioRecord } from '@/hooks/useCapitalOpportunities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, PiggyBank, TrendingUp, Briefcase } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  pending: { label: 'Pending', variant: 'secondary' },
  pending_approval: { label: 'Awaiting Approval', variant: 'outline' },
};

function PortfolioRow({ p }: { p: PortfolioRecord }) {
  const roi = (Number(p.investment_amount) * Number(p.roi_percentage)) / 100;
  const cfg = statusConfig[p.status] || { label: p.status, variant: 'outline' as const };

  return (
    <Card className="p-3 flex items-center gap-3 border-border/60">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <PiggyBank className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold truncate">{formatUGX(Number(p.investment_amount))}</span>
          <Badge variant={cfg.variant} className="text-[10px] shrink-0">{cfg.label}</Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-success" />
            {p.roi_percentage}% → {formatUGX(roi)}/mo
          </span>
        </div>
        {Number(p.total_roi_earned) > 0 && (
          <p className="text-[10px] text-success mt-0.5">
            Earned: {formatUGX(Number(p.total_roi_earned))}
          </p>
        )}
      </div>
    </Card>
  );
}

export function MyPortfolioAccounts() {
  const { portfolios, totalInvested, loading } = useCapitalOpportunities();

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (portfolios.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className="w-1 h-5 rounded-full bg-primary" />
        <h2 className="text-sm font-black text-foreground tracking-tight">My Investment Accounts</h2>
        <Badge variant="secondary" className="text-[10px] ml-auto">{portfolios.length}</Badge>
      </div>
      <div className="space-y-2">
        {portfolios.map(p => (
          <PortfolioRow key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}
